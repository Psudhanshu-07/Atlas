// Architectural inconsistency detection: twelve deterministic rules that map
// static analysis signals onto issues developers actually care about.

import * as fs from "node:fs/promises";
import type { FileNode, Issue, IssueType, Severity } from "../../../shared/types";
import { plural } from "../../../shared/format";
import type { PipelineResult } from "./pipeline";
import { CODE_LANGUAGES } from "./lang";

const NODE_BUILTINS = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console", "crypto",
  "dgram", "dns", "domain", "events", "fs", "http", "http2", "https", "inspector",
  "module", "net", "os", "path", "perf_hooks", "process", "querystring", "readline",
  "repl", "stream", "string_decoder", "timers", "tls", "tty", "url", "util", "v8",
  "vm", "wasi", "worker_threads", "zlib",
]);

const JS_DEV_TOOLS = new Set([
  "vite", "typescript", "tsx", "concurrently", "eslint", "prettier", "webpack",
  "rollup", "esbuild", "jest", "vitest", "mocha", "husky", "lint-staged", "nodemon",
  "@vitejs/plugin-react", "tailwindcss", "postcss", "autoprefixer", "storybook",
  "@storybook/react", "next", "react-refresh",
]);

const PY_STDLIB = new Set([
  "abc", "argparse", "array", "asyncio", "base64", "collections", "contextlib",
  "copy", "csv", "dataclasses", "datetime", "decimal", "enum", "functools", "glob",
  "gzip", "hashlib", "hmac", "http", "importlib", "io", "itertools", "json", "logging",
  "math", "operator", "os", "pathlib", "pickle", "platform", "queue", "random", "re",
  "secrets", "shutil", "signal", "socket", "sqlite3", "string", "subprocess", "sys",
  "tempfile", "textwrap", "threading", "time", "traceback", "types", "typing",
  "unittest", "urllib", "uuid", "warnings", "weakref", "xml", "zipfile", "zlib",
  "fnmatch", "struct", "statistics", "gc", "getpass", "inspect", "email", "html",
  "multiprocessing", "socketserver", "csv", "configparser", "difflib", "pprint",
]);

const RUST_KNOWN = new Set(["std", "core", "alloc", "crate", "self", "super"]);

const LAYER_RANK: Record<string, number> = {
  shared: 0,
  data: 1,
  business: 2,
  app: 2,
  interface: 3,
  presentation: 3,
  tests: 99,
  ops: 99,
};

const CONFIG_NAME =
  /^(index|main|app|server|cli|setup|conftest|vite|jest|eslint|tsconfig|tailwind|postcss|webpack|rollup|next|nuxt|babel|prettier|stylelint|router|routes|schema|types|env|globals?|init|mod|manage|wsgi|asgi|settings)\b/i;

function slug(type: IssueType, key: string): string {
  return `${type}:${key}`.replace(/[^a-z0-9:._-]/gi, "-").toLowerCase();
}

function severityFor(count: number, warnAt: number, criticalAt: number): Severity {
  if (count >= criticalAt) return "critical";
  if (count >= warnAt) return "warning";
  return "info";
}

/* ------------------------------------------------------------------ 1. cycles */
function cyclicIssues(p: PipelineResult, issues: Issue[]): void {
  p.cycles.forEach((comp, i) => {
    const crossesClusters = new Set(
      comp.map((path) => p.nodeByPath.get(path)?.cluster ?? "?"),
    ).size > 1;
    const severity: Severity = comp.length >= 3 || crossesClusters ? "critical" : "warning";
    const shown = comp.slice(0, 6);
    issues.push({
      id: slug("circular-deps", `cycle-${i}`),
      type: "circular-deps",
      title:
        comp.length === 1
          ? `Self-import: ${comp[0]}`
          : `Circular dependency between ${plural(comp.length, "module")}`,
      severity,
      description:
        comp.length === 1
          ? "This module imports itself, which usually means a broken refactoring leftover."
          : "These modules depend on each other, so none of them can be understood, tested or changed in isolation. Changes anywhere in the loop risk breaking every other member.",
      evidence: [`${[...shown, comp.length > 6 ? "…" : shown[0]].join(" → ")}`],
      files: comp.slice(0, 40),
      fix: "Break the cycle by extracting the shared pieces into a new module both sides can import, or invert one edge behind an interface / event.",
    });
  });
}

