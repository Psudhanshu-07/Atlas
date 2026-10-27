// Multi-tenant security acceptance test.
//
// Spawns the real API server on an isolated data directory and asserts:
//
//   1. unauthenticated callers reach no workspace route;
//   2. e-mail + password sign-up/sign-in works end to end (register, login,
//      duplicate/weak-credential rejection) and sessions are stored hashed;
//   3. the OAuth round-trip works against a stubbed GitHub: authorize redirect
//      with client id and scopes, state validation, rejected codes, session
//      creation, identity resolution, and no repository list without the grant;
//   4. User A analyses two repositories, including the demo-app baseline
//      (11 findings / 42 files / 538 lines / 8 clusters / 71 edges);
//   5. User B analyses the *same* source as A: same source-derived id, its own
//      row;
//   6. every direct-API attempt by B against A's analyses, files, jobs,
//      dashboards, preferences and deletions is refused;
//   7. global config writes are admin-only;
//   8. local-path analysis is confined to the allowed roots;
//   9. sessions survive logout and re-minting;
//  10. the GitHub tarball checkout works against a public repository.
//
// Accounts are seeded through the real persistence layer so the multi-tenant
// checks do not depend on OAuth credentials; the password routes are exercised
// live against the same server.
// Run: npm test — exits non-zero if any assertion fails.

import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";

const PORT = Number(process.env.TEST_PORT ?? 3107);
const BASE = `http://127.0.0.1:${PORT}`;
const PROJECT_ROOT = process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, ".tmp", `test-atlas-${process.pid}`);

// The tarball check imports server modules in *this* process — point its data
// directory at the isolated one before any dynamic import below loads db.ts.
// DATABASE_URL is pinned to the empty string so the suite exercises the
// embedded local Postgres (PGlite) even when the host has a Supabase URL set.
process.env.CODEATLAS_DATA_DIR = DATA_DIR;
process.env.DATABASE_URL = "";

const VERBOSE = Boolean(process.env.VERBOSE);

/* ------------------------------------------------------------ tiny runner */

let passed = 0;
const failures: string[] = [];

function section(title: string): void {
  console.log(`\n=== ${title}`);
}

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    const line = detail ? `${name} — ${detail}` : name;
    failures.push(line);
    console.log(`  FAIL ${line}`);
  }
}

/* --------------------------------------------------------------- http API */

interface Reply<T = any> {
  status: number;
  body: T;
}

/** Reply from an endpoint that answers with a redirect rather than JSON. */
interface RawReply {
  status: number;
  location: string;
  setCookie: string[];
}

class Session {
  cookie: string | null = null;

  async request<T = any>(
    method: string,
    urlPath: string,
    body?: unknown,
    opts: { base?: string } = {},
  ): Promise<Reply<T>> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.cookie) headers.cookie = this.cookie;
    const res = await fetch((opts.base ?? BASE) + urlPath, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const raw of res.headers.getSetCookie()) {
      const match = raw.match(/ca_sid=([^;]*)/);
      if (match) this.cookie = match[1] ? `ca_sid=${match[1]}` : null;
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json as T };
  }

  /** A redirect endpoint: do not follow, report status, Location and cookies. */
  async requestRaw(method: string, url: string, opts: { cookie?: string } = {}): Promise<RawReply> {
    const headers: Record<string, string> = {};
    const cookie = opts.cookie ?? this.cookie;
    if (cookie) headers.cookie = cookie;
    const res = await fetch(url, { method, headers, redirect: "manual" });
    const setCookie = res.headers.getSetCookie();
    for (const raw of setCookie) {
      const match = raw.match(/ca_sid=([^;]*)/);
      if (match) this.cookie = match[1] ? `ca_sid=${match[1]}` : null;
    }
    return { status: res.status, location: res.headers.get("location") ?? "", setCookie };
  }
}

const anon = new Session();
const alice = new Session();
const bob = new Session();
/** Drives the OAuth round-trip against the stubbed GitHub. */
const carol = new Session();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------ stub GitHub */

const STUB_PORT = PORT + 1;

/**
 * Minimal GitHub stand-in: an OAuth token endpoint plus the two profile
 * endpoints the server reads. Any code except "bad-code" exchanges fine, so
 * the suite can exercise both the success and the failure path of the callback.
 */
