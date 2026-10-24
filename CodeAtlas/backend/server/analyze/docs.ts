// Generates the technical documentation set: a top-level ARCHITECTURE.md,
// per-module pages, a quality report, plus the narrative shown on the overview.

import type { Analysis, Doc, Issue, Severity } from "../../../shared/types";
import { plural } from "../../../shared/format";
import type { PipelineResult } from "./pipeline";

export interface DocsContext {
  pipeline: PipelineResult;
  issues: Issue[];
  repoName: string;
  stats: Analysis["stats"];
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "_none_\n";
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}\n`;
}

function mdEscape(s: string): string {
  return s.replace(/\|/g, "\\|");
}

/** Cluster → cluster dependency flows (deduplicated edge counts). */
function clusterFlows(p: PipelineResult): Array<{ from: string; to: string; count: number }> {
  const map = new Map<string, number>();
  const clusterOf = (path: string) => p.nodeByPath.get(path)?.cluster ?? "?";
  for (const e of p.edges) {
    const from = clusterOf(e.from);
    const to = clusterOf(e.to);
    if (from === to) continue;
    const key = `${from}\u0000${to}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split("\u0000");
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count);
}

function severityCounts(issues: Issue[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity]++;
  return counts;
}

/** Detects the dominant architecture style from structure, not guesswork. */
function detectStyle(p: PipelineResult): { style: string; detail: string } {
  const layerSet = new Set(p.nodes.map((n) => n.layer));
  const clusterLayers = new Map<string, Set<string>>();
  for (const n of p.nodes) {
    const set = clusterLayers.get(n.cluster) ?? new Set<string>();
    set.add(n.layer);
    clusterLayers.set(n.cluster, set);
  }
  const featureLike =
    clusterLayers.size >= 3 &&
    [...clusterLayers.values()].filter((s) => s.size >= 3).length / clusterLayers.size >= 0.6;
  const isMonorepo =
    p.meta.packages.size >= 3 || p.clusters.some((c) => c.id.startsWith("packages/") || c.id === "packages");
  const layered = ["presentation", "business", "data"].filter((l) => layerSet.has(l)).length >= 3;
  const isLibrary = p.entryPoints.length === 0 || p.nodes.every((n) => !n.entry);

  if (isMonorepo) {
    return {
      style: "monorepo",
      detail: `multiple packages (${p.meta.packages.size} package manifests found), each with its own dependency surface`,
    };
  }
  if (featureLike && layered) {
    return {
      style: "feature-folder architecture",
      detail:
        "modules are organised by feature and each one spans UI, logic and data, so the dependency direction lives inside each folder rather than in a global layer cake",
    };
  }
  if (layered) {
    return {
      style: "layered architecture",
      detail: "code separates presentation, business logic and data access into distinct layers",
    };
  }
  if (isLibrary) {
    return { style: "library / package", detail: "the repository exposes an API rather than an executable entry point" };
  }
  if (p.clusters.length <= 2) {
    return { style: "compact application", detail: "most code lives in a single flat module tree" };
  }
  return { style: "modular application", detail: "code is split into loosely coupled top-level modules" };
}

