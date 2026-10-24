// One-shot seeding helper for the isolation suite: point CODEATLAS_DATA_DIR at
// an (empty) directory and give the initial admin account as JSON on stdin.
// Every PGlite database directory allows a single writer process, so test
// fixtures seed through short-lived helper processes rather than opening the
// server's directory from the runner.
//
// Usage: node_modules/.bin/tsx backend/tests/fixtures/seed-db.ts < users.json

import * as db from "../../server/db";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += String(chunk);
});
process.stdin.on("end", async () => {
  try {
    const input = JSON.parse(raw.trim() || "{}") as Parameters<typeof db.insertUser>[0];
    await db.initializeDb();
    const row = await db.insertUser(input);
    process.stdout.write(JSON.stringify({ id: row.id }));
    await db.closeDb();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
});
