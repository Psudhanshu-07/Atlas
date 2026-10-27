// Per-user analyses and connected repositories. `analyses` is keyed by
// `(owner_user_id, analysis_id)`: the same source analysed by two users is two
// independent rows, and every accessor binds an explicit owner id. Rows
// imported from the pre-auth cache keep owner_user_id 0 (no account can ever
// own id 0), so `WHERE owner_user_id = owner` never matches — they fail closed.

import type { Analysis, AnalysisSummary, LinkedRepo, RepoInfo } from "../../../shared/types";
import * as fs from "node:fs";
import * as path from "node:path";
import { CACHE_DIR } from "../paths";
import type { DbDriver } from "./driver";
import { registerBootTask, row, rows, run, count } from "./core";

const ID_PATTERN = /^[\w.-]+$/;

function summaryOf(a: Analysis): Omit<AnalysisSummary, "id" | "analyzedAt"> {
  return {
    source: a.repo.source,
    name: a.repo.name,
    kind: a.repo.kind,
    files: a.stats.files,
    lines: a.stats.lines,
    issues: a.stats.issues,
    language: a.languages?.find((l: { name: string }) => l.name !== "Other")?.name,
    clusters: a.stats.clusters,
  };
}

const ANALYSIS_COLUMNS =
  "owner_user_id, analysis_id, source, name, kind, branch, analyzed_at, files, lines, issues, language, clusters, payload, updated_at";

/**
 * Store an analysis under an owner. Re-analysing the same source upserts the
 * owner's row, and two users analysing the same repository keep their own copies.
 */
export async function saveAnalysisRow(ownerUserId: number, analysis: Analysis): Promise<void> {
  const s = summaryOf(analysis);
  await run(
    `INSERT INTO analyses (${ANALYSIS_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (owner_user_id, analysis_id) DO UPDATE SET
       source = excluded.source, name = excluded.name, kind = excluded.kind, branch = excluded.branch,
       analyzed_at = excluded.analyzed_at, files = excluded.files, lines = excluded.lines,
       issues = excluded.issues, language = excluded.language, clusters = excluded.clusters,
       payload = excluded.payload, updated_at = excluded.updated_at`,
    ownerUserId,
    analysis.repo.id,
    s.source,
    s.name,
    s.kind,
    analysis.repo.branch ?? null,
    analysis.repo.analyzedAt,
    s.files,
    s.lines,
    s.issues,
    s.language ?? null,
    s.clusters ?? null,
    JSON.stringify(analysis),
    new Date().toISOString(),
  );
}

export async function loadAnalysisRow(ownerUserId: number, analysisId: string): Promise<Analysis | null> {
  if (!ID_PATTERN.test(analysisId)) return null;
  const found = await row<{ payload: string }>(
    "SELECT payload FROM analyses WHERE owner_user_id = ? AND analysis_id = ?",
    ownerUserId,
    analysisId,
  );
  if (!found) return null;
  try {
    const parsed = JSON.parse(found.payload) as Analysis;
    return parsed?.repo?.id ? parsed : null;
  } catch {
    return null;
  }
}

export async function deleteAnalysisRow(ownerUserId: number, analysisId: string): Promise<boolean> {
  if (!ID_PATTERN.test(analysisId)) return false;
  const result = await run(
    "DELETE FROM analyses WHERE owner_user_id = ? AND analysis_id = ?",
    ownerUserId,
    analysisId,
  );
  return result.changes > 0;
}

export async function listAnalysisRows(ownerUserId: number): Promise<AnalysisSummary[]> {
  const found = await rows<{
    analysis_id: string;
    source: string;
    name: string;
    kind: string;
    analyzed_at: string;
    files: number;
    lines: number;
    issues: number;
    language: string | null;
    clusters: number | null;
  }>(
    `SELECT analysis_id, source, name, kind, analyzed_at, files, lines, issues, language, clusters
       FROM analyses WHERE owner_user_id = ? ORDER BY analyzed_at DESC`,
    ownerUserId,
  );
  return found.map((r) => ({
    id: r.analysis_id,
    source: r.source,
    name: r.name,
    kind: r.kind === "github" ? "github" : "local",
    analyzedAt: r.analyzed_at,
    files: Number(r.files),
    lines: Number(r.lines),
    issues: Number(r.issues),
    language: r.language ?? undefined,
    clusters: r.clusters != null ? Number(r.clusters) : undefined,
  }));
}


