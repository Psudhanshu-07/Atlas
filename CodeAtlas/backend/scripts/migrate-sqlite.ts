/**
 * Explicit, one-way SQLite import. Usage:
 *   DATABASE_URL=... npm run db:import -- path/to/.codeatlas/atlas.db
 *
 * DATABASE_URL is never printed. The command refuses to run unless both the
 * URL and SQLite path are explicitly supplied.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { migratePostgres, validateDatabaseUrl } from "../server/postgres";

const sqlitePath = process.argv[2];
if (!sqlitePath || !fs.existsSync(sqlitePath)) {
  throw new Error("Usage: DATABASE_URL=postgresql://... npm run db:import -- <sqlite-path>");
}
const url = validateDatabaseUrl();
const sqlite = new DatabaseSync(path.resolve(sqlitePath), { enableForeignKeyConstraints: false });
const pool = new Pool({ connectionString: url });
const tables = ["users", "sessions", "analyses", "linked_repos", "preferences", "github_tokens", "chat_conversations", "chat_messages"];
const targetColumns: Record<string, string[]> = {
  users: ["id", "email", "name", "password_hash", "password_salt", "github_id", "github_login", "avatar_url", "is_admin", "bio", "role", "created_at"],
  sessions: ["id", "token_hash", "user_id", "created_at", "expires_at", "last_seen_at", "user_agent"],
  analyses: ["owner_user_id", "analysis_id", "source", "name", "kind", "branch", "analyzed_at", "files", "lines", "issues", "language", "clusters", "payload", "updated_at"],
  linked_repos: ["id", "owner_user_id", "source", "name", "kind", "repo_owner", "branch", "last_analyzed_at", "created_at"],
  preferences: ["user_id", "theme", "data"],
  github_tokens: ["user_id", "token_enc", "scopes", "created_at"],
  chat_conversations: ["id", "owner_user_id", "analysis_id", "title", "created_at", "updated_at"],
  chat_messages: ["id", "conversation_id", "role", "content", "sources", "mode", "client_msg_id", "created_at"],
};
try {
  await migratePostgres(pool);
  await pool.query("BEGIN");
  for (const table of tables) {
    const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.length) continue;
    const names = columns.map((c) => c.name).filter((name) => targetColumns[table].includes(name));
    const rows = sqlite.prepare(`SELECT ${names.map((n) => `"${n}"`).join(",")} FROM "${table}"`).all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      const values = names.map((name) => row[name]);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(",");
      await pool.query(`INSERT INTO "${table}" ("${names.join('","')}") VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values);
    }
    if (["users", "sessions", "linked_repos", "chat_conversations", "chat_messages"].includes(table)) {
      await pool.query(`SELECT setval(pg_get_serial_sequence('${table}','id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1), true)`);
    }
  }
  await pool.query("COMMIT");
  console.log("SQLite import completed.");
} catch (error) {
  await pool.query("ROLLBACK");
  throw error instanceof Error ? new Error(`SQLite import failed: ${error.message}`) : error;
} finally {
  sqlite.close();
  await pool.end();
}
