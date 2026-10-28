# Atlas — Operations Runbook

Production stack: **Render** (API + static SPA) and **Vercel** (SPA CDN), with
**Supabase Postgres** as the system of record. This file documents the backup,
restore, deploy and rollback procedures. No secrets belong here.

## Deployment layout

| Piece | Platform | Trigger | URL |
|---|---|---|---|
| API server (Express) | Render — root dir `/backend` | auto-deploy on push to `master` | `https://atlas-4rkf.onrender.com` |
| Web client (Vite SPA) | Vercel — root dir `/frontend` | auto-deploy on push to `master` | `https://atlas-navy-delta.vercel.app` |
| Database | Supabase Postgres (project `pnlcqcpwrhlcinjkfnkw`) | n/a | connect via `DATABASE_URL` |

Both platforms deploy automatically on every push to `master`; CI on the same
push runs typecheck, unit tests, the backend isolation suite and the frontend
build. **Do not push `master` if CI is red locally** — run
`npm run test:all && npx tsc --noEmit && npm run build` first.

## Environment variables (deployed values live on the platform dashboards)

- **Render**: `DATABASE_URL` (Supabase pooler connection string),
  `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` (OAuth),
  `OPENROUTER_API_KEY` (AI chat), `CODEATLAS_FRONTEND_URL`
  (`https://atlas-navy-delta.vercel.app`), `APP_ORIGIN`.
- **Vercel**: `CODEATLAS_API_URL` (`https://atlas-4rkf.onrender.com`).
- **Supabase**: password rotation happens in Supabase → Project settings →
  Database → Reset password; update `DATABASE_URL` on Render in the same minute
  (connections will fail with `28P01` until it matches).

Unique-pooler host form (used everywhere):
`postgresql://postgres.<ref>:<password>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`

## Health and monitoring

- Liveness: `GET /api/health` → `{"ok":true, aiEnabled, model, provider}`
- Readiness: `GET /api/health/ready` → `{"ready":true}` only when a `SELECT 1`
  against the database succeeds; Render should be configured to use this path
  for the health check.

If `/api/health/ready` returns 503: check Render logs for `ECONNREFUSED` /
`28P01` / timeout, check the Supabase dashboard (project paused? db down?),
and re-check the `DATABASE_URL` env var. Render free instances also sleep after
15 min of inactivity — the first request then takes ~30–60 s while the service
boots; that is not an outage.

## Backup procedure

Supabase free projects keep a 7-day point-in-time history only on paid plans;
on the free tier the practical backup is **your own export**.

**Automated (recommended)**: schedule a Supabase CLI dump anywhere you can run
it regularly (e.g. a workstation cron or GitHub Action):

```bash
supabase db dump --db-url "$SUPABASE_DB_URL" --file atlas-$(date +%F).sql
```

**Before destructive/manual schema changes** (the app's own tables are created
with `CREATE TABLE IF NOT EXISTS` at startup, so restarting the Render service
is the standard migration path and is non-destructive):

1. Take a dump (command above) and store the file somewhere durable.
2. Run the change on a **local PGlite/dev database first**, not on production
   Postgres.
3. Only then apply it to Supabase.

## Restore procedure (tested path)

To restore into the same Supabase project after data loss or a mistaken bulk
delete — verify with a scratch database first if the situation allows:

```bash
# 1. Temporarily stop new writes: Render Dashboard → atlas → Suspend, or
#    set the service to "Suspend" so the API can't write while you restore.
# 2. Restore the dump into Supabase:
psql "$SUPABASE_DB_URL" -f atlas-YYYY-MM-DD.sql
# 3. Verify:
psql "$SUPABASE_DB_URL" -c "SELECT count(*) FROM users;
psql \"$SUPABASE_DB_URL\" -c \"SELECT count(*) FROM analyses;\"
# 4. Resume the Render service.
```

Users can always reconstruct their own view afterward:
- Analyses — can be re-generated from the linked repository (source of truth is
  GitHub, not our rows).
- Chat history — lost with the incident; no rebuild path.

## Rollback runbook

Because deploys are tied to `master`, rollback is a git operation:

```bash
git tag bad-$(date +%F)              # mark the bad commit
git push origin bad-$(date +%F):refs/heads/master --force-with-lease
```

Wait for Render + Vercel to redeploy (both watch `master`). Sessions and data
do not need a rollback with the code — the schema is created idempotently at
boot, so an older schema can still come up cleanly.

**When the rollback is triggered by data/schema bounds**, e.g. a new column the
old code wrote but the old schema does not have — the restart recreates only
`IF NOT EXISTS` objects, so an accident there means manual migration work: run
the diff between current and previous schema manually via Supabase SQL editor.

## Common failure patterns

| Symptom | First checks |
|---|---|
| Status 502/503 on API | Render logs; service crashed on boot (env var missing?) |
| First request after idle is slow | Free-tier Render sleep — not an outage |
| `/api/auth/github/callback` fails | `GITHUB_CLIENT[_SECRET]` set? callback URL registered in the GitHub OAuth app matches the Render origin |
| AI chat returns 502/504 | `OPENROUTER_API_KEY` valid? OpenRouter status page? The server degrades to 503 with a message if unconfigured |
| SPA shows white screen | `frontend` build failed on Vercel — check the Vercel build log |
| CORS errors in the browser console | `CODEATLAS_FRONTEND_URL` unset/wrong on Render |

## Contact / escalation

The app is a single-operator product; no pager exists. Render and Vercel both
email outages to the account owner by default — enable those notifications.
