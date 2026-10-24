// Persistence: accounts, sessions, per-user analyses, connected repositories,
// GitHub tokens and preferences. PostgreSQL, accessed through `pg` when
// DATABASE_URL is set (Supabase in production) or the embedded PGlite
// Postgres when it is not (local development and tests: no external service).
//
// Ownership model
//
// Every user-scoped table carries `owner_user_id` (foreign key to users.id,
// ON DELETE CASCADE), and `analyses` is keyed by `(owner_user_id, analysis_id)`:
//
//   * the same source analysed by two users is two independent rows;
//   * every accessor requires an explicit owner id, which the SQL binds;
//   * rows imported from the pre-auth cache keep owner_user_id 0 (no account
//     can ever own id 0), and `WHERE owner_user_id = owner` never matches, so
//     they fail closed.
//
// Postgres has row-level security in principle, but this guarantee remains
// structural in the data model: the unique key makes a wrong-owner read
// impossible, and deletes cascade the workspace data away with the account.
//
// Migrations are forward-only; the schema is applied inside one transaction
// on first boot, and `schema_migrations` records the applied version so later
// versions can extend it. Tables are never dropped and existing rows survive.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { CACHE_DIR, DATA_DIR } from "./paths";
import type { Analysis, AnalysisSummary, LinkedRepo, RepoInfo, SessionUser } from "../../shared/types";

/* ------------------------------------------------------------------ schema */

