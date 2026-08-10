# 06 — AI Working Log

> Nhật ký các lần AI (Claude Code / Codex) sửa code. Mỗi agent PHẢI thêm entry sau mỗi lần
> chạm vào code. Đọc ngược từ trên xuống để biết gần đây ai đã làm gì và vì sao.

---

## Format entry

```
## [YYYY-MM-DD] [Tên task ngắn gọn]
- **Agent:** Claude Code | Codex
- **Thay đổi:** <mô tả ngắn những gì đã làm>
- **File đã sửa:** <danh sách file>
- **Lý do:** <vì sao cần thay đổi>
- **Kiểm tra:** <cách xác minh hoạt động đúng>
```

---

## [2026-08-09] P2-09 upload and submit report

- **Agent:** Codex
- **Thay đổi:** Thêm file picker/UX validation, upload staging theo service, cleanup exact-path qua Storage RLS, confirmation submit, refresh assignment sau success/error và sửa notification route sang assignment ID; thêm migration/helper pgTAP C1–C7 và test contract.
- **File đã sửa:** `src/pages/ReportAssignmentDetail.jsx`, `src/lib/reportDisplay.mjs`, `src/services/reportService.js`, `supabase/migrations/202608090007_phase_2_report_staging_cleanup.sql`, `supabase/tests/report_staging_cleanup.sql`, `supabase/functions/submit-report/index.ts`, `supabase/functions/submit-report/contract.ts`, `supabase/functions/submit-report/contract.test.ts`, `tests/report_service.test.mjs`, `tests/report_ui.test.mjs`, `docs/phase-2/09-report-upload-submit.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thiện luồng upload → verify server → finalize atomic mà không bypass RPC/Storage authorization; bảo vệ file finalized khỏi cleanup nhầm.
- **Kiểm tra:** `npm.cmd test` PASS (26/26); `npm.cmd run lint` PASS (0 error, 3 warning Fast Refresh có sẵn); `npm.cmd run build` PASS. DB/Deno local bị chặn vì môi trường không có Supabase CLI/Deno, cần CI rehearsal xác nhận migration và Edge Function.

---

## [2026-08-09] P2-08 report list and detail UI

- **Agent:** Codex
- **Thay đổi:** Thay mock Work bằng assignment data từ `reportService`, thêm status tabs/counts, loading/empty/error/retry state, assignment detail route và template download signed URL on-demand.
- **File đã sửa:** `src/pages/Work.jsx`, `src/pages/ReportAssignmentDetail.jsx`, `src/App.jsx`, `src/lib/reportDisplay.mjs`, `tests/report_ui.test.mjs`, `docs/phase-2/08-report-list-detail-ui.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thành P2-08 read-only UI trên contract P2-07; không upload, submit, version history hoặc admin.
- **Kiểm tra:** `npm.cmd test` PASS (23/23); `npm.cmd run lint` PASS (0 error, 3 warning Fast Refresh có sẵn); `npm.cmd run build` PASS.

---

## [2026-08-09] P2-07 report service layer

- **Agent:** Codex
- **Thay đổi:** Thêm factory service báo cáo có query RLS, mapper dữ liệu, upload private Storage bằng staging path, gọi Edge Function `submit-report`, signed URL ngắn hạn qua client Storage và lỗi chuẩn hóa; thêm test hành vi và tài liệu integration/contract.
- **File đã sửa:** `src/services/reportService.js`, `tests/report_service.test.mjs`, `docs/phase-2/07-report-service-layer.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Chuẩn bị boundary frontend dùng đúng contract Phase 2A cho P2-08/P2-09/P2-10 mà không cho phép bypass RLS, RPC lõi hoặc UI mock hiện hữu.
- **Kiểm tra:** `npm.cmd test` PASS (18/18); `npm.cmd run lint` PASS (0 error, 3 warning Fast Refresh có sẵn); `npm.cmd run build` PASS.

---

## [2026-08-09] P2-06 security test gate

- **Agent:** Codex
- **Thay đổi:** Đóng quyền gọi trực tiếp RPC lõi nộp báo cáo; sửa policy Storage template để fail-closed khi `anon` evaluation; chuyển pgTAP lifecycle sang wrapper có file/path versioned và thêm test âm cho bypass quyền RPC; lập báo cáo nghiệm thu Phase 2A.
- **File đã sửa:** `supabase/migrations/202608090005_phase_2_close_core_submission_rpc.sql`, `supabase/migrations/202608090006_phase_2_storage_policy_privilege_fix.sql`, `supabase/tests/report_submission_atomicity.sql`, `docs/phase-2/06-phase-2a-acceptance.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Đường production bắt buộc qua finalize có file; RPC lõi không được là public/authenticated contract.
- **Kiểm tra:** Local `npm ci`, `npm run lint`, `npm test`, `npm run build`; CI run `31301926693`: build PASS, Supabase reset + 129 pgTAP PASS, Deno check PASS, Deno test 7/7 PASS.

---

