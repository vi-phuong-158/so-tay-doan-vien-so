# 06 — AI Working Log

## [2026-08-14] P3-06 — Cron & Overdue Automation

- **Agent:** Claude (Sonnet)
- **Thay đổi:** Thay `mark_overdue_assignments()` (0 tham số) bằng
  `mark_overdue_assignments(p_as_of timestamptz default now())` — giữ nguyên rule chuyển
  `PENDING → OVERDUE` (campaign `PUBLISHED`, quá `effective_due_at` — strict `>`), thêm ghi
  `report_status_history` + `audit_logs` (actor null/hệ thống) atomic trong cùng một câu lệnh
  (chained data-modifying CTE) cho từng dòng thực sự chuyển trạng thái. Cài đặt `pg_cron` với 2
  job ổn định tên: `report_mark_overdue_daily` (`5 17 * * *` UTC = 00:05 ICT) gọi
  `mark_overdue_assignments()`, và `report_reminder_scan_daily` (`0 0 * * *` UTC = 07:00 ICT) gọi
  `scan_report_reminders()` — cả hai gọi RPC trực tiếp trong database, không qua HTTP/Edge
  Function, không cần `CRON_SECRET`/service-role key trong migration. Không lịch hóa
  `process-email-queue` (worker email vẫn thủ công/bên ngoài như trước). Không đổi
  `scan_report_reminders`, `EMAIL_DELIVERY_MODE`, hay bất kỳ remediation P3-R1 nào.
- **File đã sửa/tạo:** `supabase/migrations/202608140002_phase_3_cron_overdue_automation.sql`,
  `supabase/tests/report_cron_overdue.sql`, `docs/phase-3/06-cron-overdue-automation.md`,
  `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`,
  `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thiện phần P3-05 đã chủ động để lại: persisted/audited overdue transition và
  trusted schedule đúng timezone, không mở rộng sang lịch email worker hay bất kỳ nghiệp vụ Phase
  4 nào.
- **Kiểm tra:** `npm test` 45/45 PASS (không đổi frontend); `npm run lint` 0 lỗi/3 warning có sẵn;
  `npm run build` PASS. Supabase CLI/Docker/Deno không có trong môi trường thi công này (như mọi
  task Phase 2/3 trước) nên DB/Deno được xác nhận qua GitHub Actions CI trên Draft PR #20
  (`.github/workflows/ci.yml`, job `test-db`). Hai vòng CI đầu phát hiện lỗi thật trong fixture
  test mới (vi phạm `unique(campaign_id, organization_id)` do dùng chung 1 campaign cho nhiều
  status, và một assertion đếm tổng chưa scope bị lẫn 2 assignment PENDING sẵn có của
  `seed.sql`) — cả hai đã sửa chỉ trong file test, không đổi migration. **CI run `31811349804`
  PASS**: `test-db` xanh (10m25s) — pgTAP `Files=18, Tests=450, Result: PASS` (gồm
  `report_cron_overdue.sql`), `deno check` sạch, Deno `42 passed, 0 failed`; `build` xanh (24s).
- **Verdict:** `P3_06_PASS`. Draft PR: https://github.com/vi-phuong-158/so-tay-doan-vien-so/pull/20
  (chưa merge).

## [2026-08-14] P3-R1 — Email Delivery Safety Gate & Reminder Cycle Fix

- **Agent:** Claude (Sonnet)
- **Thay đổi:** Thêm `EMAIL_DELIVERY_MODE` (OFF/ALLOWLIST/LIVE, default OFF, fail-closed) vào
  `process-email-queue` trước P3-06; sửa `REPORT_SUPPLEMENT_REMINDER` idempotency key thành
  `NEEDS_SUPPLEMENT:v{version}` theo từng vòng review thay vì cố định một lần cho cả assignment;
  đưa `source_entity_type/id` vào INSERT của `enqueue_email_for_user_event`, gỡ workaround UPDATE
  của P3-05; chuyển `@supabase/supabase-js`/`react-router-dom` từ `devDependencies` sang
  `dependencies`; bổ sung test cho cả bốn thay đổi.
- **File đã sửa:** `supabase/functions/process-email-queue/{contract.ts,worker.ts,index.ts,contract.test.ts,worker.test.ts}`,
  `supabase/migrations/202608140001_phase_3_r1_email_safety_remediation.sql`,
  `supabase/tests/{report_email_safety_remediation.sql,report_reminder_engine.sql}`,
  `package.json`, `.env.example`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`,
  `docs/brain/04-current-tasks.md`, `docs/phase-3/r1-email-safety-remediation.md`,
  `docs/brain/06-ai-working-log.md`.
