# 03 — Technical Decisions

> Ghi lại quyết định kỹ thuật quan trọng để agent sau không "phát minh lại" hoặc đảo ngược
> mà không biết lý do. Nguồn gốc: `docs/07-decisions.md`, README, lịch sử git, `docs/phase-2/`.

---

## [2026-08-16] P4-04: Quiz chỉ ghi/chấm qua trusted RPC, answer key không nằm trong payload trước submit

Khảo sát cho thấy schema năm bảng Quiz đã tồn tại. P4-04 giữ model đó, nhưng thay policy đọc quiz/
question bằng `can_access_quiz()` delegating vào quyền topic cha, đồng thời revoke INSERT/UPDATE/
DELETE trực tiếp trên `quiz_attempts` và `quiz_answers` cho `authenticated`. `start_quiz_attempt`,
`submit_quiz_attempt` và các RPC đọc safe/result là contract duy nhất của frontend.

`get_attempt_questions` có column list tường minh, không chọn `is_correct`; answer key chỉ được đọc
trong transaction submit và result sau khi attempt đã finalized. Scoring là exact-set: SINGLE phải
có đúng một lựa chọn, MULTIPLE phải có tập lựa chọn bằng tập đáp án đúng; score = earned/total * 100,
làm tròn 2 chữ số; server quyết định `score`, `passed`, `attempt_number`, `user_id`.

Start lấy advisory transaction lock trước khi đọc active attempt, re-check sau lock, và dùng unique
`(quiz_id,user_id,attempt_number)` làm backstop. Các migration forward-fix không sửa migration đã
chạy: `202608160005` đóng race resume và biến malformed/duplicate JSON thành business error.

## [2026-08-16] P4-04: Draft/admin preview không phải end-user access

`can_access_quiz` cho phép content admin đúng scope xem content ở trạng thái DRAFT để authoring/review;
end user chỉ thấy quiz PUBLISHED dưới topic accessible và còn trong availability window. P4-04 chỉ
thêm bounded admin table policy, không xây admin authoring UI lớn; phần đó để P4-05.

## [2026-08-16] P4-05: Admin authoring là trusted RPC boundary, answer key chỉ trả trong scoped read

Learning/Quiz admin không dùng direct table DML hoặc broad authenticated SELECT. Topic/resource
reads and writes, quiz metadata, question/option authoring, ordering, status transitions and audit
all pass through SECURITY DEFINER functions that re-check active account and organization scope.
`get_admin_quiz_authoring` may return `is_correct` only after that scope check; end-user paths
continue to use safe quiz/attempt RPCs and never receive the answer key before submission.

## [2026-08-16] P4-05: Submitted attempts freeze scoring semantics

Once a quiz has a submitted attempt, question/option rows and scoring-affecting settings
(pass score, time limit, max attempts, shuffle flags) are immutable. Cosmetic title/description
edits remain allowed for operational correction. A content correction creates a new quiz, preserving
the answer-key interpretation and auditability of historical attempts.

## [2026-08-16] P4-02: `documents-private` không có UPDATE policy — object không bao giờ ghi đè

Mỗi lần upload tạo một object path MỚI (`{uuid}-{tên}`), và bucket cố ý **không** có UPDATE policy.
Hệ quả: một lần thay thế tệp thất bại giữa chừng không thể phá tệp đang dùng, vì nó chưa bao giờ
chạm vào tệp đó. Đây đúng bất biến P2-03 đã đặt cho bucket báo cáo (RPT-F05), không phải phát minh
mới.

## [2026-08-16] P4-02: DELETE trên `documents-private` chỉ để bù trừ, và không được xóa tệp đang gắn

Policy DELETE có điều kiện `d.storage_path is distinct from storage.objects.name`. Nghĩa là object
mà `documents.storage_path` đang trỏ tới **không thể bị xóa qua policy này** — một bug cleanup, một
UI cũ, hay một retry nhầm đều không thể phá tệp gốc của văn bản đã phát hành. Muốn gỡ tệp thật thì
phải qua `detach_document_source_file` (xóa con trỏ trước), tức là hai bước có chủ đích, không phải
một cú xóa lỡ tay.

Thứ tự trong `detach` cũng cố ý: **xóa con trỏ DB trước, xóa bytes sau**. Crash ở giữa để lại orphan
vô hại (dọn được) thay vì một document trỏ vào tệp không còn tồn tại.

## [2026-08-16] P4-02 KHÔNG revoke grant của `document_relations`/`document_chunks`

Giữ nguyên quyết định đã ghi ở P4-01: chỉ đóng grant khi có RPC thay thế. P4-02 không xây relation
editor (ngoài phạm vi task), nên không đóng grant `document_relations`. Việc này để lại rủi ro đã
ghi rõ trong `docs/phase-4/02-documents-admin-storage-rehearsal.md` mục "Residual risks", kèm khuyến
nghị task sau làm đúng khuôn P4-01: thêm RPC trước, đóng grant sau.

