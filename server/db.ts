// Persistence: accounts, sessions, per-user analyses, connected repositories,
// GitHub tokens and preferences. SQLite through `node:sqlite`, which ships with
// Node 24, so there is no native module and no database dependency.
//
// Ownership model
//
// Every user-scoped table carries `owner_user_id` (foreign key to users.id,
// ON DELETE CASCADE), and `analyses` is keyed by `(owner_user_id, analysis_id)`:
//
//   * the same source analysed by two users is two independent rows;
//   * every accessor requires an explicit owner id, which the SQL binds;
//   * rows imported from the pre-auth cache keep a NULL owner, and
//     `WHERE owner_user_id = ?` never matches NULL, so they fail closed.
//
// SQLite has no row-level security, so this guarantee is structural: the
// composite primary key makes a wrong-owner read impossible, and deletes
// cascade the workspace data away with the account.
//
// Migrations are forward-only and versioned with `PRAGMA user_version`; see
// MIGRATIONS below. Tables are never dropped and existing rows survive upgrades.

import { DatabaseSync } from "node:sqlite";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { CACHE_DIR, DB_FILE } from "./paths";
import type { Analysis, AnalysisSummary, LinkedRepo, RepoInfo, SessionUser } from "../shared/types";

/* ------------------------------------------------------------------ schema */

const MIGRATIONS: string[] = [
  // v1: accounts, sessions, per-user workspace data.
  `
  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    email          TEXT NOT NULL,
    name           TEXT NOT NULL,
    password_hash  TEXT NOT NULL DEFAULT '',
    password_salt  TEXT NOT NULL DEFAULT '',
    github_id      TEXT,
    github_login   TEXT,
    avatar_url     TEXT,
    is_admin       INTEGER NOT NULL DEFAULT 0,
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github ON users(github_id) WHERE github_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash   TEXT NOT NULL,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    user_agent   TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS analyses (
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
    updated_at    TEXT NOT NULL,
    PRIMARY KEY (owner_user_id, analysis_id)
  );
  CREATE INDEX IF NOT EXISTS idx_analyses_owner ON analyses(owner_user_id, analyzed_at DESC);

  CREATE TABLE IF NOT EXISTS linked_repos (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source           TEXT NOT NULL,
    name             TEXT NOT NULL,
    kind             TEXT NOT NULL,
    repo_owner       TEXT,
    branch           TEXT,
    last_analyzed_at TEXT,
    created_at       TEXT NOT NULL,
    UNIQUE (owner_user_id, source)
  );

  CREATE TABLE IF NOT EXISTS preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme   TEXT NOT NULL DEFAULT 'dark',
    data    TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS github_tokens (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token_enc  TEXT NOT NULL,
    scopes     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  `,
  // v2: password material was removed when GitHub became the only method.
  `
  ALTER TABLE users DROP COLUMN password_hash;
  ALTER TABLE users DROP COLUMN password_salt;
  ALTER TABLE users DROP COLUMN email_verified;
  `,
  // v3: e-mail + password sign-in returns alongside GitHub. Columns come back
  // nullable so existing GitHub-only accounts stay valid.
  `
  ALTER TABLE users ADD COLUMN password_hash TEXT;
  ALTER TABLE users ADD COLUMN password_salt TEXT;
  `,
  // v4: editable profile details on the General settings card.
  `
  ALTER TABLE users ADD COLUMN bio TEXT;
  `,
  // v5: user-defined role/designation shown in the sidebar, replacing the
  // derived "Senior Engineer"/"Staff Architect" labels.
  `
  ALTER TABLE users ADD COLUMN role TEXT;
  `,
  // v6: persistent Atlas chat history — conversations and their messages,
  // owned by the account and cascaded away with it.
  `
  CREATE TABLE IF NOT EXISTS chat_conversations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    analysis_id   TEXT,
    title         TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_conversations_owner
    ON chat_conversations(owner_user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS chat_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    sources         TEXT,
    mode            TEXT,
    client_msg_id   TEXT,
    created_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
    ON chat_messages(conversation_id, id);
  -- Retries carry the same client_msg_id, so a repeated write cannot duplicate.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client
    ON chat_messages(conversation_id, client_msg_id)
    WHERE client_msg_id IS NOT NULL;
  `,
];

/* ------------------------------------------------------------- connection */

function openDatabase(): DatabaseSync {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const database = new DatabaseSync(DB_FILE, {
    timeout: 5_000, // busy timeout: never fail a write because a reader blinked
    enableForeignKeyConstraints: true,
  });
  migrate(database);
  return database;
}

