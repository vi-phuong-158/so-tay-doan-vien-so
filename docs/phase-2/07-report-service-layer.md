# P2-07 — Report service layer

## Scope and baseline

- Scope: a testable frontend data boundary in `src/services/reportService.js`; no `Work.jsx`, route, upload UI, admin, or migration change.
- Baseline: Phase 2A merge commit `1f1f4b0f02a3667b4845cd557a362cabb0b41e43` on branch `feat/phase-2b-branch-submission`.

## Service API

`createReportService(supabase)` receives the application's existing anonymous Supabase client and exposes:

- `getMyAssignments(options?)`: RLS-scoped assignment list, with an optional status filter for UX only.
- `getAssignment(assignmentId)`: one RLS-visible assignment; a missing and an out-of-scope row share `NOT_FOUND_OR_FORBIDDEN`.
- `getSubmissionHistory(assignmentId)`: version history ordered `version_number DESC`, including file metadata.
- `getCampaignTemplates(campaignId)`: template metadata only.
- `uploadReportFile(...)`: private Storage upload primitive.
- `submitReport(...)`: invokes only the `submit-report` Edge Function.
- `getSignedFileUrl(...)`: creates short-lived URLs only through the RLS-compatible Storage client and only for the two private report buckets.

The module maps database snake_case rows into compact camelCase frontend objects for assignments and submissions. UI integration is deferred to P2-08 through `createReportService(supabase)`.

## Data flow and security boundary

```text
P2-08/P2-09 UI
  -> reportService
     -> Supabase table/Storage client (RLS)
     -> submit-report Edge Function
     -> create_report_submission_with_files RPC
     -> internal create_report_submission RPC
```

The browser neither creates a service-role client nor calls either submission RPC. It sends the Edge Function only `assignment_id`, optional text, and `storage_path`/`original_name`/optional checksum. File type, size, safe name, ownership, and report state remain server-side checks. Service code does not make time-based business decisions.

## Storage-path decision — P2-07 architecture finding

The Phase 2A documentation describes final paths with `v{n}`, while the database allocates `version_number` only when the submission is finalized. The existing `submit-report` contract authorizes and validates any path under:

```text
{campaign_id}/{organization_id}/{assignment_id}/
```

P2-07 therefore uploads to the compatible non-racy form:

```text
{campaign_id}/{organization_id}/{assignment_id}/staging/{uuid}-{safe-file-name}
```

This matches the Storage organization segment and Edge Function prefix without browser-side version allocation. The finalized submission records the staging object path. There is currently no abandoned-upload cleanup/reconciliation; this is a follow-up concern for P2-09/Phase 2 hardening, not a reason to change the Phase 2A backend contract here.

## Error model and tests

`ReportServiceError` has `{ code, message, cause }`. Known business codes such as `REPORT_CLOSED` are preserved; transport errors become `REQUEST_FAILED`, and 401/403 become `AUTHENTICATION_REQUIRED`. The service does not refresh or duplicate AuthContext session handling.

`tests/report_service.test.mjs` behaviorally verifies query chains and mappings, early UUID rejection, history order, template metadata access, staging upload paths, Edge Function payload exclusion of client-trusted metadata, backend-error preservation, authentication normalization, and RLS-compatible signed URLs.

## Integration contract and remaining work

- P2-08 may import `supabase` from `src/services/supabaseClient.js`, create the service once in its page/hook boundary, and render the mapped read methods. It must not treat a client-side organization filter as authorization.
- P2-09 may use `uploadReportFile` then pass its returned `{ storagePath, originalName }` entries to `submitReport`; it owns picker/progress/abandoned-upload UX.
- P2-10 may render `getSubmissionHistory` and request a short-lived file URL only when a user explicitly opens a permitted file.
- P2-13 remains the owner of any broader export/download authorization hardening. No public URL or service-role workaround was added.

## Migration

None. The Phase 2A schema, RLS policies, Storage rules, and Edge Function contract are sufficient for this service layer.
