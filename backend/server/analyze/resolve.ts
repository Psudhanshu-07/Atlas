// Resolves import specifiers to repo-relative files (or to external packages).
// Handles relative paths, tsconfig aliases, workspace packages, Python dotted
// imports, Go module paths, Rust crate paths and C-family includes.

import * as path from "node:path";
import type { WorkspaceMeta } from "./crawl";

export interface ResolverContext {
  root: string;
  /** set of all crawled repo-relative posix paths */
  fileSet: Set<string>;
  /** dir (posix, "." for root) → file paths directly inside it */
  filesByDir: Map<string, string[]>;
  meta: WorkspaceMeta;
}

interface ResolvedImport {
  resolved?: string;
  external?: string;
}

const EXTS = [
  ".ts",
  ".tsx",
  ".d.ts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".pyi",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".scala",
  ".cs",
  ".rb",
  ".php",
  ".swift",
  ".vue",
  ".svelte",
  ".dart",
  ".ex",
  ".exs",
  ".lua",
  ".sh",
  ".sql",
  ".proto",
  ".graphql",
  ".json",
  ".md",
  ".css",
  ".scss",
  ".html",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
];

const INDEX_NAMES = ["index", "mod", "main", "app", "__init__"];

/**
 * TypeScript's Node-ESM convention puts the *emitted* extension in the
 * specifier: `x.ts` is imported as `"./x.js"`. Without this rewrite every such
 * edge silently fails to resolve and the graph collapses toward zero.
 */
const EXT_SIBLINGS: Record<string, string[]> = {
  ".js": [".ts", ".tsx", ".mts", ".cts"],
  ".jsx": [".tsx", ".ts"],
  ".mjs": [".mts", ".ts"],
  ".cjs": [".cts", ".ts"],
};

function normalizeRel(base: string, spec: string): string {
  const joined = path.posix.normalize(path.posix.join(base, spec));
  return joined.startsWith("../") ? joined.slice(3) : joined;
}

