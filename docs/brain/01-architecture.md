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
| Storage | Supabase Storage (bucket private + signed URL + SECURITY DEFINER access helpers where RLS policy needs protected table lookup) |
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
│   ├── Home/Work/Knowledge/Innovation/Profile.jsx  # 5 khu vực — HIỆN DÙNG MOCK
│   ├── Notifications.jsx    # inbox/read state, safe deep-link, bounded pagination
│   └── Admin.jsx            # dashboard quản trị (dùng Supabase)
├── data/mock.js             # dữ liệu demo (campaigns, documents, topics, projects, problems)
├── lib/status.mjs           # REPORT_STATUS, getReportStatus, daysUntil, normalizeSafeFileName (có test)
├── lib/markdown.js          # render markdown an toàn (DOMPurify)
├── services/supabaseClient.js  # khởi tạo supabase client từ VITE_SUPABASE_*
├── services/reportAdminService.js # quản trị campaign + dashboard/export qua RPC/Edge Function
└── services/notificationService.js # read-only inbox/count + mark-read RPC boundary

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

### Backend (Edge Functions) — module then chốt

| Module / file | Vai trò | Được gọi bởi | Phụ thuộc vào |
|---------------|---------|--------------|---------------|
| `functions/_shared/auth.ts` | `clients()`→{userClient, adminClient}; `requireUser`, `requireGlobalRole`, `requireScopedRole` | **mọi** Edge Function | `@supabase/supabase-js`, env `SUPABASE_*` |
| `functions/_shared/http.ts` | `corsHeaders`, `json`, `errorResponse`, `readJson` | mọi Edge Function | — |
| `functions/_shared/validation.ts` | `assertUuid`, `fileExtension`, `safeText` | các function nhận input | — |
| `src/services/reportService.js` | Factory `createReportService(supabase)`; mapper assignment/submission history; query RLS, upload/remove Storage private, invoke `submit-report`/`review-report` | P2-08/P2-09/P2-10/P2-11 | `src/lib/status.mjs`, Supabase client được caller truyền vào |
| `functions/submit-report` | Xác minh object staging thật + quyền/tệp → move sang namespace `vN` → RPC expected-version; RPC xác minh lại object/size/mime ở Storage trước atomic metadata/history/notification | client (khi đã nối) | `_shared/*`, Storage, RPC, bảng report_* |
| `functions/review-report` | Xác thực request rồi gọi RPC review; RPC atomic hóa transition, review metadata, history, audit và notification | client admin | `_shared/*`, `review_report_assignment`, RLS |
| `functions/finalize-campaign-template` | Đọc metadata thật từ Storage, chuẩn hóa tên, move template và đăng ký metadata | `reportAdminService` | `_shared/*`, service-role Storage, `register_report_campaign_template` |
| `functions/export-report-status` | CSV UTF-8/BOM scoped, formula-neutralized, audit bắt buộc | `AdminReportDashboard` qua `reportAdminService` | dashboard RPC, `_shared/*`, `audit_logs` |
| `functions/download-report-bundle` | ZIP latest submission/file trong scope, private Storage, giới hạn 100 file/50 MB, audit | `AdminReportDashboard` qua `reportAdminService` | dashboard RPC, service-role Storage, `fflate`, `_shared/*` |
| `functions/ask-ai` | RAG: scope tài liệu → Gemini → chuẩn hóa nguồn → lưu lịch sử | client | `_shared/*`, `match_document_chunks` |
| `functions/process-document` | Trích xuất → chunk → embedding → chờ duyệt | admin | `_shared/*`, Gemini |
| `functions/send-reminder` / `process-email-queue` | Nhắc hạn (idempotent) / gửi email theo batch | cron | `_shared/*`, email_queue |

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

# RAG hỏi AI
Page trợ lý AI → invoke ask-ai → requireUser + quota → xác định scope tài liệu
         → embedding câu hỏi → match_document_chunks (chỉ chunk APPROVED)
         → Gemini → trả lời + nguồn → lưu ai_messages/ai_message_sources
```

## Mô hình dữ liệu / API

Schema đầy đủ (~30 bảng) ở `docs/01-product-spec.md` mục 8. Nhóm chính: tổ chức/người dùng
(`organizations`, `profiles`, `user_roles`), thông báo, **báo cáo** (`report_campaigns`,
`report_assignments`, `report_submissions` (versioned), `report_submission_files`,
`report_status_history`), văn bản + RAG (`documents`, `document_chunks` có `embedding`),
học tập/quiz, trợ lý AI, đổi mới sáng tạo, email, `audit_logs`.

RPC then chốt: `create_report_submission`, `create_report_submission_with_files` (expected-version overload),
`create_report_assignments`, `review_report_assignment`, `get_report_dashboard`,
`get_report_dashboard_assignments`,
`mark_overdue_assignments`, `match_document_chunks`, `transition_problem_status`,
`is_organization_in_scope`.

P3-01 notification RPC: publish_report_campaign, mark_notification_read, mark_all_notifications_read.

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
configuration from queue payload or frontend. `send-reminder` and report event hooks remain
separate deferred producers. Provider metadata is persisted in `email_logs`; live rehearsal
is a controlled manual gate, not a CI or production deployment step.
