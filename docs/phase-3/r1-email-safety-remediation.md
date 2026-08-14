# P3-R1 — Email Delivery Safety Gate & Reminder Cycle Fix

## Purpose

P3-04 (report event email hooks) and P3-05 (reminder engine) merged to `master` with a real
architectural consequence: the renderer allowlist went from one inert `SYSTEM_EMAIL_TEST`
template (P3-03) to eight live report/reminder templates. Before that change, an accidental
invocation of `process-email-queue` could not send anything real — nothing in the queue would
ever render. After it, every report event and reminder is a real, sendable email the moment a
worker is invoked with a valid provider secret. P3-06 (cron/scheduler) is the next task in the
roadmap and would make that invocation automatic and repeated. P3-R1 restores an explicit,
fail-closed safety gate before that happens, and fixes two correctness bugs found during review
of the merged P3-04/P3-05 code.

This task does **not** implement P3-06, cron, scheduling, persisted OVERDUE transitions, or any
new email template. It also does not send any live email — every provider call, real or
simulated, is done through mocks/fakes in Deno unit tests.

## Scope

1. **Email delivery safety gate** (`EMAIL_DELIVERY_MODE`) in `process-email-queue`.
2. **Reminder cycle fix**: `REPORT_SUPPLEMENT_REMINDER` idempotency keyed per review cycle.
3. **Source entity persistence**: `enqueue_email_for_user_event` stores `source_entity_type`/
   `source_entity_id` directly; the P3-05 post-enqueue `UPDATE` workaround is removed.
4. **Dependency cleanup**: `@supabase/supabase-js` and `react-router-dom` moved from
   `devDependencies` to `dependencies` (both are imported by production `src/` code; `npm ci
   --omit=dev` and `npm audit --omit=dev` were silently excluding them).
5. Regression tests for all of the above.

## 1. Email delivery safety gate

`process-email-queue/index.ts` resolves `EMAIL_DELIVERY_MODE` as the very first step after the
trusted `x-cron-secret` check — before reading any provider secret, before building the Resend
client, before calling `claim_email_queue`.

```
EMAIL_DELIVERY_MODE
├── OFF        (default; missing, empty, or any unrecognized value resolves here)
│   -> return immediately; claim_email_queue is never called; provider is never constructed
├── ALLOWLIST
│   -> claim_email_queue as normal; each row's recipient_email is checked against
│      EMAIL_TEST_RECIPIENTS (trimmed, lowercased, exact match only — no wildcard, no domain
│      match, no substring match); a non-match never reaches the provider and is marked
│      terminal FAILED via mark_email_retry(..., p_retryable=false,
│      p_error_code='RECIPIENT_NOT_ALLOWLISTED')
└── LIVE
    -> unrestricted delivery to the resolved recipient, unchanged from P3-03/P3-04/P3-05
```

`LIVE` is reachable only by that exact string. There is no fallback path, no partial
configuration, and no "if provider secrets are present, assume LIVE" logic — the mode is read
from `EMAIL_DELIVERY_MODE` alone and defaults to `OFF` on any value that is not exactly
`ALLOWLIST` or `LIVE`.

The allowlist gate lives in `worker.ts`'s `processQueueBatch` as an injected
`isRecipientAllowed(recipientEmail): boolean` callback, so the worker function itself stays
policy-agnostic and unit-testable without an HTTP harness; `index.ts` decides which policy to
inject based on the resolved mode.

## 2. Reminder cycle fix

`create_report_reminder_event`'s `REPORT_SUPPLEMENT_REMINDER` branch previously built its
`logical_key` from the fixed literal `NEEDS_SUPPLEMENT`. Because `logical_key` is globally unique
per `(assignment, recipient, reminder_type, milestone)`, this meant an assignment could receive
**at most one** supplement reminder for its entire lifetime — a resubmission that earned a second
NEEDS_SUPPLEMENT decision from review produced no reminder at all, silently.

The milestone is now `NEEDS_SUPPLEMENT:v{latest_submission_version}`, where the version is read
from `report_submissions.version_number` (highest version for the assignment) at the moment the
event is created. Each review cycle — v1 needs supplement, resubmit v2, v2 needs supplement again
— is a distinct milestone and can fire its own reminder, while a rescan of the *same* cycle still
converges on the same `logical_key` and creates nothing new. If no submission exists for an
assignment in `NEEDS_SUPPLEMENT` status (should not happen via the real `review_report_assignment`
transition, but is not assumed), the reminder is skipped fail-safe rather than erroring.

No historical `report_reminder_events` row is edited by this change — old milestones keep their
original `logical_key`, `scan_count`, and linked `notification_id`/`email_queue_id` exactly as
they were.

## 3. Source entity persistence

`enqueue_email_for_user_event` already validated and used `p_source_entity_type`/
`p_source_entity_id` to build the idempotency key, but never stored them on the `email_queue` row
it inserted. The P3-05 reminder trigger worked around this with a second `UPDATE email_queue SET
source_entity_type = ..., source_entity_id = ...` immediately after calling the RPC — a
correctness smell (two places writing the same columns) and a gap for every P3-04 report-event
queue row, which had no workaround and so had `NULL` source columns.

