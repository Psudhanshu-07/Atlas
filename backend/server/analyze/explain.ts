// "Explain unfamiliar code": builds a per-file briefing (deterministic, AI-augmented
// when configured), file annotations for the viewer, and the Ask Q&A engine.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Analysis, Annotation, AskAnswer, FileDetail, FileNode, Issue } from "../../../shared/types";
import { aiConfig, chat, type ChatMessage } from "../ai";
import { askSystemPrompt, fileSystemPrompt } from "../prompts";
import { buildRepoUnderstanding, detectFrameworks, primaryLanguage } from "../../../shared/understand";
import { plural } from "../../../shared/format";

const MAX_VIEW_BYTES = 400_000;
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "to", "of", "in", "on", "for",
  "and", "or", "not", "this", "that", "it", "its", "with", "as", "at", "by", "from",
  "do", "does", "did", "how", "what", "why", "where", "when", "who", "which", "can",
  "should", "would", "will", "please", "me", "you", "we", "i", "my", "our", "their",
  "explain", "show", "find", "give", "tell", "about", "code", "file", "files",
  "module", "modules", "repo", "repository", "project", "app", "application", "some",
  "any", "there", "here", "into", "out", "up", "down", "if", "then", "than", "so",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function safeJoin(root: string, rel: string): string | null {
  const abs = path.resolve(root, rel);
  const rootResolved = path.resolve(root);
  if (abs !== rootResolved && !abs.startsWith(rootResolved + path.sep)) return null;
  return abs;
}

function issuesForPath(analysis: Analysis, relPath: string): Issue[] {
  return analysis.issues.filter((i) => i.files.includes(relPath));
}