## [2026-08-16] P4-01 tái sử dụng model `documents` sẵn có thay vì dựng lại

**Bối cảnh.** `docs/01-product-spec.md` mô tả phân hệ Văn bản như việc cần làm mới. Khảo sát P4-00
trên source thật cho thấy ngược lại: `202607300001_initial_schema.sql` đã tạo `documents` với đủ
field spec và đúng 7 giá trị `status`, cùng `document_relations`/`document_chunks`; và
`202607300003_fix_phase_1_security.sql` đã thêm `owner_organization_id`, helper fail-closed
`can_access_document(uuid)` (đủ 4 mức visibility), policy admin, bucket private `documents-private`
và policy đọc Storage.

**Quyết định.** P4-01 **không** tạo bảng/model mới và **không** dựng hệ quyền song song. Chỉ đóng
gap: constraint thiếu, policy `document_relations` thiếu, grant ghi quá rộng, policy Storage cast
không an toàn, và bổ sung write path có validate server-side.

**Vì sao.** Dựng lại sẽ tạo hai nguồn sự thật cho cùng một khái niệm, phá dữ liệu/tham chiếu sẵn có
(`document_chunks` trỏ vào `documents`), và làm lệch model quyền mà Phase 1 đã kiểm chứng. Đọc spec
mà không đọc migration là cách chắc chắn nhất để xây trùng.

## [2026-08-16] `document_relations` yêu cầu quyền đọc ở CẢ HAI đầu quan hệ

Bảng này trước P4-01 bật RLS nhưng **không có policy nào** → deny-all, không ai đọc được kể cả
admin. Khi thêm policy, điều kiện là `can_access_document()` đúng cho **cả** source lẫn target,
không chỉ source: tiết lộ "văn bản A thay thế văn bản B" tự nó đã là tiết lộ về sự tồn tại và quan
hệ của B — nếu người dùng không được đọc B thì cũng không được biết điều đó qua trang của A.

## [2026-08-16] Storage policy dùng `uuid_or_null` thay cho cast `::uuid` thô

Policy cũ của `documents-private` cast `(string_to_array(name,'/'))[1]::uuid` trực tiếp, nên với
object có segment đầu không phải UUID (path dị dạng, traversal) PostgreSQL **raise lỗi** thay vì từ
chối. Chuyển sang `public.uuid_or_null` (helper đã có từ P2, dùng trong `can_read_report_template`)
để trả `null` → policy false → **fail closed**, im lặng, không lộ bề mặt lỗi.

## [2026-08-16] Ghi `documents` chỉ qua RPC; đóng grant bảng cho `authenticated`

RLS vốn đã chặn end user ghi (`content admins manage documents` yêu cầu YOUTH_ADMIN-in-scope hoặc
SYSTEM_ADMIN ở `WITH CHECK`), nên đây **không phải lỗ hổng đang mở** mà là defense-in-depth: bỏ
`INSERT/UPDATE/DELETE` khỏi `authenticated` để RPC là đường ghi duy nhất, đúng tiền lệ P2-06 đã làm
với luồng nộp báo cáo. State transition (publish/withdraw) được validate trong RPC, không phụ thuộc
việc frontend ẩn nút.

**Chỉ đóng `documents`, KHÔNG đóng `document_relations`/`document_chunks`.** Bản migration đầu tiên
đóng cả ba; CI bắt được hậu quả và đó là cảnh báo đúng: P4-01 không có RPC thay thế cho hai bảng kia
(quản lý relation không nằm trong admin write path của task này; chunk thuộc pipeline AI/RAG ngoài
scope), nên đóng grant là **xóa năng lực mà không có gì thay thế**. Hai bảng đó giữ grant và vẫn
được bảo vệ bằng policy RLS chỉ-admin — pgTAP chứng minh trực tiếp bằng cách assert member INSERT
relation bị từ chối `42501`, thay vì assert sự vắng mặt của grant.

**Hệ quả lên test cũ:** `rls_acceptance.sql` trước đây seed document bằng cách đăng nhập sysadmin rồi
INSERT thẳng. Khi write path chuyển sang RPC, cách seed đó hỏng. Đã đổi sang seed bằng `postgres`
qua `reset_auth()` — đúng convention mà chính file đó đang dùng cho fixture storage. **Không sửa,
không nới, không skip bất kỳ assertion nào**; test 14/15/16/26 vẫn đọc đúng các dòng đó qua đúng
đường RLS cũ.

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

## [2026-08-10] Publish campaign và assignment là một RPC transaction idempotent

