// Orchestrates a full analysis run and assembles the Analysis payload.

import * as fs from "node:fs/promises";
import type { Analysis, AnalysisStats } from "../../../shared/types";
import { aiConfig, chat } from "../ai";
import type { ProgressReporter } from "../jobs";
import { createJob, failJob, finishJob, type Job, reporterFor } from "../jobs";
import { resolveSource } from "../repos";
import { loadAnalysisFor, saveAnalysisFor } from "../store";
import { narrativeSystemPrompt } from "../prompts";
import { detectIssues } from "./issues";
import { generateDocs, type DocsContext } from "./docs";
import { runPipeline } from "./pipeline";

const inflight = new Map<string, Promise<{ analysis: Analysis; cached: boolean }>>();

function sourceHint(source: string): string {
  const trimmed = source.trim();
  if (/^(https?:\/\/)?[\w.-]+\/[\w.-]+$/.test(trimmed)) return `cloning ${trimmed}…`;
  return `reading ${trimmed}…`;
}

async function aiNarrative(ctx: DocsContext): Promise<string | null> {
  if (!aiConfig().enabled) return null;
  const p = ctx.pipeline;
  const summary = [
    `Repository: ${ctx.repoName}`,
    `Stats: ${ctx.stats.files} files, ${ctx.stats.lines} lines, ${ctx.stats.clusters} modules, ${ctx.stats.internalDeps} internal deps`,
    `Languages: ${p.languages.slice(0, 6).map((l) => `${l.name} ${l.lines} lines`).join(", ")}`,
    `Layers: ${p.layers.map((l) => `${l.name}=${l.files} files`).join(", ")}`,
    `Modules: ${p.clusters.slice(0, 14).map((c) => `${c.name} (${c.role}, ${c.files} files, ${c.lines} loc, in=${c.inbound} out=${c.outbound})`).join("; ")}`,
    `Entry points: ${p.entryPoints.slice(0, 8).join(", ") || "none"}`,
    `Findings: ${ctx.issues.slice(0, 12).map((i) => `[${i.severity}] ${i.title}`).join("; ") || "none"}`,
  ].join("\n");
  return chat(narrativeSystemPrompt(), summary, 900);
}

async function runAnalysis(
  source: string,
  refresh: boolean,
  branch: string | undefined,
  ownerUserId: number,
  report: ProgressReporter,
): Promise<{ analysis: Analysis; cached: boolean }> {
  const started = Date.now();
  report.stage("fetch", sourceHint(source));
  const { root, repo } = await resolveSource(source, refresh, branch, ownerUserId);

  const pipeline = await runPipeline(root, report);

  report.stage("issues", "checking cycles, layers and dead code…", { modules: pipeline.clusters.length });
  const issues = await detectIssues(pipeline);

  // Per-file / per-module issue counts.
  const byCluster = new Map<string, number>();
  for (const issue of issues) {
    for (const f of issue.files) {
      const node = pipeline.nodeByPath.get(f);
      if (node) {
        node.issueCount++;
        byCluster.set(node.cluster, (byCluster.get(node.cluster) ?? 0) + 1);
      }
    }
  }
  for (const c of pipeline.clusters) c.issues = byCluster.get(c.id) ?? 0;

  const externalDeps = new Set<string>();
  for (const n of pipeline.nodes) for (const e of n.externalImports) externalDeps.add(e);

  const stats: AnalysisStats = {
    files: pipeline.nodes.length,
    lines: pipeline.nodes.reduce((s, n) => s + n.loc, 0),
    dirs: pipeline.dirs.size,
    clusters: pipeline.clusters.length,
    internalDeps: pipeline.edges.length,
    externalDeps: externalDeps.size,
    issues: issues.length,
    tests: pipeline.nodes.filter((n) => n.test).length,
    docs: pipeline.nodes.filter((n) => n.language === "Markdown").length,
  };

  const docsCtx: DocsContext = { pipeline, issues, repoName: repo.name, stats };
  report.stage("docs", aiConfig().enabled ? "drafting the architecture brief…" : "building module guides…", {
    issues: issues.length,
  });
  let { narrative, docs } = generateDocs(docsCtx);
  let narrativeMode: "ai" | "heuristic" = "heuristic";

  const aiText = await aiNarrative(docsCtx);
  if (aiText) {
    narrative = aiText;
    narrativeMode = "ai";
    const rebuilt = generateDocs(docsCtx);
    docs = rebuilt.docs.map((d) =>
      d.kind === "architecture"
        ? { ...d, markdown: d.markdown.replace(rebuilt.narrative, aiText) }
        : d,
    );
  }

  const analysis: Analysis = {
    repo,
    stats,
    languages: pipeline.languages,
    nodes: pipeline.nodes,
    edges: pipeline.edges,
    clusters: pipeline.clusters,
    layers: pipeline.layers,
    issues,
    docs,
    entryPoints: pipeline.entryPoints,
    cycles: pipeline.cycles,
    narrative,
    narrativeMode,
    aiEnabled: aiConfig().enabled,
    warnings: pipeline.warnings,
    timings: {
      ...pipeline.timings,
      total: Date.now() - started,
    },
  };

  try {
    saveAnalysisFor(ownerUserId, analysis);
  } catch (err) {
    // The analysis is still returned to the owner; persistence failure is loud, not silent.
    console.error("[analyze] Could not persist analysis for owner", ownerUserId, err);
  }
  return { analysis, cached: false };
}

/** Cached result for a source, if the checkout is still on disk. */
async function loadCached(
  source: string,
  ownerUserId: number,
  branch?: string,
): Promise<{ analysis: Analysis; cached: boolean } | null> {
  try {
    const { repo } = await resolveSource(source, false, branch, ownerUserId);
    const cached = loadAnalysisFor(ownerUserId, repo.id);
    if (cached?.repo.rootPath) {
      const stillThere = await fs
        .stat(cached.repo.rootPath)
        .then((s) => s.isDirectory())
        .catch(() => false);
      if (stillThere) return { analysis: cached, cached: true };
    }
  } catch {
    // fall through to the full run, which produces the real error message
  }
  return null;
}

/**
 * Start an analysis and return its job immediately; the clone and crawl run in
 * the background so the client can show real progress from the first second.
 * Repeat calls for the same source are deduplicated, and a completed analysis is
 * served from cache unless `refresh` is requested.
 *
 * Every run is owned by `ownerUserId`: the job can only be polled by its owner,
 * and the resulting analysis is stored under that owner's row.
 */
export function startAnalysis(
  source: string,
  opts: { refresh?: boolean; branch?: string; ownerUserId: number },
): Job {
  const refresh = opts.refresh === true;
  const branch = opts.branch?.trim() || undefined;
  const ownerUserId = opts.ownerUserId;
  const job = createJob(source, ownerUserId);
  const report = reporterFor(job);

  void (async () => {
    try {
      report.stage("fetch", sourceHint(source));

      if (!refresh) {
        const cached = await loadCached(source, ownerUserId, branch);
        if (cached) {
          finishJob(job, cached);
          return;
        }
      }

      const key = `${ownerUserId}::${source}::${branch ?? ""}::${refresh}`;
      const existing = inflight.get(key);
      if (existing) {
        finishJob(job, await existing);
        return;
      }

      const promise = runAnalysis(source, refresh, branch, ownerUserId, report).finally(() => inflight.delete(key));
      inflight.set(key, promise);
      finishJob(job, await promise);
    } catch (err) {
      failJob(job, err);
    }
  })();

  return job;
}
