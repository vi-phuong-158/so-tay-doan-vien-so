# P4-02R — Documents Storage Actor-Based Runtime Rehearsal

## Status

**PENDING.** Not started, not scheduled by P4-02.

## What this is

P4-02 delivered and merged the documents admin workflow and the Storage write authorization, and
verified at runtime — on the non-production project — that the schema is at parity, the bucket is
private, the policy predicates deployed as intended, and malformed/traversal paths fail closed
without raising.

What it could **not** do is exercise those policies as real authenticated actors. Creating the
required test identities (`auth.users` + `profiles` + `user_roles`) in a live project was denied by
the working environment's permission control, and that was not worked around. P4-02R is the record
of that outstanding work so it cannot quietly disappear.

## Why it matters

pgTAP proves the policy *predicates* against the same schema under `supabase db reset`, and the
unit suites prove the service's ordering and compensation logic. Neither exercises the thing that
only a live environment can: an actual byte upload through the Storage HTTP API, an actual signed
URL fetch, and an actual denial returned to an unauthorized caller. Until that runs, the claim
"an administrator can upload a document and a member can download it" is inferred, not observed.

## Gate classification

**Production-readiness gate.** It must be closed before any production rollout of the documents
feature.

**It does not block P4-03 or later Phase 4 development** — Learning/Quiz work depends on the
documents *schema and access model*, both of which are covered by CI, not on this runtime proof.

## Required evidence (all in a non-production environment)

| # | Scenario | Must demonstrate |
| --- | --- | --- |
| 1 | Authorized admin byte upload | A real file uploads to `documents-private` under `{document_id}/source/…` as an authenticated content admin |
| 2 | Trusted source attach | `attach_document_source_file` records that exact path; `documents.storage_path` reflects it |
| 3 | Actual signed URL download | A signed URL is issued after authorization and the bytes are genuinely retrievable |
| 4 | Unauthorized cross-scope denial | A member of another organization is denied read of the object **and** denied a signed URL, even knowing the path |
| 5 | DRAFT denial | A normal member cannot read a DRAFT topic's document or its source object |
| 6 | Forbidden extension rejection | A disallowed extension is rejected **before** any durable attach |
| 7 | Size boundary | The 50 MiB bound rejects deterministically at the configured limit |
| 8 | Publish access | After `publish_document`, an in-scope member can read metadata and obtain the source per visibility |
| 9 | Withdraw revocation | After `withdraw_document`, that member immediately loses both metadata and source access |
| 10 | Cleanup | Rehearsal fixtures and objects are removed; the currently-attached-file protection is observed to hold |

## Preconditions

- A non-production Supabase project (the existing `znexculhbdjiflkczpyu` rehearsal project is
  suitable) at migration parity with `master`.
- Permission to create synthetic test identities in that project: one content admin
  (`YOUTH_ADMIN` scoped), one in-scope member, one out-of-scope member, one suspended user.
- Synthetic fixture data only. **No personal data, no operational or internal document, no real
  police document.** A harmless placeholder such as `p4-02-storage-rehearsal.pdf`.

## Constraints

- Non-production only. Production must not be touched — no production project exists.
- No secret, token, or signed URL may be pasted into any repository document, log, or screenshot.
- Do not fabricate results. Any scenario not executed stays recorded as NOT EXECUTED, exactly as
  P4-02 did.
- Do not bypass environment permission controls to obtain the required identities. If permission
  is unavailable, the correct outcome is that this record stays PENDING.

## Related

- `docs/phase-4/02-documents-admin-storage-rehearsal.md` — what P4-02 did and did not verify.
- `docs/phase-4/01-documents-foundation.md` — the read-side model this depends on.
- `docs/phase-3/09-phase-3-final-acceptance.md` — the precedent for separating technical
  acceptance from production readiness.
