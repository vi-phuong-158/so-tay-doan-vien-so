# Trạng thái thi công

## SOTAY_UI_FINAL_CLOSURE — MERGED (2026-09-23)

- Starting master: `2095ebb98c572f10a5b04a08396e3e3569fb1271` (PR #54 đã merge).
- PR #57 exact audited head `0050f40357b9091d082971659aa37f84378dfdaf` merged via merge commit
  `2f0336a8784a4c0610543b20aa704a6e90182423`.
- Local source gates: 205/205 tests, lint 0 errors/3 existing Fast Refresh warnings, build PASS
  (520.68 kB main chunk warning), `git diff --check` PASS. Exact-head CI run `35829383771` passed
  build, test-db, member-api-test, Vercel Preview and Preview Comments.
- Post-merge CI run `35829761261` on `2f0336a` passed build, test-db/Deno and member-api-test;
  Vercel deployment status is SUCCESS.
- Guest browser evidence: 30 route patterns × 5 viewports (150/150); no blank surface, horizontal
  overflow, visible text below 11px or interactive target below 44px. Ask AI no-evidence and
  Public-First/auth-on-demand rehearsal passed. Authenticated product journeys remain blocked by
  missing authorized role/session and hosted Member API; see `docs/ui-final-closure/`.
- PR #51 is closed as historical docs-only evidence. Hosted Mắt Bão/Member API production
  acceptance remains pending; Phase 6 is not open.
- Owner readiness and the next P5.5 acceptance matrix are prepared in
  `docs/phase-5-5/05-hosted-runtime-readiness-checklist.md`.

## P5.5 — End-to-End Final Closure (2026-09-18)

- Base `master@7f468a5111df54486f7e98688b4c16057668a519`; PR #51 được giữ làm historical
  artifact, không merge thêm. Closure branch áp dụng public-first auth: Home/public shell và các
  route dữ liệu thật hiển thị login on demand qua `AuthGuard`.
- Local source gates: root `200/200`, targeted Member API `73/73`, lint `0 errors`, build PASS.
  Full Member API local chưa thể kết luận PASS do thiếu `MEMBER_DATABASE_URL` và `exceljs` chưa
  cài được vì Windows npm cache trả `EPERM`; CI artifact vẫn có full Member API `273/273`.
- Supabase rehearsal/security hardening và CI test-db/Deno evidence giữ nguyên; không có mutation
  mới trong vòng này. Mắt Bão, hosted Member API, authenticated browser và hosted backup/restore
  vẫn chưa provision/chưa chạy.
- Verdict: `PHASE_5_5_END_TO_END_ACCEPTANCE_BLOCKED_MATBAO_RUNTIME_NOT_PROVISIONED`. Phase 6 chưa
  được mở.

## Đã làm

- Design tokens, responsive mobile/tablet/desktop.
- Điều hướng 5 khu vực và route chi tiết.
- Component giao diện dùng chung trong App.
- Dashboard cá nhân hóa và dashboard quản trị.
- Luồng nộp báo cáo có chọn tệp, xác nhận và lịch sử phiên bản qua `reportService`/backend hiện hữu.
- Văn bản, chuyên đề, quiz và AI dùng service/RPC/Edge Function hiện hữu, có loading/empty/error states.
- Công trình đổi mới đọc danh sách công khai; gửi bài toán vẫn được để ngoài scope closure này và chưa nối UI với Edge Function.
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

## Phase 4 — Integrated final acceptance (P4-06, technical acceptance passed; runtime gates pending)

- P4-05 was reverified on exact implementation HEAD `1706f064980ffe73150a71649b91d66807d25f71`;
  replacement CI `31959883659` passed, and PR #27 was merged into `master` at
  `3761dcc1be4fd6aebc1e91e78426076feead5e31`. Fresh `origin/master` matches that merge SHA.
- Audit branch `audit/phase-4-final-acceptance` adds the rollback-bounded integrated database
  acceptance suite `supabase/tests/phase_4_final_acceptance.sql` and the Phase 4 traceability,
  security, journey, runtime-gate, and production-readiness report
  `docs/phase-4/06-phase-4-final-acceptance.md`.
- Final verdict: `PHASE_4_TECHNICAL_ACCEPTANCE_PASS_RUNTIME_GATES_PENDING`. Exact-head CI
  `31960895746` is green on `69096639eb6c88e2d5a51e65045844e4f8c15501`: pgTAP `Files=25,
  Tests=727`, Deno `42 passed`, frontend gates and Vercel pass. P4-02R and P4-04R2 remain
  pending; production readiness remains `NOT_PRODUCTION_READY`.
- P4-06 is not to be merged automatically and no Phase 5 work is included.

## Phase 4 — Learning & Quiz Admin (P4-05, merged; technical acceptance passed)

- Branch `feat/phase-4-learning-quiz-admin` starts from merged P4-04 baseline
  `master@3ddfeaede1b7a22acb36c34d3847a394a7cb2f1d`.
- Implements the minimal Topic → Resource → Quiz → Questions → Options → Publish workflow.
  Admin reads use bounded RPCs; all quiz authoring writes use trusted RPCs; direct authenticated
  quiz/question/option DML and question/option SELECT are revoked.
- Historical policy: submitted attempts freeze answer-key rows and scoring-affecting metadata;
  cosmetic title/description edits remain allowed and corrections require a new quiz.
- Exact-head CI run `31959883659` passed on implementation HEAD
  `1706f064980ffe73150a71649b91d66807d25f71` (frontend build/lint/test, Supabase reset + full
  pgTAP/Deno). PR #27 was merged at `master@3761dcc1be4fd6aebc1e91e78426076feead5e31`.
  P4-02R and P4-04R2 remain open.

## Phase 4 — Quiz Engine & Attempts (P4-04, merged)

- Branch `feat/phase-4-quiz-engine`, created from verified P4-03 merged baseline `master@6b1960a`
  (PR #25), merged through PR #26 at `master@3ddfeaede1b7a22acb36c34d3847a394a7cb2f1d`.
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
- Exact acceptance CI run `31956104175` PASS on the PR HEAD (build, test-db/full pgTAP+Deno,
  Vercel). P4-04R2 real two-session concurrency remains PENDING.
- Not included: AI/RAG, certificates, leaderboard/gamification, production deployment, P4-02R or
  P4-04R2.
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
