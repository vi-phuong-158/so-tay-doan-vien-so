# P5.5-07R — Member API deployment/runtime runbook (provider-neutral)

> Status: **PREPARATION ONLY**. Mắt Bão Vibe Host v2 is not yet provisioned (no account, no
> instance, no connection string — see `docs/brain/04-current-tasks.md` and P5.5-D8 in
> `docs/brain/03-decisions.md`). Every value below with `<...>` is unknown/undecided and must be
> filled in with a REAL value only once real infra exists — nothing here is a placeholder for a
> guessed production hostname or credential.

## 1. Deployment mechanism

- **Chosen target:** Mắt Bão Vibe Host v2 (PaaS container, PostgreSQL 16 managed, Node.js runtime
  — P5.5-D8).
- **Build mechanism (Dockerfile vs. buildpack/git-push):** **not verified** from official
  Mắt Bão documentation at the time of this runbook. `docs/phase-5-5/01-member-infrastructure-decision.md`
  confirms the runtime minimum (Node.js container + managed PostgreSQL) but not the exact build
  contract Vibe Host v2 expects.
  - No `Dockerfile`/`.dockerignore` has been added speculatively — inventing a container image
    build for a PaaS that may deploy directly from `npm start` would be dead weight (and a second,
    unverified surface to keep in sync). **If** provisioning reveals Vibe Host v2 requires a
    container image, add a minimal `Dockerfile` at that time built around the contract below —
    it does not change.
  - What member-api/ already guarantees, regardless of which build mechanism Vibe Host v2 turns
    out to use:
    - Deterministic start command: `npm start` → `node src/index.js`.
    - `npm run migrate` runs pending migrations only (tracked via `schema_migrations`, forward-only,
      never re-runs an already-applied migration).
    - Node.js `>=20.0.0` (see `member-api/package.json` `engines`); PostgreSQL 16 (per P5.5-D8;
      the schema also depends on the `unaccent`/`pg_trgm` extensions — see §4).

## 2. Environment variables

All required, fail-closed (the process throws at startup and never listens if any is missing — see
`member-api/src/config.js`). None of these are committed anywhere; `member-api/.env.example` lists
names and safe local-dev defaults only, never real values.

| Variable | Secret? | Notes |
|---|---|---|
| `MEMBER_DATABASE_URL` | **Secret** | Full Postgres connection string for the Member database at Mắt Bão. `RUNTIME_PENDING` until provisioned. |
| `PORT` | Public | Defaults to `8080` if unset. Whatever port Vibe Host v2's container contract expects. |
| `MEMBER_SCOPE_RESOLVER_URL` | Public (URL) | Production Supabase Edge Function URL for `resolve-member-scope`. |
| `MEMBER_SCOPE_RESOLVER_SECRET` | **Secret** | Shared server-to-server secret with `resolve-member-scope`; must match the Edge Function's own `MEMBER_SCOPE_RESOLVER_SECRET`. Generate a new high-entropy value for production — never reuse the local/CI placeholder in `.env.example`/`supabase/functions/.env`. |
| `SUPABASE_URL` | Public | Same value as the frontend's `VITE_SUPABASE_URL`. |
| `SUPABASE_ANON_KEY` | Public (anon key, not secret) | Same value as the frontend's `VITE_SUPABASE_ANON_KEY`. Never the service-role key. |
| `CORS_ALLOWED_ORIGIN` | Public | The exact production frontend origin (scheme+host+port, no trailing slash). `RUNTIME_PENDING` — no production frontend hostname is decided yet (see §5). |

## 3. Secret handling

- Secrets (`MEMBER_DATABASE_URL`, `MEMBER_SCOPE_RESOLVER_SECRET`) are set only in Vibe Host v2's
  own encrypted environment-variable store (P5.5-D8: "env var mã hoá AES-256" per vendor docs) —
  never committed, never passed as a CLI argument (ends up in shell history/process listing), never
  logged. `member-api/src/index.js`'s only startup log line is `[member-api] listening on port
  ${config.port}` — no secret value is ever interpolated into a log line anywhere in this service.
- `member-api/.env.example` is the single source of truth for variable **names**; it must never
  gain a real value — verified by inspection as part of this runbook (still placeholder-only as of
  this writing).

## 4. Database provisioning + migration

1. Provision a PostgreSQL 16 instance at Mắt Bão Vibe Host v2 (owner/operational step — out of
   scope for this repo; not performed by this runbook).
2. Confirm the `unaccent` and `pg_trgm` extensions are available (migration `0001` creates
   `member_immutable_unaccent()` and a trigram index that depend on them) — if Vibe Host v2's
   managed Postgres restricts `CREATE EXTENSION`, this blocks migration `0001` and must be resolved
   with the vendor first.
   - **Restore rehearsal finding (2026-09-13, P5.5 Production Runtime Closure):** a plain `pg_dump`
     of this schema failed to restore into a fresh database (`function unaccent(unknown, text) does
     not exist`) because migration `0001`'s function body calls the unqualified `unaccent(...)`,
     which does not resolve under the empty `search_path` a `pg_dump` restore runs with. Fixed by
     migration `0004_fix_unaccent_restore_qualification.sql` (schema-qualifies the call) — verified
     by re-running the full seed→backup→restore→verify cycle end-to-end against a local rehearsal
     Postgres 16 instance. Apply migrations through `0004` (not just `0001`-`0003`) before trusting
     any restore of this schema, Mắt Bão included.
3. Set `MEMBER_DATABASE_URL` to the new instance's connection string in Vibe Host v2's env store.
4. Run migrations **before** starting the application for the first time (and before every deploy
   that ships new migration files): `npm run migrate` (never `migrate:fresh` — that drops the
   schema, local/test databases only).
5. Verify: `node -e "require('./src/db.js')"`-style smoke check is unnecessary; use the running
   service's own `/readyz` (see §6) once started.

## 5. Frontend/CORS/CSP wiring

Resolved together, since they all depend on the same not-yet-decided production Member API and
frontend hostnames (open item since P5.5-06, `docs/phase-5-5/00-member-management-architecture.md`
mục 28.3):

1. Decide the production Member API hostname (Vibe Host v2 custom domain) and the production
   frontend hostname.
2. Set Member API's `CORS_ALLOWED_ORIGIN` to the exact frontend origin (e.g.
   `https://<frontend-host>` — no trailing slash, no wildcard; `applyCorsHeaders` in `server.js`
   does an exact string match).
