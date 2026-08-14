# P3-00 — Phase 3 Baseline, Rehearsal & Implementation Plan

**Phase:** 3 — Notification, Email Queue & Reminder/Cron
**Loại task:** Audit + rehearsal planning only
**Ngày audit:** 2026-08-11
**Trạng thái:** **PASS (audit hoàn tất; chưa triển khai Phase 3)**

> Báo cáo này đối chiếu code thật với tài liệu. Không tạo migration, không sửa RLS,
> không tích hợp provider, không tạo secret/cron và không gửi email.

## 1. Baseline và điều kiện dừng

Điều kiện bắt buộc đã được xác nhận bằng GitHub PR metadata và merged-master CI. Local refs
được cập nhật từ remote trước khi tạo branch kế hoạch.

| Hạng mục | Bằng chứng local | Kết luận |
| --- | --- | --- |
| <code>master</code> | <code>0ecc3a9</code> — merge PR #10 Phase 2 final acceptance | Chứa P2-00…P2-15 |
| HEAD audit | <code>0ecc3a9</code> — <code>plan/phase-3-notification-email</code> | Tạo trực tiếp từ merged <code>origin/master</code> |
| Tổ tiên chung | <code>0ecc3a9</code> | Đúng merged-master baseline |
| Working tree trước audit | sạch | Đạt tại thời điểm bắt đầu |
| CI/PR Phase 2 | PR #10 merged; CI run <code>31411605381</code> build/test-db SUCCESS | Đạt |
| Supabase/Deno/Docker local | không có executable | Không rerun DB/Edge Function local |

Branch kế hoạch <code>plan/phase-3-notification-email</code> đã được tạo từ merged <code>master</code>.
P3-00 vẫn không tạo migration, không deploy function/cron và không gửi email; chỉ ghi nhận
hiện trạng và kế hoạch implementation.

## 2. Phase 2 handoff

P2-07 đến P2-15 đã được merge và có acceptance evidence:

- report service, assignment list/detail, upload staging và exact-path cleanup;
- submit/review qua Edge Function/RPC trusted path;
- immutable submission history, expected-version và namespace <code>vN</code>;
- notification submit/review được tạo trong transaction của RPC;
- admin campaign/template/publish qua RPC atomic;
- dashboard aggregate/list server-side scoped;
- scoped CSV export và latest-submission ZIP bundle;
- PR #10 merged vào <code>master</code> tại <code>0ecc3a9</code>; CI <code>31411605381</code> PASS với 40 frontend,
  236 pgTAP và 16 Deno tests.

Phase 2 technical acceptance không đồng nghĩa production-ready: chưa có Supabase rehearsal,
provider secrets, cron live hoặc backup/restore evidence. Đây là các gate của Phase 3.

## 3. Current Phase 3 inventory

### Database/schema

| Thành phần | Hiện trạng thực tế | Phân loại |
| --- | --- | --- |
| <code>notifications</code> | Có bảng, index unread theo <code>user_id</code>; không có event/entity/dedupe key | PARTIAL |
| <code>email_queue</code> | Có <code>PENDING/PROCESSING/SENT/FAILED/CANCELLED</code>, <code>scheduled_at</code>, <code>attempt_count</code>, <code>idempotency_key</code>, <code>last_error</code> | READY (schema only) |
| <code>email_logs</code> | Có provider/message ID, sent/delivered time và lỗi; không có lifecycle constraint/index vận hành | PARTIAL |
| <code>mark_overdue_assignments()</code> | Có <code>SECURITY DEFINER</code>, chỉ chuyển <code>PENDING</code> → <code>OVERDUE</code>, dùng <code>due_at_override</code>; chưa có cron/history/audit | PARTIAL / NEEDS_REHEARSAL |
| notification service/UI | Không có service query; <code>/ca-nhan/thong-bao</code> còn placeholder; badge là số hard-code | MISSING |
| queue service/RPC | Không có enqueue RPC; <code>send-reminder</code> upsert trực tiếp bằng service role | PARTIAL |
| cron config | Không có lịch trong <code>supabase/config.toml</code>, migration hoặc repo | MISSING |