function buildAnnotations(node: FileNode, content: string, issues: Issue[]): Annotation[] {
  const annotations: Annotation[] = [];
  for (const issue of issues) {
    if (issue.type === "dead-export") continue; // precise lines below
    annotations.push({ line: 1, message: `${issue.severity.toUpperCase()}: ${issue.title}`, kind: issue.type });
  }
  if (node.deadExports.length > 0) {
    for (const exp of node.exports) {
      if (node.deadExports.includes(exp.name)) {
        annotations.push({
          line: exp.line,
          message: `\`${exp.name}\` is exported but never imported anywhere in the repo`,
          kind: "dead-export",
        });
      }
    }
  }
  node.imports.forEach((imp) => {
    if (imp.raw.startsWith(".") && !imp.resolved && !imp.external) {
      annotations.push({ line: imp.line, message: `Import \`${imp.raw}\` could not be resolved to a file`, kind: "note" });
    }
  });
  const todoRe = /\b(TODO|FIXME|HACK|XXX|WORKAROUND)\b/;
  content.split("\n").forEach((line, i) => {
    if (todoRe.test(line)) {
      annotations.push({ line: i + 1, message: line.trim().slice(0, 160), kind: "note" });
    }
  });
  const seen = new Set<string>();
  return annotations
    .filter((a) => {
      const key = `${a.line}:${a.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.line - b.line);
}

function heuristicExplanation(
  analysis: Analysis,
  node: FileNode,
  dependents: string[],
  dependencies: string[],
  issues: Issue[],
  content: string,
): string {
  const cluster = analysis.clusters.find((c) => c.id === node.cluster);
  const layer = analysis.layers.find((l) => l.id === node.layer);
  const lines: string[] = [];

  lines.push(
    `\`${node.path}\` is a **${node.language}** file with **${node.loc} lines** in module **${node.cluster}**` +
      `${cluster ? ` (${cluster.role.toLowerCase()})` : ""}. It belongs to the **${layer?.name ?? node.layer}** layer` +
      `${node.entry ? " and is one of the application's entry points" : ""}${node.test ? " and is a test file" : ""}.`,
  );

  lines.push("");
  lines.push("### Public API & Exports");
  if (node.exports.length === 0) {
    lines.push(
      "- No exported symbols: the file runs for side effects, is an entry script, or keeps its symbols internal.",
    );
  } else {
    const shown = node.exports.slice(0, 12);
    lines.push(
      ...shown.map((e) => `- \`${e.name}\` · ${e.kind} (line ${e.line})${node.deadExports.includes(e.name) ? " · *unused export*" : ""}`),
    );
    if (node.exports.length > shown.length) lines.push(`- …and ${node.exports.length - shown.length} more`);
  }

  lines.push("");
  lines.push("### Collaborations & Dependency Flow");
  lines.push(
    dependencies.length > 0
      ? `- **Depends on ${dependencies.length} module${dependencies.length > 1 ? "s" : ""}:** ${dependencies.slice(0, 6).map((d) => `\`${d}\``).join(", ")}${dependencies.length > 6 ? ", …" : ""}`
      : "- **Depends on no internal modules**; it is a leaf of the dependency graph.",
  );
  if (node.externalImports.length > 0) {
    lines.push(`- **External packages:** ${node.externalImports.slice(0, 8).map((e) => `\`${e}\``).join(", ")}`);
  }
  lines.push(
    dependents.length > 0
      ? `- **Imported by ${dependents.length} file${dependents.length > 1 ? "s" : ""}:** ${dependents.slice(0, 6).map((d) => `\`${d}\``).join(", ")}${dependents.length > 6 ? ", …" : ""}${dependents.length >= 8 ? " · a **hub module**, changes here ripple widely." : ""}`
      : "- **Imported by nothing**: either an entry point, dynamically invoked, or an isolated utility.",
  );

  const comments = content.split("\n").filter((l) => /^\s*(\/\/|#|\/\*|\*|--)/.test(l)).length;
  const density = node.loc > 0 ? Math.round((comments / node.loc) * 100) : 0;

  lines.push("");
  lines.push("### Architectural Assessment");
  const notes: string[] = [];
  if (issues.length > 0) {
    notes.push(...issues.map((i) => `- **${i.severity.toUpperCase()} · ${i.title}**: ${i.fix}`));
  }
  if (node.deadExports.length > 0) {
    notes.push(`- ${node.deadExports.length} exported symbol${node.deadExports.length > 1 ? "s are" : " is"} never used elsewhere: ${node.deadExports.slice(0, 6).map((d) => `\`${d}\``).join(", ")}`);
  }
  if (notes.length === 0) notes.push("- Clean architectural compliance: no boundary violations, circular chains or dead exports detected.");
  notes.push(`- Fan-in: ${node.fanIn} callers | Fan-out: ${node.fanOut} dependencies (${node.fanIn >= 6 ? "High coupling hub" : "Healthy citizen of the module"}).`);
  notes.push(`- Documentation density: ~${density}% comments.`);
  lines.push(...notes);

  return lines.join("\n");
}

export async function buildFileDetail(root: string, analysis: Analysis, relPath: string): Promise<FileDetail | null> {
  const abs = safeJoin(root, relPath);
  if (!abs) return null;
  let content: string;
  try {
    content = await fs.readFile(abs, "utf8");
  } catch {
    return null;
  }
  let truncated = false;
  if (Buffer.byteLength(content, "utf8") > MAX_VIEW_BYTES) {
    content = content.slice(0, MAX_VIEW_BYTES);
    truncated = true;
  }

  const node = analysis.nodes.find((n) => n.path === relPath);
  const dependents = analysis.edges.filter((e) => e.to === relPath).map((e) => e.from);
  const dependencies = (node?.imports ?? []).map((i) => i.resolved).filter(Boolean) as string[];
  const issues = issuesForPath(analysis, relPath);

  const fallbackNode: FileNode = {
    path: relPath,
    dir: relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : ".",
    name: relPath.split("/").pop() ?? relPath,
    language: "Other",
    loc: content.split("\n").length,
    bytes: Buffer.byteLength(content),
    imports: [],
    externalImports: [],
    exports: [],
    cluster: "(root)",
    layer: "app",
    fanIn: dependents.length,
    fanOut: dependencies.length,
    entry: false,
    test: false,
    issueCount: issues.length,
    deadExports: [],
  };
  const info = node ?? fallbackNode;

  const annotations = buildAnnotations(info, content, issues);
  const heuristic = heuristicExplanation(analysis, info, dependents, dependencies, issues, content);

  let explanation = heuristic;
  let explanationMode: "ai" | "heuristic" = "heuristic";

  if (aiConfig().enabled) {
    const structural = [
      `File: ${info.path} (${info.language}, ${info.loc} LOC, layer ${info.layer}, module ${info.cluster})`,
      `Exports: ${info.exports.map((e) => `${e.name}:${e.kind}`).slice(0, 20).join(", ") || "none"}`,
      `Dependencies: ${dependencies.slice(0, 15).join(", ") || "none"}`,
      `Imported by: ${dependents.slice(0, 10).join(", ") || "nothing"}`,
      `Issues: ${issues.map((i) => i.title).join("; ") || "none"}`,
    ].join("\n");

    const ai = await chat(
      fileSystemPrompt(),
      `${structural}\n\n---\nFile Content Excerpt:\n\`\`\`${info.language.toLowerCase()}\n${content.slice(0, 8000)}\n\`\`\``,
      900,
    );
    if (ai) {
      explanation = `${ai}\n\n---\n\n### Static AST Architecture Findings\n\n${heuristic}`;
      explanationMode = "ai";
    }
  }

  return {
    path: relPath,
    content: truncated ? `${content}\n\n/* CodeAtlas: file truncated for display */` : content,
    language: info.language,
    loc: info.loc,
    imports: info.imports,
    exports: info.exports,
    dependents,
    dependencies,
    explanation,
    explanationMode,
    annotations,
    issues,
  };
}

