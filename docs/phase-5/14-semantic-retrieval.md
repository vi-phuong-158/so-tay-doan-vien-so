# P5-04 — Hybrid semantic retrieval

## Status

`SEMANTIC_RETRIEVAL_PARTIAL` pending local database/Edge verification. Implementation and focused
regression coverage are present on the task branch. Root npm gates pass. The current environment
does not provide Deno, Docker or Supabase CLI, so this report does not claim pgTAP or Edge tests pass.
No hosted rehearsal or production request was made.

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
  remains `/tri-thuc/van-ban/{documentId}`. No model-created citations are used.
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

- `npm.cmd test`: PASS, 153/153.
- `npm.cmd run lint`: PASS, 0 errors and 3 pre-existing Fast Refresh warnings.
- `npm.cmd run build`: PASS.
- `supabase test db`: BLOCKED — Supabase CLI is not installed.
- Deno Edge check/tests: BLOCKED — Deno is not installed.
- Docker/PostgreSQL local runner: unavailable in the current environment.
- Performance: not measured; one query embedding request, then two scoped retrieval RPCs in hybrid
  mode. Lexical fallback uses one RPC.

## Remaining blockers and next step

Run the repository CI database and Deno gates on this exact branch/HEAD, fix any failures, then run
the previously prepared RAG end-to-end acceptance corpus on the non-production rehearsal
environment. This is not RAG end-to-end acceptance yet. Do not merge until those code regression
gates pass.