The RPC now inserts both columns directly. The P3-05 workaround `UPDATE` is removed. Both P3-04
report-event and P3-05 reminder queue rows now carry `source_entity_type = 'report_assignment'`
and `source_entity_id = <assignment id>` from the single insert.

## Security boundary (unchanged invariants)

- `EMAIL_DELIVERY_MODE`/`EMAIL_TEST_RECIPIENTS` are read from server-side Edge Function
  environment only; no frontend surface, no `VITE_*` exposure.
- The allowlist check happens strictly before any provider HTTP call — a non-allowlisted
  recipient never reaches Resend, live or otherwise.
- No RLS policy changed. No `GRANT`/`REVOKE` was widened; the three replaced functions
  (`enqueue_email_for_user_event`, `create_report_reminder_event`,
  `enqueue_report_reminder_email_from_notification`) keep the exact same `revoke all ... grant
  execute ... to service_role` (or no grant beyond `service_role`, matching the original) as
  before this migration.
- Recipient resolution remains entirely server-side (`auth.users` + `profiles.account_status =
  'ACTIVE'`); nothing in this task changes who a queue row's `recipient_email` can be.
- `email_queue`/`email_logs` remain inaccessible to `anon`/`authenticated` (RLS + table grants
  untouched).

## Tests and evidence

**Deno (`supabase/functions/process-email-queue/`)**:
- `contract.test.ts` — `EMAIL_DELIVERY_MODE` parsing (default OFF, invalid values fail closed to
  OFF, case sensitivity of `LIVE`/`ALLOWLIST`), `EMAIL_TEST_RECIPIENTS` normalization/dedup/reject
  malformed entries, exact-match allowlist checking (no substring/wildcard/domain match).
- `worker.test.ts` — a non-allowlisted recipient is rejected before the provider is called and
  results in `mark_email_retry(retryable=false, RECIPIENT_NOT_ALLOWLISTED)`; an allowlisted
  recipient is processed normally through the existing send path.

**pgTAP (`supabase/tests/report_email_safety_remediation.sql`)**:
- `enqueue_email_for_user_event` persists `source_entity_type`/`source_entity_id` directly.
- Full two-cycle `REPORT_SUPPLEMENT_REMINDER` scenario: v1 NEEDS_SUPPLEMENT creates one reminder;
  rescanning the same cycle creates no duplicate (event, notification, or queue row); a v2
  resubmission-and-supplement cycle creates a second, distinct reminder; rescanning after v2
  creates no duplicate; the v1 event row is untouched by the v2 cycle.
- Business transaction isolation, through the real `review_report_assignment` RPC (not a direct
  `notifications` insert): reviewing a submission from a since-suspended submitter — whose email
  cannot be resolved — still commits the assignment status transition, the submission review
  transition, and the status history row; the mandatory in-app notification is still created; no
  `email_queue` row is created for the unresolvable recipient; the failure is recorded as bounded
  `audit_logs` evidence (`REPORT_EMAIL_ENQUEUE_SKIPPED`, `reason_code = 'P0001'`).

**`supabase/tests/report_reminder_engine.sql` (P3-05, existing file)**: extended with a
`report_submissions` fixture row for the pre-existing NEEDS_SUPPLEMENT assignment (required by the
version-based milestone key) and a stronger assertion that the resulting `logical_key` ends in
`NEEDS_SUPPLEMENT:v1`. The original assertion (`count = 1`) is unchanged, not weakened.

**Frontend regression** (run locally in this environment): `npm test` 45/45 PASS, `npm run lint`
0 errors / 3 pre-existing Fast Refresh warnings, `npm run build` PASS, `npm audit --omit=dev` and
`npm audit` both 0 vulnerabilities (now that `@supabase/supabase-js`/`react-router-dom` are
correctly classified as production dependencies, `--omit=dev` actually covers them).

**Supabase CLI / Deno full stack**: not available in this working environment (no Docker daemon,
`deno.land` blocked by egress policy — both match this repository's own documented pattern of
CI-only gates for prior Phase 3 tasks). `supabase db reset`, `supabase test db`, and `deno
check`/`deno test` are pending the CI run on the pushed branch; see the PR for the actual result.

## Rollback / forward-fix

Forward migration `202608140001_phase_3_r1_email_safety_remediation.sql` replaces three
`SECURITY DEFINER` functions in place (`create or replace function`, same signatures, same
grants). No table is dropped, no historical `report_reminder_events`/`email_queue`/`email_logs`/
`audit_logs` row is edited or deleted. Rollback is a further forward migration reverting the
function bodies; do not edit or delete this migration once merged.

## Known limitations / out of scope

- P3-06 (cron, scheduler, persisted OVERDUE transition, timezone scheduling) is not started.
- `EMAIL_DELIVERY_MODE=LIVE` activation on any real environment is a separate, explicit
  operational decision — not a consequence of deploying this code (default is `OFF`).
- `REPORT_OVERDUE`'s "send once per assignment forever" behavior is unchanged; whether it should
  escalate on a schedule is a product decision left to P3-06 planning, not addressed here.
- No email preference UI, no webhook delivery tracking, no `LATE_SUBMITTED`-specific template.

## Next recommended task

**P3-06 — Cron & Overdue Persistence** (recommendation only; not started here, and should not
start until this task's PR is reviewed and merged).
