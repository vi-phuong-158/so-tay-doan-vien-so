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
| Storage | Supabase Storage (bucket private + signed URL) |
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
│   ├── common.jsx           # Brand, EmptyState, SectionHeader...
│   ├── Icon.jsx             # line icon
│   ├── ErrorBoundary.jsx / Skeleton.jsx
├── pages/
│   ├── auth/                # Login, ForgotPassword, ResetPassword, ChangePassword (dùng Supabase)
│   ├── Home/Work/Knowledge/Innovation/Profile.jsx  # 5 khu vực — HIỆN DÙNG MOCK
│   └── Admin.jsx            # dashboard quản trị (dùng Supabase)
├── data/mock.js             # dữ liệu demo (campaigns, documents, topics, projects, problems)
├── lib/status.mjs           # REPORT_STATUS, getReportStatus, daysUntil, normalizeSafeFileName (có test)
├── lib/markdown.js          # render markdown an toàn (DOMPurify)
└── services/supabaseClient.js  # khởi tạo supabase client từ VITE_SUPABASE_*

supabase/
├── migrations/              # 4 migration: schema, storage/RPC security, fix bảo mật P1, admin txn
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
| `src/main.jsx` | Entry, mount, đăng ký SW | (trình duyệt) | `App.jsx`, `index.css` |
| `src/App.jsx` | Khai báo route + bọc Guard | `main.jsx` | `AuthContext`, `Guards`, `Layout`, mọi `pages/*` |
| `src/contexts/AuthContext.jsx` | Session/user/profile/roles, `login/logout/hasRole` | `App`, mọi component gọi `useAuth` | `services/supabaseClient` |
| `src/services/supabaseClient.js` | Client Supabase (anon key) | `AuthContext`, `pages/auth/*`, `pages/Admin` | `VITE_SUPABASE_URL/ANON_KEY` |
| `src/components/Guards.jsx` | `AuthGuard` (chặn chưa đăng nhập/inactive), `RoleGuard` | `App.jsx` | `useAuth`, react-router |
| `src/components/Layout.jsx` | `AppShell`: Sidebar + BottomNav + `<Outlet/>` | `App.jsx` (trong AuthGuard) | `useAuth`, `Icon`, `common` |
| `src/pages/*` (5 khu vực) | UI khu vực | routes trong `App.jsx` | `data/mock.js`, `useAuth`, `common` |
| `src/data/mock.js` | Dữ liệu demo | 5 pages chính | — (⚠ thay bằng service khi nối Supabase) |
| `src/lib/status.mjs` | Nhãn/tone trạng thái báo cáo, tính hạn, chuẩn hóa tên tệp | pages hiển thị báo cáo | — (thuần, có unit test) |

### Backend (Edge Functions) — module then chốt

| Module / file | Vai trò | Được gọi bởi | Phụ thuộc vào |
|---------------|---------|--------------|---------------|
| `functions/_shared/auth.ts` | `clients()`→{userClient, adminClient}; `requireUser`, `requireGlobalRole`, `requireScopedRole` | **mọi** Edge Function | `@supabase/supabase-js`, env `SUPABASE_*` |
| `functions/_shared/http.ts` | `corsHeaders`, `json`, `errorResponse`, `readJson` | mọi Edge Function | — |
| `functions/_shared/validation.ts` | `assertUuid`, `fileExtension`, `safeText` | các function nhận input | — |
| `functions/submit-report` | Kiểm tra assignment/quyền/tệp → RPC `create_report_submission` → insert file + notification | client (khi đã nối) | `_shared/*`, RPC, bảng report_* |
| `functions/review-report` | Chuyển trạng thái accepted/needs-supplement/exempted | client admin | `_shared/*`, requireRole |
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
Page nộp → invoke Edge Function submit-report
         → clients()/requireUser → validate assignment+file
         → RPC create_report_submission (versioned) → insert report_submission_files
         → insert notifications → trả submission mới

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

RPC then chốt: `create_report_submission`, `create_report_assignments`, `get_report_dashboard`,
`mark_overdue_assignments`, `match_document_chunks`, `transition_problem_status`,
`is_organization_in_scope`.

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
