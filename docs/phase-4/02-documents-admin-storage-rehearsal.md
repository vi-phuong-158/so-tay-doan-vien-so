# P4-02 — Documents Admin Workflow & Runtime Storage Rehearsal

## Status

`P4_02_REPO_PASS_REHEARSAL_BLOCKED` — Draft PR, not merged.

All repository-side work is complete and CI-verified. The runtime rehearsal was executed **as far
as this session was permitted**: schema parity, policy deployment and fail-closed path handling
were confirmed live on the non-production project, but the actor-based scenarios (A–D, F–I) could
not be run because creating the required test identities was denied by this environment's
permission control. Nothing is recorded below as passed that was not actually observed.

## Baseline

- **Branch:** `feat/phase-4-documents-admin`, created from
  `master@44887552c7655d84e981d189edf7359df299c13e`.
- **P4-01 merge provenance:** PR #23 merged into `master` at `4488755`; its final pre-merge HEAD was
  `3014b9c` with CI run `31920030948` green on that exact SHA.

## Architecture reused (not redesigned)

| Reused from | What |
| --- | --- |
| P4-01 | `documents` model, `can_access_document()` visibility ladder, `can_manage_document()`, the five admin RPCs, the end-user `documents-private` SELECT policy, `documentService` |
| P2-03 (`202608090002`) | Storage policy shape: authority re-derived from a path segment, `uuid_or_null` for safe segment casting, and **no UPDATE policy** so objects are never overwritten in place |
| P2-12 admin patterns | `createXService(client)` factory, exported pure helpers, typed error + business-code allowlist, confirmation dialog, `RoleGuard` |
| Design system | `Button`/`PageHeader`/`EmptyState`/`Toast`/`Skeleton`, `campaign-form`, `campaign-list-item`, `confirm-dialog`, `dashboard-filters`, `chip-row` |

No second upload architecture was introduced: documents uploads follow the same
validate → upload-to-fresh-path → trusted-RPC-records-it shape the report flow already uses.

## The gap this closes

`documents-private` had **no INSERT/UPDATE/DELETE policy at all**. RLS on `storage.objects` is
deny-by-default, so no authenticated session could upload a source file —
`attach_document_source_file` could only ever record a path that some out-of-band process had
already placed in the bucket. The admin workflow was therefore not actually operable end-to-end.

## Storage threat model and controls

