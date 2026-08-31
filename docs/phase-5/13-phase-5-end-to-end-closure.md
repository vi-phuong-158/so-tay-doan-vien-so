# Phase 5 End-to-End Closure

## Status

`PHASE_5_RUNTIME_ACCEPTANCE_BLOCKED_REHEARSAL_ACCESS_REQUIRED`

Technical CI gates are complete; runtime acceptance is not. This report does not claim production
deployment, rehearsal execution, or a full Phase 5 pass.

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
- Exact-head CI `33414314759` on `70e8e6a`: frontend lint/test/build passed; Supabase reset and
  full pgTAP passed (`Files=27, Tests=815`); `phase_5_article_generation.sql` passed; Deno check
  and Deno test passed (`74 passed, 0 failed`).

## Runtime acceptance blocked

The local environment has no Supabase CLI/Deno binary and no authenticated Supabase
management/runtime connector. Therefore the following must run on the non-production rehearsal
project `znexculhbdjiflkczpyu`, never production:

1. Prove project identity/non-production status, installed migrations, deployed functions and
   server-only secret names without inspecting values.
2. Deploy the changed `ask-ai` function only to rehearsal and verify server-only Gemini secrets are
   configured without inspecting or logging values.
3. Run the synthetic TXT/DOCX/PDF pilot through source registration, extraction, generation,
   review approval and retrieval; verify a citation opens the RLS-authorized canonical document.
4. Run the no-source, cross-organization, duplicate execution, lease expiry, provider timeout and
   cleanup scenarios. Retain only non-sensitive audit evidence.
5. Retain only non-sensitive evidence and remove synthetic artifacts after the rehearsal.

## Production

Production access used: **NO**. Production migration, deploy, secret change, cron change, and test
artifact upload are all out of scope for this closure.
