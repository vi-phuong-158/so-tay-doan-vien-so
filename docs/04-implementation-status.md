# Trạng thái thi công

## Đã làm

- Design tokens, responsive mobile/tablet/desktop.
- Điều hướng 5 khu vực và route chi tiết.
- Component giao diện dùng chung trong App.
- Dashboard cá nhân hóa và dashboard quản trị.
- Luồng nộp báo cáo có chọn tệp, xác nhận, lịch sử phiên bản ở chế độ demo.
- Văn bản, chuyên đề, quiz, AI có thẻ nguồn ở chế độ demo.
- Công trình đổi mới, gửi và theo dõi bài toán ở chế độ demo.
- PWA shell, manifest, service worker.
- Supabase REST/Auth client.
- Migration schema và policy RLS nền tảng.
- Phase 2 report vertical slice đã có production path cho assignment, submit/review/resubmit,
  campaign/template/publish, dashboard, scoped CSV và latest bundle.

## Phase 3 through P3-08 merged to master (P3-09 audit current)

- P3-00 through P3-08 are consolidated in `master`, HEAD `ae679da93cb45fcaa2b562cea8792261b63bc202`
  (merge of PR #21). P3-00 → P3-05 landed via integration PR #17 (`2a68f20`); P3-R1 via PR #19
  (`5665dc4`); P3-06 (cron & overdue automation) via PR #20 (`63d1b7a`); P3-07 (live cron
  rehearsal) is documentation/evidence only, recorded in
  `docs/phase-3/07-live-cron-rehearsal.md`; P3-08 (email worker scheduling + E2E delivery
  rehearsal) via PR #21 (`ae679da`).
- P3-06 installed two trusted in-database `pg_cron` jobs — `report_mark_overdue_daily`
  (`5 17 * * *` UTC) and `report_reminder_scan_daily` (`0 0 * * *` UTC) — calling
  `mark_overdue_assignments()`/`scan_report_reminders()` directly, no HTTP, no secret.
- P3-08 added exactly one further job, `email_queue_worker` (`*/10 * * * *`), which invokes the
  existing `process-email-queue` Edge Function through `pg_net`/`net.http_post`, authenticated
  with the existing `x-cron-secret` header, with the target URL and secret read from Supabase
  Vault at execution time (no secret literal in any migration). No second worker/queue was built.
- CI on the exact merge commit `ae679da` (run `31894178113`) is green. Local environment has no
  Docker/Supabase CLI/Deno (same constraint as every prior Phase 2/3 task), so
  `supabase db reset`/pgTAP/`deno check`/`deno test` results are sourced from that CI run, not
  reproduced locally in this audit.
- `EMAIL_DELIVERY_MODE` remains `OFF` by default and fail-closed (missing/invalid/wrong-case all
  resolve to `OFF`); Production Supabase was not deployed, configured, or touched by any Phase 3
  task, including this audit. Live rehearsal evidence (P3-07B, P3-08A, P3-08B) ran only against a
  separate non-production rehearsal project (`znexculhbdjiflkczpyu`).
- **P3-09 (this audit)** is the current task: final Phase 3 technical acceptance, documentation
  reconciliation, and a production-readiness gap analysis — see
  `docs/phase-3/09-phase-3-final-acceptance.md`. It does not implement new features and does not
  change delivery mode or deploy production.

## Phase 4 — Quiz Engine & Attempts (P4-04, in review)

