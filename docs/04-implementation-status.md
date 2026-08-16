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

## Phase 4 — Documents Foundation (P4-01, in review)

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
