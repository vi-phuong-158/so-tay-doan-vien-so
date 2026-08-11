# 06 — AI Working Log

> Nhật ký các lần AI (Claude Code / Codex) sửa code. Mỗi agent PHẢI thêm entry sau mỗi lần
> chạm vào code. Đọc ngược từ trên xuống để biết gần đây ai đã làm gì và vì sao.

---

## [2026-08-11] P3-01 Notification Foundation

- **Agent:** Codex
- **Thay đổi:** Thêm event identity/source fields và safe action URL constraint cho notifications;
  đóng direct authenticated writes; thêm mark-read/mark-all RPC; nối campaign publish, submit v1/v2+
  và review events với recipient server-resolved/idempotent; thêm service, unread bell, inbox UI,
  deep-link và pgTAP/frontend acceptance.
- **File đã sửa:** supabase/migrations/202608110001_phase_3_notification_foundation.sql,
  supabase/tests/notification_foundation.sql, src/services/notificationService.js,
  src/components/NotificationBell.jsx, src/pages/Notifications.jsx, src/App.jsx,
  src/components/Layout.jsx, src/pages/Profile.jsx, src/index.css,
  tests/notification_service.test.mjs, tests/notification_ui.test.mjs,
  docs/phase-3/01-notification-foundation.md, docs/brain/01-architecture.md,
  docs/brain/03-decisions.md, docs/brain/04-current-tasks.md,
  docs/brain/06-ai-working-log.md.
- **Lý do:** Hoàn thiện nền tảng notification in-app theo P3-01 mà không mở rộng sang email/queue/
  reminder/cron; giữ event side-effect atomic với Phase 2 report workflows.
- **Kiểm tra:** npm.cmd test 45/45 PASS; npm.cmd run lint 0 lỗi, 3 warning Fast Refresh có sẵn;
  npm.cmd run build PASS; git diff --check PASS. Supabase CLI/Docker không có local, pgTAP
  chờ CI reset database.

## [2026-08-11] P3-01 pgTAP assertion forward-fix

- **Agent:** Codex
- **Thay đổi:** Sửa expected exception message trong notification_foundation.sql cho ba assertion
  constraint/unique key theo overload throws_ok thực tế của pgTAP.
- **File đã sửa:** supabase/tests/notification_foundation.sql, docs/brain/06-ai-working-log.md.
- **Lý do:** CI đã chứng minh migration reset thành công và test logic đúng; chỉ expected string
  của test harness không khớp message PostgreSQL.
- **Kiểm tra:** CI run 31491382954: build PASS; test-db chạy đến pgTAP và fail đúng 3 assertion
  expected string, các suite Phase 2 PASS. Local frontend 45/45, lint 0 lỗi/3 warning, build PASS.

## [2026-08-11] P2-15 CI acceptance

- **Agent:** Codex
- **Thay đổi:** Ghi nhận full GitHub Actions xanh và nâng Phase 2 report verdict lên technical acceptance complete; chuyển P2-15 sang hoàn thành.
- **File đã sửa:** `docs/phase-2/15-phase-2-final-acceptance.md`, `docs/brain/04-current-tasks.md`, `docs/04-implementation-status.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Chỉ được tuyên bố acceptance complete sau khi migration reset, toàn bộ pgTAP, Deno, frontend lint/test/build cùng PASS trên branch acceptance.
- **Kiểm tra:** GitHub Actions run `31411605381` PASS — frontend 40/40, pgTAP 11 files/236 tests, Deno 16 tests, lint/build PASS.

## [2026-08-10] P2-15 Phase 2 final acceptance

- **Agent:** Codex
- **Thay đổi:** Audit P2-07→P2-14; đóng direct submission RPC bypass bằng expected-version + xác minh Storage tại DB; thêm regression và vertical slice tích hợp; lập acceptance matrix/PR merge plan và cập nhật trạng thái kiến trúc.
- **File đã sửa:** `supabase/migrations/202608100003_phase_2_submit_rpc_storage_guard.sql`, `supabase/tests/phase_2_final_acceptance.sql`, `supabase/tests/report_submission_atomicity.sql`, `supabase/tests/report_submission_history.sql`, `supabase/tests/report_submit_atomic_finalize.sql`, `docs/phase-2/15-phase-2-final-acceptance.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/04-implementation-status.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** P2-15 yêu cầu technical acceptance toàn Phase 2; audit phát hiện authenticated có thể gọi RPC trực tiếp để bỏ Edge Storage verification/legacy stale guard.
- **Kiểm tra:** Local frontend 40/40, lint/build PASS; browser shell 390/768/1440 không overflow/overlay; baseline CI `31409496394` PASS; acceptance CI đang chờ.

