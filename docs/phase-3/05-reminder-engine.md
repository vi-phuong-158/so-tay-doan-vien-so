# P3-05 — Reminder Engine

## Purpose

P3-05 xác định assignment nào cần nhắc tại một thời điểm tham chiếu do server cung cấp, tạo
notification trong app và email queue cho từng recipient, đồng thời giữ một logical reminder
duy nhất cho mỗi milestone. Task này chỉ xây engine; chưa bật scheduler, cron, overdue persistence
hay gửi email thật.

## Reminder types

| Type | Assignment đủ điều kiện | Logical milestone |
| --- | --- | --- |
| `REPORT_DUE_SOON` | `PENDING`, effective due date còn trong cửa sổ policy | `T-{days}` |
| `REPORT_OVERDUE` | `PENDING` hoặc `OVERDUE`, effective due date đã qua | `OVERDUE` |
| `REPORT_SUPPLEMENT_REMINDER` | `NEEDS_SUPPLEMENT` khi policy bật | `NEEDS_SUPPLEMENT` |

`SUBMITTED` và `RESUBMITTED` đang chờ review không nhận reminder hạn nộp. `ACCEPTED`,
`EXEMPTED` và `CLOSED` tuyệt đối không nhận reminder.

## Reminder policy

Schema hiện có `report_campaigns.reminder_policy jsonb`, mặc định `{}`, chưa có constraint format
trước P3-05. Engine chỉ công nhận format bounded sau:

```json
{
  "due_soon_days": [7, 3, 1],
  "overdue": true,
  "needs_supplement": true
}
```

`due_soon_days` chỉ nhận số nguyên hoặc chuỗi số từ 1 đến 365; giá trị trùng, malformed và
unsupported bị bỏ qua. Các flag chỉ nhận JSON boolean `true`. Policy rỗng hoặc không cấu hình
không tự phát minh reminder.

## Effective due date and time

Engine dùng `coalesce(report_assignments.due_at_override, report_campaigns.due_at)`. `scan_report_reminders(as_of)`
nhận `timestamptz` cố định; nếu caller không truyền thì RPC dùng database `now()`. Due-soon là
assignment `PENDING` chưa quá hạn và đã đi vào cửa sổ `as_of >= due_at - policy_offset days`. Quá hạn
là effective due date `<= as_of`. Cách diễn giải timezone scheduler chính thức để P3-06 chốt.

Chỉ campaign `PUBLISHED`, đã mở và chưa qua `close_at` được scan. Assignment được khóa
`FOR UPDATE SKIP LOCKED`; unique logical key vẫn là lớp bảo vệ cuối cho retry/concurrency.

## Recipient resolution

Recipient được resolve trong database từ `profiles` + `user_roles` + `auth.users`: profile phải
`ACTIVE`, có role `BRANCH_OFFICER`, scope role phải null hoặc đúng organization của assignment,
và user phải tồn tại. Mỗi officer là một logical event riêng. Client không truyền recipient.

Nếu không có officer active, assignment/milestone bị skip và ghi bounded audit evidence. Nếu profile
đủ điều kiện app nhưng email thiếu/sai, notification vẫn giữ vai trò kênh bắt buộc; email secondary
bị đánh dấu `SKIPPED` và audit ghi SQLSTATE bounded, không làm hỏng batch.

## Notification, email and idempotency

`report_reminder_events` là trusted logical-event table, unique theo:

```text
REPORT_REMINDER:{assignment_id}:{recipient_user_id}:{reminder_type}:{policy_milestone}
```

Mỗi event tạo notification `REPORT_DUE_SOON`, `REPORT_OVERDUE` hoặc
`REPORT_SUPPLEMENT_REMINDER`. Trigger backend-only nối notification đó vào
`enqueue_email_for_user_event`; queue tiếp tục dùng idempotency key P3-02 và renderer allowlist
P3-03. Bản ghi event giữ `notification_id`, `email_queue_id`, `email_enqueue_status`, `scan_count`
và `last_scan_as_of` để điều tra retry/skip.

## Concurrency and failure model

Scan lặp lại hoặc chạy đồng thời không tạo duplicate logical event, notification hoặc queue row:
DB unique constraint/`ON CONFLICT` là source of truth, không phải `SELECT` rồi `INSERT` ở client.
Một assignment không có recipient không làm dừng các assignment khác. Lỗi email là secondary side
effect; event vẫn có audit/notification app và queue status `SKIPPED` để forward-fix/repair sau này.
Lỗi schema/database nghiêm trọng vẫn surface và làm scan thất bại.

## Security boundary

`scan_report_reminders` và helper event đều bị thu hồi khỏi `anon`/`authenticated`; chỉ trusted
`service_role` có execute scan. `send-reminder` hiện là Edge Function mỏng, kiểm tra exact
`CRON_SECRET` và chỉ gọi RPC; P3-05 không tạo lịch gọi function. Không có email address, HTML,
action URL hoặc policy scope do frontend cung cấp. Action URL được DB tạo theo route assignment,
renderer tiếp tục reject external URL và escape HTML/subject.

## Validation

- pgTAP: policy parsing, campaign/assignment filters, terminal states, due override, fan-out/cross-org,
  suspended user, invalid email, notification + queue, repeat scan, privileges.
- Deno: reminder request contract, trusted secret, concurrent scan integration và reminder renderer
  templates/action URL/escaping.
- Frontend regression: không thêm UI lớn; notification inbox hiện render bounded text/title chung.
  - Local Supabase CLI/Deno không có trong môi trường thi công; CI run `31719821897` đã chạy full
    migration reset, pgTAP, Deno check/tests và frontend gates thành công.

## Acceptance and limitations

Acceptance: `P3_05_FULL_ACCEPTANCE_PASS` trên CI run `31719821897`; full repo gate, migration reset,
pgTAP, Deno check/tests và frontend build/lint/test đều xanh. Không gửi email thật trong phase này:

`LIVE_EMAIL_NOT_REQUIRED_FOR_P3_05`

Không deploy production, không thay secret, không bật cron. `mark_overdue_assignments()` chỉ được
audit trong P3-05; persisted transition/history/audit và timezone scheduler thuộc P3-06.

## Next step

**P3-06 — Cron & Overdue Persistence**: chốt timezone scheduler, trusted schedule và persisted
OVERDUE transition/history/audit.