/* ------------------------------------------------------- 2. layer violations */
function layerIssues(p: PipelineResult, issues: Issue[]): void {
  const byPath = p.nodeByPath;
  const violations: { from: FileNode; to: FileNode; kind: "upward" | "skip" }[] = [];
  for (const e of p.edges) {
    const from = byPath.get(e.from);
    const to = byPath.get(e.to);
    if (!from || !to) continue;
    if (from.layer === "app" || from.layer === "tests" || from.layer === "ops") continue;
    if (to.layer === "tests" || to.layer === "ops" || to.layer === "shared") continue;
    const rf = LAYER_RANK[from.layer] ?? 2;
    const rt = LAYER_RANK[to.layer] ?? 2;
    if (rt > rf) violations.push({ from, to, kind: "upward" });
    else if (rf - rt > 1) violations.push({ from, to, kind: "skip" });
  }
  if (violations.length === 0) return;
  const upward = violations.filter((v) => v.kind === "upward");
  const label = (n: FileNode) => `${n.path} (${n.layer})`;
  const evidence = violations
    .slice(0, 8)
    .map(
      (v) =>
        `${label(v.from)} → ${label(v.to)}${
          v.kind === "skip" ? ": skips intermediate layers" : ": points upward"
        }`,
    );
  if (violations.length > 8) evidence.push(`…and ${violations.length - 8} more`);
  const files = [...new Set(violations.flatMap((v) => [v.from.path, v.to.path]))].slice(0, 40);
  issues.push({
    id: slug("layer-violation", "repo"),
    type: "layer-violation",
    title: `${violations.length} dependencies violate the layering`,
    severity: upward.length > 0 ? "warning" : "info",
    description:
      upward.length > 0
        ? "Lower layers reach back into higher layers (for example data code importing UI code). This inverts the dependency direction and makes layers impossible to swap or test independently."
        : "Several dependencies skip an intermediate layer (presentation importing persistence, for example), which couples layers that should only know their neighbours.",
    evidence,
    files,
    fix: "Route the call through the intermediate layer (controller → service → repository), or move the shared piece down into a layer both sides already depend on.",
  });
}

/* ----------------------------------------------------------- 3. dead exports */
function deadExportIssues(p: PipelineResult, issues: Issue[]): void {
  const rows: { node: FileNode; dead: string[] }[] = [];
  for (const node of p.nodes) {
    if (node.test || node.entry || node.fanIn === 0 || node.exports.length === 0) continue;
    const used = p.usedNames.get(node.path);
    if (used?.all) continue;
    const names = used?.names ?? new Set<string>();
    const seen = new Set<string>();
    const dead: string[] = [];
    for (const exp of node.exports) {
      if (exp.kind === "re-export") continue;
      if (seen.has(exp.name)) continue;
      seen.add(exp.name);
      if (!names.has(exp.name)) dead.push(exp.name);
    }
    if (dead.length > 0) rows.push({ node, dead });
  }
  if (rows.length === 0) return;
  const total = rows.reduce((s, r) => s + r.dead.length, 0);
  const sorted = rows.sort((a, b) => b.dead.length - a.dead.length).slice(0, 12);
  issues.push({
    id: slug("dead-export", "repo"),
    type: "dead-export",
    title: `${total} exported symbols are never imported anywhere`,
    severity: severityFor(total, 3, 10),
    description:
      "No file in the repository imports these symbols. They are public surface that nothing exercises, so they either rot or hide code that should have been deleted.",
    evidence: sorted.map((r) => `${r.node.path} · unused: ${r.dead.slice(0, 5).join(", ")}${r.dead.length > 5 ? `, +${r.dead.length - 5}` : ""}`),
    files: sorted.map((r) => r.node.path),
    fix: "Delete the unused exports, or make them non-exported if they are only used inside their own file.",
  });
}

