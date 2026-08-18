# 01 — Architecture

> Kiến trúc chi tiết ở `docs/03-architecture.md`; mô hình dữ liệu đầy đủ ở `docs/01-product-spec.md`
> mục 8. File này là bản đồ vận hành + **Code Graph** để agent đọc trước khi sửa.

## Stack

| Layer | Công nghệ (đã xác minh từ config/deps) |
|-------|----------------------------------------|
| Frontend | React 18 + Vite 6, React Router DOM 7, PWA (manifest + service worker) |
| Ngôn ngữ FE | JavaScript (ESM, `"type": "module"`), JSX — **không TypeScript ở frontend** |
| Backend | Supabase Edge Functions (Deno + TypeScript) |
| Database | Supabase PostgreSQL + RLS + pgvector; RPC `security definer` |
| Auth | Supabase Auth (GoTrue) |
| Storage | Supabase Storage remains the accepted provider for Phase 1–4 private flows. Phase 5 canonical sources use a provider-neutral locator; pilot bytes are planned for personal Google My Drive through a trusted backend, never public Drive links. |
| AI | Gemini (embedding + trả lời) qua Edge Function `ask-ai` |
| Email | Brevo/Resend/SMTP qua `email_queue` + `process-email-queue` |
| Hosting | Vercel (hoặc Mắt Bão) với SPA rewrite; xem `vercel.json` |
| Client libs | `@supabase/supabase-js`, `dompurify` |

## Cấu trúc thư mục chính

```
src/
├── main.jsx                 # entry: mount App, đăng ký service worker (/sw.js)
├── App.jsx                  # BrowserRouter + toàn bộ khai báo route + Guards
├── index.css                # design tokens (Be Vietnam Pro, mobile-first) — nguồn màu/spacing
├── contexts/AuthContext.jsx # session/user/profile/roles + login/logout/hasRole
├── components/
│   ├── Guards.jsx           # AuthGuard, RoleGuard (+ getAuthGuardAction thuần, có test)
│   ├── Layout.jsx           # AppShell: Sidebar + BottomNav + Outlet
│   ├── NotificationBell.jsx # badge unread server-backed, user-keyed cache reset
│   ├── common.jsx           # Brand, EmptyState, SectionHeader...
│   ├── Icon.jsx             # line icon
│   ├── ErrorBoundary.jsx / Skeleton.jsx
├── pages/
│   ├── auth/                # Login, ForgotPassword, ResetPassword, ChangePassword (dùng Supabase)
│   ├── Home/Innovation/Profile.jsx  # HIỆN DÙNG MOCK
│   ├── Work.jsx             # đã nối reportService (Phase 2)
│   ├── Knowledge.jsx        # tab Văn bản + Chuyên đề đã nối service thật (P4-01/P4-03)
│   ├── Documents.jsx        # /tri-thuc/van-ban — list thật: search/filter/paginate (P4-01)
│   ├── DocumentDetail.jsx   # /tri-thuc/van-ban/:documentId — metadata, relations, signed download (P4-01)
│   ├── Notifications.jsx    # inbox/read state, safe deep-link, bounded pagination
│   └── Admin.jsx            # dashboard quản trị (dùng Supabase)
├── data/mock.js             # dữ liệu demo (campaigns, documents, topics, projects, problems)
├── lib/status.mjs           # REPORT_STATUS, getReportStatus, daysUntil, normalizeSafeFileName (có test)
├── lib/markdown.js          # render markdown an toàn (DOMPurify)
├── services/supabaseClient.js  # khởi tạo supabase client từ VITE_SUPABASE_*
├── services/reportAdminService.js # quản trị campaign + dashboard/export qua RPC/Edge Function
├── services/notificationService.js # read-only inbox/count + mark-read RPC boundary
├── services/quizService.js # safe metadata + trusted attempt lifecycle RPC boundary
├── services/learningAdminService.js # scoped topic/resource admin RPC + private Storage boundary
├── services/quizAdminService.js # scoped quiz/question/option authoring RPC boundary
├── pages/AdminLearningTopics.jsx # /admin/chuyen-de list + draft creation
├── pages/AdminLearningTopicDetail.jsx # topic metadata/resources/quizzes
└── pages/AdminQuizEditor.jsx # quiz/question/option authoring + publish

supabase/
├── migrations/              # ordered schema/RLS/RPC migrations
├── seed.sql                 # dữ liệu seed local (gồm auth.users cho GoTrue)
├── tests/rls_acceptance.sql # test RLS
└── functions/
    ├── _shared/             # auth.ts, http.ts, validation.ts — dùng chung mọi function
    └── <13 functions>/      # submit-report, review-report, ask-ai, process-document, ...
```

## Code Graph (bản đồ module)

> **Đọc kỹ trước khi sửa.** Cập nhật lại MỖI KHI thay đổi route, Guard, luồng auth, hoặc thêm
> Edge Function / service.

### Frontend — module then chốt

