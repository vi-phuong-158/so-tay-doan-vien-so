# Phase 5 End-to-End Closure

## Status

`PHASE_5_RUNTIME_BLOCKED_ACTOR_INVOCATION_TOOL_UNAVAILABLE`

Technical CI gates are complete. The authenticated Supabase management connector reconciled and
deployed the rehearsal state, but it exposes no authenticated Auth/session creation or Edge Function
invocation operation. Runtime actor acceptance therefore remains blocked; this report does not claim
a full Phase 5 pass.

## Forward changes

- Preserved PR #36's accepted P5-03 head and based the closure worktree on the subsequent
  trigger-function privilege forward fix `ff72ccd`.
- Added `202608310001_phase_5_rag_retrieval.sql`: scoped admins explicitly opt a published document
  and its approved current article into retrieval; `search_published_knowledge()` is a
  `SECURITY INVOKER` RPC and therefore applies the caller's document/article/evidence RLS before
  any model call.
- Replaced the legacy `ask-ai` direct chunk query with approved-evidence retrieval, conversation
  ownership verification, a bounded Gemini gateway, deterministic source labels, and trusted
  `ai_message_sources` evidence provenance.
- Added `/tri-thuc/hoi-ai`; the browser invokes only the authenticated Edge Function and citations
  link to the canonical document route rather than object paths or public storage URLs.

## Baseline regression analysis

- Exact PR base: `a91f7145a76507e171bb9e96a9a7262ed6575aaf`.
- The historical base CI `32745420238` passed. Replaying that same base with the current
  `supabase/setup-cli@v1` `latest` environment failed run `33413402157` at the same four pgTAP
  assertions as the closure candidate: anonymous notification read plus unexpected authenticated
  `INSERT` on `profiles.account_status`, `profiles.organization_id`, and `profiles.full_name`.
- Candidate retrieval code does not modify `profiles` or `notifications`; classification is
  `ENVIRONMENT_VERSION_REGRESSION`, not `PHASE_5_REGRESSION`.
- `202608310002_phase_5_baseline_privilege_stabilization.sql` makes the accepted minimal grants
  explicit, preserving RLS and the existing assertions rather than changing tests. The CI runtime
  used PostgreSQL image `15.8.1.085`, PostgREST `v16.1`, pg_prove `3.36`, and Deno `1.46.3`.

## Technical validation

- `npm test`: 147 passed, 0 failed.
- `npm run lint`: 0 errors.
- `npm run build`: passed.
- `git diff --check`: passed.
- Exact-head CI `33415028799` on `1cdc3d51d35d86338aacd8c88d138006dd3ad1d5`: frontend lint/test/build passed; Supabase reset and
  full pgTAP passed (`Files=27, Tests=815`); `phase_5_article_generation.sql` passed; Deno check
  and Deno test passed (`74 passed, 0 failed`).

## Runtime acceptance evidence (rehearsal only)

- Exact HEAD: `1cdc3d51d35d86338aacd8c88d138006dd3ad1d5`; worktree clean; Production accessed: **NO**.
- C1 identity: ref `znexculhbdjiflkczpyu`, name `so-tay-doan-vien-rehearsal`, status `ACTIVE_HEALTHY`,
  region `ap-southeast-1`, PostgreSQL `17.6.1.155`.
- C2 reconciliation: starting head `20260825154300_phase_5_function_privilege_hardening`; applied
  exact committed migrations `202608310001_phase_5_rag_retrieval` and
  `202608310002_phase_5_baseline_privilege_stabilization`; final head includes both.
- RPC/security verification: retrieval manager RPCs are `SECURITY DEFINER` with authenticated-only
  EXECUTE and internal authorization; `search_published_knowledge(text,integer)` is
  `SECURITY INVOKER`, authenticated-only EXECUTE, anonymous denied. All Phase 5 tables retain RLS.
  Stabilized grants show anonymous notification SELECT denied, authenticated profile INSERT denied,
  and only intended profile update columns allowed.
- C3 deployment: `ask-ai` v1, `process-document` v1, and `generate-knowledge-article` v1 are ACTIVE,
  source uploaded from this HEAD, `verify_jwt=true`. `run-ingestion-jobs` was not deployed: its
  canonical worker is explicit `NO_OP_FOUNDATION` and is not required by the selected pilot.
- C4 configuration: no secret-presence endpoint is available; a Vault name query returned no matching
  names and cannot prove Edge runtime secret state. Gemini configuration is `UNVERIFIABLE`; Drive is
  `NOT_REQUIRED` for a Supabase Storage text pilot.
- Anonymous HTTP probe to rehearsal `ask-ai` returned controlled `401 UNAUTHORIZED_NO_AUTH_HEADER`.
  No authenticated actor/session or Edge invocation API is available in the connected tooling, so
  actor matrix, document pilot, review/toggle sequence, Ask AI evidence, citations, failure matrix,
  cleanup proof, and citation UI acceptance were not executed and are not fabricated.

## Authenticated runtime harness