- Branch `feat/phase-4-quiz-engine`, created from verified P4-03 merged baseline `master@6b1960a`
  (PR #25). This takeover inherited Claude's uncommitted migration/test work in the dedicated
  worktree; no reset or discard was performed.
- Survey confirmed `quizzes`, `quiz_questions`, `quiz_options`, `quiz_attempts`, and `quiz_answers`
  already existed. P4-04 closes the visibility-blind quiz/question policies by delegating to the
  canonical parent-topic access helper, revokes direct attempt/answer writes from `authenticated`,
  and adds trusted `get_quiz_intro`, `start_quiz_attempt`, `get_attempt_questions`,
  `submit_quiz_attempt`, and `get_attempt_result` RPCs.
- Answer-key invariant: normal users cannot SELECT `quiz_options`; the pre-submit RPC payload has
  no `is_correct`; scoring reads the key only inside the trusted submit function. Start numbering
  is protected by an advisory lock plus the existing unique constraint. Forward migration
  `202608160005` rechecks active attempts after locking and rejects malformed/duplicate payloads.
- Frontend vertical slice: `quizService`, `/tri-thuc/trac-nghiem/:quizId`, intro/attempt/result states,
  server-owned score/pass/attempt number and topic-detail quiz links. No quiz admin authoring UI.
- Validation so far: rehearsal project `znexculhbdjiflkczpyu` identity and migration parity verified;
  P4-04 pgTAP `1..65` PASS; frontend `131/131`, lint 0 errors/3 existing warnings, build PASS.
  Full SQL regression found one pre-existing rehearsal-fixture gap: `report_export.sql` expects
  seeded campaign `5555…`, which is absent from the project; the suite passes `1..7` when that
  fixture is inserted inside a rollback-bounded transaction. The other 22 suites pass as-is.
  Supabase CLI/Deno are unavailable locally; exact final CI is still required before PASS.
- Not included: AI/RAG, certificates, leaderboard/gamification, production deployment, or P4-02R.
- See `docs/phase-4/04-quiz-engine-attempts.md`.

## Phase 4 — Learning Foundation (P4-03, merged)

- Branch `feat/phase-4-learning-foundation` from `master@1ceb9e6`; merged into `master@6b1960a` via
  PR #25 before P4-04 started.
- Survey found `learning_topics`/`learning_resources` already present with the full spec field set
  **and an unsafe read policy**: it checked `status='PUBLISHED'` only and ignored `visibility_level`
  entirely, so `ORGANIZATION_ONLY`/`RESTRICTED` topics were readable by any active user. The table
  also had no organization column, so that level could not be enforced at all. `202608160003`
  closes this the same way `202607300003` did for documents.
- Adds: `owner_organization_id` + backfill, https-only `external_url` CHECK, topic-anchored
  `storage_path` CHECK, `can_access_learning_topic`/`can_manage_learning_topic` (fail-closed, both
  granted to `anon` so storage policies deny rather than raise), replacement read policies, admin
  policies, policies for the previously policy-less `learning-resources-private` bucket (no UPDATE
  policy; delete only for unreferenced objects), five audited trusted mutations, `learningService`,
  and the `/tri-thuc/chuyen-de` list + detail routes. Knowledge's topics tab now reads real data.
- Validation: frontend 125/125, lint 0 errors/3 existing warnings, build PASS. pgTAP/Deno in CI.
- Not included: Quiz, AI/RAG, learning admin UI, production deployment.
- See `docs/phase-4/03-learning-foundation.md`.

## Phase 4 — Documents Admin & Storage (P4-02, merged)

- P4-01 merged into `master@4488755` via PR #23.
- P4-02 (branch `feat/phase-4-documents-admin`, **Draft PR #24, not merged**) closes the two gaps
  P4-01 recorded: it opens the minimum Storage **write** authorization for `documents-private`
  (which previously had no INSERT/UPDATE/DELETE policy at all, making the admin upload path
  inoperable), and adds the `/admin/van-ban` administration UI.
- Key invariants: no UPDATE policy (objects are never overwritten in place); DELETE is compensation
  only and cannot remove the currently attached file; `detach_document_source_file` clears the row
  pointer before any bytes are deleted; every mutation goes through a SECURITY DEFINER RPC.
- Validation: frontend 98/98, lint 0 errors/3 existing warnings, build PASS. pgTAP/Deno in CI.
- Runtime rehearsal on the non-production project `znexculhbdjiflkczpyu` confirmed migration
  parity, bucket privacy, deployed policy predicates and fail-closed path handling. The
  actor-based scenarios could not be run (creating test identities was blocked by environment
  permissions) and are recorded as **not executed**, not as passed. A real end-to-end Storage byte
  round-trip therefore remains an open gap.
- See `docs/phase-4/02-documents-admin-storage-rehearsal.md`.

## Phase 4 — Documents Foundation (P4-01, merged)

- Phase 3 closed and merged at `master@814b824` (P3-09 via PR #22).
- P4-00 baseline established that the `documents` model already existed from the initial schema and
  the Phase 1 security fix — P4-01 closes gaps rather than rebuilding it. See
  `docs/phase-4/00-baseline-documents-plan.md`.
- P4-01 (branch `feat/phase-4-documents-foundation`, **Draft PR, not merged**) delivers the Văn bản
  vertical slice: constraints + `document_relations` RLS (previously deny-all with zero policies),
  closed direct write grants, a fail-closed `documents-private` Storage policy, five audited admin
  RPCs, `documentService`, and the `/tri-thuc/van-ban` list + detail routes reading real Supabase
  data instead of `src/data/mock.js`.
- Validation: frontend 66/66, lint 0 errors/3 existing warnings, build PASS. `supabase db reset` +
  pgTAP run in CI only (no Docker/Supabase CLI locally). Runtime Storage upload/download rehearsal
  is **not** performed and is recorded as an open gap.
- Not included: Learning Topics, Quiz, AI/RAG, embeddings, `document_chunks` processing, documents
  admin UI, production deployment.

## Phase 2 technical acceptance

- Baseline P2-14 `bdf0156`: CI PASS (40 frontend, 220 pgTAP, 16 Deno tests).
- P2-15 phát hiện và sửa P1 direct submission RPC bypass; integrated database vertical slice,
  ma trận A–G và Storage verification regression PASS.
- Trạng thái: `Phase 2 — Công việc & Báo cáo: TECHNICAL ACCEPTANCE COMPLETE`.
  Acceptance CI `31411605381`: 40 frontend, 236 pgTAP, 16 Deno tests PASS. Xem
  `docs/phase-2/15-phase-2-final-acceptance.md`.
- Technical acceptance không đồng nghĩa production-ready; rehearsal Supabase, secrets, live Storage,
  backup/restore và monitoring vẫn chưa được xác nhận.

## Chưa thể xác nhận production khi chưa có Supabase project/secrets

- Auth thật và nhập người dùng.
- Upload Storage/signed URL/virus scanning.
- Edge Functions nghiệp vụ và email provider thật.
- Trích xuất tài liệu, pgvector, Gemini embedding/RAG thật.
- Cron, backup/restore và monitoring.
- Test RLS trên rehearsal project.

Không được coi các phần trên là hoàn thành chỉ vì giao diện demo đã hoạt động.