| Module / file | Vai trò | Được gọi bởi | Phụ thuộc vào |
|---------------|---------|--------------|---------------|
| `src/components/NotificationBell.jsx` | Unread badge và điều hướng inbox | `Layout.jsx` | `notificationService`, `AuthContext`, Supabase anon client |
| `src/pages/Notifications.jsx` | Inbox thông báo, loading/empty/error, mark-read/mark-all, pagination và deep-link | route `/ca-nhan/thong-bao` | `notificationService`, `AuthContext`, `Icon`, `common` |
| `src/services/notificationService.js` | Query rows/count dưới RLS; gọi mark-read RPC; loại action URL không an toàn | `NotificationBell`, `Notifications` | Supabase client |
| `src/main.jsx` | Entry, mount, đăng ký SW | (trình duyệt) | `App.jsx`, `index.css` |
| `src/App.jsx` | Khai báo route + bọc Guard | `main.jsx` | `AuthContext`, `Guards`, `Layout`, mọi `pages/*` |
| `src/contexts/AuthContext.jsx` | Session/user/profile/roles, `login/logout/hasRole` | `App`, mọi component gọi `useAuth` | `services/supabaseClient` |
| `src/services/supabaseClient.js` | Client Supabase (anon key) | `AuthContext`, `pages/auth/*`, `pages/Admin` | `VITE_SUPABASE_URL/ANON_KEY` |
| `src/components/Guards.jsx` | `AuthGuard` (chặn chưa đăng nhập/inactive), `RoleGuard` | `App.jsx` | `useAuth`, react-router |
| `src/components/Layout.jsx` | `AppShell`: Sidebar + BottomNav + `<Outlet/>` | `App.jsx` (trong AuthGuard) | `useAuth`, `Icon`, `common` |
| `src/pages/*` (5 khu vực) | UI khu vực | routes trong `App.jsx` | `data/mock.js`, `useAuth`, `common` |
| `src/data/mock.js` | Dữ liệu demo | 5 pages chính | — (⚠ thay bằng service khi nối Supabase) |
| `src/lib/status.mjs` | Nhãn/tone trạng thái báo cáo, tính hạn, chuẩn hóa tên tệp | pages hiển thị báo cáo | — (thuần, có unit test) |
| `src/services/reportAdminService.js` | Đọc campaign trong scope; tạo/sửa draft, upload/finalize template và publish | `AdminReports` | Supabase RPC + Storage private + `finalize-campaign-template` |
| `src/pages/AdminReports.jsx` | Danh sách/form quản trị đợt báo cáo, chọn đơn vị, xác nhận phát hành | routes `/admin/bao-cao*` | `reportAdminService`, `reportAdmin.mjs`, `Auth`/`RoleGuard` |
| `src/pages/AdminReportDashboard.jsx` | Aggregate, filter/search và tải CSV/ZIP theo filter hiện tại | route `/admin/bao-cao/:campaignId/dashboard` | `reportAdminService`, dashboard helpers, Blob download |
| `src/services/quizService.js` | Safe quiz metadata, safe question mapper, trusted attempt/result RPC boundary; không yêu cầu answer key trước submit | `Quiz`, `LearningTopicDetail` | Supabase RPC/RLS, UUID/business-error validation |
| `src/pages/Quiz.jsx` | Intro → attempt → result UI, loading/error/limit/expiry/double-submit states | route `/tri-thuc/trac-nghiem/:quizId` | `quizService`, `Icon`, `common`, `Skeleton` |
| `src/services/learningAdminService.js` | Scoped topic/resource admin reads, RPC mutations, upload compensation | `AdminLearningTopics`, `AdminLearningTopicDetail` | Supabase RPC + private Storage |
| `src/services/quizAdminService.js` | Scoped quiz metadata/authoring reads and all quiz/question/option mutations | `AdminLearningTopicDetail`, `AdminQuizEditor` | Supabase RPC/RLS; answer key only admin-scoped |
| `src/pages/AdminLearningTopics.jsx` | Admin topic list/filter/create with loading/error/empty states | route `/admin/chuyen-de` | `learningAdminService`, `RoleGuard`, `common` |
| `src/pages/AdminLearningTopicDetail.jsx` | Topic edit/publish, resource CRUD/upload/reorder, quiz list/create | route `/admin/chuyen-de/:topicId` | learning/quiz admin services, private Storage |
| `src/pages/AdminQuizEditor.jsx` | Quiz metadata, SINGLE/MULTIPLE questions/options and publish/close | route `/admin/chuyen-de/:topicId/trac-nghiem/:quizId` | `quizAdminService`, `RoleGuard`, `common` |

### Backend (Edge Functions) — module then chốt

