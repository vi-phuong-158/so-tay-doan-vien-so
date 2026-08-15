# P3-06 — Cron & Overdue Automation

## Purpose

P3-06 closes the two gaps P3-05 explicitly deferred: a persisted, audited `PENDING → OVERDUE`
transition, and a trusted, timezone-correct schedule for the overdue sweep and the reminder scan.
It does not touch email delivery, the email worker's own schedule, or any P3-R1 safety gate.

## Baseline

- Starting branch: `claude/phase-3-cron-overdue-8f4cea`, created from `master@5665dc4`
  (P3-R1 merged via PR #19). `HEAD == origin/master` confirmed before implementation started.

## What already existed (audit)

- `mark_overdue_assignments()` ([202607300002_storage_rpc_security.sql](../../supabase/migrations/202607300002_storage_rpc_security.sql)):
  `PENDING → OVERDUE` only, guarded by `campaign.status = 'PUBLISHED'` and
  `now() > coalesce(due_at_override, campaign.due_at)`. Idempotent at the row level (a repeat run
  matches zero rows) but wrote no `report_status_history`/`audit_logs` row and had no scheduler.
- `scan_report_reminders(p_as_of)` (P3-05, P3-R1-patched): full reminder scan, already idempotent
  via the unique `report_reminder_events.logical_key`, already versioned for
  `NEEDS_SUPPLEMENT:v{version}` milestones. Only creates notifications and enqueues `PENDING`
  `email_queue` rows — never calls a provider.
- `send-reminder` Edge Function: `CRON_SECRET`-gated, thin wrapper that calls
  `scan_report_reminders` via a service-role client. No equivalent existed for
  `mark_overdue_assignments`, and no scheduler (pg_cron or otherwise) existed anywhere in the repo.
- State machine source of truth ([docs/phase-2/01-report-state-machine.md](../phase-2/01-report-state-machine.md)):
  only `PENDING → OVERDUE` is a SYS transition; boundary is strict `now() > effective_due_at`,
  matching `create_report_submission`'s `is_late` check.

## What changed

### `mark_overdue_assignments(p_as_of timestamptz default now())`

Same eligibility rule as before (unchanged business behaviour): campaign `PUBLISHED`, assignment
`PENDING`, effective due date (`due_at_override` if set, else `campaign.due_at`) strictly before
`p_as_of`. Every other assignment status — `SUBMITTED`, `NEEDS_SUPPLEMENT`, `RESUBMITTED`,
`ACCEPTED`, `OVERDUE`, `LATE_SUBMITTED`, `CLOSED`, `EXEMPTED` — is left untouched; in particular
`NEEDS_SUPPLEMENT` never auto-transitions to `OVERDUE`, so its own versioned reminder cycle
(P3-R1) is unaffected.

The old zero-argument function is dropped and replaced by a single implementation with a
`p_as_of` parameter defaulting to `now()`, so the existing zero-arg call shape (used by the cron
job) still works, while tests can pass a fixed timestamp for determinism (same pattern as
`scan_report_reminders`).

The transition, its `report_status_history` row (`from_status='PENDING'`, `to_status='OVERDUE'`,
`changed_by=null`) and its `audit_logs` row (`action='REPORT_MARKED_OVERDUE'`,
`actor_user_id=null`) are all written by one chained data-modifying CTE in a single statement —
there is no separate `SELECT` step that could race with a concurrent invocation. Under Postgres'
default READ COMMITTED semantics, a second concurrent `UPDATE ... WHERE status = 'PENDING'`
re-checks that predicate against the just-committed row before applying its own update, so two
overlapping cron ticks (or a manual retry) can never double-transition a row or duplicate its
history/audit trail — this is a property of the `UPDATE` statement itself, not application-layer
locking.

### Trusted schedule

`pg_cron` is installed by the migration and two jobs are registered idempotently (existing job
names are unscheduled before being rescheduled, so this migration is `db reset`-safe and safe to
re-apply):

| Job | Cron (UTC) | Local time (Asia/Ho_Chi_Minh) | Calls |
| --- | --- | --- | --- |
| `report_mark_overdue_daily` | `5 17 * * *` | 00:05 | `select public.mark_overdue_assignments();` |
| `report_reminder_scan_daily` | `0 0 * * *` | 07:00 | `select public.scan_report_reminders();` |

Vietnam (ICT, UTC+7) observes no DST, so these UTC times are exact and fixed year-round — no
per-job timezone configuration is needed (see `docs/brain/03-decisions.md`).

Both jobs call the trusted `SECURITY DEFINER` RPC **directly, in-database**. Neither job makes an
HTTP call, calls an email provider, or requires a `CRON_SECRET`/service-role key inside the
migration — the schedule carries no production secret and is safe to apply in CI's
`supabase db reset`. The existing `send-reminder` Edge Function is untouched and remains available
as a manual/external-trigger fallback; it is not part of the pg_cron path installed here.

`process-email-queue` (the email worker that actually calls the Resend provider once
`EMAIL_DELIVERY_MODE` allows it) is **not** scheduled by this migration — see
`docs/brain/03-decisions.md` for why that is intentionally out of scope.

### Security

- `mark_overdue_assignments(timestamptz)`: `revoke all ... from public, anon, authenticated`,
  `grant execute ... to service_role, postgres`. `anon`/`authenticated` cannot invoke it (pgTAP
  `function_privs_are` + `throws_ok` regression).
- No RLS policy changed. No new table. `pg_cron`'s own `cron` schema is not granted to any
  Supabase role beyond its own default (superuser/owner only), unchanged from pg_cron's default
  install posture.
- No secret, API key or production credential appears in the migration.

## Test matrix

`supabase/tests/report_cron_overdue.sql` (pgTAP, `begin/rollback`, fixed literal timestamps —
same determinism convention as `report_reminder_engine.sql`):

- Function/privilege surface: `has_function`, `function_privs_are` (anon/authenticated denied,
  service_role allowed), `throws_ok` for an authenticated caller.
- Cron installation: both jobs exist, `active = true`, correct `schedule` string, and each job's
  `command` text contains no HTTP/provider reference.
- **A** basic overdue, **B** not yet due, **C** exact boundary (`due_at == p_as_of` stays
  `PENDING`; one microsecond past becomes `OVERDUE`), **D** `due_at_override` future wins over a
  past campaign due date, **E** `due_at_override` past wins over a future campaign due date,
  **F–H** `SUBMITTED`/`ACCEPTED`/`EXEMPTED`/`CLOSED` (plus `RESUBMITTED`/`LATE_SUBMITTED`/
  `NEEDS_SUPPLEMENT`) never transition, **I/O** repeat sweep at the same and a later `as_of` is a
  no-op with zero additional history/audit rows, **J** multi-organization sweep only updates the
  eligible rows, DRAFT-campaign assignment is never touched.
- History/audit: exactly one `report_status_history` and one `audit_logs` row per transitioned
  assignment, both with a null (system) actor; zero rows for untouched assignments.
- **K** reminder scan regression: a cron-marked `OVERDUE` assignment is immediately
  reminder-eligible; a repeat scan does not duplicate the event.
- **L** supplement regression: `NEEDS_SUPPLEMENT` reminder milestone opens a fresh
  `NEEDS_SUPPLEMENT:v2` event on resubmission, independent of `v1`, unaffected by P3-06.
- **M** delivery-mode regression: every `email_queue` row the cron path enqueues stays `PENDING`
  — no function under test ever moves a row to `SENT`.
- **N** source-entity regression: `email_queue.source_entity_type`/`source_entity_id` still
  persist correctly on cron-triggered reminder rows (P3-R1 fix untouched).

Concurrency (two overlapping invocations) is proven by the `UPDATE ... WHERE` re-check argument
above rather than an executed two-session pgTAP test — coordinating two literal concurrent
sessions inside a single pgTAP transaction script is not practical; the idempotent-retry test (I)
exercises the same code path a concurrent second writer would hit.

## Validation

- Frontend (local): `npm test` 45/45 PASS, `npm run lint` 0 errors/3 pre-existing warnings,
  `npm run build` PASS.
- DB/Deno: Supabase CLI, Docker and Deno are not available in this working environment (same
  constraint recorded on every prior Phase 2/3 task — see `docs/brain/05-testing-and-deploy.md`
  "Lưu ý"), so `supabase db reset`, the full pgTAP suite and `deno check`/`deno test` were
  validated on the repository's GitHub Actions CI (`.github/workflows/ci.yml`, `test-db` job:
  `supabase start && supabase db reset && supabase test db` plus `deno check`/`deno test`) on
  Draft PR #20. **CI run `31811349804`: PASS** — `test-db` job green (10m25s), `build` job green
  (24s). pgTAP: `Files=18, Tests=450, Result: PASS` (18 suites including the new
  `report_cron_overdue.sql`, 450 total assertions, `All tests successful`). `deno check **/*.ts`
  clean; Edge Function tests `42 passed, 0 failed`.
- Two CI iterations caught and fixed real bugs in the new test fixtures before this: a
  `report_assignments` `unique(campaign_id, organization_id)` violation from reusing one campaign
  across multiple status fixtures (run `31810933708`'s predecessor `31810462640`), and an unscoped
  aggregate return-value assertion that was inflated by `seed.sql`'s own rehearsal PENDING
  assignments being (correctly) also swept by the fixed future `as_of` used in this test file (run
  `31810933708`). Both are fixed in the current `report_cron_overdue.sql`; no application/migration
  code needed to change for either.

## Acceptance and limitations

No live email is sent by this task. No production deployment. No `EMAIL_DELIVERY_MODE` change.
Draft PR #20 only, not merged. `P3_06_PASS` — see `docs/brain/06-ai-working-log.md` for the final
entry with CI run ID and counts.

## Next step

- Schedule (or explicitly continue deferring) `process-email-queue` once a live rehearsal
  authorization exists.
- P3-07/P3-08: live rehearsal acceptance for cron on a real Supabase project (pg_cron enabled,
  scheduler privilege proven end-to-end), still gated on the same live-email authorization used
  for P3-03R.