| Threat | Control | Enforced in |
| --- | --- | --- |
| Arbitrary authenticated upload | INSERT policy requires `can_manage_document` on the document named by path segment 1 | DB (storage RLS) |
| Cross-organization planting (admin of A writes under B's document) | Authority re-derived from the `documents` row, never from the request | DB |
| Objects landing outside the intended prefix | Path segment 2 pinned to `source` | DB |
| Malformed / traversal object name | `uuid_or_null` → NULL → no document matches → deny, and **no exception raised** | DB |
| Overwriting a good file with a failed replacement | **No UPDATE policy**; every upload uses a fresh `{uuid}-{name}` path | DB + service |
| Cleanup bug destroying the live file | DELETE policy carries `d.storage_path is distinct from storage.objects.name` | DB |
| Orphaned object after a failed attach | Service deletes exactly the object it just created, then rethrows the original error | Service |
| Document left pointing at missing bytes | `detach_document_source_file` clears the pointer **before** the object is removed | DB + service |
| Dangerous extension / oversize | Server-side allowlist + 50 MiB bound in `attach_document_source_file`; browser MIME never trusted | DB |
| Public exposure | Bucket `public = false`; no public URL is ever generated | DB |
| Signed URL leakage | 60 s default, hard cap 3600 s, requested only on an explicit action, never persisted or logged | Service |

## Implementation

### Migration `202608160002_phase_4_documents_admin_storage.sql`

1. `documents-private` INSERT policy (admin of that document, under `{id}/source/`).
2. `documents-private` DELETE policy for compensation, with the attached-file guard.
3. `documents-private` admin SELECT policy so a DRAFT's file can be reviewed before publishing
   (`can_access_document` is publish-gated, correctly, for end users).
4. `idx_documents_admin_list` for the scoped admin list.
5. `detach_document_source_file(uuid)` — pointer-first detach, refuses on `PUBLISHED`, audited.
6. `get_admin_documents(...)` — scoped admin read model with a real total count and server-side
   validation of the status/visibility/year filters.

### Service — `src/services/documentAdminService.js`

`listDocuments` (validates everything before touching the client), `createDraft`,
`updateMetadata`, `uploadSourceFile` (upload → attach → compensate on failure), `publish`,
`withdraw`, `detachSourceFile`, `getSourcePreviewUrl`. Plus pure, directly-tested helpers:
`normalizeSourceFileName`, `buildSourceStoragePath`, `validateSourceFile`, `validateDocumentForm`.

### UI — `/admin/van-ban` (`src/pages/AdminDocuments.jsx`)

`RoleGuard allowedRoles={['YOUTH_ADMIN']}`. List with pagination, search and
status/visibility/year filters; create and edit forms with per-field validation; source-file
upload restricted to the server's own extension allowlist; publish and withdraw behind explicit
confirmation dialogs. Loading, empty, error+retry, success toast, and disabled in-flight states
throughout; duplicate submission is blocked on the form, on confirmed actions, and on upload.

## Rehearsal environment

- **Project:** `znexculhbdjiflkczpyu` — the established **non-production** rehearsal project used by
  P3-03R, P3-07B and P3-08A/B. **Production was not touched. No production Supabase project exists.**
- **Pre-state:** `documents` 0 rows, `document_relations` 0, `documents-private` objects 0,
  `audit_logs` 0, one leftover P3-03R profile. No pre-existing data was at risk.
- **Migration parity brought forward using the repository migrations, not hand-written SQL:**
  `202608160001_phase_4_documents_foundation` and `202608160002_phase_4_documents_admin_storage`
  both applied successfully. The project had been at `202608140002` (P3-06); note that P3-08's
  scheduler migration remains untracked there, matching the P3-08A record — unchanged by this task.
- **Fixture data:** synthetic only. No personal data, no operational or internal document, no real
  police document. No secret appears in this document or in any log.

## Runtime scenario results

Provenance key — `AGENT_OBSERVED_LIVE`: this agent executed it against the rehearsal project and
read the result directly. `NOT_EXECUTED`: not run; reason stated.

| # | Scenario | Actor | Expected | Actual | Verdict | Provenance |
| --- | --- | --- | --- | --- | --- | --- |
| — | Migration parity | postgres (MCP) | P4-01 + P4-02 apply cleanly | both applied, `success` | **PASS** | AGENT_OBSERVED_LIVE |
| — | Bucket privacy | postgres | `documents-private.public = false` | `false`, 50 MiB limit | **PASS** | AGENT_OBSERVED_LIVE |
| — | Policy deployment | postgres | 4 document policies live with intended predicates | INSERT has `with_check` + `can_manage_document` + `uuid_or_null`; DELETE carries `storage_path IS DISTINCT FROM`; admin SELECT uses `can_manage_document`; end-user SELECT uses `uuid_or_null` and defers to `can_access_document` | **PASS** | AGENT_OBSERVED_LIVE |
| — | Write-grant closure | postgres | `authenticated` holds no INSERT/UPDATE/DELETE on `documents` | `0` grants | **PASS** | AGENT_OBSERVED_LIVE |
| — | SECURITY DEFINER hygiene | postgres | all 8 document functions pin `search_path` | `8` of 8 | **PASS** | AGENT_OBSERVED_LIVE |
| **E** | Malformed / traversal path | postgres | resolves to NULL, denies, **raises nothing** | `..`, `../../etc`, `''`, `%2e%2e`, bad-hex UUID → all `NULL`, no exception | **PASS** | AGENT_OBSERVED_LIVE |
| **A** | Authorized admin upload | admin | upload + attach + audit | — | NOT_EXECUTED | needs test identities (see below) |
| **B** | Authorized signed download | admin/member | bounded signed URL works | — | NOT_EXECUTED | needs test identities |
| **C** | Unauthorized cross-scope access | member of other org | denied | — | NOT_EXECUTED | needs test identities |
| **D** | Draft protection | normal member | denied | — | NOT_EXECUTED | needs test identities |
| **F** | Forbidden extension | admin | rejected before durable attach | — | NOT_EXECUTED | needs test identities |
| **G** | Oversized input | admin | rejected at the 50 MiB bound | — | NOT_EXECUTED | needs test identities |
| **H** | Published flow | admin → member | DRAFT → PUBLISHED, then readable in scope | — | NOT_EXECUTED | needs test identities |
| **I** | Withdraw | admin → member | access lost immediately | — | NOT_EXECUTED | needs test identities |

### Disposition

The project owner reviewed this gap and **accepted the partial rehearsal** for P4-02, on the basis
that the behaviours involved are covered by pgTAP against the same schema and that the outstanding
item (a real Storage byte round-trip) is carried forward as a named risk rather than silently
closed. The scenarios below remain recorded as NOT EXECUTED — they were not re-labelled as passed.

### Why A–D and F–I were not executed

Every one of those scenarios needs authenticated actors with distinct roles and organizations
(content admin, in-scope member, out-of-scope member, suspended user). Creating them means writing
`auth.users` + `profiles` + `user_roles` fixtures into a live project. That write was **denied by
this environment's permission control**, and it was not worked around.

This is a tooling/permission boundary, not a missing credential and not a defect in the
implementation. The behaviours those scenarios target are covered by the pgTAP suites, which run
the same policies and RPCs against the same schema under `supabase db reset` in CI:

- **C / D / H / I** — visibility and cross-organization isolation: `documents_foundation.sql` cases
  A–F, J, K, M.
- **A (authorization half) / F / G** — path anchoring, traversal, forbidden extension and oversize
  rejection: `documents_foundation.sql` attach section.
- **C (admin half)** — cross-scope admin isolation, suspended fail-closed, member denied every
  admin mutation: `documents_admin_storage.sql` sections 3–5.
- **A (durability half)** — audit written exactly once on success, and **not at all** on a rejected
  path with no partial state left behind: `documents_admin_storage.sql` section 7.

What pgTAP cannot substitute for, and what therefore genuinely remains open, is a real
authenticated HTTP round-trip through Supabase Storage: an actual byte upload, an actual signed-URL
fetch, and an actual 403 from the storage API for an unauthorized caller. That is the residual gap.

## A regression CI caught before merge

The first CI run on this branch (`31927919182`, HEAD `bd16b04`) failed `test-db`, and one of the
two failures was a genuine, security-relevant regression rather than a test artefact:

**The new `documents-private` policies call `can_manage_document`, but P4-01 had granted that
function to `authenticated` only.** PostgreSQL evaluates every policy on a table for whichever role
is current — including `anon`. So an anonymous read of *any object in any bucket* raised
`permission denied for function can_manage_document` instead of returning zero rows: a hard error
where a silent deny is required, and it broke the unrelated `report_storage_authorization` and
`report_staging_cleanup` suites.

This is the same failure `202608090006_phase_2_storage_policy_privilege_fix.sql` fixed for
`can_read_report_template`; every other helper used inside a storage policy (`is_active_user`,
`current_org_id`, `has_role`, `has_role_in_scope`, `can_access_document`, `uuid_or_null`) is already
granted to both roles for precisely this reason. The fix grants `anon` EXECUTE, which is safe by
construction: `can_manage_document` resolves through `has_role`/`has_role_in_scope`, both of which
require `is_active_user()`, so an anonymous caller always gets `false`. It turns *raise* into
*deny*, never *deny* into *allow*.

A regression guard was added (`documents_admin_storage.sql` §9): read `documents-private` as
`anon`, assert zero rows **and** no exception, plus assert the grant itself exists.

The second failure was my own assertion: `pg_policies` renders the stored expression normalized, so
`IS DISTINCT FROM` comes back upper-cased; the match is now case-insensitive.

Neither was worked around by relaxing an assertion.

## CI evidence

| Gate | Result |
| --- | --- |
| `npm test` | **98/98 PASS** (66 existing unchanged + 32 new) |
| `npm run lint` | PASS — 0 errors, 3 pre-existing Fast Refresh warnings |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| `supabase db reset` + pgTAP | PASS via CI — **`Files=21, Tests=558, Result: PASS`** (P4-01 baseline was `Files=20, Tests=524`; the +34 are this task's `documents_admin_storage.sql`). No assertion-count regression. |
| `deno check` / `deno test` | PASS via CI — `42 passed, 0 failed` (unchanged; no Edge Function touched) |
| CI run | [`31928125405`](https://github.com/vi-phuong-158/so-tay-doan-vien-so/actions/runs/31928125405) — **success** on exact HEAD `f4ee4a561ba20c1c4482508ec132fae2da32b07f` |

Local `supabase db reset` / pgTAP / Deno are not runnable in this environment (no Docker, no
Supabase CLI, no Deno) — the same constraint recorded for every Phase 2/3/4 task; CI is
authoritative for those gates.

## Residual risks

1. **No end-to-end Storage byte round-trip.** Policy predicates, RPC guards and compensation logic
   are proven at SQL and unit level; a real upload/download through the Storage HTTP API is not.
   This is the same class of gap P4-01 recorded, narrowed but not closed.
2. **Relation management still has no trusted write path.** `document_relations` keeps its table
   grants and admin-only RLS policy; P4-02 deliberately did not build a relation editor. A bounded
   follow-up should add an RPC and close the grant, as P4-01 did for `documents`.
3. **Source-file replacement is permitted.** It is safe by construction (fresh path per upload, no
   UPDATE policy, old file never auto-deleted), but the old object is left behind until an
   administrator cleans it up; there is no retention job.
4. **`detach_document_source_file` refuses on PUBLISHED**, so retiring a published document's file
   requires withdrawing first. Deliberate, but it is a workflow constraint worth knowing.
5. **`effect_status` remains free text** (carried over from P4-01).

## Explicit non-production statement

No production Supabase project exists, was created, configured, or contacted by this task. All
runtime work was performed against the non-production rehearsal project `znexculhbdjiflkczpyu`.
`EMAIL_DELIVERY_MODE` was not read or changed. No email was sent. No AI/RAG, Learning or Quiz work
was started. This PR is **not merged**.