3. Set the frontend's `VITE_MEMBER_API_URL` to the Member API's production URL at build time.
4. Add the Member API hostname to `vercel.json`'s CSP `connect-src` (currently only lists
   Supabase-related hosts) — otherwise the browser blocks the frontend's own fetch calls to the
   Member API even with CORS correctly configured server-side.
5. TLS/domain validation: use Vibe Host v2's automatic custom-domain TLS (per P5.5-D8) — confirm
   the certificate is valid for the chosen hostname before pointing the frontend at it.

## 6. Readiness / health contract

- `GET /healthz` — liveness only, does not touch the database. Returns `200 {"status":"ok"}` once
  the process is listening.
- `GET /readyz` — readiness; runs `SELECT 1` against the database. Returns `200 {"status":"ok"}` or
  `503 {"status":"error","reason":"database_unavailable"}` (never leaks connection string/driver
  detail).
- Wire Vibe Host v2's health-check mechanism (once its restart-policy contract is confirmed — still
  an open item per P5.5-D8's trade-offs) to `/readyz`, not `/healthz`, so the platform does not
  route traffic to an instance that is up but cannot reach its database.

## 7. Graceful shutdown

Already implemented (`member-api/src/index.js`): `SIGTERM`/`SIGINT` close the HTTP server and the
database pool before `process.exit(0)`. No change needed for Vibe Host v2 deployment as long as it
sends `SIGTERM` on redeploy/scale-down (standard container-orchestration behavior) rather than
`SIGKILL`.

## 8. Smoke test (post-deploy)

Run against the deployed instance, before pointing the production frontend at it:

1. `curl https://<member-api-host>/healthz` → `200`.
2. `curl https://<member-api-host>/readyz` → `200` (proves DB connectivity).
3. `curl -H "Origin: https://<frontend-host>" https://<member-api-host>/healthz -i` → response
   includes `Access-Control-Allow-Origin: https://<frontend-host>`.
4. With a real Supabase session bearer token for a YOUTH_ADMIN/BRANCH_OFFICER test account:
   `curl -H "Authorization: Bearer <token>" https://<member-api-host>/v1/member-scope` → `200` with
   the expected roles — proves the `resolve-member-scope` bridge reaches the deployed instance.
5. Only after 1–4 pass: point the production frontend's `VITE_MEMBER_API_URL` at the new host and
   redeploy the frontend.

## 9. Rollback

- Application rollback: redeploy the previous known-good commit/build via Vibe Host v2's own
  deploy history (mechanism TBD until build pipeline is confirmed, §1) — this service is stateless
  aside from the database, so an application rollback alone never loses data.
- Migration rollback: this project's migration runner is forward-only by design (no `down`
  migrations — see `member-api/scripts/migrate.mjs`). A migration that must be undone requires a
  new forward migration that reverses it, written and reviewed like any other schema change — never
  a manual/ad hoc rollback against production.
- Database rollback (restore from backup): see
  `member-api/scripts/backup-restore-rehearsal.mjs` and §10 below — `BLOCKED_PENDING_INFRA` until
  rehearsed against a real provisioned instance.

## 10. Backup/restore rehearsal

See `member-api/scripts/backup-restore-rehearsal.mjs` for the DB-side rehearsal harness (marker
seed/mutate/verify/cleanup) and its header comment for the full safety contract and usage. It is
**preparation only** — it does not trigger a real backup or restore (no Mắt Bão API access exists
in this environment); those two steps are manual, done by the operator in the Vibe Host panel, with
the script verifying the DB-side result. Actual backup/restore capability for the Member database
remains `BLOCKED_PENDING_INFRA` until this has been run for real, once Vibe Host v2 is provisioned.

Record, on the first real rehearsal:
- RPO: elapsed time from "seed" (data present) to the backup actually covering it.
- RTO: elapsed time from initiating restore to `verify` reporting PASS.
- Whether Vibe Host v2 supports point-in-time recovery or only fixed backup snapshots (unconfirmed
  — P5.5-D8 trade-offs).