## [2026-08-09] Khởi tạo bộ não dự án (AI project brain)

- **Agent:** Claude Code
- **Thay đổi:** Tạo `docs/brain/00-06` và `CLAUDE.md`; hợp nhất `AGENTS.md` cũ vào cấu trúc brain
  mới (giữ nguyên 10 quy tắc dự án). Điền nội dung thật từ `docs/01-08`, source `src/`, và
  `supabase/functions/`. Dựng **Code Graph** frontend + backend từ việc đọc import/route/edge fn.
- **File đã tạo/sửa:** `CLAUDE.md`, `AGENTS.md`, `docs/brain/00-project-overview.md` →
  `docs/brain/06-ai-working-log.md`.
- **Lý do:** Thiết lập ngữ cảnh + quy tắc dùng chung để mọi agent đọc trước khi code, không "code mù".
- **Kiểm tra:** Các file tồn tại; Code Graph khớp `App.jsx` (route+Guards), `AuthContext`,
  `Guards.jsx`, `Layout.jsx`, `_shared/auth.ts`; đã ghi rõ 5 trang chính còn dùng `src/data/mock.js`.
## [2026-08-09] P2-09 CI acceptance cleanup test compatibility
- **Agent:** Codex
- **Thay đổi:** Thay các `DELETE FROM storage.objects` trực tiếp trong pgTAP cleanup test bằng assertion trên exact policy predicates (`owner` + `can_delete_report_staged_file`), vì Supabase Storage `protect_delete()` chặn SQL DELETE trước khi RLS được đánh giá.
- **File đã sửa:** `supabase/tests/report_staging_cleanup.sql`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** CI run `31311858704` cho thấy migration reset thành công nhưng cleanup test fail 6 case do cách test SQL không tương thích Storage runtime; không có migration conflict hay thay đổi production policy.
- **Kiểm tra:** CI run `31312142192` PASS: migration reset thành công, pgTAP 141/141 (cleanup C1–C8 PASS), Deno `check` và `test` PASS (8/8).
## [2026-08-09] P2-11 submission history and resubmission

- **Agent:** Codex
- **Thay doi:** Them immutable submission history theo assignment; expected-version RPC va namespace file `vN`; move staging an toan cung rollback; notification/history/audit atomic; resubmit NEEDS_SUPPLEMENT va late policy; history accordion lazy signed URLs; regression pgTAP H1-H26, Edge Function contract va frontend mapper/UI tests.
- **File da sua:** `supabase/migrations/202608090009_phase_2_submission_history_resubmission.sql`, `supabase/tests/report_submission_history.sql`, `supabase/functions/submit-report/index.ts`, `supabase/functions/submit-report/contract.ts`, `supabase/functions/submit-report/contract.test.ts`, `src/services/reportService.js`, `src/lib/reportDisplay.mjs`, `src/pages/ReportAssignmentDetail.jsx`, `tests/report_service.test.mjs`, `tests/report_ui.test.mjs`, `docs/phase-2/11-submission-history-resubmission.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`.
- **Ly do:** Giu trusted submit path P2-09, khong ghi de file cu, fail-closed cho stale/double-click va hien thi day du cac phien ban trong pham vi P2-11.
- **Kiem tra:** Local `npm.cmd test` `28/28` PASS, lint `0 error` (3 warning Fast Refresh cu), build PASS; CI run `31322412973` PASS voi migration + `supabase db reset`, pgTAP `180/180` (H1-H26 PASS; C1-C8/R1-R14 regression suites PASS), `deno check` PASS va `deno test` `12 passed, 0 failed`.

## [2026-08-09] P2-10 report review and status transition
- **Agent:** Codex
- **Thay đổi:** Tạo trusted review transition qua RPC atomic; đồng bộ assignment/submission review fields; ghi history/audit/notification trong cùng transaction; thêm review-report contract/status mapping; thêm reviewer controls và latest-submission view trên assignment detail; bổ sung pgTAP/Deno/frontend tests.
- **File đã sửa:** `supabase/migrations/202608090008_phase_2_report_review_atomic_notifications.sql`, `supabase/functions/review-report/index.ts`, `supabase/functions/review-report/contract.ts`, `supabase/functions/review-report/contract.test.ts`, `src/services/reportService.js`, `src/lib/reportDisplay.mjs`, `src/pages/ReportAssignmentDetail.jsx`, `tests/report_service.test.mjs`, `tests/report_ui.test.mjs`, `supabase/tests/report_review.sql`, `docs/phase-2/10-report-review-status-transition.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thiện P2-10 mà không mở rộng sang P2-11, history UI đầy đủ, dashboard, export hoặc email/reminder; loại bỏ notification best-effort và sai route campaign ID.
- **Kiểm tra:** Frontend `28/28` PASS, lint/build PASS; CI run `31320252175` PASS với migration + `supabase db reset`, pgTAP `154/154` (report review `34/34`, R1–R14 PASS), `deno check` PASS và `deno test` `10 passed, 0 failed`.