| Module / file | Vai trò | Được gọi bởi | Phụ thuộc vào |
|---------------|---------|--------------|---------------|
| `functions/_shared/auth.ts` | `clients()`→{userClient, adminClient}; `requireUser`, `requireGlobalRole`, `requireScopedRole` | **mọi** Edge Function | `@supabase/supabase-js`, env `SUPABASE_*` |
| `functions/_shared/http.ts` | `corsHeaders`, `json`, `errorResponse`, `readJson` | mọi Edge Function | — |
| `functions/_shared/validation.ts` | `assertUuid`, `fileExtension`, `safeText` | các function nhận input | — |
| `src/services/reportService.js` | Factory `createReportService(supabase)`; mapper assignment/submission history; query RLS, upload/remove Storage private, invoke `submit-report`/`review-report` | P2-08/P2-09/P2-10/P2-11 | `src/lib/status.mjs`, Supabase client được caller truyền vào |
| `src/services/documentService.js` | Factory `createDocumentService(supabase)`; list phân trang/filter server-side, detail, relations, signed URL ngắn hạn theo yêu cầu (P4-01). Validate toàn bộ input **trước** khi dựng query | `Documents`, `DocumentDetail`, `Knowledge` | `src/lib/documentDisplay.mjs`, RLS `can_access_document`, bucket `documents-private` |
| `src/lib/documentDisplay.mjs` | Format ngày, nhãn quan hệ, tone trạng thái hiệu lực, thông điệp lỗi (thuần, có test) | `Documents`, `DocumentDetail`, `Knowledge` | — |
| `functions/submit-report` | Xác minh object staging thật + quyền/tệp → move sang namespace `vN` → RPC expected-version; RPC xác minh lại object/size/mime ở Storage trước atomic metadata/history/notification | client (khi đã nối) | `_shared/*`, Storage, RPC, bảng report_* |
| `functions/review-report` | Xác thực request rồi gọi RPC review; RPC atomic hóa transition, review metadata, history, audit và notification | client admin | `_shared/*`, `review_report_assignment`, RLS |
| `functions/finalize-campaign-template` | Đọc metadata thật từ Storage, chuẩn hóa tên, move template và đăng ký metadata | `reportAdminService` | `_shared/*`, service-role Storage, `register_report_campaign_template` |
| `functions/export-report-status` | CSV UTF-8/BOM scoped, formula-neutralized, audit bắt buộc | `AdminReportDashboard` qua `reportAdminService` | dashboard RPC, `_shared/*`, `audit_logs` |
| `functions/download-report-bundle` | ZIP latest submission/file trong scope, private Storage, giới hạn 100 file/50 MB, audit | `AdminReportDashboard` qua `reportAdminService` | dashboard RPC, service-role Storage, `fflate`, `_shared/*` |
| `functions/ask-ai` | ⚠️ **KHUNG CHƯA REVIEW — P5-00 kết luận DROP.** Chưa từng deploy/chạy, 0 test. Có lỗi ghi xuyên hội thoại (không kiểm sở hữu `conversation_id` trên đường service role), không kiểm `account_status`, không quota/rate limit, không phòng thủ prompt injection. **Không dùng làm mẫu.** Viết lại ở P5-06. | (không ai gọi) | `_shared/*`, `match_document_chunks`, Gemini |
| `functions/process-document` | ⚠️ **KHUNG CHƯA REVIEW — P5-00 kết luận DROP.** Chunk toàn văn + embed tất cả (kiến trúc đã bị bác bỏ). Kiểm quyền toàn cục thay vì theo scope tổ chức; nhận `extracted_text` từ client ghi dưới danh nghĩa văn bản chính thức; ghi thẳng `documents.status` bỏ qua RPC + `audit_logs` của Phase 4; chỉ đọc `.txt`; chắc chắn timeout. **Không dùng làm mẫu.** Thay bằng job pipeline ở P5-02/P5-03. | (không ai gọi) | `_shared/*`, Gemini |
| `functions/run-ingestion-jobs` | P5-02 cron-only NO_OP worker: exact `x-cron-secret` before service client/claim; claims a bounded leased batch and completes it without Drive/AI/file calls | `pg_cron` → `pg_net`, trusted operator | service-role RPC `claim_ingestion_jobs` / `complete_ingestion_job` / `fail_ingestion_job` |
| `functions/_shared/storage/*` | P5-02R minimal `StorageProvider`: opaque locator validation, typed retry semantics and Google My Drive read/metadata/create/delete using a server-side refresh token | P5-02R synthetic rehearsal; P5-03 ingestion (not started) | Edge Function secrets, Google Drive API; `authorizedSourceGateway` requires Supabase authorization before provider call |
| `functions/send-reminder` / `process-email-queue` | Gọi reminder scan trusted / gửi email theo batch | `send-reminder`: trusted caller manual/external. `process-email-queue`: manual/external **và** `pg_cron` job `email_queue_worker` mỗi 10 phút qua `pg_net`+Vault (P3-08) | `_shared/*`, reminder RPC, email_queue |

### Luồng xử lý chính