- **Quyết định:** Draft campaign chỉ phát hành qua `publish_report_campaign(uuid, uuid[])` SECURITY DEFINER. RPC tự lấy `auth.uid()`, khóa campaign, kiểm role/trạng thái/scope/đơn vị active, tạo assignment `PENDING` + history/audit rồi mới đổi campaign sang `PUBLISHED`; request lặp trả kết quả hiện có.
- **Lý do:** Không để browser tạo assignment hoặc để campaign đã phát hành mà assignment chỉ được tạo một phần.
- **Đánh đổi:** Danh sách đơn vị được giữ ở form draft cho đến lúc publish; không thêm bảng target nháp ngoài schema cần thiết.
- **Người quyết định:** Codex, theo P2-12.

## [2026-08-10] Dashboard báo cáo tổng hợp và lọc scope trong database

- **Quyết định:** Dashboard gọi hai SECURITY DEFINER RPC read-only; cả aggregate lẫn danh sách rows đều resolve `auth.uid()`, active role và recursive organization scope trước khi trả dữ liệu. Hoàn thành là `ACCEPTED + EXEMPTED`; rate được tính ở PostgreSQL. `PENDING` quá hạn được hiển thị/count như overdue bằng database clock, không mutate assignment.
- **Lý do:** Không được trả aggregate toàn campaign rồi hy vọng frontend ẩn đơn vị ngoài scope; cron overdue thuộc Phase 3 nhưng dashboard phải phản ánh đúng tình trạng hiện thời.
- **Đánh đổi:** Late metric có thể giao với trạng thái RESUBMITTED vì nguồn chân lý là `latest_submission.is_late`; điều này đúng workflow hơn việc ép nộp lại thành LATE_SUBMITTED.
- **Người quyết định:** Codex, theo P2-13.

## [2026-08-10] Export và bundle báo cáo dùng lại scope dashboard

- **Quyết định:** `export-report-status` và `download-report-bundle` bắt buộc gọi dashboard RPC bằng JWT của người dùng để lấy campaign/assignment trong scope và filter hiện tại. Service role chỉ dùng backend để đọc object private và ghi audit; không nhận organization/assignment scope do client tự gửi.
- **Lý do:** CSV/ZIP không được biến thành đường vòng để đọc toàn campaign hoặc lộ `storage_path`; scope phải được quyết định tại database trước khi tải dữ liệu.
- **Đánh đổi:** Bundle chỉ lấy submission mới nhất mỗi assignment; object thiếu, metadata lệch, trùng tên ZIP hoặc vượt 100 file/50 MB đều fail-closed thay vì trả gói một phần.
- **Người quyết định:** Codex, theo P2-14.

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

## [2026-08-09] Review báo cáo atomic và notification trong RPC

- **Quyết định:** `review_report_assignment` là trusted path duy nhất cho ACCEPTED, NEEDS_SUPPLEMENT và EXEMPTED; function khóa assignment, kiểm scope/transition/reason, cập nhật review metadata, ghi history/audit và tạo notification trong cùng transaction. Edge Function không còn insert notification best-effort.
- **Lý do:** Không được để assignment/submission đổi trạng thái mà thiếu history, audit hoặc notification; `FOR UPDATE` cũng làm stale review fail-closed thay vì ghi đè quyết định mới.
- **Đánh đổi:** Notification exemption fan-out tới các BRANCH_OFFICER ACTIVE trong organization; chưa xây history UI đầy đủ hoặc dashboard review.
- **Người quyết định:** Codex, theo P2-10 handoff security/atomicity.

## [2026-08-09] Submission history dùng expected-version và namespace vN

- **Quyết định:** Giữ upload staging của P2-09, nhưng submit-report tính version kế tiếp từ dữ liệu server, move object sang `{campaign}/{org}/{assignment}/vN/`, rồi gọi RPC overload có `p_expected_version`. RPC khóa assignment, từ chối expected version cũ, lưu metadata/history/audit/notification cùng transaction; resubmit sau NEEDS_SUPPLEMENT vẫn được phép dù `allow_resubmission=false`.
- **Lý do:** Bảo đảm không duplicate/skip version khi double-click hoặc retry, không ghi đè file cũ, và giữ dữ liệu version cũ read-only trong khi tái sử dụng trusted submit path P2-09.
- **Đánh đổi:** Storage move và database transaction không phải một distributed transaction; Edge Function rollback move về staging khi RPC fail, còn RPC atomic hóa toàn bộ metadata nghiệp vụ. Signed URL chỉ tạo lazy từ path versioned đã được RLS kiểm soát.
- **Người quyết định:** Codex, theo P2-11 handoff versioning/concurrency.

## [2026-08-10] Submission RPC tự xác minh finalized Storage object

- **Quyết định:** Chỉ cấp `authenticated` quyền gọi overload 5 tham số có expected-version của
  `create_report_submission_with_files`. RPC phải xác minh object vN tồn tại trong bucket private,
  path/scope/policy file hợp lệ và size/mimetype khớp Storage trước khi ghi metadata; overload 4 tham
  số bị thu hồi khỏi API end-user.