async function readReadmeExcerpt(root: string): Promise<string | undefined> {
  const names = ["README.md", "Readme.md", "readme.md", "README.rst", "README"];
  for (const name of names) {
    const abs = safeJoin(root, name);
    if (!abs) continue;
    try {
      const raw = await fs.readFile(abs, "utf8");
      const clipped = raw.replace(/\r\n/g, "\n").trim().slice(0, 2500);
      return clipped || undefined;
    } catch {
      /* try next name */
    }
  }
  return undefined;
}

async function readFileSnippet(root: string, relPath: string, maxLines = 100): Promise<string | null> {
  const abs = safeJoin(root, relPath);
  if (!abs) return null;
  try {
    const raw = await fs.readFile(abs, "utf8");
    const lines = raw.split("\n").slice(0, maxLines);
    return lines.join("\n").slice(0, 3500);
  } catch {
    return null;
  }
}

/**
 * Builds a comprehensive, deeply grounded response discussing the fundamentals
 * and specific implementation mechanics of the repository.
 */
function buildDeepDeterministicAnswer(
  analysis: Analysis,
  question: string,
  topNodes: Array<{ node: FileNode; score: number }>,
  relevantIssues: Issue[],
  readmeExcerpt?: string,
): { answer: string; sources: string[] } {
  const understanding = buildRepoUnderstanding(analysis, readmeExcerpt);
  const q = question.toLowerCase();
  const lang = primaryLanguage(analysis);
  const frameworks = detectFrameworks(analysis);
  const frameworkText = frameworks.length > 0 ? frameworks.join(", ") : "Vanilla Standard";

  const sources: string[] = [];
  topNodes.slice(0, 5).forEach((t) => {
    if (!sources.includes(t.node.path)) sources.push(t.node.path);
  });
  if (sources.length === 0 && analysis.entryPoints.length > 0) {
    sources.push(...analysis.entryPoints.slice(0, 3));
  }

  const sections: string[] = [];

  // Determine question intent
  const isFundamentalsOrOverview =
    /\b(fundamental|fundamentals|overview|architecture|big picture|how (does|do) (this|it|the)|explain (the )?(repo|system|codebase)|structure|design|pattern)\b/i.test(
      question,
    );
  const isDataOrStorage = /\b(database|db|store|storage|persist|model|models|schema|query|table|cache)\b/i.test(question);
  const isRoutingOrApi = /\b(route|router|api|controller|http|endpoint|request|handler)\b/i.test(question);
  const isServiceOrBusiness = /\b(service|services|business|logic|order|pricing|calc|workflow|rule)\b/i.test(question);
  const isRisksOrCycles = /\b(risk|risks|circular|cycle|dead|unused|issue|issues|problem|debt|bottleneck)\b/i.test(question);
  const isExtendingOrStart = /\b(where (do|should) i (start|read|look|add|implement)|new feature|onboard|beginner|first file)\b/i.test(question);

  // 1. Executive Context & Fundamentals of the Repository
  sections.push(`## Repository Architectural Fundamentals: ${analysis.repo.name}`);
  sections.push(
    `**${analysis.repo.name}** is engineered as a **${analysis.layers.map((l) => l.name).join(" → ")}** architecture comprising **${analysis.stats.files} source files** and **${analysis.stats.lines.toLocaleString()} lines of code** across **${analysis.stats.clusters} functional subsystems**, interconnected by **${analysis.stats.internalDeps} internal dependency edges**.`
  );
  sections.push(
    `- **Core Tech Stack:** Written in **${lang}**, powered by **${frameworkText}**.` +
    (analysis.entryPoints.length > 0 ? ` Execution begins at ${analysis.entryPoints.map((ep) => `\`${ep}\``).join(", ")}.` : "")
  );

  // 2. Specific Query In-depth Analysis
  if (isRisksOrCycles) {
    sections.push("\n### Structural Health & Coupling Analysis");
    if (analysis.cycles.length > 0) {
      sections.push(`**Circular Dependency Loops (${analysis.cycles.length} detected):**`);
      analysis.cycles.slice(0, 4).forEach((c, idx) => {
        sections.push(`${idx + 1}. \`${c.join(" -> ")}\`: the mutual coupling blocks clean tree-shaking and complicates unit testing.`);
      });
    } else {
      sections.push("**Zero Circular Dependencies:** The dependency graph is a verified clean Directed Acyclic Graph (DAG).");
    }

    const deadExportsCount = analysis.nodes.reduce((acc, n) => acc + n.deadExports.length, 0);
    if (deadExportsCount > 0) {
      sections.push(`\n**Dead / Unused Exports (${deadExportsCount} symbols):**`);
      const sampleDead = analysis.nodes
        .filter((n) => n.deadExports.length > 0)
        .slice(0, 5)
        .map((n) => `\`${n.path}\` (${n.deadExports.map((d) => `\`${d}\``).join(", ")})`);
      sections.push(`Symbols exported but never consumed internally include: ${sampleDead.join("; ")}.`);
    }

    if (relevantIssues.length > 0) {
      sections.push("\n**Active Architectural Findings:**");
      relevantIssues.slice(0, 6).forEach((i) => {
        sections.push(`- **[${i.severity.toUpperCase()}] ${i.title}**: ${i.description} *Fix recommendation:* ${i.fix}`);
      });
    }
  } else if (isExtendingOrStart) {
    sections.push("\n### Developer Onboarding & Extension Guide");
    sections.push("To implement changes or onboard quickly into this codebase, follow this verified reading progression:");
    understanding.beginnerFiles.forEach((f, i) => {
      sections.push(`${i + 1}. \`${f.path}\`: **${f.reason}**`);
    });
    sections.push("\n**Extension Blueprint:**");
    sections.push(
      "- If adding user interfaces: Add components into the Presentation tier and wire state through client models.\n" +
      "- If adding endpoints: Declare routes in the API tier and delegate heavy computation to Business services.\n" +
      "- If adding domain rules: Implement isolated pure functions or service classes in the Business logic layer.\n" +
      "- If adding database storage: Use data repositories to isolate query dialects from core logic."
    );
  } else {
    // Specific topic or general query
    sections.push(`\n### Technical Deep Dive on Queried Subsystems`);
    if (topNodes.length > 0 && topNodes[0].score > 0) {
      sections.push(`Based on AST symbol indexing, the following modules directly govern this functionality:`);
      topNodes.slice(0, 4).forEach((t, idx) => {
        const n = t.node;
        const exportsList = n.exports.map((e) => `\`${e.name}\` (${e.kind})`).slice(0, 6).join(", ") || "Internal implementation";
        const callers = analysis.edges.filter((e) => e.to === n.path).map((e) => e.from);
        const deps = (n.imports.map((i) => i.resolved).filter(Boolean) as string[]);

        sections.push(`\n#### ${idx + 1}. \`${n.path}\` (${n.layer.toUpperCase()} Tier, Module \`${n.cluster}\`)`);
        sections.push(`- **Size & Coupling:** ${n.loc} LOC | Called by **${plural(callers.length, "file")}** | Calls **${plural(deps.length, "module")}**.`);
        sections.push(`- **Public Surface / Exports:** ${exportsList}`);
        if (deps.length > 0) {
          sections.push(`- **Downstream Collaborators:** ${deps.slice(0, 4).map((d) => `\`${d.split("/").pop()}\``).join(", ")}`);
        }
        if (callers.length > 0) {
          sections.push(`- **Upstream Callers:** ${callers.slice(0, 4).map((c) => `\`${c.split("/").pop()}\``).join(", ")}`);
        }
      });
    } else {
      sections.push(`Key modules governing application behavior:`);
      analysis.clusters.slice(0, 5).forEach((c) => {
        sections.push(`- **\`${c.name}\` (${c.role}):** ${plural(c.files, "file")}, ${c.lines.toLocaleString()} LOC, ${c.outbound} outbound calls, ${c.inbound} inbound callers.`);
      });
    }

    // 3. Request / Data Flow Lifecycle Trace
    sections.push("\n### Execution Lifecycle & Request Data Flow");
    sections.push(understanding.howItWorks);
    if (understanding.workflow.length > 0) {
      sections.push("\n**Step-by-step pipeline:**");
      understanding.workflow.forEach((w) => {
        sections.push(`- **Step ${w.step} · ${w.title}:** ${w.desc}`);
      });
    }

    // 4. Relevant Issues
    if (relevantIssues.length > 0) {
      sections.push("\n### Relevant Architectural Observations & Safety");
      relevantIssues.slice(0, 4).forEach((i) => {
        sections.push(`- **[${i.severity.toUpperCase()}] ${i.title}**: ${i.description} (*Fix:* ${i.fix})`);
      });
    }
  }

  // 5. Next Steps
  sections.push("\n### Recommended Files to Inspect");
  sources.slice(0, 4).forEach((src, idx) => {
    sections.push(`${idx + 1}. \`${src}\``);
  });

  return {
    answer: sections.join("\n"),
    sources,
  };
}

