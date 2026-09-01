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

## Security advisor classification

The rehearsal security advisor returned existing INFO `rls_enabled_no_policy` notices for internal
queue/audit/embedding tables and existing WARN mutable-search-path and authenticated SECURITY
DEFINER notices across legacy RPCs. These are pre-existing project-wide findings, not introduced by
the two Phase 5 migrations; the Phase 5 retrieval RPC contract was verified explicitly and no
high-confidence new Phase 5 issue was found. No advisor remediation was applied in this closure.

## Production

Production access used: **NO**. Production migration, deploy, secret change, cron change, and test
artifact upload are all out of scope for this closure.
