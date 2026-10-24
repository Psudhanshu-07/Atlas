// Shared HTTP helper — kept out of the route/server cycle.

import type { ServerResponse } from "node:http";

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}
