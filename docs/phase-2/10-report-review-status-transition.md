# P2-10 — Report Review & Status Transition

## Scope

P2-10 adds the minimal admin review flow for a submitted report:

- `ACCEPTED` confirms completion.
- `NEEDS_SUPPLEMENT` requires a non-blank reason and keeps resubmission available.
- `EXEMPTED` requires a non-blank reason for `PENDING`/`OVERDUE` assignments.
- The latest submission review fields, assignment timestamps and status are updated without
  modifying an old submission or finalized file.

History UI, dashboard, export, email/reminder, download bundle, admin user management and P2-11
remain out of scope.

## Trusted path and atomicity

`review-report` authenticates the JWT, validates the allowlisted action and delegates to
`review_report_assignment` with the user's JWT. The `SECURITY DEFINER` RPC locks the assignment
row with `FOR UPDATE`, checks active account/scope/current status/reason, updates the assignment
and latest submission, then inserts `report_status_history`, `audit_logs` and in-app notification
inside the same transaction. A stale reviewer therefore fails closed and cannot overwrite a newer
decision.

Notification action URLs use `/cong-viec/bao-cao/{assignment_id}`. Accepted/needs-supplement notify
the latest submitter; exemption notifies active branch officers in the assignment organization.

## Frontend

The existing assignment detail surface now loads the latest submission (not a full history UI),
shows file metadata with short-lived signed URLs, and exposes reviewer-only actions. Each action
uses confirmation, requires a trimmed reason where applicable, disables while pending, and refreshes
assignment/submission state after both success and error. No direct RPC is called from the browser.

## Security cases

The pgTAP review suite covers authorized ACCEPT/NEEDS/EXEMPT, scope and role denial, suspended and
anonymous denial, invalid transitions, required reasons, stale review rejection, history integrity,
notification assignment routing and existing direct-mutation/finalized-file protections.

## Validation

Run `npm test`, `npm run lint`, `npm run build`, `supabase db reset`, `supabase test db`, `deno check
**/*.ts` and `deno test --allow-all`. Technical acceptance is PASS only when all existing and new
gates pass in CI.
