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
  campaign/template/publish, dashboard, scoped CSV và latest bundle; final acceptance đang chờ CI.

## Phase 2 technical acceptance

- Baseline P2-14 `bdf0156`: CI PASS (40 frontend, 220 pgTAP, 16 Deno tests).
- P2-15 phát hiện và sửa P1 direct submission RPC bypass; thêm integrated database vertical slice
  và Storage verification regression.
- Trạng thái: `ACCEPTANCE CANDIDATE — CI PENDING`. Xem
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