## [2026-08-10] P2-13 report dashboard & aggregate status

- **Agent:** Codex
- **Thay đổi:** Thêm RPC dashboard/read-model scoped, aggregate server-side, dashboard UI/filter/search/link detail, pgTAP security/semantic coverage và frontend service/UI tests.
- **File đã sửa:** `supabase/migrations/202608100002_phase_2_report_dashboard.sql`, `supabase/tests/report_dashboard.sql`, `src/services/reportAdminService.js`, `src/lib/reportDashboard.mjs`, `src/pages/AdminReportDashboard.jsx`, `src/pages/AdminReports.jsx`, `src/App.jsx`, `src/index.css`, `tests/report_dashboard.test.mjs`, `docs/phase-2/13-report-dashboard.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Ban Thanh niên cần số liệu và danh sách theo scope được DB xác nhận, không tính trust metrics ở browser hoặc lộ rows ngoài scope.
- **Kiểm tra:** Frontend test/lint/build và CI Supabase/pgTAP/Deno sẽ được chạy trước nghiệm thu.

## [2026-08-10] P2-13 CI acceptance

- **Agent:** Codex
- **Thay đổi:** Ghi nhận bằng chứng CI green cho implementation dashboard P2-13.
- **File đã sửa:** `docs/phase-2/13-report-dashboard.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Xác nhận migration/read-model scoped và regression P2-01 → P2-12 đã vượt acceptance gate trước khi mở PR review.
- **Kiểm tra:** GitHub Actions run `31405473107` PASS: frontend lint/tests/build; Supabase db reset + pgTAP; Deno check/test.

---

## [2026-08-10] P2-12 admin campaign & assignment management

- **Agent:** Codex
- **Thay đổi:** Thêm route/form quản trị campaign, service boundary, upload/finalize template private, RPC scoped tạo/sửa draft và publish atomic/idempotent; đóng quyền ghi trực tiếp assignment/template/campaign; thêm frontend + pgTAP acceptance.
- **File đã sửa:** `src/App.jsx`, `src/pages/Admin.jsx`, `src/pages/AdminReports.jsx`, `src/services/reportAdminService.js`, `src/services/reportService.js`, `src/lib/reportAdmin.mjs`, `src/index.css`, `supabase/migrations/202608100001_phase_2_admin_campaign_assignment.sql`, `supabase/functions/finalize-campaign-template/index.ts`, `supabase/tests/report_admin_campaign_assignment.sql`, `tests/report_admin.test.mjs`, `docs/phase-2/12-admin-campaign-assignment.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`.
- **Lý do:** Ban Thanh niên phải tạo/phát hành đợt báo cáo đúng scope mà không mở đường bypass các invariant P2-09 → P2-11.
- **Kiểm tra:** `npm.cmd test` 34/34 PASS; `npm.cmd run lint` 0 errors (3 warning có sẵn); `npm.cmd run build` PASS; Supabase pgTAP/Deno chưa chạy local vì Docker/Postgres/Deno không có.

---

## [2026-08-10] P2-12 pgTAP fixture forward-fix

- **Agent:** Codex
- **Thay đổi:** Cấp quyền fixture tạm cho role `authenticated` và qualify `c.status` trong assertion atomicity sau khi CI phát hiện lỗi test harness, không thay đổi hành vi production.
- **File đã sửa:** `supabase/tests/report_admin_campaign_assignment.sql`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** pgTAP chủ động đổi role để xác minh authorization, nên fixture test phải có quyền tường minh.
- **Kiểm tra:** CI rerun đang được kích hoạt trên forward-fix.

## [2026-08-10] P2-12 publish RPC ambiguity forward-fix

- **Agent:** Codex
- **Thay đổi:** Qualify `report_assignments.campaign_id` trong RPC trả về bảng để không xung đột với output parameter; cấp SELECT fixture tối thiểu cho `anon` để assertion quyền execute kiểm tra đúng function thay vì bị chặn ở fixture.
- **File đã sửa:** `supabase/migrations/202608100001_phase_2_admin_campaign_assignment.sql`, `supabase/tests/report_admin_campaign_assignment.sql`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** CI phát hiện PostgreSQL ưu tiên/nhầm lẫn giữa `RETURNS TABLE campaign_id` và cột không qualifier trong truy vấn đếm; đây là lỗi implementation thực tế cần sửa trước nghiệm thu.
- **Kiểm tra:** `npm.cmd test` sẽ được chạy lại; CI Supabase/Deno được chạy lại trên commit forward-fix.

