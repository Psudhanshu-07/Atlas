// GitHub identity, sessions, and the middleware that guards every workspace
// route.
//
// GitHub is the only sign-in method. The OAuth callback is the only place a
// session is created, so account creation and e-mail ownership come from a
// single source we don't have to verify ourselves.
//
// Sessions are 256-bit random tokens; only the SHA-256 hash is stored. The
// token travels in an HttpOnly, SameSite=Lax cookie and never reaches
// JavaScript.
//
// `requireAuth` guards workspace routes, `requireAdmin` guards global
// configuration, and both bind `req.user.id`, never a client-supplied id.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Express, Request, RequestHandler, Response } from "express";
import multer from "multer";
import type { ApiError, GithubRepo } from "../../shared/types";
import * as db from "./db";
import { DATA_DIR } from "./paths";
import { exchangeCode, fetchProfile, githubApiBase, githubHeaders, githubWebBase, type GithubProfile } from "./github";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`: the session's account, never client-supplied. */
      user?: AuthUser;
      sessionId?: number;
    }
  }
}

const SESSION_COOKIE = "ca_sid";
const OAUTH_COOKIE = "ca_oauth";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 10 * 60 * 1000;

/** Sign-in only needs identity; listing repositories needs the `repo` grant. */
const SCOPES_IDENTITY = "read:user user:email";
const SCOPES_REPOS = "repo read:user user:email";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/* ----------------------------------------------------------------- cookies */

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    if (key && !(key in out)) out[key] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

function isHttps(req: Request): boolean {
  const forwarded = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim();
  return req.secure || forwarded === "https";
}

/**
 * Cookie policy for the session. Same-origin deployments (the SPA served by
 * this server) default to SameSite=Lax. When the API is called from a separate
 * origin (CODEATLAS_FRONTEND_URL, e.g. a Vercel frontend against a Render
 * backend), the browser only sends the cookie when it says SameSite=None and
 * rides on HTTPS — the pairing is enforced, never one without the other.
 */
function cookieAttributes(req: Request): string[] {
  const crossSite = Boolean(process.env.CODEATLAS_FRONTEND_URL?.trim());
  const parts = ["Path=/", "HttpOnly"];
  if (crossSite) {
    if (isHttps(req)) parts.push("SameSite=None", "Secure");
  } else {
    parts.push("SameSite=Lax");
    if (isHttps(req)) parts.push("Secure");
  }
  return parts;
}

function setCookie(res: Response, cookie: string): void {
  res.setHeader("Set-Cookie", cookie);
}

async function issueSession(req: Request, res: Response, userId: number): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  const agent = String(req.headers["user-agent"] ?? "").slice(0, 200);
  await db.createSession(userId, sha256(token), Date.now() + SESSION_TTL_MS, agent || null);
  const parts = [`${SESSION_COOKIE}=${token}`, ...cookieAttributes(req), `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`];
  setCookie(res, parts.join("; "));
}

function clearSessionCookie(req: Request, res: Response): void {
  const parts = [`${SESSION_COOKIE}=`, "Max-Age=0", ...cookieAttributes(req)];
  setCookie(res, parts.join("; "));
}

async function currentSession(req: Request): Promise<{ sessionId: number; user: db.UserRow } | null> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const found = await db.findSessionUser(sha256(token));
  if (!found) return null;
  if (Date.now() - found.lastSeenAt > SESSION_TOUCH_INTERVAL_MS) await db.touchSession(found.sessionId);
  return { sessionId: found.sessionId, user: found.user };
}

/* --------------------------------------------------------------- middleware */

// `RequestHandler<any>` (rather than the default params type) matters: with a
// stricter middleware type TypeScript falls back to a wider route overload and
// `req.params.id` becomes `string | string[]` at every call site.
export const requireAuth: RequestHandler<any> = async (req, res, next): Promise<void> => {
  const session = await currentSession(req);
  if (!session) {
    res.status(401).json({ error: "Sign in to continue." } satisfies ApiError);
    return;
  }
  req.user = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    isAdmin: session.user.is_admin === 1,
  };
  req.sessionId = session.sessionId;
  next();
};

export const requireAdmin: RequestHandler<any> = (req, res, next) => {
  if (!req.user?.isAdmin) {
    res
      .status(403)
      .json({ error: "Only the workspace admin can change global configuration." } satisfies ApiError);
    return;
  }
  next();
};

/* ------------------------------------------------------------ rate limiting */

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Fixed-window limiter for the auth and OAuth endpoints. */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 5_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count <= max;
}

/* --------------------------------------------------------------- validation */

function readName(value: unknown, fallback: string): string {
  const name = typeof value === "string" ? value.trim().slice(0, 80) : "";
  return name || fallback;
}

/* ------------------------------------------------------------ GitHub OAuth */

export function githubOAuthConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

function appBaseUrl(req: Request): string {
  const override = process.env.CODEATLAS_BASE_URL;
  if (override) return override.replace(/\/$/, "");
  return `${isHttps(req) ? "https" : "http"}://${req.headers.host ?? "localhost:3001"}`;
}

