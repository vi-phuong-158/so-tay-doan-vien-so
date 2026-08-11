# P3-01 — Notification Foundation

**Phase:** 3 — Notification, Email Queue & Reminder/Cron  
**Ngày triển khai:** 2026-08-11  
**Branch:** feat/phase-3a-notification-foundation  
**Dependency:** P3-00 commit 1377265 / Draft PR #11, chưa merge tại thời điểm triển khai.

## Trạng thái

Implementation đã hoàn tất ở local cho phạm vi in-app notification. Frontend tests/build/lint
đã PASS; pgTAP cần CI chạy migration reset vì workspace không có Supabase CLI/Docker.
Không triển khai email provider, email queue worker, reminder, cron, realtime hoặc P3-02.

## Phạm vi và contract

- Notification được tạo từ trusted SECURITY DEFINER workflow; client không gửi recipient_user_id.
- Recipient campaign publish là profile ACTIVE có role BRANCH_OFFICER trong organization của
  assignment, với scope role null hoặc đúng organization.
- Submit v1 tạo REPORT_SUBMITTED cho submitter; resubmit v2+ tạo REPORT_RESUBMITTED. Review
  ACCEPTED/NEEDS_SUPPLEMENT gửi latest submitter; EXEMPTED fan-out tới active branch officers
  trong organization. Các side-effect vẫn cùng transaction với report transition.
- notifications có source_entity_type, source_entity_id và event_key. Event key có unique partial
  index để retry/replay không tạo bản ghi trùng.
- action_url bị DB check theo allowlist app-relative và frontend lọc lại trước navigate. UI chỉ
  render text bằng React, không dùng dangerouslySetInnerHTML.

| Event | Recipient | Action | Atomic |
| --- | --- | --- | --- |
| REPORT_CAMPAIGN_PUBLISHED | Active BRANCH_OFFICER theo assignment org | assignment detail | Có |
| REPORT_SUBMITTED | Submitter | assignment detail | Có |
| REPORT_RESUBMITTED | Submitter | assignment detail | Có |
| REPORT_ACCEPTED | Latest submitter | assignment detail | Có |
| REPORT_NEEDS_SUPPLEMENT | Latest submitter | assignment detail | Có |
| REPORT_EXEMPTED | Active BRANCH_OFFICER theo assignment org | assignment detail | Có |

## Database và security

Migration 202608110001_phase_3_notification_foundation.sql:

- Bổ sung source/entity/event identity, unique event_key, deterministic created_at/id index và
  action URL CHECK.
- Thay policy đọc bằng account ACTIVE + auth.uid(); suspended/archived không thấy rows.
- Revoke INSERT/UPDATE/DELETE của authenticated; giữ SELECT.
- Thêm mark_notification_read(uuid) và mark_all_notifications_read(), fixed search_path,
  authenticated-only EXECUTE, owner-only và idempotent, chỉ thay read_at.
- Cập nhật trusted submit/review/publish RPC để ghi event identity và campaign publish notification.

## Frontend

- notificationService.js cung cấp getMyNotifications, getUnreadCount, markAsRead và markAllAsRead.
- Query bounded tối đa 50 rows, sort created_at DESC rồi id DESC, hỗ trợ unreadOnly và pagination.
- NotificationBell tải badge theo session user id; đổi user/logout không giữ count cũ.
- Route /ca-nhan/thong-bao có loading, empty, error/retry, mark-all, mark-read trước navigate và
  tải thêm.
- Deep-link chỉ nhận route app-relative trong allowlist; lỗi mark-read vẫn hiển thị lỗi nhưng
  cho phép mở nội dung để UX không bị kẹt.

## Acceptance coverage

PgTAP notification_foundation.sql bao phủ:

- anon denied; user A chỉ đọc A; UUID user B không đọc/mark được;
- owner mark-read success/idempotent; suspended denied;
- direct authenticated INSERT/UPDATE/DELETE denied;
- unsafe action URL, partial source identity và duplicate event_key denied;
- campaign publish resolve đúng recipient, không gửi ngoài role/org, repeat không duplicate.

Frontend:

- service mapping, pagination bound, stable sort, unread count, RPC boundary, UUID validation;
- bell/inbox route, loading/empty/error, mark/read/navigation, mark-all, user-keyed cache;
- source assertion không dùng dangerouslySetInnerHTML.

## Validation và rủi ro

- npm.cmd test: 45/45 PASS.
- npm.cmd run lint: 0 errors, 3 existing Fast Refresh warnings.
- npm.cmd run build: PASS.
- git diff --check: PASS.
- Supabase CLI/Docker: không có local; chưa chạy được db reset/pgTAP.

Rủi ro còn lại: CI có thể phát hiện khác biệt pgTAP/Supabase runtime hoặc fixture privilege. Nếu
CI fail, sửa forward-only trên cùng branch; không merge master và không triển khai email/cron.

## Rollback/forward-fix

Frontend rollback bằng deployment trước. Database rollback không dùng destructive down migration;
forward-fix giữ các cột nullable và RPC contract. Nếu cần tạm dừng UI, route có thể quay về
NotFound/placeholder mà không xóa event identity hoặc notification rows.

## Handoff

Chỉ sau khi CI DB reset + pgTAP PASS và review Draft PR mới đánh dấu P3-01 PASS. Nếu PASS, task
tiếp theo được khuyến nghị là P3-02 Email Queue State Machine & Concurrency Safety; P3-02 không
được triển khai trong task này.