- **Lý do:** JWT người dùng cần đi qua RPC để giữ `auth.uid()` nhưng không được phép bypass trusted
  Edge Function bằng PostgREST và tạo submission trỏ tới object giả hoặc bỏ stale-version guard.
- **Đánh đổi:** pgTAP positive fixture phải tạo `storage.objects` thực; Storage move và DB transaction
  vẫn cần compensating rollback ở Edge vì không có distributed transaction.
- **Người quyết định:** Codex, theo P2-15 final acceptance blocker P1.

## [2026-08-11] P3-01 notification foundation dùng trusted event identity

- **Quyết định:** notifications bổ sung source_entity_type, source_entity_id và unique nullable
  event_key; submit/review/publish RPC tự resolve recipient và ghi notification trong cùng
  transaction. Campaign publish gửi đúng BRANCH_OFFICER ACTIVE của organization assignment;
  submit v1 dùng REPORT_SUBMITTED, v2+ dùng REPORT_RESUBMITTED; review giữ recipient P2 đã
  nghiệm thu.
- **Lý do:** Frontend không được spoof recipient_user_id, retry không được tạo notification
  trùng, và event phải truy ngược được về entity nghiệp vụ.
- **Đánh đổi:** Không retroactively gán identity cho notification legacy ngoài các workflow được
  thay thế; chưa bật realtime hoặc email side-effect trong P3-01.
- **Người quyết định:** Codex theo đặc tả P3-01 và P3-00 handoff.

## [2026-08-11] P3-01 notification access boundary và action URL

- **Quyết định:** Authenticated chỉ có SELECT notification dưới RLS auth.uid() + account ACTIVE;
  thu hồi INSERT/UPDATE/DELETE trực tiếp. Mark-read và mark-all là SECURITY DEFINER RPC với
  search_path=public, chỉ cập nhật read_at, idempotent và trả false/0 cho owner khác hoặc
  account suspended. action_url phải là app-relative route thuộc allowlist; frontend vẫn
  loại URL không an toàn trước khi navigate.
- **Lý do:** Grant UPDATE toàn bảng là quá rộng; deep-link từ dữ liệu notification là trust
  boundary và không được trở thành open redirect/XSS.
- **Đánh đổi:** Inbox không realtime; badge tải lại theo session/user id và cập nhật khi mở inbox.
- **Người quyết định:** Codex theo đặc tả P3-01.

---

## Template cho entry mới

```
## [YYYY-MM-DD] Tiêu đề quyết định

- **Quyết định:** <mô tả>
- **Lý do:** <vì sao chọn hướng này>
- **Đánh đổi:** <cái gì bị đánh đổi>
- **Người quyết định:** <user / Claude / Codex>
```
# P3-02 queue lifecycle and ownership token

- Decision: email_queue uses PENDING -> PROCESSING -> SENT/RETRY and RETRY ->
  PROCESSING; FAILED is terminal, while legacy CANCELLED remains terminal. Claim uses
  FOR UPDATE SKIP LOCKED, a batch cap of 50, deterministic order, database time, claim
  token, worker id and lease. Completion/retry requires the current token; expired leases
  are reclaimed in the claim transaction and old tokens are rejected.
- Reason: the old SELECT-then-UPDATE worker raced, stale workers could overwrite a new
  owner, and fixed retry timing was not observable. Ownership belongs in the database.
- Trade-off: the database guarantees one logical enqueue, one active claim and finite
  retries; provider timeout ambiguity/exactly-once delivery waits for the provider adapter.

# P3-02 trusted enqueue and provider boundary

- Decision: only service_role can call enqueue_email_for_user_event. The RPC resolves
  email/name from auth.users plus ACTIVE profile, computes the idempotency key from
  template/source/recipient/revision, bounds JSON payloads and rejects HTML keys.
  email_queue/email_logs have no direct anon/authenticated privileges. The old
  process-email-queue endpoint is disabled with EMAIL_PROVIDER_DEFERRED until P3-03.
- Reason: frontend callers must not choose recipient, template, subject/html or an
  idempotency key; P3-02 must not silently send real email or implement reminders.
- Trade-off: legacy producers such as send-reminder remain a separate scope; business
  transactions do not depend on an asynchronous email insert.
# P3-03 Resend adapter and safe renderer

- Decision: use one direct Resend HTTPS REST adapter in the trusted Edge Function worker.
  It sends JSON with configured sender, plain text, escaped HTML, `User-Agent` and stable
  `Idempotency-Key: email:{queue_id}`; it maps provider status to a normalized retryable or
  permanent error and persists only bounded metadata.
- Reason: Resend matches the existing provider direction and documents a small REST contract,
  provider message ID and idempotency support. Centralizing the adapter avoids a worker that
  knows provider-specific HTTP details or leaks raw responses.
- Trade-off: Resend idempotency retention is provider-scoped/limited, so ambiguous timeout
  can still duplicate physical delivery after that window. Live sender/domain verification
  remains a manual rehearsal gate.