- **Lý do:** P3-04/P3-05 (đã merge) mở renderer allowlist từ 1 template vô hại lên 8 template báo
  cáo/nhắc hạn thật, xóa mất lớp an toàn ngầm "không render thì không gửi" của P3-03. Trước khi
  P3-06 bật scheduler tự động invoke worker, cần một gate tường minh, fail-closed. Song song, review
  phát hiện `REPORT_SUPPLEMENT_REMINDER` chỉ có thể gửi một lần vĩnh viễn cho một assignment do
  logical key cố định — im lặng ngừng hoạt động đúng lúc cần nhất (đơn vị chây ì qua nhiều vòng bổ
  sung); và `source_entity_type/id` bị bỏ trống ở tầng RPC, phải vá bằng UPDATE riêng ở P3-05.
- **Kiểm tra:** Frontend local: `npm test` 45/45 PASS, `npm run lint` 0 errors/3 existing warnings,
  `npm run build` PASS, `npm audit --omit=dev` và `npm audit` đều 0 vulnerabilities. pgTAP mới
  (`report_email_safety_remediation.sql`) và Deno mới (`contract.test.ts`/`worker.test.ts`) viết
  đầy đủ nhưng **chưa chạy được cục bộ** trong môi trường thi công này (không có Docker daemon cho
  Supabase CLI; `deno.land` bị chặn bởi egress policy của tổ chức) — khớp với hạn chế đã ghi nhận ở
  mọi task Phase 3 trước đó; kết quả thật nằm ở CI trên Draft PR. Không gửi email thật, không gọi
  provider thật, không đổi secret, không bật cron, không deploy production.

## [2026-08-14] Phase 3 Stack Consolidation through P3-05

- **Agent:** Codex
- **Thay đổi:** Audit GitHub PR #11–#16, xác minh ancestry cumulative P3-00 → P3-05, tạo integration branch từ `origin/master`, merge `--no-ff` cumulative P3-05, và merge PR #17 vào `master` tại `2a68f20`.
- **File đã sửa:** `docs/04-implementation-status.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Chốt an toàn stacked Phase 3 tới P3-05 mà không squash/rebase, không duplicate code/migration, và không mở rộng sang P3-06.
- **Kiểm tra:** Final merged-master CI `31783521687` PASS: frontend 45/45, lint 0 errors/3 existing warnings, build PASS, 21 migrations, 16 pgTAP suites, Deno 37/37; không deploy production, không bật cron, không gửi live email mới.

## [2026-08-13] P3-05 acceptance handoff

- **Agent:** Codex
- **Thay đổi:** Ghi nhận P3-05 đạt full acceptance và cập nhật handoff/status tài liệu với HEAD `4876e44`, Draft PR #16 và CI run `31719821897`.
- **File đã sửa:** `docs/04-implementation-status.md`, `docs/brain/04-current-tasks.md`, `docs/phase-3/05-reminder-engine.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Full CI đã xanh; cần chuyển trạng thái từ implementation in progress sang review pending và giữ rõ các giới hạn không cron, không deploy, không live email.
- **Kiểm tra:** CI `31719821897` PASS: frontend build/lint/test, Supabase migration reset + pgTAP, Deno check/tests.

