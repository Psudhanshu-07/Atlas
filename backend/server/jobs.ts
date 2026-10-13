// In-flight analysis progress.
//
// Analyses run in the background while the client polls `GET /api/jobs/:id`. The
// stage vocabulary lives in `shared/progress.ts` so the engine and the UI agree
// on what "working" looks like; this module owns only the runtime state.

import type { Analysis } from "../../shared/types";
import { plural } from "../../shared/format";
import { STAGES, type JobCounters, type JobSnapshot, type StageId, type StageState } from "../../shared/progress";

export type Job = JobSnapshot;

const jobs = new Map<string, Job>();
/** Job id → owning user id. Jobs are only ever handed back to their owner. */
const jobOwners = new Map<string, number>();
const MAX_JOBS = 50;

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
}

export function failJob(job: Job, err: unknown): void {
  const active = job.stages.find((s) => s.state === "active");
  if (active) active.state = "done";
  job.status = "error";
  job.error = err instanceof Error ? err.message : String(err);
  job.message = "Analysis failed.";
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

/**
 * Fetch a job only when it belongs to `ownerUserId`. An id from another account
 * (guessed, leaked or replayed) reads as "not found".
 */
export function getOwnedJob(ownerUserId: number, id: string): Job | undefined {
  if (jobOwners.get(id) !== ownerUserId) return undefined;
  return jobs.get(id);
}