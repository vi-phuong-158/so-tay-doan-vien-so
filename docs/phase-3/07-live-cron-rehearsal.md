# P3-07B — Live Cron Rehearsal

## Verdict

`P3_07B_LIVE_CRON_REHEARSAL_PASS`

## Scope and environment

- Rehearsal project: `so-tay-doan-vien-rehearsal` (`znexculhbdjiflkczpyu`, `ap-southeast-1`), `ACTIVE_HEALTHY`.
- Source: Draft PR #20, `claude/phase-3-cron-overdue-8f4cea@f10ea22`; CI run `31812321219` was green before rehearsal.
- Migration history contained `202608140002_phase_3_cron_overdue_automation`.
- No production project, Edge Function deployment, email-worker invocation, delivery-mode change, or provider call was made.

## Reminder eligibility used

The deployed `scan_report_reminders(timestamptz)` selects a `PUBLISHED`, open campaign with an assignment in `PENDING` or `OVERDUE`, effective due date at or before the scan time, and an enabled `reminder_policy.overdue`; it resolves an active in-scope `BRANCH_OFFICER`. The fixture therefore used a unique organization and officer, `PENDING` Fixture A with a due date ten minutes in the past, and `{"overdue": true}`.

## Official cron jobs before and after

| Job | Schedule | Command | Active |
| --- | --- | --- | --- |
| `report_mark_overdue_daily` | `5 17 * * *` | `select public.mark_overdue_assignments();` | true |
| `report_reminder_scan_daily` | `0 0 * * *` | `select public.scan_report_reminders();` | true |

The jobs were inspected before and after unchanged. `process-email-queue` schedule count was `0`.

## Run-scoped fixture

Run ID: `P3_07B_20260814T1615Z_A93F`.

| Fixture | Assignment | Before | Effective due |
| --- | --- | --- | --- |
| A eligible | `9c6a98b0-8241-4690-a963-1e05b1e71db4` | `PENDING`, history 0, audit 0 | `2026-08-14 16:05:58.837355+00` |
| B future | `29423e6e-0051-4c9d-b571-254be710d7f1` | `PENDING`, history 0, audit 0 | `2026-08-15 16:15:58.837355+00` |
| C non-eligible | `0c1c871c-211e-4755-9fbb-1839421780a4` | `SUBMITTED`, history 0, audit 0 | `2026-08-14 16:05:58.837355+00` |

Fixtures used separate run-scoped root/branch organizations, one non-login rehearsal officer, and three run-scoped campaigns. No seed row was reused.

## Live overdue scheduler evidence

Temporary job `rehearsal_p3_07b_overdue_a93f` (job `3`) used `* * * * *` and the exact command `select public.mark_overdue_assignments();`.

| Run | Start | End | Status | Return |
| --- | --- | --- | --- | --- |
| 1 | `2026-08-14 16:17:00.110697+00` | `16:17:00.118539+00` | succeeded | `1 row` |
| 2 | `2026-08-14 16:18:00.012846+00` | `16:18:00.018139+00` | succeeded | `1 row` |

After run 1, A was `OVERDUE`, with history delta `+1` and `REPORT_MARKED_OVERDUE` audit delta `+1`; both actors were `NULL` (system). B remained `PENDING`; C remained `SUBMITTED`. After run 2, A remained `OVERDUE` with additional history `0` and audit `0`. A third successful scheduled execution at `16:19:00+00` also made no duplicate records. The temporary overdue job was then unscheduled.

## Live reminder scheduler evidence

Before reminder scheduling, Fixture A had 0 reminder events, 0 notifications, and 0 queue rows. Temporary job `rehearsal_p3_07b_reminder_a93f` (job `4`) used `* * * * *` and the exact command `select public.scan_report_reminders();`.

| Run | Start | End | Status | Return |
| --- | --- | --- | --- | --- |
| 1 | `2026-08-14 16:20:00.013500+00` | `16:20:00.051117+00` | succeeded | `1 row` |
| 2 | `2026-08-14 16:21:00.012737+00` | `16:21:00.025411+00` | succeeded | `1 row` |

Run 1 created exactly one event `0f2f7f6d-6dfa-4ebc-8f08-8a2e9284bb43`, one notification `b8e401c0-5134-40f4-8d19-729e3c6d7b87`, and one queue row `317d6899-3415-426e-b558-c41941554e2e`. The event was `REPORT_OVERDUE` with logical key `REPORT_REMINDER:9c6a98b0-8241-4690-a963-1e05b1e71db4:10d717cb-45f3-4071-9678-5193edc49a43:REPORT_OVERDUE:OVERDUE`. After run 2, `scan_count=2` but event, notification, and queue counts were still 1: the logical reminder was idempotent.

The queue row was `PENDING`, scheduled at `2026-08-14 16:20:00.013533+00`, with `source_entity_type=report_assignment` and `source_entity_id=9c6a98b0-8241-4690-a963-1e05b1e71db4`.

## Email safety

- `process-email-queue` scheduled: `NO`.
- `process-email-queue` invoked by this rehearsal: `0`.
- Provider calls and emails sent by this rehearsal: `0`.
- The only created queue row remained `PENDING`; it never entered `SENT`.

## Cleanup

Both temporary jobs were unscheduled. Exact-ID cleanup removed the run-scoped organizations, rehearsal auth user/profile/role, campaigns, assignments, status history, audit rows, reminder event, notification, queue row, and any associated email log. Post-cleanup counts for every fixture category were `0`; temporary cron jobs were `0`; the two official jobs remained exactly one active row each. No temporary secret was created.

## Result

This is acceptance evidence only. No production SQL/code changed, PR #20 remains Draft and unmerged, and P3-08 was not started. The next task is `P3-06 FINAL ACCEPTANCE & MERGE PR #20`.