## [2026-08-10] P2-12 publish conflict-target forward-fix

- **Agent:** Codex
- **Thay đổi:** Đổi conflict target publish sang constraint định danh để tách hoàn toàn cột unique `(campaign_id, organization_id)` khỏi output field cùng tên của `RETURNS TABLE`.
- **File đã sửa:** `supabase/migrations/202608100001_phase_2_admin_campaign_assignment.sql`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** pgTAP CI vẫn báo `campaign_id` ambiguous tại câu INSERT/UPSERT; đây là nguồn tham chiếu cột không qualifier còn lại trong hàm.
- **Kiểm tra:** CI Supabase/Deno sẽ được chạy lại sau commit.

## [2026-08-10] P2-12 pgTAP unique-constraint forward-fix

- **Agent:** Codex
- **Thay đổi:** Đổi assertion unique assignment sang overload pgTAP kiểm tra cả SQLSTATE `23505` và message đầy đủ của constraint.
- **File đã sửa:** `supabase/tests/report_admin_campaign_assignment.sql`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** CI đã thực thi đúng constraint nhưng overload 3-đối-số hiểu chuỗi expected là toàn bộ message; assertion cũ chỉ dùng prefix.
- **Kiểm tra:** CI Supabase/Deno được chạy lại sau commit.

## [2026-08-10] P2-12 CI acceptance

- **Agent:** Codex
- **Thay đổi:** Cập nhật tài liệu task/current task bằng kết quả nghiệm thu CI trên commit `b27ab4e`.
- **File đã sửa:** `docs/phase-2/12-admin-campaign-assignment.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Ghi lại bằng chứng gate database/Edge Function đã PASS sau các forward-fix pgTAP.
- **Kiểm tra:** GitHub Actions run `31403376831` PASS: build, lint, 34 frontend tests, Supabase reset/pgTAP, Deno check và test.

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

## [2026-08-11] P3-00 Phase 3 baseline, rehearsal and implementation plan

- **Agent:** Codex
- **Thay đổi:** Đối chiếu Phase 3 notification/email queue/reminder/cron giữa migration, Edge Functions, frontend, auth, seed, config và test; lập báo cáo baseline, rehearsal requirements, security gaps, retry/idempotency/timezone direction và task graph trên branch kế hoạch từ merged Phase 2 master.
- **File đã sửa:** `docs/phase-3/00-baseline-rehearsal-plan.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** P3-00 là audit/docs-only; phải xác nhận merged Phase 2 baseline trước khi cho phép Phase 3 implementation.
- **Kiểm tra:** PR #10 đã merge vào `master` tại `0ecc3a9`; CI `31411605381` PASS với 40 frontend, 236 pgTAP và 16 Deno tests. Local `npm.cmd test` PASS 40/40, lint 0 error/3 warning có sẵn, build PASS; Supabase CLI/Docker/Deno không có nên không rerun DB/Edge tests.

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
## [2026-08-10] P2-14 — Scoped export & report bundle download
- **Agent:** Codex
- **Thay đổi:** Hoàn thiện Edge Functions export CSV và bundle ZIP theo scope/filter dashboard; thêm kiểm tra formula CSV, path/tên ZIP, latest submission, giới hạn 100 file/50 MiB, object private và audit bắt buộc; nối hai nút tải vào dashboard với loading/double guard.
- **File đã sửa:** `supabase/functions/export-report-status/*`, `supabase/functions/download-report-bundle/*`, `supabase/tests/report_export.sql`, `src/services/reportAdminService.js`, `src/pages/AdminReportDashboard.jsx`, `src/index.css`, `src/services/reportService.js`, `src/lib/reportDashboard.mjs`, `tests/report_dashboard.test.mjs`, `docs/phase-2/14-scoped-export-report-bundle.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`.
- **Lý do:** Đáp ứng P2-14 mà không tạo đường vòng phân quyền hoặc làm lộ private storage path; giữ dashboard là nguồn scope duy nhất.
- **Kiểm tra:** `npm.cmd test` (40 pass), `npm.cmd run lint` (0 errors, 3 warning có sẵn), `npm.cmd run build` pass; GitHub Actions run `31409166458` PASS (Supabase db reset + pgTAP, Deno check/test và frontend gates).
