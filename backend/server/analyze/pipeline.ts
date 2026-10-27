// Core analysis pipeline: crawl → parse → resolve → graph metrics → clusters/layers.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { ProgressReporter } from "../jobs";
import { crawl, type CrawledFile, type WorkspaceMeta } from "./crawl";
import {
  detectLanguage,
  extract,
  isSourceLanguage,
  LANG_COLOR,
  type ExtractResult,
} from "./lang";
import { resolveImport, type ResolverContext } from "./resolve";
import type {
  Cluster,
  Edge,
  FileNode,
  ImportInfo,
  LanguageStat,
  Layer,
} from "../../../shared/types";

export interface PipelineResult {
  root: string;
  nodes: FileNode[];
  edges: Edge[];
  nodeByPath: Map<string, FileNode>;
  extractByPath: Map<string, ExtractResult>;
  clusters: Cluster[];
  layers: Layer[];
  cycles: string[][];
  languages: LanguageStat[];
  entryPoints: string[];
  usedNames: Map<string, { names: Set<string>; all: boolean }>;
  /** normalized-content hash → detect copy/pasted files */
  hashByPath: Map<string, string>;
  meta: WorkspaceMeta;
  files: CrawledFile[];
  dirs: Set<string>;
  warnings: string[];
  timings: { crawl: number; parse: number; analyze: number };
}

const TEST_RE = /(^|\/)(__tests__|__mocks__|tests?|specs?)(\/|$)|\.(test|spec|spec\.\w+)\.[a-z]+$/i;
const TEST_FILE_RE = /(^|\/)(test_[^/]+|[^/]+_test)\.[a-z]+$/i;

function isTestPath(p: string): boolean {
  return TEST_RE.test(p) || TEST_FILE_RE.test(p) || /(^|\/)conftest\.py$/.test(p);
}

function countLoc(text: string): number {
  let n = 0;
  for (const line of text.split("\n")) {
    if (line.trim().length > 0) n++;
  }
  return n;
}

/** Cluster = module group. Strips a dominant single-folder prefix (src/lib/...). */
export function clusterOf(relPath: string, stripPrefix: string | null): string {
  const parts = relPath.split("/");
  parts.pop();
  if (parts.length === 0) return "(root)";
  let head = parts;
  if (stripPrefix && parts[0] === stripPrefix) head = parts.slice(1);
  if (head.length === 0) return "(root)";
  if (head.length === 1) return head[0];
  return head[0];
}

const LAYER_RULES: Array<{ id: string; test: (p: string) => boolean }> = [
  { id: "tests", test: (p) => isTestPath(p) },
  {
    id: "ops",
    test: (p) =>
      /(^|\/)(docs?|\.github|ci|scripts?|tools?|deploy|infra|terraform|k8s)(\/|$)/i.test(p) ||
      /\.(md|ya?ml|tf|dockerfile)$/.test(p) ||
      /(^|\/)(dockerfile|makefile|procfile|vite\.config|webpack\.config|rollup\.config|jest\.config|eslint\.config|tsconfig|babel\.config)/i.test(
        p,
      ),
  },
  {
    id: "data",
    test: (p) =>
      /(^|\/)(data|database|db|models?|entities|repositor(y|ies)|storage|migrations?|schema|queries|sql)(\/|\.|$)/i.test(
        p,
      ) || /\.(sql|prisma)$/i.test(p),
  },
  {
    id: "interface",
    test: (p) =>
      /(^|\/)(routes?|controllers?|api|handlers?|endpoints?|views?|pages?|urls?|commands?|cli|serializers?|resources|graphql|rpc)(\/|\.|_)/i.test(
        p,
      ),
  },
  {
    id: "business",
    test: (p) =>
      /(^|\/)(services?|domain|use-?cases?|actions|managers?|engine|core|business|jobs?|tasks?|workflow|policies|providers)(\/|\.|_)/i.test(
        p,
      ),
  },
  {
    id: "presentation",
    test: (p) =>
      /\.(tsx|jsx|vue|svelte|css|scss|less|html)$/i.test(p) ||
      /(^|\/)(components?|ui|screens?|layouts?|widgets?|templates?|styles?|theme|hooks?|pages)(\/|\.)/i.test(
        p,
      ),
  },
  {
    id: "shared",
    test: (p) =>
      /(\/|\b)(utils?|helpers?|common|shared|config|constants|types?|consts?|middleware|plugins?|validators?|formatters?)(\/|\.|_)/i.test(
        p,
      ),
  },
];

