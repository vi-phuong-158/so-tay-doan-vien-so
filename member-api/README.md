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

## P5.5-02 — Member Scope Authorization Bridge

Implemented, per `docs/phase-5-5/00-member-management-architecture.md` mục 13:
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
- No internal signed/JWT-like assertion between the Member API and the resolver: the two talk
  directly over HTTPS, authenticated by a shared secret (`x-member-api-secret`, same
  `hasTrustedWorkerSecret()` pattern as `CRON_SECRET` / P3-08) plus the real user's Supabase JWT.
  Signing an additional internal token was evaluated and rejected — architecture mục 13 already
  chose the "resolve fresh every request, no cache" model specifically to avoid that complexity.

## P5.5-03 — Member CRUD vertical slice

Implemented — `GET/POST /v1/members`, `GET/PATCH /v1/members/:id` (real CRUD, not the `501` stub
from P5.5-02):
- `src/memberRoutes.js` / `src/memberRepository.js` / `src/memberValidation.js` / `src/scope.js`.
- Scope enforcement server-side via `resolveEffectiveOrgScope(roles)` — global scope means
  unrestricted among valid organizations, a non-global scope filters to the union of the caller's
  `org_codes`, and an **empty** resolved scope always means **zero rows**, never "see everything".
  `YOUTH_ADMIN` and `BRANCH_OFFICER` are enforced identically once scope is resolved (owner decision
  on mục 28.8: `BRANCH_OFFICER` may create/update within its own scope, not just read).
- Explicit allowlist mass-assignment protection on create/patch; `work_unit_code` is not in the
  PATCH allowlist (organization transfer is immutable through this endpoint — mục 6). Responses are
  always built field-by-field (never `SELECT *`), and never include `account_user_id`.
- `POST /v1/members` validates `work_unit_code` in two independent steps: (1)
  `src/organizationDirectory.js` (`checkOrganizationExists`) confirms the code is a real
  `organizations.code` by reading Supabase's REST endpoint with the caller's own bearer token (no
  service role, no local copy/registry of organizations); (2) `assertOrgCodeInScope` confirms the
  code is inside the caller's resolved scope. A real code outside scope is still `403`; an
  unresolvable/nonexistent code is `400` — checked in that order.
- No hard delete: `DELETE /v1/members/:id` deliberately returns `501`. Archiving is an ordinary
  `PATCH member_status: 'ARCHIVED'` (mục 17 lifecycle contract), not a separate endpoint.

## P5.5-04 — Search / filter / list

Implemented — the full server-side filter/search/sort contract of `GET /v1/members` (mục 14/23/25),
building on P5.5-03's existing pagination, `work_unit_code`/`member_status` filters, and
accent-insensitive `pg_trgm`+`unaccent` search (all reused unchanged):
- **New filters**, same bound-parameter/enum-allowlist/`AND`-with-scope pattern as the existing two:
  `youth_position`, `youth_board_position`, `political_theory_level`.
- **New `sort` query param** — fixed allowlist `full_name_asc` (default) / `updated_at_desc`; any
  other value is a `400`, never a silent fallback or a raw value reaching SQL. Both orderings add
  `member_id ASC` as a deterministic tie-breaker so pagination stays stable when many rows share the
  same `full_name`/`updated_at`.
- **No new migration/index.** Benchmarked first (`tests/memberPerformance.test.mjs` +
  `tests/helpers/syntheticMembers.mjs` generate a synthetic ~3,000-row dataset — never real member
  data): the P5.5-01 indexes (`idx_members_work_unit_status`, `idx_members_full_name_trgm`) already
  meet the `<300ms` server-side target (mục 25) by a wide margin — list/filter ≈2ms, search ≈10ms
  median at 3,000 rows — so no schema change was warranted.
- Pagination edge cases (negative/zero/non-numeric/oversized `limit`/`offset`, offset beyond the
  dataset) were already handled correctly by P5.5-03's `parseListQuery`; P5.5-04 added test coverage
  for them rather than changing the behavior.

## P5.5-05 — Excel import

Implemented — the full vertical slice of mục 9/10: `upload → parse → validate → stage → preview →
confirm → commit`, never "read Excel then insert straight into `members`":