Added `scripts/phase5-runtime-acceptance.mjs` and the rehearsal-only command
`npm run test:phase5:runtime`. The harness uses the existing `@supabase/supabase-js` dependency,
rejects every URL except `https://znexculhbdjiflkczpyu.supabase.co`, creates random temporary actors
through the server-side Auth Admin API, signs them in through `signInWithPassword`, invokes deployed
Edge Functions with ordinary user JWTs, redacts sensitive headers, and performs best-effort cleanup
in `finally`. It never imports into the product runtime and never logs credentials.

Local execution was intentionally blocked because no rehearsal public configuration or server/admin
bootstrap credential exists in the local environment. The harness emitted
`PHASE_5_RUNTIME_BLOCKED_REHEARSAL_PUBLIC_CONFIG_REQUIRED`; with public config supplied, the next
precise blocker is `PHASE_5_RUNTIME_BLOCKED_REHEARSAL_AUTH_BOOTSTRAP_CREDENTIAL_REQUIRED`. No
authenticated actor or pilot data was created by this run.

## Security advisor classification

The rehearsal security advisor returned existing INFO `rls_enabled_no_policy` notices for internal
queue/audit/embedding tables and existing WARN mutable-search-path and authenticated SECURITY
DEFINER notices across legacy RPCs. These are pre-existing project-wide findings, not introduced by
the two Phase 5 migrations; the Phase 5 retrieval RPC contract was verified explicitly and no
high-confidence new Phase 5 issue was found. No advisor remediation was applied in this closure.

## Production

Production access used: **NO**. Production migration, deploy, secret change, cron change, and test
artifact upload are all out of scope for this closure.

## Authenticated rehearsal execution update (2026-09-01)

The rehearsal-only harness was run with untracked local configuration after a presence-only
preflight. The URL matched `znexculhbdjiflkczpyu`; the public and server/admin keys were present;
no secret value was printed or committed. The local configuration file uses PowerShell assignment
syntax, so the three required values were parsed into the child process only rather than sourced as
arbitrary code.

- Auth bootstrap passed: an admin, User A (Organization A), and User B (Organization B) were
  created through the server-side Auth Admin API and signed in through normal password auth to
  obtain user JWTs.
- The anonymous `ask-ai` request was denied with HTTP 401 / `UNAUTHENTICATED`; a regular User A
  was denied the retrieval-manager RPC. This is runtime evidence for the initial direct-client and
  privileged-boundary gates.
- The real `process-document` invocation then failed closed with HTTP 400 and controlled
  `GEMINI_NOT_CONFIGURED`, normalized by the harness as
  `PHASE_5_RUNTIME_BLOCKED_REHEARSAL_PROVIDER_CONFIG_REQUIRED`. Therefore no extraction,
  generation, review/toggle, Ask AI, citation, provider-failure, or UI gate is claimed as passed.
- This is a rehearsal server configuration blocker, not a bypassable test failure. The required
  Gemini embedding configuration for `process-document` (one or both of `GEMINI_API_KEY` and
  `GEMINI_EMBEDDING_MODEL`) must be configured by an authorized rehearsal owner before rerun.
- Every synthetic artifact created by the failed runs was removed using an exact-ID, transactionally
  scoped management cleanup because provenance triggers correctly make sources immutable to the
  application service client. Final synthetic counts were zero for organizations, documents,
  sources, ingestion jobs, and storage objects. Production accessed: **NO**.

The harness was corrected after real reproduction of two acceptance-tool defects: its original
actor password exceeded the Auth/bcrypt length limit, and it did not recognize a controlled string
error payload. Regression tests cover both behaviors. This is still not a full runtime acceptance
pass.

## Owner-configured rehearsal attempt (2026-09-01)

After owner configuration, `process-document`, `generate-knowledge-article`, and `ask-ai` were
deployed to rehearsal as active version 3 with JWT verification enabled. Synthetic Auth and
`process-document` completed successfully, including the 768-dimensional embedding contract.
Gemini generation reached the provider but returned redacted HTTP 503 `UNAVAILABLE`; one bounded
retry returned the same transient condition. Storage objects and chunks were removed and the five
synthetic jobs were cancelled. Because ingestion events are append-only and foreign-key linked,
3 documents, 3 versions, 3 sources, 5 jobs and 9 events remain as linked audit history; orphan
jobs/events = 0. Production accessed: **NO**.

## Gemini compatibility remediation pending rehearsal secret sync (2026-09-01)

The local untracked environment now contains all four required Gemini settings and their model
identifiers match the accepted contract; values were inspected only as presence/equality booleans
and were neither printed nor staged. The hosted reconciliation cannot be performed from this
session: `supabase` CLI is not installed (and must not be installed as a workaround) and the
connected management tools do not expose a secret-write operation.

The source was updated before the next deployment to request `output_dimensionality: 768` from
`models/gemini-embedding-2`, validate finite numeric vectors of exactly 768 dimensions, and fail
closed for any mismatch. Gemini 3.7 requests now remove deprecated sampling parameters; knowledge
generation uses medium thinking while the evidence-grounded Ask AI path uses low thinking. These
contracts have automated regression tests. Exact-head CI `33484622052` passed on
`7ebefbdf23d6bfe45b27c00f451ba687e35d4a07`: frontend lint/test/build, Supabase reset, all
pgTAP, Deno check, and Deno tests. This proves the source change only; it does not establish hosted
secret presence or replace the remaining rehearsal runtime gates.

