// Resolves a source (GitHub URL, owner/repo shorthand, or local path) into a
// checkout on disk. Analysis persistence lives in `store.ts` / `db.ts`; this
// module owns only where things land on disk and what a source resolves to.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import { createWriteStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as path from "node:path";
import type { Analysis } from "../../shared/types";
import { DATA_DIR, PROJECT_ROOT, REPOS_DIR } from "./paths";
import { loadGithubToken } from "./db";
import { githubApiBase } from "./github";

export { CACHE_DIR, DATA_DIR, PROJECT_ROOT, REPOS_DIR } from "./paths";

const exec = promisify(execFile);

/**
 * Directories local-path analyses are allowed to read. The project root is
 * always included; `CODEATLAS_LOCAL_ROOTS` (path-separator delimited) adds more.
 * Without this, any signed-in user could point the crawler at any directory the
 * server process can read, which is a read-any-file primitive on a shared host.
 */
function allowedLocalRoots(): string[] {
  const extra = (process.env.CODEATLAS_LOCAL_ROOTS ?? "")
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p));
  return [PROJECT_ROOT, ...extra];
}

function isInside(root: string, target: string): boolean {
  const norm = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p);
  const r = norm(path.resolve(root));
  const t = norm(path.resolve(target));
  return t === r || t.startsWith(r + path.sep);
}

/** Pick the first existing candidate inside an allowed root, or refuse. */
function ensureAllowed(existing: string[]): string | null {
  if (existing.length === 0) return null;
  const roots = allowedLocalRoots();
  const allowed = existing.find((c) => roots.some((r) => isInside(r, c)));
  if (allowed) return allowed;
  const list = roots.map((r) => `  • ${r}`).join("\n");
  throw new Error(
    `Local path access is restricted on this server: ${existing[0]} is outside the allowed directories:\n` +
      `${list}\nThe operator can add more with the CODEATLAS_LOCAL_ROOTS environment variable.`,
  );
}

/**
 * Synchronous pre-flight used by `POST /api/analyze` so a path-escape attempt
 * fails the request outright (400) instead of opening a job that only fails
 * later. GitHub URLs and non-existent paths are untouched.
 */
export function assertLocalSourceAllowed(source: string): void {
  const trimmed = source.trim();
  if (!trimmed) return;
  const existing: string[] = [];
  for (const candidate of [
    path.resolve(process.cwd(), trimmed),
    path.resolve(PROJECT_ROOT, trimmed),
    path.resolve("/" + trimmed.replace(/^\/+/, "")),
  ]) {
    try {
      if (statSync(candidate).isDirectory()) existing.push(candidate);
    } catch {
      /* try next */
    }
  }
  ensureAllowed(existing);
}

interface ResolvedRepo {
  root: string;
  repo: Analysis["repo"];
}

interface GithubTarget {
  owner: string;
  repo: string;
  branch?: string;
}

