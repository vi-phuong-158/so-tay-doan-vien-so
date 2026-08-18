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

---

# Working log — 17/08/2026 — P5-01 Knowledge Schema + RLS

- **Kết quả:** `P5_01_PASS` (technical acceptance). Chưa production, không gọi AI provider nào.
- **Migration:** `202608170001_phase_5_knowledge_foundation.sql` (~810 dòng). 8 bảng mới, 5 cột mới
  trên `documents`, refactor `document_chunks` → selective evidence, sửa PK `ai_message_sources`,
  7 trigger bất biến, 1 helper `SECURITY DEFINER`, RLS đầy đủ, least-privilege grants, 18 index.
- **Bất biến quan trọng nhất:** trục ingestion tách khỏi trục xuất bản Phase 4. Trigger
  `trg_documents_state_axis_separation` khiến một ingestion thất bại **không thể** đổi
  `documents.status` — tức là không thể âm thầm làm một văn bản đã phát hành biến mất.
- **Hai defect đã đóng:** cột chết `document_chunks.visibility_level` (không policy nào đọc) đã xóa;
  PK `ai_message_sources` chứa `chunk_id` nullable khiến citation ở mức Wiki/tài liệu là bất khả thi
  — đã chuyển sang surrogate `id`. Lưu ý: `drop constraint ..._pkey` **không** gỡ `NOT NULL` ngầm,
  bản sửa đầu tiên vì thế chỉ là hình thức và bị chính test bắt được.
- **Grants:** đóng over-grant INSERT/UPDATE/DELETE cho `authenticated` trên `document_chunks`,
  `ai_messages`, `ai_message_sources` (từ `202607300001`, trước nay chỉ RLS chặn). Giữ nguyên
  `ai_conversations`/`ai_feedback` vì đó là dữ liệu của chính người dùng.
- **Deviation so với P5-00 (đã ghi vào `docs/brain/03-decisions.md`):** hoãn xóa
  `document_chunks.embedding` + `match_document_chunks()` sang P5-05 vì test đã nghiệm thu còn dùng;
  không siết CHECK `effect_status` (free text của UI Phase 4) mà thêm cột `effect_state`.
- **Validation:** harness Postgres cục bộ (không có Docker/Supabase CLI) — reset 31 migration + seed
  OK, idempotent. pgTAP 26 file / 828 assertion; khác baseline đúng một dòng (file mới, 101
  assertion PASS) ⇒ không hồi quy Phase 4. Frontend 136/136, lint 0 error, build PASS. Deno không
  chạy được (deno.land bị proxy chặn); P5-01 không sửa TypeScript.
- **Báo cáo đầy đủ:** `docs/phase-5/08-p5-01-knowledge-schema.md`.

---

# Working log — 18/08/2026 — P5-02 Ingestion Foundation + Storage Provider Amendment

- **Baseline:** PR #31 remains Draft/Open at accepted `84ba48e`; implementation is stacked in
  `codex/phase-5-02-ingestion-foundation`, keeping the original dirty workspace untouched.
- **Storage:** Phase 5 pilot sources gain a provider-neutral locator. Google My Drive is only an
  external private blob provider; Supabase keeps identity/RLS/provenance. P4 `documents-private`
  remains unchanged, and no OAuth credential or public Drive link was added.
- **Implementation:** forward migration `202608180001` adds source provider fields, atomic source
  trigger/idempotency, service-role claim/lease/retry/reclaim functions, append-only safe events and
  Vault-named `pg_cron` schedule. `run-ingestion-jobs` is an authenticated NO_OP lifecycle worker.
- **Deferred:** Google OAuth, real Drive read, extraction, Gemini, Wiki, evidence and embeddings;
  P5-03 is blocked on a backend-only My Drive runtime rehearsal.
