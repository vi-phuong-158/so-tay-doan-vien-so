# P4-05 — Learning & Quiz Admin Workflow

## Scope

P4-05 adds the smallest complete administration vertical slice:

`Topic → Resource → Quiz → Questions → Options → Publish`

Routes:

- `/admin/chuyen-de`
- `/admin/chuyen-de/:topicId`
- `/admin/chuyen-de/:topicId/trac-nghiem/:quizId`

The UI is guarded for `YOUTH_ADMIN`; the existing `SYSTEM_ADMIN` bypass in `RoleGuard` remains
available. No AI/RAG, certificates, leaderboard, production deployment, or runtime rehearsal gate
is included.

## Trusted database contract

Migration `202608160006_phase_4_learning_quiz_admin.sql` adds bounded admin reads and trusted
mutations. Every function checks active account and organization scope again inside PostgreSQL,
then writes an audit row for important changes. The frontend never writes the quiz tables directly.

Admin read functions:

- `get_admin_learning_topics`, `get_admin_learning_topic`, `get_admin_learning_resources`
- `get_admin_quizzes`, `get_admin_quiz_authoring`

Trusted mutations include topic status hardening, resource reorder, quiz draft/metadata/status,
question and option upsert/delete, and exact-set reorder functions. Direct authenticated
`INSERT/UPDATE/DELETE` on `quizzes`, `quiz_questions`, and `quiz_options` is revoked. Direct
authenticated `SELECT` on questions/options is also revoked, preserving the pre-submit answer-key
boundary.

`get_admin_quiz_authoring` is intentionally the only new read surface that returns
`quiz_options.is_correct`, and it is scope-checked before returning any row.

## Publication and historical-attempt policy

Publishing a quiz is server-validated: title and scoring bounds are valid; at least one question
exists; every question has text and positive points; every question has at least two options; a
`SINGLE` question has exactly one correct option; a `MULTIPLE` question has at least one correct
option.

After a submitted attempt exists:

- question and option rows are immutable;
- pass score, time limit, max attempts, and shuffle flags are immutable;
- title and description may receive cosmetic edits;
- a corrected assessment must be created as a new quiz.

This preserves the answer-key interpretation used by historical `quiz_answers` and keeps audit
records meaningful.

## Frontend boundary

`learningAdminService.js` owns topic/resource RPCs and upload compensation under the private
`learning-resources-private` bucket. `quizAdminService.js` owns all quiz authoring RPC calls and
maps the admin-only answer key shape. End-user `learningService.js` and `quizService.js` remain
separate and safe; they do not import admin services.

## Validation

The branch must pass:

- frontend unit/contract tests, including service-boundary and answer-key regressions;
- `npm run lint` with zero errors (three pre-existing Fast Refresh warnings remain);
- `npm run build`;
- Supabase reset/full pgTAP and Deno CI gates;
- `git diff --check` and secret audit.

Open gates carried forward: P4-02R Documents Storage actor rehearsal and P4-04R2 real two-session
quiz concurrency rehearsal. Neither is substituted by structural SQL assertions.