<code>email_queue</code>, <code>email_logs</code>, <code>audit_logs</code> bật RLS nhưng không có policy/grant end-user;
đây là đúng hướng với nguyên tắc không cho frontend đọc trực tiếp. <code>notifications</code> chỉ
grant <code>SELECT</code>/<code>UPDATE</code> cho authenticated và policy giới hạn <code>SELECT</code> theo <code>user_id</code>.
Tuy vậy grant UPDATE hiện không giới hạn cột, nên user có thể sửa các cột notification của
chính mình chứ không chỉ <code>read_at</code>; cần chốt lại ở P3-01.

### Secrets/config

Repo chỉ có frontend <code>VITE_SUPABASE_URL</code> và <code>VITE_SUPABASE_ANON_KEY</code> placeholder. Edge
Functions cần <code>SUPABASE_URL</code>, <code>SUPABASE_ANON_KEY</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code>, cùng
<code>CRON_SECRET</code>, <code>EMAIL_PROVIDER</code>, <code>EMAIL_FROM</code>, <code>RESEND_API_KEY</code> hoặc <code>BREVO_API_KEY</code>;
không có giá trị rehearsal trong repo và không phát hiện secret thật. Chưa có bằng chứng
function nào đã deploy trên một Supabase project riêng.

## 4. Notification audit

### Quyền và luồng hiện tại

- INSERT production report: <code>create_report_submission_with_files</code> là <code>SECURITY DEFINER</code>,
  tạo <code>REPORT_SUBMITTED</code> cho <code>auth.uid()</code> trong cùng transaction với submission/files/history.
- INSERT review: <code>review_report_assignment</code> tạo <code>REPORT_ACCEPTED</code>,
  <code>REPORT_NEEDS_SUPPLEMENT</code> hoặc <code>REPORT_EXEMPTED</code> trong cùng transaction. EXEMPTED fan-out
  tới BRANCH_OFFICER ACTIVE trong organization; các action khác gửi latest submitter.
- INSERT bài toán đổi mới: <code>submit-innovation-problem</code> dùng service role insert best-effort;
  đây là luồng ngoài trọng tâm Phase 3 report và chưa có atomic contract tương đương.
- SELECT: chỉ user sở hữu notification. Chưa có test negative riêng chứng minh user A không
  đọc notification của user B.
- UPDATE: policy chỉ xét <code>user_id</code>, nhưng grant không giới hạn cột; P3-01 phải giới hạn
  mutation còn <code>read_at</code> hoặc dùng RPC.
- Frontend: chưa query bảng thật, chưa có inbox/read state thật, action URL chưa được mở
  qua notification UI. Badge/sidebar/header đang hard-code.

### Event matrix

| Event | Notification hiện có? | Actor | Recipient | Action URL | Atomic? |
| --- | --- | --- | --- | --- | --- |
| Campaign published | **MISSING** | Chưa có publish service/RPC | Chưa xác định theo assignment/role | — | — |
| Submit v1 | Có <code>REPORT_SUBMITTED</code> | BRANCH_OFFICER qua submit RPC | <code>auth.uid()</code> submitter | Assignment detail | Có |
| Resubmit v2+ | Có nhưng vẫn cùng type <code>REPORT_SUBMITTED</code> | BRANCH_OFFICER qua submit RPC | <code>auth.uid()</code> submitter | Assignment detail | Có |
| Review ACCEPTED | Có <code>REPORT_ACCEPTED</code> | YOUTH_ADMIN/SYSTEM_ADMIN qua review RPC | Latest submitter | Assignment detail | Có |
| Review NEEDS_SUPPLEMENT | Có <code>REPORT_NEEDS_SUPPLEMENT</code> | YOUTH_ADMIN/SYSTEM_ADMIN qua review RPC | Latest submitter | Assignment detail | Có |
| Review EXEMPTED | Có <code>REPORT_EXEMPTED</code> | YOUTH_ADMIN/SYSTEM_ADMIN qua review RPC | Active officers trong org | Assignment detail | Có |
| Due-soon reminder | **MISSING** in-app event | <code>send-reminder</code> chỉ enqueue email | Không có recipient app | — | — |
| Overdue reminder | **MISSING** in-app event | <code>send-reminder</code> chỉ enqueue email | Không có recipient app | — | — |

Không có unique constraint theo event, nên retry/replay của các RPC thành công không có DB
dedupe riêng. P2 expected-version chống duplicate submission version, nhưng không phải
idempotency cho notification/email.

## 5. Email queue audit

### Schema, grants và lifecycle

