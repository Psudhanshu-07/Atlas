// CodeAtlas API server — authentication + per-user analysis endpoints, and
// static hosting of the web client.
//
// Route policy (the server is the only place access control exists):
//   • public     — /api/health, /api/auth/providers, the auth flows themselves
//   • user       — everything under /api/analyses, /api/jobs, /api/analyze,
//                  /api/dashboard, /api/preferences: behind `requireAuth`, and
//                  every data access binds `req.user.id` (never a client id)
//   • admin      — global configuration writes (AI key, crawler rules) also
//                  need `requireAdmin`; the first account created is the admin
//
// A client-supplied analysis or job id is therefore useless across accounts:
// the composite primary key `(owner_user_id, analysis_id)` cannot return
// another user's row even if a handler tried.

import express from "express";
import * as fs from "node:fs";
import * as path from "node:path";
import { aiConfig, loadSettings, saveSettings } from "./ai";
import { startAnalysis } from "./analyze/index";
import { getOwnedJob } from "./jobs";
import { buildFileDetail } from "./analyze/explain";
import { askHandler, registerChatRoutes } from "./chat";
import { registerAuthRoutes, requireAdmin, requireAuth } from "./auth";
import { assertLocalSourceAllowed } from "./repos";
import { dashboardFor, deleteAnalysisFor, listAnalysesFor, loadAnalysisFor, setThemeFor, themeFor } from "./store";
import { PROJECT_ROOT } from "./paths";
import type { ApiError } from "../../shared/types";

const app = express();

// Behind Render's reverse proxy (and any other TLS-terminating host) the app
// must trust X-Forwarded-Proto, or cookie policies and redirect URIs read as
// plain HTTP and break session security on the first real request.
app.set("trust proxy", 1);

// Split deployments: when CODEATLAS_FRONTEND_URL points the web client at this
// API from a different origin (for example Vercel serving the SPA against a
// Render service), calls are cross-origin and cookies need explicit consent.
// Same-origin deployments (the default) need none of this.
const frontendUrl = process.env.CODEATLAS_FRONTEND_URL?.trim().replace(/\/$/, "");
const ALLOW_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
if (frontendUrl) {
  const allowed = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const origin = String(req.headers.origin ?? "");
    // Only a named foreign origin is refused. Requests without an Origin header
    // are not CORS-monitored at all — top-level navigations (the OAuth callback
    // redirect) and non-browser clients — so passing them through keeps those
    // flows working without opening the API to web pages on other origins.
    if (origin && origin !== frontendUrl) {
      // Foreign origins read as "no API here" rather than a CORS listing.
      res.status(403).json({ error: "Origin not allowed." } satisfies ApiError);
      return;
    }
    // Preflight must be answered for every nested /api route, not just /api
    // itself: a browser blocks the real request (e.g. POST /api/auth/login)
    // the moment its OPTIONS probe 404s, surfacing as "Cannot reach the API".
    if (req.method === "OPTIONS" && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", ALLOW_METHODS);
      res.setHeader("Access-Control-Max-Age", "600");
      res.sendStatus(204);
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
    next();
  };
  app.use("/api", allowed);
}

// Baseline hardening — cheap, and they do not interfere with the SPA.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  next();
});
app.use(express.json({ limit: "2mb" }));

// Uploaded profile photos live outside `dist`/`public`; serve them straight from
// the data directory. No auth: the served URL is a server-generated random name.
// No `fallthrough:false`: a miss just falls through to the SPA/error fallbacks.
app.use(
  "/avatars",
  express.static(path.join(PROJECT_ROOT, ".codeatlas", "avatars"), {
    maxAge: "30d",
    immutable: true,
  }),
);

function fail(res: express.Response, status: number, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  res.status(status).json({ error: message } satisfies ApiError);
}

