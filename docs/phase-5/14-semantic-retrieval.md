# P5-04 — Hybrid semantic retrieval

## Status

`SEMANTIC_RETRIEVAL_PARTIAL`. Exact-head CI `36252163618` passed on
`9155e1567b60acc815f2ad93ddab89e91a992504`, including clean database reset/pgTAP, Deno,
frontend, Member API, and Vercel. The 2026-09-30 independent audit found that a model abstention
after nonempty retrieval still emitted citations. The fix and regression test landed at
`6ff629848dfff014ca929f557eedac8e5795234e`; exact implementation-head CI `36663700231`
passed all three jobs and Vercel Preview. Runtime semantic acceptance has not passed.

## Baseline

- Starting SHA: `56f858296bcd02c3a805d77dba2b3086cace8a4b` (`origin/master`).
- Branch: `feat/phase-5-semantic-retrieval`.
- Before: `ask-ai` called `search_published_knowledge`, a full-text `plainto_tsquery` search over
  current approved articles/evidence. `process-document` generated optional 768-dimensional vectors;
  the older `match_document_chunks` vector RPC was not used by `ask-ai`. P5 article-generation
  evidence did not store vectors.

## Implementation

- Query embedding: shared Gemini embed adapter, same `GEMINI_EMBEDDING_MODEL` and 768 dimensions as
  document/evidence embeddings; 8 second timeout, response shape validation and sanitized provider
  error codes. New P5 article evidence is embedded best-effort before review; unavailable vectors
  leave lexical retrieval intact and add a bounded warning.
- Vector search: new `search_semantic_knowledge` uses PostgreSQL pgvector cosine distance over
  `document_chunks.embedding`. It filters exact model identity before ranking. A partial B-tree index
  narrows model-tagged vectors; old/null-vector rows remain available to lexical retrieval.
- Authorization/lifecycle: both RPCs execute as security invoker under the caller JWT and filter
  `can_access_document`, PUBLISHED document/current version, document and article retrieval flags,
  current approved article, and approved evidence before returning candidate rows.
- Fusion/context: deterministic weighted RRF (`K=60`, lexical weight `1.25`), exact lexical
  substring matches sort first, evidence ID deduplication, at most 2 chunks per document, maximum 8
  chunks and 12,000 evidence characters. Similarity threshold starts at `0.55`; it needs review
  against the prepared acceptance corpus.
- Fallback/no evidence: embedding provider or semantic RPC errors degrade to lexical-only retrieval.
  Empty results retain the existing abstention response and do not call Gemini generation.
- Citation: server-side source mapping still uses document/version/evidence/locator metadata; route
  remains `/tri-thuc/van-ban/{documentId}`. No model-created citations are used. Model abstention
  now returns zero citations even if retrieval supplied candidates.
- Diagnostics: internal structured logs and message token metadata record mode, lexical/semantic
  candidate counts and selected context count; no query text, embedding or secret is logged.

## Migration

- `supabase/migrations/202609260001_phase_5_semantic_retrieval.sql`
- Adds model identity and a partial filter index, trusted pending-evidence embedding persistence,
  exact lexical-match ranking metadata, and scoped semantic RPC. It re-creates the lexical RPC to
  append `exact_match`; prior result fields remain present. Existing data is not deleted or backfilled.
- Forward fix is the rollback path: disable the semantic call in `ask-ai` and retain the lexical RPC.
  Do not delete vector data as rollback.

## Regression coverage

- Deno retrieval unit suite directly asserts lexical/semantic fusion, exact identifier precedence,
  paraphrase and synonym evidence inclusion, deduplication, document diversity, context budget,
  lexical fallback and empty/no-evidence selection.
- Deno embedding tests cover 768 dimensions, null/malformed values, timeout and provider 5xx mapping.
- `supabase/tests/phase_5_semantic_retrieval.sql` is retrieval-only (14 pgTAP assertions): exact
  identifier lexical hit, direct expected semantic evidence ID and citation metadata, under-threshold
  false match, pending evidence, retrieval disabled, cross-organization denial, withdrawn document,
  stale document version, cross-scope control actor, anonymous denial and approved vector/model
  immutability.
- `supabase/tests/phase_5_article_generation.sql` additionally covers embedding persistence for
  pending evidence and malformed/null vector rejection.

## Validation

- 2026-09-30 local `npm.cmd test`: PASS, 205/205; lint: PASS, 0 errors/3 existing Fast Refresh
  warnings; build: PASS. Full local Member API: blocked by absent `MEMBER_DATABASE_URL` and
  missing local `exceljs` package; no dependencies were installed.
- CI `36252163618` on starting HEAD `9155e156`: PASS. CI `36663700231` on fixed implementation
  HEAD `6ff6298`: PASS, including database reset/pgTAP, Deno/Edge, Member API, frontend and Vercel.
- Local Supabase CLI, Docker and Deno are unavailable; local pgTAP/Deno gates were not run.
- Rehearsal project identity verified as `znexculhbdjiflkczpyu`,
  `so-tay-doan-vien-rehearsal`, `ACTIVE_HEALTHY`; the semantic migration and both retrieval RPCs
  are present. This is deployment inventory, not actor-based runtime acceptance.
- No rehearsal bootstrap credentials are available locally (`SUPABASE_SERVICE_ROLE_KEY`, public
  config). The existing exact-ID cleanup harness therefore cannot create synthetic actors. No new
  fixture was created, and no retrieval, Ask AI, citation, browser, or cleanup runtime gate is
  claimed as passed. Production access: NO.
- Performance: not measured; one query embedding request, then two scoped retrieval RPCs in hybrid
  mode. Lexical fallback uses one RPC.

## Remaining blockers and next step

After final documentation-head CI, supply rehearsal-only bootstrap credentials through the protected
runtime environment and run the expanded synthetic semantic corpus with exact-ID cleanup. The
existing Phase 5 harness covers one lexical article, so it is insufficient by itself for P5-04's
paraphrase, synonym, hybrid-conflict and threshold gates. Keep PR #59 Draft until those gates pass.