/* --------------------------------------------------------- 4. orphan modules */
function orphanIssues(p: PipelineResult, issues: Issue[]): void {
  const orphans = p.nodes.filter(
    (n) =>
      !n.entry &&
      !n.test &&
      n.loc >= 5 &&
      n.fanIn === 0 &&
      !CONFIG_NAME.test(n.name) &&
      CODE_LANGUAGES.has(n.language),
  );
  if (orphans.length === 0) return;
  const big = orphans.filter((n) => n.loc >= 300);
  const shown = [...orphans].sort((a, b) => b.loc - a.loc).slice(0, 15);
  issues.push({
    id: slug("orphan-module", "repo"),
    type: "orphan-module",
    title: `${plural(orphans.length, "module")} never imported (dead code candidates)`,
    severity: big.length > 0 ? "warning" : "info",
    description:
      "Nothing in the repository references these files. Either dead code left behind by a refactor, or an entry point this tool cannot see; confirm before deleting.",
    evidence: shown.map((n) => `${n.path} · ${n.loc} LOC, fan-out ${n.fanOut}`),
    files: shown.map((n) => n.path),
    fix: "Verify whether each file is reachable (script, dynamic import, external consumer). Delete the ones that are not, or wire them into the app.",
  });
}

/* -------------------------------------------------------------- 5. god files */
function godFileIssues(p: PipelineResult, issues: Issue[]): void {
  // Long test files and generated/docs files are normal; the "god file" smell
  // only applies to production source modules.
  const gods = p.nodes
    .filter((n) => n.loc >= 400 && !n.test && CODE_LANGUAGES.has(n.language))
    .sort((a, b) => b.loc - a.loc);
  if (gods.length === 0) return;
  for (const g of gods.slice(0, 8)) {
    issues.push({
      id: slug("god-file", g.path),
      type: "god-file",
      title: `God file: ${g.path} (${g.loc} lines)`,
      severity: g.loc >= 800 ? "critical" : "warning",
      description:
        "This file carries an unreasonable share of the codebase. Large files slow reviews, hide merge conflicts, and almost always mix several responsibilities.",
      evidence: [
        `${plural(g.loc, "non-blank line")}`,
        `${plural(g.exports.length, "exported symbol")}`,
        `imports ${plural(g.fanOut, "module")} · imported by ${g.fanIn}`,
      ],
      files: [g.path],
      fix: "Split by responsibility: keep one cohesive core in this file and move the rest into sibling modules that it imports.",
    });
  }
  if (gods.length > 8) {
    issues.push({
      id: slug("god-file", "rest"),
      type: "god-file",
      title: `${gods.length - 8} more files exceed 400 lines`,
      severity: "info",
      description: "Beyond the largest offenders, these files also exceed the recommended size budget.",
      evidence: gods.slice(8, 18).map((g) => `${g.path} · ${g.loc} LOC`),
      files: gods.slice(8, 18).map((g) => g.path),
      fix: "Prefer several focused modules over one growing file.",
    });
  }
}

/* ------------------------------------------------------------ 6. hub modules */
function hubIssues(p: PipelineResult, issues: Issue[]): void {
  const hubs = p.nodes
    .filter((n) => n.fanIn >= 8 && !n.test)
    .sort((a, b) => b.fanIn - a.fanIn);
  if (hubs.length === 0) return;
  for (const h of hubs.slice(0, 6)) {
    issues.push({
      id: slug("hub-module", h.path),
      type: "hub-module",
      title: `Hub module: ${h.path} imported by ${plural(h.fanIn, "module")}`,
      severity: h.fanIn >= 15 ? "critical" : "warning",
      description:
        "A huge number of modules depend on this file, so any change here ripples across the codebase and breaks tests far away from the edit.",
      evidence: [
        `${h.fanIn} incoming dependencies`,
        `${h.fanOut} outgoing dependencies`,
        `${h.exports.length} exported symbols`,
      ],
      files: [h.path],
      fix: "Stabilise the surface: keep this module small and immutable where possible, and push volatile helpers into leaf modules.",
    });
  }
  if (hubs.length > 6) {
    issues.push({
      id: slug("hub-module", "rest"),
      type: "hub-module",
      title: `${hubs.length - 6} more modules have 8+ dependents`,
      severity: "info",
      description: "Additional high fan-in modules worth watching when refactoring.",
      evidence: hubs.slice(6, 16).map((h) => `${h.path} · ${h.fanIn} dependents`),
      files: hubs.slice(6, 16).map((h) => h.path),
      fix: "Prefer depending on narrow interfaces from these modules.",
    });
  }
}

