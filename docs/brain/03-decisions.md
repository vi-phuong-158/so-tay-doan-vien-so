# 03 — Technical Decisions

> Ghi lại quyết định kỹ thuật quan trọng để agent sau không "phát minh lại" hoặc đảo ngược
> mà không biết lý do. Nguồn gốc: `docs/07-decisions.md`, README, lịch sử git, `docs/phase-2/`.

---

## [2026-07-30] Tách khỏi runtime Apps Script cũ, chuyển sang Supabase

- **Quyết định:** Dựng dự án mới trên React/Vite + Supabase (Auth/Postgres/RLS/Storage/Edge
  Functions/pgvector) + Gemini + email giao dịch. Loại bỏ Google Apps Script, Google Sheets/Drive
  làm hạ tầng chính, Pinecone, API `/api/gas`, cơ chế access code của "Trợ lý 35".
- **Lý do:** Hạ tầng cũ không đảm bảo phân quyền/bảo mật và khó mở rộng cho nghiệp vụ báo cáo/RAG.
- **Đánh đổi:** Phải viết lại `App.jsx`, điều hướng, tầng API; chỉ tái sử dụng có chọn lọc
  (ErrorBoundary, Skeleton, markdown sanitizer, một phần CSS, cách lazy-load).
- **Người quyết định:** user (đặc tả thi công v1.0).

## [2026-07-30] Router thật, mỗi nội dung một URL

- **Quyết định:** Dùng React Router (`react-router-dom` 7, `BrowserRouter`) thay custom history
  router; mỗi nội dung có URL riêng, chia sẻ được, mở đúng từ email/thông báo.
- **Lý do:** Email nhắc hạn và thông báo phải deep-link đến đúng báo cáo/tài liệu.
- **Đánh đổi:** Cần SPA rewrite ở host (`vercel.json`).
- **Người quyết định:** user / triển khai frontend.

## [2026-07-30] Ranh giới secret: service role chỉ ở backend

- **Quyết định:** Frontend chỉ giữ anon key + access token. Service role key, Gemini key, email
  secret chỉ nằm trong Edge Functions / Supabase Secrets. Không dùng `VITE_*` cho secret.
- **Lý do:** Bất kỳ biến `VITE_*` nào cũng lộ ra bundle client.
- **Đánh đổi:** Mọi thao tác đặc quyền phải đi qua Edge Function/RPC, không gọi trực tiếp từ FE.
- **Người quyết định:** user (nguyên tắc bảo mật).

## [2026-07-30] Báo cáo nộp lại tạo phiên bản mới (versioned, immutable)

- **Quyết định:** Mỗi lần nộp là một `report_submissions` với `version_number`; phiên bản cũ chỉ
  đọc, không ghi đè tệp. Chỉ nộp lại khi đợt cho phép hoặc admin yêu cầu bổ sung.
- **Lý do:** Giữ vết lịch sử nộp phục vụ đối soát/nghiệm thu.
- **Đánh đổi:** Tốn storage hơn; cần RPC `create_report_submission` để đảm bảo đánh số nguyên tử.
- **Người quyết định:** user (đặc tả nghiệp vụ báo cáo).

## [2026-07-30] Tệp private + signed URL ngắn hạn

- **Quyết định:** Bucket nghiệp vụ đặt private; mở tệp qua signed URL thời hạn ngắn; backend kiểm
  lại loại/kích thước tệp, chuẩn hóa tên, chặn phần mở rộng nguy hiểm.
- **Lý do:** Tránh lộ tệp qua URL đoán trước; không tin `mime_type` từ trình duyệt.
- **Đánh đổi:** Không cache tĩnh đơn giản cho tệp private.
- **Người quyết định:** user.

## [2026-07-30] Quiz không lộ đáp án; AI chỉ dùng chunk APPROVED

- **Quyết định:** `is_correct` không trả về frontend trước khi chấm. Trợ lý AI chỉ truy hồi
  `document_chunks` ở trạng thái `APPROVED` và luôn kèm nguồn.
- **Lý do:** Chống gian lận trắc nghiệm; chống AI "bịa" nội dung thành quy định.
- **Đánh đổi:** Cần chấm điểm phía server và duyệt chunk trước khi AI dùng.
- **Người quyết định:** user.

