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

## Phase 3 through P3-05 merged to master

- P3-00 through P3-05 (including P3-03R live rehearsal evidence) are consolidated in `master`
  through integration PR #17, merge commit `2a68f20`.
- The cumulative acceptance lineage remains traceable from P3-00 HEAD `1377265` through
  P3-05 HEAD `df7b9d0`; no feature or business-logic changes were introduced by consolidation.
- Final merged-master CI `31783521687` passed: frontend 45/45, lint 0 errors with 3 existing
  warnings, build PASS, 21 migrations applied by `supabase db reset`, 16 pgTAP suites PASS,
  and Deno 37/37 PASS.
- P3-06, P3-07 and P3-08 remain unimplemented. No scheduler, production deploy, cron enablement,
  or new physical live email send was performed by consolidation.

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
