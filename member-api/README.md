# Member API (P5.5)

Separate Node.js service + PostgreSQL database for **Member Management** (P5.5). This is **not**
part of the Supabase-backed main app and **not** a Supabase Edge Function — it is a standalone
service, kept isolated on purpose. See:

- `docs/phase-5-5/00-member-management-architecture.md` — full architecture, data model, API
  contract, authorization model.
- `docs/phase-5-5/01-member-infrastructure-decision.md` — hosting/runtime decision (Mắt Bão Vibe
  Host v2, PostgreSQL 16, Node.js).

## P5.5-01 scope

Implemented:
- PostgreSQL schema for the `members` table and its enum types (migration
  `migrations/0001_init_members_schema.sql`), matching architecture mục 5 exactly.
- A deterministic migration runner (`scripts/migrate.mjs`).
- An HTTP skeleton with `/healthz` and `/readyz`.

## P5.5-02 scope (this subphase)

Implemented — the **Member Scope Authorization Bridge**, per
`docs/phase-5-5/00-member-management-architecture.md` mục 13:
- A Supabase Edge Function, `supabase/functions/resolve-member-scope/`, that verifies a real
  Supabase-authenticated user, re-reads `profiles.account_status` and `user_roles` server-side, and
  returns the minimal Member Management role/scope assertion — never trusting any role/organization
  claim the caller sends. A lone `SYSTEM_ADMIN` resolves to **zero** Member Management roles (mục
  7/12); `SYSTEM_ADMIN` held alongside `YOUTH_ADMIN` resolves to exactly the `YOUTH_ADMIN` scope,
  never a global bypass.
- `src/memberScope.js` — the Member API's client for that resolver (`resolveMemberScope`), the pure
  authorization decision (`deriveMemberManagementAuthorization`), and the per-request authorizer
  (`createMemberManagementAuthorizer`) used by `server.js`.
- `GET /v1/member-scope` — a minimal endpoint that proves the bridge end-to-end: returns the caller's
  resolved `{ user_id, roles }` when authorized, `401`/`403` otherwise. Returns **no Member data**.
- `GET/POST/... /v1/members` now enforces the same authorization boundary first (`401` with no/
  malformed `Authorization`, `403` with no Member Management role) and only then falls through to
  `501 Not Implemented` — Member CRUD/list itself is still out of scope until P5.5-03.
- No internal signed/JWT-like assertion between the Member API and the resolver: the two talk
  directly over HTTPS, authenticated by a shared secret (`x-member-api-secret`, same
  `hasTrustedWorkerSecret()` pattern as `CRON_SECRET` / P3-08) plus the real user's Supabase JWT.
  Signing an additional internal token was evaluated and rejected — architecture mục 13 already
  chose the "resolve fresh every request, no cache" model specifically to avoid that complexity.

**Not implemented in P5.5-02** (later subphases): real Member CRUD/list, import XLSX, any frontend,
any deploy to Mắt Bão, any purchase/provisioning of hosting, resolving owner decision mục 28.8
(`BRANCH_OFFICER` write permission).

## Local setup

Requires PostgreSQL 16 (or compatible) reachable locally — **never** point this at production data
or a real member roster.

```bash
cd member-api
npm install
cp .env.example .env   # edit MEMBER_DATABASE_URL to point at your local PostgreSQL 16
npm run migrate:fresh  # drops and recreates the schema, then applies every migration from zero
                        # (local/test only — never run --fresh against a database with real data)
npm start               # starts the HTTP server on PORT (default 8080)
```

To apply only pending migrations without touching existing data (e.g. after adding a new migration
file later): `npm run migrate`.

Optional synthetic seed data for manual local testing (never real member data):

```bash
npm run seed:dev
```

## Tests

```bash
cd member-api
npm install
export MEMBER_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/member_api_test
npm test
```

`npm test` runs `node --test tests/*.test.mjs` (Node's built-in test runner, same convention as the
root project's `npm test`). `MEMBER_DATABASE_URL` **must** point at a disposable local/test
database — `tests/schema.test.mjs` runs `migrate.mjs --fresh` (drops and recreates the schema)
before asserting against it.

CI runs these tests in the `member-api-test` job (`.github/workflows/ci.yml`) against a throwaway
`postgres:16` service container, completely separate from the `test-db` job's Supabase local stack.

Test files:
- `tests/schema.test.mjs` — bootstrap, constraints, enum validation, forbidden-column absence.
- `tests/isolation.test.mjs` — static checks: no `members` table in `supabase/migrations/`, no
  Supabase-owned table created here, no AI/RAG/Gemini dependency or reference, no client-supplied
  role/organization signal ever read for an authorization decision.
- `tests/server.test.mjs` — health/readiness behavior, fail-closed database-unavailable handling,
  the `/v1/member-scope` and `/v1/members` authorization boundary (401/403/501 matrix), config
  fail-fast behavior.
- `tests/memberScope.test.mjs` — the resolver HTTP client and authorization-derivation logic:
  malformed/unreachable/non-2xx resolver responses, bearer-token parsing, role/scope shape
  validation.

The Supabase-side resolver (`resolve-member-scope`) has its own tests under
`supabase/functions/resolve-member-scope/` — `contract.test.ts` (pure role/scope derivation) and
`index.test.ts` (full auth flow against the local Supabase stack: invalid/expired/forged JWT,
suspended account, cross-organization scope, the `SYSTEM_ADMIN`+`YOUTH_ADMIN` dual-role case), run
by the root `test-db` CI job alongside the other Edge Function tests.

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `MEMBER_DATABASE_URL` | Yes | PostgreSQL connection string. Missing → the process refuses to start (fail closed, no insecure default). |
| `PORT` | No (default `8080`) | HTTP port. |
| `MEMBER_SCOPE_RESOLVER_URL` | Yes | URL of the Supabase Edge Function `resolve-member-scope`. Missing → the process refuses to start. |
| `MEMBER_SCOPE_RESOLVER_SECRET` | Yes | Shared server-to-server secret with that Edge Function. Missing → the process refuses to start. Never a real production value in `.env.example` or `supabase/functions/.env` (local/CI use a fixed non-sensitive placeholder — see that file). |

No secret is ever read from or written to a `VITE_*` variable, and nothing here is committed with
real values (`.env` is gitignored; only `.env.example` is checked in).

## Known limitations / deferred to later subphases

- No Member CRUD/list yet — `/v1/members` enforces authorization but still returns
  `501 Not Implemented` once authorized (P5.5-03 scope, not a bug).
- No organization-code cache/validation table yet — `work_unit_code` is stored as free text with a
  non-blank constraint only; validation against Supabase `organizations.code` at write time is
  P5.5-03+ (cross-database foreign keys are not possible).
- Owner decision mục 28.8 (`BRANCH_OFFICER` write permission) is still open — the resolver already
  represents `BRANCH_OFFICER`'s existing scope, but P5.5-03 cannot implement `PATCH /members/:id`
  authorization for that role until it is answered.
- `pg_trgm`/`unaccent` extension availability on the eventual Vibe Host v2 managed PostgreSQL
  instance is **not verified** (see `01-member-infrastructure-decision.md` mục 5) — confirmed
  working on local/CI PostgreSQL 16 only.
- No deployment to Mắt Bão has happened — this only runs locally/in CI against a disposable
  PostgreSQL instance.
