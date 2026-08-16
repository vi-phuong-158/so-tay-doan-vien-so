# P4-04 — Quiz Engine & Attempts

## Takeover and baseline

- Repository baseline verified: P4-03 merge commit `6b1960a` (`master` at the time P4-04 branch was
  created). Branch: `feat/phase-4-quiz-engine`.
- The branch was already checked out in `.claude/worktrees/phase-3-final-audit-d18279`; no reset,
  clean, checkout-discard, or production action was performed.
- Inherited Claude work: untracked `202608160004_phase_4_quiz_engine_attempts.sql` and
  `supabase/tests/quiz_engine_attempts.sql`. Claude had applied P4-03, P4-04 and seed fixtures to
  the non-production rehearsal before stopping.

## Schema survey and defects

The initial schema already contained `quizzes`, `quiz_questions`, `quiz_options`, `quiz_attempts`,
and `quiz_answers`. P4-04 does not rebuild them.

Two real defects were found:

1. Quiz and question read policies checked active user + published quiz but ignored the parent
   learning topic's status, visibility, and organization. A known quiz/question ID could bypass the
   canonical P4-03 topic access ladder.
2. `authenticated` had direct INSERT/UPDATE grants on `quiz_attempts`, with an own-row INSERT
   policy. A client could therefore submit its own `score`, `passed`, `attempt_number`, and terminal
   timestamps without answering questions. This was a scoring/attempt-lifecycle bypass.

`quiz_options.is_correct` was already protected by the absence of an end-user SELECT policy. P4-04
keeps that protection and adds a safe RPC column list and service-level regression test.

## Database contract

Migration `202608160004_phase_4_quiz_engine_attempts.sql`:

- Adds conservative score, points, attempt-number, lifecycle, time-limit, and max-attempt checks.
- Adds `can_access_quiz()` and `can_manage_quiz_content()` with pinned `search_path`.
- Gates quiz reads through the parent topic access model. Normal users see only PUBLISHED quizzes
  on accessible topics; scoped content admins can preview their own draft content.
- Removes general question/option end-user reads. Admin content policies remain bounded by the
  parent topic scope.
- Revokes direct attempt/answer writes from `authenticated`.
- Adds `get_quiz_intro`, `start_quiz_attempt`, `get_attempt_questions`, `submit_quiz_attempt`, and
  `get_attempt_result`.

Migration `202608160005_phase_4_quiz_submission_hardening.sql` is a forward fix because `202608160004`
was already applied to rehearsal:

- Acquires the transaction advisory lock before reading an active attempt, then rechecks the row;
  concurrent Start requests resume the committed attempt instead of allocating another slot.
- Preserves the unique `(quiz_id, user_id, attempt_number)` backstop.
- Rejects non-object/non-array payloads, malformed UUIDs, duplicate questions, invalid foreign
  options, and multiple selections for SINGLE questions before inserting answer rows.
- Normalizes selected option IDs as a set and maps malformed JSON errors to stable business codes.

## Attempt lifecycle and scoring

The lifecycle is `started_at IS NOT NULL AND submitted_at IS NULL` → finalized when
`submitted_at`, `score`, and `passed` are set together. Start is server-owned and binds
`user_id = auth.uid()`.

- Resume: an unexpired active attempt is returned unchanged. An expired abandoned row counts toward
  `max_attempts`; a fresh attempt is allowed only if the count is below the limit.
- Time limit: expiry is computed from server `started_at + time_limit_minutes`; browser countdown is
  informational only. Submission at/after expiry fails `ATTEMPT_EXPIRED` and writes nothing.
- Scoring: SINGLE requires one selected option; MULTIPLE is supported. A question is correct iff the
  selected option set equals the server answer-key set. No partial credit. Score is
  `round(earned_points / total_question_points * 100, 2)`; `passed` is `score >= pass_score`.
- Double submit: row lock makes the first successful submit authoritative; later requests return
  `ATTEMPT_ALREADY_SUBMITTED` and cannot add answer rows or change the score.
- Atomicity: validation, server scoring, answer inserts, final attempt update, and audit insert run
  inside one database function call/transaction. Any error rolls back answer rows and finalization.

## Frontend vertical slice

- `src/services/quizService.js` exposes only safe metadata and RPC boundaries: list quizzes, intro,
  start, safe questions, submit, and own result.
- `src/pages/Quiz.jsx` wires `/tri-thuc/trac-nghiem/:quizId` with loading, unavailable/unauthorized,
  intro, attempt, resume, max-attempt, expiry, submit-in-progress, duplicate-click, error, and
  result states.
- Learning topic detail links available quizzes to the real route. No quiz mock data is used by the
  production path and no admin authoring UI is introduced.

## Acceptance matrix and validation

`supabase/tests/quiz_engine_attempts.sql` covers A–Z: access/visibility, suspended/anon fail-closed,
answer-key protection, ownership, numbering, lock/unique backstop, max attempts, foreign IDs,
client score/pass rejection, exact scoring/pass-fail, cross-user isolation, double submit,
expiry, atomic failure, successful answer rows, bounded admin mutation, and SECURITY DEFINER grants.
It also covers malformed JSON, duplicate questions, and invalid SINGLE selections.

Verified against rehearsal project `znexculhbdjiflkczpyu` (`so-tay-doan-vien-rehearsal`, healthy,
PostgreSQL 17; production not used):

- Migration history contains `202608160004` and `202608160005`.
- pgTAP P4-04: `1..65` PASS.
- Frontend tests: `131/131` PASS.
- Lint: 0 errors, 3 pre-existing Fast Refresh warnings.
- Build: PASS.
- Full SQL regression: 22 suites pass against the rehearsal as-is. The existing
  `report_export.sql` suite needs the repository seed campaign `5555…`; it passes `1..7` when
  that fixture is created inside a rollback-bounded transaction. No persistent seed or auth data
  was written to the rehearsal.
- `git diff --check`: PASS.
- Supabase CLI and Deno are not installed locally; full migration reset, Deno gates, and exact final
  CI remain required before declaring PASS.
- Branch `feat/phase-4-quiz-engine` is pushed at commit `61989d4`; Draft PR creation was attempted
  through the connected GitHub integration and rejected with HTTP 403, so no PR/CI status is claimed.

## Risks and follow-up

- Real two-connection concurrency was not executable through the available local toolchain; the
  database-level advisory lock + unique constraint is covered structurally and the resume race is
  fixed in the forward migration. CI/rehearsal should add a two-session stress check when available.
- Quiz content authoring UI is intentionally deferred to P4-05.
- P4-02R remains **PENDING**.
- No AI/RAG, certificates, leaderboard, gamification, Innovation work, production deployment, or
  P4-02R workaround was performed. P4-04 is not merged.