## [2026-08-13] P3-05 CI forward-fix — align local due-date display assertion

- **Agent:** Codex
- **Thay đổi:** Cập nhật expectation pgTAP của `due_at` email reminder từ UTC sang `Asia/Ho_Chi_Minh` (`07:00`).
- **File đã sửa:** `supabase/tests/report_reminder_engine.sql`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** CI run `31719456452` xác nhận code trả `18/08/2026 07:00`, phù hợp formatter P3-04 hiện hành; test cũ kỳ vọng `00:00` dù chỉ P3-06 mới chốt scheduler timezone.
- **Kiểm tra:** Các assertion reminder còn lại, suite cũ và frontend build đã qua; sẽ xác minh lại full CI sau khi push.

## [2026-08-13] P3-05 CI forward-fix — persist reminder queue source identity

- **Agent:** Codex
- **Thay đổi:** Sau khi enqueue email reminder thành công, ghi `source_entity_type` và `source_entity_id` vào queue row và cập nhật `updated_at`.
- **File đã sửa:** `supabase/migrations/202608130002_phase_3_reminder_engine.sql`.
- **Lý do:** CI run `31719018832` cho thấy queue được tạo nhưng không truy vấn được theo assignment vì helper P3-02 chưa persist hai cột source identity; payload assertion và duplicate queue assertion vì vậy thất bại.
- **Kiểm tra:** Các lỗi SQL trước đó đã qua; sẽ chạy lại pgTAP và Edge Function CI sau khi push.

## [2026-08-13] P3-05 CI forward-fix — qualify reminder event retry columns

- **Agent:** Codex
- **Thay đổi:** Qualify `report_reminder_events.id` và `notification_id` trong nhánh đọc lại event đã tồn tại.
- **File đã sửa:** `supabase/migrations/202608130002_phase_3_reminder_engine.sql`.
- **Lý do:** CI run `31718647707` phát hiện `notification_id` bị mơ hồ với output parameter cùng tên trong `create_report_reminder_event`.
- **Kiểm tra:** Các suite cũ và build/frontend đã qua; sẽ xác minh lại pgTAP và Edge Function trên CI sau khi push.

## [2026-08-13] P3-05 CI forward-fix — partial unique event key

- **Agent:** Codex
- **Thay đổi:** Sửa conflict target khi tạo notification reminder để chỉ rõ predicate `event_key is not null` của partial unique index.
- **File đã sửa:** `supabase/migrations/202608130002_phase_3_reminder_engine.sql`.
- **Lý do:** CI pgTAP phát hiện PostgreSQL không suy ra được partial unique index từ `ON CONFLICT (event_key)`, làm scan reminder dừng trước khi hoàn tất.
- **Kiểm tra:** Đã đối chiếu log run `31717904456`; sẽ kiểm tra lại toàn bộ DB/Edge Function CI sau khi push.

> Nhật ký các lần AI (Claude Code / Codex) sửa code. Mỗi agent PHẢI thêm entry sau mỗi lần
> chạm vào code. Đọc ngược từ trên xuống để biết gần đây ai đã làm gì và vì sao.

## [2026-08-13] P3-05 reminder engine

- **Agent:** Codex
- **Thay đổi:** Audit cumulative P3-00→P3-04 dependency/PR/CI; tạo stacked branch từ `bf78b07`;
  thêm policy-driven trusted reminder scan với `as_of`, effective due override, campaign/state
  filters, server-resolved BRANCH_OFFICER fan-out, logical reminder event uniqueness, app
  notification và secondary email queue; thay `send-reminder` bằng RPC caller; thêm reminder
  renderer templates, pgTAP và concurrent Deno integration coverage.
