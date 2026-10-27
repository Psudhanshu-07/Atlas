// Owner-scoped access to workspace data.
//
// Every function takes an explicit `ownerUserId` and passes it to `db.ts`, which
// binds it in the SQL. There is no way to read a workspace row without naming
// its owner, and `(owner_user_id, analysis_id)` is the stored key, so the same
// repository analysed by two users stays two independent records.

import type { Analysis, AnalysisSummary, DashboardData, LinkedRepo } from "../../shared/types";
import * as db from "./db";

/** Persist a completed analysis (and its connected-repo record) for one user. */
export async function saveAnalysisFor(ownerUserId: number, analysis: Analysis): Promise<void> {
  await db.saveAnalysisRow(ownerUserId, analysis);
  await db.upsertLinkedRepo(ownerUserId, analysis.repo);
}

export async function loadAnalysisFor(ownerUserId: number, analysisId: string): Promise<Analysis | null> {
  return db.loadAnalysisRow(ownerUserId, analysisId);
}

export async function deleteAnalysisFor(ownerUserId: number, analysisId: string): Promise<boolean> {
  return db.deleteAnalysisRow(ownerUserId, analysisId);
}

export async function listAnalysesFor(ownerUserId: number): Promise<AnalysisSummary[]> {
  return db.listAnalysisRows(ownerUserId);
}


/** Everything the dashboard renders, computed only from this user's rows. */
export async function dashboardFor(ownerUserId: number): Promise<DashboardData> {
  const [stats, recent, repos] = await Promise.all([
    db.workspaceStats(ownerUserId),
    db.listAnalysisRows(ownerUserId),
    db.listLinkedRepos(ownerUserId),
  ]);
  return { stats, recent: recent.slice(0, 6), repos };
}

/** Per-user preferences (theme survives across sessions). */
export async function themeFor(ownerUserId: number): Promise<"dark" | "light"> {
  return db.getTheme(ownerUserId);
}

export async function setThemeFor(ownerUserId: number, theme: "dark" | "light"): Promise<void> {
  await db.setTheme(ownerUserId, theme);
}
