# P2-06 — PHASE 2A SECURITY TEST GATE

**Ngày:** 2026-08-09
**Branch:** `feat/phase-2a-report-foundation`
**Disposition:** `PASS_WITH_P2`

## 1. Handoff verification

- Working tree sạch trước P2-06; local và remote feature head cùng `202aa7b`.
- Base `master`: `2636521`.
- P2-00 → P2-05 đã xác minh theo Git: `98ea17b`, `9e64de8`, `05aa1ec`, `84d235d`, `d01db15`, `202aa7b`.
- `master...202aa7b` chỉ có docs Phase 2A, bốn migration, hai Edge Function, validation và bốn pgTAP report tests; không thấy file ngoài phạm vi bất thường.

## 2. Migration and SECURITY DEFINER audit

| Migration | Mục đích | Kết quả audit |
| --- | --- | --- |
| `202608090001` | Atomic submission core | Forward-only; `SECURITY DEFINER`, `search_path=public`, checks auth/active account/role/org/state/time; direct table write revoked. |
| `202608090002` | Storage + metadata RLS | Forward-only; safe UUID parser for untrusted path segments; org/scope checks; no end-user overwrite/delete. |
| `202608090003` | Atomic submit finalize | `SECURITY DEFINER`, `search_path=public`; invokes core and inserts file metadata in one transaction. |
| `202608090004` | Atomic review state machine | `SECURITY DEFINER`, `search_path=public`; checks caller, scoped role, terminal/transition rules and records history/audit. |
| `202608090005` | P2-06 privilege forward-fix | Revokes `authenticated` execute from internal three-argument core RPC. |

No historical migration was modified. There are no duplicate Phase 2 function signatures; the wrapper invokes the internal core intentionally.

## 3. RPC and table privilege audit

| Object | PUBLIC / anon | authenticated | Production path |
| --- | --- | --- | --- |
| `create_report_submission` | revoked | **revoked** (P2-06) | Internal core called by wrapper only. |
| `create_report_submission_with_files` | revoked | EXECUTE | `submit-report` invokes it with the caller JWT. |
| `review_report_assignment` | revoked | EXECUTE | `review-report` invokes it with the caller JWT. |
| `report_submissions` | no direct write | SELECT only | RPC creates immutable versions. |
| `report_submission_files` | no direct write | SELECT only | Atomic wrapper/service path writes metadata. |
| `report_assignments` | no direct status update | SELECT only | Submission/review controlled RPCs transition status. |
| `report_status_history` | no direct write | SELECT in scope | Controlled RPCs write history. |

`service_role` remains backend-only and bypasses RLS by Supabase design; it is not present in frontend configuration.

## 4. RLS and Storage audit

- `report-submissions-private` is private. Read and upload policies bind the organization path segment to the caller/scope; no end-user update or delete policy exists.
- `report-templates-private`, `report_campaign_templates`, and `report_status_history` permit only assigned-org or authorized-admin reads.
- `submit-report` verifies object existence and reads server Storage metadata for size and mime type; it rejects mismatched prefixes, traversal and duplicate paths before the atomic RPC.

## 5. Executable test inventory and matrix mapping

| Test file | Coverage |
| --- | --- |
| `report_submission_atomicity.sql` | Own/cross-org submit, direct INSERT/RPC denial, immutable status writes, terminal states, versioning, late/close/resubmit semantics, roles, suspended users. |
| `report_storage_authorization.sql` | Org isolation read/upload, anon/suspended denial, scoped-admin read, templates and history RLS. |
| `report_submit_atomic_finalize.sql` | Required files, path binding, atomic rollback, terminal propagation, wrapper privilege. |
| `report_review.sql` | Scoped review, role denial, valid/invalid transitions, reasons, terminal guard, `review_status`, history and RPC privilege. |

The database files cover A–D and F of the P2-06 matrix, including structural duplicate-version protection. Storage-object verification against a live Storage runtime is performed by `submit-report`; it has static validation coverage but requires CI/integration runtime evidence.

## 6. Local evidence

| Command | Result |
| --- | --- |
| `npm.cmd ci` | PASS — 335 packages, 0 vulnerabilities. |
| `npm.cmd run lint` | PASS — 0 errors; 3 pre-existing Fast Refresh warnings. |
| `npm.cmd test` | PASS — 9/9. |
| `npm.cmd run build` | PASS — Vite production build. |
| `supabase db reset`, `supabase test db`, `deno check`, `deno test` | BLOCKED locally: Supabase CLI, Docker and Deno are unavailable. |

## 7. CI evidence

Draft PR #3 rerun `31301926693` passed on 2026-08-09:

| Job | Result |
| --- | --- |
| `build` | PASS — `npm ci`, lint, 9/9 frontend tests and Vite build. |
| `test-db` | PASS — `supabase db reset`, pgTAP (5 files / 129 tests), Deno check of all Edge Function TypeScript files, Deno tests (7/7). |

The initial CI run exposed two P2-06 defects: an anon Storage policy evaluation raised a protected-table permission error, and the pgTAP wrapper fixture reused a finalized file path. Forward-fix `202608090006` moves the protected assignment lookup behind a boolean `SECURITY DEFINER` helper; the fixture now includes the next version in its path. The rerun passed all jobs.

## 8. Findings and disposition

### P0

None found in static audit.

### P1

Resolved in P2-06: `authenticated` could execute the three-argument internal submission core without the production file contract. Migration `202608090005` revokes that grant; pgTAP adds a direct-call denial.

### P2 / remaining risks

- Export/download admin scope filtering is P2-13 scope, not a Phase 2A submission/review bypass.
- The repository is public, as reported by P2-00; ownership/visibility change requires project-owner action.

## 9. Forward-fix and rollback

- Forward fix: add a new migration; do not edit any applied migration.
- Rollback: if a verified internal caller unexpectedly requires the core RPC, grant only that trusted database role through a new forward migration—never restore `authenticated` access.

## 10. Final disposition

`PASS_WITH_P2`: no known P0/P1 submission or review bypass remains; local and CI gates pass. Keep Draft PR #3 unmerged for owner review. The next task may be P2-07, but it is not started by this gate.
