# P4-01 — Documents Foundation

## Status

`P4_01_DOCUMENTS_FOUNDATION_READY_FOR_REVIEW` — Draft PR, not merged.

## Baseline

- Branch `feat/phase-4-documents-foundation`, created from `master@814b8248587f5581d58b1836efabd84d61274170`
  (the P3-09 merge commit that closed Phase 3).
- Baseline survey: `docs/phase-4/00-baseline-documents-plan.md`.

## What this slice is

A real vertical slice for **Văn bản**: database constraints and RLS → private Storage authorization
→ server-validated admin write path → service layer → list/detail UI → signed download, replacing
the mock document data.

It is deliberately **not** a rebuild of the documents model. P4-00 established that
`202607300001_initial_schema.sql` and `202607300003_fix_phase_1_security.sql` already provide the
`documents` table (full spec field set, 7-value status CHECK), `document_relations`,
`document_chunks`, `owner_organization_id`, the fail-closed `can_access_document(uuid)` helper, the
private `documents-private` bucket, and a Storage read policy. P4-01 closes the gaps around that
foundation instead of duplicating it.

## Migration — `202608160001_phase_4_documents_foundation.sql`

Forward-only, non-destructive: no table dropped, no column removed, no historical row edited.

| # | Change | Why |
| --- | --- | --- |
| 1 | CHECK on `documents.visibility_level` (4 spec levels) and on `document_relations.relation_type` (`AMENDS/REPLACES/GUIDES/RELATED`), plus a no-self-relation CHECK | Both columns previously accepted any string |
| 2 | SELECT policy on `document_relations` requiring `can_access_document()` on **both** endpoints; admin manage policy | The table had RLS enabled and **zero policies** → deny-all for everyone, so relations were unreadable even by admins |
| 3 | Revoke `INSERT/UPDATE/DELETE` on `documents`, `document_relations`, `document_chunks` from `authenticated`; keep `SELECT` | Defense in depth, matching the P2-06 precedent; writes now only via RPC |
| 4 | Replace the `documents-private` Storage SELECT policy with a `uuid_or_null`-based form | The old policy cast the first path segment with a raw `::uuid`, which **raises** on a malformed path instead of denying |
| 5 | Indexes for the list read model | `(status, issued_date desc, id desc)` matches the list query's filter+sort |
| 6 | Admin RPCs: `can_manage_document`, `create_document_draft`, `update_document_metadata`, `publish_document`, `withdraw_document`, `attach_document_source_file` | No server-validated write path existed |

### Why the grants were closed even though RLS already blocked writes

RLS *did* already deny an end user's write: the only write policy on `documents` requires
`YOUTH_ADMIN`-in-scope or `SYSTEM_ADMIN` in its `WITH CHECK`. So this was not a live exploit. It was
an unnecessarily broad grant of the same shape the project already eliminated in P2-06, and closing
it makes the RPC the single write path rather than one of two.

## Security invariants

- **Fail closed.** Every read path starts from `is_active_user()`; `can_access_document()` returns
  `false` by default and requires `status='PUBLISHED'` for non-admins, so `DRAFT`, `PROCESSING`,
  `PENDING_REVIEW` and `WITHDRAWN` are structurally invisible to end users.
- **Server-side authorization only.** No RPC trusts a client-supplied role, and no control depends
  on the frontend hiding a button.
- **Knowing `storage_path` is not access.** The Storage policy re-derives the document id from the
  object path and re-checks `can_access_document()`; a malformed or traversal-shaped path resolves
  to `null` and denies silently.
- **Path anchoring.** `attach_document_source_file` requires the path to match
  `{this document id}/source/{filename}`, so an admin of org A cannot attach an object living under
  a document owned by org B.
- **MIME is never trusted from the browser** — the extension allowlist is applied to the stored
  path server-side; size is bounded server-side (50 MiB).
- **Signed URLs** are short-lived (60s default, hard-capped 3600s), requested only on an explicit
  click, and never persisted to the database, audit rows, or logs.
- **SECURITY DEFINER hygiene** — all six new functions pin `search_path`, and each is
  revoke-then-grant with `anon` excluded.
- **Audit** on create / metadata update / publish / withdraw / source attach-replace. File
  contents, signed URLs, secrets and tokens are never logged.

## Service layer — `src/services/documentService.js`

Follows the established `reportService` factory pattern (injectable client, exported pure mappers,
typed error class with a business-code allowlist).

- `listDocuments({page, pageSize, search, documentType, issuingAuthority, year, effect})` — bounded
  page (max 100), deterministic `(issued_date desc, id desc)` order, all filtering pushed to the
  server. All inputs are validated **before** the query builder is touched.
- `getDocument(id)` / `getDocumentRelations(id)` — a forbidden document and a missing one are
  intentionally indistinguishable (`DOCUMENT_NOT_FOUND`).
- `getDocumentDownloadUrl(path, {expiresIn})` — bucket-scoped, path-shape validated, bounded expiry.
- `getFilterOptions()` — derived only from rows the caller can actually see.