function migrate(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA user_version").get() as unknown as { user_version?: number } | undefined;
  let version = Number(row?.user_version ?? 0);
  while (version < MIGRATIONS.length) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Database migration v${version + 1} failed: ${message}`);
    }
    version += 1;
  }
}

const db = openDatabase();

export function getDb(): DatabaseSync {
  return db;
}

/* ------------------------------------------------------- secret encryption */

// GitHub OAuth tokens are encrypted at rest with a key stored beside the database
// (generated on first boot; .codeatlas/ is gitignored). Rotating that key
// invalidates stored tokens and users reconnect GitHub.

let storageKey: Buffer | null = null;

function getStorageKey(): Buffer {
  if (storageKey) return storageKey;
  const file = path.join(path.dirname(DB_FILE), "storage.key");
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
  const cipher = crypto.createCipheriv("aes-256-gcm", getStorageKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
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

function row<T>(statement: string, ...params: Array<string | number | null>): T | undefined {
  return db.prepare(statement).get(...params) as unknown as T | undefined;
}

function rows<T>(statement: string, ...params: Array<string | number | null>): T[] {
  return db.prepare(statement).all(...params) as unknown as T[];
}

function count(statement: string, ...params: Array<string | number | null>): number {
  const r = row<{ n: number }>(statement, ...params);
  return Number(r?.n ?? 0);
}

/** The first account created becomes the workspace admin (owns global AI config). */
export function countUsers(): number {
  return count("SELECT COUNT(*) AS n FROM users");
}

export function insertUser(input: NewUserInput): UserRow {
  const isAdmin = input.isAdmin ?? countUsers() === 0;
  const result = db
    .prepare(
      `INSERT INTO users (email, name, password_hash, password_salt, github_id, github_login, avatar_url, is_admin, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
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
  const created = findUserById(Number(result.lastInsertRowid));
  if (!created) throw new Error("User insert succeeded but the row is unreadable.");
  return created;
}

export function findUserById(id: number): UserRow | null {
  return row<UserRow>("SELECT * FROM users WHERE id = ?", id) ?? null;
}

export function findUserByEmail(email: string): UserRow | null {
  return row<UserRow>("SELECT * FROM users WHERE email = ?", email.trim().toLowerCase()) ?? null;
}

export function findUserByGithubId(githubId: string): UserRow | null {
  return row<UserRow>("SELECT * FROM users WHERE github_id = ?", githubId) ?? null;
}

/** Return a user row re-read after an update (or null when gone). */
export function refreshUser(userId: number): UserRow | null {
  return findUserById(userId);
}

export function linkGithub(
  userId: number,
  profile: { githubId: string; githubLogin: string; avatarUrl?: string | null },
): void {
  db.prepare(
    "UPDATE users SET github_id = ?, github_login = ?, avatar_url = COALESCE(?, avatar_url) WHERE id = ?",
  ).run(profile.githubId, profile.githubLogin, profile.avatarUrl ?? null, userId);
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

export function createSession(userId: number, tokenHash: string, expiresAtMs: number, userAgent: string | null): number {
  const now = Date.now();
  const result = db
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(tokenHash, userId, now, expiresAtMs, now, userAgent);
  return Number(result.lastInsertRowid);
}

/** Look up a live session and its account in one bound query. */
export function findSessionUser(
  tokenHash: string,
): { sessionId: number; lastSeenAt: number; user: UserRow } | null {
  const found = row<UserRow & { session_id: number; last_seen_at: number }>(
    "SELECT u.*, s.id AS session_id, s.last_seen_at AS last_seen_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    tokenHash,
    Date.now(),
  );
  return found ? { sessionId: found.session_id, lastSeenAt: found.last_seen_at, user: found } : null;
}

export function touchSession(sessionId: number): void {
  db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(Date.now(), sessionId);
}

export function deleteSession(tokenHash: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export interface SessionInfoRow {
  id: number;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  user_agent: string | null;
}

export function listSessionsFor(userId: number): SessionInfoRow[] {
  return rows<SessionInfoRow>(
    "SELECT id, created_at, last_seen_at, expires_at, user_agent FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC",
    userId,
  );
}

/** Revoke one session, scoped by owner so a user cannot delete another's. */
export function deleteSessionFor(userId: number, sessionId: number): boolean {
  const result = db.prepare("DELETE FROM sessions WHERE user_id = ? AND id = ?").run(userId, sessionId);
  return Number(result.changes) > 0;
}

export function updateProfile(
  userId: number,
  patch: { name?: string; bio?: string | null; role?: string | null; avatarUrl?: string | null },
): void {
  const sets: string[] = [];
  const params: Array<string | number | null> = [];
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
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

/** Store (or replace) the password credential for an account. */
export function setPassword(userId: number, hash: string, salt: string): void {
  db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(hash, salt, userId);
}

/** The stored password credential, when the account has one. */
export function passwordCredential(userId: number): { hash: string; salt: string } | null {
  const r = row<{ password_hash: string | null; password_salt: string | null }>(
    "SELECT password_hash, password_salt FROM users WHERE id = ?",
    userId,
  );
  if (!r?.password_hash || !r?.password_salt) return null;
  return { hash: r.password_hash, salt: r.password_salt };
}

export function purgeExpiredSessions(): void {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
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

/**
 * Store an analysis under an owner. Re-analysing the same source upserts the
 * owner's row, and two users analysing the same repository keep their own copies.
 */
export function saveAnalysisRow(ownerUserId: number, analysis: Analysis): void {
  const s = summaryOf(analysis);
  db.prepare(
    `INSERT INTO analyses
       (owner_user_id, analysis_id, source, name, kind, branch, analyzed_at, files, lines, issues, language, clusters, payload, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_user_id, analysis_id) DO UPDATE SET
       source = excluded.source, name = excluded.name, kind = excluded.kind, branch = excluded.branch,
       analyzed_at = excluded.analyzed_at, files = excluded.files, lines = excluded.lines,
       issues = excluded.issues, language = excluded.language, clusters = excluded.clusters,
       payload = excluded.payload, updated_at = excluded.updated_at`,
  ).run(
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

export function loadAnalysisRow(ownerUserId: number, analysisId: string): Analysis | null {
  if (!ID_PATTERN.test(analysisId)) return null;
  const found = row<{ payload: string }>(
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

export function deleteAnalysisRow(ownerUserId: number, analysisId: string): boolean {
  if (!ID_PATTERN.test(analysisId)) return false;
  const result = db
    .prepare("DELETE FROM analyses WHERE owner_user_id = ? AND analysis_id = ?")
    .run(ownerUserId, analysisId);
  return Number(result.changes) > 0;
}

export function listAnalysisRows(ownerUserId: number): AnalysisSummary[] {
  const found = rows<{
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
    files: r.files,
    lines: r.lines,
    issues: r.issues,
    language: r.language ?? undefined,
    clusters: r.clusters ?? undefined,
  }));
}

export function analysisExistsFor(ownerUserId: number, analysisId: string): boolean {
  if (!ID_PATTERN.test(analysisId)) return false;
  return Boolean(
    row("SELECT 1 AS ok FROM analyses WHERE owner_user_id = ? AND analysis_id = ?", ownerUserId, analysisId),
  );
}

/** Aggregates over *this owner's* rows only (NULL-owner legacy rows never match). */
export function workspaceStats(ownerUserId: number): {
  repositories: number;
  analyses: number;
  files: number;
  lines: number;
  findings: number;
} {
  const repoCount = count("SELECT COUNT(*) AS n FROM linked_repos WHERE owner_user_id = ?", ownerUserId);
  const totals = row<{ n: number; files: number; lines: number; issues: number }>(
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

export function upsertLinkedRepo(ownerUserId: number, repo: RepoInfo): void {
  db.prepare(
    `INSERT INTO linked_repos (owner_user_id, source, name, kind, repo_owner, branch, last_analyzed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_user_id, source) DO UPDATE SET
       name = excluded.name, kind = excluded.kind, repo_owner = excluded.repo_owner,
       branch = excluded.branch, last_analyzed_at = excluded.last_analyzed_at`,
  ).run(
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

export function listLinkedRepos(ownerUserId: number): LinkedRepo[] {
  return rows<{
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
  ).map((r) => ({
    id: r.id,
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

export function getTheme(userId: number): "dark" | "light" {
  const found = row<{ theme: string }>("SELECT theme FROM preferences WHERE user_id = ?", userId);
  return found?.theme === "light" ? "light" : "dark";
}

export function setTheme(userId: number, theme: "dark" | "light"): void {
  db.prepare(
    `INSERT INTO preferences (user_id, theme) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme`,
  ).run(userId, theme);
}

/* ----------------------------------------------------------- github tokens */

export function saveGithubToken(userId: number, token: string, scopes: string): void {
  db.prepare(
    `INSERT INTO github_tokens (user_id, token_enc, scopes, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET token_enc = excluded.token_enc, scopes = excluded.scopes,
       created_at = excluded.created_at`,
  ).run(userId, encryptSecret(token), scopes, new Date().toISOString());
}

export function loadGithubToken(userId: number): { token: string; scopes: string } | null {
  const found = row<{ token_enc: string; scopes: string }>(
    "SELECT token_enc, scopes FROM github_tokens WHERE user_id = ?",
    userId,
  );
  if (!found) return null;
  const token = decryptSecret(found.token_enc);
  return token ? { token, scopes: found.scopes } : null;
}

export function deleteGithubToken(userId: number): void {
  db.prepare("DELETE FROM github_tokens WHERE user_id = ?").run(userId);
}

/** True when the stored token carries the `repo` grant (private repository access). */
export function githubRepoAccess(userId: number): boolean {
  const found = row<{ scopes: string }>("SELECT scopes FROM github_tokens WHERE user_id = ?", userId);
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
function likeTerm(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function insertConversation(
  ownerUserId: number,
  analysisId: string | null,
  title: string,
): ChatConversationRow {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO chat_conversations (owner_user_id, analysis_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(ownerUserId, analysisId, title.slice(0, 120), now, now);
  const created = findConversationRow(ownerUserId, Number(result.lastInsertRowid));
  if (!created) throw new Error("Conversation insert succeeded but the row is unreadable.");
  return created;
}

/** Conversations for one owner, most recently updated first, optionally
 *  filtered by analysis and/or a title/message-content search. */
export function listConversationRows(
  ownerUserId: number,
  opts: { analysisId?: string; query?: string; limit?: number } = {},
): ChatConversationSummary[] {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const params: Array<string | number> = [ownerUserId];
  let where = "WHERE c.owner_user_id = ?";
  if (opts.analysisId) {
    where += " AND c.analysis_id = ?";
    params.push(opts.analysisId);
  }
  if (opts.query) {
    where +=
      " AND (c.title LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id = c.id AND m.content LIKE ? ESCAPE '\\'))";
    params.push(likeTerm(opts.query), likeTerm(opts.query));
  }
  params.push(limit);
  return rows<ChatConversationSummary>(
    `SELECT c.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id) AS message_count
       FROM chat_conversations c ${where}
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT ?`,
    ...params,
  );
}

export function findConversationRow(ownerUserId: number, id: number): ChatConversationRow | null {
  if (!Number.isInteger(id) || id <= 0) return null;
  return (
    row<ChatConversationRow>(
      "SELECT * FROM chat_conversations WHERE id = ? AND owner_user_id = ?",
      id,
      ownerUserId,
    ) ?? null
  );
}

export function renameConversationRow(ownerUserId: number, id: number, title: string): boolean {
  const result = db
    .prepare(
      "UPDATE chat_conversations SET title = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?",
    )
    .run(title.slice(0, 120), new Date().toISOString(), id, ownerUserId);
  return Number(result.changes) > 0;
}

export function deleteConversationRow(ownerUserId: number, id: number): boolean {
  if (!Number.isInteger(id) || id <= 0) return false;
  const result = db
    .prepare("DELETE FROM chat_conversations WHERE id = ? AND owner_user_id = ?")
    .run(id, ownerUserId);
  return Number(result.changes) > 0;
}

export function deleteAllConversationRows(ownerUserId: number): number {
  const result = db.prepare("DELETE FROM chat_conversations WHERE owner_user_id = ?").run(ownerUserId);
  return Number(result.changes);
}

export function countConversationRows(ownerUserId: number): number {
  return count("SELECT COUNT(*) AS n FROM chat_conversations WHERE owner_user_id = ?", ownerUserId);
}

/**
 * Append one message. A retry carrying the same `clientMsgId` is a no-op
 * (the partial unique index rejects the duplicate), so repeated requests
 * cannot duplicate messages.
 */
export function insertChatMessage(
  conversationId: number,
  msg: {
    role: "user" | "assistant";
    content: string;
    sources?: string[] | null;
    mode?: string | null;
    clientMsgId?: string | null;
  },
): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO chat_messages
         (conversation_id, role, content, sources, mode, client_msg_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      conversationId,
      msg.role,
      msg.content,
      msg.sources && msg.sources.length > 0 ? JSON.stringify(msg.sources) : null,
      msg.mode ?? null,
      msg.clientMsgId ?? null,
      new Date().toISOString(),
    );
  return Number(result.changes) > 0;
}

export function listChatMessageRows(conversationId: number): ChatMessageRow[] {
  return rows<ChatMessageRow>(
    "SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id ASC",
    conversationId,
  );
}

export function touchConversationRow(id: number): void {
  db.prepare("UPDATE chat_conversations SET updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    id,
  );
}

/* ------------------------------------------------- legacy cache migration */

/**
 * One-time import of `.codeatlas/cache/*.json`: analyses that predate
 * accounts. They are stored with a NULL owner: readable by nobody until an
 * operator re-runs the analysis under their account. Failing closed beats
 * guessing an owner.
 */
function importLegacyCache(): void {
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
      const already = row(
        "SELECT 1 AS ok FROM analyses WHERE analysis_id = ? AND owner_user_id IS NULL",
        parsed.repo.id,
      );
      if (already) continue;
      const s = summaryOf(parsed);
      db.prepare(
        `INSERT INTO analyses
           (owner_user_id, analysis_id, source, name, kind, branch, analyzed_at, files, lines, issues, language, clusters, payload, updated_at)
         VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
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
      );
    } catch (err) {
      console.warn(`[db] Skipped unreadable legacy cache entry ${file}:`, err instanceof Error ? err.message : err);
    }
  }
}

importLegacyCache();
purgeExpiredSessions();
