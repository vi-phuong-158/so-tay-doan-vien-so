-- Phase 4 deliberately routes quiz questions and answer options through attempt RPCs.
-- The Public-First migration added an anon question policy, but the Phase 4 table grant remains
-- revoked. Keep that intentional deny explicit instead of leaving a misleading, dead policy.

drop policy if exists "anon reads questions for public quizzes" on public.quiz_questions;
revoke select on table public.quiz_questions from anon;
revoke select on table public.quiz_options from anon;