## Frontend

| Route | Page | State |
| --- | --- | --- |
| `/tri-thuc/van-ban` | `src/pages/Documents.jsx` | new — real data, loading skeleton, error + retry, empty state, pagination ("Tải thêm"), search, and filters for type / authority / year / effect |
| `/tri-thuc/van-ban/:documentId` | `src/pages/DocumentDetail.jsx` | new — metadata, summary, keywords, relations, signed download on click |
| `/tri-thuc` | `src/pages/Knowledge.jsx` | updated — the Văn bản tab now previews **real** documents; Chuyên đề học tập stays on demo data (Learning Topics is a later slice) |

No redesign: existing design-system classes (`.document-card`, `.document-list`, `.document-detail`,
`.document-cover`, `.doc-tags`, `.doc-icon`, `.chip-row`, `.content-card`, `.button`) and the shared
`Button`/`PageHeader`/`EmptyState`/`Skeleton` components are reused. Only three layout wrappers were
added to `src/index.css`. Status is never conveyed by colour alone — every badge prints its label.

## Tests

**pgTAP — `supabase/tests/documents_foundation.sql`** (A–M matrix from P4-00 §7):

positive A/B/C (active user reads published+internal; org member reads own-org ORGANIZATION_ONLY;
scoped admin reads DRAFT and RESTRICTED) · negative D/E (draft, pending hidden) · F
(cross-organization isolation) · G (no write grants + RPC denial) · H (member cannot publish) · I
(Storage policy defers to `can_access_document`; helper denies for out-of-scope and RESTRICTED) · J
(suspended account denied even for PUBLIC) · K (RESTRICTED hidden) · L (`uuid_or_null` fail-closed
for traversal/garbage) · M (relation hidden when either endpoint is hidden) · plus constraint
rejections, admin transition validation (republish rejected), audit-row counts, path-anchoring,
traversal, dangerous-extension and oversize rejections, and SECURITY DEFINER `search_path` hygiene.

**Frontend — `tests/document_service.test.mjs` (10) + `tests/document_ui.test.mjs` (11):**
mapper shape, no precomputed download URL, effect-status derivation, bounded/deterministic paging,
input validation before any request, filters pushed server-side with PostgREST delimiters
neutralized, forbidden≡missing, relation mapping, signed-URL path/expiry rejection, error
normalization keeping raw DB detail out of the UI; routes registered, loading/error+retry/empty/
pagination present, no client-side filtering, **no signed URL during render**, download only from
the click handler with a double-click guard, relations non-fatal, and mock data removed.

Full suite: **66/66 pass** (45 pre-existing unchanged + 21 new). No existing test was modified,
weakened, or skipped.

## Validation

| Gate | Result |
| --- | --- |
| `npm test` | PASS — 66/66 |
| `npm run lint` | PASS — 0 errors, 3 pre-existing Fast Refresh warnings (unchanged) |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| `supabase db reset` / `supabase test db` | **Not run locally** — no Docker/Supabase CLI in this environment (same constraint as every Phase 2/3 task). Authoritative result is CI `test-db` on the Draft PR. |
| `deno check` / `deno test` | Not applicable — no Edge Function was added or changed by P4-01. Still exercised by CI. |

## Remaining risks / gaps

1. **Storage runtime rehearsal not performed.** CI runs `supabase db reset` + pgTAP but never does
   an authenticated Storage upload/download round-trip, so the `documents-private` policy is
   asserted at the predicate level, not proven end-to-end against a live bucket. Recorded as a gap
   rather than claimed as passed — the standard Phase 3 applied to live email.
2. **No admin UI.** The write path is server-side and tested, but there is no documents admin
   screen; documents must currently be created via RPC. Intentional — admin UI was out of P4-01's
   frontend scope.
3. **`RESTRICTED` has no per-user targeting.** It resolves to "scoped admins only", inherited from
   the Phase 1 model. Fail-closed and correct, but narrower than a future per-user grant table.
4. **`document_chunks` untouched.** Chunk rows remain admin-only; nothing about the future AI/RAG
   pipeline is pre-empted or broken, but nothing is prepared for it either.
5. **`effect_status` is free text.** Display falls back to date-derived status when it is null; a
   future migration may want to constrain it.

## Explicitly not done

Learning Topics · Quiz · AI/RAG · Gemini · embeddings · `document_chunks` processing ·
`process-document` pipeline · OCR · vector search · chunk review UI · documents admin UI ·
Innovation · Phase 5 · production deployment · production secrets · `EMAIL_DELIVERY_MODE=LIVE` ·
live/bulk email · app-wide redesign. This PR is **not merged**.

## Next recommended task

`P4-02 — Documents Admin Workflow & Runtime Storage Rehearsal`: an admin UI over the P4-01 RPCs
plus a controlled runtime rehearsal proving the private-bucket upload/download path end-to-end
against a non-production project — closing gap 1 and gap 2 above. Recommendation only; not started.