- **File đã sửa:** `supabase/migrations/202608130002_phase_3_reminder_engine.sql`,
  `supabase/tests/report_reminder_engine.sql`, `supabase/functions/send-reminder/index.ts`,
  `supabase/functions/send-reminder/contract.ts`, `supabase/functions/send-reminder/contract.test.ts`,
  `supabase/functions/reminder_engine.integration.test.ts`,
  `supabase/functions/process-email-queue/renderer.ts`,
  `supabase/functions/process-email-queue/renderer.test.ts`, `docs/phase-3/05-reminder-engine.md`,
  `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`,
  `docs/04-implementation-status.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** P3-05 cần xác định đúng milestone/recipient/state mà không dùng clock frontend,
  tạo cả notification và queue, đồng thời chống duplicate khi retry/concurrent scan mà không bật
  cron hoặc gửi email thật.
- **Kiểm tra:** `npm.cmd test` 45/45 PASS; `npm.cmd run lint` 0 lỗi với 3 warning Fast Refresh
  có sẵn; `npm.cmd run build` PASS; `git diff --check` PASS. Supabase CLI/Deno không có local,
  nên migration/pgTAP, Deno check/test và concurrency integration chờ CI.

## [2026-08-13] P3-05 pgTAP fixture forward-fix

- **Agent:** Codex
- **Thay đổi:** Đổi assignment `CLOSED` trong fixture reminder engine sang campaign riêng để
  không vi phạm unique `(campaign_id, organization_id)` của report assignment.
- **File đã sửa:** `supabase/tests/report_reminder_engine.sql`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** CI run `31717128423` đã reset migration và các suite cũ thành công; P3-05 test dừng
  ngay tại fixture duplicate, trước khi chạy acceptance assertions.
- **Kiểm tra:** Đã chạy lại frontend gates trước đó; commit forward-fix sẽ kích hoạt full CI DB/Deno.

## [2026-08-13] P3-05 SQL ambiguity forward-fix

- **Agent:** Codex
- **Thay đổi:** Dùng named unique constraint cho `report_reminder_events` trong `ON CONFLICT` và
  qualify các truy vấn đọc `logical_key`/`event_key` trong helper.
- **File đã sửa:** `supabase/migrations/202608130002_phase_3_reminder_engine.sql`,
  `docs/brain/06-ai-working-log.md`.
- **Lý do:** CI run `31717544017` đã chạy tới pgTAP; helper fail do PostgreSQL phân biệt không rõ
  giữa cột `logical_key` và output parameter cùng tên.
- **Kiểm tra:** Migration reset và toàn bộ suite cũ đã PASS trước lỗi; forward-fix sẽ chạy lại
  full DB/Deno/frontend CI.

## [2026-08-13] P3-04 report event email hooks

- **Agent:** Codex
- **Thay đổi:** Audit remote dependency PR #11–#14; tạo stacked branch từ P3-03R `de952fa`; nối
  trusted report notifications với P3-02 email enqueue; thêm allowlisted report templates, bounded
  payload/rendering, server-side recipient/audit behavior và pgTAP/Deno coverage.
- **File đã sửa:** `supabase/migrations/202608130001_phase_3_report_event_email_hooks.sql`,
  `supabase/tests/report_event_email_hooks.sql`, `supabase/functions/process-email-queue/renderer.ts`,
  `supabase/functions/process-email-queue/renderer.test.ts`, `docs/phase-3/04-report-event-email-hooks.md`,
  `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`,
  `docs/04-implementation-status.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Email phải là secondary side effect của trusted report event, không phải request độc lập
  do frontend gọi; giữ notification bắt buộc, server-resolved recipient và deterministic idempotency.
- **Kiểm tra:** `npm.cmd test` 45/45 PASS; `npm.cmd run lint` 0 lỗi với 3 warning Fast Refresh có sẵn;
  `npm.cmd run build` PASS; `git diff --check` PASS. Supabase CLI/Deno không có local nên pgTAP,
  `supabase db reset`, `deno check` và Deno tests chờ CI.

## [2026-08-13] P3-04 pgTAP assertion forward-fix