```
# Auth + phân quyền (đang hoạt động thật)
main.jsx → App(BrowserRouter) → AuthProvider(getSession + onAuthStateChange
         → fetch profiles + user_roles) → AuthGuard(getAuthGuardAction)
         → RoleGuard(allowedRoles | SYSTEM_ADMIN) → AppShell → <page>

# Nộp báo cáo (đích, khi frontend hết mock)
Page nộp → reportService (Storage private upload dưới prefix assignment/staging)
         → invoke Edge Function submit-report
         → clients()/requireUser → validate assignment+Storage object thật + expected latest version
         → Storage move staging → {campaign}/{org}/{assignment}/vN/{uuid-safe}
         → RPC create_report_submission_with_files(..., p_expected_version) (atomic, versioned,
           bắt buộc object vN tồn tại + metadata khớp Storage; overload 4 tham số không cấp cho user)
         → create_report_submission (internal core, không cấp execute cho user)
         → file metadata + history + audit + notification cùng transaction
         → stale/error thì move object về staging và trả conflict

# Dọn staging (chỉ object chưa finalize)
UI remove/reset → reportService.removeStagedReportFile(exact path)
              → Storage DELETE RLS
              → can_delete_report_staged_file()
                 → uploader + active account + own org/assignment + staging convention
                 → NOT EXISTS report_submission_files(storage_path)

# Review báo cáo (P2-10)
Admin UI → reportService.reviewReport → review-report (JWT user client)
             → review_report_assignment (SECURITY DEFINER + FOR UPDATE)
             → validate active/scope/action/current status/reason

# Tạo/phát hành đợt báo cáo (P2-12)
AdminReports → reportAdminService → RPC tạo/sửa draft + lấy đơn vị trong scope
             → upload template staging private → finalize-campaign-template (metadata Storage thật)
             → register_report_campaign_template → confirm → publish_report_campaign
             → lock campaign; insert assignment + history/audit; PUBLISHED atomically
             → update assignment + latest submission review fields
             → history + audit + in-app notification (cùng transaction)
             → UI refresh assignment/submission state; stale transition fail-closed

# Notification foundation (P3-01)
Trusted submit/review/publish RPC → recipient resolved from auth/workflow/active BRANCH_OFFICER scope
             → notifications(source_entity_type/source_entity_id/event_key) in same transaction
             → RLS SELECT only own active-account rows
Inbox/Bell → notificationService (bounded created_at DESC + id DESC query)
             → mark_notification_read / mark_all_notifications_read (read_at only)
             → safe app-relative action URL → mark read first → React Router deep-link

# Report event email hooks (P3-04)
Trusted report notification insert → `enqueue_report_email_from_notification` trigger
             → server-resolved auth.users email via `enqueue_email_for_user_event`
             → allowlisted REPORT_* queue row with deterministic event identity
             → `process-email-queue` renderer/provider boundary
No valid recipient → primary report mutation remains successful and a bounded audit row records the gap

# Reminder engine (P3-05)
Trusted `send-reminder` caller + exact `CRON_SECRET` → `scan_report_reminders(as_of)`
             → PUBLISHED/open campaign + eligible assignment + effective due date
             → server-resolved ACTIVE BRANCH_OFFICER recipients
             → unique `report_reminder_events` logical key
             → notification (`REPORT_DUE_SOON` / `REPORT_OVERDUE` /
                `REPORT_SUPPLEMENT_REMINDER`)
             → reminder email trigger → P3-02 queue idempotency → P3-03 renderer
No scheduler, persisted OVERDUE transition or provider send is enabled by P3-05.

# Cron & overdue automation (P3-06)
pg_cron (installed by migration, no HTTP/secret) → two daily in-database jobs:
  `report_mark_overdue_daily` @ `5 17 * * *` UTC (= 00:05 Asia/Ho_Chi_Minh, no DST)
             → `mark_overdue_assignments(p_as_of default now())`
             → single atomic UPDATE ... WHERE status='PENDING' AND campaign PUBLISHED AND
               effective_due_at < p_as_of (chained CTE also writes report_status_history +
               audit_logs for every row it actually flips; system/null actor)
             → idempotent/concurrency-safe by construction: a second concurrent UPDATE
               re-checks status='PENDING' against the just-committed row and matches nothing
  `report_reminder_scan_daily` @ `0 0 * * *` UTC (= 07:00 Asia/Ho_Chi_Minh, no DST)
             → `scan_report_reminders()` (unchanged P3-05/P3-R1 engine, called directly)
Neither cron job calls an Edge Function, HTTP endpoint or email provider; `send-reminder`
(CRON_SECRET-gated Edge Function) remains an untouched manual/external-trigger fallback, not
part of the pg_cron path. `process-email-queue` (the email worker) was NOT scheduled by any cron
job as of P3-06 — EMAIL_DELIVERY_MODE-gated sending was a manually/externally triggered step
only. **P3-08 changes this** (see below): `process-email-queue` now also has a `pg_cron` job.

# Email worker scheduling (P3-08)
pg_cron job `email_queue_worker` @ `*/10 * * * *` (every 10 minutes, no technical reason to go
faster than the worker's own batch/retry cadence)
             → `net.http_post` (pg_net extension) → `process-email-queue` Edge Function over HTTPS
             → URL and `x-cron-secret` header value both read from Supabase Vault
               (`vault.decrypted_secrets`) at execution time — zero secret literal in the
               migration (`202608150001_phase_3_email_worker_scheduling.sql`); the two Vault
               secrets (`email_queue_worker_url`, `email_queue_worker_cron_secret`) are
               provisioned once per environment via a manual `vault.create_secret(...)` SQL step,
               never committed
             → `process-email-queue/index.ts` `hasTrustedWorkerSecret()` (unchanged, P3-03) →
               `EMAIL_DELIVERY_MODE` gate (unchanged, P3-R1) → `claim_email_queue` (unchanged,
               P3-02, `FOR UPDATE SKIP LOCKED` + claim token + lease) → provider adapter
               (unchanged, P3-03, Resend `Idempotency-Key: email:{queue_id}`)
This is scheduling infrastructure only: no second worker, no second queue, no provider call
moved into the database, no change to `EMAIL_DELIVERY_MODE`/claim/retry/provider code. pg_cron
cannot call an Edge Function directly (unlike the two in-database P3-06 jobs above), so `pg_net`
is the Supabase-documented bridge. `net.http_post` is async/fire-and-forget from pg_cron's
perspective — see `docs/phase-3/08-email-worker-scheduling.md` for observability (how to confirm
a tick actually fired and reached the provider) and residual risk notes.

# Văn bản — Documents Foundation (P4-01)
LƯU Ý: model `documents` đã có sẵn từ `202607300001` (đủ field + 7 status) và `202607300003`
(`owner_organization_id`, `can_access_document(uuid)`, bucket private `documents-private`,
policy đọc Storage). P4-01 **không dựng lại** model — chỉ đóng gap
(`202608160001_phase_4_documents_foundation.sql`).

Đọc:  `/tri-thuc/van-ban` → `Documents.jsx` → `documentService.listDocuments()`
      → select `documents` dưới RLS `can_access_document(id)` — filter/search/paginate đều
        server-side, order `(issued_date desc, id desc)` để keyset ổn định
      `/tri-thuc/van-ban/:id` → `DocumentDetail.jsx` → `getDocument` + `getDocumentRelations`
      → relations chỉ hiện khi **cả hai** đầu quan hệ đọc được (policy mới; trước P4-01 bảng
        `document_relations` bật RLS nhưng KHÔNG có policy nào → deny-all)
Tải:  người dùng bấm → `getDocumentDownloadUrl` → signed URL 60s trên `documents-private`
      → Storage policy suy lại document id từ segment đầu của path bằng `uuid_or_null`
        (fail closed, không raise) rồi gọi lại `can_access_document` — biết `storage_path`
        KHÔNG đồng nghĩa tải được. Không prefetch signed URL, không log/ghi DB signed URL.
Ghi:  chỉ qua RPC SECURITY DEFINER (`create_document_draft`, `update_document_metadata`,
      `publish_document`, `withdraw_document`, `attach_document_source_file`) — validate
      role/scope qua `can_manage_document`, validate state transition, ghi `audit_logs`.
      `authenticated` đã bị revoke INSERT/UPDATE/DELETE trên `documents`/`document_relations`/
      `document_chunks` (chỉ còn SELECT). `attach_document_source_file` neo path theo đúng
      `{document_id}/source/...`, chặn traversal, chặn extension nguy hiểm, chặn oversize;
      MIME do browser khai báo KHÔNG được tin.
Chưa làm ở P4-01: AI/RAG, embedding, `document_chunks` processing, admin UI, rehearsal Storage runtime.

# Chuyên đề học tập (P4-03)
LƯU Ý AN NINH: policy gốc `active users read published topics` (202607300001) chỉ kiểm
`status='PUBLISHED'` và **bỏ qua `visibility_level`** → topic ORGANIZATION_ONLY/RESTRICTED lộ cho
mọi active user; `learning_topics` cũng không có cột organization. `202608160003` đóng gap này.

Đọc:  `/tri-thuc/chuyen-de` → `LearningTopics.jsx` → `learningService.listTopics()`
      → select `learning_topics` dưới RLS `can_access_learning_topic(id)`
        (admin thấy mọi trạng thái để duyệt DRAFT; người thường chỉ PUBLISHED + đúng visibility;
         ORGANIZATION_ONLY so `owner_organization_id` với `current_org_id()`; RESTRICTED chỉ admin)
      `/tri-thuc/chuyen-de/:topicId` → `LearningTopicDetail.jsx` → `getTopic` + `listResources`
      → resource gate **hoàn toàn theo topic cha**: đọc thẳng theo resource id cũng không vượt được.
Tải:  bấm nút → `getResourceDownloadUrl` → signed URL 60s trên `learning-resources-private`
      → storage policy suy `topic_id` từ segment đầu bằng `uuid_or_null` rồi gọi
        `can_access_learning_topic`. Không prefetch, không ghi log/DB signed URL.
Link: `external_url` bị CHECK ở DB **chỉ cho https** (chặn `javascript:`/`data:`/`http:`/`//host`);
      service còn lọc lần hai nên URL xấu không bao giờ thành `href`.
