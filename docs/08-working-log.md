# Working log — 30/07/2026

- Tách frontend khỏi repo `baovenentang` và loại bỏ API `/api/gas`.
- Thiết kế lại toàn bộ 5 khu vực theo DESIGN.md.
- Tạo các route nghiệp vụ, PWA shell và dữ liệu demo.
- Tạo Supabase schema, RLS, Storage buckets, RPC phiên bản báo cáo và trạng thái bài toán.
- Tạo Edge Functions chính: submit/review báo cáo, reminder/email queue, AI, xử lý tài liệu, bài toán đổi mới, export và ZIP.
- Chạy unit test nền tảng: 3/3 pass.
- Chưa chạy build do môi trường thi công không tải được package từ registry; đã kiểm tra cú pháp JSX bằng TypeScript parser.
- Chưa chạy migration/RLS trên Supabase rehearsal vì chưa có project và secret của người dùng.

---

# Working log — 17/08/2026 — P5-00 AI/RAG Architecture & Audit

- **Loại task:** architecture + audit + decision. Không implementation. `NO_RUNTIME_CODE_CHANGED`.
- **Baseline:** branch `claude/phase-5-rag-audit-0sfm7y`, HEAD = `master` =
  `343547cb5a81d5e1e69cea26a6a232c990e8c92b`, working tree sạch, không stash, không untracked.
- **Sai lệch so với giả định task:** không có "uncommitted Phase 5 work" nào trong worktree. Phần
  đó đã được commit (`ecb5dbf`) và merge qua PR #30, và chỉ gồm một file tài liệu. Không có gì bị
  mất, không cần worktree phụ.
- **Phát hiện chính:** code Phase 5 thật là `supabase/functions/ask-ai` và `process-document`, tồn
  tại từ `9f01b37 chore: initial commit`, chưa từng review/test/deploy. Audit tìm 10 vấn đề, trong
  đó 3 nghiêm trọng (ghi xuyên hội thoại qua service role; kiểm quyền toàn cục thay vì theo scope
  tổ chức; nhận nội dung từ client ghi dưới danh nghĩa văn bản chính thức). Kết luận: **DROP** cả
  hai, viết lại ở P5-02/P5-03/P5-06.
- **Kiến trúc đã chốt:** Canonical Source (bất biến, có version + checksum) → Knowledge Wiki (AI
  soạn, người duyệt, là retrieval layer chính) → Evidence chọn lọc → embedding là chỉ mục thứ cấp,
  chỉ sinh sau khi `PUBLISHED`. Retrieval hybrid: quyền trước, exact/metadata trước, vector sau
  cùng. Không runtime fetch Internet.
- **Tài liệu:** `docs/phase-5/01-...` đến `07-...`; quyết định D1–D10 ở `07-...` §4.
- **Validation:** không sửa code runtime; vẫn chạy lint/test/build để chứng minh baseline nguyên
  vẹn. Không chạy migration, không gọi AI provider, không đụng production.