Owner action for rehearsal only: open **Edge Functions → Secrets** in project
`znexculhbdjiflkczpyu`, add or replace exactly `GEMINI_API_KEY`, `GEMINI_EMBEDDING_MODEL`,
`KNOWLEDGE_GENERATION_MODEL`, and `RAG_GENERATION_MODEL` from the local untracked file, then save.
Do not copy values into a ticket, PR, or browser source. No redeploy is required merely to make
saved secrets available, but the affected function source must be deployed from the post-fix PR
HEAD before rerunning the authenticated acceptance harness.

## Provider retry hardening (2026-09-01)

The Gemini generation adapters now share a bounded four-attempt exponential backoff policy with
small jitter and a per-request timeout. Only HTTP 500/503, HTTP 429, and transient network/timeout
failures retry. HTTP 503 is classified as `PROVIDER_UNAVAILABLE`, HTTP 429 as
`MODEL_RATE_LIMITED`, malformed successful output as `MODEL_INVALID_OUTPUT`, and permanent 4xx as
`MODEL_PROVIDER_ERROR`; configuration errors do not retry. Deterministic Deno tests cover retry,
non-retry, success-after-transient, malformed output, and exhaustion semantics. No model fallback
was introduced; the accepted Gemini 3.7 models remain unchanged.

The post-deployment minimal provider smoke used the accepted `models/gemini-3.7-flash` model and a
short JSON prompt without creating a document chain. All four bounded attempts returned redacted
HTTP 503 `UNAVAILABLE`. The full authenticated runtime harness was therefore not started and the
runtime verdict remains `PHASE_5_RUNTIME_BLOCKED_PROVIDER_UNAVAILABLE_503`.

## Provider model diagnostic (2026-09-01)

Using the same rehearsal-only API key, REST endpoint, minimal prompt and bounded request timeout:

| Model | HTTP | Error code | Result |
|---|---:|---|---|
| `models/gemini-3.7-flash` | 503 | `UNAVAILABLE` | unavailable during diagnostic |
| `models/gemini-3.6-flash` | 200 | — | minimal generation succeeded |

This classifies the incident as `MODEL_SPECIFIC_CAPACITY_ISSUE_GEMINI_3_7_FLASH`, not a provider-wide
outage. No automatic fallback was added. At the time of this diagnostic the hosted configuration
could not be changed through the connected tooling; the owner subsequently reported setting both
`KNOWLEDGE_GENERATION_MODEL` and `RAG_GENERATION_MODEL` to `models/gemini-3.6-flash`. Embedding
remains `models/gemini-embedding-2` with 768 dimensions.

## Hosted Gemini 3.6 follow-up (2026-09-01)

- **Starting/ending HEAD:** `c3f5b5d4c88d070e23516be5b547b2e1e0ad636a`; no repository code change was
  made during this attempt.
- **Rehearsal guard:** Supabase ref `znexculhbdjiflkczpyu`, project `so-tay-doan-vien-rehearsal`,
  healthy non-production project; Production accessed: **NO**.
- **Hosted functions:** `ask-ai`, `process-document`, and `generate-knowledge-article` were observed
  ACTIVE at hosted version 6 with `verify_jwt=true`. Source/model values are not exposed by the safe
  inventory response.
- **Owner configuration:** owner reported `KNOWLEDGE_GENERATION_MODEL` and
  `RAG_GENERATION_MODEL` set to `models/gemini-3.6-flash`; secret values were not read or printed.
- **Hosted generation smoke:** the first real generation call in
  `npm run test:phase5:runtime` returned HTTP 503 with controlled `PROVIDER_UNAVAILABLE` after the
  bounded retry policy. The edge-function log summary likewise shows `generate-knowledge-article`
  version 6 returning 503. Because the hosted response does not disclose the configured model, the
  3.6 hosted model cannot be independently proven from this run.
- **Runtime progress:** Auth bootstrap (Admin/User A/User B), anonymous `ask-ai` denial (401),
  User A manager-boundary denial, and `process-document` (HTTP 200 with the 768-dimensional embedding
  contract) passed. Generation failure stopped the harness before review, retrieval toggles, Ask AI,
  citation, cross-organization, failure-path, and final cleanup gates.
- **Cleanup:** storage/chunk artifacts from this run were removed and two temporary users were
  removed. Immutable source-linked database history was retained by design; the harness reported
  `database_rows_removed=false` and `orphan_check=BLOCKED_IMMUTABLE_SOURCE`. No force-delete or RLS
  bypass was used.
- **Verdict:** `PHASE_5_RUNTIME_BLOCKED_HOSTED_GENERATION_UNAVAILABLE_503`. Do not claim full runtime
  acceptance until a successful hosted 3.6 generation smoke is observed, then rerun the full harness.