Schema hiện cho phép lifecycle <code>PENDING → PROCESSING → SENT</code> và lỗi về <code>PENDING</code> hoặc
<code>FAILED</code>; <code>DELIVERED</code> chỉ là giá trị tự do trong <code>email_logs</code>, không phải state machine được
chốt. Có unique <code>idempotency_key</code>, nhưng chưa có constraint bắt buộc mọi email nghiệp vụ phải
có key. Không có <code>locked_at</code>, <code>claim_token</code>, <code>worker_id</code>, <code>max_attempts</code>, <code>next_retry_at</code>,
<code>unknown/reconcile</code> state hoặc stale-processing recovery.

Frontend không được grant đọc/ghi queue/log. Đây là READY về boundary, nhưng chưa có enqueue
RPC và chưa có admin observability.

### <code>send-reminder</code>

Phân loại: **PARTIAL / SECURITY_RISK / NEEDS_REHEARSAL**.

- Chỉ kiểm <code>x-cron-secret</code> từ env rồi tạo service-role client; chưa có bằng chứng scheduler
  trusted gọi function và chưa có cấu hình cron.
- Cố định horizon 72 giờ, không đọc <code>reminder_policy</code>, không hỗ trợ T-7/T-3/T-1 cấu hình.
- Dùng <code>campaign.due_at</code>, không dùng <code>assignment.due_at_override</code>; không lọc rõ campaign
  <code>PUBLISHED</code> trong query hiện tại.
- Chọn <code>PENDING</code>, <code>OVERDUE</code>, <code>NEEDS_SUPPLEMENT</code>; loại terminal <code>ACCEPTED</code>, <code>EXEMPTED</code>,
  <code>CLOSED</code> khỏi query, nhưng NEEDS_SUPPLEMENT bị gộp thành <code>DUE_SOON</code> thay vì policy riêng.
- Recipient hiện là <code>organizations.email</code>, không phải danh sách user/BRANCH_OFFICER đã
  được xác định từ assignment. Seed không điền email tổ chức nên live rehearsal chưa chứng
  minh có recipient.
- Có upsert <code>onConflict=idempotency_key, ignoreDuplicates=true</code>, là điểm tốt cho enqueue
  cùng ngày; chưa có app notification và chưa có test duplicate invocation thật.

### <code>process-email-queue</code>

Phân loại: **SECURITY_RISK / PARTIAL / NEEDS_REHEARSAL**.

- Đọc một batch <code>PENDING</code> rồi từng worker tự update <code>PROCESSING</code>; không kiểm tra số row đã
  claim. Hai worker có thể cùng đọc một row và cùng gọi provider, tạo duplicate send.
- Không có <code>FOR UPDATE SKIP LOCKED</code> hoặc atomic claim RPC; row kẹt <code>PROCESSING</code> không tự
  được thu hồi.
- Tăng attempt trước khi gửi; retry mọi exception với delay 15 phút, tối đa bốn lần,
  không phân loại 4xx/5xx/invalid recipient/throttling/sender failure.
- Provider timeout sau khi provider đã nhận request có thể gửi lại; chưa có provider
  idempotency/reconciliation.
- Chỉ insert <code>email_logs</code> khi gửi thành công. Lỗi update/log bị bỏ qua; không có log failure,
  correlation ID, stuck-job metric hoặc admin visibility.
- HTML ghép trực tiếp từ <code>recipient_name</code>, <code>payload.title</code> và <code>payload.message</code>; dữ liệu
  người dùng có thể đi vào HTML/subject mà không encode. Đây là template/content injection
  risk, dù chưa có attachment hoặc signed URL trong email hiện tại.
- Provider code có gọi thật Resend/Brevo khi secret tồn tại, nhưng chưa phải integration
  đã nghiệm thu; chưa có SMTP adapter, webhook delivered/bounced hoặc sandbox evidence.

## 6. Edge Function và overdue audit

| Function/RPC | Thực tế | Phân loại |
| --- | --- | --- |
| <code>send-reminder</code> | Có code enqueue nhưng auth/scope/window/recipient/policy chưa đủ | PARTIAL / SECURITY_RISK |
| <code>process-email-queue</code> | Có provider calls, batch loop và bounded retry; race + HTML injection + log gaps | SECURITY_RISK |
| <code>mark_overdue_assignments()</code> | Atomic ở mức update, idempotent khi chạy lại; chưa ghi history/audit, chưa có scheduler | PARTIAL |
| Submit/review report hooks | Notification in-transaction; chưa enqueue email event | READY for in-app side effect / MISSING for email |
| Campaign publish hook | Không thấy function/RPC tạo notification/email | MISSING |

