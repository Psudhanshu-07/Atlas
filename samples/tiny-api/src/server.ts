// HTTP server factory — wires routes to handlers. No framework, just node:http.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { handleStatus, handleStatusFor } from "./routes/status";
import { sendJson } from "./lib/http";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const routes: Array<{ method: string; pattern: RegExp; handler: Handler }> = [
  { method: "GET", pattern: /^\/status$/, handler: handleStatus },
  { method: "GET", pattern: /^\/status\/([\w-]+)$/, handler: handleStatusFor },
];

export function createPulseServer() {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = routes.find((r) => r.method === (req.method ?? "GET") && r.pattern.test(url.pathname));
    if (!route) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    route.handler(req, res);
  });
}
