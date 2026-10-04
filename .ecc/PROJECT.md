# Project — current reality

## Purpose / architecture

Nền tảng Đoàn cho tuổi trẻ Công an tỉnh Phú Thọ: public knowledge, công việc/báo cáo,
văn bản, chuyên đề/quiz, AI dẫn nguồn, đổi mới, thông báo và Member Management.
[Code Graph](../docs/brain/01-architecture.md) mô tả module;
[product spec](../docs/01-product-spec.md) mô tả nghiệp vụ. [AUDIT](AUDIT.md)
là snapshot; source/package/config là bằng chứng khi tài liệu lịch sử mâu thuẫn.

Frontend `main.jsx` → `App.jsx` → pages → services → Supabase RLS/RPC/Edge Functions.
Member pages → `memberService` → **Member API riêng** → **PostgreSQL riêng**;
API hỏi Supabase `resolve-member-scope` qua JWT + server-to-server secret.
Account/Auth profile khác Member Record; không đưa member roster vào Supabase/AI.

## Frontend / authentication

React18, Vite6, Router7; JavaScript ESM/JSX, không frontend TypeScript/tsconfig.
CSS tokens, Lucide adapter, responsive shell 5 khu vực, PWA manifest/SW, DOMPurify.
Các vertical slices đã nối service thật; `src/data/mock.js`/`preview.html` là demo.
Public-First cho published/PUBLIC content và Ask AI có quota; auth-on-demand.
Frontend Auth/Role guards là UX; server/RLS kiểm quyền thật.

Supabase Auth + ACTIVE profile/role/org cho private flows. NQ_300 là ngoại lệ quiz
public: invisible anonymous Auth, INVITED profile không roles, private registry,
bank/owner-scoped RPC. Anonymous Auth dùng DB role authenticated, không đồng nghĩa
permanent/ACTIVE. Generic Quiz giữ auth boundary. NQ key/questions không đọc trực
tiếp; autosave/grade/expiry theo server, review sau finalize.

## Backend / databases / storage

`supabase/functions`: TS/Deno, shared auth/HTTP/validation. User clients dùng RLS;
service role backend-only, kiểm lại JWT/ACTIVE/role/scope trước privileged writes.
Supabase PostgreSQL: ordered migrations, pgTAP, RLS, SECURITY DEFINER RPC, pgvector,
pg_cron/pg_net scheduling. Local config chọn PG15; hosted version phải inspect live.
Review RLS/grants/search_path theo [DB runbook](memory/runbooks/database.md).

Private files qua authorization + signed URL ngắn hạn. Google My Drive là backend
source provider sau authorization gateway, không primary DB hoặc public sharing.
Canonical reviewed knowledge_articles gắn immutable document versions/sources;
evidence/embeddings là retrieval layer, Gemini backend-only. Email queue/Resend
worker có OFF/ALLOWLIST/LIVE; OFF fail-closed.

`member-api`: Node ESM HTTP service, pg/exceljs, PostgreSQL16 riêng, tracked migrations.
Scope hỏi mới mỗi request; YOUTH_ADMIN/BRANCH_OFFICER CRUD, YOUTH_ADMIN-only import,
exact-origin CORS, audit cùng transaction, DELETE chưa hỗ trợ. Không trust client
role/org; không đưa Member fields vào AI/RAG/export chung. Xem
[Member README](../member-api/README.md).

## Deployment / production boundaries

Vercel Git integration host Vite dist theo [vercel.json](../vercel.json): SPA rewrite,
CSP/security headers, immutable assets, SW no-cache. PR có Preview khi integration
chạy; merge master có thể **tự deploy Production frontend**. Không có Supabase/
Member deployment job trong [CI](../.github/workflows/ci.yml); backend rollout riêng.

Member host được chọn ở [infrastructure decision](../docs/phase-5-5/01-member-infrastructure-decision.md),
nhưng provisioning/DNS/TLS/DB/CORS/CSP/backup còn gate theo
[owner checklist](../docs/phase-5-5/05-hosted-runtime-readiness-checklist.md).
Không bịa endpoint hoặc mở Phase6 từ historical PASS. Runtime claim tied exact
source/deployment/target; xem [runtime runbook](memory/runbooks/runtime.md).

## Directories / commands / environment

| Surface | Path / command |
|---|---|
| UI/auth/services | src/App.jsx, src/pages, src/contexts, src/services, src/lib |
| Root checks | npm ci; npm run verify; riêng npm test / npm run lint / npm run build |
| Dev / built local preview | npm run dev / npm run preview (khác hosted Vercel Preview) |
| DB/Edge checks | supabase/migrations, supabase/tests, supabase/functions; DB runbook + CI |
| Member checks | npm --prefix member-api ci; npm --prefix member-api test chỉ trên disposable DB |
| Rehearsal harnesses | scripts/phase5-runtime-acceptance.mjs, scripts/nq-*; runtime runbook |
| Agent context | .ecc và docs/brain |

Node22 như CI; Member yêu cầu Node20+. Public frontend input names trong
[.env.example](../.env.example); server names trong
[Member example](../member-api/.env.example). VITE_* vào browser bundle:
Supabase URL/anon key, Member API URL; không secret. Backend secrets do host secret
store cung cấp; không lưu giá trị ở memory/docs. Frontend typecheck N/A; Deno check
là gate riêng, không suy ra từ Vite build.

## Data sensitivity / critical flows

Không state secrets/operational sensitive data, không PII/roster thật trong fixtures,
log/memory. Member PII, private reports/files, JWT và provider locators cần bảo vệ.
Critical flows: auth/session; submit/resubmit/review/history; private download/export;
content admin/AI evidence; quiz owner/key/expiry; Member CRUD/import/audit/isolation;
email claim/idempotency/delivery safety. Chọn checks theo affected diff, không full E2E
cho mọi thay đổi LOW.