# P3-03 template and invocation boundary

- Decision: P3-03 initially allowlisted only SYSTEM_EMAIL_TEST; P3-04 extends the same renderer
  contract with report-event templates. Render server-side structured payload into
  bounded subject/text/HTML, escape all user-controlled HTML fields, sanitize CR/LF/header-like
  subject content, and build links only from trusted APP_URL plus app-relative paths. Worker
  invocation requires an exact CRON_SECRET comparison and service_role client; no frontend
  caller can trigger arbitrary sends.
- Reason: P3-03 proves the provider path without reintroducing arbitrary HTML, external links or
  sender spoofing; P3-04 keeps report events on the same allowlisted boundary.
- Trade-off: reminder/cron and live receipt are deferred; technical status can be PASS while final
  task status remains PASS_WITH_REHEARSAL_BLOCKED.

# P3-04 trusted report event email hooks

- Decision: Do not add a frontend send-email request or a general event bus. Trusted report
  notifications that already resolved a recipient pass through a backend-only trigger, call the
  existing `enqueue_email_for_user_event` RPC, and derive the queue revision from the event key.
- Reason: Keep the business mutation, in-app notification and secondary email enqueue on the same
  database transaction boundary; retries cannot create duplicate queue rows; clients cannot choose
  an email address or recipient.
- Trade-off: Email remains secondary. Missing recipients or enqueue errors are recorded in a bounded
  audit row and do not fail the report mutation. P3-03R physical delivery evidence is not repeated.

# P3-05 deterministic report reminder engine

- Decision: Use a trusted `scan_report_reminders(as_of)` RPC with a server-supplied reference
  time. Scan only `PUBLISHED`/open campaigns and `PENDING`, `OVERDUE` or `NEEDS_SUPPLEMENT`
  assignments according to the bounded `reminder_policy` format (`due_soon_days`, `overdue`,
  `needs_supplement`). Effective due time is `coalesce(due_at_override, campaign.due_at)`;
  `SUBMITTED`/`RESUBMITTED` waiting for review and terminal `ACCEPTED`/`EXEMPTED`/`CLOSED` are
  excluded.
- Reason: Reminder eligibility must be deterministic and use the authoritative assignment
  state/due override, while leaving timezone scheduling and persisted overdue transitions to P3-06.
- Trade-off: Unsupported policy values are ignored fail-safe instead of rejected at campaign write
  time. A valid in-app recipient with a missing/invalid email receives the mandatory notification
  while the secondary email is marked skipped for later repair.

# P3-05 logical event and recipient boundary

- Decision: Persist one `report_reminder_events` row per
  `assignment + recipient + reminder_type + policy milestone`; enforce uniqueness in the database,
  then create the in-app notification and use the backend-only reminder trigger to call the
  existing server-resolved email enqueue RPC. Recipient fan-out is limited to ACTIVE
  `BRANCH_OFFICER` profiles in the assignment organization with a matching role scope.
- Reason: Concurrent scanners must converge on one logical event without trusting a client
  recipient or relying on application-level SELECT-then-INSERT. The event row also links the
  notification, queue row and bounded skip evidence.
- Trade-off: This guarantees exactly-once logical reminder creation, not exactly-once physical
  provider delivery. Queue failures are secondary and remain visible as `SKIPPED`; no automatic
  repair worker or scheduler is introduced in P3-05.

## [2026-08-14] P3-R1 email delivery safety gate defaults to OFF, LIVE is opt-in only

- **Quyết định:** `process-email-queue` reads `EMAIL_DELIVERY_MODE` before doing anything else.
  `OFF` (including missing/empty/unrecognized values) returns immediately without calling
  `claim_email_queue` or constructing a provider client. `ALLOWLIST` claims and renders as normal
  but gates every row's `recipient_email` against a normalized, exact-match `EMAIL_TEST_RECIPIENTS`
  list before the provider is ever invoked; a non-match is marked terminal `FAILED` with
  `RECIPIENT_NOT_ALLOWLISTED` via the existing `mark_email_retry(retryable=false)` path, never
  retried. `LIVE` is the only mode that reaches the unrestricted P3-03 send path, and it is only
  reachable by that exact string — never a default or a fallback for a misconfigured value.
- **Lý do:** P3-04/P3-05 opened the renderer allowlist from one inert `SYSTEM_EMAIL_TEST` template
  to eight live report/reminder templates, so P3-03's implicit "nothing renders, nothing sends"
  safety net no longer exists once a worker is invoked. Before P3-06 introduces a scheduler that
  can invoke the worker automatically and repeatedly, an explicit env-gated switch must exist so a
  misconfigured or accidentally-triggered invocation cannot send real email.
