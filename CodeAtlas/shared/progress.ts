// The analysis-progress contract, shared by the engine and the UI.
//
// The server owns job state; this file owns the *shape* both sides agree on,
// so the client never has to import from `server/`.

import type { Analysis } from "./types";

export type StageId = "fetch" | "crawl" | "parse" | "resolve" | "issues" | "docs";

export interface StageSpec {
  id: StageId;
  label: string;
  /** Shown while this stage is the active one. */
  working: string;
}

/** The canonical run order. Both sides render from this list. */
export const STAGES: StageSpec[] = [
  { id: "fetch", label: "Fetching repository", working: "Getting the code" },
  { id: "crawl", label: "Crawling files", working: "Walking the file tree" },
  { id: "parse", label: "Parsing source", working: "Reading symbols and imports" },
  { id: "resolve", label: "Resolving dependencies", working: "Linking imports to files" },
  { id: "issues", label: "Checking architecture", working: "Running 12 structural checks" },
  { id: "docs", label: "Writing documentation", working: "Drafting the architecture brief" },
];

export interface StageState extends StageSpec {
  state: "pending" | "active" | "done";
  detail?: string;
}

export interface JobCounters {
  files: number;
  loc: number;
  modules: number;
  deps: number;
  issues: number;
  docs: number;
}

export type JobStatus = "running" | "done" | "error";

/** The snapshot served by `GET /api/jobs/:id`. */
export interface JobSnapshot {
  id: string;
  source: string;
  status: JobStatus;
  /** 0..1 across the whole run, weighted by stage. */
  progress: number;
  message: string;
  stages: StageState[];
  counters: JobCounters;
  error?: string;
  result?: { analysis: Analysis; cached: boolean };
}