- **Job state machine** (`migrations/0002_member_import_staging.sql`): `member_import_jobs`
  (`UPLOADED → READY_FOR_CONFIRM → COMMITTED`, or `→ CANCELLED`/`→ FAILED`) and
  `member_import_job_rows` (per-row `VALID`/`INVALID`/`POSSIBLE_DUPLICATE`/`WARNING`, normalized
  data, errors, dedup candidate). Deliberate implementation choice: mục 10's `PARSED` state is not a
  separate durable status here — parse + per-row validate/dedup run synchronously inside the same
  request that creates the job (a ~3,000-row batch finishes in well under a second locally; see
  Performance below), so there is no externally observable "still validating" window. A crash
  mid-parse still leaves a traceable `UPLOADED` job row (created *before* parsing starts) rather than
  no record at all.
- **Parsing** (`src/importParser.js`, using `exceljs`): never trusts the browser's declared
  Content-Type — acceptance is decided by whether the bytes actually parse as a workbook. A fixed,
  literal header contract (`full_name`/`work_unit_code` required; `date_of_birth`, `gender`,
  `job_title`, `member_status`, `political_theory_level`, `youth_position`, `youth_board_position`,
  `external_ref_note` optional — same names as the CRUD payload fields, not a separate
  Vietnamese-label taxonomy) rejects a missing required header or a duplicate header column outright;
  an unrecognized extra column is ignored, not fatal. A formula cell's cached `result` is read as
  data — nothing here ever evaluates a formula. Bounded against oversized input: 10 MB max file size,
  10,000 max data rows (`MAX_IMPORT_FILE_BYTES`/`MAX_IMPORT_ROWS` in `src/importValidation.js`).
- **Field validation** (`src/importValidation.js`): reuses the exact same enum constants as
  `memberValidation.js` — an imported row can never end up more permissive than a row created through
  ordinary `POST /v1/members`.
- **Organization existence + scope** (`src/organizationDirectory.js`'s new
  `createOrganizationDirectoryBatch`/`checkOrganizationCodesExist`, `src/scope.js`'s new
  `isOrgCodeInScope`): one batched Supabase REST call per distinct `work_unit_code` in the whole
  file, not one call per row. A code that does not exist, or exists but is outside the caller's
  resolved scope, makes that row `INVALID` (never silently rerouted) — mirrors threat #7 of mục 22.
- **Dedup soft-match** (`src/importDedup.js`): two bounded, set-based SQL queries (never one query
  per row) using the SAME `member_immutable_unaccent()` function the `members` search index already
  uses — against existing `members` rows, and against other rows in the same batch. Name+work_unit
  match with equal, non-null DOB on both sides → `POSSIBLE_DUPLICATE`; DOB missing on either side →
  `WARNING`; both sides have DOB but it differs → not flagged (treated as a different person).
  **Never auto-merges.** A `POSSIBLE_DUPLICATE`/`WARNING` row is excluded from commit by default; a
  human can explicitly override a specific row at confirm time to still create it as a brand-new,
  separate record (`row_overrides: [{ row_number, action: 'CREATE_NEW' }]`) — this endpoint never
  supports merging an import row into the candidate it matched (deferred, like Export in mục 9 — a
  human-in-the-loop "update this specific existing member from an import row" workflow would be a
  separate, explicit architecture decision, not a default of P5.5-05).
- **Only `YOUTH_ADMIN` may import** (mục 7/12) — `BRANCH_OFFICER`'s P5.5-03 CRUD write permission
  does **not** extend to bulk import; enforced in `src/importRoutes.js`, independent of the general
  Member-Management-capable-role check `server.js` already does for every Member route.