## [~2026-08] Phase 1 — khắc phục bảo mật auth (Supabase Auth thuần)

- **Quyết định:** `requireUser` dùng `userClient.auth.getUser(token)` thuần với Bearer token; gỡ
  dummy credential; vá lỗ hổng `npm audit`. Seed điền đủ cột GoTrue cho `auth.users`/`auth.identities`.
- **Lý do:** Xác thực token đúng chuẩn GoTrue; loại rủi ro bảo mật còn sót.
- **Đánh đổi:** Seed local nhạy cảm với schema GoTrue — sửa seed phải cẩn thận.
- **Người quyết định:** user + triển khai (PR #1, branch `fix/phase-1-security-remediation`).
- **Tham chiếu:** `docs/phase-1-implementation-report.md`.

## [2026-08-09] Core RPC nộp báo cáo là nội bộ

- **Quyết định:** Thu hồi `EXECUTE` của `authenticated` trên `create_report_submission(uuid,text,text)`; chỉ `create_report_submission_with_files` là RPC có thể gọi bởi người dùng đã xác thực.
- **Lý do:** RPC lõi không buộc contract file nên cho phép bypass đường production đã xác minh Storage; wrapper gọi lõi trong transaction với `SECURITY DEFINER`.
- **Đánh đổi:** pgTAP lifecycle phải đi qua wrapper với fixture file; mọi caller tương lai phải dùng Edge Function `submit-report` hoặc wrapper đã kiểm soát.
- **Người quyết định:** Codex, theo P2-06 handoff security gate.

## [2026-08-09] Storage policy dùng helper khi phải tra bảng protected

- **Quyết định:** Policy `storage.objects` kiểm template gọi `can_read_report_template(uuid)` thay vì truy vấn trực tiếp `report_assignments`.
- **Lý do:** PostgreSQL không bảo đảm thứ tự đánh giá nhánh policy; một truy vấn anon vào bucket khác có thể chạy nhánh tra bảng và raise `permission denied` thay vì RLS deny.
- **Đánh đổi:** Thêm helper `SECURITY DEFINER` boolean với `search_path` cố định; helper không trả dữ liệu, chỉ xét account active, assignment cùng org hoặc role admin.
- **Người quyết định:** Codex, theo CI P2-06.

## [2026-08-09] Frontend upload báo cáo dùng path staging, không tự cấp version

- **Quyết định:** `reportService` upload object theo `{campaign}/{organization}/{assignment}/staging/{uuid}-{safe-name}` và chỉ finalize qua Edge Function `submit-report`.
- **Lý do:** `version_number` được database cấp nguyên tử khi finalize, còn Edge Function/Storage policy hiện chỉ yêu cầu prefix theo campaign/org/assignment. Tự đoán `v{n}` ở browser có race và không phải contract backend bắt buộc.
- **Đánh đổi:** Object trong submission hiện giữ path staging thay vì tên versioned; chưa có cleanup/reconciliation cho upload bị bỏ dở. P2-09 hoặc hardening sau cần xử lý UX/vòng đời các object đó.
- **Người quyết định:** Codex, theo P2-07 report service layer và contract Phase 2A hiện có.

## [2026-08-09] Cleanup staging chỉ xóa exact object chưa finalize

- **Quyết định:** Cho phép frontend gọi `reportService.removeStagedReportFile(path)` qua Storage DELETE RLS; policy gọi helper `can_delete_report_staged_file` để kiểm uploader, account ACTIVE/BRANCH_OFFICER, organization/assignment/path hợp lệ và `NOT EXISTS report_submission_files(storage_path = path)`.
- **Lý do:** Object đã finalize có thể vẫn giữ `/staging/`; không thể dùng tên path đơn thuần để quyết định xóa.
- **Đánh đổi:** Thêm migration forward-only và chưa có garbage collection cho session bỏ dở; cleanup chỉ xảy ra khi user explicit remove/reset.
- **Người quyết định:** Codex, theo P2-09 cleanup invariant C1–C7.

---

## Template cho entry mới

```
## [YYYY-MM-DD] Tiêu đề quyết định

- **Quyết định:** <mô tả>
- **Lý do:** <vì sao chọn hướng này>
- **Đánh đổi:** <cái gì bị đánh đổi>
- **Người quyết định:** <user / Claude / Codex>
```