Ghi:  chỉ qua RPC (`create_learning_topic_draft`, `update_learning_topic`,
      `set_learning_topic_status` — bảng transition tường minh, `upsert_learning_resource`,
      `delete_learning_resource`), tất cả SECURITY DEFINER + `search_path`, kiểm role/scope, ghi
      audit. `anon`/`authenticated` không có quyền ghi bảng.
Storage: bucket `learning-resources-private` trước đó **không có policy nào** (deny-all). Nay:
      read theo quyền topic, admin insert dưới `{topic_id}/resources/`, **không có UPDATE policy**,
      delete chỉ cho object không còn resource row nào trỏ tới.
Chưa làm: AI/RAG, admin UI learning, rehearsal runtime Storage (chung gap với P4-02R).

# Quiz engine & attempts (P4-04)
Đọc metadata: topic detail → `quizService.listQuizzes(topic_id)` → select quiz-level fields dưới
RLS `can_access_quiz(quiz_id)`; không chọn question/option hoặc `is_correct`.
Làm bài: `/tri-thuc/trac-nghiem/:quizId` → `quizService.getQuiz()` (`get_quiz_intro`) →
`start_quiz_attempt(auth.uid())` → `get_attempt_questions(attempt_id)` (safe question/option
payload, deterministic shuffle by attempt id) → client gửi selected IDs →
`submit_quiz_attempt(attempt_id, answers)` (ownership, expiry, ID validation, server answer key,
exact-set scoring, answer rows + final score atomically) → `get_attempt_result` sau submit.
`quiz_attempts`/`quiz_answers` không có direct write grant cho `authenticated`; start dùng advisory
lock trước khi đọc active attempt, unique `(quiz_id,user_id,attempt_number)` là backstop. `is_correct`
chỉ xuất hiện trong result sau submit của chính user hoặc admin trong scope.

# Learning + Quiz admin (P4-05)
Admin flow: `/admin/chuyen-de` → `get_admin_learning_topics`; topic detail →
`get_admin_learning_topic` + `get_admin_learning_resources` + `get_admin_quizzes`; quiz editor →
`get_admin_quiz_authoring` and trusted create/update/status/question/option/reorder RPCs. Every
function re-checks active account and topic organization scope server-side. Only the scoped admin
read model returns `quiz_options.is_correct`; end-user `quizService` remains safe and direct
authenticated DML/select on authoring tables is revoked.

After the first submitted attempt, question/option rows and scoring-affecting quiz metadata are
immutable. Title/description may be cosmetically edited; a corrected assessment is created as a
new quiz. Publication validates scoring bounds, at least one question, at least two options per
question, and correct-answer cardinality for SINGLE/MULTIPLE.