<code>mark_overdue_assignments()</code> loại trừ terminal states bằng điều kiện <code>status='PENDING'</code> và
dùng <code>coalesce(assignment.due_at_override, campaign.due_at)</code>, nên không được để Phase 3
persisted transition làm lệch semantic P2. Cần bổ sung history/audit và kiểm tra privilege
trên rehearsal trước khi cho cron gọi.

## 7. Cron audit

Hiện chưa có cron thật trong repo. Lịch mong muốn cần được triển khai sau audit:

| Job | Lịch đề xuất | Caller/function | Trạng thái hiện tại | Cần chứng minh |
| --- | --- | --- | --- | --- |
| Mark overdue | 00:05 hằng ngày | trusted scheduler → <code>mark_overdue_assignments</code> | Function có, scheduler thiếu | UTC/project timezone, history, idempotency |
| Reminder scan | 07:00 hằng ngày | trusted scheduler → <code>send-reminder</code> | Function khung | policy, recipient, duplicate prevention |
| Process queue | mỗi 10–15 phút | trusted scheduler → <code>process-email-queue</code> | Function khung | atomic claim, retry, failure visibility |
| Cleanup staging/temp | nếu cần, sau khi định nghĩa retention | function chưa có | MISSING | không xóa file finalized |

<code>supabase/config.toml</code> chỉ có API/DB/Auth/Storage local; không có <code>pg_cron</code>, schedule,
function verify-jwt override hoặc redirect URL rehearsal. Không chấp nhận public anonymous
cron hoặc shared secret hard-code trong repo. Cần xác định cơ chế scheduler trusted của
Supabase project trước khi code.

## 8. Security gaps

| ID | Severity | Gap | Evidence | Proposed task |
| --- | --- | --- | --- | --- |
| P3-S02 | P1 | Queue worker race có thể gửi trùng | <code>process-email-queue</code> select rồi update không kiểm claim result | P3-02/P3-07 |
| P3-S03 | P1 | Cron boundary phụ thuộc <code>x-cron-secret</code>, chưa chứng minh trusted scheduler | <code>send-reminder</code>, <code>process-email-queue</code>, không có cron config | P3-06 |
| P3-S04 | P1 | HTML/template injection từ payload/name | HTML template ghép raw input | P3-03/P3-07 |
| P3-S05 | P1 | Timeout/crash sau send chưa có semantics/reconciliation | chỉ mark SENT sau provider response | P3-03/P3-07 |
| P3-S06 | P2 | Notification update được grant rộng hơn <code>read_at</code> | table grant UPDATE không giới hạn cột | P3-01 |
| P3-S07 | P2 | Notification không có dedupe/event identity; frontend còn mock | không unique event key, badge hard-code | P3-01 |
| P3-S08 | P2 | Email event cho submit/review/publish chưa có | chỉ in-app RPC; không enqueue email | P3-04 |
| P3-S09 | P2 | Retry không phân loại; stuck PROCESSING và failure log chưa xử lý | loop retry fixed 15 phút, log success-only | P3-02/P3-07 |
| P3-S10 | P2 | Overdue thiếu history/audit và scheduler privilege chưa rehearsal | <code>mark_overdue_assignments()</code> chỉ update row | P3-06 |
| P3-S11 | P2 | Rehearsal dataset/provider/storage/auth thật chưa tồn tại | seed tối thiểu chỉ PENDING, email trống | P3-08 |
| P3-S12 | P3 | Provider/timezone/template policy chưa được chốt bằng external verification | code hỗ trợ Resend/Brevo nhưng chưa chọn | P3-00 decision gate/P3-03 |

Không thấy cross-user SELECT trong notification policy: policy dùng <code>user_id=auth.uid()</code>.
Tuy nhiên cần test trực tiếp A/B, suspended và anon trong P3-01; không suy diễn từ policy
đơn lẻ là đã nghiệm thu.

## 9. Rehearsal environment requirements

Rehearsal phải là Supabase project riêng, không dùng production và không dùng dữ liệu thật.

- **Supabase:** project URL/anon key/service role riêng; chạy toàn bộ migration từ đầu;
  bật Auth, Postgres/RLS, private Storage và Edge Functions.