/* ----------------------------------------------------- 7. undeclared imports */
function undeclaredIssues(p: PipelineResult, issues: Issue[]): void {
  const byDep = new Map<string, Set<string>>();
  for (const node of p.nodes) {
    for (const imp of node.imports) {
      if (!imp.external) continue;
      const dep = imp.external;
      let skip = false;
      switch (node.language) {
        case "TypeScript":
        case "JavaScript":
        case "Vue":
        case "Svelte":
          skip = NODE_BUILTINS.has(dep) || dep.startsWith("node:") || p.meta.declaredDeps.has(dep);
          break;
        case "Python":
          skip = PY_STDLIB.has(dep.toLowerCase().replace(/[-_]/g, "_")) || p.meta.declaredPython.has(dep.toLowerCase().replace(/[-_]/g, "-"));
          break;
        case "Go":
          skip = !dep.includes(".") || p.meta.declaredGo.has(dep);
          break;
        case "Rust":
          skip = RUST_KNOWN.has(dep) || p.meta.declaredRust.has(dep.toLowerCase());
          break;
        case "Java":
        case "Kotlin":
        case "Scala":
        case "C#":
          skip = /^(java|javax|kotlin|scala|system|Microsoft|org\.w3c|org\.xml)/.test(dep);
          break;
        default:
          skip = true;
      }
      if (skip) continue;
      const set = byDep.get(dep) ?? new Set<string>();
      set.add(node.path);
      byDep.set(dep, set);
    }
  }
  const rows = [...byDep.entries()].sort((a, b) => b[1].size - a[1].size);
  if (rows.length === 0) return;
  const files = [...new Set(rows.flatMap(([, set]) => [...set]))].slice(0, 30);
  issues.push({
    id: slug("undeclared-dep", "repo"),
    type: "undeclared-dep",
    title: `${rows.length} imported ${rows.length === 1 ? "package is" : "packages are"} not declared`,
    severity: rows.length >= 3 ? "warning" : "info",
    description:
      "Code imports packages that do not appear in the project's dependency manifest. This works only by accident (hoisted/transitive installs) and breaks on a clean install.",
    evidence: rows.slice(0, 12).map(([dep, set]) => `${dep} · imported by ${set.size} file${set.size > 1 ? "s" : ""}`),
    files,
    fix: "Add the packages to the dependency manifest (package.json / requirements.txt / go.mod / Cargo.toml) or remove the import.",
  });
}

/* -------------------------------------------------------- 8. unused manifest */
function unusedDepIssues(p: PipelineResult, issues: Issue[]): void {
  if (p.meta.declaredDeps.size === 0) return;
  const used = new Set<string>();
  for (const node of p.nodes) {
    for (const imp of node.imports) if (imp.external) used.add(imp.external);
  }
  const unused = [...p.meta.declaredDeps].filter(
    (d) => !used.has(d) && !d.startsWith("@types/") && !JS_DEV_TOOLS.has(d),
  );
  if (unused.length < 2) return;
  issues.push({
    id: slug("unused-dep", "repo"),
    type: "unused-dep",
    title: `${unused.length} declared dependencies appear unused`,
    severity: "info",
    description:
      "These packages are declared in package.json but no file imports them. Unused dependencies slow installs and widen the supply-chain surface.",
    evidence: unused.slice(0, 12).map((d) => `${d} · declared, never imported`),
    files: [],
    fix: "Remove them from package.json, or add a comment/note explaining why they must stay (e.g. runtime plugins).",
  });
}

