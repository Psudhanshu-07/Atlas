// Accounts, sessions, profile details and the visible preference (theme).
// Every session accessor is bound to the owning account; revocations are
// scoped by owner so one user cannot end another's sign-in.

import type { SessionUser } from "../../../shared/types";
import type { DbDriver } from "./driver";
import { registerBootTask, row, rows, run, count } from "./core";
import type { Param } from "./core";

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

interface NewUserInput {
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
async function countUsers(): Promise<number> {
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

interface SessionInfoRow {
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

/** Removes sessions that have expired (registered as a boot task). */
async function purgeExpiredSessions(db: DbDriver): Promise<void> {
  await db.run("DELETE FROM sessions WHERE expires_at <= ?", [Date.now()]);
}registerBootTask(purgeExpiredSessions);

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