# Quản trị văn bản & quyền ghi Storage (P4-02)
Gap P4-01 để lại: `documents-private` **không có policy INSERT/UPDATE/DELETE nào** → deny-by-default
→ không ai upload được tệp gốc, `attach_document_source_file` chỉ ghi nhận path đặt sẵn từ ngoài.
`202608160002` mở đúng mức tối thiểu (khuôn P2-03 của bucket báo cáo):

Upload: admin chọn tệp → `validateSourceFile` (extension + size, KHÔNG tin MIME browser)
      → `buildSourceStoragePath` = `{document_id}/source/{uuid}-{safe_name}` (mỗi lần upload một
        object MỚI → thay thế không bao giờ ghi đè tệp cũ)
      → upload (INSERT policy: `can_manage_document` suy từ dòng `documents` theo segment[1] qua
        `uuid_or_null`; segment[2] phải là `source`; path dị dạng → NULL → deny, không raise)
      → `attach_document_source_file` (RPC, validate lại toàn bộ + audit)
      → nếu attach FAIL: service xóa đúng object vừa tạo (bù trừ) rồi ném lại lỗi GỐC.
Xóa:  KHÔNG có UPDATE policy. DELETE policy chỉ dùng để bù trừ và có chặn
      `d.storage_path is distinct from storage.objects.name` → **tệp đang gắn không thể bị xóa**.
      Gỡ tệp có chủ đích = `detach_document_source_file`: xóa con trỏ DB TRƯỚC, trả path để xóa
      bytes SAU (crash ở giữa → orphan vô hại, không phải document trỏ vào tệp mất); từ chối khi
      `PUBLISHED`.
Đọc:  admin có SELECT policy riêng để duyệt tệp của DRAFT trước khi phát hành (policy OR nhau nên
      end user không được thêm quyền gì).
UI:   `/admin/van-ban` (`AdminDocuments.jsx`, RoleGuard YOUTH_ADMIN) → `documentAdminService`
      → `get_admin_documents` (read model scoped, total count, validate filter server-side) và các
      RPC P4-01. Trang không ghi bảng trực tiếp.

# Lịch sử/nộp lại báo cáo (P2-11)
Assignment detail → reportService.getSubmissionHistory (RLS, version desc, profile-safe fields)
                 → history accordion; signed URL chỉ tạo khi mở file
Nộp lại → upload staging → submit-report tính expected latest version
        → move object sang vN → RPC khóa assignment + kiểm expected version
        → tạo submission mới, giữ nguyên version cũ, status/history/audit/notification atomic

# Dashboard báo cáo (P2-13)
AdminReportDashboard → reportAdminService → get_report_dashboard / get_report_dashboard_assignments
                     → SECURITY DEFINER resolve auth.uid + active admin + organization scope
                     → aggregate và rows chỉ trong scope; không trả file path/signed URL
                     → effective overdue read-only dùng PostgreSQL now(), không thay cron

# Export/bundle báo cáo (P2-14)
AdminReportDashboard → reportAdminService → export-report-status / download-report-bundle
                     → requireUser + dashboard RPC bằng JWT (active admin + organization scope + filter)
                     → CSV từ rows scoped hoặc latest submission theo assignment scoped
                     → ZIP chỉ đọc bucket report-submissions-private, kiểm size/object/path/trùng tên
                     → audit actor/campaign/filter/count/bytes; trả file private với cache-control no-store

# RAG hỏi AI — CHƯA TỒN TẠI. Luồng dưới đây là KIẾN TRÚC MỤC TIÊU (P5-00), chưa implement.
# Luồng cũ trong khung `ask-ai` (embedding câu hỏi → match_document_chunks → Gemini) đã bị bác bỏ.
Câu hỏi → ask-ai (viết lại ở P5-06) → requireUser + account ACTIVE + quota
     → (0) tính scope quyền TRONG Postgres bằng auth.uid()   ← trước mọi bước khác
     → (1) phân loại ý định: số hiệu? điều/khoản? metadata? ngữ nghĩa?
     → (2) exact/metadata search (trigram + btree + tsvector)   ← vector KHÔNG phải bước đầu
     → (3) Wiki đã duyệt (full-text ∪ vector)
     → (4) evidence vector, chỉ trong tài liệu đã lọt qua (2)/(3)
     → (5) kiểm hiệu lực/phiên bản/ngưỡng; KHÔNG đủ nguồn ⇒ TỪ CHỐI, không gọi model sinh
     → (6) sinh câu trả lời + nguồn → ai_messages/ai_message_sources (trỏ version cụ thể)
