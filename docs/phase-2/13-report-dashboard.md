# P2-13 — Report Dashboard & Aggregate Status

## Baseline

- Branch: `feat/phase-2f-report-dashboard`.
- Starting SHA: `1e144cb9ba98c1b62a60b1f4a727720970eb8172` (accepted P2-12).
- This PR stays stacked on P2-12 until the preceding report PRs merge.

## Read model

`get_report_dashboard(uuid)` returns campaign metadata and server-side aggregate counts.
`get_report_dashboard_assignments(uuid, status, search)` returns only scoped assignment rows with latest-submission metadata; it never returns a private file path or URL.

Both SECURITY DEFINER functions resolve actor identity from `auth.uid()`, require an active YOUTH_ADMIN or SYSTEM_ADMIN, validate campaign visibility, and apply organization scope before aggregation and before rows are emitted.

## Aggregation semantics

- **Completed:** `ACCEPTED + EXEMPTED`. Exemption fulfils the unit's obligation but remains separately visible; `CLOSED` is not completion.
- **Completion rate:** `completed_count / total_assignments * 100`, rounded to two decimals on PostgreSQL. Zero assignments yields `0`.
- **Overdue:** existing `OVERDUE`, plus a read-only effective `OVERDUE` for a `PENDING` assignment after its effective due date according to database `now()`. The RPC does not mutate a row or replace Phase 3 reconciliation.
- **Late:** `late_submitted_count` and the late filter use the latest submission's immutable `is_late`; a `RESUBMITTED` report can therefore remain workflow-resubmitted while correctly being marked late.
- **Sorting:** database order is deterministic: overdue, needs supplement, submitted/late submitted, pending, resubmitted, accepted, exempted, closed; then effective due date, organization name and assignment id.

## UI

- Campaign cards preserve the P2-12 configuration route and add a Dashboard link.
- `/admin/bao-cao/:campaignId/dashboard` shows summary cards, completion, server-backed search/status filters, loading, empty/error/retry states, and links each assignment to the existing detail/review route.
- The mobile layout uses assignment cards; desktop aligns the same data in rows. No second review flow or eager signed URL is added.

## Validation

- Frontend tests cover service RPC mapping, completion rendering, filters, error reset/retry, route wiring and assignment links.
- pgTAP covers role/anonymous/suspended denial, narrow-scope rows and aggregates, SYSTEM_ADMIN behavior, status counts, completion, late resubmission semantics, server search and function privileges.
- Local Supabase/Deno may require CI because Docker/Postgres and Deno are unavailable in this workspace.

## Forward-fix / scope boundary

Use a new migration for any database correction; dashboard remains read-only. CSV/Excel, ZIP, bulk download, email/reminder, cron and P2-14 export work are intentionally excluded.
