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