- **Agent:** Codex
- **Thay đổi:** Sửa tên function trong assertion privilege của bộ test P3-04 từ trigger function
  sang trusted queue RPC thực tế `enqueue_email_for_user_event`.
- **File đã sửa:** `supabase/tests/report_event_email_hooks.sql`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** CI run `31711269018` xác nhận migration reset và 14 suite cũ PASS; chỉ assertion thứ
  ba của P3-04 tham chiếu nhầm tên function nên pgTAP không tìm thấy function.
- **Kiểm tra:** Forward-fix sẽ chạy lại full CI trên Draft PR #15.

## [2026-08-13] P3-04 renderer allowlist test forward-fix

- **Agent:** Codex
- **Thay đổi:** Cập nhật fixture unknown-template trong renderer test sang mã thật sự ngoài allowlist;
  `REPORT_ACCEPTED` nay là template hợp lệ và được kiểm tra bằng fixture report riêng.
- **File đã sửa:** `supabase/functions/process-email-queue/renderer.test.ts`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** CI run `31712000337` đã PASS migration/pgTAP và Deno check; chỉ test cũ kỳ vọng
  `REPORT_ACCEPTED` là unknown sau khi P3-04 thêm template này.
- **Kiểm tra:** Forward-fix sẽ chạy lại full CI trên Draft PR #15.

## [2026-08-13] P3-04 Deno typecheck forward-fix

- **Agent:** Codex
- **Thay đổi:** Thêm guard fail-closed cho action URL trong report renderer để thu hẹp kiểu
  `string | null` trước khi escape HTML.
- **File đã sửa:** `supabase/functions/process-email-queue/renderer.ts`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** CI run `31711594922` đã PASS migration/pgTAP và frontend; `deno check` fail một lỗi
  TypeScript tại `escapeHtml(actionUrl)`.
- **Kiểm tra:** Forward-fix sẽ chạy lại full CI trên Draft PR #15.

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

## [2026-08-11] P3-01 CI acceptance

- **Agent:** Codex
- **Thay đổi:** Ghi nhận technical acceptance cho notification foundation sau forward-fix pgTAP.
- **File đã sửa:** docs/phase-3/01-notification-foundation.md, docs/brain/04-current-tasks.md,
  docs/brain/06-ai-working-log.md.
- **Lý do:** Xác nhận migration/RLS/RPC và toàn bộ regression gate trước khi handoff sang P3-02.
- **Kiểm tra:** GitHub Actions run 31491748132 PASS — build; migration reset; 12 pgTAP files /
  267 tests; Edge Function tests. Local frontend 45/45, lint 0 lỗi/3 warning, build PASS.

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
# [2026-08-11] P3-02 Email Queue State Machine and Concurrency Safety

- Agent: Codex
- Change: Added PENDING/PROCESSING/RETRY/SENT/FAILED lifecycle with claim token,
  worker lease, bounded claim, deterministic backoff, stale reclaim, trusted idempotent
  enqueue, bounded/sanitized attempt logs and service-role stats. Disabled the legacy
  provider worker and added pgTAP plus real concurrent Deno coverage.
