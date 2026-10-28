// Product telemetry: coarse, privacy-conscious event counters. A row is just
// (event, timestamp) — no user id, no IP, no payload — so the numbers answer
// "what did people reach and where do they drop off" without collecting
// personal data. Events are allowlisted; anything else refuses to write.

import { count, run, rows } from "./core";

/** Whole-table row count, so the ops summary can note when pruning is due. */
export async function telemetryTotal(): Promise<number> {
  return count("SELECT COUNT(*) FROM telemetry");
}

/** Every event the server or client may report. Keep this list small and
 *  meaningful; add an event only when someone will act on the number. */
export const TELEMETRY_EVENTS = [
  "account_created",      // successful registration (server-side)
  "analysis_started",     // POST /api/analyze accepted (server-side)
  "analysis_completed",   // analysis pipeline finished with a result (server-side)
  "analysis_failed",      // analysis pipeline errored (server-side)
  "ai_message",           // grounded AI answer generated (server-side)
  "help_opened",          // user opened the in-app Help (client)
  "onboarding_dismissed", // user closed the setup checklist (client)
] as const;

export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];

const SSOT_EVENT = new Set<string>(TELEMETRY_EVENTS);

/** Records one event occurrence. Unknown names are ignored rather than
 *  rejected with an error, so a stale client cannot spam errors into logs. */
export async function recordTelemetry(name: string): Promise<void> {
  if (!SSOT_EVENT.has(name)) return;
  await run("INSERT INTO telemetry (event, created_at) VALUES (?, ?)", name, new Date().toISOString());
}

/** Aggregate counts per event. Counting, not inspecting: nothing else is in
 *  the table by design. Last-7-days uses a plain ISO text comparison, which is
 *  exact for timestamps written by `Date.toISOString()`. */
export async function telemetryCounts(): Promise<Array<{ event: string; total: number; last7days: number }>> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const all = await rows<{ event: string; total: string; last7days: string }>(
    `SELECT event,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE created_at >= ?) AS last7days
       FROM telemetry
      GROUP BY event
      ORDER BY total DESC`,
    weekAgo,
  );
  return all.map((r) => ({ event: r.event, total: Number(r.total), last7days: Number(r.last7days) }));
}
