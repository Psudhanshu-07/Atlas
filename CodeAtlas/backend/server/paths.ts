// Filesystem locations used by the server: data root, repository checkouts and
// the SQLite file. Kept separate so `repos.ts` and `db.ts` can share them
// without importing each other.

import * as path from "node:path";
import { loadEnvFile } from "./env";

export const PROJECT_ROOT = process.cwd();

// `.env` is loaded here because every entry point resolves a path first, and the
// variables below are read at module scope.
loadEnvFile(PROJECT_ROOT);

/**
 * Runtime data root. `CODEATLAS_DATA_DIR` points tests and multi-instance
 * deployments at an isolated directory.
 */
export const DATA_DIR = process.env.CODEATLAS_DATA_DIR
  ? path.resolve(process.env.CODEATLAS_DATA_DIR)
  : path.join(PROJECT_ROOT, ".codeatlas");

export const REPOS_DIR = path.join(DATA_DIR, "repos");

/** Pre-auth flat-file cache. Imported into the database once, then read-only. */
export const CACHE_DIR = path.join(DATA_DIR, "cache");

/** SQLite database file: accounts, sessions, per-user analyses. */
export const DB_FILE = path.join(DATA_DIR, "codeatlas.db");