function parseGithub(source: string): GithubTarget | null {
  const trimmed = source.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const patterns = [
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\/tree\/([^#\s]+))?$/,
    /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\/tree\/([^#\s]+))?$/,
    /^([\w.-]+)\/([\w.-]+)$/, // shorthand owner/repo
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (!m) continue;
    const [, owner, repo, branch] = m;
    if (owner === "owner" || repo === "repo") continue; // example placeholders
    if (re === patterns[2] && (owner.includes(".") && !repo.includes("."))) {
      // shorthand must not swallow things like "samples/demo.app" handled locally first
    }
    return { owner, repo, branch };
  }
  return null;
}

function hashId(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

async function gitInfo(dir: string): Promise<{ branch?: string; commit?: string }> {
  try {
    const [{ stdout: branch }, { stdout: commit }] = await Promise.all([
      exec("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"], { timeout: 10_000 }),
      exec("git", ["-C", dir, "rev-parse", "--short", "HEAD"], { timeout: 10_000 }),
    ]);
    return { branch: branch.trim(), commit: commit.trim() };
  } catch {
    return {};
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureLocal(source: string): Promise<string | null> {
  const candidates = [
    path.resolve(process.cwd(), source),
    path.resolve(PROJECT_ROOT, source),
    path.resolve("/" + source.replace(/^\/+/, "")),
  ];
  const existing: string[] = [];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) existing.push(candidate);
    } catch {
      /* try next */
    }
  }
  if (existing.length === 0) return null;
  return ensureAllowed(existing);
}

/**
 * Download a repository tarball through the GitHub API and unpack it.
 *
 * Connected accounts (those holding an OAuth token) fetch this way so the
 * credential stays in-process instead of appearing on a command line where other
 * OS users could read it, and private content is written only under the caller's
 * own checkout directory. `token` may be null (anonymous, public repos); the
 * test suite exercises the download+unpack mechanics that way.
 */
export async function fetchTarballCheckout(
  target: GithubTarget,
  token: string | null,
  dir: string,
): Promise<void> {
  const ref = target.branch ? `?ref=${encodeURIComponent(target.branch)}` : "";
  const url = `${githubApiBase()}/repos/${target.owner}/${target.repo}/tarball${ref}`;
  const headers: Record<string, string> = {
    "User-Agent": "CodeAtlas",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response; // DOM fetch response; this module never imports Express types
  try {
    res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(600_000) });
  } catch (err) {
    throw new Error(
      `Could not download ${target.owner}/${target.repo}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok || !res.body) {
    const hint =
      res.status === 401 || res.status === 403
        ? "GitHub rejected the request. Reconnect your GitHub account from the Connect view."
        : res.status === 404
          ? "Repository not found. Check the name, or reconnect GitHub if the repository is private."
          : `GitHub returned HTTP ${res.status}.`;
    throw new Error(`Could not download ${target.owner}/${target.repo}: ${hint}`);
  }

  const archive = path.join(REPOS_DIR, `${path.basename(dir)}.tar.gz`);
  try {
    await fs.mkdir(REPOS_DIR, { recursive: true });
    await pipeline(
      Readable.fromWeb(res.body as unknown as import("node:stream/web").ReadableStream),
      createWriteStream(archive),
    );
    await fs.mkdir(dir, { recursive: true });
    // GNU tar parses `D:\\…` archive paths as `host:file` remote specs, so the
    // archive is passed as a name relative to REPOS_DIR and the target uses
    // forward slashes; both GNU tar and bsdtar accept that.
    await exec(
      "tar",
      [
        "-xzf",
        path.basename(archive),
        "-C",
        path.resolve(dir).split(path.sep).join("/"),
        "--strip-components=1",
      ],
      { cwd: REPOS_DIR, timeout: 600_000 },
    );
    await fs.writeFile(path.join(dir, ".codeatlas-checkout"), new Date().toISOString(), "utf8");
  } catch (err) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not unpack ${target.owner}/${target.repo}: ${msg.slice(0, 300)}`);
  } finally {
    await fs.rm(archive, { force: true }).catch(() => undefined);
  }
}

async function cloneGithub(target: GithubTarget, refresh: boolean, ownerUserId?: number): Promise<string> {
  await fs.mkdir(REPOS_DIR, { recursive: true });
  const id = `gh-${hashId(`${target.owner}/${target.repo}@${target.branch ?? "default"}`)}`;

  // Connected accounts (token present) fetch through the API into a per-user
  // checkout: private content never lands in a path another account can reach.
  // Anonymous callers use the shared git clone below: public repositories only.
  const token =
    ownerUserId != null ? ((await loadGithubToken(ownerUserId))?.token ?? null) : null;
  const dir = token ? path.join(REPOS_DIR, `${id}-u${ownerUserId}`) : path.join(REPOS_DIR, id);

  const marker = path.join(dir, ".codeatlas-checkout");
  const cloned = token ? await pathExists(marker) : await pathExists(path.join(dir, ".git"));
  if (cloned && !refresh) return dir;
  if (cloned && refresh) {
    await fs.rm(dir, { recursive: true, force: true });
  }

  if (token) {
    await fetchTarballCheckout(target, token, dir);
    return dir;
  }

  const url = `https://github.com/${target.owner}/${target.repo}.git`;
  // `core.longpaths` is passed per-invocation rather than set globally: Windows
  // otherwise fails the checkout on repos with deep paths (next.js has 20+ level
  // test fixtures) and git reports "clone succeeded, but checkout failed".
  const args = ["-c", "core.longpaths=true", "clone", "--depth", "1", "--single-branch"];
  if (target.branch) args.push("--branch", target.branch);
  args.push(url, dir);
  try {
    await exec("git", args, { timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
  } catch (err) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    const msg = err instanceof Error ? err.message : String(err);
    const hint = /could not resolve|unable to access|network/i.test(msg)
      ? "Check your network connection, or paste a local repository path instead."
      : /not found|repository not found/i.test(msg)
        ? "Repository not found. Check the URL and whether the repository is public."
        : /checkout failed/i.test(msg)
          ? "Git could not write every file. The repository has paths that are too long for Windows; try a local clone instead."
          : msg.slice(0, 300);
    throw new Error(`Could not clone ${url}: ${hint}`);
  }
  return dir;
}

/**
 * Resolve any supported source into a local directory + repo metadata.
 * Local paths win over the owner/repo shorthand so `samples/demo-app` works.
 * `ownerUserId` (when given) lets a connected GitHub account fetch private
 * repositories through its stored token.
 */
export async function resolveSource(
  source: string,
  refresh = false,
  branchOverride?: string,
  ownerUserId?: number,
): Promise<ResolvedRepo> {
  const trimmed = source.trim();
  if (!trimmed) throw new Error("Empty source. Paste a GitHub URL, owner/repo, or a local path.");

  const local = await ensureLocal(trimmed);
  if (local) {
    const root = local;
    const info = await gitInfo(root);
    return {
      root,
      repo: {
        id: `local-${hashId(path.resolve(root))}`,
        source: trimmed,
        kind: "local",
        name: path.basename(root),
        branch: info.branch,
        commit: info.commit,
        analyzedAt: new Date().toISOString(),
        rootPath: root,
      },
    };
  }

  const gh = parseGithub(trimmed);
  if (gh) {
    if (branchOverride?.trim()) gh.branch = branchOverride.trim();
    const root = await cloneGithub(gh, refresh, ownerUserId);
    const info = await gitInfo(root);
    return {
      root,
      repo: {
        id: `gh-${hashId(`${gh.owner}/${gh.repo}@${gh.branch ?? "default"}`)}`,
        source: `https://github.com/${gh.owner}/${gh.repo}`,
        kind: "github",
        name: gh.repo,
        owner: gh.owner,
        branch: gh.branch ?? info.branch,
        commit: info.commit,
        analyzedAt: new Date().toISOString(),
        rootPath: root,
      },
    };
  }

  throw new Error(
    `Could not resolve "${trimmed}". Supported inputs: a GitHub URL (https://github.com/owner/repo), the owner/repo shorthand, or a path to a local checkout.`,
  );
}