/** Scores every node against the question and answers structurally or with AI. */
export async function askQuestion(
  analysis: Analysis,
  root: string,
  question: string,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<AskAnswer> {
  const tokens = tokenize(question);
  const wantsIssues = /\b(issue|issues|problem|problems|risk|risks|bug|inconsisten|smell|debt|wrong|bad|broken|tech debt|cycle|circular)\b/i.test(question);

  const scored = analysis.nodes.map((node) => {
    let score = 0;
    const pathLower = node.path.toLowerCase();
    const pathTokens = new Set(tokenize(node.path.replace(/[^\w/]/g, "/")));

    for (const t of tokens) {
      if (pathTokens.has(t)) score += 5;
      if (pathLower.includes(t)) score += 3;
      if (node.exports.some((e) => e.name.toLowerCase().includes(t))) score += 4;
      if (node.cluster.toLowerCase().includes(t)) score += 3;
      if (node.language.toLowerCase() === t) score += 2;
      if (node.layer.toLowerCase().includes(t)) score += 2;
    }
    if (wantsIssues && node.issueCount > 0) score += node.issueCount * 2;
    if (score > 0 && node.fanIn > 0) score += 1;
    return { node, score };
  });

  const ranked = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.node.fanIn - a.node.fanIn)
    .slice(0, 6);

  const top =
    ranked.length > 0
      ? ranked
      : [...analysis.nodes]
          .sort((a, b) => b.fanIn - a.fanIn)
          .slice(0, 4)
          .map((node) => ({ node, score: 0 }));

  const readme = await readReadmeExcerpt(root);
  const relevantIssues = analysis.issues
    .filter((i) => tokens.some((t) => (i.title + i.description).toLowerCase().includes(t)) || wantsIssues)
    .slice(0, wantsIssues ? 8 : 4);

  const deterministic = buildDeepDeterministicAnswer(analysis, question, top, relevantIssues, readme);

  // If AI is configured, generate an AI-powered conversational response
  if (aiConfig().enabled) {
    // Confidence that the ranked modules actually relate to the question: when
    // nothing scored, the fallback fan-in list is generic, so keep it minimal.
    const matched = ranked.length > 0;
    // README is only useful for "what is this repo" style questions.
    const asksAboutRepo =
      /\b(repo|repository|project|this codebase|what (does|is).{0,24}(repo|project|codebase)|overview|architecture|structure|purpose)\b/i.test(question);
    // Code excerpts only help "how/why/where/what does X do" engineering questions.
    const asksHowWhy = /\b(how|why|where|what|when|which|can|does|do|is|are)\b/i.test(question);

    // Keep excerpts short (40 lines) and few (3) — long excerpts make the model
    // narrate everything it saw instead of answering the question.
    const codeExcerpts: string[] = [];
    if (asksHowWhy) {
      for (const t of top.slice(0, 3)) {
        const n = t.node;
        const snippet = await readFileSnippet(root, n.path, 40);
        if (snippet) {
          codeExcerpts.push(`### \`${n.path}\` (module \`${n.cluster}\`, ${n.loc} LOC)\n\`\`\`${n.language.toLowerCase()}\n${snippet}\n\`\`\``);
        }
      }
    }

    const context = top
      .slice(0, matched ? 3 : 2)
      .map((t) => {
        const n = t.node;
        const callers = analysis.edges.filter((e) => e.to === n.path).map((e) => e.from).slice(0, 5);
        const deps = n.imports.map((i) => i.resolved ?? i.raw).slice(0, 6);
        return `- \`${n.path}\` (${n.layer}): ${n.loc} LOC. Exports: ${n.exports.map((e) => e.name).slice(0, 6).join(", ") || "none"}. Imports: ${deps.join(", ") || "none"}. Called by: ${callers.join(", ") || "none"}.`;
      })
      .join("\n");

    // Issues and README ship only when the question points at them.
    const issuesContext = asksAboutRepo || wantsIssues
      ? relevantIssues.map((i) => `- [${i.severity.toUpperCase()}] ${i.title}: ${i.description}`).join("\n")
      : "";
    const readmeContext = asksAboutRepo ? readme ?? "" : "";

    const systemPrompt = askSystemPrompt();

    const userPrompt = `Repository: ${analysis.repo.name} (${primaryLanguage(analysis)}; ${analysis.stats.files} files, ${analysis.stats.clusters} modules)
${asksAboutRepo ? `Layers: ${analysis.layers.map((l) => `${l.name} (${l.files})`).join(" → ")}` : ""}

Question: ${question}

Files that matched the question:
${context || "none matched — the static index found nothing question-related"}

${codeExcerpts.length > 0 ? `Code excerpts:
${codeExcerpts.join("\n\n")}
` : ""}${issuesContext ? `Findings for these files:
${issuesContext}
` : ""}${readmeContext ? `README:
${readmeContext}` : ""}`.trim();

    const chatMessages: ChatMessage[] = [];
    if (history && history.length > 0) {
      // Keep only the human-facing turns, trimmed, so a long session cannot
      // pull the answer away from what the latest question asks.
      for (const h of history.slice(-4)) {
        chatMessages.push({ role: h.role, content: h.content.slice(0, 600) });
      }
    }
    chatMessages.push({ role: "user", content: userPrompt });

    // Output budget scales with the breadth of the question so a narrow
    // question cannot elicit an essay.
    const maxTokens = asksAboutRepo || wantsIssues ? 700 : 320;

    const aiResponse = await chat(systemPrompt, chatMessages, maxTokens);
    if (aiResponse) {
      let answer = aiResponse.trim();
      if (answer.length > 1500) {
        // A hard safety net: the first paragraph or two is the actual answer;
        // everything after a third paragraph is cut.
        const paras = answer.split(/\n\s*\n/);
        answer = paras.slice(0, 3).join("\n\n").trim();
      }
      return {
        answer,
        sources: deterministic.sources,
        mode: "ai",
      };
    }
  }

  return {
    answer: deterministic.answer,
    sources: deterministic.sources,
    mode: "heuristic",
  };
}
