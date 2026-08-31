# Phase 5 End-to-End Closure

## Status

`PHASE_5_IMPLEMENTATION_READY_EXACT_HEAD_CI_AND_RUNTIME_REHEARSAL_PENDING`

This report records the forward implementation and the gates that remain unproven. It does not
claim production deployment, runtime acceptance, or a full Phase 5 pass.

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

## Technical validation completed locally

- `npm test`: 146 passed, 0 failed.
- `npm run lint`: 0 errors; 3 pre-existing Fast Refresh warnings.
- `npm run build`: passed.
- `git diff --check`: passed.

## Required gates still blocked

The local environment intentionally has neither Supabase CLI nor Deno, and no connected Supabase
management/runtime tool is available. Therefore the following must run on the non-production
rehearsal project `znexculhbdjiflkczpyu`, never production:

1. Apply/replay the forward migration and run `supabase test db` plus Deno check/test on the exact
   closure head.
2. Deploy the changed `ask-ai` function only to rehearsal and verify server-only Gemini secrets are
   configured without inspecting or logging values.
3. Run the synthetic TXT/DOCX/PDF pilot through source registration, extraction, generation,
   review approval and retrieval; verify a citation opens the RLS-authorized canonical document.
4. Run the no-source, cross-organization, duplicate execution, lease expiry, provider timeout and
   cleanup scenarios. Retain only non-sensitive audit evidence.
5. Push the closure branch and use CI for the exact final head before updating the canonical PR.

## Production

Production access used: **NO**. Production migration, deploy, secret change, cron change, and test
artifact upload are all out of scope for this closure.