const LAYER_META: Record<string, { name: string; description: string }> = {
  presentation: {
    name: "Presentation",
    description: "UI components, pages and styles.",
  },
  interface: {
    name: "Interface / API",
    description: "Routes, controllers and entry surfaces that other systems call.",
  },
  business: {
    name: "Business logic",
    description: "Domain rules, services and workflows.",
  },
  data: {
    name: "Data & persistence",
    description: "Models, repositories, storage and database access.",
  },
  shared: {
    name: "Shared / infrastructure",
    description: "Utilities, config and cross-cutting helpers used by everyone.",
  },
  tests: { name: "Tests", description: "Automated tests and fixtures." },
  ops: { name: "Docs & operations", description: "Documentation, CI/CD and infrastructure." },
  app: { name: "Application", description: "Top-level application wiring." },
};

function layerOf(relPath: string): string {
  for (const rule of LAYER_RULES) {
    if (rule.test(relPath)) return rule.id;
  }
  const depth = relPath.split("/").length;
  return depth <= 2 ? "app" : "business";
}

function entryCandidate(relPath: string): boolean {
  const p = relPath.toLowerCase();
  const name = p.split("/").pop() ?? p;
  const patterns = [
    /^src\/(index|main|app)\.(t|j)sx?$/,
    /^(index|main|app)\.(t|j)sx?$/,
    /^src\/(index|main)\.(js|ts)$/,
    /(^|\/)app\/page\.tsx$/,
    /(^|\/)pages\/index\.(t|j)sx?$/,
    /(^|\/)_app\.(t|j)sx?$/,
    /(^|\/)manage\.py$/,
    /(^|\/)__main__\.py$/,
    /(^|\/)(main|app|server|cli|wsgi|asgi)\.py$/,
    /(^|\/)cmd\/[^/]+\/main\.go$/,
    /^(src\/)?(main|lib)\.rs$/,
    /(^|\/)main\.go$/,
    /(^|\/)(index|default)\.(rb|php)$/,
  ];
  if (patterns.some((re) => re.test(p))) return true;
  if (name === "dockerfile" || name === "makefile") return false;
  return false;
}

/** Tarjan's SCC. Returns cycles (component size > 1) plus self loops. */
function findCycles(nodes: FileNode[], edges: Edge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.path, []);
  for (const e of edges) adj.get(e.from)?.push(e.to);

  let index = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];

  const strongconnect = (v: string): void => {
    indices.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v) ?? 0, low.get(w) ?? 0));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v) ?? 0, indices.get(w) ?? 0));
      }
    }
    if (low.get(v) === indices.get(v)) {
      const comp: string[] = [];
      let w = "";
      do {
        w = stack.pop() ?? "";
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) components.push(comp);
      else if (comp.length === 1 && (adj.get(comp[0]) ?? []).includes(comp[0])) {
        components.push(comp);
      }
    }
  };

  for (const n of nodes) {
    if (!indices.has(n.path)) strongconnect(n.path);
  }
  components.sort((a, b) => b.length - a.length);
  return components;
}

const CLUSTER_ROLES: Array<[RegExp, string]> = [
  [/^(ui|components?|views?|screens?|pages?|frontend|web|client|app\/components)/i, "User interface"],
  [/^(api|routes?|controllers?|server|backend|http|rest|graphql)/i, "API surface"],
  [/^(services?|domain|core|engine|business|lib)/i, "Business logic"],
  [/^(data|models?|db|database|entities|repositories|storage|persistence)/i, "Data & persistence"],
  [/^(utils?|helpers?|common|shared|config|constants|types?)/i, "Shared utilities"],
  [/^(tests?|specs?|__tests__|testing)/i, "Tests"],
  [/^(scripts?|tools?|cli|bin|devops|infra|deploy)/i, "Tooling & scripts"],
  [/^(docs?|documentation)/i, "Documentation"],
  [/^(packages|apps|modules|src)/i, "Application modules"],
  [/^(samples?|examples?)/i, "Examples"],
];

