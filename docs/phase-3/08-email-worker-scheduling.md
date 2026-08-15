# P3-08 — Email Worker Scheduling & End-to-End Delivery Rehearsal

## Status

`IMPLEMENTATION_COMPLETE_CI_GREEN` — CI run `31853922597` on Draft PR #21 head `03a883d` is
green. Live Supabase rehearsal (Gate 1/2) not started. See "Rehearsal status" below for why.

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

**Not started.** Gates 17–36 of the task brief (deploy to the `so-tay-doan-vien-rehearsal` project
`znexculhbdjiflkczpyu`, verify `EMAIL_DELIVERY_MODE=OFF` live, send exactly one `ALLOWLIST`
rehearsal email, prove no duplicate on re-run, prove a non-allowlisted recipient is rejected,
restore `OFF`, remove the temporary job, clean fixtures) require:

1. An authenticated Supabase CLI session (or equivalent) with access to project
   `znexculhbdjiflkczpyu`, to deploy this migration, run the two `vault.create_secret` calls, read
   cron/Edge Function state, and restore `EMAIL_DELIVERY_MODE=OFF` at the end.
2. Ability to observe a real inbox for the approved rehearsal recipient, to record inbox
   confirmation per the task's `received: YES/NO` requirement.

This sandboxed execution environment has no Docker, no Deno, and no evidence of an authenticated
Supabase CLI session or Resend/project credentials — the same constraint every prior Phase 2/3
task in this repo has recorded for its local environment (see the P3-06 working-log entry). Rather
than fabricate rehearsal evidence or skip the safety gates the task brief requires, this section
will be completed once the user confirms how CLI/credential access should be provided for this
session, or runs the rehearsal steps themselves using this document's runbook and the exact
acceptance criteria in the task brief.

## Final email delivery mode

Not applicable yet — no environment was touched by this task beyond the local git branch. Once
rehearsal Gate 2 runs, `EMAIL_DELIVERY_MODE` on `znexculhbdjiflkczpyu` must end the task at `OFF`
(mandatory; see "Rehearsal status").

## Next recommended task

Once CI is green on this branch's Draft PR and the user has confirmed how to proceed with live
rehearsal: complete Gates 1–2 against `znexculhbdjiflkczpyu` per this document's runbook, then
update this file with the full evidence tables before requesting `P3_08_PASS`.
