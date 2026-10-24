// Loads an optional `.env` from the project root before configuration is read.
//
// Credentials (GitHub OAuth, AI keys) and deployment knobs (`CODEATLAS_DATA_DIR`,
// `CODEATLAS_LOCAL_ROOTS`) should not require code edits. Node's loader does the
// parsing; this wrapper only makes it optional and idempotent.
//
// Precedence matches `node --env-file`: values already in the environment win, so
// a stray `.env` cannot redirect a test run away from its isolated data directory.

import * as fs from "node:fs";
import * as path from "node:path";

let loaded: string | null | undefined;

/**
 * Load `<root>/.env` into process.env. Returns the loaded path, or null when the
 * file is missing. A malformed file is logged and never fatal.
 */
export function loadEnvFile(root: string = process.cwd()): string | null {
  if (loaded !== undefined) return loaded;

  const file = path.join(root, ".env");
  loaded = null;

  if (typeof process.loadEnvFile !== "function" || !fs.existsSync(file)) return loaded;

  try {
    process.loadEnvFile(file);
    loaded = file;
    console.log(`[env] loaded ${path.relative(root, file) || ".env"}`);
  } catch (err) {
    console.warn(`[env] could not read ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return loaded;
}
