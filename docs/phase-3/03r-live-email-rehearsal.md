# P3-03R - Live Email Rehearsal Acceptance

## STATUS

`PASS`

## VERDICT

`P3_03_FULL_ACCEPTANCE_PASS`

## Scope and safety gate

- Supabase rehearsal project: `znexculhbdjiflkczpyu`
- Production used: `NO`
- Only the controlled rehearsal user/inbox was used.
- No cron, reminder hook, report hook, bulk send, attachment, signed Storage URL or
  production deployment was enabled.
- No production source code was changed for this acceptance.
- Draft PR #14 remains open and must not be merged as part of this task.

## Rehearsal evidence

| Gate | Result | Evidence |
|---|---|---|
| Project safety gate | PASS | Exact rehearsal project `znexculhbdjiflkczpyu`; 19/19 migrations present; `process-email-queue` ACTIVE. |
| Negative auth | PASS | Missing and wrong `x-cron-secret` both returned `403 FORBIDDEN`. |
| Trusted enqueue | PASS | Server-resolved controlled recipient; normal event used a new P3-02 identity/revision. |
| Normal rehearsal event | PASS | New event with `action_path = /ca-nhan/thong-bao` reached `SENT`, attempt `1`. |
| Resend acceptance | PASS | Provider `RESEND`, result `HTTP_200`. |
| Provider message ID | PASS | Provider message ID present in `email_logs`. |
| Claim cleanup | PASS | Claim token, worker and lease cleared after completion. |
| Inbox receipt | PASS | Controlled inbox receipt confirmed by the user. |
| Second worker invocation | PASS | `claimed: 0`, `sent: 0`; the `SENT` row was not reclaimed. |
| Duplicate physical send | PASS | No duplicate physical send observed; one `SENT` log/attempt for the normal event. |
| Safe-render fixture | PASS | Separate logical event with XSS strings and `/ca-nhan/thong-bao` reached `SENT`. |
| XSS escaping | PASS | `<script>`, `<img>` and special characters were escaped; raw HTML keys were absent. |
| Internal action URL | PASS | App-relative path accepted; renderer tests reject external action URLs. |
| Secret leak audit | PASS | `NO`. |

## Fail-closed evidence retained

The first controlled fixture intentionally used `action_path: "/"`. It remains in the
queue as terminal `FAILED` with `TEMPLATE_ACTION_URL_INVALID`. It was not edited, deleted,
or retried, and demonstrates fail-closed rendering for an invalid app-relative path.

The corrected normal event used a new identity/revision and did not reuse the failed row.
Repeating enqueue with that new identity created one logical row only.

## Regression evidence

- Frontend tests: `45/45 PASS`.
- Lint: `0 errors`, with 3 existing Fast Refresh warnings.
- Build: `PASS`.
- Process-email-queue Deno tests: `13/13 PASS`, including renderer `4/4 PASS`.
- Additional Deno contract tests: `22/22 PASS` when excluding two existing tests that require
  the unavailable exact npm package `npm:@supabase/supabase-js@2.49.1` in local Deno.
- Secret-bearing source/log audit: `NO` leak found.

## Final decision

`P3_03_FULL_ACCEPTANCE_PASS`

P3-03R is complete. Do not start P3-04 in this task; the next recommended task is
**P3-04 - Report Event Email Hooks**.
