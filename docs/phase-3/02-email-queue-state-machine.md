# P3-02 - Email Queue State Machine & Concurrency Safety

## Verdict: PASS technical acceptance

Implementation passed CI acceptance on branch `feat/phase-3b-email-queue-safety`.
The branch starts at P3-01 acceptance HEAD `b445045`; P3-01 Draft PR #12 was not merged
when this work started, so this is an intentional stacked dependency. No provider, cron,
reminder engine, or real email delivery is enabled by this task.

## Scope delivered

- Expanded `email_queue` with explicit `RETRY`, `max_attempts`, `next_attempt_at`, claim
  token, worker id, claim/lease timestamps, source identity and bounded error fields.
- Added service-role-only `enqueue_email_for_user_event`. It resolves the recipient from
  `auth.users` and an ACTIVE profile, normalizes/validates the address, computes the
  idempotency key, and rejects HTML/raw HTML payload keys and oversized JSON.
- Added service-role-only `claim_email_queue`, using `FOR UPDATE SKIP LOCKED`, database
  time, deterministic ordering, a batch cap of 50 and a 30-900 second lease range.
- Added token-guarded `mark_email_sent` and `mark_email_retry`. Retry delays are deterministic
  (60s, 300s, 900s, 3600s cap); non-retryable errors and max attempts become terminal FAILED.
- Claim reclaims expired PROCESSING rows. A reclaimed row receives a new token/owner, so
  an old worker cannot complete or retry it.
- Added per-attempt `email_logs` evidence and `get_email_queue_stats` for service-role
  operational counts. Error text is bounded to 500 characters and sensitive-looking
  authorization/key/bearer/secret/token messages are replaced with `REDACTED_ERROR`.
- Revoked direct queue/log access and lifecycle RPC execution from anon/authenticated.
- Replaced the unsafe provider-calling `process-email-queue` path with a guarded disabled
  endpoint returning `EMAIL_PROVIDER_DEFERRED` until P3-03.

## State and ownership contract

| State | Entry | Exit | Terminal |
|---|---|---|---|
| PENDING | trusted enqueue | eligible claim | no |
| PROCESSING | current worker claim or stale reclaim | current-token SENT/RETRY/FAILED | no |
| RETRY | current-token retryable failure | scheduled claim | no |
| SENT | current-token success | none | yes |
| FAILED | non-retryable/max-attempt failure or exhausted lease | none | yes |
| CANCELLED | legacy administrative state | none | yes |

The database guarantees one logical row per computed event identity, one active owner per
claim, finite retry, and stale-owner rejection. It does not claim exactly-once provider
delivery: a provider timeout can remain ambiguous until P3-03 adds an adapter policy.

## Async failure policy

Email is secondary asynchronous work. P3-02 queue insertion is not wired into the P3-01
notification transaction and must not make the core notification/business transaction fail.
When production event hooks are added in a later task, they should record a bounded server
error/metric and continue the primary business operation; a trusted outbox/queue repair path
must handle a failed insert. P3-02 intentionally does not add those hooks.

## Acceptance matrix

1. pgTAP rejects ordinary-user SELECT/INSERT/UPDATE/DELETE and lifecycle RPC calls.
2. Trusted enqueue resolves recipients, validates payloads, and is idempotent.
3. Future scheduling is ineligible; claim is deterministic and capped at 50.
4. Concurrent claims produce one owner; a missing/stale token cannot complete work.
5. Retry writes server-calculated `next_attempt_at`, bounded errors and attempt logs.
6. Max attempts/non-retryable failures become terminal FAILED; SENT and FAILED are not
   claimable.
7. Expired PROCESSING is reclaimable and the prior owner is rejected after reclaim.
8. Deno integration test runs concurrent enqueue and claim calls plus stale reclaim against
   the live local Supabase API; it is ignored only when CI connection variables are absent.
9. Existing frontend 45-test and 267+ pgTAP regression gates remain required.

## Rollback / forward-fix

Rollback should be a forward migration that disables new producers, drains/reconciles rows,
and preserves `email_logs`; do not drop queue data or claim evidence in place. If CI finds a
constraint or PostgREST signature issue, fix the migration forward and rerun full DB reset.
If P3-03 is deferred, leave `process-email-queue` disabled and keep queue rows observable;
do not restore the previous direct-send implementation.

## CI gate and next handoff

Local frontend checks pass, but Supabase CLI, Docker and Deno are unavailable in this
environment. GitHub Actions run `31494989851` passed migration reset, 13 pgTAP files / 279
tests, `deno check`, Deno integration/contract tests and frontend gates. P3-03 Email Provider
Integration & Delivery Observability is now the recommended next task; it remains out of scope
for this branch.