- **Đánh đổi:** Every deploy target must set `EMAIL_DELIVERY_MODE` deliberately; forgetting it is
  safe (falls back to `OFF`) but means no email at all, including rehearsal. `ALLOWLIST` still
  calls the real provider for allowlisted recipients, so it is not a full offline/dry-run mode —
  only a recipient-scoping guard.
- **Người quyết định:** Claude (Sonnet), theo yêu cầu remediation P3-R1 trước khi giao P3-06.

## [2026-08-14] P3-R1 report_reminder_events milestone keyed by review cycle, not assignment

- **Quyết định:** `REPORT_SUPPLEMENT_REMINDER`'s policy milestone changed from the fixed literal
  `NEEDS_SUPPLEMENT` to `NEEDS_SUPPLEMENT:v{latest_submission_version}`, computed from
  `report_submissions.version_number` for the assignment at the moment `create_report_reminder_event`
  runs. The unique `logical_key` (and therefore the email idempotency key derived from it) now
  changes across review cycles instead of being fixed for the assignment's entire lifetime.
- **Lý do:** The previous key meant an assignment could receive at most one
  `REPORT_SUPPLEMENT_REMINDER` ever — a resubmission that earned a second NEEDS_SUPPLEMENT decision
  produced no reminder at all, because the unique constraint on `logical_key` silently treated it
  as the same logical event as the first cycle. This is the exact scenario reminders exist to catch
  (an unresponsive branch across multiple review rounds).
- **Đánh đổi:** Requires a `report_submissions` row to exist for the assignment before a
  NEEDS_SUPPLEMENT reminder can be created (an assignment reaching that status without one is
  treated as fail-safe skip, not an error); this is already guaranteed by the real
  `review_report_assignment` transition path. No historical `report_reminder_events` row is
  edited — old milestones remain queryable exactly as they were created.
- **Người quyết định:** Claude (Sonnet), theo yêu cầu remediation P3-R1.

## [2026-08-14] P3-R1 email_queue source entity stored at enqueue, not patched afterward

- **Quyết định:** `enqueue_email_for_user_event` now inserts `source_entity_type`/`source_entity_id`
  directly into the `email_queue` row it creates. The P3-05 reminder trigger's compensating
  `update public.email_queue set source_entity_type = ..., source_entity_id = ...` after calling
  the RPC is removed.
- **Lý do:** The RPC already validated and used both parameters to build the idempotency key but
  never persisted them, so every P3-04 report-event queue row had `NULL` source columns and only
  P3-05 reminder rows were usable for traceability, via a workaround patch outside the RPC's own
  transaction boundary. Two parallel ways to set the same columns is a correctness risk.
- **Đánh đổi:** None functionally; this is a bug fix at the correct layer. Existing rows enqueued
  before this migration keep whatever source columns they already had (untouched, forward-only).
- **Người quyết định:** Claude (Sonnet), theo yêu cầu remediation P3-R1.

## [2026-08-14] P3-06 cron scheduled via pg_cron calling DB functions directly, not HTTP

- **Quyết định:** The two daily jobs (`mark_overdue_assignments`, `scan_report_reminders`) are
  scheduled with `pg_cron`'s `cron.schedule(jobname, cron_expr, sql)`, where the SQL body is a
  direct `select public.<function>();` call. No `pg_net`/HTTP call to an Edge Function, no
  `CRON_SECRET` or service-role key in the migration.
- **Lý do:** Both functions are pure SQL RPCs with no external side effect (no email provider
  call). Calling them via HTTP would require embedding a shared secret or the service-role key in
  a migration to authenticate the request — forbidden by this project's rule against production
  secrets in migrations, and unnecessary complexity when the same database can just call its own
  function. This keeps the schedule fully forward-only, idempotent (`db reset`-safe) and testable
  in CI without any Supabase Secrets being configured.
- **Đánh đổi:** The existing `send-reminder` Edge Function (CRON_SECRET-gated, wraps
  `scan_report_reminders`) is no longer the production trigger path for the daily scan — it
  remains in the repo unchanged as a manual/ops invocation tool (e.g. for rehearsal, or as a
  fallback if a given Supabase project ever cannot enable `pg_cron`). No equivalent Edge Function
  was added for `mark_overdue_assignments`; if one becomes necessary later it can mirror
  `send-reminder`'s pattern exactly.
- **Người quyết định:** Claude (Sonnet), theo yêu cầu P3-06.

## [2026-08-14] P3-06 cron times fixed in UTC for Asia/Ho_Chi_Minh, no scheduler-side TZ config

- **Quyết định:** `report_mark_overdue_daily` runs at `5 17 * * *` UTC and
  `report_reminder_scan_daily` runs at `0 0 * * *` UTC — the fixed UTC-equivalents of 00:05 and
  07:00 Asia/Ho_Chi_Minh (product spec §12.1). No per-job timezone parameter is used.
