# Member API (P5.5)

Separate Node.js service + PostgreSQL database for **Member Management** (P5.5). This is **not**
part of the Supabase-backed main app and **not** a Supabase Edge Function — it is a standalone
service, kept isolated on purpose. See:

- `docs/phase-5-5/00-member-management-architecture.md` — full architecture, data model, API
  contract, authorization model.
- `docs/phase-5-5/01-member-infrastructure-decision.md` — hosting/runtime decision (Mắt Bão Vibe
  Host v2, PostgreSQL 16, Node.js).

## P5.5-01 scope (this subphase only)

Implemented:
- PostgreSQL schema for the `members` table and its enum types (migration
  `migrations/0001_init_members_schema.sql`), matching architecture mục 5 exactly.
- A deterministic migration runner (`scripts/migrate.mjs`).
- An HTTP skeleton with `/healthz`, `/readyz`, and a `/v1/members` placeholder that always denies
  (501) — no authorization bridge exists yet, so this deliberately fails closed instead of a mock
  "allow" (architecture mục 17).

**Not implemented in P5.5-01** (later subphases): real CRUD, import XLSX, the
`resolve-member-scope` authorization bridge (P5.5-02), any frontend, any deploy to Mắt Bão, any
purchase/provisioning of hosting.

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
  Supabase-owned table created here, no AI/RAG/Gemini dependency or reference.
- `tests/server.test.mjs` — health/readiness behavior, fail-closed database-unavailable handling,
  the `/v1/members` deny-by-default placeholder, and config fail-fast behavior.

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `MEMBER_DATABASE_URL` | Yes | PostgreSQL connection string. Missing → the process refuses to start (fail closed, no insecure default). |
| `PORT` | No (default `8080`) | HTTP port. |

No Supabase credentials are configured here yet — the authorization bridge
(`resolve-member-scope` resolver call) is P5.5-02, not this subphase. No secret is ever read from
or written to a `VITE_*` variable, and nothing here is committed with real values (`.env` is
gitignored; only `.env.example` is checked in).

## Known limitations / deferred to later subphases

- No authorization bridge — `/v1/members` always returns `501 Not Implemented` regardless of any
  `Authorization` header. This is intentional (P5.5-02 scope), not a bug.
- No organization-code cache/validation table yet — `work_unit_code` is stored as free text with a
  non-blank constraint only; validation against Supabase `organizations.code` happens at the API
  layer once the resolver exists (P5.5-02+), not at the database layer (cross-database foreign keys
  are not possible).
- `pg_trgm`/`unaccent` extension availability on the eventual Vibe Host v2 managed PostgreSQL
  instance is **not verified** (see `01-member-infrastructure-decision.md` mục 5) — confirmed
  working on local/CI PostgreSQL 16 only.
- No deployment to Mắt Bão has happened — this only runs locally/in CI against a disposable
  PostgreSQL instance.