- **Auth:** tạo SYSTEM_ADMIN, YOUTH_ADMIN scope root/A/B, BRANCH_OFFICER org A/B,
  MEMBER và SUSPENDED; kiểm login thật, session expiry và suspended deny.
- **Organizations:** root, child A, child B và child C ngoài scope; kiểm recursive scope,
  cross-org assignment/report/notification.
- **Storage:** tạo private <code>report-templates-private</code> và <code>report-submissions-private</code>,
  object fixture versioned/staging; kiểm đoán URL, signed URL hết hạn và finalized file
  không bị cleanup.
- **Edge Functions:** deploy từng function theo phase; có smoke test Auth header, service
  role boundary, error response và timeout.
- **Secrets:** chỉ set trên rehearsal: service role, <code>CRON_SECRET</code> nếu còn dùng trong giai
  đoạn chuyển tiếp, provider API key sandbox, verified sender/from, model secrets nếu test
  cần. Không commit hoặc đưa vào <code>VITE_*</code>.
- **Provider:** sandbox/test recipient hoặc sink; verified sender/domain theo yêu cầu provider;
  ghi nhận message ID, 4xx/5xx/throttle/timeout response và webhook nếu có.
- **Cron:** scheduler trusted gọi 401/403 khi thiếu auth; chạy manual rồi scheduled; lưu
  execution/failure evidence.
- **Redirect URLs:** rehearsal web origin cho login, invite, reset password và deep-link
  <code>/cong-viec/bao-cao/:assignmentId</code>; kiểm sau login vẫn re-authorize.
- **Observability:** queue counts theo status, last error, attempt count, log provider ID,
  stuck processing, cron failure và audit event.
- **Backup/restore:** export DB trước cron mutation; test restore vào project tách biệt;
  ghi rõ Storage object restore/limitation; rollback migration bằng forward-fix, rollback
  frontend bằng deployment trước.

## 10. Rehearsal dataset tối thiểu

Seed hiện có root/A/B/C, SYSTEM_ADMIN, YOUTH_ADMIN root/A, officers A/B, member,
innovation member và suspended user. Nó chưa có YOUTH_ADMIN scope B, email recipient,
notification fixtures, queue fixtures hoặc mọi trạng thái assignment.

Cần bổ sung trong rehearsal-only fixture (không phải P3-00 migration):

- campaign/assignments có <code>PENDING</code>, <code>SUBMITTED</code>, <code>NEEDS_SUPPLEMENT</code>, <code>RESUBMITTED</code>,
  <code>ACCEPTED</code>, <code>OVERDUE</code>, <code>EXEMPTED</code>;
- due-at override, close-at, reminder policy T-7/T-3/T-1 và campaign ngoài scope;
- fake/sandbox recipient mapping cho officer A/B và nhiều officer trong một org;
- notification của user A/B, queue PENDING/PROCESSING/FAILED, provider response fixtures;
- object private report/template, signed URL expiry và backup snapshot identifier.

## 11. Email provider decision requirements

Không chọn provider chỉ vì code hiện có. Cần verify hiện tại tại thời điểm P3-03:

| Tiêu chí | Resend | Brevo | SMTP provider |
| --- | --- | --- | --- |
| Edge Function integration | API HTTP đơn giản trong code hiện có | API HTTP đơn giản trong code hiện có | Cần SMTP client/relay phù hợp Deno |
| Sandbox/rehearsal | Cần kiểm tra quota/test recipient | Cần kiểm tra quota/test recipient | Cần kiểm tra relay/sandbox |
| Sender/domain | Cần verify sender/domain | Cần verify sender/domain | Cần verify SMTP identity |
| Retry/idempotency/webhook | Cần verify tài liệu hiện tại | Cần verify tài liệu hiện tại | Tùy relay, cần verify |
| Delivery/bounce logs | Cần verify API/webhook | Cần verify API/webhook | Tùy provider |
| Cost/quota | **Requires current external verification** | **Requires current external verification** | **Requires current external verification** |

Ứng viên ưu tiên để đánh giá là Resend trước, Brevo dự phòng; đây chưa phải quyết định tích
hợp. P3-03 chỉ chốt sau khi có sender verification, quota rehearsal, error semantics,
webhook/logging và chi phí hiện tại được ghi nhận.

## 12. Template inventory và content security