/** SQL of the current schema, applied atomically by version. */
const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS users (
    id             SERIAL PRIMARY KEY,
    email          TEXT NOT NULL,
    name           TEXT NOT NULL,
    password_hash  TEXT,
    password_salt  TEXT,
    github_id      TEXT,
    github_login   TEXT,
    avatar_url     TEXT,
    is_admin       INTEGER NOT NULL DEFAULT 0,
    bio            TEXT,
    role           TEXT,
    created_at     TEXT NOT NULL
  )`,
    `CREATE TABLE IF NOT EXISTS sessions (
    id           SERIAL PRIMARY KEY,
    token_hash   TEXT NOT NULL,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   BIGINT NOT NULL,
    expires_at   BIGINT NOT NULL,
    last_seen_at BIGINT NOT NULL,
    user_agent   TEXT
  )`,
    `CREATE TABLE IF NOT EXISTS analyses (
    owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    analysis_id   TEXT NOT NULL,
    source        TEXT NOT NULL,
    name          TEXT NOT NULL,
    kind          TEXT NOT NULL,
    branch        TEXT,
    analyzed_at   TEXT NOT NULL,
    files         INTEGER NOT NULL DEFAULT 0,
    lines         INTEGER NOT NULL DEFAULT 0,
    issues        INTEGER NOT NULL DEFAULT 0,
    language      TEXT,
    clusters      INTEGER,
    payload       TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  )`,
    `CREATE TABLE IF NOT EXISTS linked_repos (
    id               SERIAL PRIMARY KEY,
    owner_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source           TEXT NOT NULL,
    name             TEXT NOT NULL,
    kind             TEXT NOT NULL,
    repo_owner       TEXT,
    branch           TEXT,
    last_analyzed_at TEXT,
    created_at       TEXT NOT NULL
  )`,
    `CREATE TABLE IF NOT EXISTS preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme   TEXT NOT NULL DEFAULT 'dark',
    data    TEXT NOT NULL DEFAULT '{}'
  )`,
    `CREATE TABLE IF NOT EXISTS github_tokens (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token_enc  TEXT NOT NULL,
    scopes     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
    `CREATE TABLE IF NOT EXISTS chat_conversations (
    id            SERIAL PRIMARY KEY,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    analysis_id   TEXT,
    title         TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  )`,
    `CREATE TABLE IF NOT EXISTS chat_messages (
    id              SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    sources         TEXT,
    mode            TEXT,
    client_msg_id   TEXT,
    created_at      TEXT NOT NULL
  )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (lower(email))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github ON users (github_id) WHERE github_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_analyses_pair ON analyses (owner_user_id, analysis_id)`,
    `CREATE INDEX IF NOT EXISTS idx_analyses_owner ON analyses (owner_user_id, analyzed_at DESC)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_linked_repos_pair ON linked_repos (owner_user_id, source)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_conversations_owner ON chat_conversations (owner_user_id, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages (conversation_id, id)`,
    // Retries carry the same client_msg_id, so a repeated write cannot duplicate.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client ON chat_messages (conversation_id, client_msg_id)
     WHERE client_msg_id IS NOT NULL`,
  ],
];

/* ----------------------------------------------------------------- drivers */

export interface RunResult {
  /** Affected rows for writes, 0 otherwise. */
  changes: number;
  /** Rows for `RETURNING` clauses (empty otherwise). */
  rows: Array<Record<string, unknown>>;
}

/**
 * The minimal query surface everything above is written against. Postgres
 * semantics in both implementations; `?` placeholders are mapped to `$1…$n`.
 */
interface DbDriver {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  /** Raw, non-parameterised SQL (DDL, BEGIN/COMMIT, multi-statement scripts). */
  exec(sql: string): Promise<void>;
  /** Reads the applied schema version without creating anything. */
  readVersion(): Promise<number>;
  /** Applies the given statements of each missing version atomically. */
  applyMigration(version: number, statements: string[]): Promise<void>;
  close(): Promise<void>;
}

const DATABASE_URL = process.env.DATABASE_URL?.trim() || "";

/** `?` → `$1`, `$2`, … in order; the SQL here never quotes a literal `?`. */
function numbered(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function makePostgres(url: string): Promise<DbDriver> {
  const pg = await import("pg");
  // Most managed Postgres providers (Supabase included) require TLS but ship
  // self-signed relay certificates — accept them without rejecting the cert.
  const needsSsl = /supabase|sslmode=require|pooler/i.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
  // Fail fast on a bad URL instead of at the first query, with a readable error.
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.end().catch(() => undefined);
    throw new Error(
      `DATABASE_URL is unreachable: ${message}. Check the Supabase connection string (Project Settings → Database).`,
    );
  }

  let connected = true;
  return {
    async all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      if (!connected) throw new Error("Database is closed this run");
      const res = await pool.query(numbered(sql), params);
      return res.rows as T[];
    },
    async run(sql: string, params: unknown[] = []): Promise<RunResult> {
      if (!connected) throw new Error("Database is closed this run");
      const res = await pool.query(numbered(sql), params);
      return { changes: res.rowCount ?? 0, rows: res.rows as Array<Record<string, unknown>> };
    },
    async exec(sql) {
      if (!connected) throw new Error("Database is closed this run");
      await pool.query(sql);
    },
    async readVersion() {
      try {
        const res = await pool.query("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations");
        return Number((res.rows[0] as { v: number }).v);
      } catch (err) {
        if (err instanceof Error && /does not exist/.test(err.message)) return 0;
        throw err;
      }
    },
    async applyMigration(version, statements) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER NOT NULL)");
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        for (const statement of statements) await client.query(statement);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      connected = false;
      await pool.end().catch(() => undefined);
    },
  };
}

async function makePglite(dataDir: string): Promise<DbDriver> {
  const { PGlite } = await import("@electric-sql/pglite");
  fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);

  return {
    async all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const res = await client.query(numbered(sql), params);
      return res.rows as T[];
    },
    async run(sql: string, params: unknown[] = []): Promise<RunResult> {
      const res = await client.query(numbered(sql), params);
      return { changes: res.affectedRows ?? 0, rows: res.rows as Array<Record<string, unknown>> };
    },
    async exec(sql) {
      await client.exec(sql);
    },
    async readVersion() {
      try {
        const res = await client.query<{ v: number }>(
          "SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations",
        );
        return Number(res.rows[0]?.v ?? 0);
      } catch (err) {
        if (err instanceof Error && /does not exist/.test(err.message)) return 0;
        throw err;
      }
    },
    async applyMigration(version, statements) {
      await client.transaction(async (tx) => {
        await tx.query("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER NOT NULL)");
        await tx.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        for (const statement of statements) await tx.query(statement);
      });
    },
    async close() {
      await client.close();
    },
  };
}

/* --------------------------------------------------------------- lifecycle */

let driver: DbDriver | null = null;
let bootPromise: Promise<DbDriver> | null = null;

async function boot(): Promise<DbDriver> {
  const next = DATABASE_URL ? await makePostgres(DATABASE_URL) : await makePglite(path.join(DATA_DIR, "pg"));
  try {
    const version = await next.readVersion();
    for (const [index, statements] of MIGRATIONS.entries()) {
      if (index < version) continue;
      await next.applyMigration(index + 1, statements);
    }
    await purgeExpiredSessions(next);
    await importLegacyCache(next);
  } catch (err) {
    await next.close().catch(() => undefined);
    throw err;
  }
  return next;
}

/** Lazily initialises the connection so merely importing db.ts has no side effects. */
function ready(): Promise<DbDriver> {
  if (driver) return Promise.resolve(driver);
  bootPromise ??= boot().then((open) => {
    driver = open;
    return open;
  }).catch((err) => {
    bootPromise = null;
    throw err;
  });
  return bootPromise;
}

/**
 * Closes the connection (a no-op when nothing was opened) so tests can release
 * the data directory and the process can shut down cleanly.
 */
export async function closeDb(): Promise<void> {
  const open = driver;
  driver = null;
  bootPromise = null;
  if (open) await open.close();
}

/* ---------------------------------------------------------- query helpers */

type Param = string | number | null | Buffer;

async function row<T>(sql: string, ...params: Param[]): Promise<T | undefined> {
  const db = await ready();
  const found = await db.all<T>(sql, params);
  return found[0];
}

async function rows<T>(sql: string, ...params: Param[]): Promise<T[]> {
  const db = await ready();
  return db.all<T>(sql, params);
}

async function run(sql: string, ...params: Param[]): Promise<RunResult> {
  const db = await ready();
  return db.run(sql, params);
}

async function count(statement: string, ...params: Param[]): Promise<number> {
  const found = await row<{ n: number }>(statement, ...params);
  return Number(found?.n ?? 0);
}

/** Test support: a raw, parameterised read of the current database. */
export function rawQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return ready().then((db) => db.all<T>(sql, params));
}

/**
 * Migrates the schema and applies the post-migration setup. Exposed for
 * eager boots (for example when an operator wants the error at npm start).
 */
export async function initializeDb(): Promise<void> {
  await ready();
}

/* -------------------------------------------------------- secret encryption */

// GitHub OAuth tokens are encrypted at rest with a key derived from
// CODEATLAS_STORAGE_KEY when set (required on ephemeral hosts like Render, so
// tokens survive redeploys), or with a key stored beside the data directory
// (generated on first boot; .codeatlas/ is gitignored). Rotating the key
// invalidates stored tokens and users reconnect GitHub.

let storageKey: Buffer | null = null;

function getStorageKey(): Buffer {
  if (storageKey) return storageKey;
  const fromEnv = process.env.CODEATLAS_STORAGE_KEY?.trim();
  if (fromEnv && /^[0-9a-f]{64}$/i.test(fromEnv)) {
    storageKey = Buffer.from(fromEnv, "hex");
    return storageKey;
  }
  const file = path.join(DATA_DIR, "storage.key");
  try {
    const hex = fs.readFileSync(file, "utf8").trim();
    if (/^[0-9a-f]{64}$/i.test(hex)) {
      storageKey = Buffer.from(hex, "hex");
      return storageKey;
    }
  } catch {
    /* generate a fresh key below */
  }
  const key = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, key.toString("hex"), { mode: 0o600 });
  } catch (err) {
    console.error("[db] Could not persist the storage key; stored tokens will not survive a restart:", err);
  }
  storageKey = key;
  return key;
}

function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getStorageKey(), iv);    const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return [
      "v1",
      iv.toString("base64"),
      cipher.getAuthTag().toString("base64"),
      ciphertext.toString("base64"),
    ].join(".");
}

function decryptSecret(stored: string): string | null {
  try {
    const [version, ivB64, tagB64, dataB64] = stored.split(".");
    if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", getStorageKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null; // key rotated or row corrupted; treat as "not connected"
  }
}

/* ------------------------------------------------------------------ users */

export interface UserRow {
  id: number;
  email: string;
  name: string;
  bio: string | null;
  role: string | null;
  github_id: string | null;
  github_login: string | null;
  avatar_url: string | null;
  is_admin: number;
  created_at: string;
  password_hash: string | null;
  password_salt: string | null;
}

export interface NewUserInput {
  email: string;
  name: string;
  githubId?: string | null;
  githubLogin?: string | null;
  passwordHash?: string | null;
  passwordSalt?: string | null;
  avatarUrl?: string | null;
  isAdmin?: boolean;
}

/** The first account created becomes the workspace admin (owns global AI config). */
export async function countUsers(): Promise<number> {
  return count("SELECT COUNT(*) AS n FROM users");
}

export async function insertUser(input: NewUserInput): Promise<UserRow> {
  const isAdmin = input.isAdmin ?? (await countUsers()) === 0;
  const inserted = await run(
    `INSERT INTO users (email, name, password_hash, password_salt, github_id, github_login, avatar_url, is_admin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    input.email.trim().toLowerCase(),
    input.name.trim(),
    input.passwordHash ?? null,
    input.passwordSalt ?? null,
    input.githubId ?? null,
    input.githubLogin ?? null,
    input.avatarUrl ?? null,
    isAdmin ? 1 : 0,
    new Date().toISOString(),
  );
  const id = Number(inserted.rows[0]?.id);
  const created = await findUserById(id);
  if (!created) throw new Error("User insert succeeded but the row is unreadable.");
  return created;
}