function startStubGithub(): Promise<http.Server> {
  const json = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${STUB_PORT}`);
    if (url.pathname === "/login/oauth/access_token" && req.method === "POST") {
      let body = "";
      req.on("data", (c: Buffer) => (body += c.toString()));
      req.on("end", () => {
        // The server posts JSON; parse that, tolerating form encoding too.
        let code = "";
        try {
          code = String(JSON.parse(body).code ?? "");
        } catch {
          code = String(new URLSearchParams(body).get("code") ?? "");
        }
        if (code === "bad-code") {
          // GitHub answers HTTP 402 with a JSON error for a rejected code.
          res.writeHead(402, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "bad_verification_code", error_description: "The code passed is incorrect." }));
          return;
        }
        json(res, 200, { access_token: "stub-token-carol", scope: "read:user user:email" });
      });
      return;
    }
    if (url.pathname === "/user") {
      json(res, 200, { id: 3003, login: "carol-stub", name: "Carol Stub", avatar_url: null });
      return;
    }
    if (url.pathname === "/user/emails") {
      json(res, 200, [{ email: "carol@stub.test", primary: true, verified: true }]);
      return;
    }
    json(res, 404, { message: "Not Found" });
  });
  return new Promise((resolve) => server.listen(STUB_PORT, "127.0.0.1", () => resolve(server)));
}

/* ---------------------------------------------------------- identity seed */

type Db = typeof import("../../backend/server/db");
let db: Db;

const sessionTokens: Record<string, string> = { alice: "", bob: "" };

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Create the two accounts this suite drives, in an empty data directory. */
async function seedAccounts(): Promise<{ aliceId: number; bobId: number }> {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = await import("../../backend/server/db");
  const aliceRow = await db.insertUser({
    email: "alice@isolation.test",
    name: "Alice Anders",
    githubId: "1001",
    githubLogin: "alice-gh",
  });
  const bobRow = await db.insertUser({
    email: "bob@isolation.test",
    name: "Bob Builder",
    githubId: "1002",
    githubLogin: "bob-gh",
  });
  return { aliceId: aliceRow.id, bobId: bobRow.id };
}

/** Mint a session row and point the matching HTTP client at its cookie. */
async function mintSession(who: string, userId: number, client: Session): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  sessionTokens[who] = token;
  await db.createSession(userId, sha256(token), Date.now() + 60 * 60_000, `isolation-test-${who}`);
  client.cookie = `ca_sid=${token}`;
}

// tsx compiles the server on first run; a cold start after large edits can take a
// while, so allow well over the observed worst case before calling it a failure.
async function waitForHealth(timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`server did not become healthy on ${BASE}`);
}

async function analyzeAndWait(session: Session, source: string, timeoutMs = 240_000): Promise<any> {
  const started = await session.request("POST", "/api/analyze", { source });
  assert.equal(started.status, 202, `analyze(${source}) → ${started.status}: ${JSON.stringify(started.body)}`);
  const jobId = started.body.jobId as string;
  const deadline = Date.now() + timeoutMs;
  let last: any = null;
  while (Date.now() < deadline) {
    const reply = await session.request("GET", `/api/jobs/${jobId}`);
    assert.equal(reply.status, 200, `job poll → ${reply.status}`);
    last = reply.body;
    if (reply.body.status !== "running") {
      if (reply.body.status === "error") {
        throw new Error(`analysis of ${source} failed: ${reply.body.error}`);
      }
      return { jobId, job: reply.body };
    }
    await sleep(400);
  }
  throw new Error(`analysis of ${source} timed out: ${JSON.stringify(last?.stages)}`);
}

/* ------------------------------------------------------------- the server */

function logServer(label: string) {
  return (stream: "stdout" | "stderr") => (data: Buffer) => {
    if (VERBOSE) process.stdout.write(`[${label}:${stream}] ${data.toString()}`);
  };
}

function startServer(): ChildProcess {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "backend/server/index.ts"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      CODEATLAS_DATA_DIR: DATA_DIR,
      // Unconfigured by default, so the suite exercises the setup-screen path
      // (503 from the OAuth start endpoint) regardless of the host environment.
      GITHUB_CLIENT_ID: "",
      GITHUB_CLIENT_SECRET: "",
      DATABASE_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = logServer("server");
  child.stdout?.on("data", log("stdout"));
  child.stderr?.on("data", log("stderr"));
  return child;
}

/* ------------------------------------------------------------------- main */

async function main(): Promise<void> {
  // Phase A (no server yet): seed the accounts and the two sessions directly
  // through the persistence layer. PGlite data directories allow one writer
  // process, so every direct-DB step happens before the server (or any other
  // process) opens the same directory.
  section("Seeded accounts and hashed sessions");
  const seeded = await seedAccounts();
  await mintSession("alice", seeded.aliceId, alice);
  await mintSession("bob", seeded.bobId, bob);
  // A second, never-issued alice session, minted while the fixture still owns
  // the directory: PGlite allows a single writer process per data directory, so
  // once the server opens it the fixture can no longer insert a session row
  // directly. The post-logout section walks alice back to this token instead.
  await mintSession("alice-refresh", seeded.aliceId, new Session());
  const rawToken = sessionTokens.alice;
  const rawRows = await db.rawQuery<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM sessions WHERE token_hash = ?",
    [rawToken],
  );
  const hashRows = await db.rawQuery<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM sessions WHERE token_hash = ?",
    [sha256(rawToken)],
  );
  check(
    "session tokens are stored hashed, never raw",
    rawRows[0]?.n === 0 && hashRows[0]?.n === 1,
    `raw matches: ${rawRows[0]?.n}, hash matches: ${hashRows[0]?.n}`,
  );
  // Release the embedded database so the server process can take the directory.
  await db.closeDb();

  const server = startServer();
  const stubGithub = await startStubGithub();
  let tarballImport: typeof import("../../backend/server/repos") | null = null;

  try {
    await waitForHealth();

    /* -------------------------------------------------- 1. anonymous surface */
    section("Unauthenticated callers reach no workspace route");
    check("health is public", (await anon.request("GET", "/api/health")).status === 200);
    check(
      "providers is public",
      (await anon.request("GET", "/api/auth/providers")).status === 200,
    );
    check("analyses → 401", (await anon.request("GET", "/api/analyses")).status === 401);
    check("dashboard → 401", (await anon.request("GET", "/api/dashboard")).status === 401);
    check("analyze → 401", (await anon.request("POST", "/api/analyze", { source: "x" })).status === 401);
    check("jobs → 401", (await anon.request("GET", "/api/jobs/anything")).status === 401);
    check("config → 401", (await anon.request("GET", "/api/config")).status === 401);
    check("preferences → 401", (await anon.request("GET", "/api/preferences")).status === 401);
    check("github repos → 401", (await anon.request("GET", "/api/github/repos")).status === 401);
    check("profile → 401", (await anon.request("POST", "/api/auth/profile", { name: "x" })).status === 401);

    /* -------------------------------- 2. password accounts + hashed sessions */
    section("E-mail + password sign-up/sign-in and server-minted sessions");

    check("providers endpoint is public (200)", (await anon.request("GET", "/api/auth/providers")).status === 200);
    // A dedicated client so the anonymous session keeps its clean cookie.
    const dana = new Session();
    check(
      "register rejects a weak password (400)",
      (await dana.request("POST", "/api/auth/register", { email: "dana@isolation.test", password: "short" })).status === 400,
    );
    check(
      "register rejects an invalid e-mail (400)",
      (await dana.request("POST", "/api/auth/register", { email: "not-an-email", password: "correct-horse-1" })).status === 400,
    );
    const registered = await dana.request("POST", "/api/auth/register", {
      email: "dana@isolation.test",
      password: "correct-horse-1",
      name: "Dana Diaz",
    });
    check(
      "register creates the account and a session (200)",
      registered.status === 200 && registered.body?.user?.email === "dana@isolation.test",
      JSON.stringify(registered.body),
    );
    const meDana = await dana.request("GET", "/api/auth/me");
    check(
      "the register-issued cookie resolves a session",
      meDana.status === 200 && meDana.body?.user?.email === "dana@isolation.test" && meDana.body?.user?.isAdmin === false,
      JSON.stringify(meDana.body),
    );
    check(
      "register refuses a duplicate e-mail (409)",
      (await dana.request("POST", "/api/auth/register", { email: "dana@isolation.test", password: "correct-horse-2" })).status === 409,
    );
    const badLogin = await dana.request("POST", "/api/auth/login", { email: "dana@isolation.test", password: "wrong-password-1" });
    check("login rejects a wrong password (401)", badLogin.status === 401, JSON.stringify(badLogin.body));
    check(
      "login rejects an unknown e-mail with the same 401",
      (await dana.request("POST", "/api/auth/login", { email: "nobody@isolation.test", password: "correct-horse-1" })).status === 401,
    );
    dana.cookie = null;
    const relogin = await dana.request("POST", "/api/auth/login", { email: "dana@isolation.test", password: "correct-horse-1" });
    check(
      "login with the right password re-mints a session (200)",
      relogin.status === 200 && relogin.body?.user?.email === "dana@isolation.test",
      JSON.stringify(relogin.body),
    );
    // Bob is a GitHub-only account in the seed. The password-change endpoint
    // must refuse him politely, and the GitHub unlink endpoint must refuse
    // while GitHub is his only way back in.
    const pwChange = await bob.request("POST", "/api/auth/password", { current: "aaaa", next: "new-password-1" });
    const ghUnlink = await bob.request("POST", "/api/auth/github/disconnect");
    check(
      "github-only account cannot change password or unlink GitHub",
      pwChange.status === 400 && /no password/i.test(pwChange.body?.error ?? "") &&
        ghUnlink.status === 400 && /only sign-in/i.test(ghUnlink.body?.error ?? ""),
      `password: ${pwChange.status} ${JSON.stringify(pwChange.body)}; github: ${ghUnlink.status} ${JSON.stringify(ghUnlink.body)}`,
    );
    // Dana has a password credential, so the change flow must work for her:
    // wrong current password → 401, then a real rotation → 200.
    const danaWrong = await dana.request("POST", "/api/auth/password", { current: "wrong-password-1", next: "new-password-9" });
    check("wrong current password → 401", danaWrong.status === 401, JSON.stringify(danaWrong.body));
    const danaChange = await dana.request("POST", "/api/auth/password", { current: "correct-horse-1", next: "new-password-9" });
    check("dana rotates her password (200)", danaChange.status === 200, JSON.stringify(danaChange.body));
    dana.cookie = null;
    const danaRelogin = await dana.request("POST", "/api/auth/login", { email: "dana@isolation.test", password: "new-password-9" });
    check("dana signs in with the new password (200)", danaRelogin.status === 200, JSON.stringify(danaRelogin.body));
    const oauthStart = await anon.request("GET", "/api/auth/github");
    check(
      "OAuth start reports missing configuration (503)",
      oauthStart.status === 503 && /not configured/i.test(oauthStart.body?.error ?? ""),
      `${oauthStart.status}: ${oauthStart.body?.error}`,
    );

    const meAnon = await anon.request("GET", "/api/auth/me");
    check("anonymous /me answers null (200)", meAnon.status === 200 && meAnon.body?.user === null);
    const meAlice = await alice.request("GET", "/api/auth/me");
    check(
      "alice's session resolves",
      meAlice.status === 200 && meAlice.body?.user?.email === "alice@isolation.test",
      JSON.stringify(meAlice.body),
    );
    check("first account is admin", meAlice.body?.user?.isAdmin === true);
    const meBob = await bob.request("GET", "/api/auth/me");
    check("second account is not admin", meBob.status === 200 && meBob.body?.user?.isAdmin === false);
    check(
      "repository access is reported as not granted",
      meAlice.body?.user?.reposGranted === false,
      JSON.stringify(meAlice.body?.user),
    );
    check(
      "listing repositories without a grant → 400",
      (await alice.request("GET", "/api/github/repos")).status === 400,
    );

    /* -------------------------------- 3. the OAuth round-trip, stubbed GitHub */
    section("GitHub sign-in creates the session (stubbed GitHub)");
    // The child server runs without credentials, so the round-trip needs a
    // second instance that has them and points at the stub endpoints.
    // Seed the OAuth server's directory while no process holds it. Carol must
    // land in a workspace that already has an admin (so a late GitHub sign-in
    // stays non-admin), and every PGlite directory stays single-writer: seed it
    // in a one-shot child, closed, then hand the directory to the child server.
    const oauthDataDir = DATA_DIR + "-oauth";
    fs.rmSync(oauthDataDir, { recursive: true, force: true });
    fs.mkdirSync(oauthDataDir, { recursive: true });
    const oauthSeed = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "backend/tests/fixtures/seed-db.ts"],
      {
        cwd: PROJECT_ROOT,
        env: { ...process.env, CODEATLAS_DATA_DIR: oauthDataDir, DATABASE_URL: "" },
        input: JSON.stringify({
          email: "alice@isolation.test",
          name: "Alice Anders",
          githubId: "1001",
          githubLogin: "alice-gh",
        }),
        encoding: "utf8",
      },
    );
    check("oauth workspace seeded with an admin", oauthSeed.status === 0, oauthSeed.stderr?.trim());

    const oauthChild = spawn(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "backend/server/index.ts"],
      {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          PORT: String(PORT + 2),
          // Own data directory (single-writer, PGlite); the fixture seeded it
          // through the persistence layer above, so the workspace already has
          // an admin when carol signs in late.
          CODEATLAS_DATA_DIR: DATA_DIR + "-oauth",
          DATABASE_URL: "",
          GITHUB_CLIENT_ID: "stub-client-id",
          GITHUB_CLIENT_SECRET: "stub-client-secret",
          CODEATLAS_GITHUB_WEB_URL: `http://127.0.0.1:${STUB_PORT}`,
          CODEATLAS_GITHUB_API_URL: `http://127.0.0.1:${STUB_PORT}`,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    oauthChild.stdout?.on("data", logServer("oauth-server")("stdout"));
    oauthChild.stderr?.on("data", logServer("oauth-server")("stderr"));
    try {
      const oauthBase = `http://127.0.0.1:${PORT + 2}`;
      const deadline = Date.now() + 90_000;
      for (;;) {
        try {
          if ((await fetch(`${oauthBase}/api/health`)).ok) break;
        } catch {
          /* not up yet */
        }
        if (Date.now() > deadline) throw new Error("OAuth-capable server did not start");
        await sleep(250);
      }

      const start = await carol.requestRaw("GET", `${oauthBase}/api/auth/github`);
      check(
        "OAuth start redirects to the authorize URL with client id and identity scopes",
        start.status === 302 &&
          start.location.includes("/login/oauth/authorize") &&
          start.location.includes("client_id=stub-client-id") &&
          start.location.includes("scope=read%3Auser+user%3Aemail"),
        `${start.status} ${start.location}`,
      );
      // Cookie value is `state:%2F`; take the part before the encoded colon.
      const state = (start.setCookie.find((c) => c.startsWith("ca_oauth=")) ?? "")
        .split(";")[0]
        .slice("ca_oauth=".length)
        .split(":")[0];
      check("OAuth state cookie is issued", state.length > 20, state);

      const forged = await carol.requestRaw(
        "GET",
        `${oauthBase}/api/auth/github/callback?code=ok-code&state=forged`,
      );
      check(
        "callback with a forged state redirects to the error status",
        forged.status === 302 && forged.location.includes("github=error%3Ainvalid_state"),
        `${forged.status} ${forged.location}`,
      );
      const badCode = await carol.requestRaw(
        "GET",
        `${oauthBase}/api/auth/github/callback?code=bad-code&state=${encodeURIComponent(state)}`,
        { cookie: `ca_oauth=${state}%3A%2F` },
      );
      check(
        "callback with a rejected code lands on the error status",
        badCode.status === 302 && badCode.location.includes("github=error%3Aexchange_failed"),
        `${badCode.status} ${badCode.location}`,
      );

      const ok = await carol.requestRaw(
        "GET",
        `${oauthBase}/api/auth/github/callback?code=ok-code&state=${encodeURIComponent(state)}`,
        { cookie: `ca_oauth=${state}%3A%2F` },
      );
      check(
        "successful callback redirects signed-in without the repo grant",
        ok.status === 302 && ok.location.includes("github=signed-in"),
        `${ok.status} ${ok.location}`,
      );
      check("the OAuth flow issued a session cookie", carol.cookie !== null);
      const me = await carol.request("GET", "/api/auth/me", undefined, { base: oauthBase });
      check(
        "session resolves to the GitHub identity",
        me.status === 200 &&
          me.body?.user?.email === "carol@stub.test" &&
          me.body?.user?.githubLogin === "carol-stub" &&
          me.body?.user?.reposGranted === false,
        JSON.stringify(me.body),
      );
      check(
        "a late GitHub sign-in is not the admin",
        me.body?.user?.isAdmin === false,
      );
      const carolRepos = await carol.request("GET", "/api/github/repos", undefined, { base: oauthBase });
      check(
        "identity-only grant never returns the repository list",
        carolRepos.status !== 200 || !Array.isArray(carolRepos.body?.repos),
        `${carolRepos.status} ${JSON.stringify(carolRepos.body).slice(0, 120)}`,
      );
    } finally {
      if (oauthChild.pid) {
        if (process.platform === "win32") {
          spawnSync("taskkill", ["/pid", String(oauthChild.pid), "/T", "/F"], { stdio: "ignore" });
        } else {
          oauthChild.kill("SIGTERM");
        }
      }
      stubGithub.close();
      await sleep(400);
    }

    check(
      "non-admin cannot write global config → 403",
      (await bob.request("POST", "/api/config", { maxDepth: 9 })).status === 403,
    );
    check(
      "admin can write global config → 200",
      (await alice.request("POST", "/api/config", { maxDepth: 12 })).status === 200,
    );

    /* ------------------------------------ 3. alice analyses the demo baseline */
    section("User A analyses repositories (demo-app regression baseline)");
    const aDemo = await analyzeAndWait(alice, "samples/demo-app");
    const aDemoId = aDemo.job.result.analysis.repo.id as string;
    const demoStats = aDemo.job.result.analysis.stats;
    check("demo-app: 42 files", demoStats.files === 42, `got ${demoStats.files}`);
    check("demo-app: 538 lines", demoStats.lines === 538, `got ${demoStats.lines}`);
    check("demo-app: 8 clusters", demoStats.clusters === 8, `got ${demoStats.clusters}`);
    check("demo-app: 71 internal edges", demoStats.internalDeps === 71, `got ${demoStats.internalDeps}`);
    check("demo-app: 11 findings", demoStats.issues === 11, `got ${demoStats.issues}`);

    const aDemoList = await alice.request("GET", "/api/analyses");
    check("alice sees 1 analysis", aDemoList.body?.analyses?.length === 1);

    // Mid-flight ownership probe on the next job is covered right after start:
    const aTinyStart = await alice.request("POST", "/api/analyze", { source: "samples/tiny-api" });
    check("tiny-api analysis starts (202)", aTinyStart.status === 202, JSON.stringify(aTinyStart.body));
    const aTinyJobId = aTinyStart.body.jobId as string;
    check(
      "bob cannot poll alice's job → 404",
      (await bob.request("GET", `/api/jobs/${aTinyJobId}`)).status === 404,
    );
    check(
      "anonymous cannot poll the job → 401",
      (await anon.request("GET", `/api/jobs/${aTinyJobId}`)).status === 401,
    );
    check(
      "alice polls her own job → 200",
      (await alice.request("GET", `/api/jobs/${aTinyJobId}`)).status === 200,
    );

    let aTiny: any;
    {
      const deadline = Date.now() + 240_000;
      while (Date.now() < deadline) {
        const reply = await alice.request("GET", `/api/jobs/${aTinyJobId}`);
        if (reply.body?.status !== "running") {
          aTiny = reply.body;
          break;
        }
        await sleep(400);
      }
    }
    check("tiny-api analysis finished", aTiny?.status === "done", JSON.stringify(aTiny?.error ?? ""));
    const aTinyId = aTiny?.result?.analysis?.repo?.id as string;
    check("tiny-api: at least 6 files", (aTiny?.result?.analysis?.stats?.files ?? 0) >= 6, `got ${aTiny?.result?.analysis?.stats?.files}`);

    const aList = await alice.request("GET", "/api/analyses");
    check("alice now sees 2 analyses", aList.body?.analyses?.length === 2, `got ${aList.body?.analyses?.length}`);

    /* ------------------------------------- 4. bob analyses the SAME source */
    section("User B analyses the same source — isolated row, same id");
    const bDemo = await analyzeAndWait(bob, "samples/demo-app");
    const bDemoId = bDemo.job.result.analysis.repo.id as string;
    check("bob's demo-app id matches alice's (same source)", bDemoId === aDemoId);
    check(
      "bob's copy also has 11 findings",
      bDemo.job.result.analysis.stats.issues === 11,
      `got ${bDemo.job.result.analysis.stats.issues}`,
    );

    const bList = await bob.request("GET", "/api/analyses");
    check("bob sees exactly 1 analysis", bList.body?.analyses?.length === 1, `got ${bList.body?.analyses?.length}`);
    check(
      "bob's list does not contain alice's tiny-api row",
      !(bList.body?.analyses ?? []).some((a: any) => a.id === aTinyId),
    );
    const aListAgain = await alice.request("GET", "/api/analyses");
    check("alice's list still has exactly her 2 rows", aListAgain.body?.analyses?.length === 2, `got ${aListAgain.body?.analyses?.length}`);

    const dashA = await alice.request("GET", "/api/dashboard");
    const dashB = await bob.request("GET", "/api/dashboard");
    check("alice dashboard: 2 repos / 2 analyses", dashA.body?.stats?.repositories === 2 && dashA.body?.stats?.analyses === 2, JSON.stringify(dashA.body?.stats));
    check("bob dashboard: 1 repo / 1 analysis", dashB.body?.stats?.repositories === 1 && dashB.body?.stats?.analyses === 1, JSON.stringify(dashB.body?.stats));
    check(
      "alice dashboard recent excludes bob's rows",
      dashA.body?.recent?.length === 2,
      `got ${dashA.body?.recent?.length}`,
    );

    /* --------------------------------- 5. direct API access cannot bypass */
    section("Direct API access cannot bypass ownership");
    const bGetTiny = await bob.request("GET", `/api/analyses/${aTinyId}`);
    check("GET alice's tiny-api as bob → 404", bGetTiny.status === 404, JSON.stringify(bGetTiny.body));
    const aGetTiny = await alice.request("GET", `/api/analyses/${aTinyId}`);
    check("GET alice's tiny-api as alice → 200 (control)", aGetTiny.status === 200);

    const bDelete = await bob.request("DELETE", `/api/analyses/${aTinyId}`);
    check("DELETE alice's analysis as bob → 404", bDelete.status === 404, JSON.stringify(bDelete.body));
    const stillThere = await alice.request("GET", `/api/analyses/${aTinyId}`);
    check("alice's analysis survived bob's delete", stillThere.status === 200);

    const bFile = await bob.request("GET", `/api/analyses/${aTinyId}/file?path=${encodeURIComponent("src/lib/format.ts")}`);
    check("file detail of alice's repo as bob → 404", bFile.status === 404, JSON.stringify(bFile.body));
    const aFile = await alice.request("GET", `/api/analyses/${aTinyId}/file?path=${encodeURIComponent("src/lib/format.ts")}`);
    check("same file as alice → 200 with content", aFile.status === 200 && typeof aFile.body?.content === "string" && aFile.body.content.length > 0);

    const bAsk = await bob.request("POST", `/api/analyses/${aTinyId}/ask`, { question: "What is this repo?" });
    check("AI question on alice's analysis as bob → 404", bAsk.status === 404, JSON.stringify(bAsk.body));

    check(
      "bob polling alice's finished job → 404",
      (await bob.request("GET", `/api/jobs/${aDemo.jobId}`)).status === 404,
    );
    check(
      "alice polling her own finished job → 200",
      (await alice.request("GET", `/api/jobs/${aDemo.jobId}`)).status === 200,
    );

    // Preferences are per-user too.
    const bobTheme = await bob.request("POST", "/api/preferences", { theme: "light" });
    check("bob sets theme light (200)", bobTheme.status === 200);
    const aliceTheme = await alice.request("GET", "/api/preferences");
    check("alice theme unaffected (dark)", aliceTheme.body?.theme === "dark", `got ${aliceTheme.body?.theme}`);

    /* ------------------------------------------------ 6. local path confined */
    section("Local-path analysis is confined to allowed roots");
    const outside = process.platform === "win32" ? "C:\\Windows" : "/etc";
    const escape = await bob.request("POST", "/api/analyze", { source: outside });
    check(
      "reading a system directory → 400 restricted",
      escape.status === 400 && /restricted/i.test(escape.body?.error ?? ""),
      `${escape.status}: ${escape.body?.error}`,
    );
    const escapeA = await alice.request("POST", "/api/analyze", { source: outside });
    check(
      "the rule applies to admins too",
      escapeA.status === 400 && /restricted/i.test(escapeA.body?.error ?? ""),
      `${escapeA.status}: ${escapeA.body?.error}`,
    );

    /* ---------------------------------- 6b. profile details (General card) */
    section("Profile details: name and bio persist, avatar routes are guarded");
    const prof = await alice.request("POST", "/api/auth/profile", {
      name: "Alice A. Anders",
      bio: "Platform engineer; owner of the ingestion pipeline.",
      role: "Staff Data Engineer",
    });
    check(
      "profile update returns the new name, bio and role",
      prof.status === 200 && prof.body?.user?.name === "Alice A. Anders" && prof.body?.user?.bio?.includes("ingestion pipeline") && prof.body?.user?.role === "Staff Data Engineer",
      `${prof.status}: ${JSON.stringify(prof.body?.user?.name)}`,
    );
    const profAgain = await alice.request("GET", "/api/auth/me");
    check(
      "the updated details survive a fresh session lookup",
      profAgain.body?.user?.name === "Alice A. Anders" && profAgain.body?.user?.role === "Staff Data Engineer",
    );
    const bioClear = await alice.request("POST", "/api/auth/profile", { name: "Alice Anders", bio: "", role: "" });
    check(
      "an empty bio and role clear the stored values",
      bioClear.status === 200 && bioClear.body?.user?.bio === null && bioClear.body?.user?.role === null,
      `${JSON.stringify(bioClear.body?.user?.bio)} / ${JSON.stringify(bioClear.body?.user?.role)}`,
    );
    const noName = await alice.request("POST", "/api/auth/profile", { name: "", bio: "x" });
    check("an empty name is rejected → 400", noName.status === 400);
    check(
      "bob's profile is untouched by alice's edits",
      (await bob.request("GET", "/api/auth/me")).body?.user?.name === "Bob Builder",
    );
    check("avatar upload without a file → 400", (await alice.request("POST", "/api/auth/avatar")).status === 400);
    check(
      "avatar removal with no photo still answers 200",
      (await alice.request("DELETE", "/api/auth/avatar")).status === 200,
    );

    /* -------------------------------------- 6c. persistent Atlas chat history */
    section("Chat history persists, is searchable and stays owner-scoped");
    const ask1 = await alice.request("POST", `/api/analyses/${aDemoId}/ask`, {
      question: "How many clusters does this repository have?",
      clientMsgId: "test-msg-1",
    });
    check(
      "ask answers and returns a conversation id",
      ask1.status === 200 && typeof ask1.body?.answer === "string" && Number.isInteger(ask1.body?.conversationId),
      `${ask1.status}: ${JSON.stringify(ask1.body).slice(0, 120)}`,
    );
    const convId = ask1.body?.conversationId as number;

    const listAfterAsk = await alice.request("GET", `/api/chats?analysisId=${aDemoId}`);
    check(
      "the conversation appears in alice's list with a question-derived title",
      listAfterAsk.status === 200 &&
        listAfterAsk.body?.conversations?.some(
          (c: any) => c.id === convId && c.title.includes("clusters"),
        ),
      JSON.stringify(listAfterAsk.body?.conversations?.map((c: any) => c.title)),
    );
    check(
      "the conversation reports 2 messages",
      listAfterAsk.body?.conversations?.find((c: any) => c.id === convId)?.messageCount === 2,
    );

    const ask2 = await alice.request("POST", `/api/analyses/${aDemoId}/ask`, {
      question: "And how many files are in the biggest one?",
      conversationId: convId,
      clientMsgId: "test-msg-2",
    });
    check("a follow-up in the same conversation succeeds", ask2.status === 200 && ask2.body?.conversationId === convId);

    // The same clientMsgId is a retry: it must not duplicate the message.
    const askRetry = await alice.request("POST", `/api/analyses/${aDemoId}/ask`, {
      question: "And how many files are in the biggest one?",
      conversationId: convId,
      clientMsgId: "test-msg-2",
    });
    check("a retried message does not duplicate (same clientMsgId)", askRetry.status === 200);

    const convFull = await alice.request("GET", `/api/chats/${convId}`);
    check(
      "the stored conversation has 4 messages in order (user, assistant ×2)",
      convFull.status === 200 &&
        convFull.body?.conversation?.messages?.length === 4 &&
        convFull.body.conversation.messages[0].role === "user" &&
        convFull.body.conversation.messages[1].role === "assistant",
      JSON.stringify(convFull.body?.conversation?.messages?.map((m: any) => m.role)),
    );
    check(
      "assistant messages carry their sources",
      Array.isArray(convFull.body?.conversation?.messages?.[1]?.sources),
    );

    const searchHit = await alice.request("GET", `/api/chats?q=${encodeURIComponent("clusters")}`);
    check(
      "search finds the conversation by message content",
      searchHit.status === 200 && searchHit.body?.conversations?.some((c: any) => c.id === convId),
    );
    const searchMiss = await alice.request("GET", `/api/chats?q=zzz-no-such-term`);
    check(
      "search misses cleanly",
      searchMiss.status === 200 && searchMiss.body?.conversations?.length === 0,
    );

    const renamed = await alice.request("PATCH", `/api/chats/${convId}`, { title: "Cluster deep-dive" });
    check(
      "rename works and persists",
      renamed.status === 200 && renamed.body?.conversation?.title === "Cluster deep-dive",
    );

    // Alice's tiny-api analysis is a different repo: reusing the demo-app
    // conversation there must be refused rather than silently re-homed.
    const askOtherRepo = await alice.request("POST", `/api/analyses/${aTinyId}/ask`, {
      question: "Different repo question",
      conversationId: convId,
    });
    check(
      "reusing a conversation on another analysis → 400",
      askOtherRepo.status === 400,
      JSON.stringify(askOtherRepo.body).slice(0, 200),
    );
    // A third ask on the tiny-api analysis starts its own conversation.
    const askTiny = await alice.request("POST", `/api/analyses/${aTinyId}/ask`, {
      question: "What does tiny-api do?",
      clientMsgId: "test-msg-tiny-1",
    });
    check(
      "a new conversation starts for the other analysis",
      askTiny.status === 200 && Number.isInteger(askTiny.body?.conversationId) && askTiny.body?.conversationId !== convId,
    );

    // Ownership: bob can neither read, rename nor delete alice's conversation.
    check("bob reads alice's conversation → 404", (await bob.request("GET", `/api/chats/${convId}`)).status === 404);
    check(
      "bob renames alice's conversation → 404",
      (await bob.request("PATCH", `/api/chats/${convId}`, { title: "hijacked" })).status === 404,
    );
    check(
      "bob deletes alice's conversation → 404",
      (await bob.request("DELETE", `/api/chats/${convId}`)).status === 404,
    );
    check("anonymous listing → 401", (await anon.request("GET", "/api/chats")).status === 401);
    check(
      "alice's conversation survived all of bob's attempts",
      (await alice.request("GET", `/api/chats/${convId}`)).status === 200,
    );

    // Bob's own chats live in his namespace only.
    const bobConv = await bob.request("POST", `/api/analyses/${bDemoId}/ask`, {
      question: "What does bob's repo do?",
      clientMsgId: "bob-1",
    });
    check("bob starts his own conversation", bobConv.status === 200 && Number.isInteger(bobConv.body?.conversationId));
    const bobList = await bob.request("GET", "/api/chats");
    check(
      "bob's list contains only his conversation",
      bobList.body?.conversations?.length === 1 && bobList.body.conversations[0].id === bobConv.body?.conversationId,
      JSON.stringify(bobList.body?.conversations?.map((c: any) => c.id)),
    );
    const aliceList = await alice.request("GET", "/api/chats");
    check(
      "alice's list never shows bob's conversation",
      aliceList.body?.conversations?.every((c: any) => c.id !== bobConv.body?.conversationId),
    );

    const aliceExport = await alice.request("GET", "/api/chats/export");
    check(
      "export returns only alice's conversations",
      aliceExport.status === 200 &&
        aliceExport.body?.conversations?.every((c: any) => c.id !== bobConv.body?.conversationId),
    );

    const delConv = await alice.request("DELETE", `/api/chats/${convId}`);
    check("alice deletes her conversation", delConv.status === 200);
    check("the deleted conversation is gone → 404", (await alice.request("GET", `/api/chats/${convId}`)).status === 404);

    // A second conversation, then delete-all: bob's row must survive.
    const ask3 = await alice.request("POST", `/api/analyses/${aDemoId}/ask`, {
      question: "Fresh conversation after deletion",
    });
    const delAll = await alice.request("DELETE", "/api/chats");
    check(
      "delete-all removes alice's conversations",
      delAll.status === 200 && delAll.body?.deleted >= 1,
      JSON.stringify(delAll.body),
    );
    check(
      "alice's list is now empty",
      (await alice.request("GET", "/api/chats")).body?.conversations?.length === 0,
    );
    check(
      "bob's conversation survived alice's delete-all",
      (await bob.request("GET", `/api/chats/${bobConv.body?.conversationId}`)).status === 200,
    );
    check(
      "the last conversation also returned a real id",
      Number.isInteger(ask3.body?.conversationId),
    );
    check(
      "and delete-all removed it too (it existed before the wipe)",
      (await alice.request("GET", `/api/chats/${ask3.body?.conversationId}`)).status === 404,
    );

    /* ------------------------------------------------- 7. session lifecycle */
    section("Sessions behave");
    const logout = await alice.request("POST", "/api/auth/logout");
    check("alice logs out (200)", logout.status === 200);
    check("alice's cookie is dead → 401", (await alice.request("GET", "/api/analyses")).status === 401);
    // The browser would run the OAuth flow again; the server now owns the data
    // directory, so the fixture resumes on the refresh session minted in
    // phase A (logout revokes only the token it was called with).
    alice.cookie = `ca_sid=${sessionTokens["alice-refresh"]}`;
    const meAgain = await alice.request("GET", "/api/auth/me");
    check(
      "a fresh session resolves to the same account",
      meAgain.status === 200 && meAgain.body?.user?.email === "alice@isolation.test",
    );
    check(
      "her 2 analyses are still there",
      (await alice.request("GET", "/api/analyses")).body?.analyses?.length === 2,
    );
    check("bob's session survived alice's logout", (await bob.request("GET", "/api/analyses")).body?.analyses?.length === 1);

    const sessions = await bob.request("GET", "/api/auth/sessions");
    check("bob can list his own sessions", sessions.status === 200 && Array.isArray(sessions.body?.sessions));

    /* ------------------------------------------------ 8. tarball mechanics */
    section("GitHub tarball checkout mechanics (anonymous, public repo)");
    try {
      tarballImport = await import("../../backend/server/repos");
      const targetDir = path.join(DATA_DIR, "tarball-check");
      fs.rmSync(targetDir, { recursive: true, force: true });
      await tarballImport.fetchTarballCheckout(
        { owner: "octocat", repo: "Hello-World" },
        null,
        targetDir,
      );
      const entries = fs.readdirSync(targetDir);
      check("tarball unpacked files", entries.length > 0, `dir has ${entries.length} entries`);
      check(
        "checkout marker written",
        fs.existsSync(path.join(targetDir, ".codeatlas-checkout")),
      );
      fs.rmSync(targetDir, { recursive: true, force: true });
    } catch (err) {
      check("tarball checkout works", false, err instanceof Error ? err.message : String(err));
    }

    /* -------------------------------------------------------------- summary */
    console.log(`\n${passed} checks passed, ${failures.length} failed`);
    if (failures.length > 0) {
      console.log("Failures:");
      for (const f of failures) console.log(`  - ${f}`);
    }
    assert.equal(failures.length, 0, `${failures.length} security checks failed`);
  } finally {
    // tsx spawns the real server as a child — kill the whole tree on Windows.
    if (server.pid) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        server.kill("SIGTERM");
      }
    }
    await sleep(600);
    try {
      // Close this process's own handle (opened when server/repos was imported
      // for the tarball check) so the temp directory can be removed on Windows.
      (await import("../../backend/server/db")).closeDb();
    } catch (err) {
      console.warn("db close warning:", err instanceof Error ? err.message : err);
    }
    try {
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
    } catch (err) {
      console.warn("cleanup warning:", err instanceof Error ? err.message : err);
    }
  }
}

main()
  .then(() => {
    console.log("\nISOLATION ACCEPTANCE TEST PASSED");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nISOLATION ACCEPTANCE TEST FAILED");
    console.error(err);
    process.exit(1);
  });