function maskKey(key?: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

/* ------------------------------------------------------------------- auth */

registerAuthRoutes(app);

/* ----------------------------------------------------------------- health */

app.get("/api/health", (_req, res) => {
  const cfg = aiConfig();
  res.json({ ok: true, aiEnabled: cfg.enabled, model: cfg.model, provider: cfg.provider });
});

/* --------------------------------------------------- global configuration */

app.get("/api/config", requireAuth, (_req, res) => {
  const s = loadSettings();
  res.json({
    aiEnabled: s.aiEnabled,
    provider: s.provider,
    apiKey: maskKey(s.apiKey),
    hasKey: Boolean(s.apiKey && s.apiKey.length > 0),
    baseUrl: s.baseUrl,
    model: s.model,
    ignorePatterns: s.ignorePatterns,
    maxDepth: s.maxDepth,
  });
});

/** Global config (AI key, crawler rules) is admin-writable only. */
app.post("/api/config", requireAuth, requireAdmin, (req, res) => {
  try {
    const body = req.body || {};
    const updated = saveSettings({
      provider: body.provider,
      apiKey: body.apiKey !== undefined && body.apiKey !== maskKey(loadSettings().apiKey) ? body.apiKey : undefined,
      baseUrl: body.baseUrl,
      model: body.model,
      ignorePatterns: body.ignorePatterns,
      maxDepth: typeof body.maxDepth === "number" ? body.maxDepth : undefined,
    });
    res.json({
      ok: true,
      aiEnabled: updated.aiEnabled,
      provider: updated.provider,
      apiKey: maskKey(updated.apiKey),
      hasKey: Boolean(updated.apiKey && updated.apiKey.length > 0),
      baseUrl: updated.baseUrl,
      model: updated.model,
      ignorePatterns: updated.ignorePatterns,
      maxDepth: updated.maxDepth,
    });
  } catch (err) {
    fail(res, 500, err);
  }
});

/* --------------------------------------------------------------- analysis */

app.post("/api/analyze", requireAuth, (req, res) => {
  const source = typeof req.body?.source === "string" ? req.body.source.trim() : "";
  if (!source) {
    res.status(400).json({ error: "Provide a repository: a GitHub URL, owner/repo, or local path." } satisfies ApiError);
    return;
  }
  const refresh = req.body?.refresh === true;
  const branch = typeof req.body?.branch === "string" ? req.body.branch : undefined;
  try {
    // Deterministic refusals (path escape) fail the request before a job opens.
    assertLocalSourceAllowed(source);
    const job = startAnalysis(source, { refresh, branch, ownerUserId: req.user!.id });
    res.status(202).json({ jobId: job.id, source: job.source });
  } catch (err) {
    fail(res, 400, err);
  }
});

/** Polled by the client while an analysis runs; carries the staged progress. */
app.get("/api/jobs/:id", requireAuth, (req, res) => {
  const job = getOwnedJob(req.user!.id, req.params.id);
  if (!job) {
    res.status(404).json({ error: "Unknown job — it may have expired." } satisfies ApiError);
    return;
  }
  res.json({
    id: job.id,
    source: job.source,
    status: job.status,
    progress: job.progress,
    message: job.message,
    stages: job.stages,
    counters: job.counters,
    error: job.error,
    result: job.result,
  });
});

app.get("/api/analyses", requireAuth, async (req, res) => {
  try {
    res.json({ analyses: await listAnalysesFor(req.user!.id) });
  } catch (err) {
    fail(res, 500, err);
  }
});

app.get("/api/dashboard", requireAuth, async (req, res) => {
  try {
    res.json(await dashboardFor(req.user!.id));
  } catch (err) {
    fail(res, 500, err);
  }
});

app.get("/api/analyses/:id", requireAuth, async (req, res) => {
  try {
    const analysis = await loadAnalysisFor(req.user!.id, req.params.id);
    if (!analysis) {
      res.status(404).json({ error: "Analysis not found — run an analysis first." } satisfies ApiError);
      return;
    }
    res.json({ analysis, cached: true });
  } catch (err) {
    fail(res, 500, err);
  }
});

app.delete("/api/analyses/:id", requireAuth, async (req, res) => {
  try {
    const ok = await deleteAnalysisFor(req.user!.id, req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Analysis not found." } satisfies ApiError);
      return;
    }
    res.json({ ok });
  } catch (err) {
    fail(res, 500, err);
  }
});

app.get("/api/analyses/:id/file", requireAuth, async (req, res) => {
  try {
    const analysis = await loadAnalysisFor(req.user!.id, req.params.id);
    if (!analysis) {
      res.status(404).json({ error: "Analysis not found." } satisfies ApiError);
      return;
    }
    const rel = typeof req.query.path === "string" ? req.query.path : "";
    if (!rel) {
      res.status(400).json({ error: "Missing ?path=" } satisfies ApiError);
      return;
    }
    const detail = await buildFileDetail(analysis.repo.rootPath, analysis, rel);
    if (!detail) {
      res.status(404).json({ error: `File not found: ${rel}` } satisfies ApiError);
      return;
    }
    res.json(detail);
  } catch (err) {
    fail(res, 500, err);
  }
});

// Answers the question and persists the exchange in the caller's chat history.
app.post("/api/analyses/:id/ask", requireAuth, askHandler);

/* ---------------------------------------------------------- chat history */

registerChatRoutes(app, requireAuth);

/* -------------------------------------------------------------- preferences */

app.get("/api/preferences", requireAuth, async (req, res) => {
  res.json({ theme: await themeFor(req.user!.id) });
});

app.post("/api/preferences", requireAuth, async (req, res) => {
  const theme = req.body?.theme === "light" ? "light" : req.body?.theme === "dark" ? "dark" : null;
  if (!theme) {
    res.status(400).json({ error: "theme must be \"dark\" or \"light\"." } satisfies ApiError);
    return;
  }
  await setThemeFor(req.user!.id, theme);
  res.json({ theme });
});

/* ------------------------------------------------------------ api fallback */

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Unknown API route." } satisfies ApiError);
});

// Any thrown/rejected handler lands here as JSON, never as an HTML stack page.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[api] unhandled error:", message);
  if (!res.headersSent) res.status(500).json({ error: message } satisfies ApiError);
});

// Serve the built web client when present (production mode).
const distDir = path.join(PROJECT_ROOT, "frontend", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(distDir, "index.html"), (err) => {
      if (err) next();
    });
  });
}

const requestedPort = Number(process.env.PORT);
const port = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 3001;
app.listen(port, () => {
  console.log(`CodeAtlas API listening on http://localhost:${port} (AI ${aiConfig().enabled ? "on" : "off"})`);
});