/* --------------------------------------------------------- 9. duplicate files */
function duplicateIssues(p: PipelineResult, issues: Issue[]): void {
  const byHash = new Map<string, string[]>();
  for (const [path, hash] of p.hashByPath) {
    if (path.endsWith(".d.ts")) continue;
    const list = byHash.get(hash) ?? [];
    list.push(path);
    byHash.set(hash, list);
  }
  const groups = [...byHash.values()]
    .filter((g) => g.length > 1 && (p.nodeByPath.get(g[0])?.loc ?? 0) >= 25)
    .sort((a, b) => (p.nodeByPath.get(b[0])?.loc ?? 0) - (p.nodeByPath.get(a[0])?.loc ?? 0));
  if (groups.length === 0) return;
  const loc = (path: string) => p.nodeByPath.get(path)?.loc ?? 0;
  const files = groups.flat().slice(0, 30);
  issues.push({
    id: slug("duplicate-file", "repo"),
    type: "duplicate-file",
    title: `${groups.length} copy-pasted ${groups.length === 1 ? "file" : "files"} detected`,
    severity: loc(groups[0][0]) >= 150 ? "warning" : "info",
    description:
      "The same file contents appear in more than one place. Copies drift apart: a fix applied to one is rarely applied to the others.",
    evidence: groups.slice(0, 8).map((g) => `${g.join(" ⇄ ")} · ${loc(g[0])} LOC each`),
    files,
    fix: "Keep a single canonical copy and import it from the others (or delete the copies if one is obsolete).",
  });
}

/* ------------------------------------------------------- 10. naming consistency */
function fileStyle(stem: string): string {
  if (/^[a-z][a-z0-9]*([_-][a-z0-9]+)*$/.test(stem)) return /[-]/.test(stem) ? "kebab-case" : /^[a-z0-9_]+$/.test(stem) && stem.includes("_") ? "snake_case" : "lowercase";
  if (/^[a-z][a-zA-Z0-9]*$/.test(stem)) return "camelCase";
  if (/^[A-Z][a-zA-Z0-9]*$/.test(stem)) return "PascalCase";
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(stem)) return "snake_case";
  return "other";
}

function namingIssues(p: PipelineResult, issues: Issue[]): void {
  const byLang = new Map<string, Map<string, string[]>>();
  for (const n of p.nodes) {
    if (!CODE_LANGUAGES.has(n.language) || n.test) continue;
    const stem = n.name.replace(/\.[^.]+$/, "").replace(/\.[^.]+$/, "");
    if (stem.length < 3) continue;
    const style = fileStyle(stem);
    if (style === "other" || style === "lowercase") continue;
    // PascalCase component files are idiomatic in UI frameworks, so leave them alone.
    if (style === "PascalCase" && /\.(tsx|jsx|vue|svelte)$/i.test(n.name)) continue;
    const map = byLang.get(n.language) ?? new Map<string, string[]>();
    const list = map.get(style) ?? [];
    list.push(n.path);
    map.set(style, list);
    byLang.set(n.language, map);
  }
  for (const [lang, styles] of byLang) {
    const significant = [...styles.entries()].filter(([, files]) => files.length >= 4);
    if (significant.length < 2) continue;
    const [a, b] = significant.sort((x, y) => y[1].length - x[1].length);
    issues.push({
      id: slug("naming-inconsistency", lang),
      type: "naming-inconsistency",
      title: `${lang} filenames mix ${a[0]} and ${b[0]}`,
      severity: "info",
      description:
        "Files in the same language follow competing naming conventions, so a reader has to search instead of guessing the filename.",
      evidence: [
        `${a[0]}: ${plural(a[1].length, "file")} (e.g. ${a[1].slice(0, 3).map((f) => f.split("/").pop()).join(", ")})`,
        `${b[0]}: ${plural(b[1].length, "file")} (e.g. ${b[1].slice(0, 3).map((f) => f.split("/").pop()).join(", ")})`,
      ],
      files: [...a[1].slice(0, 6), ...b[1].slice(0, 6)],
      fix: `Pick one convention for ${lang} (${a[0]} or ${b[0]}) and rename files in a single sweep.`,
    });
  }
}

