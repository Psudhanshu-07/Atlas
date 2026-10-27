// Smoke test for a DEPLOYED environment. Run after every deployment:
//   BASE_URL=https://atlas-4rkf.onrender.com npm run smoke
// It exercises the public surface only (no credentials involved): health,
// the SPA shell, security headers, the auth guard and error shape.
export {}; // keep module semantics; the compiled output targets CJS

const BASE = process.env.BASE_URL;
if (!BASE) {
  console.error("Usage: BASE_URL=https://<deploy>.onrender.com npm run smoke");
  process.exit(2);
}
const url = (path: string): string => new URL(path, BASE).href;

const failures: string[] = [];
let passCount = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "  ok " : "FAIL"}  ${name}${pass || !detail ? "" : ` — ${detail}`}`);
  if (pass) passCount += 1;
};
const run = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (err) {
    failures.push(name);
    ok(name, false, err instanceof Error ? err.message : String(err));
  }
};

async function main(): Promise<void> {
  await run("GET /api/health → 200 {ok:true}", async () => {
    const r = await fetch(url("/api/health"));
    const b = (await r.json()) as { ok?: boolean };
    if (r.status !== 200 || !b.ok) throw new Error(`status ${r.status} body ${JSON.stringify(b)}`);
    ok("GET /api/health", true);
  });

  await run("SPA shell serves the Atlas document", async () => {
    const r = await fetch(url("/"));
    const html = await r.text();
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if (!/Atlas/.test(html) || !/<div id="root">/.test(html)) throw new Error("not the SPA shell");
    ok("SPA shell", true);
  });

  await run("Security headers present (nosniff, frame-deny, HSTS)", async () => {
    const r = await fetch(url("/api/health"));
    const h = r.headers;
    const pass =
      h.get("x-content-type-options") === "nosniff" &&
      h.get("x-frame-options") === "DENY" &&
      /max-age=\d+/.test(h.get("strict-transport-security") ?? "");
    if (!pass) throw new Error(`headers: ${JSON.stringify([...h.keys()])}`);
    ok("security headers", true);
  });

  await run("Protected API rejects anonymous callers with 401 JSON", async () => {
    const r = await fetch(url("/api/analyses"));
    const b = (await r.json().catch(() => null)) as { error?: string } | null;
    if (r.status !== 401 || !b?.error) throw new Error(`status ${r.status}`);
    ok("auth guard 401", true);
  });

  await run("Unknown API route → 404 JSON (not an HTML page)", async () => {
    const r = await fetch(url("/api/__smoke_no_such_route__"));
    const b = (await r.json().catch(() => null)) as { error?: string } | null;
    if (r.status !== 404 || !b?.error) throw new Error(`status ${r.status}`);
    ok("unknown route 404", true);
  });
}

main()
  .then(() => {
    if (failures.length > 0) {
      console.error(`\nSMOKE FAILED: ${failures.length} check(s) failed:\n - ${failures.join("\n - ")}`);
      process.exit(1);
    }
    console.log(`\nSMOKE PASSED (${passCount} checks)`);
  })
  .catch((err) => {
    console.error("smoke crashed:", err);
    process.exit(2);
  });