- **Confirm/commit** (`src/importRepository.js`'s `confirmImportJob`): one transaction, `SELECT ...
  FOR UPDATE` on the job row. Idempotent (a second confirm on an already-`COMMITTED` job returns the
  existing result, inserts nothing new — safe against double-click, client retry after a dropped
  response), safe under concurrency (a second concurrent call blocks on the row lock, then sees
  `COMMITTED`), and re-authorizes against the **current** resolved scope for the confirm request
  itself (not the scope that was in effect at upload time) — if the actor's scope narrowed in
  between, the **whole** commit aborts with `409 scope_changed` rather than silently importing a
  subset (all-or-nothing, matching mục 10's atomicity contract). Deliberately sequential per-row
  `INSERT`s inside the one transaction, matching mục 10's own stated preference ("ưu tiên correctness
  hơn throughput... không cần streaming/batch-commit phức tạp" for a ~3,000-row pilot commit) over a
  set-based bulk insert that would still need a reliable row↔member_id correlation for
  `committed_member_id`/traceability.
- **Routes** (`src/importRoutes.js`, wired into `server.js` *before* the generic
  `/v1/members/:id` pattern so `/v1/members/import...` is never mistaken for `:id="import"`):
  - `POST /v1/members/import` — raw file bytes as the body (any Content-Type; not JSON — the
    original filename, if any, is passed via `X-Import-Filename` and is purely informational, never
    trusted for anything functional), returns the job id + summary counts.
  - `GET /v1/members/import/:jobId` — job status/summary. `GET /v1/members/import/:jobId/rows` —
    paginated per-row preview, optional `row_status` filter.
  - `POST /v1/members/import/:jobId/confirm` — commits.
    `POST /v1/members/import/:jobId/cancel` — cancels a job still `READY_FOR_CONFIRM` (also
    idempotent).
  - Access to a job (mục 9 "chủ job hoặc role quản lý"): the job's own creator, or any global-scope
    `YOUTH_ADMIN`. A different scoped `YOUTH_ADMIN` who did not create the job gets `404` (not `403`)
    — same anti-enumeration contract as `GET /v1/members/:id`.
- **Audit**: this subphase does not add the generic cross-cutting mutation audit table (that is
  P5.5-07's job, matching the same "audit deferred to P5.5-07" precedent P5.5-03 already set for
  ordinary CRUD). `member_import_jobs` itself durably records who imported what, when, how many rows
  of each outcome, and the final committed count — sufficient for P5.5-05's own "audit job"
  acceptance bullet (mục 23).

### Import performance evidence (mục 25)

`tests/memberImportPerformance.test.mjs` + `tests/helpers/syntheticImportWorkbook.mjs` (synthetic
data only, never a real roster) generate a ~3,000-row `.xlsx` with a realistic mix of valid, invalid,
and duplicate rows and measure both phases against the architecture's targets:

| Phase | Target (mục 25) | Measured locally |
|---|---|---|
| Upload (parse + validate + dedup + stage) | "vài giây tới dưới 1 phút" | ≈280ms |
| Confirm/commit | "dưới vài giây" | ≈550ms for ~2,580 committed rows |
| `GET /v1/members` list after import | `<300ms` | ≈4ms |

No new index was needed — the same P5.5-01/04 indexes already comfortably cover the dedup query's
join shape (`work_unit_code` equality + `member_immutable_unaccent(full_name)` equality) at this row
count.

**Not implemented in P5.5-02/03/04/05** (later subphases): audit table (P5.5-07), frontend
(P5.5-06), `/member-metadata`, any deploy to Mắt Bão, any purchase/provisioning of hosting.

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
- `tests/memberValidation.test.mjs` — payload/query validation: mass-assignment allowlists, enum
  bounds, `parseListQuery` (limit/offset clamping, filters, `sort` allowlist).
- `tests/organizationDirectory.test.mjs` — the `work_unit_code` existence check against Supabase's
  `organizations` REST endpoint (real code, fake code, unreachable Supabase → fail-closed `503`).
- `tests/memberCrud.test.mjs` — `memberRepository.js` directly against a real local PostgreSQL:
  scope enforcement, all filters (including the P5.5-04 `youth_position`/`youth_board_position`/
  `political_theory_level` additions) ANDed with scope, sort/tie-breaker determinism, pagination
  edge cases, SQL/LIKE-metacharacter safety.
- `tests/memberRoutes.test.mjs` — the same matrix at the HTTP layer (real server + real Postgres):
  cross-org isolation, organization-spoofing attempts, mass-assignment at the HTTP boundary, the
  P5.5-04 filter/sort query-string contract (including invalid-enum and injection-shaped `sort` →
  `400`), and the `DELETE` → `501` contract.
- `tests/memberPerformance.test.mjs` (P5.5-04) — seeds a synthetic ~3,000-row dataset
  (`tests/helpers/syntheticMembers.mjs`, never real member data) and asserts the `<300ms`
  server-side list/filter and search targets (mục 25) on warmed-up, multi-iteration timings
  (reports min/median/max to the console rather than asserting on a single sample).
- `tests/importValidation.test.mjs` (P5.5-05) — pure field validation (`importValidation.js`) and
  workbook parsing (`importParser.js`): required/optional fields, enum bounds, date normalization
  (Excel date cell vs. ISO string vs. malformed), SQL/metacharacter-shaped text handled as ordinary
  text, malformed/empty workbook, missing/duplicate/unrecognized header, empty rows skipped, formula
  cells read as cached result (including a formula error result), oversized row count.
- `tests/importDedup.test.mjs` (P5.5-05) — `detectDuplicates` against a real Member Postgres:
  `POSSIBLE_DUPLICATE` vs `WARNING` by DOB presence, accent-insensitive matching, a different
  work_unit_code or a genuinely different (non-null, non-equal) DOB never flags a match, in-batch
  pairs, existing-member match taking priority over an in-batch one, and that detection never writes
  to `members` itself (advisory only).
- `tests/memberImportRoutes.test.mjs` (P5.5-05) — the full HTTP-level security/behavior matrix: the
  complete upload→preview→confirm→commit vertical slice; cross-scope and unknown-organization rows
  becoming `INVALID` and never committed; the `YOUTH_ADMIN`-only import gate (`BRANCH_OFFICER`
  denied `403` despite being CRUD-capable); a malformed workbook producing a traceable `FAILED` job;
  oversized upload rejected before any job is created; duplicate confirm, concurrent confirm, and
  retry-after-timeout all being idempotent (exactly one committed row, never a duplicate); confirming
  a `CANCELLED` job (`409`); cancel idempotency; the default-exclude-then-explicit-`CREATE_NEW`
  override behavior for `POSSIBLE_DUPLICATE` rows (never a merge); rejecting an override for a row
  that isn't actually `POSSIBLE_DUPLICATE`/`WARNING`; job-ownership isolation (user B gets `404` on
  every sub-route of user A's scoped job by guessing its UUID); a global `YOUTH_ADMIN` being able to
  read any job; unknown job id → `404` on every sub-route; and confirm re-checking scope fresh
  (all-or-nothing abort, `409 scope_changed`, if the actor's scope narrowed between upload and
  confirm).
- `tests/memberImportPerformance.test.mjs` (P5.5-05) — the ~3,000-row synthetic import benchmark
  described above.

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

- No audit table (P5.5-07), no frontend (P5.5-06), no `/member-metadata` endpoint yet.
- Import does not support merging/updating an existing member from an import row — a
  `POSSIBLE_DUPLICATE`/`WARNING` row can only be excluded (default) or explicitly created as a
  brand-new, separate record (`CREATE_NEW` override); it can never be linked to/merged into the
  candidate it matched. `member_id` is deliberately never exposed as an import column (mục 5: "not a
  business identifier, not displayed to users") — a real "update this specific member from a row"
  workflow, if ever needed, is a separate, explicit architecture decision.
- Import's per-row organization existence/scope check and dedup are not re-verified at confirm time
  row-by-row against a *fresh* database read (only the actor's authorized org **scope** is
  re-verified fresh, all-or-nothing) — an organization or an existing member could theoretically
  change between preview and confirm for reasons other than the actor's own scope (e.g. an
  extremely rare `organizations.code` write, which mục 6 already establishes has no write path in
  the current schema/grants). Not treated as a gap given that evidence.
- No organization-code cache/validation table — `work_unit_code` is validated at write time against
  Supabase's live `organizations` table via `organizationDirectory.js` (cross-database foreign keys
  are not possible, so this is an application-level check, not a schema constraint).
- `pg_trgm`/`unaccent` extension availability on the eventual Vibe Host v2 managed PostgreSQL
  instance is **not verified** (see `01-member-infrastructure-decision.md` mục 5) — confirmed
  working on local/CI PostgreSQL 16 only. Not a current blocker: the P5.5-04 performance benchmark
  (~3,000 synthetic rows) meets the `<300ms` target even without relying on the trigram index being
  chosen by the planner at this row count (PostgreSQL preferred a sequential scan over the GIN index
  at 3,000 rows in local benchmarking — both are fast enough; this may change as the table grows).
- No deployment to Mắt Bão has happened — this only runs locally/in CI against a disposable
  PostgreSQL instance.