/* ------------------------------------------------------------------- routes */

/**
 * Find the account this GitHub identity belongs to: by GitHub id, else by an
 * e-mail GitHub has *verified* (equivalent to proving mailbox ownership), else
 * create a new account.
 */
async function upsertGithubAccount(profile: GithubProfile): Promise<db.UserRow> {
  // `insertUser` makes the first account on the server the admin; this env var
  // pins the role to one address instead, for installs that sign in elsewhere first.
  const adminEmail = (process.env.CODEATLAS_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const pinnedAdmin = adminEmail !== "" && adminEmail === profile.email.trim().toLowerCase();

  const byGithub = await db.findUserByGithubId(profile.id);
  if (byGithub) {
    await db.linkGithub(byGithub.id, {
      githubId: profile.id,
      githubLogin: profile.login,
      avatarUrl: profile.avatarUrl,
    });
    return (await db.refreshUser(byGithub.id)) ?? byGithub;
  }

  // A GitHub-verified address is proof of ownership, so it can adopt an
  // existing row (e.g. an account renamed on GitHub).
  const byEmail = profile.emailVerified ? await db.findUserByEmail(profile.email) : null;
  if (byEmail) {
    await db.linkGithub(byEmail.id, {
      githubId: profile.id,
      githubLogin: profile.login,
      avatarUrl: profile.avatarUrl,
    });
    return (await db.refreshUser(byEmail.id)) ?? byEmail;
  }

  return db.insertUser({
    email: profile.email,
    name: profile.name,
    githubId: profile.id,
    githubLogin: profile.login,
    avatarUrl: profile.avatarUrl,
    isAdmin: pinnedAdmin ? true : undefined,
  });
}

function safeReturnPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.length > 300) return "/";
  return value;
}

/**
 * Where the OAuth flow lands after GitHub: a short-lived status query the shell
 * consumes. Split deployments send the browser back to the web client's origin
 * (it does not live on this server), everything else returns to this one.
 */
function oauthReturn(base: string, status: string): string {
  const origin = process.env.CODEATLAS_FRONTEND_URL?.trim().replace(/\/$/, "");
  return `${origin || base}/?github=${encodeURIComponent(status)}`;
}

/* ------------------------------------------------------------------- routes */

function jsonError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message } satisfies ApiError);
}

/**
 * Register every `/api/auth/*` route (plus `/api/github/repos`) on the app.
 * Called once from `server/index.ts` before the API 404 handler.
 */

/* -------------------------------------------------- password credentials */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/** scrypt in hex; parameters are fixed so hashes stay comparable across upgrades. */
function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
}