export function generateNarrative(ctx: DocsContext): string {
  const { pipeline: p, issues, repoName, stats } = ctx;
  const style = detectStyle(p);
  const counts = severityCounts(issues);
  const langs = p.languages.filter((l) => l.name !== "Other").slice(0, 3);
  const langText = langs.map((l) => `${l.name} (${pct(l.lines, stats.lines)})`).join(", ");
  const layerText = p.layers
    .filter((l) => l.id !== "tests" && l.id !== "ops")
    .map((l) => `${l.name} (${l.files})`)
    .join(" → ");
  const topClusters = p.clusters.filter((c) => c.name !== "(root)").slice(0, 4);
  const flows = clusterFlows(p).slice(0, 3);
  const godFiles = issues.filter((i) => i.type === "god-file");
  const hubs = issues.filter((i) => i.type === "hub-module");
  const cycles = issues.filter((i) => i.type === "circular-deps");
  const hasTests = p.nodes.some((n) => n.test);

  const paragraphs: string[] = [];

  paragraphs.push(
    `**${repoName}** is a ${style.style} written primarily in ${langText}, spanning **${plural(stats.files, "file")}** and **${stats.lines.toLocaleString()} lines of code** across **${plural(stats.clusters, "module")}**. The structure suggests ${style.detail}. ${
      p.entryPoints.length > 0
        ? `Execution starts at ${p.entryPoints.slice(0, 3).map((e) => `\`${e}\``).join(", ")}${p.entryPoints.length > 3 ? ` and ${p.entryPoints.length - 3} more entry point${p.entryPoints.length - 4 ? "s" : ""}` : ""}.`
        : "No conventional entry point was detected. Treat it as a library and read the exported surface first."
    }`,
  );

  if (layerText) {
    paragraphs.push(
      `**How a request flows through it:** ${layerText}. Each layer depends only on the one below it${counts.critical > 0 ? ", in theory: the inconsistency report shows where that rule is broken" : ""}.`,
    );
  }

  if (topClusters.length > 0) {
    const clusterDesc = topClusters
      .map(
        (c) =>
          `**${c.name}** (${c.role.toLowerCase()}, ${plural(c.files, "file")}, ${pct(c.lines, stats.lines)} of the code)`,
      )
      .join("; ");
    const flowText =
      flows.length > 0
        ? `The main dependencies between modules run ${flows
            .map((f) => `\`${f.from}\` → \`${f.to}\` (${f.count} links)`)
            .join(", ")}.`
        : "Modules barely talk to each other, which is either excellent isolation or a sign that wiring happens elsewhere.";
    paragraphs.push(`**Module map:** ${clusterDesc}. ${flowText}`);
  }

  const riskParts: string[] = [];
  if (cycles.length > 0) riskParts.push(`${cycles.length} circular dependency group${cycles.length > 1 ? "s" : ""}`);
  if (godFiles.length > 0) riskParts.push(`${godFiles.length} oversized file${godFiles.length > 1 ? "s" : ""}`);
  if (hubs.length > 0) riskParts.push(`${hubs.length} hub module${hubs.length > 1 ? "s" : ""} that many files depend on`);
  const otherCount = issues.length - cycles.length - godFiles.length - hubs.length;
  if (otherCount > 0) riskParts.push(`${otherCount} other finding${otherCount > 1 ? "s" : ""}`);
  paragraphs.push(
    `**Health snapshot:** ${counts.critical} critical, ${counts.warning} warning and ${counts.info} info finding${issues.length === 1 ? "" : "s"}${
      riskParts.length > 0 ? `: ${riskParts.join(", ")}` : ". Nothing serious was detected."
    }. ${hasTests ? "Automated tests exist in the repo." : "No automated tests were found."}`,
  );

  const startAt = [
    ...p.entryPoints.slice(0, 2),
    ...p.nodes
      .filter((n) => n.fanIn >= 4 && !n.test)
      .sort((a, b) => b.fanIn - a.fanIn)
      .slice(0, 2)
      .map((n) => n.path),
  ];
  paragraphs.push(
    startAt.length > 0
      ? `**Suggested reading order for a newcomer:** ${startAt
          .map((f, i) => `${i + 1}. \`${f}\``)
          .join(" ")}: entry points first, then the modules everything else leans on.`
      : "**Suggested reading order:** start from the largest module and work outward; no clear entry point was detected.",
  );

  return paragraphs.join("\n\n");
}

function architectureDoc(ctx: DocsContext, narrative: string): Doc {
  const { pipeline: p, issues, repoName, stats } = ctx;
  const counts = severityCounts(issues);
  const flows = clusterFlows(p).slice(0, 15);
  const date = new Date().toISOString().slice(0, 10);

  const layerRows = p.layers.map((l) => [
    l.name,
    String(l.files),
    pct(l.files, stats.files),
    l.description,
  ]);

  const clusterRows = p.clusters.slice(0, 30).map((c) => [
    `\`${c.name}\``,
    c.role,
    String(c.files),
    c.lines.toLocaleString(),
    c.languages.slice(0, 2).join(", ") || "—",
    String(c.outbound),
    String(c.inbound),
    String(c.issues),
  ]);

  const hotspots = [...p.nodes]
    .filter((n) => !n.test)
    .sort((a, b) => b.fanIn - a.fanIn)
    .slice(0, 8);

  const startAt = [
    ...p.entryPoints.slice(0, 4),
    ...hotspots.slice(0, 4).map((n) => n.path),
  ];

  const md = [
    `# ${repoName}: architecture`,
    "",
    `> Generated by CodeAtlas on ${date} · ${plural(stats.files, "file")} · ${stats.lines.toLocaleString()} LOC · ${plural(stats.clusters, "module")} · ${plural(stats.internalDeps, "internal dependency", "internal dependencies")}`,
    "",
    "## Big picture",
    "",
    narrative,
    "",
    "## Layers",
    "",
    table(["Layer", "Files", "Share", "What lives there"], layerRows),
    "",
    "## Modules",
    "",
    table(
      ["Module", "Role", "Files", "LOC", "Languages", "→ out", "← in", "Issues"],
      clusterRows,
    ),
    "",
    "## Entry points",
    "",
    p.entryPoints.length > 0
      ? p.entryPoints.map((e) => {
          const n = p.nodeByPath.get(e);
          return `- \`${e}\`${n ? ` · ${n.language}, ${n.loc} LOC` : ""}`;
        }).join("\n")
      : "_No conventional entry point detected._",
    "",
    "## Cross-module dependency flows",
    "",
    flows.length > 0
      ? table(["From", "To", "Edges"], flows.map((f) => [`\`${f.from}\``, `\`${f.to}\``, String(f.count)]))
      : "_All dependencies are intra-module._",
    "",
    "## Stability hotspots (most depended upon)",
    "",
    table(
      ["File", "Module", "Dependents", "Depends on", "Exports"],
      hotspots.map((n) => [`\`${n.path}\``, n.cluster, String(n.fanIn), String(n.fanOut), String(n.exports.length)]),
    ),
    "",
    "## Health snapshot",
    "",
    `- **${counts.critical} critical** · **${counts.warning} warning** · **${counts.info} info** findings (see \`QUALITY.md\`)`,
    `- ${stats.tests} test file${stats.tests === 1 ? "" : "s"}`,
    `- ${stats.externalDeps} external package${stats.externalDeps === 1 ? "" : "s"} in use`,
    "",
    "## Where to start reading",
    "",
    startAt.length > 0
      ? startAt.map((f, i) => `${i + 1}. \`${f}\``).join("\n")
      : "_Start with the largest module._",
    "",
    "---",
    "_Generated by CodeAtlas. Regenerate after structural changes._",
    "",
  ].join("\n");

  return { path: "ARCHITECTURE.md", title: "Architecture overview", kind: "architecture", markdown: md };
}