function roleForCluster(name: string): string {
  for (const [re, role] of CLUSTER_ROLES) {
    if (re.test(name)) return role;
  }
  return "Feature modules";
}

export async function runPipeline(root: string, report?: ProgressReporter): Promise<PipelineResult> {
  const warnings: string[] = [];
  const t0 = Date.now();
  report?.stage("crawl", "scanning the file tree…");
  const crawled = await crawl(root);
  const t1 = Date.now();
  if (crawled.truncated) {
    warnings.push("Repository exceeds 4,000 files; the analysis covers the first 4,000.");
  }
  report?.stage("parse", `0 / ${crawled.files.length} files`, { files: crawled.files.length });

  // Parse every file.
  const extractByPath = new Map<string, ExtractResult>();
  const hashByPath = new Map<string, string>();
  const nodes: FileNode[] = [];

  let parsed = 0;
  let parsedLoc = 0;
  for (const file of crawled.files) {
    const language = detectLanguage(file.path);
    let text = "";
    try {
      text = await fs.readFile(file.absPath, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\u0000")) continue;
    const source = isSourceLanguage(language);
    const res = source
      ? extract(file.path, language, text)
      : { imports: [], exports: [], definitions: 0, commentLines: 0 };
    extractByPath.set(file.path, res);
    if (isSourceLanguage(language)) {
      hashByPath.set(
        file.path,
        createHash("md5").update(text.replace(/\s+/g, " ")).digest("hex"),
      );
    }
    nodes.push({
      path: file.path,
      dir: file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : ".",
      name: file.path.split("/").pop() ?? file.path,
      language,
      loc: countLoc(text),
      bytes: file.bytes,
      imports: [],
      externalImports: [],
      exports: res.exports,
      cluster: "",
      layer: layerOf(file.path),
      fanIn: 0,
      fanOut: 0,
      entry: false,
      test: isTestPath(file.path),
      issueCount: 0,
      deadExports: [],
    });
    parsed++;
    parsedLoc += nodes[nodes.length - 1].loc;
    // Report in batches so large repos don't flood the poller.
    if (parsed % 25 === 0 || parsed === crawled.files.length) {
      report?.stage("parse", `${parsed.toLocaleString()} / ${crawled.files.length.toLocaleString()} files`, {
        loc: parsedLoc,
      });
    }
  }
  const t2 = Date.now();

  const fileSet = new Set(nodes.map((n) => n.path));
  const filesByDir = new Map<string, string[]>();
  for (const n of nodes) {
    const list = filesByDir.get(n.dir) ?? [];
    list.push(n.path);
    filesByDir.set(n.dir, list);
  }

  const ctx: ResolverContext = { root, fileSet, filesByDir, meta: crawled.meta };

  // Resolve imports.
  const usedNames = new Map<string, { names: Set<string>; all: boolean }>();
  report?.stage("resolve", `0 / ${nodes.length.toLocaleString()} files`);
  let resolvedCount = 0;
  for (const node of nodes) {
    resolvedCount++;
    if (resolvedCount % 25 === 0 || resolvedCount === nodes.length) {
      report?.stage("resolve", `${resolvedCount.toLocaleString()} / ${nodes.length.toLocaleString()} files`, {
        modules: 0,
      });
    }
    const res = extractByPath.get(node.path);
    if (!res) continue;
    const seenRaw = new Set<string>();
    const externals = new Set<string>();
    const infos: ImportInfo[] = [];
    for (const imp of res.imports) {
      const key = `${imp.raw}@${imp.line}`;
      if (seenRaw.has(key)) continue;
      seenRaw.add(key);
      const r = resolveImport(ctx, node.path, imp.raw, node.language);
      const info: ImportInfo = { raw: imp.raw, line: imp.line };
      if (r.resolved && r.resolved !== node.path && fileSet.has(r.resolved)) {
        info.resolved = r.resolved;
        const acc = usedNames.get(r.resolved) ?? { names: new Set<string>(), all: false };
        if (imp.all || imp.names.includes("*")) acc.all = true;
        for (const nm of imp.names) acc.names.add(nm);
        usedNames.set(r.resolved, acc);
      } else if (r.external) {
        info.external = r.external;
        externals.add(r.external);
      }
      infos.push(info);
    }
    node.imports = infos;
    node.externalImports = [...externals].sort();
    node.fanOut = new Set(infos.map((i) => i.resolved).filter(Boolean) as string[]).size;
  }

  // Edges + fan-in.
  const edgeSet = new Set<string>();
  const edges: Edge[] = [];
  const fanIn = new Map<string, Set<string>>();
  for (const node of nodes) {
    for (const imp of node.imports) {
      if (!imp.resolved) continue;
      const key = `${node.path}\u0000${imp.resolved}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ from: node.path, to: imp.resolved });
      const set = fanIn.get(imp.resolved) ?? new Set<string>();
      set.add(node.path);
      fanIn.set(imp.resolved, set);
    }
  }
  for (const node of nodes) node.fanIn = fanIn.get(node.path)?.size ?? 0;
  report?.stage("resolve", `${edges.length.toLocaleString()} internal links`, { deps: edges.length });

  // Clusters: strip a dominant single-folder prefix, then refine oversized groups.
  const topLevelCounts = new Map<string, number>();
  for (const n of nodes) {
    const first = n.path.split("/")[0];
    topLevelCounts.set(first, (topLevelCounts.get(first) ?? 0) + 1);
  }
  let stripPrefix: string | null = null;
  const STRIPPABLE = new Set(["src", "lib", "app", "source", "internal", "cmd", "pkg"]);
  for (const [name, count] of topLevelCounts) {
    if (STRIPPABLE.has(name) && count >= nodes.length * 0.6) stripPrefix = name;
  }

  const clusterCount = new Map<string, number>();
  for (const n of nodes) {
    n.cluster = clusterOf(n.path, stripPrefix);
    clusterCount.set(n.cluster, (clusterCount.get(n.cluster) ?? 0) + 1);
  }
  // Split very large clusters one level deeper for a more useful map.
  for (const n of nodes) {
    const size = clusterCount.get(n.cluster) ?? 0;
    if (size > 60 && size / nodes.length > 0.5) continue;
    if (size > 45) {
      const parts = n.path.split("/");
      const base = n.cluster === "(root)" ? parts[0] : n.cluster;
      const idx = parts.indexOf(base.split("/")[0]);
      const sub = parts[idx + 1];
      if (sub) n.cluster = `${base}/${sub}`;
    }
  }

  // Entry points.
  const entries = new Set<string>();
  for (const n of nodes) {
    if (entryCandidate(n.path)) entries.add(n.path);
  }
  try {
    const pkgRaw = await fs.readFile(path.join(root, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as {
      main?: string;
      module?: string;
      bin?: string | Record<string, string>;
      scripts?: Record<string, string>;
    };
    const targets: string[] = [];
    if (pkg.main) targets.push(pkg.main);
    if (pkg.module) targets.push(pkg.module);
    if (typeof pkg.bin === "string") targets.push(pkg.bin);
    else if (pkg.bin) targets.push(...Object.values(pkg.bin));
    for (const target of targets) {
      const r = resolveImport(ctx, "package.json", `./${target.replace(/^\.\//, "")}`, "JavaScript");
      if (r.resolved) entries.add(r.resolved);
    }
  } catch {
    /* no package.json */
  }
  for (const n of nodes) {
    if (n.path.includes("/cmd/") && n.name === "main.go") entries.add(n.path);
    if (n.name === "__main__.py" || n.name === "manage.py") entries.add(n.path);
    if (n.path === "src/main.rs" || n.path === "src/lib.rs") entries.add(n.path);
  }
  if (entries.size === 0) {
    const fallback = [...nodes]
      .filter((n) => !n.test && /^(index|main|app)\./.test(n.name))
      .sort((a, b) => a.path.split("/").length - b.path.split("/").length)[0];
    if (fallback) entries.add(fallback.path);
    else warnings.push("No conventional entry point found; check the package main fields.");
  }
  for (const n of nodes) n.entry = entries.has(n.path);

  // Exports with no in-repo consumer (filled per node for explain/annotations).
  for (const n of nodes) {
    if (n.test || n.entry || n.fanIn === 0 || n.exports.length === 0) continue;
    const used = usedNames.get(n.path);
    if (used?.all) continue;
    const names = used?.names ?? new Set<string>();
    const seen = new Set<string>();
    const dead: string[] = [];
    for (const exp of n.exports) {
      if (exp.kind === "re-export" || seen.has(exp.name)) continue;
      seen.add(exp.name);
      if (!names.has(exp.name)) dead.push(exp.name);
    }
    n.deadExports = dead;
  }

  // Languages.
  const langMap = new Map<string, { files: number; lines: number }>();
  for (const n of nodes) {
    const acc = langMap.get(n.language) ?? { files: 0, lines: 0 };
    acc.files++;
    acc.lines += n.loc;
    langMap.set(n.language, acc);
  }
  const languages: LanguageStat[] = [...langMap.entries()]
    .map(([name, v]) => ({ name, files: v.files, lines: v.lines, color: LANG_COLOR[name] ?? LANG_COLOR.Other }))
    .sort((a, b) => b.lines - a.lines);

  // Clusters.
  const clusterFiles = new Map<string, FileNode[]>();
  for (const n of nodes) {
    const list = clusterFiles.get(n.cluster) ?? [];
    list.push(n);
    clusterFiles.set(n.cluster, list);
  }
  // Cluster boundary edges (computed in one pass).
  const clusterByPath = new Map<string, string>();
  for (const n of nodes) clusterByPath.set(n.path, n.cluster);
  const outboundByCluster = new Map<string, Set<string>>();
  const inboundByCluster = new Map<string, Set<string>>();
  for (const e of edges) {
    const fromC = clusterByPath.get(e.from);
    const toC = clusterByPath.get(e.to);
    if (!fromC || !toC || fromC === toC) continue;
    const out = outboundByCluster.get(fromC) ?? new Set<string>();
    out.add(e.to);
    outboundByCluster.set(fromC, out);
    const inc = inboundByCluster.get(toC) ?? new Set<string>();
    inc.add(e.from);
    inboundByCluster.set(toC, inc);
  }

  const clusters: Cluster[] = [];
  for (const [id, list] of clusterFiles) {
    const langs = [...new Set(list.map((n) => n.language))].filter((l) => l !== "Other");
    const outbound = outboundByCluster.get(id) ?? new Set<string>();
    const inbound = inboundByCluster.get(id) ?? new Set<string>();
    clusters.push({
      id,
      name: id,
      files: list.length,
      lines: list.reduce((s, n) => s + n.loc, 0),
      languages: langs.sort(
        (a, b) =>
          (langMap.get(b)?.lines ?? 0) - (langMap.get(a)?.lines ?? 0),
      ),
      role: roleForCluster(id),
      outbound: outbound.size,
      inbound: inbound.size,
      issues: 0,
    });
  }
  clusters.sort((a, b) => b.lines - a.lines);

  // Layers.
  const layerMap = new Map<string, number>();
  for (const n of nodes) layerMap.set(n.layer, (layerMap.get(n.layer) ?? 0) + 1);
  const LAYER_ORDER = ["presentation", "interface", "business", "data", "shared", "app", "tests", "ops"];
  const layers: Layer[] = LAYER_ORDER.filter((id) => layerMap.has(id)).map((id) => ({
    id,
    name: LAYER_META[id].name,
    description: LAYER_META[id].description,
    files: layerMap.get(id) ?? 0,
  }));

  const cycles = findCycles(nodes, edges);
  const t3 = Date.now();

  return {
    root,
    nodes,
    edges,
    nodeByPath: new Map(nodes.map((n) => [n.path, n])),
    extractByPath,
    clusters,
    layers,
    cycles,
    languages,
    entryPoints: [...entries],
    usedNames,
    hashByPath,
    meta: crawled.meta,
    files: crawled.files,
    dirs: crawled.dirs,
    warnings,
    timings: { crawl: t1 - t0, parse: t2 - t1, analyze: t3 - t2 },
  };
}
