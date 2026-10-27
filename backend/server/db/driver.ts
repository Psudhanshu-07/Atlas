// Database drivers: the minimal query surface the repositories are written
// against. Postgres semantics in both implementations — `pg` (production,
// DATABASE_URL) and embedded PGlite (local development and tests).

import * as fs from "node:fs";

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
export interface DbDriver {
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

/** `?` → `$1`, `$2`, … in order; the SQL here never quotes a literal `?`. */
function numbered(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function makePostgres(url: string): Promise<DbDriver> {
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
    await pool.end().catch(() => undefined);
    // Dual-stack connect attempts wrap the inner failure in an AggregateError
    // whose top-level message is empty — the error the user would see would
    // read "DATABASE_URL is unreachable: ." and name no cause. Unwrap the
    // first attempt so the banner says ECONNREFUSED/ENOTFOUND/ETIMEDOUT and
    // points at the real problem (wrong port, paused project, bad host).
    const wrapper = err as NodeJS.ErrnoException & { errors?: unknown[] };
    const first: NodeJS.ErrnoException | undefined =
      wrapper.errors && wrapper.errors.length > 0 && wrapper.errors[0] instanceof Error
        ? (wrapper.errors[0] as NodeJS.ErrnoException)
        : (err instanceof Error ? (err as NodeJS.ErrnoException) : undefined);
    const code = first?.code ?? wrapper.code;
    const message = first?.message || (err instanceof Error ? err.message : String(err));
    throw new Error(
      `DATABASE_URL is unreachable${code ? ` (${code})` : ""}: ${message}. Check the Supabase connection string (Project Settings → Database).`,
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

export async function makePglite(dataDir: string): Promise<DbDriver> {
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