- **Lý do:** Vietnam (ICT, UTC+7) observes no daylight saving time, so a fixed UTC offset is exact
  year-round and needs no dynamic timezone conversion or maintenance. `pg_cron` schedules are
  interpreted in UTC by default in both the Supabase local dev image and Supabase Cloud, matching
  this project's `to_char(... at time zone 'Asia/Ho_Chi_Minh', ...)` convention already used
  elsewhere in the reminder email payload (P3-05).
- **Đánh đổi:** If Vietnam ever adopted DST (it has not, historically), these two literal
  cron expressions would need a manual forward-fix migration; this is judged acceptable given the
  country's actual, decades-long practice.
- **Người quyết định:** Claude (Sonnet), theo yêu cầu P3-06.

## [2026-08-14] P3-06 does not schedule the email worker (process-email-queue)

- **Quyết định:** Only the overdue sweep and the reminder scan are installed as cron jobs. The
  email queue worker (`process-email-queue`, which actually calls the Resend provider once
  `EMAIL_DELIVERY_MODE` allows it) is left exactly as it was: a manually/externally triggered
  Edge Function, not on any automatic schedule.
- **Lý do:** P3-06's mandate (docs/brain/04-current-tasks.md) is "chốt timezone scheduler, trusted
  schedule và persisted overdue transition" for the state-machine/reminder-generation side.
  Automatically scheduling the worker that can put real messages in front of real inboxes is a
  materially bigger, harder-to-reverse operational decision (rule 23 forbids enabling
  `EMAIL_DELIVERY_MODE=LIVE` or sending live email in this task) and belongs with a later live
  rehearsal phase, not bundled silently into cron installation.
- **Đánh đổi:** Until a later phase schedules it, enqueued reminder/report emails only get sent
  when someone manually invokes `process-email-queue` (or wires an external scheduler to it).
  This is the same operational state the repo was already in before P3-06.
- **Người quyết định:** Claude (Sonnet), theo yêu cầu P3-06 (giữ đúng phạm vi, không tự mở rộng).

## [2026-08-15] P3-08 schedules the email worker via pg_cron → pg_net → existing Edge Function

- **Quyết định:** Add exactly one new `pg_cron` job, `email_queue_worker` (`*/10 * * * *`), whose
  body calls `net.http_post` (Supabase `pg_net` extension) against the existing
  `process-email-queue` Edge Function URL, sending the same `x-cron-secret` header that function
  already validates with `hasTrustedWorkerSecret()` (P3-03, unchanged). Both the target URL and
  the secret value are read at execution time from Supabase Vault
  (`vault.decrypted_secrets`, names `email_queue_worker_url` / `email_queue_worker_cron_secret`)
  — never a literal in the migration. No new Edge Function, no second worker, no second queue, no
  change to `EMAIL_DELIVERY_MODE`/claim/retry/provider code from P3-02/P3-03/P3-R1.
- **Lý do:** `process-email-queue` is the only component holding the provider secret and enforcing
  the P3-R1 delivery-mode gate; pg_cron cannot call it directly like it calls the two pure-SQL
  P3-06 RPCs (`mark_overdue_assignments`, `scan_report_reminders`), because an Edge Function
  invocation is an HTTP call, not a database function call. Reimplementing queue-claim + provider
  call as a second in-database worker (to keep pg_cron's "call a DB function" pattern from P3-06)
  would duplicate the safety gate and risk it drifting from the one already reviewed and shipped.
  `pg_net` + Vault is the pattern Supabase's own docs recommend for exactly this case (cron → Edge
  Function, secret never in the migration), and it keeps the trusted-header auth model P3-03
  already implemented instead of inventing a second auth mechanism.
- **Đánh đổi:** `net.http_post` is fire-and-forget/async — pg_cron's `cron.job_run_details` proves
  the scheduling tick fired, not that the HTTP call or the downstream send succeeded; that requires
  `net._http_response`, the Edge Function's own logs, or `email_queue`/`email_logs` state (existing
  P3-02 tables; no new observability code added). The two Vault secrets must be provisioned once
  per environment via a manual, non-committed SQL step (`vault.create_secret(...)`) run directly
  against that environment's database — CI/local dev/db reset run with those secrets unset, so the
  job body resolves a NULL URL and the async call fails harmlessly (it cannot fail a migration,
  `db reset`, or a test run) until an operator provisions them. Batch size, retry backoff and max
  attempts are unchanged (P3-02 defaults, already bounded); this migration does not tune them.
- **Người quyết định:** Claude (Sonnet), theo yêu cầu P3-08.

## [2026-08-24] P5-R0 canonical Phase 5 baseline

- **Quyết định:** `knowledge_articles` là canonical reviewed knowledge model. Mỗi row là một
  article revision gắn bắt buộc với `document_id` và `document_version_id`; approved content không
  sửa in-place. `knowledge_wikis`/`knowledge_wiki_versions` không được tạo trong baseline mới.