```

Chi tiết và lý do: `docs/phase-5/02-ai-rag-architecture.md`,
`docs/phase-5/05-retrieval-source-policy.md`. Bất biến bắt buộc:
`RETRIEVAL AUTHORIZATION MUST HAPPEN BEFORE CONTEXT LEAVES SUPABASE`.

## Mô hình dữ liệu / API

Schema đầy đủ (~30 bảng) ở `docs/01-product-spec.md` mục 8. Nhóm chính: tổ chức/người dùng
(`organizations`, `profiles`, `user_roles`), thông báo, **báo cáo** (`report_campaigns`,
`report_assignments`, `report_submissions` (versioned), `report_submission_files`,
`report_status_history`), văn bản + RAG (`documents`, `document_chunks` có `embedding`),
học tập/quiz, trợ lý AI, đổi mới sáng tạo, email, `audit_logs`.

**Nhóm tri thức Phase 5 (P5-01, migration `202608170001`):** `document_versions` (bất biến,
có checksum) → `document_sources` (file/URL/snapshot) → `knowledge_wikis` +
`knowledge_wiki_versions` (bất biến sau khi duyệt, neo vào đúng một `document_version_id`) →
`document_chunks` **nay là selective evidence** → `knowledge_embeddings` (tách riêng, có
`embedding_model`/`embedding_dimension`, RLS bật và **không có policy nào** — chỉ trusted retrieval).
Cộng `ingestion_jobs`/`ingestion_events` (nền tảng job, chưa có worker) và `ai_usage_quota`.
Quyền của mọi bảng trên suy từ `can_access_document(document_id)` qua helper
`can_manage_document_knowledge(uuid)`; **không có mô hình phân quyền thứ hai**.
`documents.ingestion_status` là trục **tách hẳn** khỏi `documents.status` của Phase 4 — trigger
`trg_documents_state_axis_separation` cấm hai trục đổi trong cùng một statement. Chi tiết:
`docs/phase-5/08-p5-01-knowledge-schema.md`.

**P5-02 ingestion foundation (migration `202608180001`):** `document_sources` giữ nguyên
`storage_path` cho Phase 4/Supabase Storage và thêm `file_provider` + opaque external locator cho
nguồn Phase 5. Trigger từ canonical source (và khi published/current version được reconciling) tạo
`EXTRACT` idempotent cùng transaction, chỉ đổi `documents.ingestion_status`. `ingestion_jobs` dùng
claim token, `FOR UPDATE SKIP LOCKED`, lease, retry/backoff, reclaim và terminal failure qua RPC chỉ
`service_role`; `ingestion_events` append-only, chặn document text. `run-ingestion-jobs` là NO_OP
cron worker. **P5-02R** thêm `functions/_shared/storage/`: contract nhỏ `getMetadata/read/put/delete`,
`GoogleDriveStorageProvider` refresh OAuth chỉ phía backend và error typed (`AUTH_INVALID`,
`SOURCE_NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`,
`INVALID_LOCATOR`, `MALFORMED_RESPONSE`). `authorizedSourceGateway` bắt buộc Supabase
`can_access_document`-equivalent trước khi gửi Drive locator; không có Drive URL/public sharing và
không có extraction. Runtime OAuth/cron rehearsal vẫn cần owner thực hiện trên project rehearsal.

**Lưu ý về nhóm AI/RAG:** `document_chunks` (có `embedding vector(768)`, index ivfflat),
`ai_conversations`, `ai_messages`, `ai_message_sources`, `ai_feedback` và RPC
`match_document_chunks` đã tồn tại từ `202607300001` nhưng **đang ở 0 hàng và chưa có pipeline
nào ghi vào**. Phase 4 cố ý không đụng tới. **P5-01 đã thực hiện:** `document_chunks` thành evidence chọn lọc
(`visibility_level` — cột chết không policy nào đọc — **đã xóa**; thêm `document_version_id`,
`evidence_kind`, `selected_by`, `locator`); `ai_message_sources` **đã sửa PK** sang surrogate `id`
(PK cũ chứa `chunk_id` nullable nên Postgres buộc mọi citation phải có chunk ⇒ không trích dẫn
được ở mức Wiki/tài liệu). Cột `document_chunks.embedding` và `match_document_chunks()`
**vẫn còn nhưng DEPRECATED**, chỉ vì `supabase/tests/rls_acceptance.sql` đã nghiệm thu còn dùng —
P5-05 xóa chúng cùng bản cập nhật test. Mô hình đích:
`docs/phase-5/03-knowledge-data-model.md`; hiện trạng: `docs/phase-5/08-p5-01-knowledge-schema.md`.

RPC then chốt: `create_report_submission`, `create_report_submission_with_files` (expected-version overload),
`create_report_assignments`, `review_report_assignment`, `get_report_dashboard`,
`get_report_dashboard_assignments`,
`mark_overdue_assignments(p_as_of)`, `match_document_chunks`, `transition_problem_status`,
`is_organization_in_scope`.

P3-01 notification RPC: publish_report_campaign, mark_notification_read, mark_all_notifications_read.
P3-04 notification trigger: enqueue_report_email_from_notification; email templates are
REPORT_CAMPAIGN_PUBLISHED, REPORT_SUBMITTED, REPORT_RESUBMITTED, REPORT_NEEDS_SUPPLEMENT and
REPORT_ACCEPTED. The trigger is backend-only and calls the existing P3-02 trusted enqueue RPC.
P3-05 adds `report_reminder_events`, `scan_report_reminders(as_of)` and the backend-only
`enqueue_report_reminder_email_from_notification` trigger. Reminder email templates are
REPORT_DUE_SOON, REPORT_OVERDUE and REPORT_SUPPLEMENT_REMINDER; recipients remain server-resolved.
P3-06 replaces `mark_overdue_assignments()` (zero-arg) with `mark_overdue_assignments(p_as_of
timestamptz default now())` — same PENDING→OVERDUE eligibility rule, now with atomic
`report_status_history`/`audit_logs` writes (null/system actor) — and installs two `pg_cron` jobs
(`report_mark_overdue_daily`, `report_reminder_scan_daily`) that call trusted RPCs directly
in-database. `service_role` and `postgres` hold EXECUTE; `anon`/`authenticated` do not.

## Biến môi trường

```
# Frontend (Vite) — CHỈ giá trị public
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY

