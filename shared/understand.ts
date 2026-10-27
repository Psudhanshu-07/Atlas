// Briefing text derived from the analysis graph; shared by the API and the UI.
// Goal: tell a newcomer what a GitHub repo is and how it works, using real paths.

import type { Analysis, FileNode } from "./types";
import { plural } from "./format";

const KNOWN_LIBS: Array<{ match: string | RegExp; label: string }> = [
  { match: /^react$/, label: "React" },
  { match: /^next$/, label: "Next.js" },
  { match: /^express$/, label: "Express" },
  { match: /^koa$/, label: "Koa" },
  { match: /^fastify$/, label: "Fastify" },
  { match: /^@nestjs\//, label: "NestJS" },
  { match: /^vue$/, label: "Vue" },
  { match: /^nuxt$/, label: "Nuxt" },
  { match: /^@angular\/core$/, label: "Angular" },
  { match: /^svelte$/, label: "Svelte" },
  { match: /^django$/, label: "Django" },
  { match: /^flask$/, label: "Flask" },
  { match: /^fastapi$/, label: "FastAPI" },
  { match: /^prisma$/, label: "Prisma" },
  { match: /^mongoose$/, label: "Mongoose" },
  { match: /^sequelize$/, label: "Sequelize" },
  { match: /^typeorm$/, label: "TypeORM" },
  { match: /^vite$/, label: "Vite" },
  { match: /^webpack$/, label: "Webpack" },
  { match: /^d3/, label: "D3" },
  { match: /^tailwindcss$/, label: "Tailwind" },
];

interface RepoUnderstanding {
  tagline: string;
  whatItIs: string;
  howItWorks: string;
  workflow: Array<{ step: string; title: string; desc: string }>;
  beginnerFiles: Array<{ path: string; reason: string }>;
  language: string;
  frameworks: string[];
  markdown: string;
}

function existingPath(analysis: Analysis, path: string | undefined): string | undefined {
  if (!path) return undefined;
  return analysis.nodes.some((n) => n.path === path) ? path : undefined;
}

function pickByPathHint(analysis: Analysis, hints: RegExp[]): FileNode | undefined {
  return analysis.nodes.find((n) => !n.test && hints.some((h) => h.test(n.path)));
}

function packageRoot(dep: string): string {
  if (dep.startsWith("@")) return dep.split("/").slice(0, 2).join("/");
  return dep.split("/")[0];
}

export function detectFrameworks(analysis: Analysis): string[] {
  const pkgs = new Set<string>();
  for (const n of analysis.nodes) {
    for (const dep of n.externalImports) {
      pkgs.add(dep);
      pkgs.add(packageRoot(dep));
    }
  }
  const found: string[] = [];
  for (const lib of KNOWN_LIBS) {
    const hit = [...pkgs].some((p) => (typeof lib.match === "string" ? p === lib.match : lib.match.test(p)));
    if (hit && !found.includes(lib.label)) found.push(lib.label);
  }
  if (analysis.nodes.some((n) => n.path.endsWith(".tsx") || n.path.endsWith(".jsx")) && !found.includes("React")) {
    found.unshift("React");
  }
  return found;
}

/** Documentation and config formats never win "primary language", however many lines they have. */
const NON_CODE_LANGUAGES = new Set(["Markdown", "JSON", "YAML", "Text", "SVG", "XML", "CSV"]);

export function primaryLanguage(analysis: Analysis): string {
  const langs = analysis.languages.filter((l) => l.name !== "Other");
  const code = langs.filter((l) => !NON_CODE_LANGUAGES.has(l.name));
  const pool = code.length > 0 ? code : langs;
  // Most source files wins; line count breaks ties.
  const top = [...pool].sort((a, b) => b.files - a.files || b.lines - a.lines)[0];
  return top?.name ?? "Mixed";
}

function architectureStyle(analysis: Analysis): { style: string; detail: string } {
  const layerIds = new Set(analysis.layers.map((l) => l.id));
  const layered = ["presentation", "business", "data"].filter((l) => layerIds.has(l)).length >= 3;
  const hasApi = layerIds.has("api");
  if (analysis.clusters.some((c) => c.id.startsWith("packages/") || c.id === "packages")) {
    return { style: "monorepo", detail: "multiple packages sharing one repository" };
  }
  if (layered && hasApi) {
    return {
      style: "layered web application",
      detail: "presentation, API, business logic and data access are separated into distinct layers",
    };
  }
  if (layered) {
    return { style: "layered architecture", detail: "UI, business rules and storage live in separate layers" };
  }
  if (analysis.entryPoints.length === 0) {
    return { style: "library / package", detail: "it exposes an API for other projects rather than running as an app" };
  }
  if (analysis.clusters.length <= 2) {
    return { style: "compact application", detail: "most of the code sits in a small number of folders" };
  }
  return { style: "modular application", detail: "code is split into loosely coupled top-level modules" };
}

function layerWorkflow(analysis: Analysis): Array<{ step: string; title: string; desc: string }> {
  const order = ["presentation", "api", "business", "data"];
  const layers = analysis.layers.filter((l) => order.includes(l.id));
  layers.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  if (layers.length >= 2) {
    return layers.map((l, i) => ({
      step: String(i + 1),
      title: l.name,
      desc: l.description || `${plural(l.files, "file")} in this layer`,
    }));
  }
  const clusters = analysis.clusters.filter((c) => c.name !== "(root)").slice(0, 3);
  if (clusters.length >= 2) {
    return clusters.map((c, i) => ({
      step: String(i + 1),
      title: c.name,
      desc: `${c.role} · ${plural(c.files, "file")} · ${plural(c.lines, "line")}`,
    }));
  }
  return [
    { step: "1", title: "Entry", desc: "Start at the detected entry points and follow imports inward." },
    { step: "2", title: "Modules", desc: "Each folder is a unit of work; start with its public exports." },
    { step: "3", title: "Shared contracts", desc: "Trace fan-in hubs last; they are the files everything depends on." },
  ];
}

function beginnerFiles(analysis: Analysis): Array<{ path: string; reason: string }> {
  const out: Array<{ path: string; reason: string }> = [];
  const seen = new Set<string>();
  const add = (path: string | undefined, reason: string) => {
    const ok = existingPath(analysis, path);
    if (!ok || seen.has(ok)) return;
    seen.add(ok);
    out.push({ path: ok, reason });
  };

  for (const ep of analysis.entryPoints.slice(0, 2)) {
    add(ep, "Application entry point. Start here to see how the process boots.");
  }

  const byLayer: Record<string, string> = {
    presentation: "User-facing interface code.",
    api: "HTTP and API surface: where outside requests enter.",
    business: "Core business rules: the behaviour this repository exists to implement.",
    data: "Persistence: how the project stores and retrieves data.",
  };
  for (const [layer, reason] of Object.entries(byLayer)) {
    const node = analysis.nodes
      .filter((n) => n.layer === layer && !n.test)
      .sort((a, b) => b.fanIn - a.fanIn || b.loc - a.loc)[0];
    add(node?.path, reason);
  }

  const hub = [...analysis.nodes]
    .filter((n) => !n.test && !seen.has(n.path))
    .sort((a, b) => b.fanIn - a.fanIn)[0];
  add(hub?.path, "High fan-in hub: many files import it, so changes ripple widely.");

  const readme = pickByPathHint(analysis, [/(^|\/)readme\.md$/i]);
  add(readme?.path, "Project README, written by the authors.");

  if (out.length < 3) {
    for (const n of analysis.nodes.filter((n) => !n.test).slice(0, 4)) {
      add(n.path, `${n.language} file in the ${n.cluster} module.`);
    }
  }
  return out.slice(0, 5);
}

export function buildRepoUnderstanding(analysis: Analysis, readmeExcerpt?: string): RepoUnderstanding {
  const style = architectureStyle(analysis);
  const language = primaryLanguage(analysis);
  const frameworks = detectFrameworks(analysis);
  const stackText = [language, ...frameworks].filter(Boolean).join(" · ");
  const layers = analysis.layers.filter((l) => l.id !== "tests" && l.id !== "ops");
  const layerFlow = layers.map((l) => `${l.name} (${l.files})`).join(" → ");
  const topModules = analysis.clusters.filter((c) => c.name !== "(root)").slice(0, 5);
  const starters = beginnerFiles(analysis);
  const workflow = layerWorkflow(analysis);

  const tagline =
    frameworks.length > 0
      ? `${analysis.repo.name}: ${style.style} in ${stackText}`
      : `${analysis.repo.name}: ${style.style} (${language})`;

  const whatItIs = [
    `**${analysis.repo.name}** is a **${style.style}** (${style.detail}).`,
    `It contains **${plural(analysis.stats.files, "source file")}** and **${plural(analysis.stats.lines, "line")}** across **${plural(analysis.stats.clusters, "module")}**, with **${plural(analysis.stats.internalDeps, "internal dependency", "internal dependencies")}**.`,
    frameworks.length > 0
      ? `Detected stack: **${frameworks.join(", ")}** on **${language}**.`
      : `Primary language: **${language}**.`,
    analysis.entryPoints.length > 0
      ? `The process starts at ${analysis.entryPoints.slice(0, 3).map((e) => `\`${e}\``).join(", ")}.`
      : "No executable entry point was found. Treat this as a library and start from the public exports.",
  ].join(" ");

  const howItWorks = layerFlow
    ? `Work typically moves **${layerFlow}**. A change in an upper layer should call downward; if files skip a layer, that shows up in Architecture Insights.`
    : `Follow imports from the entry files into the modules they depend on. The densest files (highest fan-in) are the shared contracts.`;

  const mdParts: string[] = [];
  mdParts.push(`## What this repository is`, "", whatItIs, "");
  if (readmeExcerpt) {
    mdParts.push("## What the README says", "", readmeExcerpt.trim(), "");
  }
  mdParts.push("## How it works", "", howItWorks, "");
  if (workflow.length > 0) {
    mdParts.push("### Lifecycle", "");
    workflow.forEach((w) => mdParts.push(`${w.step}. **${w.title}**: ${w.desc}`));
    mdParts.push("");
  }
  if (topModules.length > 0) {
    mdParts.push("## Main modules", "");
    for (const c of topModules) {
      mdParts.push(
        `- **${c.name}** (${c.role.toLowerCase()}) · ${plural(c.files, "file")}, ${c.lines.toLocaleString()} LOC, ${c.outbound} outbound / ${c.inbound} inbound links`,
      );
    }
    mdParts.push("");
  }    mdParts.push("## Where to start reading", "", ...starters.map((f, i) => `${i + 1}. \`${f.path}\`: ${f.reason}`), "");
  const crit = analysis.issues.filter((i) => i.severity === "critical").length;
  const warn = analysis.issues.filter((i) => i.severity === "warning").length;
  mdParts.push(
    "## What to watch",
    "",
    analysis.issues.length === 0
      ? "No structural findings were reported."
      : `${analysis.issues.length} findings (${crit} critical, ${warn} warnings). Open **Architecture Insights** for evidence and suggested fixes.`,
  );

  return {
    tagline,
    whatItIs,
    howItWorks,
    workflow,
    beginnerFiles: starters,
    language,
    frameworks,
    markdown: mdParts.join("\n"),
  };
}