function moduleDoc(ctx: DocsContext, clusterId: string): Doc {
  const { pipeline: p, issues } = ctx;
  const nodes = p.nodes.filter((n) => n.cluster === clusterId);
  const lines = nodes.reduce((s, n) => s + n.loc, 0);
  const layers = new Map<string, number>();
  for (const n of nodes) layers.set(n.layer, (layers.get(n.layer) ?? 0) + 1);
  const langs = [...new Set(nodes.map((n) => n.language))];

  const keyFiles = [...nodes]
    .sort((a, b) => b.fanIn * 100 + b.loc - (a.fanIn * 100 + a.loc))
    .slice(0, 12);

  const outgoing = p.edges.filter((e) => {
    const from = p.nodeByPath.get(e.from);
    return from?.cluster === clusterId && p.nodeByPath.get(e.to)?.cluster !== clusterId;
  });
  const incoming = p.edges.filter((e) => {
    const to = p.nodeByPath.get(e.to);
    return to?.cluster === clusterId && p.nodeByPath.get(e.from)?.cluster !== clusterId;
  });

  const groupBy = (edges: typeof outgoing, pick: (e: (typeof outgoing)[0]) => string) => {
    const map = new Map<string, number>();
    for (const e of edges) {
      const key = p.nodeByPath.get(pick(e))?.cluster ?? "?";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  };

  const externals = new Map<string, number>();
  for (const n of nodes) {
    for (const ext of n.externalImports) externals.set(ext, (externals.get(ext) ?? 0) + 1);
  }

  const moduleIssues = issues.filter((i) => i.files.some((f) => p.nodeByPath.get(f)?.cluster === clusterId));
  const role = nodes[0]?.cluster ?? clusterId;
  void role;

  const md = [
    `# Module: ${clusterId}`,
    "",
    `> ${plural(nodes.length, "file")} · ${lines.toLocaleString()} LOC · primary languages: ${langs.filter((l) => l !== "Other").slice(0, 4).join(", ")}`,
    "",
    "## Purpose",
    "",
    `This module groups **${plural(nodes.length, "file")}** (${lines.toLocaleString()} lines). ` +
      `It mixes ${[...layers.entries()].sort((a, b) => b[1] - a[1]).map(([l, c]) => `${plural(c, `${l} file`)}`).join(", ")}. ` +
      `Its highest fan-in files are ${keyFiles.slice(0, 3).map((k) => `\`${k.name}\``).join(", ")}; start there.`,
    "",
    "## Key files",
    "",
    table(
      ["File", "LOC", "Exports", "Imported by", "Imports", "Layer"],
      keyFiles.map((n) => [
        `\`${n.path}\``,
        String(n.loc),
        String(n.exports.length),
        String(n.fanIn),
        String(n.fanOut),
        n.layer,
      ]),
    ),
    "",
    "## Talks to",
    "",
    outgoing.length > 0
      ? `**Depends on other modules:** ${groupBy(outgoing, (e) => e.to).map(([c, n]) => `\`${c}\` (${n})`).join(", ")}`
      : "**Depends on other modules:** nothing; this module is self-contained.",
    "",
    incoming.length > 0
      ? `**Used by:** ${groupBy(incoming, (e) => e.from).map(([c, n]) => `\`${c}\` (${n})`).join(", ")}`
      : "**Used by:** no other module imports it.",
    "",
    externals.size > 0
      ? `**External packages:** ${[...externals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([d, c]) => `\`${d}\` (${c})`).join(", ")}`
      : "**External packages:** none.",
    "",
    "## Issues in this module",
    "",
    moduleIssues.length > 0
      ? moduleIssues
          .slice(0, 10)
          .map((i) => `- **[${i.severity}] ${i.title}**: ${i.description}`)
          .join("\n")
      : "_No architectural findings in this module._",
    "",
  ].join("\n");

  const slug = clusterId.replace(/[^\w.-]+/g, "_") || "root";
  return { path: `modules/${slug}.md`, title: clusterId, kind: "module", markdown: md };
}

function qualityDoc(ctx: DocsContext): Doc {
  const { issues, stats, repoName } = ctx;
  const counts = severityCounts(issues);
  const byType = new Map<string, Issue[]>();
  for (const i of issues) {
    const list = byType.get(i.type) ?? [];
    list.push(i);
    byType.set(i.type, list);
  }

  const sections = (["critical", "warning", "info"] as Severity[])
    .map((sev) => {
      const list = issues.filter((i) => i.severity === sev);
      if (list.length === 0) return "";
      return [
        `## ${sev.toUpperCase()} (${list.length})`,
        "",
        ...list.flatMap((i) => [
          `### ${i.title}`,
          "",
          i.description,
          "",
          "**Evidence:**",
          "",
          ...i.evidence.slice(0, 10).map((e) => `- ${e}`),
          "",
          `**Suggested fix:** ${i.fix}`,
          "",
        ]),
      ].join("\n");
    })
    .filter(Boolean)
    .join("\n");

  const md = [
    `# ${repoName}: quality report`,
    "",
    `> ${counts.critical} critical · ${counts.warning} warning · ${counts.info} info · analyzed ${plural(stats.files, "file")}`,
    "",
    `**Findings by rule:**`,
    "",
    table(
      ["Rule", "Findings"],
      [...byType.entries()].map(([type, list]) => [type, String(list.length)]),
    ),
    "",
    sections || "_No findings._",
    "",
  ].join("\n");

  return { path: "QUALITY.md", title: "Quality report", kind: "report", markdown: md };
}

export function generateDocs(ctx: DocsContext): { narrative: string; docs: Doc[] } {
  const narrative = generateNarrative(ctx);
  const docs: Doc[] = [architectureDoc(ctx, narrative)];
  const withIssues = new Set(ctx.issues.flatMap((i) => i.files.map((f) => ctx.pipeline.nodeByPath.get(f)?.cluster ?? "")).filter(Boolean));
  const moduleClusters = [...ctx.pipeline.clusters]
    .sort((a, b) => {
      const ia = withIssues.has(a.id) ? 1 : 0;
      const ib = withIssues.has(b.id) ? 1 : 0;
      return ib - ia || b.lines - a.lines;
    })
    .slice(0, 14);
  for (const c of moduleClusters) {
    docs.push(moduleDoc(ctx, c.id));
  }
  docs.push(qualityDoc(ctx));
  return { narrative, docs };
}
