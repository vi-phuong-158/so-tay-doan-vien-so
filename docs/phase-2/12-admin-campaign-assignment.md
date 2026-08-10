# P2-12 — Admin campaign & assignment management

## Baseline

- **Branch:** `feat/phase-2e-admin-campaign-assignment`
- **Starting SHA:** `caf650d83dc8858884c145e3a1a481a57c64d3b7`
- **Accepted SHA:** `b27ab4eacd210ae0f4e4d49fe9c9289a080d9599`
- **Dependency:** P2-09 PR #4 and P2-10 PR #5 are open drafts; P2-11 PR #6 is stacked on P2-10 and its accepted head is the baseline. P2-12 must stay stacked on P2-11 until those PRs merge.

## Scope delivered

- Route `/admin/bao-cao` lists scoped campaigns with status, opening time, due date and assignment count.
- `/admin/bao-cao/tao-moi` and `/admin/bao-cao/:campaignId` provide draft configuration: general data, timing, file rules, in-scope organizations, private templates and publish confirmation.
- `reportAdminService` is the frontend boundary. It only invokes controlled RPCs/Edge Function; it never creates assignments or template metadata by table insert.
- `finalize-campaign-template` reads real private Storage metadata, normalizes the filename, moves the staging object to its final campaign namespace and registers metadata through an authenticated RPC.
- `publish_report_campaign` locks the draft campaign, validates actor/scope/active organizations, deduplicates input, creates `PENDING` assignments plus initial history/audit rows, then marks the campaign `PUBLISHED` in the same transaction. A repeated publish returns the already-published assignment count without inserting more rows.

## Migration and RPCs

`supabase/migrations/202608100001_phase_2_admin_campaign_assignment.sql` adds:

- `create_report_campaign`, `update_report_campaign_draft`.
- `get_assignable_report_organizations`, `get_admin_report_campaigns`, `get_admin_report_campaign`.
- `register_report_campaign_template` and `publish_report_campaign`.
- `can_manage_report_campaign` / scoped template read helpers and Storage staging-only policies.

The migration revokes authenticated direct write privileges on `report_campaigns`, `report_assignments`, `report_campaign_templates` and `report_status_history`. Public/anon execute is revoked for every new trusted RPC; authenticated gets explicit execute only.

## Security invariants

- Actor identity is always `auth.uid()` inside the database; no client actor, assignment timestamp or audit identity is accepted.
- Only active `YOUTH_ADMIN`/`SYSTEM_ADMIN` callers use admin RPCs. `YOUTH_ADMIN` targets must be within recursive organization scope; inactive units fail closed.
- Campaign draft ownership is scoped by the campaign creator organization. The admin list/detail RPCs prevent a published-but-out-of-scope campaign from appearing in the management UI.
- Publish is transactionally all-or-nothing. It cannot leave `PUBLISHED` with a partial selected set; unique `(campaign_id, organization_id)` remains structural protection.
- Templates remain in `report-templates-private`. Browser upload is staging-only and scope-bound; finalization uses server Storage metadata and no public URL/service key is exposed to frontend. Assigned officers continue to receive signed URLs through the existing P2-08/P2-11 service path.
- Published campaigns are read-only through the admin write RPCs.

## Tests and evidence

- `tests/report_admin.test.mjs`: campaign validation, organization select/deselect, scoped RPC contract, private template finalization, confirmation summary, loading/error/retry and publish double-submit guard.
- `supabase/tests/report_admin_campaign_assignment.sql`: happy path, anonymous/suspended/member/officer denial, scope and inactive-unit denial, duplicate input/idempotency/unique constraint, atomic failed publish, audit actor, direct assignment/template bypass denial and controlled template metadata registration.
- `npm.cmd test` — **PASS, 34/34**.
- `npm.cmd run lint` — **PASS, 0 errors**; three existing Fast Refresh warnings remain in unrelated files.
- `npm.cmd run build` — **PASS**.
- `supabase db reset`, `supabase test db` — **BLOCKED locally**: local Postgres/Docker is not running (`127.0.0.1:54322` refused).
- `deno check` / `deno test` — **BLOCKED locally**: Deno is not installed.
- GitHub Actions [run 31403376831](https://github.com/vi-phuong-158/so-tay-doan-vien-so/actions/runs/31403376831) — **PASS**: build, lint, frontend tests, Supabase migration/reset + pgTAP, Deno check and Deno tests.

## Manual acceptance when rehearsal is available

1. Sign in as `YOUTH_ADMIN`, open `/admin/bao-cao`, create a draft, choose three in-scope units and attach a template.
2. Confirm publish. Verify exactly three assignments, one initial history row per assignment and audit rows owned by the authenticated admin.
3. Repeat publish and verify the assignment count is unchanged.
4. Sign in as an officer in a selected unit: assignment and template signed download must be visible through the P2-08/P2-11 detail route.
5. Sign in as an unselected/out-of-scope unit: neither assignment nor template is readable.

## Forward fix / remaining risks

- Never edit this applied migration. Correct any database issue with a forward-only migration; a deployment rollback should disable the admin route while preserving the immutable audit/history records.
- There is intentionally no persistent “draft target” table: selected organizations stay in the form until publish. This avoids introducing assignments before the campaign is published. Add a dedicated draft-target table only if cross-session collaborative draft editing becomes a confirmed requirement.
- No reminder/email, aggregate dashboard, export/ZIP or P2-13 work is included.