| Template | Trigger | Recipient | Action URL | Phase |
| --- | --- | --- | --- | --- |
| Account invite | Supabase Auth/admin invite | user được mời | Auth invite/reset route | Auth/current |
| Password reset | Supabase Auth | user yêu cầu reset | reset route | Auth/current |
| Campaign published | publish event | assigned officers/unit | campaign/assignment route | P3-04 |
| Deadline reminder | reminder policy | assignment chưa hoàn thành | assignment detail | P3-05 |
| Overdue warning | overdue policy | assignment chưa hoàn thành | assignment detail | P3-05/P3-06 |
| Submission confirmation | submit v1/vN | submitter/unit | assignment detail | P3-04 |
| Supplement requested | review event | latest submitter/unit | assignment detail | P3-04 |
| Report accepted | review event | latest submitter/unit | assignment detail | P3-04 |

Email chỉ là kênh thông báo. Không gửi file report hoặc signed URL dài hạn; link phải mở app
route và kiểm authorization sau login. Template dùng biến allowlist, escape HTML/subject,
không render arbitrary user HTML, không đưa reason/note raw vào markup. P3-00 không xây
sanitizer; P3-03 phải chọn template renderer/escaping strategy trước khi tích hợp.

## 13. Retry, idempotency và concurrency architecture

### Đánh giá hiện tại

- Enqueue reminder đã có DB unique <code>idempotency_key</code> theo mẫu
  <code>{campaign_id}:{assignment_id}:{reminder_type}:{date}</code>.
- Đây mới chống duplicate queue row, không chống hai worker cùng gửi một row.
- Database/provider không thể bảo đảm distributed exactly-once khi timeout sau khi provider
  đã nhận request.

### Hướng cần chốt trước implementation

1. Logical event tạo <code>event_key</code> ổn định; DB unique index/constraint là source of truth.
2. Claim queue bằng transaction/RPC với <code>FOR UPDATE SKIP LOCKED</code> hoặc atomic conditional
   update trả về đúng row đã claim; có <code>locked_at</code>, <code>worker_id</code>, attempt và stale-claim
   recovery.
3. Retry bounded: phân biệt invalid recipient/verified-sender/4xx permanent với 5xx,
   timeout và throttling retryable; dùng backoff có trần và max attempts rõ ràng.
4. Provider timeout chuyển sang trạng thái cần reconcile hoặc dùng provider idempotency key
   nếu provider hiện tại hỗ trợ; không blind retry vô hạn.
5. Chọn semantic **at-least-once enqueue, at-most-once logical event**, delivery retry có
   kiểm soát; ghi rõ duplicate risk còn lại ở ambiguous provider timeout.
6. Mọi claim/send/finalize/failure đều ghi <code>email_logs</code>/audit đủ để reconcile; worker crash
   sau send trước mark SENT phải có quy trình xử lý.

## 14. Timezone decision

Hiện DB dùng <code>timestamptz</code> và server <code>now()</code>; chưa có policy timezone trong config/scheduler.
Browser timezone không được dùng cho reminder.

**Đề xuất cần chốt ở P3-01/P3-06:** lưu và so sánh timestamp ở UTC; lịch nghiệp vụ 00:05,
07:00 và 10–15 phút diễn giải theo <code>Asia/Ho_Chi_Minh</code> (UTC+7, đồng nhất với
<code>Asia/Bangkok</code>); email hiển thị deadline theo <code>Asia/Ho_Chi_Minh</code>; scheduler phải cấu hình
timezone rõ ràng hoặc chuyển đổi UTC một lần ở adapter. Không để mỗi Edge Function tự chọn
timezone. Đây là decision candidate, chưa phải production decision vì scheduler rehearsal
chưa tồn tại.

## 15. Live rehearsal test matrix

| Area | Case | Expected evidence |
| --- | --- | --- |
| Auth | Login officer/admin; suspended login/access | session thật; suspended bị deny |
| Notification | Submit v1/v2, review accepted/supplement/exempted | đúng recipient, action URL, không cross-user |
| Notification | Mark read | chỉ <code>read_at</code> của chính user thay đổi |
| Email enqueue | Campaign/reminder event | một event key chỉ có một queue row |
| Email provider | Sandbox receive | provider message ID, sender, content escaped |
| Queue concurrency | Hai worker cùng batch | một owner/không duplicate provider request |
| Retry | 4xx, 5xx, throttle, timeout | phân loại, backoff, max attempts, reconcile |
| Reminder | T-7/T-3/T-1/due-soon | policy đúng; ACCEPTED/EXEMPTED không nhận |
| Overdue | pending past due; override; rerun | persisted status, history/audit, idempotent |
| Cron | scheduled invocation + failure | trusted caller, execution/failure log |
| Private links | email route khi chưa login/khác org | login rồi vẫn authz; không lộ file |
| Backup | DB export/restore + Storage limitation | restore evidence và rollback/forward-fix note |