/** Constant-time comparison; never leaks where the difference starts. */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function registerAuthRoutes(app: Express): void {
  /** Public: which sign-in providers this installation offers. */
  app.get("/api/auth/providers", (_req, res) => {
    res.json({ github: githubOAuthConfigured() });
  });

  /* --------------------------------------------- e-mail + password accounts */

  /** Create an account with e-mail + password and sign straight in. */
  app.post("/api/auth/register", async (req, res) => {
    if (!allow(`register:${req.ip ?? "?"}`, 10, 60 * 60_000)) {
      jsonError(res, 429, "Too many sign-up attempts. Try again later.");
      return;
    }
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = req.body?.password;
    const name = readName(req.body?.name, email.split("@")[0] || "Engineer");
    if (!EMAIL_RE.test(email) || email.length > 120) {
      jsonError(res, 400, "Enter a valid e-mail address.");
      return;
    }
    const pwProblem = passwordProblem(password);
    if (pwProblem) {
      jsonError(res, 400, pwProblem);
      return;
    }
    if (await db.findUserByEmail(email)) {
      jsonError(res, 409, "An account with this e-mail already exists. Sign in instead.");
      return;
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const created = await db.insertUser({
      email,
      name,
      passwordHash: hashPassword(password as string, salt),
      passwordSalt: salt,
      // The first account still becomes the workspace admin.
      isAdmin: false,
    });
    await issueSession(req, res, created.id);
    res.json({ user: db.toSessionUser(created, await db.githubRepoAccess(created.id)) });
  });

  /** Sign in to an existing e-mail + password account. */
  app.post("/api/auth/login", async (req, res) => {
    if (!allow(`login:${req.ip ?? "?"}`, 20, 15 * 60_000)) {
      jsonError(res, 429, "Too many sign-in attempts. Try again in a few minutes.");
      return;
    }
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const user = email ? await db.findUserByEmail(email) : null;
    const credential = user ? await db.passwordCredential(user.id) : null;
    if (!user || !credential || !safeEqualHex(credential.hash, hashPassword(password, credential.salt))) {
      jsonError(res, 401, "Wrong e-mail or password.");
      return;
    }
    await issueSession(req, res, user.id);
    res.json({ user: db.toSessionUser(user, await db.githubRepoAccess(user.id)) });
  });

  /** Change the password of an e-mail account (GitHub-only accounts have none). */
  app.post("/api/auth/password", requireAuth, async (req, res) => {
    const current = typeof req.body?.current === "string" ? req.body.current : "";
    const next = req.body?.next;
    const problem = passwordProblem(next);
    if (problem) {
      jsonError(res, 400, problem);
      return;
    }
    const credential = await db.passwordCredential(req.user!.id);
    if (!credential) {
      jsonError(
        res,
        400,
        "This account signs in with GitHub and has no password to change.",
      );
      return;
    }
    if (!safeEqualHex(credential.hash, hashPassword(current, credential.salt))) {
      jsonError(res, 401, "Your current password is incorrect.");
      return;
    }
    const salt = crypto.randomBytes(16).toString("hex");
    await db.setPassword(req.user!.id, hashPassword(next as string, salt), salt);
    res.json({ ok: true });
  });

  /**
   * Disconnect the GitHub integration: forgets the stored OAuth token, so
   * repository access is revoked. Refused when GitHub is the only way back in.
   */
  app.post("/api/auth/github/disconnect", requireAuth, async (req, res) => {
    if (!(await db.findUserById(req.user!.id))?.github_id) {
      jsonError(res, 400, "No GitHub account is connected.");
      return;
    }
    if (!(await db.passwordCredential(req.user!.id))) {
      jsonError(
        res,
        400,
        "GitHub is your only sign-in method. Set a password first so you are not locked out.",
      );
      return;
    }
    await db.deleteGithubToken(req.user!.id);
    res.json({ ok: true });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) await db.deleteSession(sha256(token));
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  /** Boot probe: the current session, or null. Always 200, never an error. */
  app.get("/api/auth/me", async (req, res) => {
    const session = await currentSession(req);
    res.json({
      user: session
        ? db.toSessionUser(session.user, await db.githubRepoAccess(session.user.id))
        : null,
    });
  });

  app.post("/api/auth/profile", requireAuth, async (req, res) => {
    const name = readName(req.body?.name, "");
    const bio = typeof req.body?.bio === "string" ? req.body.bio.trim().slice(0, 300) : undefined;
    const role = typeof req.body?.role === "string" ? req.body.role.trim().slice(0, 60) : undefined;
    if (!name) {
      jsonError(res, 400, "Display name cannot be empty.");
      return;
    }
    const patch: { name: string; bio?: string | null; role?: string | null } = { name };
    if (bio !== undefined) patch.bio = bio || null;
    if (role !== undefined) patch.role = role || null;
    await db.updateProfile(req.user!.id, patch);
    const user = await db.refreshUser(req.user!.id);
    res.json({ user: user ? db.toSessionUser(user, await db.githubRepoAccess(user.id)) : null });
  });

  /* ---------------------------------------------------- profile photo (avatar) */

  // Uploads land under `.codeatlas/avatars`, outside any serveable source tree;
  // filenames are generated server-side so a client can never choose a path.
  const avatarUpload = multer({
    dest: path.join(DATA_DIR, "avatars"),
    limits: { fileSize: 2 * 1024 * 1024 },
  });

  app.post("/api/auth/avatar", requireAuth, avatarUpload.single("image"), async (req, res) => {
    const file = req.file;
    if (!file) {
      jsonError(res, 400, "Choose an image to upload.");
      return;
    }
    const ext = (file.originalname ?? "").split(".").pop()?.toLowerCase() ?? "";
    if (!ext || !["jpg", "jpeg", "png", "webp"].includes(ext)) {
      fs.unlink(file.path, () => undefined);
      jsonError(res, 400, "Only JPEG, PNG and WebP images are accepted.");
      return;
    }
    const storedName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    const target = path.join(DATA_DIR, "avatars", storedName);
    try {
      fs.renameSync(file.path, target);
    } catch {
      fs.copyFileSync(file.path, target);
      fs.unlinkSync(file.path);
    }
    await db.updateProfile(req.user!.id, { avatarUrl: `/avatars/${storedName}` });
    const user = await db.refreshUser(req.user!.id);
    res.json({ user: user ? db.toSessionUser(user, await db.githubRepoAccess(user.id)) : null });
  });

  app.delete("/api/auth/avatar", requireAuth, async (req, res) => {
    const previous = (await db.findUserById(req.user!.id))?.avatar_url;
    if (previous?.startsWith("/avatars/")) {
      const name = previous.slice("/avatars/".length);
      if (/^[A-Za-z0-9._-]+$/.test(name)) {
        try {
          fs.unlinkSync(path.join(DATA_DIR, "avatars", name));
        } catch {
          /* already gone; the profile update below still runs */
        }
      }
    }
    await db.updateProfile(req.user!.id, { avatarUrl: null });
    const user = await db.refreshUser(req.user!.id);
    res.json({ user: user ? db.toSessionUser(user, await db.githubRepoAccess(user.id)) : null });
  });

  app.get("/api/auth/sessions", requireAuth, async (req, res) => {
    const sessions = (await db.listSessionsFor(req.user!.id)).map((s) => ({
      id: s.id,
      createdAt: new Date(s.created_at).toISOString(),
      lastSeenAt: new Date(s.last_seen_at).toISOString(),
      expiresAt: new Date(s.expires_at).toISOString(),
      userAgent: s.user_agent ?? "",
      current: s.id === req.sessionId,
    }));
    res.json({ sessions });
  });

  app.delete("/api/auth/sessions", requireAuth, async (req, res) => {
    for (const s of await db.listSessionsFor(req.user!.id)) {
      if (s.id !== req.sessionId) await db.deleteSessionFor(req.user!.id, s.id);
    }
    res.json({ ok: true });
  });

  app.delete("/api/auth/sessions/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const ok = Number.isInteger(id) && (await db.deleteSessionFor(req.user!.id, id));
    if (!ok) {
      jsonError(res, 404, "Session not found.");
      return;
    }
    res.json({ ok: true });
  });

  /* ---------------------------------------------------- GitHub sign-in flow */

  app.get("/api/auth/github", (req, res) => {
    if (!githubOAuthConfigured()) {
      jsonError(
        res,
        503,
        "GitHub sign-in is not configured on this server. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
      );
      return;
    }
    if (!allow(`github:${req.ip ?? "?"}`, 30, 10 * 60_000)) {
      jsonError(res, 429, "Too many attempts. Try again in a few minutes.");
      return;
    }
    const scopes = req.query.scopes === "repos" ? SCOPES_REPOS : SCOPES_IDENTITY;
    const state = crypto.randomBytes(16).toString("base64url");
    const to = safeReturnPath(req.query.to);
    // The state cookie rides a top-level navigation to GitHub and back. It
    // follows the same policy as the session cookie: in split deployments the
    // browser only stores it with SameSite=None on HTTPS.
    const parts = [...cookieAttributes(req), `Max-Age=${Math.floor(OAUTH_STATE_TTL_MS / 1000)}`];
    setCookie(res, `${OAUTH_COOKIE}=${state}:${encodeURIComponent(to)}; ${parts.join("; ")}`);

    const redirectUri = `${appBaseUrl(req)}/api/auth/github/callback`;
    const url = new URL(`${githubWebBase()}/login/oauth/authorize`);
    url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", scopes);
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/github/callback", async (req, res) => {
    const base = appBaseUrl(req);
    try {
      if (!githubOAuthConfigured()) throw new Error("not_configured");
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const cookie = parseCookies(req.headers.cookie)[OAUTH_COOKIE] ?? "";
      const [expectedState, encodedTo] = cookie.split(":");
      if (!code || !state || !expectedState || state !== expectedState) throw new Error("invalid_state");

      res.clearCookie(OAUTH_COOKIE, { path: "/" });

      const to = safeReturnPath(encodedTo ? decodeURIComponent(encodedTo) : "/");
      const redirectUri = `${base}/api/auth/github/callback`;
      const { token, scopes } = await exchangeCode(code, redirectUri);
      const profile = await fetchProfile(token);
      const user = await upsertGithubAccount(profile);
      await db.saveGithubToken(user.id, token, scopes);
      await issueSession(req, res, user.id);
      res.redirect(oauthReturn(base, scopes.includes("repo") ? "repos" : "signed-in"));
    } catch (err) {
      console.warn("[auth] GitHub OAuth failed:", err instanceof Error ? err.message : err);
      const reason = err instanceof Error && /^[\w_]+$/.test(err.message) ? err.message : "exchange_failed";
      res.redirect(oauthReturn(base, `error:${reason}`));
    }
  });

  /* -------------------------------------------------- connected repository list */

  app.get("/api/github/repos", requireAuth, async (req, res) => {
    const stored = await db.loadGithubToken(req.user!.id);
    if (!stored) {
      jsonError(res, 400, "Grant repository access to this app first.");
      return;
    }
    try {
      const ghRes = await fetch(
        `${githubApiBase()}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
        { headers: githubHeaders(stored.token), signal: AbortSignal.timeout(15_000) },
      );
      if (!ghRes.ok) {
        const detail =
          ghRes.status === 403
            ? "GitHub rate limit reached. Try again in a minute."
            : `GitHub returned HTTP ${ghRes.status}.`;
        jsonError(res, 502, detail);
        return;
      }
      const list = (await ghRes.json()) as Array<{
        id: number;
        name: string;
        full_name: string;
        owner?: { login?: string };
        private: boolean;
        description: string | null;
        language: string | null;
        default_branch?: string;
        pushed_at?: string;
        updated_at?: string;
        stargazers_count?: number;
      }>;
      const repos: GithubRepo[] = list.map((r) => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        owner: r.owner?.login ?? "",
        private: Boolean(r.private),
        description: r.description ?? null,
        language: r.language ?? null,
        defaultBranch: r.default_branch ?? "main",
        updatedAt: r.pushed_at ?? r.updated_at ?? "",
        stars: r.stargazers_count ?? 0,
      }));
      res.json({ repos, scopes: stored.scopes });
    } catch (err) {
      jsonError(res, 502, `Could not reach GitHub: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}