- Files: supabase/migrations/202608110002_phase_3_email_queue_state_machine.sql,
  supabase/tests/email_queue_state_machine.sql, supabase/functions/process-email-queue/*,
  supabase/functions/email_queue_state_machine.integration.test.ts, docs/phase-3/02-email-queue-state-machine.md,
  docs/brain/01-architecture.md, docs/brain/03-decisions.md, docs/brain/04-current-tasks.md,
  docs/brain/06-ai-working-log.md.
- Reason: close SELECT-to-UPDATE races, stale-owner overwrite and real-send exposure in
  P3-02 without coupling P3-01 notifications to email delivery.
- Verification: npm.cmd run lint has 0 errors/3 pre-existing warnings and npm.cmd test is
  45/45 PASS. Supabase CLI, Docker and Deno are unavailable locally; DB/Deno gates await CI.

## [2026-08-11] P3-02 CI acceptance

- Agent: Codex
- Change: Recorded technical acceptance after the forward fixes for PostgreSQL conflict-target
  ambiguity and Deno SupabaseClient typing.
- Files: docs/phase-3/02-email-queue-state-machine.md, docs/brain/04-current-tasks.md,
  docs/brain/06-ai-working-log.md.
- Reason: Do not recommend P3-03 until migration reset, full pgTAP regression, Deno checks/tests
  and frontend gates are green.
- Verification: GitHub Actions run 31494989851 PASS; migration reset + 13 pgTAP files / 279
  tests, deno check, Deno integration/contract tests, frontend lint/test/build all passed.
# [2026-08-11] P3-03 provider integration implementation

- Agent: Codex
- Change: Selected Resend REST adapter; added server-only provider configuration, stable
  provider idempotency, centralized failure classification, safe SYSTEM_EMAIL_TEST renderer
  with HTML/text/subject/action-path defenses, provider-code completion RPC overload, and
  claim-based worker dispatch.
- Files: .env.example, supabase/migrations/202608110003_phase_3_email_provider.sql,
  supabase/functions/process-email-queue/*, supabase/tests/email_provider_foundation.sql,
  docs/phase-3/03-email-provider-integration.md, docs/brain/01-architecture.md,
  docs/brain/03-decisions.md, docs/brain/04-current-tasks.md, docs/brain/06-ai-working-log.md.
- Reason: activate P3-03 provider delivery without restoring the legacy fetch/send/update
  race, exposing secrets, rendering arbitrary HTML or coupling notifications to email.
- Verification: GitHub Actions run `31498548925` PASS — migration reset + 14 pgTAP files / 292
  assertions (279 baseline + 13 P3-03), Deno check/tests `30 passed, 0 failed`, and frontend
  lint/test/build. No live provider request was made; controlled rehearsal remains blocked
  pending a non-production Supabase project, provider secret, verified sender and test inbox.

## [2026-08-11] P3-03R live email rehearsal acceptance

- Agent: Codex
- Change: Performed the rehearsal preflight, recorded the controlled-live acceptance matrix,
  and documented the provisioning blocker without changing production source code.
- Files: `docs/phase-3/03r-live-email-rehearsal.md`, `docs/phase-3/03-email-provider-integration.md`,
  `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- Reason: The task requires a real provider acceptance and must not claim `PASS` without a
  dedicated Supabase rehearsal project, server-only provider secret, accepted sender and test
  inbox. None was available; no unsafe fallback or production send was attempted.
- Verification: branch/worktree baseline verified at `7edce42`; PR #14 remains Draft; CI
  `31499062927` is PASS; local `npm.cmd test` is 45/45 PASS, lint has 0 errors/3 existing
  warnings, and build PASS. Final P3-03R status: `BLOCKED`.

## [2026-08-11] P3-03R live email rehearsal acceptance completion

- Agent: Codex
- Change: Completed live rehearsal in Supabase project `znexculhbdjiflkczpyu`; updated the
  acceptance documents to status `PASS` and verdict `P3_03_FULL_ACCEPTANCE_PASS`.
- Files: `docs/phase-3/03r-live-email-rehearsal.md`,
  `docs/phase-3/03-email-provider-integration.md`, `docs/brain/04-current-tasks.md`,
  `docs/brain/06-ai-working-log.md`.
- Reason: The user confirmed controlled inbox receipt after the normal rehearsal and
  safe-render fixture were accepted by Resend; P3-03R needed to be closed without sending
  more email or changing production code.
- Verification: Normal event `SENT`, attempt 1, Resend `HTTP_200`, provider message ID
  present and claim clear; second worker invocation `claimed: 0, sent: 0`; safe-render event
  `SENT` with XSS escaped; renderer `4/4`, frontend `45/45`, build PASS, lint `0 errors`,
  secret leak audit `NO`. The `/` failed fixture remains fail-closed evidence. Production
  used: NO.