export async function findUserById(id: number): Promise<UserRow | null> {
  return (await row<UserRow>("SELECT * FROM users WHERE id = ?", id)) ?? null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return (await row<UserRow>("SELECT * FROM users WHERE email = ?", email.trim().toLowerCase())) ?? null;
}

export async function findUserByGithubId(githubId: string): Promise<UserRow | null> {
  return (await row<UserRow>("SELECT * FROM users WHERE github_id = ?", githubId)) ?? null;
}

/** Return a user row re-read after an update (or null when gone). */
export async function refreshUser(userId: number): Promise<UserRow | null> {
  return findUserById(userId);
}

export async function linkGithub(
  userId: number,
  profile: { githubId: string; githubLogin: string; avatarUrl?: string | null },
): Promise<void> {
  await run(
    "UPDATE users SET github_id = ?, github_login = ?, avatar_url = COALESCE(?, avatar_url) WHERE id = ?",
    profile.githubId,
    profile.githubLogin,
    profile.avatarUrl ?? null,
    userId,
  );
}

/** Materialise the safe public shape of an account. Never includes secrets. */
export function toSessionUser(u: UserRow, reposGranted = false): SessionUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    bio: u.bio,
    role: u.role,
    isAdmin: u.is_admin === 1,
    reposGranted,
    githubLogin: u.github_login,
    avatarUrl: u.avatar_url,
    hasPassword: Boolean(u.password_hash && u.password_salt),
    createdAt: u.created_at,
  };
}