## 16. Phase 3 task breakdown

Sequence đề xuất sau khi P3-00 PASS:

- **P3-01 — Notification Foundation:** service/inbox/read state, column-level mutation,
  event contracts, RLS negative tests, dedupe identity. Recommended next task.
- **P3-02 — Email Queue State Machine:** schema hardening, enqueue RPC, atomic claim,
  idempotency, retry/stuck recovery.
- **P3-03 — Email Provider Integration:** provider decision, escaped templates, provider
  adapter, logs/webhook/rehearsal send.
- **P3-04 — Report Event Email Hooks:** publish, submit, supplement, accepted; giữ app
  notification là kênh bắt buộc.
- **P3-05 — Reminder Engine:** policy, due-soon/overdue/needs-supplement semantics,
  recipients và logical event key.
- **P3-06 — Cron & Overdue Persistence:** trusted scheduler, mark-overdue history/audit,
  timezone và queue schedule.
- **P3-07 — Phase 3 Security Acceptance:** concurrency, duplicate, scope, injection,
  retry/failure recovery và privilege.
- **P3-08 — Live Rehearsal Acceptance:** authenticated project, sandbox provider, cron,
  signed links, backup/restore và failure tests.

Dependency graph:

~~~text
P3-00 PASS
  ├── P3-01 Notification Foundation ─────────────┐
  └── P3-02 Email Queue State Machine             │
                         └── P3-03 Provider ──────┤
                                                  ├── P3-04 Event Emails
                                                  └── P3-05 Reminder Engine
                                                             └── P3-06 Cron/Overdue
                                                                      └── P3-07 Security Acceptance
                                                                               └── P3-08 Live Rehearsal
~~~

P3-01 và P3-02 có thể bắt đầu song song sau khi merged-master baseline được xác nhận; P3-03
phụ thuộc P3-02; P3-04/P3-05 phụ thuộc provider/queue contracts; P3-06 phụ thuộc reminder
policy và timezone; P3-07/P3-08 là acceptance gates.

## 17. Risks và rollback

- Không được dùng technical acceptance như production-ready; rehearsal vẫn bắt buộc.
- Không sửa migration đã chạy; mọi hardening là forward-fix migration.
- Queue mutation trước khi có backup/restore rehearsal có thể gây gửi trùng hoặc mất job.
- Provider timeout không thể chứng minh exactly-once; phải có reconcile và giới hạn retry.
- Email deep-link không thay thế authorization; route sau login phải re-check RLS.
- <code>docs/03-architecture.md</code> còn mô tả custom history router, trong khi code/brain hiện dùng
  React Router; đây là documentation drift cần xử lý riêng, không tự sửa trong P3-00.

Rollback/forward-fix: tắt scheduler/feature flag, giữ queue/log để reconcile, rollback
frontend deployment; database chỉ sửa bằng migration forward-fix; restore rehearsal vào
project riêng trước khi cân nhắc production.

## 18. Validation evidence

Đã chạy trên branch audit hiện tại:

- <code>npm.cmd test</code> — **PASS, 40/40** theo merged-master acceptance evidence; cần rerun local sau khi resolve docs merge.
- <code>npm.cmd run lint</code> — **PASS, 0 error, 3 warning Fast Refresh có sẵn**.
- <code>npm.cmd run build</code> — **PASS**.
- <code>supabase db reset</code>, <code>supabase test db</code>, <code>deno check</code>, <code>deno test</code> — **NOT RUN** vì local
  thiếu Supabase CLI, Docker và Deno. CI evidence cũ được ghi nhận từ working log, không
  claim đây là rerun của P3-00.
- Không có behavior production nào thay đổi trong task này; chỉ tạo/cập nhật tài liệu.

## 19. Definition of done / disposition

P3-00 **PASS**: merged Phase 2 baseline đã được xác nhận; inventory, gap list, rehearsal
requirements, architecture direction và task map đã hoàn tất. Phase 3 implementation chưa bắt đầu.

### Next recommended task

**P3-01 — Notification Foundation**.
