# P4-00 — Phase 4 Baseline & Documents Architecture Plan

## Baseline

- **Master SHA:** `814b8248587f5581d58b1836efabd84d61274170` (merge of P3-09 PR #22; Phase 3 closed).
- **Branch for Phase 4:** `feat/phase-4-documents-foundation`, created from that exact commit.
- **Method:** every statement below was verified by reading current source on this commit
  (migrations, `src/`, `supabase/tests/`, seed), not inferred from prior task summaries or from
  `docs/01-product-spec.md` alone. The product spec describes intent; several parts of it turned
  out to be **already implemented**, which materially reduces P4-01's scope.

## Headline finding

The `documents` schema is **not greenfield**. `202607300001_initial_schema.sql` already creates
`documents`, `document_relations`, and `document_chunks` with essentially the full field set the
spec asks for, and `202607300003_fix_phase_1_security.sql` already added `owner_organization_id`,
a fail-closed `can_access_document(uuid)`, admin-manage policies, the private `documents-private`
bucket, and a Storage read policy.

P4-01 is therefore **not** "create the documents model". It is: close the remaining write-path and
relation-path gaps, harden two real defects found in the existing Storage/relations layer, and
build the read vertical slice (service + list/detail + signed download) that does not exist at all.

## 1. Database — current state and classification

### `public.documents` — REUSE

Already present with every business field P4-01 requires:

`id`, `document_number`, `title`, `document_type`, `issuing_authority`, `issued_date`,
`effective_date`, `expiry_date`, `effect_status`, `scope`, `summary`, `keywords text[]`,
`storage_path`, `source_url`, `status`, `visibility_level`, `approved_by`, `approved_at`,
`created_by`, `updated_by`, `created_at`, `updated_at`, plus `owner_organization_id` (added by the
Phase 1 security fix and used as the org-scoping anchor).

`status` already has the exact spec CHECK constraint:
`DRAFT, PROCESSING, PENDING_REVIEW, PUBLISHED, REPLACED, EXPIRED, WITHDRAWN`.

No table change is needed for the field set. **Do not recreate or alter this table's shape.**

### `public.document_relations` — EXTEND (currently unusable)

Exists as `(source_document_id, target_document_id, relation_type)` with a composite PK and
cascade deletes. Two concrete gaps:

1. **RLS is enabled but the table has zero policies.** It is in the blanket
   `enable row level security` loop (`202607300001:310`) and no migration ever creates a policy on
   it. Net effect today: deny-all for every role including admins — the detail page's "văn bản liên
   quan" cannot be read by anyone. This must be fixed for P4-01's detail view to work.
2. **`relation_type` has no CHECK constraint** — any string is accepted.

### `public.document_chunks` — REUSE AS-IS (out of scope)

Exists with `review_status`, `visibility_level`, `embedding vector(768)`, and admin-only policies
(`202607300003:76-78`). P4-01 does **not** touch chunks, embeddings, or `match_document_chunks` —
that is AI/RAG territory, explicitly excluded. Compatibility is preserved by not altering the table.

### Access helper `public.can_access_document(uuid)` — REUSE

`202607300003:39-69`. Already fail-closed and already implements the spec's visibility ladder:

- returns `false` unless `is_active_user()`;
- returns `false` unless `status = 'PUBLISHED'` — so `DRAFT`/`PROCESSING`/`PENDING_REVIEW`/
  `WITHDRAWN` are invisible to the read path by construction;
- `PUBLIC` / `INTERNAL_YOUTH` → visible to any active user;
- `ORGANIZATION_ONLY` → owner org match, or a `YOUTH_ADMIN` whose scope covers the owner org;
- `RESTRICTED` → scoped `YOUTH_ADMIN` only (no per-user targeting table exists);
- default `return false`.

This is exactly the model P4-01 needs. **Reuse it; do not build a parallel permission system.**

### Role/scope helpers — REUSE

`is_active_user()`, `current_org_id()`, `has_role()`, `has_role_in_scope()`,
`is_organization_in_scope()` (recursive org tree), and `uuid_or_null(text)` (Phase 2, safe cast
that returns `null` instead of raising) are all present, `SECURITY DEFINER`, with
`set search_path = public`.

### Gaps to close in P4-01

| # | Gap | Severity | Action |
| --- | --- | --- | --- |
| G1 | `document_relations` has RLS on but **no policy** → deny-all, relations unreadable | Blocking for detail view | Add SELECT policy gated on `can_access_document()` for **both** endpoints |
| G2 | `relation_type` unconstrained | Data integrity | Add CHECK `AMENDS/REPLACES/GUIDES/RELATED` |
| G3 | `grant insert, update, delete on public.documents to authenticated` (`202607300001:399`) | Defense-in-depth | Revoke; route writes through admin RPCs (matches the P2-06 precedent that closed direct-RPC/table bypass) |
| G4 | `grant select, insert, update, delete on public.document_relations to authenticated` (`:400`) | Defense-in-depth | Revoke write grants; keep SELECT |
| G5 | Storage policy casts `(string_to_array(name,'/'))[1]::uuid` raw (`202607300003:100`) | Fail-open-ish / error | Replace with `uuid_or_null(...)` so a malformed path fails **closed** instead of raising |
| G6 | `visibility_level` has no CHECK constraint | Data integrity | Add CHECK for the four spec levels |
| G7 | No server-validated admin write path (create/update/publish/withdraw/attach) | Required by task §6 | Add `SECURITY DEFINER` RPCs with state-transition validation + audit |

**Note on G3/G4 severity.** RLS currently *does* block a regular user's INSERT/UPDATE/DELETE on
`documents`: the only write policy is `content admins manage documents`, whose `WITH CHECK`
requires `YOUTH_ADMIN`-in-scope or `SYSTEM_ADMIN`. So this is not a live exploit — it is an
unnecessarily broad grant that the project already decided to eliminate elsewhere (P2-06). Closing
it is hardening, not incident response.

## 2. Frontend — current state

| Item | State |
| --- | --- |
| `/tri-thuc` (`src/pages/Knowledge.jsx`) | Exists; renders **mock** `documents` + `topics` from `src/data/mock.js` |
| `DocumentCard` | Exists but is a private inline component inside `Knowledge.jsx` |
| Filter chips ("Tất cả/Hướng dẫn/Kế hoạch/Biểu mẫu") | Present but **non-functional** (static markup, no state) |
| `/tri-thuc/van-ban` | **NOT_IMPLEMENTED** — no route |
| `/tri-thuc/van-ban/:documentId` | **NOT_IMPLEMENTED** — no route |
| `src/services/documentService.js` | **NOT_IMPLEMENTED** |
| Loading / empty / error / retry for documents | **NOT_IMPLEMENTED** |
| Pagination / real search | **NOT_IMPLEMENTED** |

Mock shape (`{id, number, type, title, authority, date, effective, summary}`) is a flat display
shape, not the DB shape — P4-01 needs a mapper, same as `mapAssignmentRow`/`mapSubmissionRow` in
`reportService.js`.

### Service architecture to reuse (established Phase 2 pattern)

`src/services/reportService.js` defines the house style P4-01 will follow exactly:

- factory `createReportService(client, deps)` — injectable client makes tests trivial;
- exported pure mappers (`mapAssignmentRow`) and pure path builders (`buildReportUploadPath`);
- a typed error class + `normalizeReportError` with an explicit `BUSINESS_ERROR_CODES` allowlist;
- `getSignedFileUrl(path, {bucket, expiresIn})` with a bucket allowlist, path assertion, and a
  bounded expiry (1–3600s), called **on demand**, never prefetched.

## 3. Storage — current state

- Bucket `documents-private` — **exists, private** (`202607300003:93`). REUSE; do not create a new
  bucket, do not make anything public.
- SELECT policy on `storage.objects` for that bucket exists and correctly derives the document id
  from the **first path segment**, then defers to `can_access_document()`. This means the intended
  path convention is already `{document_id}/...`, matching the task brief.
- Defect G5 above: the raw `::uuid` cast raises `invalid input syntax` on any object whose first
  segment isn't a UUID. Phase 2 created `uuid_or_null` for precisely this and uses it in
  `can_read_report_template`. P4-01 aligns the documents policy with that precedent.
- No INSERT/UPDATE/DELETE policy exists on `documents-private` → uploads are currently impossible
  from any client role. P4-01 keeps it that way for end users; the admin attach path is
  server-side, so no broad Storage write grant to `authenticated` is introduced.

**Path convention adopted (compatible with the existing policy):**

```text
documents-private/{document_id}/source/{uuid}-{safe_filename}
```

## 4. Security — threat model for Documents

| Threat | Control | Where enforced |
| --- | --- | --- |
| Cross-organization read | `can_access_document` org match / scoped admin | DB (RLS + helper) |
| Draft / pending / withdrawn disclosure | helper hard-requires `status='PUBLISHED'` for non-admins | DB |
| RESTRICTED disclosure | scoped `YOUTH_ADMIN` only; default `false` | DB |
| Direct Storage path access (knowing `storage_path`) | Storage RLS re-derives doc id from path and re-checks `can_access_document` | DB (storage.objects RLS) |
| Malformed/traversal path defeating that check | `uuid_or_null` → `null` → policy false (fail closed) — **G5 fix** | DB |
| IDOR on detail route | Detail read goes through the same RLS SELECT; unknown/forbidden id returns not-found | DB + service |
| Metadata manipulation by end user | Table write grants revoked (G3/G4); writes only via `SECURITY DEFINER` RPCs that re-check role | DB |
| Self-publish / privilege escalation | Publish is an RPC that validates role **and** state transition server-side | DB |
| MIME spoofing / dangerous extension | Extension allowlist + normalized filename validated server-side in the attach RPC; browser-declared MIME never trusted | DB |
| Oversized upload | Bounded size checked server-side at attach time | DB |
| Signed URL leakage | Short expiry, generated on click only, never persisted to DB/audit/logs | Service + RPC contract |
| Suspended/archived account | Every helper starts from `is_active_user()` | DB |

## 5. Proposed P4-01 scope

**Migration** (one forward-only file, no destructive change):

1. CHECK constraints for `documents.visibility_level` and `document_relations.relation_type`.
2. SELECT policy for `document_relations` gated on `can_access_document()` for both endpoints.
3. Revoke direct write grants on `documents` / `document_relations` from `authenticated`.
4. Replace the `documents-private` Storage SELECT policy with the `uuid_or_null` fail-closed form.
5. Admin RPCs (`SECURITY DEFINER`, `set search_path`, revoke-then-grant): create draft, update
   metadata, publish, withdraw, attach source file — each validating role, org scope, and the state
   transition, and each writing an `audit_logs` row.
6. Indexes supporting the list query's filter/sort.

**Service:** `src/services/documentService.js` following the `reportService` factory pattern —
list (paginated + filtered), detail (+ relations), signed download URL on demand.

**Frontend:** new routes `/tri-thuc/van-ban` and `/tri-thuc/van-ban/:documentId`, wired to real
data with loading/empty/error/retry, pagination, search, and the four spec filters. `/tri-thuc`
keeps its existing tab shell; the mock document list is replaced by a link into the real list.

**Tests:** pgTAP suite covering the A–K matrix in the task brief, plus frontend behavior tests
mirroring `report_service.test.mjs` / `report_ui.test.mjs`.

## 6. Explicit exclusions (P4-01)

Learning Topics · Quiz · AI/RAG · Gemini · embeddings · `document_chunks` processing ·
`process-document` pipeline · OCR · vector search · chunk review UI · document admin **UI** (the
server-side admin write path is in scope; no new admin pages) · Innovation · Phase 5 ·
production deployment · production secrets · `EMAIL_DELIVERY_MODE=LIVE` · any app-wide redesign.

## 7. Test matrix

| ID | Case | Expect |
| --- | --- | --- |
| A | ACTIVE user reads `PUBLISHED` + `INTERNAL_YOUTH` | visible |
| B | Org member reads `ORGANIZATION_ONLY` of own org | visible |
| C | Scoped `YOUTH_ADMIN` reads `DRAFT` in scope | visible |
| D | Regular user reads `DRAFT` | denied |
| E | Regular user reads `PENDING_REVIEW` | denied |
| F | Chi đoàn A user reads `ORGANIZATION_ONLY` of Chi đoàn B | denied |
| G | Regular user INSERT/UPDATE/DELETE on `documents` | denied |
| H | Regular user publishes (sets `status='PUBLISHED'`) | denied |
| I | Regular user reads a private Storage object outside rights, knowing the path | denied |
| J | SUSPENDED account reads an otherwise-visible document | denied (fail closed) |
| K | `RESTRICTED` document read by non-granted user | denied |
| L | Malformed / traversal Storage path | denied, no error raised (fail closed) |
| M | `document_relations` readable only when both endpoints are accessible | enforced |

Storage runtime behavior (real upload/download against a live bucket) cannot be exercised in the
current CI, which runs `supabase db reset` + pgTAP + Deno but performs no authenticated Storage
round-trip. Policy predicates are therefore asserted directly in SQL, and the runtime rehearsal is
recorded as an explicit remaining gap rather than claimed as passed — the same standard Phase 3
applied to live email.