/** Aggregates over *this owner's* rows only (owner-0 legacy rows never match). */
export async function workspaceStats(ownerUserId: number): Promise<{
  repositories: number;
  analyses: number;
  files: number;
  lines: number;
  findings: number;
}> {
  const repoCount = await count("SELECT COUNT(*) AS n FROM linked_repos WHERE owner_user_id = ?", ownerUserId);
  const totals = await row<{ n: number; files: number; lines: number; issues: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(files), 0) AS files, COALESCE(SUM(lines), 0) AS lines,
            COALESCE(SUM(issues), 0) AS issues
       FROM analyses WHERE owner_user_id = ?`,
    ownerUserId,
  );
  return {
    repositories: repoCount,
    analyses: Number(totals?.n ?? 0),
    files: Number(totals?.files ?? 0),
    lines: Number(totals?.lines ?? 0),
    findings: Number(totals?.issues ?? 0),
  };
}

/* ----------------------------------------------------------- linked repos */

export async function upsertLinkedRepo(ownerUserId: number, repo: RepoInfo): Promise<void> {
  await run(
    `INSERT INTO linked_repos (owner_user_id, source, name, kind, repo_owner, branch, last_analyzed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (owner_user_id, source) DO UPDATE SET
       name = excluded.name, kind = excluded.kind, repo_owner = excluded.repo_owner,
       branch = excluded.branch, last_analyzed_at = excluded.last_analyzed_at`,
    ownerUserId,
    repo.source,
    repo.name,
    repo.kind,
    repo.owner ?? null,
    repo.branch ?? null,
    repo.analyzedAt,
    new Date().toISOString(),
  );
}

export async function listLinkedRepos(ownerUserId: number): Promise<LinkedRepo[]> {
  const found = await rows<{
    id: number;
    source: string;
    name: string;
    kind: string;
    repo_owner: string | null;
    branch: string | null;
    last_analyzed_at: string | null;
    created_at: string;
  }>(
    "SELECT * FROM linked_repos WHERE owner_user_id = ? ORDER BY COALESCE(last_analyzed_at, created_at) DESC",
    ownerUserId,
  );
  return found.map((r) => ({
    id: Number(r.id),
    source: r.source,
    name: r.name,
    kind: r.kind === "github" ? "github" : "local",
    owner: r.repo_owner ?? undefined,
    branch: r.branch ?? undefined,
    lastAnalyzedAt: r.last_analyzed_at,
    createdAt: r.created_at,
  }));
}

/* ------------------------------------------------- legacy cache migration */

/**
 * One-time import of `.codeatlas/cache/*.json`: analyses that predate
 * accounts (registered as a boot task).
 */
async function importLegacyCache(db: DbDriver): Promise<void> {
  let files: string[];
  try {
    files = fs.readdirSync(CACHE_DIR);
  } catch {
    return; // no legacy cache on this installation
  }
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), "utf8")) as Analysis;
      if (!parsed?.repo?.id || !parsed.stats) continue;
      const already = (await db.all<Record<string, unknown>>(
        "SELECT 1 AS ok FROM analyses WHERE analysis_id = ? AND owner_user_id = 0",
        [parsed.repo.id],
      ))[0];
      if (already) continue;
      const s = summaryOf(parsed);
      await db.run(
        `INSERT INTO analyses (${ANALYSIS_COLUMNS})
         VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parsed.repo.id,
          s.source,
          s.name,
          s.kind,
          parsed.repo.branch ?? null,
          parsed.repo.analyzedAt,
          s.files,
          s.lines,
          s.issues,
          s.language ?? null,
          s.clusters ?? null,
          JSON.stringify(parsed),
          new Date().toISOString(),
        ],
      );
    } catch (err) {
      console.warn(`[db] Skipped unreadable legacy cache entry ${file}:`, err instanceof Error ? err.message : err);
    }
  }
}

registerBootTask(importLegacyCache);