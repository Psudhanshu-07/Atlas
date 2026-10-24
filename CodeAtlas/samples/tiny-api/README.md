# Pulse

Pulse is a small, dependency-free uptime service. It records health checks for
services you care about and answers two questions over HTTP:

- `GET /status` — every tracked service and whether it is currently up
- `GET /status/:name` — one service, with its recent check history

## How it runs

`src/index.ts` boots the HTTP server from `src/server.ts`, which dispatches to
the handlers in `src/routes/`. State lives in memory in `src/lib/store.ts`;
all formatting helpers are pure functions in `src/lib/format.ts`.

```bash
npm start        # listens on :8080
npm test         # node:test suite for the store
```

## Why it exists

Pulse is a deliberately small CodeAtlas sample: one entry point, a routing
layer, a store and a pure utility module — enough to show clustering, layer
detection and a clean dependency graph without any framework.
