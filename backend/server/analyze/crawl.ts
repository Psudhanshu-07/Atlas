// Repository crawler: walks a checkout, applies ignore rules, skips binaries,
// and gathers workspace metadata (package.json names, tsconfig path aliases).

import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface CrawledFile {
  path: string; // repo-relative, posix separators
  absPath: string;
  bytes: number;
}

export interface WorkspaceMeta {
  /** package/module name → repo-relative directory */
  packages: Map<string, string>;
  /** tsconfig path alias prefix → replacement prefix */
  aliases: Array<{ from: string; to: string }>;
  /** dependency names declared by root package.json (if any) */
  declaredDeps: Set<string>;
  /** python/go/rust declared deps for undeclared-dependency checks */
  declaredPython: Set<string>;
  declaredGo: Set<string>;
  declaredRust: Set<string>;
}

interface CrawlResult {
  files: CrawledFile[];
  dirs: Set<string>;
  meta: WorkspaceMeta;
  truncated: boolean;
}

const IGNORE_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "bower_components",
  "dist",
  "build",
  "out",
  "output",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".cache",
  ".parcel-cache",
  "vendor",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "venv",
  ".venv",
  "env",
  ".tox",
  "target",
  "bin",
  "obj",
  ".idea",
  ".vscode",
  ".codeatlas",
  "Pods",
  "DerivedData",
  "public",
  "static",
  "assets",
  "fixtures",
  "examples",
  "migrations",
  "seed",
  "seeds",
  "tmp",
  "temp",
  "logs",
  ".github",
]);

const IGNORE_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "composer.lock",
  "poetry.lock",
  "cargo.lock",
  "gemfile.lock",
  ".DS_Store",
  "thumbs.db",
]);

const IGNORE_EXTENSIONS = new Set([
  ".lock",
  ".min.js",
  ".min.css",
  ".map",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".bmp",
  ".psd",
  ".sketch",
  ".fig",
  ".svg",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".mp3",
  ".wav",
  ".ogg",
  ".flac",
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".tgz",
  ".bz2",
  ".7z",
  ".rar",
  ".jar",
  ".war",
  ".class",
  ".pyc",
  ".pyo",
  ".so",
  ".dylib",
  ".dll",
  ".exe",
  ".bin",
  ".dat",
  ".db",
  ".sqlite",
  ".sqlite3",
  ".parquet",
  ".feather",
  ".pkl",
  ".pickle",
  ".npy",
  ".npz",
  ".pt",
  ".pth",
  ".onnx",
  ".h5",
  ".whl",
  ".egg",
  ".wasm",
  ".pptx",
  ".docx",
  ".xlsx",
  ".xls",
  ".ods",
  ".par",
  ".pyz",
]);

const MAX_FILES = 4000;
const MAX_BYTES = 1_500_000;