/* --------------------------------------------------------------- sessions */

export async function createSession(
  userId: number,
  tokenHash: string,
  expiresAtMs: number,
  userAgent: string | null,
): Promise<number> {
  const now = Date.now();
  const result = await run(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    tokenHash,
    userId,
    now,
    expiresAtMs,
    now,
    userAgent,
  );
  return Number(result.rows[0]?.id);
}

/** Look up a live session and its account in one bound query. */
export async function findSessionUser(
  tokenHash: string,
): Promise<{ sessionId: number; lastSeenAt: number; user: UserRow } | null> {
  const found = await row<UserRow & { last_seen_at: number; session_id: number }>(
    "SELECT u.*, s.id AS session_id, s.last_seen_at AS last_seen_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    tokenHash,
    Date.now(),
  );
  if (!found) return null;
  return {
    sessionId: found.session_id,
    lastSeenAt: Number(found.last_seen_at),
    user: found,
  };
}

export async function touchSession(sessionId: number): Promise<void> {
  await run("UPDATE sessions SET last_seen_at = ? WHERE id = ?", Date.now(), sessionId);
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await run("DELETE FROM sessions WHERE token_hash = ?", tokenHash);
}

export interface SessionInfoRow {
  id: number;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  user_agent: string | null;
}

export async function listSessionsFor(userId: number): Promise<SessionInfoRow[]> {
  const found = await rows<Record<string, unknown>>(
    "SELECT id, created_at, last_seen_at, expires_at, user_agent FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC",
    userId,
  );
  // BIGINT columns arrive as strings in node-postgres; normalise to numbers.
  return found.map((r) => ({
    id: Number(r.id),
    created_at: Number(r.created_at),
    last_seen_at: Number(r.last_seen_at),
    expires_at: Number(r.expires_at),
    user_agent: (r.user_agent as string | null) ?? null,
  }));
}

