// In-flight analysis progress.
//
// Analyses run in the background while the client polls `GET /api/jobs/:id`. The
// stage vocabulary lives in `shared/progress.ts` so the engine and the UI agree
// on what "working" looks like; this module owns only the runtime state.

import type { Analysis } from "../../shared/types";
import { plural } from "../../shared/format";
import { STAGES, type JobCounters, type JobSnapshot, type StageId, type StageState } from "../../shared/progress";
import { recordTelemetry } from "./db/telemetry";

export type Job = JobSnapshot;

const jobs = new Map<string, Job>();
/** Job id → owning user id. Jobs are only ever handed back to their owner. */
const jobOwners = new Map<string, number>();
const MAX_JOBS = 50;

// Wall-clock cap on any single analysis. A well-behaved repository finishes
// well inside it; hitting it means the pipeline crashed or hung without
// reaching failJob, and the client should get an actionable answer instead of
// "running" forever. Tick-tock starts at job creation.
const JOB_TIMEOUT_MS = 15 * 60_000;

function jobStartedAt(id: string): number {
  // Job ids embed Date.now().toString(36) as their second segment.
  const ms = parseInt(id.split("-")[1] ?? "", 36);
  return Number.isFinite(ms) ? ms : Date.now();
}

/** What the pipeline hands to the engine so it can report progress. */
export interface ProgressReporter {
  stage(id: StageId, detail?: string, counters?: Partial<JobCounters>): void;
}

function blankCounters(): JobCounters {
  return { files: 0, loc: 0, modules: 0, deps: 0, issues: 0, docs: 0 };
}

export function createJob(source: string, ownerUserId: number): Job {
  const job: Job = {
    id: `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    status: "running",
    progress: 0,
    message: "Starting analysis…",
    stages: STAGES.map((s): StageState => ({ ...s, state: "pending" })),
    counters: blankCounters(),
  };
  jobs.set(job.id, job);
  jobOwners.set(job.id, ownerUserId);

  // Bound memory: drop the oldest settled jobs. Map iteration is insertion-ordered.
  if (jobs.size > MAX_JOBS) {
    const stale = [...jobs.values()].filter((j) => j.status !== "running").slice(0, jobs.size - MAX_JOBS);
    for (const j of stale) {
      jobs.delete(j.id);
      jobOwners.delete(j.id);
    }
  }
  return job;
}

/** Fraction of the active stage complete, when its detail reads "n / total". */
function partialFrom(detail?: string): number {
  const m = detail?.match(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)/);
  if (!m) return 0;
  const total = Number(m[2].replace(/,/g, ""));
  if (!total) return 0;
  return Math.min(0.95, Number(m[1].replace(/,/g, "")) / total);
}

export function reporterFor(job: Job): ProgressReporter {
  return {
    stage(id, detail, counters) {
      const index = STAGES.findIndex((s) => s.id === id);
      if (index < 0) return;

      job.stages.forEach((s, i) => {
        if (i < index) s.state = "done";
        else if (i === index) {
          s.state = "active";
          if (detail) s.detail = detail;
        } else if (s.state !== "done") {
          s.state = "pending";
        }
      });

      if (counters) Object.assign(job.counters, counters);

      const done = job.stages.filter((s) => s.state === "done").length;
      const active = job.stages[index];
      job.progress = Math.min(0.99, (done + partialFrom(active.detail)) / job.stages.length);
      job.message = active.working + (active.detail ? `: ${active.detail}` : "");
    },
  };
}

export function finishJob(job: Job, result: { analysis: Analysis; cached: boolean }): void {
  for (const s of job.stages) s.state = "done";
  job.status = "done";
  job.progress = 1;
  job.result = result;
  const { files, clusters } = result.analysis.stats;
  job.counters = {
    files,
    loc: result.analysis.stats.lines,
    modules: clusters,
    deps: result.analysis.stats.internalDeps,
    issues: result.analysis.issues.length,
    docs: result.analysis.docs.length,
  };
  job.message = `Mapped ${plural(files, "file")} across ${plural(clusters, "module")}.`;
  // One counter row per settled analysis; a DB failure must never fail a job.
  void recordTelemetry("analysis_completed").catch(() => {});
}

export function failJob(job: Job, err: unknown): void {
  if (job.status === "error") return; // the stale-job reaper and the pipeline can both call this; record once
  const active = job.stages.find((s) => s.state === "active");
  if (active) active.state = "done";
  job.status = "error";
  job.error = err instanceof Error ? err.message : String(err);
  job.message = "Analysis failed.";
  void recordTelemetry("analysis_failed").catch(() => {});
}

/**
 * Fail any still-"running" job that has exceeded the wall-clock cap. Called on
 * every job read so the timeout applies even though nothing else ticks in the
 * background (serverless-style behavior — no daemon needed).
 * Failed jobs stay in the map as normal settled entries and age out like any
 * other job, so the owner sees the error rather than an id that vanished.
 */
export function reapExpiredJobs(): void {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (job.status === "running" && now - jobStartedAt(job.id) > JOB_TIMEOUT_MS) {
      failJob(job, new Error(`Analysis exceeded the ${Math.round(JOB_TIMEOUT_MS / 60_000)}-minute limit and was stopped. Please try it again.`));
    }
  }
}

/**
 * Fetch a job only when it belongs to `ownerUserId`. An id from another account
 * (guessed, leaked or replayed) reads as "not found".
 */
export function getOwnedJob(ownerUserId: number, id: string): Job | undefined {
  if (jobOwners.get(id) !== ownerUserId) return undefined;
  reapExpiredJobs();
  return jobs.get(id);
}

/** How many analyses are still running in this process, for /api/ops/summary. */
export function runningJobCount(): number {
  reapExpiredJobs();
  let n = 0;
  for (const job of jobs.values()) if (job.status === "running") n += 1;
  return n;
}