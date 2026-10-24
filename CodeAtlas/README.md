<div align="center">

<img src="public/logo.png" alt="Atlas" width="88" />

# Atlas

**Understand any codebase in minutes, not weeks.**

Point Atlas at a repository — it maps the architecture, draws the dependency graph,
explains the files, finds the rot and writes the docs your README never got around to.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express 5](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-node%3Asqlite-003B57?logo=sqlite&logoColor=white)](https://nodejs.org/api/sqlite.html)
[![Tests](https://img.shields.io/badge/acceptance_tests-119%20checks-3fb950)](#testing)
[![Made by](https://custom-icon-badges.demolab.com/badge/made%20by-Psudhanshu--07-181717?logo=github&logoColor=white)](https://github.com/Psudhanshu-07)

</div>

---

> The problem Atlas solves is not missing knowledge — it is **stale** knowledge.
> You join a team, the onboarding doc is six months old, and the truth lives in
> `git log`. Atlas reads the code instead: **how is this structured**, **how do the
> pieces depend on each other**, and **what should I be worried about**.

## ✨ Features

<table>
<tr><th width="200">Capability</th><th>What it does</th></tr>
<tr><td><b>🔐 GitHub sign-in</b></td><td>GitHub is the only identity provider — no passwords to store, verify or reset. The first account on a server becomes its admin.</td></tr>
<tr><td><b>🏦 Per-account isolation</b></td><td>Repositories, analyses, chat history and preferences belong to one account. Ownership is enforced in the <i>data layer</i>: another user's id returns <code>404</code>, whatever the client asks for.</td></tr>
<tr><td><b>📥 Repository import</b></td><td>GitHub URLs and <code>owner/repo</code> shorthand (tarball fetch for connected accounts, shallow clone otherwise), or a local checkout path, with an optional branch.</td></tr>
<tr><td><b>🗂️ Repository browser</b></td><td>With the optional <code>repo</code> grant, list your own repositories in-app and analyse private ones.</td></tr>
<tr><td><b>📡 Live progress</b></td><td>Analysis runs as a background job; the UI reports the real stage — fetch → crawl → parse → resolve → check → document — with live file and line counters.</td></tr>
<tr><td><b>🏗️ Architecture mapping</b></td><td>Detects entry points, layers (presentation, interface, business, data), module clusters and the overall architecture style from the dependency graph.</td></tr>
<tr><td><b>🕸️ Dependency visualisation</b></td><td>Interactive force-directed map (d3) with layer bands, cluster colours, zoom/pan, filters, hover highlighting and a per-file detail panel.</td></tr>
<tr><td><b>💡 Code explanation</b></td><td>Per-file briefing covering responsibilities, key symbols, collaborators and gotchas — plus a question-answering assistant that cites the files it read.</td></tr>
<tr><td><b>🩺 Inconsistency detection</b></td><td>Twelve detectors, each with evidence and a suggested fix: circular dependencies, layering violations, dead exports, orphan modules, god files, hub modules, undeclared &amp; unused packages, copy-paste duplicates, naming drift, untested modules, TODO hotspots.</td></tr>
<tr><td><b>📝 Documentation generation</b></td><td><code>ARCHITECTURE.md</code>, per-module pages and a <code>QUALITY.md</code> report — rendered in-app and downloadable as markdown.</td></tr>
<tr><td><b>💬 Persistent chat history</b></td><td>Atlas conversations are stored per account, searchable, renameable and exportable — grounded in the same analysis you are looking at.</td></tr>
<tr><td><b>🧠 Optional AI layer</b></td><td>With a provider key, narratives and answers are written by a model grounded in the same structural data; without one, everything falls back to the deterministic engine.</td></tr>
</table>

## 🚀 Quickstart

```bash
git clone https://github.com/Psudhanshu-07/Atlas.git
cd Atlas

npm install
cp .env.example .env      # then set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET

npm run dev               # API on :3001 · web client on :5173 (proxied)
```

Open <http://localhost:5173> and sign in with GitHub. The first account registered on a
fresh install becomes the workspace admin.

> **No GitHub credentials yet?** The server refuses every sign-in and the app walks you
> through creating the OAuth app step by step. That is deliberate: GitHub is the only
> identity provider, so there is no local password to fall back on.

Production-style run (the API serves the built client):

```bash
npm run build
npm start                 # http://localhost:3001
```

### Development commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API + web client with hot reload (concurrently) |
| `npm run build` | `tsc --noEmit` then the Vite production build |
| `npm start` | Serve the built client from the API on `:3001` |
| `npm run typecheck` | Type-check client and server |
| `npm test` | Two-account isolation acceptance suite (119 checks) |

## 🔒 Accounts & isolation

Atlas is a multi-user server, and the server — never the UI — enforces the boundary.

- **Identity** comes from GitHub and nothing else (`read:user user:email`). Listing your
  repositories and reading private ones needs the additional `repo` grant; the Connect
  screen asks for it and Settings shows whether it is granted. Revoke it at any time under
  GitHub's authorized applications.
- **Sessions** are 256-bit random tokens in an HttpOnly, SameSite=Lax cookie (`ca_sid`,
  `Secure` over HTTPS). Only the SHA-256 hash is stored server-side. Sessions last 30
  days; Settings lists every active session and can sign the others out.
- **Ownership is in the data model.** Analyses are stored under
  `(owner_user_id, analysis_id)`, and every accessor takes the owner as an argument — a
  job or analysis id belonging to someone else simply does not exist for your account
  (`404`, on purpose). There is no client-side access check anywhere in the app.
- **Local paths are confined.** A local analysis may read the project root plus the
  directories listed in `CODEATLAS_LOCAL_ROOTS`; anything else is refused with `400`
  before a job starts, so the crawler can never become a read-any-file primitive.
- **GitHub tokens** are encrypted with AES-256-GCM using a key generated once into
  `.codeatlas/storage.key` (mode `0600`). They are used in-process and never written
  into a URL or a command line.
- **Admin** is the first account to sign in, or the account matching
  `CODEATLAS_ADMIN_EMAIL` when set. Only admins can change global engine configuration.

## ⚙️ Configuration

Copy [`.env.example`](.env.example) to `.env`; the server loads it at startup and real
environment variables take precedence.

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default `3001`) |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | **Required for sign-in.** Create an OAuth app (see below) |
| `CODEATLAS_BASE_URL` | Public origin used to build the OAuth callback URL — set it behind a proxy |
| `CODEATLAS_DATA_DIR` | Where runtime data lives: database, checkouts, storage key (default `./.codeatlas`) |
| `CODEATLAS_LOCAL_ROOTS` | Extra directories a local-path analysis may read, separated by `,` or `;` |
| `CODEATLAS_ADMIN_EMAIL` | Pin the admin role to one GitHub e-mail instead of the first account |
| `OPENAI_API_KEY` (or `CODEATLAS_API_KEY` / `GEMINI_API_KEY`) | Enables the AI layer |
| `OPENAI_BASE_URL`, `OPENAI_MODEL` | OpenAI-compatible endpoint and model id (defaults: OpenRouter, `google/gemini-2.5-flash`) |

## 🚀 Deployment

The repository includes [`render.yaml`](./render.yaml) for the API and
[`vercel.json`](./vercel.json) for the Vite frontend. The supported split
deployment is:

1. Create the Render web service from this repository. Its build command is
   `npm ci && npm run build`, and its start command is `npm start`.
2. Create the Vercel project from the same repository. Set `VITE_API_URL` to
   the HTTPS URL of the Render service, without a trailing slash.
3. On Render, set `CODEATLAS_BASE_URL` to the Render HTTPS URL and
   `CODEATLAS_FRONTEND_URL` to the exact Vercel origin.
4. Set the GitHub OAuth callback to
   `<CODEATLAS_BASE_URL>/api/auth/github/callback`.
5. Add the AI and GitHub secrets in the Render dashboard only. Do not commit
   `.env` or paste secrets into source control.

The current server uses synchronous SQLite (`node:sqlite`) under
`CODEATLAS_DATA_DIR`; the Render manifest attaches a persistent disk so this
deployment does not lose accounts between restarts. The PostgreSQL schema in
`backend/database/schema.sql` is not currently wired to the server, and
setting `DATABASE_URL` alone does not import or use a local PostgreSQL
database. A PostgreSQL migration is required before using an external hosted
PostgreSQL instance as the production store.

<details>
<summary><b>Creating the GitHub OAuth app</b></summary>

1. Open <https://github.com/settings/developers> and create a new OAuth app.
2. Set **Authorization callback URL** to `<origin>/api/auth/github/callback`. For local
   development use the origin you browse:
   - Vite dev server → `http://localhost:5173/api/auth/github/callback`
   - production build → `http://localhost:3001/api/auth/github/callback`

   The value must match exactly; behind a proxy, set `CODEATLAS_BASE_URL` to the public
   origin so the server builds the same URL.
3. Put the client id and secret in `.env` and restart.

The access token you authorise can be revoked from GitHub at any time, which immediately
ends repository listing and private access. Sessions already issued expire on their own.

</details>

<details>
<summary><b>AI mode — any OpenAI-compatible endpoint</b></summary>

OpenRouter, OpenAI, Gemini, Anthropic or a local Ollama server all work. Configure it in
**Settings** (admins only, stored in `.codeatlas/settings.json`, git-ignored) or through
the environment variables above.

Without a key the app is fully functional: every narrative and answer is produced by the
deterministic engine and labelled as a graph fact.

</details>

## 🧪 The demo baseline

`samples/demo-app` is a small TypeScript application with planted architectural problems:
two dependency cycles including a cross-layer one, a UI-to-data layering violation, an
800-line god file, a 19-dependent hub, dead exports, duplicated files, undeclared
packages, naming drift, untested modules and TODO hotspots.

It exercises every detector and doubles as the regression baseline — a clean run reports
exactly:

```
13 findings · 40 files · 1,283 lines · 8 modules · 67 internal edges
```

`samples/tiny-api` is a second, quieter fixture used by the isolation suite.

## 🔬 How the engine works

```
POST /api/analyze            returns a job id immediately
  fetch      clone or read the source
  crawl      ignore rules, binary sniffing, size caps
  parse      TypeScript AST for JS/TS; tuned line parsers for 25+ languages
  resolve    relative, alias, workspace, Python-dotted, Go-module specifiers
  issues     twelve detector rules producing issues with evidence and suggested fixes
  docs       architecture brief, per-module guides and a quality report
GET  /api/jobs/:id           stage list, counters, result
```

State lives under `.codeatlas/` (git-ignored): the SQLite database `codeatlas.db`
(accounts, sessions, linked repositories, per-user analyses, chat history and
preferences), repository checkouts in `repos/`, and engine settings in `settings.json`.
Persistence uses Node's built-in `node:sqlite` and `node:crypto` — **the stack gained no
database dependency**. Cached analyses reopen from **History** without re-running;
`refresh: true` forces a fresh run.

## 🗂️ Project layout

```
Atlas/
├── backend/
│   ├── server/
│   │   ├── index.ts            Express API and the route policy (public, user, admin)
│   │   ├── env.ts              optional .env loading; real environment wins
│   │   ├── paths.ts            data directory, checkouts, database file
│   │   ├── db.ts               schema, migrations, owner-scoped access, encrypted secrets
│   │   ├── store.ts            owner-scoped facade the routes call
│   │   ├── auth.ts             GitHub OAuth, sessions, middleware, rate limits
│   │   ├── jobs.ts             in-flight analysis progress
│   │   ├── prompts.ts          the model's voice (brief, file explanation, Q&A)
│   │   ├── ai.ts               OpenAI-compatible client and persisted settings
│   │   ├── repos.ts            source resolution, allowed local roots, checkouts
│   │   └── analyze/            crawl, lang, resolve, pipeline, issues, docs, explain
│   └── tests/
│       └── isolation.test.ts   acceptance suite; runs the real server
├── frontend/
│   ├── index.html              document shell loaded by dev server and build
│   ├── vite.config.ts          dev server, proxy and production build
│   ├── tailwind.config.js      design tokens
│   └── src/
│       ├── state/useWorkspace.ts   session, analysis, view, selection, job, toast state
│       ├── api.ts              typed fetch helpers and the session-expiry signal
│       ├── components/
│       │   ├── pages/          one component per view (sign-in, overview, connect, …)
│       │   ├── layout/         sidebar with the account block, header, inspector
│       │   ├── modals/         command palette and shortcuts
│       │   └── ui.tsx          shared primitives
│       └── styles/             ui.css, views.css, analysis.css
├── shared/                     contract used by both sides
│   ├── types.ts                Analysis, FileNode, Edge, Issue, Doc, SessionUser, …
│   ├── progress.ts             analysis stages, counters and job snapshots
│   ├── format.ts               number and count wording, so "1 files" cannot happen
│   └── understand.ts           briefing text derived from the analysis graph
├── samples/
│   ├── demo-app/               demo repository with planted issues
│   └── tiny-api/               second fixture for the isolation suite
└── tsconfig.json · package.json · .env.example
```

<details>
<summary><b>Codebase conventions (for contributors)</b></summary>

- **Workspace state lives in `useWorkspace`.** Views receive props and never own
  session, analysis, job, selection or toast state.
- **Access control lives on the server.** Every data route binds `req.user.id` from the
  session; a client-supplied id is only ever a lookup key inside a query already filtered
  by owner. A conditional in a component is not access control.
- **`backend/server/db.ts` owns the schema; `backend/server/store.ts` owns the queries
  routes use.** New accessors take the owner explicitly; handlers do not write SQL.
- **The job registry owns in-flight analysis.** Handlers ask `backend/server/jobs.ts`,
  which reports into `shared/progress.ts`.
- **The model's voice lives in `backend/server/prompts.ts`.** Do not inline a system
  prompt at a call site.
- **`frontend/src/api.ts` re-exports types from `shared/`**, never from the server.
- **`App.tsx` is a shell** that switches over the view registry.
- **Counts go through `shared/format.ts`** — `plural()` is the only sanctioned way to
  build "n files".

</details>

## 🌐 API

<details open>
<summary><b>Public</b></summary>

- `GET /api/health` → `{ok, aiEnabled, model, provider}`
- `GET /api/auth/providers` → which sign-in methods this server has configured
- `GET /api/auth/github` → start the OAuth flow (`?scopes=repos` asks for repository access)
- `GET /api/auth/github/callback` → OAuth redirect target; creates the session
- `POST /api/auth/logout`

</details>

<details>
<summary><b>Authenticated</b> — session cookie; every query scoped to the session's account</summary>

- `GET /api/auth/me`, `POST /api/auth/profile`
- `GET /api/auth/sessions`, `DELETE /api/auth/sessions` (other sessions), `DELETE /api/auth/sessions/:id`
- `GET /api/github/repos`
- `POST /api/analyze` `{source, refresh?, branch?}` → `202 {jobId}`
- `GET /api/jobs/:id` → `{status, progress, message, stages[], counters, result?}`
- `GET /api/analyses`, `GET /api/analyses/:id`, `DELETE /api/analyses/:id`
- `GET /api/analyses/:id/file?path=` → content, annotations and explanation
- `POST /api/analyses/:id/ask` `{question, history?}` → grounded answer with sources
- `GET /api/dashboard` → stats, recent analyses, linked repositories
- `GET /api/config`, `GET|POST /api/preferences`

</details>

<details>
<summary><b>Admin only</b></summary>

- `POST /api/config` → global engine settings (AI provider and key, crawler rules)

Unknown ids and other people's ids both answer `404`, on purpose.

</details>

## ✅ Testing

```bash
npm test
```

The suite starts the **real API** against an isolated `CODEATLAS_DATA_DIR`, seeds two
accounts through the persistence layer and drives the acceptance scenarios over HTTP:

- anonymous requests reach no workspace route;
- the password and unlink routes no longer exist; sessions are stored hashed;
- the first account is admin, the second is not (`403` on global config);
- the OAuth round-trip is exercised against a stubbed GitHub server (authorize redirect,
  state validation, rejected codes, session creation, no repo list without the grant);
- both accounts analyse the same source and each gets its own private result;
- every cross-account read (list, dashboard, job, detail, file, ask, chat, delete)
  returns `404` while the owner's returns `200`;
- local-path escapes are refused — for admins too;
- persistent chat history is searchable, owner-scoped and survives cross-account probes;
- GitHub tarball checkout works against a public repository.

The suite also re-runs the `samples/demo-app` baseline, so **an engine regression fails
it**. Two variables exist only for that stub: `CODEATLAS_GITHUB_WEB_URL` and
`CODEATLAS_GITHUB_API_URL` redirect the server's GitHub traffic. Never set them in
production; unset, they default to the real GitHub.

## 🧭 Known limitations

- **One process, one database file.** `node:sqlite` keeps this to a single instance;
  running several replicas against a shared volume is not supported.
- **Sign-in requires GitHub.** No local account, no password reset flow, no e-mail
  delivery anywhere in the project. Losing access to the GitHub account means losing
  the workspace, by design.
- **Workspace packages** referenced by bare name only resolve when `package.json`
  declares them under `packages/`. Rust crate-internal modules resolve as external.
  Measured on `vercel/next.js`: 378 of 1,836 edges are cross-module.
- **Analysis caps** at 4,000 files and 1.5 MB per file; the run reports when caps apply.
- **Large clones take time** (around 10 minutes for very large repositories). On Windows
  the clone runs with `core.longpaths=true` so deeply nested fixtures check out correctly.
- **Legacy cache rows** imported from the pre-accounts era have no owner and stay
  invisible until re-analysed by an account.

## 🛣️ Roadmap

- [x] GitHub sign-in with per-account workspace isolation
- [x] Dependency graph with interactive layer/cluster visualisation
- [x] Twelve architectural inconsistency detectors
- [x] Generated `ARCHITECTURE.md` / `QUALITY.md` documentation
- [x] Persistent, searchable Atlas chat history
- [ ] Multi-repo comparison and organisation-wide dashboards
- [ ] Team workspaces with shared analyses
- [ ] Language server integrations for richer symbol resolution

---

<div align="center">

**Atlas** · Built by [Psudhanshu-07](https://github.com/Psudhanshu-07) ·
<a href="#-features">back to top</a>

</div>
## Database

The server uses PostgreSQL. Set `DATABASE_URL` to a `postgres://` or
`postgresql://` connection string before starting it; startup fails closed when
the variable is missing or malformed. The complete schema is in
`backend/database/schema.sql` and is applied automatically on startup.

To explicitly import an existing local SQLite database, do not put the
connection string in shell history or command output. Set it in the
environment and pass the SQLite filename:

```sh
DATABASE_URL=postgresql://user:password@host/codeatlas npm run db:import -- .codeatlas/atlas.db
```

The importer never prints `DATABASE_URL`, runs in one transaction, skips
duplicate rows, and does not delete the SQLite source.
