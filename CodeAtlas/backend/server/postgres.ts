/**
 * PostgreSQL runtime primitives.
 *
 * The SQLite `db.ts` module remains the default and is intentionally loaded
 * by tests and local development when DATABASE_URL is absent. Deployments may
 * use this module explicitly after setting DATABASE_URL; keeping the pool
 * isolated avoids changing the synchronous SQLite API accidentally.
 */
import { Pool, type QueryResultRow } from "pg";
import * as fs from "node:fs";
import * as path from "node:path";

export function validateDatabaseUrl(value = process.env.DATABASE_URL): string {
  if (!value) throw new Error("DATABASE_URL is required for PostgreSQL.");
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("DATABASE_URL must be a valid PostgreSQL URL."); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("DATABASE_URL must use postgres:// or postgresql:// and include a host.");
  }
  return value;
}

export function createPostgresPool(): Pool {
  return new Pool({ connectionString: validateDatabaseUrl(), max: 10 });
}

export async function migratePostgres(pool: Pool): Promise<void> {
  const schema = fs.readFileSync(path.join(process.cwd(), "backend", "database", "schema.sql"), "utf8");
  await pool.query(schema);
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  pool: Pool,
  text: string,
  values: readonly unknown[] = [],
): Promise<T[]> {
  return (await pool.query<T>(text, values as unknown[])).rows;
}
