# P5-03 — Canonical extraction → knowledge article generation

## VERDICT

`P5_03_TECHNICAL_ACCEPTANCE_PENDING_DATABASE_DENO_CI_RUNTIME_GATES_PENDING`

The implementation is isolated on `feat/phase-5-03-article-generation` from exact accepted
`origin/master@a91f7145a76507e171bb9e96a9a7262ed6575aaf`. It is not a production deployment and
does not claim Gemini or Google Drive runtime acceptance.

## SCOPE

This vertical slice acquires a trusted canonical source, verifies immutable version/checksum,
extracts deterministic text, builds page/section structure, generates a bounded structured article
draft through a provider abstraction, resolves selective exact-source evidence, persists provenance,
and exposes a minimal scoped admin review workflow.

Out of scope: OCR, image understanding, embeddings, vector indexing, retrieval, RAG ranking,
`ask-ai`, chat UI, automatic publication, legal interpretation, production credentials and deploy.

## ARCHITECTURE

```text
document_version + document_source
  -> scoped Edge Function authorization
  -> StorageProvider read (Supabase private storage or Google Drive)
  -> SHA-256 bytes == immutable version/source checksum
  -> deterministic extraction + normalization
  -> private document_extractions artifact
  -> KnowledgeGenerator structured JSON
  -> backend exact evidence resolution
  -> persist_knowledge_article_draft transaction
  -> PENDING_REVIEW article + PENDING evidence
  -> review_knowledge_article RPC
```

The browser never supplies a Drive ID or source locator to the provider. The Edge Function derives
the locator from the trusted `document_sources` row after checking the scoped admin role.

## SUPPORTED SOURCES / EXTRACTION

The minimum implementation supports PDF text layers, DOCX `word/document.xml`, and TXT/Markdown.
PDFs without usable text fail with `OCR_REQUIRED`; image formats and unsupported extensions fail
with `UNSUPPORTED_FILE_TYPE`. Normalization is technical only: NFC Unicode, line endings,
whitespace, safe hyphenation and empty-page filtering. The artifact retains page boundaries and
structured fallback sections, so evidence can resolve back to a source page.

## KNOWLEDGE GENERATION

`KnowledgeGenerator` is provider-neutral. Gemini is configured only by backend
`KNOWLEDGE_GENERATION_MODEL` and `GEMINI_API_KEY`; tests use `DeterministicFakeKnowledgeGenerator`.
Input is bounded by page batches and never silently truncates the tail. Output is structured JSON,
validated for title/summary/key points/content/evidence. Numeric/date literals absent from source
are recorded as bounded warnings for human review. Prompt version is `knowledge_article_v1`.

`documents.ai_processing_allowed` defaults to `false`; restricted/superseded documents fail closed.
No secret, token, signed URL, full prompt or raw provider response is written to audit/events.

## EVIDENCE / PROVENANCE

AI returns only page/excerpt hints. The backend searches extracted page text and copies the exact
source excerpt, calculates its SHA-256, and rejects `EVIDENCE_NOT_FOUND`. The database also checks
the excerpt exists in the private extraction artifact before insert. The chain is:

`knowledge_article → document_chunks(article evidence) → document_version → document_source → checksum`.

## REVIEW WORKFLOW

`/admin/van-ban/:documentId/tri-thuc` shows source metadata, article revisions, warnings and
evidence. Generation is an authenticated scoped admin Edge Function call. Approval, rejection and
regeneration request use `review_knowledge_article`; draft content is never auto-published. Approval
atomically approves pending evidence and records reviewer/time/note. Approved content/evidence are
immutable; correction/regeneration uses a new generation key/revision.

## DATABASE / RLS / IDEMPOTENCY

Migration `202608250001_phase_5_article_generation.sql` adds private extraction artifacts,
generation attempts, explicit AI eligibility, a specific-claim queue RPC, transactional draft
persistence and trusted review RPC. Authenticated clients retain SELECT-only article/evidence access;
generation internals and direct writes are backend-only. Idempotency is
`document_version + article_key + generator_version`; intentional regeneration must carry an
explicit regeneration key.

## GOLDEN FIXTURES

Synthetic fixtures cover a short document, content at the beginning/middle/end of a multi-page
document, a 15-day-vs-30-day hallucination check, unsupported image input, malformed AI output,
fabricated evidence, and duplicate generation attempts.

## VALIDATION

- `npm test`: 143/143 PASS.
- `npm run lint`: 0 errors, 3 pre-existing Fast Refresh warnings.
- `npm run build`: PASS.
- Deno extraction/generator/evidence tests added but not runnable locally because `deno` is not installed.
- pgTAP migration suite added but `supabase`/Postgres are not installed locally.
- `git diff --check` and secret-pattern audit remain required before CI/PR acceptance.

## RUNTIME GATES / RESIDUAL RISKS

`GEMINI_RUNTIME_GATE_PENDING` and `DRIVE_RUNTIME_GATE_PENDING` remain. Synthetic tests do not prove
provider OAuth, external-AI policy approval, real source permissions, or runtime cleanup. CI must run
the full database reset/pgTAP suite, Deno check/tests and exact-head frontend gates before technical
acceptance can be upgraded.

## NEXT TASK

`P5-04 — Knowledge Article Quality Evaluation & Selective Embedding` (only after this technical
slice is accepted; retrieval/embedding is deliberately not started here).