function firstExisting(ctx: ResolverContext, candidates: string[]): string | undefined {
  for (const c of candidates) {
    const cleaned = c.replace(/^\.\//, "");
    if (ctx.fileSet.has(cleaned)) return cleaned;
  }
  return undefined;
}

/** Expand a base path (no known extension) into concrete file candidates. */
function expand(ctx: ResolverContext, base: string): string[] {
  const out: string[] = [];
  const clean = base.replace(/\/$/, "");
  out.push(clean);
  for (const ext of EXTS) out.push(clean + ext);

  // "./x.js" → also try the TypeScript sources behind that emitted extension.
  const ext = path.posix.extname(clean);
  const siblings = EXT_SIBLINGS[ext];
  if (siblings) {
    const stem = clean.slice(0, -ext.length);
    for (const alt of siblings) out.push(stem + alt);
    // "./utils.js" may really be "./utils/index.ts".
    for (const name of INDEX_NAMES) {
      for (const e of EXTS) out.push(`${stem}/${name}${e}`);
    }
  }

  const dirs = ["", ...EXTS.map((e) => `/index${e}`), "/__init__.py", "/mod.rs"];
  if (!clean.endsWith(".py")) {
    for (const d of dirs) out.push(clean + d);
  }
  for (const name of INDEX_NAMES) {
    for (const e of EXTS) out.push(`${clean}/${name}${e}`);
  }
  return out;
}

/** Package-ish dir (e.g. a Go/Rust package): pick a representative file. */
function pickDirRepresentative(ctx: ResolverContext, dir: string): string | undefined {
  const files = ctx.filesByDir.get(dir) ?? [];
  if (files.length === 0) return undefined;
  const base = dir === "." ? "" : dir.split("/").pop() ?? "";
  const preferred =
    files.find((f) => {
      const stem = (f.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
      return stem === base || INDEX_NAMES.includes(stem);
    }) ?? files[0];
  return preferred;
}

function jsPackage(spec: string): string {
  const segs = spec.split("/");
  if (spec.startsWith("@")) return segs.slice(0, 2).join("/");
  return segs[0];
}

function resolveJsLike(ctx: ResolverContext, from: string, spec: string): ResolvedImport {
  const dir = path.posix.dirname(from);

  if (spec.startsWith(".") || spec.startsWith("/")) {
    const base = spec.startsWith("/")
      ? spec.slice(1)
      : normalizeRel(dir === "." ? "" : dir, spec);
    const hit = firstExisting(ctx, expand(ctx, base));
    if (hit) return { resolved: hit };
    return {}; // relative but missing → broken import, not external
  }

  // tsconfig/jsconfig alias
  for (const alias of ctx.meta.aliases) {
    if (alias.from && spec.startsWith(alias.from)) {
      const target = alias.to + spec.slice(alias.from.length);
      const hit = firstExisting(ctx, expand(ctx, target));
      if (hit) return { resolved: hit };
    }
  }

  // workspace package (monorepo)
  for (const [name, dirPath] of ctx.meta.packages) {
    if (spec === name || spec.startsWith(name + "/")) {
      const sub = spec === name ? "" : spec.slice(name.length + 1);
      const base = dirPath === "." ? sub : `${dirPath}${sub ? "/" + sub : ""}`;
      const hit = firstExisting(ctx, expand(ctx, base)) ?? pickDirRepresentative(ctx, dirPath === "." ? "." : dirPath);
      if (hit) return { resolved: hit };
    }
  }

  // bare specifier that actually points at a top-level folder ("src/...", "utils/...")
  const firstSeg = spec.split("/")[0];
  if (ctx.filesByDir.has(firstSeg)) {
    const hit = firstExisting(ctx, expand(ctx, spec));
    if (hit) return { resolved: hit };
  }

  return { external: jsPackage(spec) };
}

function resolvePython(ctx: ResolverContext, from: string, spec: string): ResolvedImport {
  const dir = path.posix.dirname(from);

  if (spec.startsWith(".")) {
    const dots = spec.length - spec.replace(/^\./, "").length;
    let baseDir = dir;
    for (let i = 1; i < dots; i++) {
      baseDir = baseDir === "." ? "." : path.posix.dirname(baseDir);
    }
    const rest = spec.slice(dots).replace(/\./g, "/");
    const base = rest ? (baseDir === "." ? rest : `${baseDir}/${rest}`) : baseDir;
    const hit =
      firstExisting(ctx, expand(ctx, base)) ??
      (baseDir === "." ? undefined : firstExisting(ctx, expand(ctx, `${baseDir}/${spec.slice(dots)}`)));
    if (hit) return { resolved: hit };
    return {};
  }

  const rel = spec.replace(/\./g, "/");
  for (const prefix of [".", "src", "app", "lib", "server", "backend", "backend/app", "python"]) {
    const base = prefix === "." ? rel : `${prefix}/${rel}`;
    const hit = firstExisting(ctx, expand(ctx, base));
    if (hit) return { resolved: hit };
  }
  // same-package fallback: "utils" imported from pkg/a.py → pkg/utils.py
  const sibling = firstExisting(ctx, expand(ctx, dir === "." ? rel : `${dir}/${rel}`));
  if (sibling) return { resolved: sibling };

  return { external: spec.split(".")[0] };
}

function resolveGo(ctx: ResolverContext, _from: string, spec: string): ResolvedImport {
  for (const [mod] of ctx.meta.packages) {
    if (mod && mod !== "." && (spec === mod || spec.startsWith(mod + "/"))) {
      const sub = spec === mod ? "" : spec.slice(mod.length + 1);
      const hit = sub ? pickDirRepresentative(ctx, sub) : pickDirRepresentative(ctx, ".");
      if (hit) return { resolved: hit };
    }
  }
  if (!spec.includes(".")) return { external: spec }; // stdlib
  const hit = pickDirRepresentative(ctx, spec);
  if (hit) return { resolved: hit };
  return { external: spec.split("/")[0] };
}

function resolveRust(ctx: ResolverContext, from: string, raw: string): ResolvedImport {
  const spec = raw.replace(/^::/, "");
  const dir = path.posix.dirname(from);

  if (spec.startsWith("crate::")) {
    const base = spec.slice("crate::".length).replace(/::/g, "/");
    const hit = firstExisting(ctx, expand(ctx, base));
    if (hit) return { resolved: hit };
    return {};
  }
  if (spec.startsWith("self::")) {
    const base = spec.slice("self::".length).replace(/::/g, "/");
    const hit = firstExisting(ctx, expand(ctx, dir === "." ? base : `${dir}/${base}`));
    if (hit) return { resolved: hit };
    return {};
  }
  if (spec.startsWith("super::")) {
    const parent = dir === "." ? "." : path.posix.dirname(dir);
    const base = spec.slice("super::".length).replace(/::/g, "/");
    const hit = firstExisting(ctx, expand(ctx, parent === "." ? base : `${parent}/${base}`));
    if (hit) return { resolved: hit };
    return {};
  }
  // plain `mod foo;` style (relative module)
  if (!spec.includes("::")) {
    const hit = firstExisting(
      ctx,
      expand(ctx, dir === "." ? spec : `${dir}/${spec}`).concat(
        `${dir === "." ? "" : dir + "/"}${spec}/mod.rs`,
      ),
    );
    if (hit) return { resolved: hit };
  }
  return { external: spec.split("::")[0] };
}

function resolveJvmLike(ctx: ResolverContext, from: string, spec: string): ResolvedImport {
  const clean = spec.replace(/\.\*$/, "").replace(/;$/, "");
  const rel = clean.replace(/\./g, "/");
  const dir = path.posix.dirname(from);
  const roots = [".", "src", "src/main/java", "src/main/kotlin", "app", dir];
  for (const r of roots) {
    const base = r === "." ? rel : `${r}/${rel}`;
    const hit = firstExisting(ctx, expand(ctx, base));
    if (hit) return { resolved: hit };
  }
  const segs = clean.split(".");
  return { external: segs.slice(0, 2).join(".") };
}

function resolveCFamily(ctx: ResolverContext, from: string, spec: string): ResolvedImport {
  const dir = path.posix.dirname(from);
  const local = spec.startsWith('"');
  const target = spec.replace(/^["<]|[">]$/g, "");
  if (local) {
    const hit = firstExisting(ctx, expand(ctx, normalizeRel(dir === "." ? "" : dir, target)));
    if (hit) return { resolved: hit };
  }
  for (const r of [".", "include", "src", "src/include", dir]) {
    const base = r === "." ? target : `${r}/${target}`;
    const hit = firstExisting(ctx, expand(ctx, base));
    if (hit) return { resolved: hit };
  }
  if (target.includes("/")) return { external: target.split("/")[0] };
  if (/\.(h|hpp|hh)$/.test(target)) return { external: target.replace(/\.(h|hpp|hh)$/, "") };
  return { external: target };
}

function resolveGeneric(ctx: ResolverContext, from: string, language: string, spec: string): ResolvedImport {
  const dir = path.posix.dirname(from);
  if (spec.startsWith(".") || spec.startsWith("./")) {
    const hit = firstExisting(ctx, expand(ctx, normalizeRel(dir === "." ? "" : dir, spec)));
    if (hit) return { resolved: hit };
    return {};
  }
  if (language === "Ruby" || language === "PHP" || language === "Shell" || language === "PowerShell") {
    for (const r of [".", "lib", "src", "app", dir]) {
      const base = r === "." ? spec : `${r}/${spec}`;
      const hit = firstExisting(ctx, expand(ctx, base));
      if (hit) return { resolved: hit };
    }
    return { external: spec.split("/")[0].split(".")[0] };
  }
  const dotted = spec.replace(/\./g, "/");
  for (const r of [".", "src", "lib"]) {
    const base = r === "." ? dotted : `${r}/${dotted}`;
    const hit = firstExisting(ctx, expand(ctx, base));
    if (hit) return { resolved: hit };
  }
  if (spec.includes(".")) return { external: spec.split(".")[0] };
  return { external: spec.split("/")[0] };
}

export function resolveImport(
  ctx: ResolverContext,
  from: string,
  spec: string,
  language: string,
): ResolvedImport {
  const trimmed = spec.trim();
  if (!trimmed || trimmed.startsWith("data:")) return {};
  switch (language) {
    case "TypeScript":
    case "JavaScript":
    case "Vue":
    case "Svelte":
      return resolveJsLike(ctx, from, trimmed);
    case "Python":
      return resolvePython(ctx, from, trimmed);
    case "Go":
      return resolveGo(ctx, from, trimmed);
    case "Rust":
      return resolveRust(ctx, from, trimmed);
    case "Java":
    case "Kotlin":
    case "Scala":
    case "C#":
      return resolveJvmLike(ctx, from, trimmed);
    case "C":
    case "C/C++":
    case "C++":
      return resolveCFamily(ctx, from, trimmed);
    default:
      return resolveGeneric(ctx, from, language, trimmed);
  }
}