/* ------------------------------------------------------------ 11. test coverage */
function noTestIssues(p: PipelineResult, issues: Issue[]): void {
  const tests = p.nodes.filter((n) => n.test);
  const sourceNodes = p.nodes.filter((n) => !n.test && n.loc >= 5 && CODE_LANGUAGES.has(n.language));
  if (sourceNodes.length < 6) return;
  if (tests.length === 0) {
    issues.push({
      id: slug("no-tests", "repo"),
      type: "no-tests",
      title: "No automated tests found",
      severity: "warning",
      description:
        "No test files exist anywhere in the repository. Refactors are verified by hand or not at all, which is where regressions come from.",
      evidence: [`${plural(sourceNodes.length, "source file")}, no test files at all`],
      files: [],
      fix: "Test the entry points and the purest domain logic first; they change the least and catch the most.",
    });
    return;
  }
  // A cluster is "covered" if a test file lives in it or imports anything from it.
  const covered = new Set<string>();
  for (const t of tests) {
    covered.add(t.cluster);
    for (const imp of t.imports) {
      if (imp.resolved) {
        const target = p.nodeByPath.get(imp.resolved);
        if (target) covered.add(target.cluster);
      }
    }
  }
  const uncovered = [...new Map(sourceNodes.map((n) => [n.cluster, n])).keys()]
    .map((cluster) => ({
      cluster,
      count: sourceNodes.filter((n) => n.cluster === cluster).length,
    }))
    .filter((c) => c.count >= 6 && !covered.has(c.cluster))
    .sort((a, b) => b.count - a.count);
  if (uncovered.length === 0) return;
  issues.push({
    id: slug("no-tests", "repo"),
    type: "no-tests",
    title: `${plural(uncovered.length, "module")} with no test coverage`,
    severity: "warning",
    description:
      "No test file imports anything from these modules, so regressions there ship silently. (Tests found elsewhere in the repo are counted as coverage for the modules they touch.)",
    evidence: uncovered.slice(0, 8).map((c) => `${c.cluster} · ${c.count} source files, 0 references from tests`),
    files: [],
    fix: "Add at least one behavioural test per module boundary, starting with the highest-traffic clusters.",
  });
}

/* ---------------------------------------------------------- 12. TODO hotspots */
async function todoIssues(p: PipelineResult, issues: Issue[]): Promise<void> {
  const re = /\b(TODO|FIXME|HACK|XXX|WORKAROUND)\b/g;
  const rows: { path: string; count: number; cluster: string }[] = [];
  for (const node of p.nodes) {
    if (node.language === "Markdown" || node.language === "Other" || node.bytes > 500_000) continue;
    const file = p.files.find((f) => f.path === node.path);
    if (!file) continue;
    try {
      const text = await fs.readFile(file.absPath, "utf8");
      const count = (text.match(re) ?? []).length;
      if (count > 0) rows.push({ path: node.path, count, cluster: node.cluster });
    } catch {
      /* unreadable */
    }
  }
  if (rows.length === 0) return;
  const total = rows.reduce((s, r) => s + r.count, 0);
  const byCluster = new Map<string, { count: number; files: number }>();
  for (const r of rows) {
    const acc = byCluster.get(r.cluster) ?? { count: 0, files: 0 };
    acc.count += r.count;
    acc.files++;
    byCluster.set(r.cluster, acc);
  }
  const hotspot = [...byCluster.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  const top = [...rows].sort((a, b) => b.count - a.count).slice(0, 8);
  issues.push({
    id: slug("todo-hotspot", "repo"),
    type: "todo-hotspot",
    title: `${plural(total, "TODO/FIXME marker")} across ${plural(rows.length, "file")}`,
    severity: total >= 25 ? "warning" : "info",
    description:
      "Unresolved markers accumulate where the code is hardest to reason about. The densest cluster (" +
      hotspot[0] +
      ") is where known debt is concentrated.",
    evidence: [
      `Hotspot: ${hotspot[0]} · ${plural(hotspot[1].count, "marker")} in ${plural(hotspot[1].files, "file")}`,
      ...top.map((r) => `${r.path} · ${r.count} marker${r.count > 1 ? "s" : ""}`),
    ],
    files: top.map((r) => r.path),
    fix: "Turn the oldest markers into tracked issues and delete the ones nobody will ever do.",
  });
}

/** Runs every rule and returns a stable, de-duplicated issue list. */
export async function detectIssues(p: PipelineResult): Promise<Issue[]> {
  const issues: Issue[] = [];
  cyclicIssues(p, issues);
  layerIssues(p, issues);
  deadExportIssues(p, issues);
  orphanIssues(p, issues);
  godFileIssues(p, issues);
  hubIssues(p, issues);
  undeclaredIssues(p, issues);
  unusedDepIssues(p, issues);
  duplicateIssues(p, issues);
  namingIssues(p, issues);
  noTestIssues(p, issues);
  await todoIssues(p, issues);
  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity] || a.type.localeCompare(b.type));
}
