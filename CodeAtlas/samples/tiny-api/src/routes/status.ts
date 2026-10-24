// Status handlers — thin layer between HTTP and the store.

import type { IncomingMessage, ServerResponse } from "node:http";
import { allSummaries, record, summary } from "../lib/store";
import { timestamp } from "../lib/format";
import { sendJson } from "../lib/http";

export function handleStatus(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, { at: timestamp(new Date()), services: allSummaries() });
}

export function handleStatusFor(req: IncomingMessage, res: ServerResponse): void {
  const name = (req.url ?? "").split("/").pop() ?? "";
  const found = summary(name);
  if (!found) {
    sendJson(res, 404, { error: `unknown service: ${name}` });
    return;
  }
  sendJson(res, 200, found);
}

/** Internal helper used by the poller to ingest an external probe. */
export function ingestProbe(name: string, ok: boolean, latencyMs: number): void {
  record(name, ok, latencyMs);
}
