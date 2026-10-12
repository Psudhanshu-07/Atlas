// Owner-scoped access to workspace data.
//
// Every function takes an explicit `ownerUserId` and passes it to `db.ts`, which
// binds it in the SQL. There is no way to read a workspace row without naming
// its owner, and `(owner_user_id, analysis_id)` is the primary key, so the same
// repository analysed by two users stays two independent records.

import type { Analysis, AnalysisSummary, DashboardData, LinkedRepo } from "../shared/types";
import * as db from "./db";

/** Persist a completed analysis (and its connected-repo record) for one user. */
export function saveAnalysisFor(ownerUserId: number, analysis: Analysis): void {
  db.saveAnalysisRow(ownerUserId, analysis);
  db.upsertLinkedRepo(ownerUserId, analysis.repo);
}

export function loadAnalysisFor(ownerUserId: number, analysisId: string): Analysis | null {
  return db.loadAnalysisRow(ownerUserId, analysisId);
}

export function deleteAnalysisFor(ownerUserId: number, analysisId: string): boolean {
  return db.deleteAnalysisRow(ownerUserId, analysisId);
}

export function listAnalysesFor(ownerUserId: number): AnalysisSummary[] {
  return db.listAnalysisRows(ownerUserId);
}

export function linkedReposFor(ownerUserId: number): LinkedRepo[] {
  return db.listLinkedRepos(ownerUserId);
}

/** Everything the dashboard renders, computed only from this user's rows. */
export function dashboardFor(ownerUserId: number): DashboardData {
  return {
    stats: db.workspaceStats(ownerUserId),
    recent: db.listAnalysisRows(ownerUserId).slice(0, 6),
    repos: db.listLinkedRepos(ownerUserId),
  };
}

/** Per-user preferences (theme survives across sessions). */
export function themeFor(ownerUserId: number): "dark" | "light" {
  return db.getTheme(ownerUserId);
}

export function setThemeFor(ownerUserId: number, theme: "dark" | "light"): void {
  db.setTheme(ownerUserId, theme);
}