function hasIgnoredSuffix(lower: string): boolean {
  for (const ext of IGNORE_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

async function readTextIfSmall(abs: string, max = 4096): Promise<string | null> {
  try {
    const fh = await fs.open(abs, "r");
    try {
      const buf = Buffer.alloc(max);
      const { bytesRead } = await fh.read(buf, 0, max, 0);
      const slice = buf.subarray(0, bytesRead);
      if (slice.includes(0)) return null; // binary sniff
      return slice.toString("utf8");
    } finally {
      await fh.close();
    }
  } catch {
    return null;
  }
}

async function collectWorkspaceMeta(root: string, dirs: Set<string>): Promise<WorkspaceMeta> {
  const meta: WorkspaceMeta = {
    packages: new Map(),
    aliases: [],
    declaredDeps: new Set(),
    declaredPython: new Set(),
    declaredGo: new Set(),
    declaredRust: new Set(),
  };

  // package.json names anywhere in the tree (workspace packages)
  let packageJsonCount = 0;
  for (const dir of dirs) {
    if (packageJsonCount > 200) break;
    if (dir.split("/").length > 8) continue;
    const pj = path.join(root, dir, "package.json");
    try {
      const raw = await fs.readFile(pj, "utf8");
      packageJsonCount++;
      const json = JSON.parse(raw) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      if (json.name) meta.packages.set(json.name, dir === "." ? "." : dir);
      // Merge every workspace's deps (monorepos declare deps per package).
      for (const dep of Object.keys({
        ...json.dependencies,
        ...json.devDependencies,
        ...json.peerDependencies,
      })) {
        meta.declaredDeps.add(dep);
      }
    } catch {
      /* unreadable or invalid package.json; skip it */
    }
  }

  // tsconfig path aliases
  for (const candidate of ["tsconfig.json", "jsconfig.json"]) {
    try {
      const raw = await fs.readFile(path.join(root, candidate), "utf8");
      const json = JSON.parse(stripJsonComments(raw)) as {
        compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
      };
      const paths = json.compilerOptions?.paths ?? {};
      const baseUrl = json.compilerOptions?.baseUrl ?? ".";
      for (const [key, values] of Object.entries(paths)) {
        const prefix = key.replace(/\*$/, "");
        const target = (values[0] ?? "").replace(/\*$/, "");
        meta.aliases.push({ from: prefix, to: path.posix.join(posix(baseUrl), target) });
      }
      break;
    } catch {
      /* no tsconfig, or unreadable; both fine */
    }
  }

  // python deps
  for (const file of ["requirements.txt", "pyproject.toml", "setup.py", "Pipfile"]) {
    try {
      const raw = await fs.readFile(path.join(root, file), "utf8");
      if (file === "requirements.txt" || file === "Pipfile") {
        for (const line of raw.split("\n")) {
          const m = line.match(/^\s*([A-Za-z0-9_.-]+)/);
          if (m && !m[1].startsWith("#")) meta.declaredPython.add(m[1].toLowerCase().replace(/[-_]/g, "-"));
        }
      } else if (file === "pyproject.toml") {
        for (const m of raw.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*(?:[=~<>!])/gm)) {
          meta.declaredPython.add(m[1].toLowerCase().replace(/[-_]/g, "-"));
        }
      }
    } catch {
      /* optional */
    }
  }

  // go deps
  try {
    const raw = await fs.readFile(path.join(root, "go.mod"), "utf8");
    const moduleLine = raw.match(/^module\s+(\S+)/m);
    if (moduleLine) meta.packages.set(moduleLine[1], ".");
    const requireBlock = raw.match(/require\s*\(([\s\S]*?)\)/);
    const add = (m: RegExpMatchArray) => meta.declaredGo.add(m[1]);
    if (requireBlock) {
      for (const m of requireBlock[1].matchAll(/^\s*(\S+)\s+v/gm)) add(m);
    }
    for (const m of raw.matchAll(/^require\s+(\S+)\s+v/gm)) add(m);
  } catch {
    /* optional */
  }

  // rust deps
  try {
    const raw = await fs.readFile(path.join(root, "Cargo.toml"), "utf8");
    const depBlock = raw.match(/(?:\[dependencies\])([\s\S]*?)(?:\n\[|$)/);
    if (depBlock) {
      for (const m of depBlock[1].matchAll(/^\s*([A-Za-z0-9_-]+)\s*=/gm)) {
        meta.declaredRust.add(m[1].toLowerCase());
      }
    }
  } catch {
    /* optional */
  }

  return meta;
}

function stripJsonComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

export async function crawl(root: string): Promise<CrawlResult> {
  const files: CrawledFile[] = [];
  const dirs = new Set<string>(["."]);
  let truncated = false;

  const walk = async (rel: string): Promise<void> => {
    if (truncated) return;
    const abs = rel === "." ? root : path.join(root, rel);
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      const name = entry.name;
      const childRel = rel === "." ? name : `${rel}/${name}`;
      const lower = name.toLowerCase();
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(lower) || lower.startsWith(".git")) continue;
        dirs.add(childRel);
        await walk(childRel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (IGNORE_FILES.has(lower) || hasIgnoredSuffix(lower)) continue;
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      let stat: import("node:fs").Stats;
      try {
        stat = await fs.stat(path.join(root, childRel));
      } catch {
        continue;
      }
      if (stat.size > MAX_BYTES) continue;
      const sniff = await readTextIfSmall(path.join(root, childRel));
      if (sniff === null) continue;
      files.push({ path: childRel, absPath: path.join(root, childRel), bytes: stat.size });
    }
  };

  await walk(".");
  files.sort((a, b) => a.path.localeCompare(b.path));
  const meta = await collectWorkspaceMeta(root, dirs);
  return { files, dirs, meta, truncated };
}

export function posix(p: string): string {
  return p.split(path.sep).join("/");
}
