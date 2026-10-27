// Connection lifecycle and the bound, parameterised query helpers every
// repository module is written against. Importing db/core has no side
// effects; the connection opens lazily on the first query.

import * as path from "node:path";
import { DATA_DIR } from "../paths";
import { makePostgres, makePglite, type DbDriver, type RunResult } from "./driver";
import { MIGRATIONS } from "./schema";

export type Param = string | number | null | Buffer;

/* --------------------------------------------------------- boot registry */

/** Runs once after migrations, with the freshly opened driver. */
type BootTask = (db: DbDriver) => Promise<void>;

const bootTasks: BootTask[] = [];

/** Repositories register one-time post-migration work (expiry purges, legacy imports). */
export function registerBootTask(task: BootTask): void {
  bootTasks.push(task);
}

/* ------------------------------------------------------------- lifecycle */

const DATABASE_URL = process.env.DATABASE_URL?.trim() || "";

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
    for (const task of bootTasks) await task(next);
  } catch (err) {
    await next.close().catch(() => undefined);
    throw err;
  }
  return next;
}

/** Lazily initialises the connection so merely importing the module has no side effects. */
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

/* --------------------------------------------------------- query helpers */

export async function row<T>(sql: string, ...params: Param[]): Promise<T | undefined> {
  const db = await ready();
  const found = await db.all<T>(sql, params);
  return found[0];
}

export async function rows<T>(sql: string, ...params: Param[]): Promise<T[]> {
  const db = await ready();
  return db.all<T>(sql, params);
}

export async function run(sql: string, ...params: Param[]): Promise<RunResult> {
  const db = await ready();
  return db.run(sql, params);
}

export async function count(statement: string, ...params: Param[]): Promise<number> {
  const found = await row<{ n: number }>(statement, ...params);
  return Number(found?.n ?? 0);
}

/** Test support: a raw, parameterised read of the current database. */
export function rawQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return ready().then((db) => db.all<T>(sql, params));
}

/**
 * Migrates the schema and applies the post-migration boot tasks. Exposed for
 * eager boots (for example when an operator wants the error at npm start).
 */
export async function initializeDb(): Promise<void> {
  await ready();
}