# Edge Functions (Supabase Secrets) — KHÔNG bao giờ đưa ra frontend
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   # (fallback: SERVICE_ROLE_KEY)
# + Gemini API key, email provider key (theo function)
# + GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN,
#   GOOGLE_DRIVE_ROOT_FOLDER_ID (P5-02R; personal My Drive OAuth, backend-only)
```

## Lưu ý kiến trúc quan trọng

- **Mock vs thật:** 5 trang chính đọc `src/data/mock.js`. Khi nối Supabase, thay bằng service
  gọi bảng/RPC/Edge Function, **không** giữ mock làm nguồn production.
- **Ranh giới bảo mật:** frontend chỉ có anon key + access token. Mọi chuyển trạng thái, tải tệp
  private, AI/RAG, email, export **phải** qua RLS/RPC hoặc Edge Function. Ẩn nút ≠ bảo mật.
- **Router thật:** dùng React Router, mỗi nội dung có URL riêng (mở đúng từ email/thông báo).
  SPA rewrite phải cấu hình ở host (`vercel.json`).
- **Báo cáo versioned:** nộp lại tạo phiên bản mới, không ghi đè; phiên bản cũ chỉ đọc.
- **Quiz:** không trả `is_correct` cho frontend trước khi chấm.
- **AI:** chỉ truy hồi chunk `APPROVED`, luôn trả nguồn; lọc dữ liệu nhạy cảm trước khi gửi Gemini.
- **GoTrue nhạy cảm với seed:** `supabase/seed.sql` phải điền đủ cột `auth.users`/`auth.identities`
  đúng cách (nhiều commit lịch sử sửa lỗi này) — cẩn thận khi đổi seed.
# Email queue foundation (P3-02)

Trusted producer (service role only)
        -> enqueue_email_for_user_event (server-resolved auth.users email,
           bounded structured payload, computed idempotency key)
        -> email_queue PENDING

claim_email_queue(worker, bounded batch)
        -> PENDING/RETRY eligible or stale PROCESSING
        -> PROCESSING + claim_token + worker_id + lease
        -> email_logs attempt evidence

current owner + token
        -> mark_email_sent -> SENT (terminal)
        -> mark_email_retry -> RETRY + deterministic next_attempt_at
                              -> max attempts/non-retryable -> FAILED (terminal)

Stale leases are reclaimed atomically by the next claim transaction; an old
claim token cannot complete or retry a reclaimed row. process-email-queue does
not call a provider in P3-02 and returns EMAIL_PROVIDER_DEFERRED until P3-03
supplies the provider adapter and secret boundary.

P3-02 queue RPC: enqueue_email_for_user_event, claim_email_queue, mark_email_sent,
mark_email_retry, get_email_queue_stats. Ordinary users have no table or RPC
privileges for email queue/logs; trusted server code uses service_role.
# Email provider integration (P3-03)

process-email-queue (trusted secret invocation)
        -> claim_email_queue (P3-02 atomic ownership)
        -> SYSTEM_EMAIL_TEST server renderer (subject + text + escaped HTML)
        -> Resend REST adapter (server-only API key, stable email:{queue_id} key)
        -> mark_email_sent(..., provider_code) or mark_email_retry(...)

The worker never directly selects PENDING rows and never accepts provider/sender/HTML
configuration from queue payload or frontend. `send-reminder` remains a deferred producer;
report event hooks are implemented by the P3-04 trusted notification trigger. Provider metadata
is persisted in `email_logs`; live rehearsal is a controlled manual gate, not a CI or production
deployment step.
# Email delivery safety gate and reminder cycle fix (P3-R1)

process-email-queue (trusted secret invocation)
        -> EMAIL_DELIVERY_MODE resolved fail-closed (OFF default; only exact "LIVE" reaches
           unrestricted send)
        -> OFF: return immediately, claim_email_queue is never called, provider is never built
        -> ALLOWLIST/LIVE: claim_email_queue (P3-02 atomic ownership)
             -> ALLOWLIST: recipient_email checked against EMAIL_TEST_RECIPIENTS (normalized,
                exact match, no wildcard); no match -> mark_email_retry(retryable=false,
                RECIPIENT_NOT_ALLOWLISTED) without ever calling the provider
             -> match (or LIVE): existing P3-03/P3-04/P3-05 render/send/log path, unchanged

P3-04/P3-05 opened the renderer allowlist from `SYSTEM_EMAIL_TEST` alone to eight report/reminder
templates, which removed the implicit "nothing renders so nothing sends" safety net P3-03 had.
`EMAIL_DELIVERY_MODE` restores an explicit, fail-closed gate ahead of P3-06 (cron/scheduler):
missing, empty or unrecognized values behave as `OFF`; `LIVE` is only reachable by that exact env
value, never as a default or fallback.

`enqueue_email_for_user_event` now stores `source_entity_type`/`source_entity_id` directly on the
`email_queue` row it inserts (previously only used to build the idempotency key); the P3-05
reminder trigger's post-enqueue `UPDATE email_queue` workaround is removed, leaving one source of
truth for queue row provenance.

`REPORT_SUPPLEMENT_REMINDER`'s logical/idempotency milestone is now
`NEEDS_SUPPLEMENT:v{latest_submission_version}` instead of a fixed `NEEDS_SUPPLEMENT` string, so a
resubmission that earns a new NEEDS_SUPPLEMENT decision opens a new reminder milestone while the
current review cycle still cannot be reminded twice. Earlier `report_reminder_events` rows are
never edited.
