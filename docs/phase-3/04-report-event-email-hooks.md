# P3-04 — Report Event Email Hooks

## Verdict

Implementation is prepared on the stacked branch `feat/phase-3d-report-event-email-hooks`, based
on cumulative P3-03R acceptance HEAD `de952fa`. Database and Deno acceptance remain CI gates because
Supabase CLI and Deno are unavailable in the local environment.

## Scope

P3-04 connects the already trusted report notification events to the P3-02/P3-03 email queue and
renderer. Supported events are:

| Event | Recipient contract | Queue template | Action |
| --- | --- | --- | --- |
| Campaign published | Active, valid-email BRANCH_OFFICER for each assigned organization | `REPORT_CAMPAIGN_PUBLISHED` | Assignment detail |
| Submitted v1 | Server-resolved submitter | `REPORT_SUBMITTED` | Assignment detail |
| Resubmitted v2+ | Server-resolved submitter | `REPORT_RESUBMITTED` | Assignment detail |
| Needs supplement | Latest valid submitter from trusted review event | `REPORT_NEEDS_SUPPLEMENT` | Assignment detail |
| Accepted | Latest valid submitter from trusted review event | `REPORT_ACCEPTED` | Assignment detail |

Email is a secondary channel. In-app notification creation remains the mandatory business-side
effect and source of truth.

## Architecture

Trusted report RPC → notification row with source/entity/event identity → backend-only
`enqueue_report_email_from_notification` trigger → `enqueue_email_for_user_event` → P3-02 queue
claim/lease/retry → P3-03 allowlisted renderer and Resend adapter.

The frontend does not call an email endpoint and cannot provide `recipient_email`. The hook reuses
the existing P3-03 renderer contract and the trusted app-relative action URL validation.

## Payload and templates

- Campaign publish includes campaign title, assigned unit, due time and assignment action path.
- Submit/resubmit includes campaign, unit, version and server timestamp.
- Needs supplement includes campaign, unit and a bounded review reason. The reason is escaped by
  the shared HTML renderer and is never treated as HTML.
- Accepted includes campaign, unit and completion confirmation.
- No private template file, report file, signed URL, attachment or arbitrary HTML is included.

## Idempotency and transaction semantics

The existing notification `event_key` is the logical event identity. The hook passes
`md5(event_key)` as the queue event revision; P3-02 then computes its deterministic key from
template, source type, assignment, recipient and revision. Repeated enqueue is handled by the
database unique constraint, not by the browser.

The trigger runs after the trusted notification insert in the same database transaction. A missing
recipient or queue failure is caught, bounded, and written to `audit_logs` as a skipped secondary
email. It does not corrupt or roll back the report mutation. A publish assignment with no valid
recipient receives explicit `REPORT_EMAIL_RECIPIENT_MISSING` audit evidence.

## Security boundary

- Recipient email is resolved from `auth.users` and an ACTIVE `profiles` row by P3-02.
- Suspended/archived/missing/invalid-email users are rejected by the server resolver.
- Authenticated users have no direct queue/log privileges and cannot invoke the enqueue RPC.
- Notification writes remain trusted-RPC-only under P3-01; client spoofed recipients are denied.
- Source assignment, campaign and submission data are read server-side.
- HTML variables are escaped, payload fields are bounded, subject CR/LF is sanitized, and action
  paths are trusted app-relative routes.

## Tests and evidence

Added database coverage for publish, submit, resubmit, needs supplement, accepted, server-resolved
email, suspended recipient, unauthorized client, deterministic retry and no duplicate queue row.
Added renderer coverage for all report templates, missing payload, review-note escaping and action
URL rendering.

Local regression:

- `npm.cmd test`: 45/45 PASS
- `npm.cmd run lint`: 0 errors; 3 pre-existing Fast Refresh warnings
- `npm.cmd run build`: PASS
- `git diff --check`: PASS
- Supabase CLI: unavailable locally; `supabase db reset` and pgTAP are pending CI
- Deno: unavailable locally; `deno check` and Deno tests are pending CI

`LIVE_EMAIL_NOT_REQUIRED_FOR_P3_04`: P3-03R already proved controlled Resend delivery. P3-04 only
needs event-hook correctness and must not send bulk or production email.

## Known limitations

- No reminder engine, cron, provider webhook, delivery tracking, attachments or production deploy.
- Physical exactly-once delivery remains subject to the P3-03 provider idempotency window.
- A queue enqueue failure is audit-visible but requires later operational repair/retry handling.

## Rollback / forward-fix

Use a forward migration to disable the trigger or correct its contract; do not delete queue/log/audit
evidence. Frontend rollback is to the previous deployment. No production migration or secret change
is part of this task.

## Next recommended task

**P3-05 — Reminder Engine** (recommendation only; not started here).
