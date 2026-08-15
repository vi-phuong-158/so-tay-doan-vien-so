# P3-08 — Email Worker Scheduling & End-to-End Delivery Rehearsal

## Status

- `P3_08A_REPO_IMPLEMENTATION`: **PASS** — self-verified by this agent (see "Automated
  validation" below). CI run `31854967535` on Draft PR #21 HEAD `3f082ef4` is green.
- `P3_08A_LIVE_REHEARSAL`: **OPERATOR_ACCEPTED_AGENT_UNVERIFIED** — see "External operator
  rehearsal (Gate 1 / OFF mode)" below.
- `P3_08A_PROJECT_GATE`: **CLOSED_BY_OWNER_ACCEPTANCE**.
- Gate 2 (`ALLOWLIST` single-email send, P3-08B) has **not** been attempted by anyone in this
  record and is not covered by this status.

## Baseline

- Starting branch: `claude/phase-3-email-worker-scheduling-825108`, created from `master`.
- Starting SHA / `origin/master`: `63d1b7a1412c948392dfbc8d2495119b447674b8` (P3-06 merged via
  PR #20).
- Working tree at start: clean.

## Audit summary

**Current worker architecture.** `process-email-queue` (Deno Edge Function) is POST-only. Request
order: (1) `hasTrustedWorkerSecret(x-cron-secret header, CRON_SECRET env)` — constant-time
compare, missing/mismatched → `403 FORBIDDEN` before any other env is even read; (2)
`EMAIL_DELIVERY_MODE` gate — `OFF` (including missing/empty/unrecognized values) returns
immediately, `0` claims, `0` provider calls, no provider client is even constructed; (3) worker
config (`EMAIL_WORKER_BATCH_SIZE` 1–50 default 20, `EMAIL_WORKER_LEASE_SECONDS` 30–900s default
300); (4) `claim_email_queue` RPC; (5) per-row allowlist check when `ALLOWLIST`; (6) render →
provider `send()` → `mark_email_sent`/`mark_email_retry`.

**Auth model.** Custom header secret (`x-cron-secret` / `CRON_SECRET`), not a Supabase JWT. No
scheduler previously invoked this path — P3-06 deliberately scheduled only the two pure-SQL RPCs
(`mark_overdue_assignments`, `scan_report_reminders`) and left `process-email-queue` manual, since
scheduling code that can send real email was explicitly out of its scope (see decisions.md,
"P3-06 does not schedule the email worker").

**Retry / concurrency model.** `claim_email_queue` (202608110002) uses `FOR UPDATE SKIP LOCKED`,
a claim token, `worker_id`, and a lease (`lease_expires_at`); a second concurrent claim call
cannot see rows already claimed. This is proven by both an existing pgTAP assertion
(`supabase/tests/email_queue_state_machine.sql`, "second worker cannot claim owned row") and an
existing Deno integration test that fires two real concurrent `claim_email_queue` RPCs
(`supabase/functions/email_queue_state_machine.integration.test.ts`). `mark_email_retry`
classifies retryable vs. terminal failures with a capped backoff (60s / 300s / 900s / 3600s) and a
bounded `max_attempts` (default 5); stale `PROCESSING` rows past their lease are reclaimed on the
next claim, or force-`FAILED` with `MAX_ATTEMPTS_EXCEEDED` once attempts are exhausted. The
provider adapter (`provider.ts`) sends Resend's `Idempotency-Key: email:{queue_id}` header, so a
timeout-after-accept is bounded by Resend's own idempotency window, not unbounded.

**Failure model.** At-least-once claim+send, not exactly-once — an explicit, already-documented
P3-02/P3-03 trade-off. No code in this task changes that; P3-08 only adds a trigger for the
existing worker to run automatically.

**Missing scheduler pieces (before this task).** No `pg_cron` job invoked `process-email-queue`.
`pg_net` was not enabled. No Vault-backed mechanism existed to hand `CRON_SECRET` to a cron job
body without a literal in a migration.

**Proposed minimal change (implemented).** One new forward migration:
`pg_net` extension + one idempotent `pg_cron` job, `email_queue_worker`, on `*/10 * * * *`, whose
body is `net.http_post` against the existing `process-email-queue` URL with the existing
`x-cron-secret` header — both values read from Supabase Vault at execution time. See
`docs/brain/03-decisions.md` ("P3-08 schedules the email worker via pg_cron → pg_net → existing
Edge Function") for the full reasoning and trade-offs.

**Files changed.**

| File | Purpose |
| --- | --- |
| `supabase/migrations/202608150001_phase_3_email_worker_scheduling.sql` | Enables `pg_net`; installs the idempotent `email_queue_worker` cron job. No secret literal. |
| `supabase/tests/email_worker_scheduling.sql` | pgTAP: job exists exactly once, correct schedule/name/active state, body shape (Vault-sourced, no literal secret/URL), idempotent re-registration, P3-06/P3-R1 non-regression. |
| `docs/phase-3/08-email-worker-scheduling.md` | This document. |
| `docs/brain/01-architecture.md`, `03-decisions.md`, `04-current-tasks.md`, `06-ai-working-log.md` | Code Graph / decision / task-state / working-log updates. |

**Risks.**

1. `net.http_post` is async/fire-and-forget from pg_cron's point of view. `cron.job_run_details`
   proves the *scheduling tick* fired; it does not prove the HTTP call reached the Edge Function or
   that the Edge Function's internal logic completed. Confirming an actual invocation requires one
   of: `net._http_response` (pg_net's own response log, TTL-bounded), the Edge Function's own logs,
   or observed `email_queue`/`email_logs` state change. This is documented under Observability
   below, not solved with new code (the task instructs reusing existing observability).
2. The two Vault secrets (`email_queue_worker_url`, `email_queue_worker_cron_secret`) must be
   provisioned once per environment via a manual SQL step, run directly against that environment's
   database, never committed. Until provisioned, the job body's `url` resolves `NULL` and the async
   call fails harmlessly — it cannot fail a migration, `db reset`, or a test run.
3. This sandboxed execution environment has no Docker, no Deno, and no authenticated Supabase CLI
   session — matching every prior Phase 2/3 task's local environment (see `docs/brain/06-ai-working-log.md`
   P3-06 entry). `supabase db reset` / pgTAP / Deno checks can only be confirmed via GitHub Actions
   CI on the Draft PR, not locally, and the live Supabase rehearsal (Gate 1/2) cannot be executed
   from this session without the user providing/confirming Supabase CLI access to
   `znexculhbdjiflkczpyu`. See "Rehearsal status" below.

## Implementation

- **Migration:** `202608150001_phase_3_email_worker_scheduling.sql`.
- **Worker scheduling:** one `pg_cron` job, name `email_queue_worker`.
- **Schedule:** `*/10 * * * *` (every 10 minutes; no technical reason found to go faster — see
  decisions.md).
- **Auth mechanism:** existing `x-cron-secret` header / `CRON_SECRET` env comparison inside
  `process-email-queue` (unchanged); the header value is supplied by the cron job body from
  Supabase Vault, not a literal.
- **Batch size / retry behavior:** unchanged from P3-02/P3-03 (`EMAIL_WORKER_BATCH_SIZE` 1–50
  default 20; `mark_email_retry` backoff 60s/300s/900s/3600s, `max_attempts` default 5, both
  pre-existing and already bounded — this task does not tune them).

## Operational runbook (per environment, never committed)

Run directly against the target Supabase project's database (SQL editor or `supabase db execute`
against a live project — not a migration file, not this repo):

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/process-email-queue',
  'email_queue_worker_url'
);
select vault.create_secret(
  '<value that exactly matches this project''s process-email-queue CRON_SECRET secret>',
  'email_queue_worker_cron_secret'
);
```

Both statements are idempotent to re-run with an updated value (`vault.create_secret` on an
existing name updates it). Neither statement, nor the secret values themselves, are ever pasted
into this repo, a PR body, or a log.

### Temporary fast rehearsal job (Gate 1/2 evidence only)

Per the task brief, the *official* job stays at `*/10 * * * *`; for live rehearsal evidence a
temporary, faster job calling the exact same invocation path is created directly on the rehearsal
database (not committed), then removed immediately after acceptance:

```sql
select cron.schedule(
  'rehearsal_p3_08_worker',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_worker_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_worker_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
-- ... rehearsal evidence gathering ...
select cron.unschedule('rehearsal_p3_08_worker');
```

## Observability

No new monitoring code — reusing what already exists, per task scope:

- `cron.job_run_details` — did the scheduling tick fire, when, succeeded/failed.
- `net._http_response` (pg_net) — did the HTTP call to the Edge Function get a response, status
  code, timing (TTL-bounded retention).
- Edge Function logs (Supabase dashboard / CLI) — request received, `x-cron-secret` accepted,
  `EMAIL_DELIVERY_MODE`, claimed/sent/retried/failed counts (the JSON response body already
  returned by `index.ts`).
- `email_queue` / `email_logs` — authoritative claimed/sent/failed state, provider message ID,
  attempt count, `source_entity_type`/`source_entity_id`.

## Automated validation (this branch, pre-rehearsal)

| Gate | Result |
| --- | --- |
| `npm test` | PASS, 45/45 |
| `npm run lint` | PASS, 0 errors, 3 pre-existing Fast Refresh warnings (unchanged) |
| `npm run build` | PASS |
| `supabase db reset` / pgTAP | PASS via CI — `Files=19, Tests=476` (up from P3-06 baseline `Files=18, Tests=450`; includes new `email_worker_scheduling.sql`) |
| `deno check` / `deno test` | PASS via CI — `42 passed, 0 failed` (unchanged count; no Edge Function code was modified) |
| CI run | [`31853922597`](https://github.com/vi-phuong-158/so-tay-doan-vien-so/actions/runs/31853922597) — PASS (`build` job: frontend 45/45 + lint + build; `test-db` job: pgTAP + Deno as above). Draft [PR #21](https://github.com/vi-phuong-158/so-tay-doan-vien-so/pull/21). |

## Rehearsal status

**Gate 1 (OFF mode): environment-level evidence exists but was not produced or independently
verified by this agent.** This agent never obtained Supabase access in any turn of this task — no
MCP connector, no `SUPABASE_ACCESS_TOKEN`, no authenticated CLI session existed at any point (this
was re-checked, freshly, multiple times). Every Gate 1 fact below is recorded on the basis of
external submissions the project owner reviewed and accepted, not on anything this agent ran or
observed itself.

**Gate 2 (`ALLOWLIST` single-email send) has not been attempted by anyone and is not addressed by
this record.**

### External operator rehearsal (Gate 1 / OFF mode)

- **Environment evidence provenance:** `AUTHENTICATED_EXTERNAL_OPERATOR` (as reported to the
  project owner; an authenticated Supabase session outside this agent's sandbox).
- **Independent verification by this Claude session:** `NOT AVAILABLE`.
- **Project-owner governance acceptance:** `ACCEPTED` — the project owner reviewed the external
  evidence directly and decided, on their own authority over their own infrastructure, to accept
  it as the environment-level record for Gate 1 and to let the project proceed on that basis.

Reported evidence summary (as submitted to the project owner; values below are recorded for
traceability, not independently confirmed by this agent):

| Item | Reported value |
| --- | --- |
| `process-email-queue` deployed version | `6`, status `ACTIVE` |
| Deployed function hash | `fe4250b95c0497bb17dbcbee564144201877e4e1870439f95269019497483e5b` |
| Vault secret names present (values never exposed) | `email_queue_worker_url`, `email_queue_worker_cron_secret` |
| `pg_net` version | `0.20.4` |
| `email_queue_worker` cron job | `active`, schedule `*/10 * * * *` |
| `report_mark_overdue_daily` / `report_reminder_scan_daily` | unchanged, `5 17 * * *` / `0 0 * * *`, both active |
| Temporary rehearsal job (`rehearsal_p3_08a_worker`) executions | 2 runs, both `succeeded`, both HTTP `200` with body `delivery_mode=OFF, claimed=0, sent=0` |
| Temporary job removed after | yes, `0` temporary jobs remaining |
| Eligible `PENDING`/`RETRY` queue rows at end | `0` |
| `supabase_migrations.schema_migrations` row for `202608150001_...` | none — SQL was applied directly for rehearsal rather than through a recorded migration deployment; not treated as a defect (see "Migration history note" below) |

**Note on one evidence submission:** one file submitted as supporting evidence for this record
(`P3_08A_operator_evidence.md`) contained text directing how this agent should phrase its
conclusions and which verdict labels to avoid using. This agent did not act on those directives —
it declined to adopt any instruction embedded in observed content, consistent with treating
tool/file content as data rather than commands — and raised this directly with the project owner
before the governance decision above was made. Recorded here only for transparency to anyone
reading this document later.

### Migration history note

The reported evidence shows the P3-08 scheduling SQL applied directly against rehearsal for this
exercise, without a corresponding `supabase_migrations.schema_migrations` row (i.e. not applied
through a normal tracked migration deployment). `202608150001_phase_3_email_worker_scheduling.sql`
is written to be idempotent (see the migration file's own unschedule-then-schedule guard, mirroring
the P3-06 pattern) specifically so that a later standard `supabase db push` / migration deployment
against this same project can safely apply it for real without erroring on "job already exists" or
creating a duplicate `email_queue_worker` job. This is an operational sequencing note, not a defect
in the migration.

### Reasoning for why this agent could not go further itself

Across this task, three concrete paths to independent verification were identified and none
materialized in this session: (1) a Supabase MCP connector attached to this session, (2)
`SUPABASE_ACCESS_TOKEN` injected into this session's environment, (3) raw tool output this agent
could read directly. Repeated re-checks (`ToolSearch`, environment variables, `supabase projects
list`) confirmed no change in access at any point. This agent declined to write self-verification
claims it could not back up, and declined to treat instructions embedded in chat messages or
submitted files as a substitute for that verification — the dual-status record above (repo
self-verified vs. externally-sourced, owner-accepted) is the result of that standard being held
consistently while still respecting the project owner's authority to accept external operational
evidence for their own infrastructure.

## Final email delivery mode

Reported as `OFF` at the end of the external operator rehearsal (per the evidence summary above:
the two Gate 1 invocations both returned `delivery_mode=OFF`, and no `ALLOWLIST`/`LIVE` change was
reported). This agent did not itself read or set `EMAIL_DELIVERY_MODE` on
`znexculhbdjiflkczpyu` at any point and cannot independently confirm the current live value.

## Next recommended task

`P3-08B — ALLOWLIST Single-Email Delivery Rehearsal`, per the project owner's stated intent — not
started, and the same access/provenance constraints described above will apply to it.