/** Revoke one session, scoped by owner so a user cannot delete another's. */
export async function deleteSessionFor(userId: number, sessionId: number): Promise<boolean> {
  const result = await run("DELETE FROM sessions WHERE user_id = ? AND id = ?", userId, sessionId);
  return result.changes > 0;
}

export async function updateProfile(
  userId: number,
  patch: { name?: string; bio?: string | null; role?: string | null; avatarUrl?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const params: Param[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    params.push(patch.name);
  }
  if (patch.bio !== undefined) {
    sets.push("bio = ?");
    params.push(patch.bio);
  }
  if (patch.role !== undefined) {
    sets.push("role = ?");
    params.push(patch.role);
  }
  if (patch.avatarUrl !== undefined) {
    sets.push("avatar_url = ?");
    params.push(patch.avatarUrl);
  }
  if (sets.length === 0) return;
  params.push(userId);
  await run(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, ...params);
}

/** Store (or replace) the password credential for an account. */
export async function setPassword(userId: number, hash: string, salt: string): Promise<void> {
  await run("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?", hash, salt, userId);
}

/** The stored password credential, when the account has one. */
export async function passwordCredential(userId: number): Promise<{ hash: string; salt: string } | null> {
  const r = await row<{ password_hash: string | null; password_salt: string | null }>(
    "SELECT password_hash, password_salt FROM users WHERE id = ?",
    userId,
  );
  if (!r?.password_hash || !r?.password_salt) return null;
  return { hash: r.password_hash, salt: r.password_salt };
}

async function purgeExpiredSessions(db?: DbDriver): Promise<void> {
  const gate = db ?? (await ready());
  await gate.run("DELETE FROM sessions WHERE expires_at <= ?", [Date.now()]);
}

/* --------------------------------------------------------------- analyses */

const ID_PATTERN = /^[\w.-]+$/;

function summaryOf(a: Analysis): Omit<
  AnalysisSummary,
  "id" | "analyzedAt"
> {
  return {
    source: a.repo.source,
    name: a.repo.name,
    kind: a.repo.kind,
    files: a.stats.files,
    lines: a.stats.lines,
    issues: a.stats.issues,
    language: a.languages?.find((l) => l.name !== "Other")?.name,
    clusters: a.stats.clusters,
  };
}

const ANALYSIS_COLUMNS =
  "owner_user_id, analysis_id, source, name, kind, branch, analyzed_at, files, lines, issues, language, clusters, payload, updated_at";

/**
 * Store an analysis under an owner. Re-analysing the same source upserts the
 * owner's row, and two users analysing the same repository keep their own copies.
 */
export async function saveAnalysisRow(ownerUserId: number, analysis: Analysis): Promise<void> {
  const s = summaryOf(analysis);
  await run(
    `INSERT INTO analyses (${ANALYSIS_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (owner_user_id, analysis_id) DO UPDATE SET
       source = excluded.source, name = excluded.name, kind = excluded.kind, branch = excluded.branch,
       analyzed_at = excluded.analyzed_at, files = excluded.files, lines = excluded.lines,
       issues = excluded.issues, language = excluded.language, clusters = excluded.clusters,
       payload = excluded.payload, updated_at = excluded.updated_at`,
    ownerUserId,
    analysis.repo.id,
    s.source,
    s.name,
    s.kind,
    analysis.repo.branch ?? null,
    analysis.repo.analyzedAt,
    s.files,
    s.lines,
    s.issues,
    s.language ?? null,
    s.clusters ?? null,
    JSON.stringify(analysis),
    new Date().toISOString(),
  );
}

export async function loadAnalysisRow(ownerUserId: number, analysisId: string): Promise<Analysis | null> {
  if (!ID_PATTERN.test(analysisId)) return null;
  const found = await row<{ payload: string }>(
    "SELECT payload FROM analyses WHERE owner_user_id = ? AND analysis_id = ?",
    ownerUserId,
    analysisId,
  );
  if (!found) return null;
  try {
    const parsed = JSON.parse(found.payload) as Analysis;
    return parsed?.repo?.id ? parsed : null;
  } catch {
    return null;
  }
}

export async function deleteAnalysisRow(ownerUserId: number, analysisId: string): Promise<boolean> {
  if (!ID_PATTERN.test(analysisId)) return false;
  const result = await run(
    "DELETE FROM analyses WHERE owner_user_id = ? AND analysis_id = ?",
    ownerUserId,
    analysisId,
  );
  return result.changes > 0;
}

export async function listAnalysisRows(ownerUserId: number): Promise<AnalysisSummary[]> {
  const found = await rows<{
    analysis_id: string;
    source: string;
    name: string;
    kind: string;
    analyzed_at: string;
    files: number;
    lines: number;
    issues: number;
    language: string | null;
    clusters: number | null;
  }>(
    `SELECT analysis_id, source, name, kind, analyzed_at, files, lines, issues, language, clusters
       FROM analyses WHERE owner_user_id = ? ORDER BY analyzed_at DESC`,
    ownerUserId,
  );
  return found.map((r) => ({
    id: r.analysis_id,
    source: r.source,
    name: r.name,
    kind: r.kind === "github" ? "github" : "local",
    analyzedAt: r.analyzed_at,
    files: Number(r.files),
    lines: Number(r.lines),
    issues: Number(r.issues),
    language: r.language ?? undefined,
    clusters: r.clusters != null ? Number(r.clusters) : undefined,
  }));
}

export async function analysisExistsFor(ownerUserId: number, analysisId: string): Promise<boolean> {
  if (!ID_PATTERN.test(analysisId)) return false;
  return Boolean(
    await row("SELECT 1 AS ok FROM analyses WHERE owner_user_id = ? AND analysis_id = ?", ownerUserId, analysisId),
  );
}

/** Aggregates over *this owner's* rows only (owner-0 legacy rows never match). */
export async function workspaceStats(ownerUserId: number): Promise<{
  repositories: number;
  analyses: number;
  files: number;
  lines: number;
  findings: number;
}> {
  const repoCount = await count("SELECT COUNT(*) AS n FROM linked_repos WHERE owner_user_id = ?", ownerUserId);
  const totals = await row<{ n: number; files: number; lines: number; issues: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(files), 0) AS files, COALESCE(SUM(lines), 0) AS lines,
            COALESCE(SUM(issues), 0) AS issues
       FROM analyses WHERE owner_user_id = ?`,
    ownerUserId,
  );
  return {
    repositories: repoCount,
    analyses: Number(totals?.n ?? 0),
    files: Number(totals?.files ?? 0),
    lines: Number(totals?.lines ?? 0),
    findings: Number(totals?.issues ?? 0),
  };
}

/* ----------------------------------------------------------- linked repos */

export async function upsertLinkedRepo(ownerUserId: number, repo: RepoInfo): Promise<void> {
  await run(
    `INSERT INTO linked_repos (owner_user_id, source, name, kind, repo_owner, branch, last_analyzed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (owner_user_id, source) DO UPDATE SET
       name = excluded.name, kind = excluded.kind, repo_owner = excluded.repo_owner,
       branch = excluded.branch, last_analyzed_at = excluded.last_analyzed_at`,
    ownerUserId,
    repo.source,
    repo.name,
    repo.kind,
    repo.owner ?? null,
    repo.branch ?? null,
    repo.analyzedAt,
    new Date().toISOString(),
  );
}

export async function listLinkedRepos(ownerUserId: number): Promise<LinkedRepo[]> {
  const found = await rows<{
    id: number;
    source: string;
    name: string;
    kind: string;
    repo_owner: string | null;
    branch: string | null;
    last_analyzed_at: string | null;
    created_at: string;
  }>(
    "SELECT * FROM linked_repos WHERE owner_user_id = ? ORDER BY COALESCE(last_analyzed_at, created_at) DESC",
    ownerUserId,
  );
  return found.map((r) => ({
    id: Number(r.id),
    source: r.source,
    name: r.name,
    kind: r.kind === "github" ? "github" : "local",
    owner: r.repo_owner ?? undefined,
    branch: r.branch ?? undefined,
    lastAnalyzedAt: r.last_analyzed_at,
    createdAt: r.created_at,
  }));
}

/* ------------------------------------------------------------ preferences */

export async function getTheme(userId: number): Promise<"dark" | "light"> {
  const found = await row<{ theme: string }>("SELECT theme FROM preferences WHERE user_id = ?", userId);
  return found?.theme === "light" ? "light" : "dark";
}

export async function setTheme(userId: number, theme: "dark" | "light"): Promise<void> {
  await run(
    `INSERT INTO preferences (user_id, theme) VALUES (?, ?)
     ON CONFLICT (user_id) DO UPDATE SET theme = excluded.theme`,
    userId,
    theme,
  );
}

/* ----------------------------------------------------------- github tokens */

export async function saveGithubToken(userId: number, token: string, scopes: string): Promise<void> {
  await run(
    `INSERT INTO github_tokens (user_id, token_enc, scopes, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET token_enc = excluded.token_enc, scopes = excluded.scopes,
       created_at = excluded.created_at`,
    userId,
    encryptSecret(token),
    scopes,
    new Date().toISOString(),
  );
}

export async function loadGithubToken(userId: number): Promise<{ token: string; scopes: string } | null> {
  const found = await row<{ token_enc: string; scopes: string }>(
    "SELECT token_enc, scopes FROM github_tokens WHERE user_id = ?",
    userId,
  );
  if (!found) return null;
  const token = decryptSecret(found.token_enc);
  return token ? { token, scopes: found.scopes } : null;
}

export async function deleteGithubToken(userId: number): Promise<void> {
  await run("DELETE FROM github_tokens WHERE user_id = ?", userId);
}

/** True when the stored token carries the `repo` grant (private repository access). */
export async function githubRepoAccess(userId: number): Promise<boolean> {
  const found = await row<{ scopes: string }>("SELECT scopes FROM github_tokens WHERE user_id = ?", userId);
  if (!found) return false;
  return found.scopes.split(/[,\s]+/).includes("repo");
}

/* ------------------------------------------------------------ chat history */

export interface ChatConversationRow {
  id: number;
  owner_user_id: number;
  analysis_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatConversationSummary extends ChatConversationRow {
  message_count: number;
}

export interface ChatMessageRow {
  id: number;
  conversation_id: number;
  role: "user" | "assistant";
  content: string;
  sources: string | null;
  mode: string | null;
  client_msg_id: string | null;
  created_at: string;
}

/** Escape LIKE wildcards so a user's search term is matched literally. */
const ESC = String.fromCharCode(92);
function likeTerm(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => ESC + c)}%`;
}

export async function insertConversation(
  ownerUserId: number,
  analysisId: string | null,
  title: string,
): Promise<ChatConversationRow> {
  const now = new Date().toISOString();
  const inserted = await run(
    `INSERT INTO chat_conversations (owner_user_id, analysis_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    ownerUserId,
    analysisId,
    title.slice(0, 120),
    now,
    now,
  );
  const id = Number(inserted.rows[0]?.id);
  const created = await findConversationRow(ownerUserId, id);
  if (!created) throw new Error("Conversation insert succeeded but the row is unreadable.");
  return created;
}

/** Conversations for one owner, most recently updated first, optionally
 *  filtered by analysis and/or a title/message-content search. */
export async function listConversationRows(
  ownerUserId: number,
  opts: { analysisId?: string; query?: string; limit?: number } = {},
): Promise<ChatConversationSummary[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const params: Param[] = [ownerUserId];
  let where = "WHERE c.owner_user_id = ?";
  if (opts.analysisId) {
    where += " AND c.analysis_id = ?";
    params.push(opts.analysisId);
  }
  if (opts.query) {
    // SEARCH_TERMS is inlined as placeholders; ESCAPE below matches the
    // escaped wildcard term produced by likeTerm().
    where +=
      " AND (c.title ILIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id = c.id AND m.content ILIKE ? ESCAPE '\\'))";
    params.push(likeTerm(opts.query), likeTerm(opts.query));
  }
  params.push(limit);
  const found = await rows<ChatConversationSummary>(
    `SELECT c.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id) AS message_count
       FROM chat_conversations c ${where}
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT ?`,
    ...params,
  );
  return found.map((r) => ({ ...r, message_count: Number(r.message_count) }));
}

export async function findConversationRow(ownerUserId: number, id: number): Promise<ChatConversationRow | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  return (
    (await row<ChatConversationRow>(
      "SELECT * FROM chat_conversations WHERE id = ? AND owner_user_id = ?",
      id,
      ownerUserId,
    )) ?? null
  );
}

export async function renameConversationRow(ownerUserId: number, id: number, title: string): Promise<boolean> {
  const result = await run(
    "UPDATE chat_conversations SET title = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?",
    title.slice(0, 120),
    new Date().toISOString(),
    id,
    ownerUserId,
  );
  return result.changes > 0;
}

export async function deleteConversationRow(ownerUserId: number, id: number): Promise<boolean> {
  if (!Number.isInteger(id) || id <= 0) return false;
  const result = await run(
    "DELETE FROM chat_conversations WHERE id = ? AND owner_user_id = ?",
    id,
    ownerUserId,
  );
  return result.changes > 0;
}

export async function deleteAllConversationRows(ownerUserId: number): Promise<number> {
  const result = await run("DELETE FROM chat_conversations WHERE owner_user_id = ?", ownerUserId);
  return result.changes;
}

export async function countConversationRows(ownerUserId: number): Promise<number> {
  return count("SELECT COUNT(*) AS n FROM chat_conversations WHERE owner_user_id = ?", ownerUserId);
}

/**
 * Append one message. A retry carrying the same `clientMsgId` is a no-op
 * (the partial unique index rejects the duplicate), so repeated requests
 * cannot duplicate messages. Messages without an id always append: there is
 * nothing to de-duplicate against.
 */
export async function insertChatMessage(
  conversationId: number,
  msg: {
    role: "user" | "assistant";
    content: string;
    sources?: string[] | null;
    mode?: string | null;
    clientMsgId?: string | null;
  },
): Promise<boolean> {
  const base = `INSERT INTO chat_messages
         (conversation_id, role, content, sources, mode, client_msg_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const conflict =
    msg.clientMsgId != null
      ? " ON CONFLICT (conversation_id, client_msg_id) WHERE client_msg_id IS NOT NULL DO NOTHING"
      : "";
  const result = await run(
    base + conflict,
    conversationId,
    msg.role,
    msg.content,
    msg.sources && msg.sources.length > 0 ? JSON.stringify(msg.sources) : null,
    msg.mode ?? null,
    msg.clientMsgId ?? null,
    new Date().toISOString(),
  );
  return result.changes > 0;
}

export async function listChatMessageRows(conversationId: number): Promise<ChatMessageRow[]> {
  return rows<ChatMessageRow>(
    "SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id ASC",
    conversationId,
  );
}

export async function touchConversationRow(id: number): Promise<void> {
  await run("UPDATE chat_conversations SET updated_at = ? WHERE id = ?", new Date().toISOString(), id);
}

/* ------------------------------------------------- legacy cache migration */

/**
 * One-time import of `.codeatlas/cache/*.json`: analyses that predate
 * accounts. They are stored with owner_user_id 0 (no account can own id 0):
 * readable by nobody until an operator re-runs the analysis under their
 * account. Failing closed beats guessing an owner.
 */
async function importLegacyCache(db: DbDriver): Promise<void> {
  let files: string[];
  try {
    files = fs.readdirSync(CACHE_DIR);
  } catch {
    return; // no legacy cache on this installation
  }
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), "utf8")) as Analysis;
      if (!parsed?.repo?.id || !parsed.stats) continue;
      const already = (await db.all<Record<string, unknown>>(
        "SELECT 1 AS ok FROM analyses WHERE analysis_id = ? AND owner_user_id = 0",
        [parsed.repo.id],
      ))[0];
      if (already) continue;
      const s = summaryOf(parsed);
      await db.run(
        `INSERT INTO analyses (${ANALYSIS_COLUMNS})
         VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parsed.repo.id,
          s.source,
          s.name,
          s.kind,
          parsed.repo.branch ?? null,
          parsed.repo.analyzedAt,
          s.files,
          s.lines,
          s.issues,
          s.language ?? null,
          s.clusters ?? null,
          JSON.stringify(parsed),
          new Date().toISOString(),
        ],
      );
    } catch (err) {
      console.warn(`[db] Skipped unreadable legacy cache entry ${file}:`, err instanceof Error ? err.message : err);
    }
  }
}