- **Quyết định:** Giữ `document_versions` và `document_sources` làm provenance layer bất biến;
  tiến hóa `document_chunks` in-place thành selective evidence để không duy trì một bảng chunk/evidence
  song song. `knowledge_embeddings` là secondary index tùy chọn, model/dimension-aware, chỉ dành cho
  approved + retrieval-enabled content và không cấp quyền bảng cho client.
- **Quyết định:** `ingestion_jobs`/`ingestion_events` là queue backend-only với idempotency key,
  atomic `SKIP LOCKED` claim, lease, stale reclaim, bounded retry và append-only events. Queue không
  được thay đổi `documents.status`; P5-03 extraction và AI generation vẫn ngoài scope.
- **Quyết định:** Google Drive chỉ là provider sau `StorageProvider` contract. Gateway kiểm tra
  authorization trước khi gửi locator đến provider; credential chỉ ở backend secret runtime, không
  lưu trong DB/log/frontend và không tạo public sharing.
- **Lý do:** Hợp nhất có chọn lọc các primitive tốt của stacked #31/#32/#33 trên exact
  `origin/master`, loại bỏ lineage obsolete và chặn drift giữa publication, ingestion, review và retrieval.
- **Đánh đổi:** Các trường/luồng legacy của `document_chunks` và `match_document_chunks()` được giữ
  đủ để Phase 1–4 tests không bị xóa hoặc yếu đi; P5 retrieval mới sẽ dùng evidence/embeddings qua
  trusted API ở task sau.

## [2026-08-25] P5-03 deterministic extraction and reviewed article generation

- **Quyết định:** P5-03 lưu extraction artifact riêng, private và gắn một-một với immutable
  `document_version`; `document_chunks` tiếp tục là bảng selective evidence canonical. Không tạo
  `article_chunks`, không embedding, retrieval hoặc ask-ai.
- **Quyết định:** External AI eligibility là cờ `documents.ai_processing_allowed`, mặc định false.
  Edge Function phải authorize scoped content admin trước khi đọc provider, kiểm tra SHA-256 của
  bytes với version/source checksum, rồi mới gọi Gemini. Source classification không đủ điều kiện
  thì fail closed.
- **Quyết định:** `KnowledgeGenerator` trả structured JSON; batching giữ toàn bộ page boundaries,
  validation flag literal số/ngày không xuất hiện trong source, và evidence chỉ được backend copy
  từ exact extracted text. AI không được tự tạo citation.
- **Quyết định:** Generation job dùng `document_version + article_key + generator_version` làm
  idempotency key. Retry cùng profile tái sử dụng attempt; regeneration phải có key explicit và
  tạo revision/attempt mới. Draft luôn `PENDING_REVIEW`; approve/reject đi qua trusted RPC có audit.

## [2026-08-26] P5-03 internal function privilege contract

- **Quyết định:** Các function P5 `RETURNS trigger` là implementation nội bộ; forward migration
  `20260825154300` thu hồi toàn bộ quyền `EXECUTE` từ `PUBLIC`, `anon` và `authenticated` theo
  đúng full signature. Không grant lại `service_role` vì các function này không phải RPC.
- **Quyết định:** Giữ explicit authenticated `EXECUTE` chỉ cho RPC có UI contract
  `review_knowledge_article` và `set_document_ai_processing_allowed`; worker/ingestion routines
  tiếp tục service-role-only.
- **Lý do:** PostgreSQL cấp `EXECUTE` cho `PUBLIC` mặc định. Rehearsal catalog audit xác định 16
  P5 trigger functions đã thừa hưởng quyền này dù trigger bindings vẫn phải tiếp tục chạy.
- **Đảm bảo:** Regression pgTAP inventory trigger functions từ catalog P5 để chặn helper trigger
  mới quay lại default-open; test source insertion tiếp tục tạo ingestion job. SECURITY DEFINER
  P5 đã có `search_path=public`, nên migration không thay function body hay semantics.

## [2026-08-31] P5 cited retrieval is RLS-first and embedding-optional

- **Quyết định:** `ask-ai` truy vấn `search_published_knowledge()` bằng `userClient` trước khi
  dùng service role để persist conversation/message. RPC là `SECURITY INVOKER`, chỉ trả approved,
  current, retrieval-enabled article evidence; do đó RLS của caller lọc source trước model call.
- **Quyết định:** Bật retrieval cho document và article là hai trusted scoped-admin RPC riêng.
  Không bật mặc định khi approve, không tạo embedding tự động, và không cho PUBLISHED/superseded
  state bị thay đổi cùng thao tác này.
- **Quyết định:** Citation được persist dưới `source_kind = 'EVIDENCE'`, để trigger provenance
  điền lại canonical document/version; browser chỉ nhận document route, không nhận storage path,
  signed URL hay provider locator.
- **Lý do:** Khép vòng reviewed evidence → retrieval → answer → citation mà không dùng service
  role như retrieval bypass và không làm vector index trở thành source of truth.
