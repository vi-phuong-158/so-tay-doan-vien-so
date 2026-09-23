# 06 — AI Working Log

## [2026-09-23] SOTAY_UI_FINAL_CLOSURE — audit scope correction before merge

- **Agent:** Codex
- **Thay đổi:** Independent audit found the candidate had added a problem-submission form and a
  client call to `submit-innovation-problem`, although the active closure brief excludes new
  workflow functionality and the task log identifies this modal as a separate product decision.
  The audit also found new localStorage report draft persistence and answer-required quiz navigation.
  Removed those additions to preserve the existing workflow and avoid browser storage for report
  text. Retained the public Innovation list/detail presentation, existing guest-to-login navigation,
  report/quiz presentation updates, and backend contracts. Reconciled current status documentation
  while preserving the earlier branch iteration as history.
- **File đã sửa:** `src/pages/Innovation.jsx`, `src/services/innovationService.js`,
  `src/pages/ReportAssignmentDetail.jsx`, `src/pages/Quiz.jsx`, `src/index.css`,
  `tests/innovation_service.test.mjs`, `docs/04-implementation-status.md`,
  `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`,
  `docs/ui-final-closure/FINAL_ACCEPTANCE.md`,
  `docs/ui-final-closure/UI_RECONCILIATION_MATRIX.md`,
  `docs/ui-ux-end-to-end-finalization.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Keep PR #57 within UI reconciliation scope; do not start Phase 6 or make a new business
  workflow active.
- **Kiểm tra:** `npm test` 205/205 PASS; `npm run lint` 0 errors/3 existing Fast Refresh warnings;
  `npm run build` PASS (520.68 kB chunk-size warning); `git diff --check` PASS; report detail
  contains no browser-storage API. Exact-head CI run `35829383771` passed all checks on
  `0050f40357b9091d082971659aa37f84378dfdaf`; there were no human review threads or unresolved
  inline comments. PR #57 merged at `2f0336a8784a4c0610543b20aa704a6e90182423`; post-merge run
  `35829761261` passed and Vercel automatically completed the Production frontend deployment at
  `https://so-tay-doan-vien-jgrxhsuxe-vi-phuong-158s-projects.vercel.app`. No production database/data,
  Member API deployment, or server secret/configuration was changed. PR #51 was closed with a
  historical-evidence explanation. The post-merge docs-only reconciliation includes
  `docs/phase-5-5/05-hosted-runtime-readiness-checklist.md` for the owner handoff.

## [2026-09-18] P5.5 — End-to-End Final Closure / Public-first auth

- **Agent:** Codex
- **Base/branch:** `origin/master@7f468a5111df54486f7e98688b4c16057668a519`; closure branch
  `codex/p5-5-final-e2e-closure`. PR #51 was audited and retained as a historical artifact; it
  was not merged and no Phase 6 work was started.
- **Thay đổi:** `src/App.jsx` now exposes the Home/public shell publicly and groups data-bearing
  routes under `AuthGuard`; `src/components/Guards.jsx` presents an on-demand login CTA instead of
  redirecting the whole app; auth tests cover the new contract. Added the final acceptance report
  and reconciled architecture, decision, implementation-status and current-task documentation.
- **Bảo mật/ranh giới:** Supabase RLS remains the boundary for documents/learning/reports; `ask-ai`
  and retrieval stay protected. Account/Auth remains distinct from Member Record; Member API
  server-side role/scope checks remain authoritative. Existing P5.5 hardening is unchanged:
  transition scope/assignment validation, revoked direct `member_scope_org_codes` execution, and
  pinned trigger `search_path=public`.
- **Kiểm tra:** root tests `200/200`, targeted auth/public-first `17/17`, Member API targeted
  `73/73`, lint `0 errors` with 4 existing warnings, build PASS. Existing CI evidence: full Member
  API `273/273`, Deno `116 passed / 0 failed`, test-db job PASS, Vercel PASS on PR #51 head.
- **Giới hạn:** local full Member API remains blocked by missing `MEMBER_DATABASE_URL` and npm
  cache `EPERM` while installing `exceljs`; Mắt Bão/hosted Member API/hosted browser/hosted
  backup-restore were not provisioned or run. Verdict remains
  `PHASE_5_5_END_TO_END_ACCEPTANCE_BLOCKED_MATBAO_RUNTIME_NOT_PROVISIONED`.

## [2026-09-13] PR48 closure + P5.5 Production Runtime Closure (partial)

- **Agent:** Claude Code
- **PR48 closure:** Re-verified PR #48 from source of truth — head `ccd207416c7162b98c622dbf0a0fca46e752f068`
  (unchanged), base `master@22ba73e47d2f449dbab762cfba80e1d01f688cd3`, `mergeable_state: clean`, all
  4 checks (`build`/`member-api-test`/`test-db`/`Vercel Preview Comments`) `success`, no unresolved
  review threads. Merged with exact-head protection → merge commit
  `be128d320bdde7e6c0d5fea2d51e90954b950003`. Post-merge gate on synced `master`: lint 0 err/4
  pre-existing warnings, test 197/197, build PASS.
- **Runtime branch:** `feat/p5-5-production-runtime-closure`, from `master@be128d3`.
- **What is genuinely different this round vs. prior P5.5 sessions:** this sandbox has local
  PostgreSQL 16 server binaries (`postgresql-16` package, previously never started) in addition to
  the client tools used before. Started the cluster and used it for real (not mocked) backend
  verification: real `member-api` test run against real Postgres (273/273, matching CI's own
  `postgres:16` service-container setup), a real running `member-api` HTTP process for live
  positive/negative/CORS checks, and a real `pg_dump`/restore rehearsal — all firsts for this
  project's runtime acceptance history, previously blocked as "no Docker/DB in sandbox."
- **Real defect found + fixed via the backup/restore rehearsal (not hypothetical):** restoring a
  plain `pg_dump` of the Member DB into a fresh database reproducibly failed with `ERROR: function
  unaccent(unknown, text) does not exist` while rebuilding `idx_members_full_name_trgm`. Root cause:
  pg_dump's restore preamble sets `search_path` to `''` (standard pg_dump security convention) and
  schema-qualifies everything it emits *except* literal SQL inside a function body, which is dumped
  verbatim. Migration `0001`'s `member_immutable_unaccent()` calls the bare, unqualified
  `unaccent('unaccent', $1)` — unresolvable under an empty search_path. This would have blocked
  every future restore of this database, real infra or not.
  - **Fix:** new forward-fix migration `member-api/migrations/0004_fix_unaccent_restore_qualification.sql`
    — `CREATE OR REPLACE FUNCTION public.member_immutable_unaccent` calling
    `public.unaccent('public.unaccent'::regdictionary, $1)` (fully schema-qualified). Never edited
    the already-applied `0001` migration.
  - **Regression test:** re-ran the full `member-api` suite after applying `0004` — still 273/273.
  - **Runtime re-test:** re-ran the entire seed → backup (`pg_dump`) → mutate → restore
    (fresh DB, `psql -f`) → verify cycle end-to-end against a freshly-migrated (fixed) rehearsal
    database. Restore completed with zero errors (previously reproducible on every attempt before
    the fix); `verify` step: `PASS: the restored database matches the state at backup time` (marker
    checksum `8fd1a092d3ef8d920603a2d4813d6f9271f9e9aa12283de3beefdd65116ca4ed` on the fixed backup
    file, `member_api_rehearsal_fixed_20260913T232748Z.sql`, 21,389 bytes); integrity checks on the
    restored DB: `members` empty (expected — synthetic/no seed data), 0 orphaned `member_audit_logs`
    rows, all 4 `schema_migrations` rows present including `0004`.
  - **Scope note:** this rehearsal was run against a **local, disposable PostgreSQL 16 instance**
    started in this sandbox — not against Mắt Bão (still not provisioned; see below). The defect
    itself is schema-level and would reproduce identically on any PostgreSQL 16 target, Mắt Bão
    included, so fixing it now (rather than waiting for provisioning) is in scope per the runtime
    closure task's fix policy (clear deployment defect, minimal fix, regression-tested,
    runtime-re-tested).
- **Real CORS/auth smoke test against a live `member-api` process** (not mocked): `GET /healthz` →
  200, `GET /readyz` → 200 (proves live DB connectivity), `GET /v1/members` no token → 401,
  malformed bearer → 403 (fail-closed via the scope resolver call failing, not an information leak),
  CORS preflight for the exact configured origin → `Access-Control-Allow-Origin` echoed correctly;
  arbitrary/`null`/prefix-trick/trailing-slash Origins → no `Access-Control-Allow-Origin` header at
  all (fail-closed, exact-match only, matching `member-api/src/server.js`'s existing
  `applyCorsHeaders` implementation — no code change needed here, behavior was already correct).
  "Wrong role"/"out-of-scope org" matrices were not re-derived live (no reachable
  `resolve-member-scope` instance in this sandbox to stand behind a real Supabase JWT) — already
  covered by the 273 passing tests against real Postgres, which is stronger evidence than a live
  HTTP call with a stubbed resolver would have been.
- **Confirmed BLOCKED (infrastructure/credentials, not skipped):**
  - `MATBAO_RUNTIME_BLOCKED_NOT_PROVISIONED` — re-confirmed from
    `docs/phase-5-5/01-member-infrastructure-decision.md`/`02-member-api-deployment-runbook.md`: no
    Mắt Bão account, instance, or connection string exists; Member API has never been deployed to
    any real host, only tested locally/CI.
  - Direct network test (`curl` to the live Vercel Preview host) returned
    `connect_rejected (organization policy)` from this sandbox's egress proxy — confirmed real
    Supabase project, Member API production host, and Vercel deployment are all unreachable from
    here regardless of credentials. Authenticated real-runtime browser acceptance (task §23-25) is
    therefore `BLOCKED_NO_EGRESS`, not re-attempted as a synthetic/mocked substitute under the name
    "runtime acceptance" (the task explicitly forbids that framing) — no UI changed in this round
    that would need re-verifying anyway.
  - Email: `EMAIL_DELIVERY_MODE` defaults to `OFF`, no provider key configured anywhere in this
    repo/environment → `BLOCKED` per the task's own rule (never simulate and call it a pass).
  - Supabase runtime (Auth/RLS/Storage/Edge Function *deployed* versions), CORS/CSP *at the real
    runtime* (only the `vercel.json` source and local `member-api` process were verifiable),
    production Member API hostname, production custom domain, config drift against actual
    Vercel/Supabase secrets: all `BLOCKED_NO_CREDENTIALS`/`BLOCKED_NO_EGRESS` — no Vercel/Supabase
    API token or project ref available to this session.
  - Log security: reviewed `member-api/src/*.js` (only 2 `console.log` lines total, neither
    interpolates a secret) and grepped all Edge Function sources for `console.*` lines mentioning
    token/jwt/secret/password/key — zero matches. No HIGH finding.
  - CSP source review: `vercel.json`'s `Content-Security-Policy` has no `*`, no `unsafe-eval`; the
    Member API host is deliberately absent from `connect-src` because no production hostname is
    decided yet — matches the deployment runbook's own documented open item, not a defect.
- **Files changed:** `member-api/migrations/0004_fix_unaccent_restore_qualification.sql` (new),
  `docs/brain/06-ai-working-log.md`, `docs/brain/04-current-tasks.md`.
- **Verdict:** `SOTAY_P5_5_PRODUCTION_RUNTIME_CLOSURE_PARTIAL` — see the runtime closure PR body for
  the full acceptance matrix.

## [2026-09-13] PR47 closure + Modern Civic Glass Phase 2 rollout

- **Agent:** Claude Code
- **PR47 closure:** Re-verified PR #47 from source of truth before any mutation — head
  `927786dfabfca07669d2f17a348470f34c19d47e` (unchanged), base `master@3854196fe8ce6ac599a2fa6e564e8f4a15c3f9c6`,
  `mergeable_state: clean`, all 4 CI checks `success`. Confirmed already `merged: true`
  (`merged_by: vi-phuong-158`, merge commit `22ba73e47d2f449dbab762cfba80e1d01f688cd3`,
  `merged_at: 2026-09-13T14:18:21Z`) from an earlier turn in this same session — no new merge
  action was needed or taken in this round. Synced local `master` to `22ba73e` and re-ran the
  post-merge gate (`npm run lint` 0 error/4 pre-existing warnings, `npm test` 197/197, `npm run
  build` PASS) before branching. `member-api` tests skipped — no Docker daemon/reachable
  PostgreSQL in this sandbox (unchanged limitation from PR47 round), and Phase 2 does not touch
  `member-api/`.
- **Phase 2 branch:** `feat/ui-modern-civic-glass-phase2` from exact post-merge `master@22ba73e`.
- **Scope:** Rollout the Modern Civic Glass design language (approved on PR47: Home/Work/Knowledge)
  to the remaining screens named in `docs/02-design-system.md`'s addendum rollout list. Audited all
  24 page components against the addendum + component library before touching anything; classified
  each RESTYLE/SHARED_COMPONENT_UPDATE/ALREADY_COMPLIANT/DO_NOT_TOUCH per the task brief's table
  (see PR description for the full table). No route/schema/RLS/API/business-logic changes anywhere
  in this round — every fix below is CSS or a JSX className/semantic-element change only.
- **Method for finding real defects:** systematically diffed every `className` string used across
  `src/**/*.jsx` against every class selector actually defined in `src/index.css` (Python regex
  script, not manual reading) to find dead/undefined CSS classes app-wide, then verified each
  candidate in real Chromium (Playwright, `/opt/pw-browsers/chromium-1194`) with Supabase/Member API
  responses mocked at the network boundary (`context.route`) — same Level-3 synthetic-network
  acceptance method as the PR47 round, since this sandbox still has no reachable Supabase project,
  Member API instance, or Docker daemon. Component tree and CSS are the real, unmodified production
  code; only network responses are synthetic. Measured real touch-target sizes via
  `getBoundingClientRect()` in-browser rather than reading CSS by eye.
- **Real defects found and fixed (all pre-existing, not introduced by PR47):**
  1. `src/components/Guards.jsx` — `AuthGuard`/`MemberManagementGuard`/`RoleGuard`'s
     loading/error/forbidden states referenced `.loading-skeleton`/`.unauthorized-state`/`.btn`/
     `.btn-primary`, none of which have ever had any CSS — every route's loading flash and every
     permission-denied screen in the whole app rendered as unstyled plain text. Fixed by reusing the
     existing, already-styled `EmptyState`/`Button` components instead of writing new CSS
     (Component First, task §10) — zero new CSS classes added for this fix.
  2. `src/pages/Profile.jsx` (Cá nhân) — `.avatar-large`/`.list`/`.list-item`/`.menu-list`/
     `.org-name`/`.text-danger`/`.text-muted`/`.ms-auto` were all completely unstyled; the whole
     screen rendered with no card, no avatar circle, no row dividers. Added the missing CSS and
     converted the `<div onClick>` menu rows to semantic `<button>` (keyboard-operable, task §13).
  3. `src/pages/Innovation.jsx` (Đổi mới sáng tạo) — same dead-class pattern
     (`.card`/`.card-header`/`.card-desc`/`.card-meta`/`.problem-update`), **plus** a genuine
     rendering bug found only by inspecting real computed styles in-browser: the project card's
     `.project-card` modifier class collided with a completely different, orphaned legacy component
     (`.project-list`/`.project-card{display:grid;grid-template-columns:auto 1fr auto}`/
     `.project-symbol`/`.project-content`/`.project-progress`, confirmed zero JSX usage anywhere)
     that forced the real card into a broken 3-column grid, wrapping the title/description into
     single-word vertical columns. Renamed the real card to `.innovation-project-card` and deleted
     the now-fully-orphaned legacy block. Also added the missing "Dữ liệu minh họa" label (this page
     reads `src/data/mock.js`, same as Home — the label was missing here) and wired the already-
     -unused `Progress` component to the `progress` field the mock data already has (no invented
     data, task §12).
  4. `src/pages/ReportAssignmentDetail.jsx` (Chi tiết/Nộp/Lịch sử báo cáo) — the submission-history
     accordion row reused the class name `.history-item`, which already existed in CSS but for a
     *different*, entirely unrelated, currently-unused markup shape (`display:flex` icon+h3+p+button
     row). The mismatch made the expand/collapse detail panel lay out beside the toggle button
     instead of below it. Renamed to `.submission-history-row` + `.history-detail` and deleted the
     orphaned `.history-item`/`.history-icon` rule (confirmed zero other JSX usage).
  5. `src/index.css` global touch-target sizes, measured under 44px by
     `getBoundingClientRect()` in real Chromium and appearing on every screen in the app:
     `.mobile-topbar .icon-button` (the header notification bell, 40→44px) and `.tabs .tab`
     (Work/Knowledge/Innovation tab switcher, 40→44px). Also `.dashboard-filters select` (used by
     MemberManagement/MemberImport/Documents/AdminDocuments filter rows) was completely unstyled at
     the browser's native ~20px height; added base sizing matching `.dashboard-search input`'s
     existing 44px pattern.
  6. `src/pages/Admin.jsx` (Bảng điều hành, `/admin`) — the whole page used inline `style={{...}}`
     referencing CSS custom properties that do not exist in this project's token set
     (`var(--surface)`, `var(--background)`, `var(--border)`, `var(--error)` — the real tokens are
     `--surface-card`/`--surface-page`/`--border-default`/`--danger`) plus a tab toggle built from
     `.btn`/`.btn-primary`/`.btn-outline` (also never styled) and a `Button` `variant="outline"` that
     the shared `Button` component has never supported (only `primary`/`secondary` have CSS). Fixed
     by swapping the tab toggle for the existing `.tabs`/`.tab` component (same pattern as
     Work/Knowledge/Innovation), the two panel wrappers for the existing `.content-card`, the wrong
     variable names for the real tokens, and `variant="outline"` for `variant="secondary"`. The raw
     `<table>` markup for the users/orgs list was deliberately left as-is — Wave D guidance
     (`docs/02-design-system.md` §11.4/§Admin) explicitly wants density/scanability over
     decoration for admin surfaces, and a dense native table already serves that.
- **Explicitly found but NOT fixed (reported, not silently expanded into scope):**
  - `Innovation.jsx`'s "Gửi bài toán" button has no `onClick` at all — the "Gửi bài toán, điểm
    nghẽn" modal (`docs/02-design-system.md` §11.5) was never built. This is a missing feature, not
    a style defect; building it would be new business/UI functionality outside a visual-rollout
    round. Left as-is, flagged for a product decision.
  - `Profile.jsx`'s "Thông tin cá nhân" and "Thống kê hoạt động" rows both navigate to `/ca-nhan`
    (the current page — a no-op). Looked like unfinished placeholders for future subpages; left
    untouched rather than silently deleting rows, since removing them would be a scope-widening
    functional change this round wasn't asked to make.
  - `AdminLearningTopics.jsx`/`AdminQuizEditor.jsx` reference undefined modifier classes
    (`.learning-admin-form`/`.learning-admin-list`/`.question-form`/`.quiz-admin-page`), but each
    rides alongside an already-fully-styled base class (`.campaign-form`/`.campaign-list`/
    `.admin-reports-page`) — fixing them would produce zero visible difference, so left alone.
  - Report-history accordion's "Xem chi tiết"/"Thu gọn" trailing label wraps awkwardly to two lines
    on 390px width inside the `.file-row` toggle button — readable, not overlapping, not a hard-rule
    violation; noted as a minor cosmetic nit rather than fixed.
- **Screens classified `ALREADY_COMPLIANT`** after static+browser review (no dead CSS found, no
  Modern Civic Glass gap that needed restyling): Work, Knowledge, Home, Documents (already done on
  PR47); Notifications; MemberManagement, MemberDetail, MemberImport (all reuse `campaign-*`/
  `content-card`/`confirm-overlay` correctly, per the P5.5-06 convention already documented in
  `04-current-tasks.md`); AskAi, LearningTopics, LearningTopicDetail, Quiz (all reuse `document-card`/
  `detail-hero`/`info-grid`/`quiz-*` correctly); AdminReports, AdminDocuments, AdminReportDashboard,
  AdminLearningTopics, AdminLearningTopicDetail, AdminQuizEditor, AdminKnowledgeArticle (Wave D —
  dense/functional already, no decoration needed per design system).
- **`DO_NOT_TOUCH` this round:** `pages/auth/*` (Login/ForgotPassword/ResetPassword/ChangePassword)
  — not named in the design-system addendum's rollout list or the task's 14-screen inventory;
  `ChangePassword.jsx`/`Login.jsx` do have their own dead-class findings (`auth-container`/
  `auth-form`/`auth-header`/`error-message`/`success-message`/`link-button`) but fixing them is a
  separate, out-of-scope round.
- **File đã sửa:** `src/components/Guards.jsx`, `src/pages/Profile.jsx`, `src/pages/Innovation.jsx`,
  `src/pages/ReportAssignmentDetail.jsx`, `src/pages/Admin.jsx`, `src/index.css`.
- **Kiểm tra:** `npm run lint` (0 error/4 warning cũ, không đổi), `npm test` (197/197, không đổi),
  `npm run build` (PASS) sau mỗi wave thay đổi. Browser: Chromium thật, viewport 390×844 và
  1440×900, network Supabase/Member API mocked qua `context.route` (không có backend thật/Docker
  trong sandbox này); đo touch-target thật bằng `getBoundingClientRect()` — 0 phần tử dưới 44px sau
  fix trên Home/Work/Knowledge/Innovation/Profile/Notifications/MemberManagement; console sạch (chỉ
  lỗi tải font Google Fonts do sandbox chặn egress, không phải lỗi ứng dụng). Ảnh chụp màn hình:
  `docs/screenshots/ui-modern-civic-glass-phase2/`.
- **Rủi ro còn lại:** Vercel Preview thật với Supabase/Member API thật chưa được click-through
  (môi trường này không có egress tới các host đó) — xem báo cáo PR để biết verdict runtime chính
  xác. `AdminReports`/`AdminReportDashboard`/`AdminDocuments`/`AdminKnowledgeArticle`/
  `AdminLearningTopicDetail` được xếp `ALREADY_COMPLIANT` dựa trên đọc code + việc không có dead CSS
  class, nhưng KHÔNG được chụp ảnh màn hình thật trong vòng này (giới hạn effort) — nên coi là
  "chưa xác nhận bằng browser" chứ không phải "đã kiểm chứng".

## [2026-09-12] PR47 — Modern Civic Glass browser acceptance + closure fixes

- **Agent:** Claude Code
- **Base:** PR #47 (`feat/ui-modern-civic-glass`) exact head `9406da8ef05d9c0e7bb9059adf46a326a225afdc`
  (base `master@3854196`).
- **Thay đổi:** Xác minh Trang chủ/Công việc/Tri thức bằng browser Chromium thật (dev server, session
  Supabase giả lập tại tầng network — vì môi trường không có Docker/egress tới Supabase/Vercel —
  không sửa `AuthContext`/`supabaseClient`, chỉ mock response REST qua Playwright `page.route`).
  Phát hiện và sửa 3 lỗi visual thật:
  1. `src/pages/Home.jsx`: bỏ mã `BM-01` hard-code trên campaign card (dữ liệu `campaigns` không có
     field mã thật) — theo đúng quyết định `docs/02-design-system.md` addendum "chỉ hiện mã biểu mẫu
     khi có mã thật".
  2. `src/pages/Home.jsx`: chuyển badge "Dữ liệu minh họa" xuống SAU `metrics-grid` — trước đó badge
     nằm ngay trước `.metrics-grid.overlap` (margin-top:-45px kéo card đè lên header), khiến card đầu
     tiên "chồng" lên đúng vị trí badge, làm chữ badge hiện mờ/lem qua nền card bán trong suốt.
  3. `src/index.css`: thêm CSS còn thiếu cho `.fab` (nút nổi "Hỏi AI" ở Tri thức) — class này được
     dùng trong `Knowledge.jsx` từ trước nhưng chưa từng có rule CSS nào (kể cả trước PR47), nên nút
     render không style, không fixed-position, đè lệch vào nội dung/bottom-nav. Đã thêm fixed
     bottom-right, hình tròn, `--brand-800`, và offset riêng cho mobile để không đè bottom-nav.
  4. `src/index.css`: `.featured-document-actions a,button{min-height:38px}` → `44px` — CTA "Hỏi AI
     về văn bản"/"Xem văn bản" (class mới của PR47) thấp hơn ngưỡng 44×44px accessibility mà chính
     `docs/02-design-system.md` §17 yêu cầu; đo bằng `getBoundingClientRect()` qua browser thật.
- **File đã sửa:** `src/pages/Home.jsx`, `src/index.css`.
- **Ảnh chụp:** `docs/screenshots/ui-modern-civic-glass/{home,work,knowledge}-{desktop,mobile}.png`
  (Chromium thật, dev server exact-head, không chỉnh sửa sau khi chụp).
- **Kiểm tra:** `npm run lint` 0 lỗi/4 warning cũ (không đổi), `npm test` 197/197 pass, `npm run build`
  PASS — không regression. Smoke test tương tác thật (điều hướng Trang chủ/Công việc/Tri thức, đổi
  tab, CTA "Xem văn bản", back/forward) không phát sinh lỗi console ngoài lỗi tải Google Fonts do
  chính sách mạng của môi trường thi công (không phải lỗi code).
- **Giới hạn còn lại:** môi trường thi công không có Docker/egress internet nên không đăng nhập được
  Supabase/Vercel Preview thật — bằng chứng browser dùng session/API response giả lập ở tầng network
  (không giả lập UI). Owner nên xác nhận lại nhanh trên Vercel Preview thật trước khi merge, đặc biệt
  hiệu ứng `backdrop-filter` (không kiểm chứng được độ nét blur trong Chromium headless sandbox).

## [2026-09-08] P5.5-07R — Pre-Runtime Product Closure

- **Agent:** Claude Code
- **Base:** `master@02a49f08419ae0e5545e95b9e4b5a2bf2f2c164d` (PR #45, P5.5-07 merged — owner
  authorized and confirmed merge). Branch `feat/p5-5-07r-pre-runtime-closure`.
- **Phạm vi:** hoàn thiện những gì còn có thể hoàn thiện ở code/local trước khi Astra chạy P5.5-08,
  Mắt Bão được provision, và P5.5-09 runtime rehearsal có thể chạy. KHÔNG phải P5.5-08. Không tuyên
  bố Security Acceptance PASS, không tuyên bố Runtime Readiness PASS, không bắt đầu Phase 6, không
  deploy production.
- **Đọc trước khi code:** toàn bộ `member-api/src/{memberAudit,memberRoutes,server,memberRepository,
  memberValidation,importParser,importValidation}.js`, `src/services/memberService.js`,
  `src/pages/{MemberDetail,MemberImport}.jsx`, `src/components/Guards.jsx`, PR #43/#44/#45,
  `docs/brain/03-decisions.md` (P5.5-D8…D15), `docs/phase-5-5/{00-member-management-architecture,
  01-member-infrastructure-decision}.md`.
- **Thay đổi:**
  1. **Đóng gap frontend audit history** (backend `GET /v1/members/:id/audit` có sẵn từ P5.5-07,
     frontend triển khai trước đó ở P5.5-06 nên chưa dùng): `src/services/memberService.js` thêm
     `mapAuditLog`/`getMemberAuditHistory` (bounded pagination, allowlist 9 field nghiệp vụ trên
     `before_data`/`after_data`, không expose field lạ, không invent actor name từ UUID);
     `src/lib/memberDisplay.mjs` thêm `AUDIT_ACTION_LABELS`/`AUDIT_FIELD_LABELS`/
     `describeAuditEntry` (pure, format enum → nhãn tiếng Việt, before/after chỉ hiện khi UPDATE);
     `src/pages/MemberDetail.jsx` thêm section "Lịch sử thay đổi" với state độc lập
     (`auditLoading`/`auditError`/`auditLogs`/pagination "Tải thêm") — lỗi audit không làm mất phần
     thông tin Member chính (hai panel tách state hoàn toàn).
  2. **Audit integrity regression** (mới): `member-api/tests/memberAuditIntegrity.test.mjs` (16
     test) — PATCH/POST crafted chứa `before_data`/`after_data`/`actor_user_id`/`audit_id`/
     `import_job_id`/nested `audit` object đều bị `unknown_field`/`protected_field` chặn (allowlist
     `memberValidation.js` sẵn có, không cần sửa); actor luôn từ `authorizeMemberManagement`
     resolver, không bao giờ từ body; rejected/out-of-scope/validation-error request → 0 audit row
     mới; test atomicity trực tiếp (`updateMember` với `pool` giả lập audit INSERT lỗi) chứng minh
     mutation + audit rollback cùng nhau, không dangling. **Không sửa architecture/implementation**
     — toàn bộ pass trên code hiện có, xác nhận đã đúng từ P5.5-07.
  3. **CORS pre-runtime hardening** (mới, `member-api/tests/server.test.mjs` +9 test): trailing
     slash, prefix/suffix trick domain, `Origin: null`, thiếu Origin (vẫn xử lý bình thường, không
     bị CORS chặn — đúng cho caller non-browser), case-sensitivity, không bao giờ echo `*`, bearer
     token không lộ qua response header khi Origin không khớp. Production hostname vẫn giữ
     `RUNTIME_PENDING` — không tự bịa domain vào `applyCorsHeaders`/test.
  4. **Import edge-case regression** (mới): `member-api/tests/importValidation.test.mjs` +5 test
     (nhiều sheet → chỉ đọc sheet đầu; hidden row vẫn đọc được, không bị bỏ qua; hidden sheet đầu
     vẫn được đọc — chọn sheet theo vị trí, không theo visibility; cell 50.000 ký tự không crash
     parser, length enforcement ở `validateImportRow`; NFC/NFD Unicode giữ nguyên byte qua
     validate). `member-api/tests/importDedup.test.mjs` +1 test (soft-match nhận diện đúng dù tên
     NFC vs NFD khác byte, dùng `member_immutable_unaccent()` thật qua Postgres). Đã có sẵn từ
     P5.5-05 (không làm lại): malformed workbook, oversized upload, duplicate header, formula cell,
     concurrent confirm, retry sau confirm, stale scope giữa preview/commit.
  5. **Data-plane isolation regression** (mới): `tests/member_data_plane_isolation.test.mjs` (8
     test, static source-scan, không cần DB) — Member frontend files + toàn bộ `member-api/src/`
     không tham chiếu Gemini/RAG/embeddings/`document_chunks`/localStorage/sessionStorage/
     IndexedDB/email-provider/analytics; `member-api/package.json` không có dependency AI/embeddings
     nào; các Edge Function AI (`ask-ai`, `generate-knowledge-article`, `process-document`,
     `run-ingestion-jobs`) không tham chiếu bảng/biến môi trường Member Record; `resolve-member-scope`
     (cầu nối hợp lệ duy nhất) không tham chiếu Gemini/RAG.
  6. **Deployment readiness:** `member-api/package.json` thêm `engines.node: ">=20.0.0"`. Audit xác
     nhận `/healthz`/`/readyz`/graceful shutdown (`SIGTERM`/`SIGINT`)/`npm run migrate`
     (forward-only, tracked qua `schema_migrations`)/`.env.example` (chỉ tên biến, không giá trị
     secret) đã đúng từ trước — không sửa. **Không tạo `Dockerfile`/`.dockerignore`** — cơ chế build
     Vibe Host v2 (Dockerfile vs buildpack/git-push) chưa xác minh được từ tài liệu chính thức
     Mắt Bão; tạo Dockerfile khi chưa xác nhận cần sẽ là bề mặt không xác minh thứ hai phải giữ đồng
     bộ. Ghi rõ trong runbook mới, không tự bịa.
  7. `docs/phase-5-5/02-member-api-deployment-runbook.md` (mới) — runbook provider-neutral đầy đủ:
     deployment mechanism (chưa xác nhận Dockerfile hay không), bảng env var (secret/public),
     provisioning + migration DB, CORS/CSP/domain wiring (mục 28.3), readiness contract, graceful
     shutdown, smoke test 5 bước, rollback (app/migration/database), pointer sang backup/restore
     rehearsal. Không ghi giá trị production giả ở bất kỳ đâu (mọi ô chưa quyết định ghi
     `RUNTIME_PENDING`/`<...>`).
  8. `member-api/scripts/backup-restore-rehearsal.mjs` (mới) — harness chuẩn bị rehearsal
     backup/restore, 4 subcommand (`seed`/`mutate`/`verify`/`cleanup`) thao tác trên bảng riêng
     `_rehearsal_markers` (không đụng `members`/`member_audit_logs`/`member_import_jobs`). Fail
     closed: từ chối chạy nếu thiếu `--confirm-non-production`; connection string CHỈ đọc từ
     `MEMBER_DATABASE_URL` (không nhận qua CLI arg — tránh lộ vào shell history); checksum lưu file
     local (ngoài DB) để sống sót qua chính thao tác restore đang được rehearsal. Không tự động
     trigger backup/restore thật (không có quyền truy cập Mắt Bão) — hai bước đó vẫn thủ công, script
     chỉ verify kết quả phía DB. Smoke-test cục bộ: `seed`→`mutate`→`verify` báo đúng `MISMATCH` (vì
     chưa có restore thật xảy ra giữa hai bước) — chứng minh script phát hiện đúng tình trạng thật,
     không tự động báo PASS giả; `cleanup` dọn sạch. Restore thật vẫn `BLOCKED_PENDING_INFRA`.
  9. `docs/brain/04-current-tasks.md` — sửa dòng stale "chờ merge PR #41" (đã merged từ lâu) thành
     trạng thái đã merged; thêm section P5.5-07R đầy đủ (current state, không tuyên bố PASS ngoài
     phạm vi).
- **Local full-stack/browser acceptance: BLOCKED (ghi đúng thực tế, không invent PASS).** Docker
  daemon không khởi động được trong sandbox này (`service docker start` → lỗi `ulimit: Operation
  not permitted`; `dockerd` không tạo được socket). `supabase start` (Supabase CLI qua `npx`, chạy
  được) phụ thuộc Docker để dựng Postgres/Auth/Storage local — không dựng được. Không có Supabase
  Auth local nghĩa là không thể "đăng nhập synthetic actor" (bước 1 của 15-bước journey yêu cầu) —
  toàn bộ chuỗi phụ thuộc (bearer token thật cho Member API, `resolve-member-scope` Edge Function)
  không thể rehearsal. Không có ảnh chụp màn hình nào được tạo. Đây KHÔNG thay thế P5.5-09 hosted
  rehearsal — giữ nguyên `BLOCKED`.
- **Repository governance audit:** `mcp__github__list_branches` xác nhận toàn bộ branch kiểm tra
  được (bao gồm `master` và mọi `feat/p5-5-*`) đều `protected: false`. Khuyến nghị owner bật branch
  protection cho `master` (require PR trước merge, require CI checks pass, prevent force-push,
  prevent deletion) khi sẵn sàng — **không tự thay đổi GitHub settings** (ngoài phạm vi P5.5
  application blocker, cần owner quyết định).
- **Test:** `member-api` **273/273 pass** (`npm test`, PostgreSQL 16 thật cục bộ — 243 baseline
  P5.5-01…07 không đổi + 30 mới: 16 audit integrity + 9 CORS + 5 import edge-case). Root **197/197
  pass** (`npm test` — 173 baseline không đổi + 24 mới: 8 audit-history service + 8 audit-history UI
  + 8 data-plane isolation). Root `npm run lint`: 0 error, 4 warning (không đổi so với trước, cùng
  loại `react-refresh/only-export-components` đã có). Root `npm run build`: PASS. `npm audit
  --omit=dev` cả root và `member-api`: **0 vulnerabilities**. `git diff --check`: sạch. Secret scan
  thủ công trên diff: không phát hiện credential/secret hardcode.
- **Kiểm tra:** chạy lại toàn bộ test suite sau mỗi thay đổi (không chỉ test mới); xác nhận build
  frontend biên dịch được với `MemberDetail.jsx`/`memberService.js`/`memberDisplay.mjs` mới; xác
  nhận script rehearsal backup/restore chạy đúng logic qua smoke test cục bộ (không phải chạy giả
  định); xác nhận qua GitHub API thay vì suy đoán cho phần branch protection.
- **Verdict:** `P5_5_PRE_RUNTIME_CLOSURE_PASS_BROWSER_RUNTIME_PENDING` (code/local closure hoàn
  tất; browser/local stack không chạy được do hạn chế Docker của sandbox, không phải do lỗi trong
  code Member Management). Giữ riêng, không gộp: `ASTRA_SECURITY_ACCEPTANCE_PENDING`,
  `HOSTED_RUNTIME_AND_RESTORE_PENDING`. Không dùng `PHASE_5_5_SECURITY_ACCEPTANCE_PASS`/
  `PHASE_5_5_RUNTIME_READINESS_PASS`/`PHASE_5_5_END_TO_END_ACCEPTANCE_PASS`.

## [2026-09-08] P5.5-07 — Audit + Backup/Restore Readiness

- **Agent:** Claude Code
- **Base:** `master@03e765e234d4b0bc310629e8bda0e7407fa7c966` (PR #44, P5.5-06 merged — owner
  authorized and confirmed merge after CI/mergeability verification). Branch
  `feat/p5-5-07-member-audit-backup`.
- **Đọc trước khi code:** `docs/phase-5-5/00-member-management-architecture.md` mục 16 (audit
  contract) và mục 18 (backup/restore contract, checklist), `docs/phase-5-5/01-member-infrastructure-decision.md`
  (xác nhận lại: provisioning Mắt Bão Vibe Host v2 vẫn CHƯA thực hiện), toàn bộ
  `member-api/src/{memberRepository,importRepository,memberRoutes,importRoutes,server}.js` hiện có.
- **Thay đổi (Phần A — application audit):**
  1. `member-api/migrations/0003_member_audit.sql` — `member_audit_logs` (enum
     `member_audit_action`, không có cột `outcome` — mục P5.5-D14), index theo `member_id` và
     `import_job_id`.
  2. `member-api/src/memberAudit.js` (mới) — build payload chỉ 9 field nghiệp vụ (loại
     `external_ref_note`), `insertAuditLog` luôn nhận `client` trong transaction mở, đọc phân
     trang `listMemberAuditLogs`.
  3. `member-api/src/memberRepository.js` — `createMember`/`updateMember` viết lại thành
     transaction thật (trước đây là một `pool.query` đơn); `updateMember` thêm `SELECT ... FOR
     UPDATE` (cùng scope predicate) để lấy `before_data` chính xác trước khi ghi.
  4. `member-api/src/importRepository.js` — `confirmImportJob` ghi 1 audit row/member được commit
     (mục P5.5-D15), có `import_job_id`, cùng transaction với insert.
  5. `member-api/src/memberRoutes.js` — route mới `GET /v1/members/:id/audit` (route match trước
     pattern `:id` chung, cùng kiểu importRoutes.js); truyền `userId` xuống
     `createMember`/`updateMember`.
  6. `member-api/src/server.js` — truyền `userId: result.userId` vào `handleMemberRoute` (trước đó
     không truyền — P5.5-03 chưa cần vì chưa có audit).
  7. `member-api/src/importRoutes.js` — truyền `actorUserId: userId` vào `confirmImportJob`.
- **Cập nhật fixture test cũ (không phải sửa bug P5.5-01…06):** `createMember`/`updateMember` giờ
  đòi `actorUserId` (cột UUID NOT NULL mới). `memberCrud.test.mjs`/`importDedup.test.mjs` (gọi
  repository trực tiếp, ~43 call site) thêm một wrapper nội bộ cùng tên hàm (`createMember`/
  `updateMember` shadow lại import gốc `as createMemberRaw`) tự động cung cấp actor cố định — không
  sửa một call site nào trong hai file. `memberRoutes.test.mjs`'s `authorizerFor` đổi
  `userId: 'test-user'` (chuỗi không phải UUID, trước đây vô hại vì chưa ghi vào cột UUID nào) sang
  một UUID test cố định thật.
- **Test mới:** `member-api/tests/memberAudit.test.mjs` (11 test, repository-level) + 3 test thêm
  vào `memberRoutes.test.mjs` (HTTP-level: endpoint audit, scope 404, rejected-PATCH-no-audit) + 3
  test thêm vào `memberImportRoutes.test.mjs` (HTTP-level: audit theo import_job_id, idempotent
  không nhân đôi, cancel không tạo audit). **243/243 pass** (`npm test`, PostgreSQL 16 thật cục bộ)
  — 226 baseline P5.5-01…06 không đổi + 17 mới.
- **Performance re-check:** `memberImportPerformance.test.mjs` (không sửa file, chỉ chạy lại) —
  confirm/commit ~2.580 member từ ~550ms (P5.5-05, trước khi có audit) lên ~1.670ms (audit tăng gấp
  đôi số INSERT/transaction) — vẫn sâu dưới target mục 25 ("dưới vài giây"), ghi nhận số liệu mới,
  không sửa test.
- **Root validation:** không đổi file `src/`/`supabase/` nào trong P5.5-07 — chạy lại `npm run
  lint` (0 error/4 warning, không đổi), `npm test` (173/173, không đổi), `npm run build` (PASS) để
  xác nhận không ảnh hưởng gì, đúng thực tế không có thay đổi.
- **Thay đổi (Phần B — infra backup/restore audit):** KHÔNG có provisioning, KHÔNG có thay đổi hạ
  tầng nào được thực hiện — agent không có tài khoản/quyền truy cập Mắt Bão. Audit lại 5 câu hỏi
  checklist mục 18, xác nhận cả 5 vẫn chưa trả lời được (không có bằng chứng mới so với P5.5-01),
  và lập danh sách 6 blocker cụ thể owner/infra cần làm trước khi phần B được coi PASS (xem chi
  tiết đầy đủ trong `docs/brain/04-current-tasks.md` mục P5.5-07). Không tự nhận "đã kiểm tra hạ
  tầng" theo bất kỳ nghĩa nào ngoài việc đọc lại tài liệu đã có.
- **Verdict:** `P5_5_07_APPLICATION_AUDIT_PASS_INFRA_RUNTIME_BLOCKED` — phần A (application audit)
  PASS đầy đủ có test chứng minh; phần B (infra backup/restore) BLOCKED, không có quyền/hạ tầng
  thật để tiếp tục, đã ghi rõ blocker cho owner.
- **Lý do:** Hoàn thành đúng phạm vi P5.5-07 (mục 4 prompt DEV MODE) — không tuyên bố PASS cho phần
  không thể tự xác minh, không invent capability của Mắt Bão.

## [2026-09-08] P5.5-06 — Admin/Member Frontend

- **Agent:** Claude Code
- **Base:** `master@9f89ba808911d8a7f6c9413436e596b239ffa87c` (PR #43, P5.5-05 merged — owner
  authorized and confirmed merge after CI/mergeability verification). Branch
  `feat/p5-5-06-member-frontend`.
- **Đọc trước khi code:** `docs/01-product-spec.md`, `docs/02-design-system.md` (đã dùng lại toàn
  bộ token/class CSS sẵn có, không viết CSS mới), `src/components/Guards.jsx`,
  `src/services/documentService.js`/`documentAdminService.js` (convention `create*Service(client)`),
  `src/pages/AdminDocuments.jsx`/`DocumentDetail.jsx` (pattern list/form/detail để tái dùng),
  `src/contexts/AuthContext.jsx` (phát hiện `hasRole()` có bypass `SYSTEM_ADMIN` baked-in — không
  dùng cho Member Management), `src/App.jsx`, `src/components/Layout.jsx`, `vercel.json` (CSP
  `connect-src` hiện chỉ cho phép `'self'` + `*.supabase.co` — ghi nhận là giới hạn đã biết, xem
  dưới).
- **Thay đổi:**
  1. Member API (backend enabler tối thiểu, cần thiết để UI gọi được qua trình duyệt — xem
     P5.5-D12 `03-decisions.md`): `config.js` thêm `CORS_ALLOWED_ORIGIN` (required, fail-closed);
     `server.js` thêm `applyCorsHeaders`/xử lý `OPTIONS` preflight (exact-origin echo, không
     wildcard, preflight không đi qua authorization); `index.js` truyền `config.corsAllowedOrigin`;
     `.env.example` thêm biến mới. Test mới trong `server.test.mjs`: không có header khi chưa cấu
     hình, echo đúng khi origin khớp, không reflect khi không khớp, preflight không gọi
     `authorizeMemberManagement`. Cập nhật `loadConfig` test hiện có (thêm `CORS_ALLOWED_ORIGIN`
     vào fixture "valid minimal config", thêm test fail-closed mới) — không sửa logic P5.5-01…05.
  2. `.env.example` (root) — thêm `VITE_MEMBER_API_URL` (không phải secret, giống
     `VITE_SUPABASE_URL`).
  3. `src/services/memberService.js` (mới) — `createMemberService(client, {baseUrl, fetchImpl})`;
     `client` chỉ dùng lấy access token (`auth.getSession()`) + đọc bảng `organizations` (RLS sẵn
     có) — không bao giờ dùng để tính authorization. `baseUrl`/`fetchImpl` là tham số tường minh,
     không đọc `import.meta.env` trong file này (giữ module testable dưới `node --test` thuần,
     đúng convention `createDocumentService(client)`). Bọc toàn bộ Member API endpoint P5.5-02…05.
     Lỗi HTTP chuẩn hoá thành `MemberServiceError` với `code` từ allowlist server trả về
     (`BUSINESS_ERROR_CODES`), giữ nguyên body gốc ở `error.cause` (cần cho `import_job_id` khi
     upload workbook lỗi).
  4. `src/lib/memberDisplay.mjs` (mới) — nhãn tiếng Việt + tone cho mọi enum/status, tách biệt
     khỏi service (đúng convention `documentAdminDisplay.mjs`).
  5. `src/components/Guards.jsx` — thêm `getMemberManagementGuardAction` (pure function, cùng
     pattern `getAuthGuardAction` đã có) + component `MemberManagementGuard`. Điều kiện
     `roles.includes('YOUTH_ADMIN') || roles.includes('BRANCH_OFFICER')`, KHÔNG có nhánh
     `SYSTEM_ADMIN` — đúng cảnh báo mục 24 fix F1 của kiến trúc (RoleGuard nguyên trạng có bypass
     `SYSTEM_ADMIN`, không được dùng cho Member Management). `requireImportRole` prop giới hạn
     route import chỉ `YOUTH_ADMIN` (khớp `importRoutes.js` P5.5-05).
  6. `src/pages/MemberManagement.jsx` (mới) — `/quan-ly-doan-vien`: list + search + đủ 5 filter
     (`work_unit_code`, `member_status`, `youth_position`, sort — youth_board_position/
     political_theory_level filter chưa lên UI nhưng service đã hỗ trợ, có thể bổ sung UI sau nếu
     cần) + pagination "Tải thêm" (server-side, không tải hết 3.000 dòng về client) + form tạo mới
     inline (toggle, giống `AdminDocuments.jsx`). Nút "Import Excel" chỉ hiện khi actor có
     `YOUTH_ADMIN` (đọc từ `getScope()`).
  7. `src/pages/MemberDetail.jsx` (mới) — `/quan-ly-doan-vien/:memberId`: xem/sửa field, nút
     lưu trữ/khôi phục (`PATCH member_status`) có confirm dialog. Không có mục lịch sử audit (chưa
     có audit table — P5.5-07).
  8. `src/pages/MemberImport.jsx` (mới) — `/admin/quan-ly-doan-vien/import`: chọn file → upload
     (hiển thị tổng/hợp lệ/lỗi/nghi trùng/cảnh báo) → tab lọc theo `row_status` → mỗi dòng
     `POSSIBLE_DUPLICATE`/`WARNING` có checkbox "Vẫn tạo mới" (chỉ CREATE_NEW, KHÔNG merge, khớp
     P5.5-D9) → xác nhận/hủy → kết quả. Workbook lỗi (400 `malformed_workbook`) vẫn hiển thị job
     `FAILED` có `failure_reason` (đọc từ `error.cause.import_job_id`).
  9. `src/App.jsx`/`src/components/Layout.jsx` — wire 3 route mới, thêm mục sidebar "Quản lý đoàn
     viên" dùng trực tiếp `roles` (không dùng `hasRole()` — đã xác nhận `hasRole()` có bypass
     `SYSTEM_ADMIN` baked-in, không phù hợp Member Management).
- **Quyết định kỹ thuật mới:** P5.5-D12 (CORS exact-origin, không wildcard), P5.5-D13 (không xây
  `/member-metadata`, tái dùng `organizations` + `/v1/member-scope` có sẵn) — chi tiết
  `03-decisions.md`.
- **Kiểm tra:**
  - Member API: `npm run migrate:fresh`, `npm test` → **226/226 pass** (221 baseline P5.5-01…05
    không đổi + 5 CORS test mới).
  - Root: `npm install` (postgresql service cần khởi động lại giữa các lần chạy do môi trường
    không giữ service state qua các turn — không phải lỗi code), `npm run lint` → 0 error (4
    warning: 3 warning "fast refresh" cũ + 1 warning cùng loại mới ở `getMemberManagementGuardAction`,
    không phải baseline mới xấu đi — cùng bản chất với warning đã tồn tại ở `getAuthGuardAction`
    cùng file); phát hiện 1 lỗi lint thật (`react-hooks/set-state-in-effect` ở `MemberDetail.jsx`)
    và vá bằng đúng pattern "deferred setTimeout" đã dùng ở `AdminDocuments.jsx`/`MemberManagement.jsx`.
  - Root `npm test` → **173/173 pass** (153 baseline + 20 mới: 12 `member_service.test.mjs` + 8
    `MemberManagementGuard.test.mjs`).
  - Root `npm run build` → PASS (không lỗi import/module).
  - Smoke check bổ sung: khởi động `npm run dev`, `curl` xác nhận HTTP 200 + đúng HTML shell tại
    `/`. KHÔNG cài Playwright riêng cho việc này (không có trong dependency dự án, không cân xứng
    chỉ để một lần kiểm tra) — không thực hiện được click-through trình duyệt thật vì môi trường
    này không có Supabase project thật để đăng nhập, và Member API chưa được deploy. Đây là giới
    hạn được ghi nhận rõ ràng, không tự nhận đã kiểm thử UI qua trình duyệt với dữ liệu thật.
- **Không có trong subphase này:** `/member-metadata` thật, audit/lịch sử thay đổi (P5.5-07), export,
  hard delete UI, merge/update-existing qua import UI, runtime rehearsal trình duyệt thật (giới hạn
  môi trường viết code, không phải bị bỏ qua có chủ đích).
- **Lý do:** Hoàn thành P5.5-06 theo đúng chỉ dẫn owner (mục 3 của prompt DEV MODE), tuân thủ mục
  24 kiến trúc (route, guard không bypass SYSTEM_ADMIN, mobile-first dùng token sẵn có).

## [2026-09-08] P5.5-05 — Excel Import

- **Agent:** Claude Code
- **Base:** `master@ac2bf2c263934366f5bc3eae0ad44ebffc981f62` (PR #42, P5.5-04 merged — owner
  authorized and confirmed merge after CI/mergeability verification). Branch
  `feat/p5-5-05-member-excel-import`.
- **Baseline audit (mục 0 của prompt):** đọc lại toàn bộ `docs/phase-5-5/00-member-management-architecture.md`
  (mục 1, 9, 10, 22, 23, 25, 26 — import contract, dedup, atomicity/idempotency, threat model, test
  matrix, performance target), `docs/phase-5-5/01-member-infrastructure-decision.md`,
  `docs/brain/01-architecture.md`/`03-decisions.md`/`04-current-tasks.md`, lịch sử PR #38→#42, và
  toàn bộ `member-api/src/*.js` hiện có. Xác nhận trực tiếp bằng `grep`/`find`: KHÔNG có parser
  Excel, staging schema, import job state machine, dedup helper, import route hay audit scaffold nào
  tồn tại trước task này — README/`04-current-tasks.md` đã đúng khi nói "chưa có import Excel".
- **Thay đổi:**
  1. `member-api/migrations/0002_member_import_staging.sql` — `member_import_jobs` +
     `member_import_job_rows`, 2 enum type mới (`member_import_job_status`,
     `member_import_row_status`), index, trigger `updated_at` tái dùng `member_set_updated_at()` đã
     có từ P5.5-01.
  2. `member-api/src/importParser.js` (mới) — parse workbook bằng `exceljs`, header contract cố
     định, formula cell chỉ đọc cached `result`, bound file/row size.
  3. `member-api/src/importValidation.js` (mới) — field validation tái dùng enum constant từ
     `memberValidation.js`.
  4. `member-api/src/importDedup.js` (mới) — soft-match dedup, 2 query set-based dùng
     `member_immutable_unaccent()`.
  5. `member-api/src/importRepository.js` (mới) — staging persistence + `confirmImportJob`/
     `cancelImportJob` (transaction atomic + idempotent, `SELECT ... FOR UPDATE`).
  6. `member-api/src/importRoutes.js` (mới) — 5 route, gate riêng "chỉ `YOUTH_ADMIN`".
  7. `member-api/src/organizationDirectory.js` — thêm `createOrganizationDirectoryBatch`
     (không sửa `createOrganizationDirectory` hiện có).
  8. `member-api/src/scope.js` — thêm `isOrgCodeInScope` (không sửa `assertOrgCodeInScope`).
  9. `member-api/src/server.js` — wire import routes (check TRƯỚC `matchMemberRoute`), thêm
     `readImportConfirmBody` (cap 2MB riêng cho confirm payload có thể chứa nhiều `row_overrides`,
     tách khỏi `MAX_BODY_BYTES` 100KB dùng cho CRUD thường).
  10. `member-api/src/index.js` — inject `checkOrganizationCodesExist` vào `createServer`.
  11. `member-api/package.json` — thêm dependency `exceljs@^4.4.0` + `overrides.uuid: ^11.1.1`
      (đóng `npm audit` advisory `GHSA-w5hq-g745-h8pq` trong dependency bắc cầu của `exceljs` —
      xác minh riêng: `exceljs` chỉ gọi `uuid.v4()` không tham số, không bao giờ chạm code path có
      lỗ hổng, nhưng vẫn pin version vá cho sạch thay vì dựa vào lý luận "không dùng tới path đó").
- **Quyết định kỹ thuật mới (ghi ở `03-decisions.md`):** P5.5-D9 (không hỗ trợ merge/update-existing
  từ import), P5.5-D10 (chỉ `YOUTH_ADMIN` được import, không mở rộng `BRANCH_OFFICER`), P5.5-D11
  (parse/validate/dedup đồng bộ, không có `PARSED` state durable/worker nền).
- **Bug tự phát hiện + tự vá trong quá trình viết test:** `importRepository.js`'s `serializeJob`
  ban đầu không trả `created_by_user_id` trong response — khiến `canAccessImportJob` (quyết định
  404 cho job ownership) luôn coi actor KHÔNG PHẢI chủ job, kể cả khi họ chính là người tạo job
  (path `scope.isGlobal` che giấu bug này cho actor `YOUTH_ADMIN` toàn cục, nên chỉ lộ ra khi test
  scoped-actor-views-own-job thất bại với `404`). Phát hiện bằng chính test suite
  (`memberImportRoutes.test.mjs`) trước khi mở PR, vá bằng cách thêm field vào `serializeJob` —
  không sửa gì khác của P5.5-01…04.
- **Kiểm tra:**
  - `member-api`: reset `MEMBER_DATABASE_URL` trỏ PostgreSQL 16 cục bộ thật (không Docker sẵn có
    trong môi trường viết code này — dùng `postgresql-16` cài trực tiếp qua `apt`/`service
    postgresql start`), `npm run migrate:fresh`, `npm test` → **221/221 pass** (173 baseline P5.5-01
    …04 không đổi + 48 test mới: 17 `importValidation.test.mjs`, 10 `importDedup.test.mjs`, 20
    `memberImportRoutes.test.mjs`, 1 `memberImportPerformance.test.mjs`).
  - Root: `npm install` (lần đầu trong phiên này, `node_modules` chưa tồn tại), `npm run lint` → 0
    error/3 warning cũ (không đổi baseline), `npm test` → 153/153 pass, `npm run build` → PASS.
  - `git diff --check` sạch (không whitespace error); secret scan trên `member-api/src/*.js` mới/sửa
    (`grep` các pattern `sk-`/`AIza`/`PRIVATE KEY`/`service_role`/`password=`/`secret=`) → không có
    kết quả; `supabase/functions/.env` placeholder không đổi (đã có từ P5.5-02/04, không phải secret
    thật).
  - Performance evidence: xem mục P5.5-05 trong `04-current-tasks.md`/`member-api/README.md`.
- **Không có trong subphase này:** merge/update-existing member từ import (P5.5-D9), audit table
  cross-cutting (P5.5-07), frontend (P5.5-06), `/member-metadata`, deploy Mắt Bão, mọi thay đổi
  resolver/scope P5.5-02, mọi thay đổi P5.5-01…04 ngoài phát hiện bug thật ở trên.
- **Lý do:** Hoàn thành P5.5-05 theo đúng chỉ dẫn owner (mục 2 của prompt DEV MODE), tuân thủ toàn bộ
  invariant P5.5 (không Auth/Profile, không RAG/Gemini, không hard delete, không số hiệu, fail-closed
  scope).

## [2026-09-05] P5.5-04 — Member Search/Filter/List

- **Agent:** Claude Code
- **Base:** `master@56f858296bcd02c3a805d77dba2b3086cace8a4b` (PR #41, P5.5-03 merged). Branch
  `feat/p5-5-04-member-search-filter-list`.
- **Audit trước khi code:** đọc `docs/phase-5-5/00-member-management-architecture.md` mục 9/14/23/25
  và toàn bộ `member-api/src/{memberRepository,memberValidation,memberRoutes,server,scope}.js` +
  test hiện có. P5.5-03 đã đúng: pagination `limit/offset` (kể cả bound/clamp cho negative/zero/
  non-number/oversized), filter `work_unit_code`/`member_status`, search accent-insensitive
  (`pg_trgm`+`unaccent`), scope enforcement, parameter binding, LIKE-escaping,
  `ORDER BY full_name ASC, member_id ASC` cố định. Thiếu theo mục 14/23: filter
  `youth_position`/`youth_board_position`/`political_theory_level`; `sort` có thể chọn
  (`updated_at DESC`); performance evidence trên dataset ~3.000 dòng.
- **Thay đổi:**
  1. `member-api/src/memberValidation.js`: `parseListQuery` thêm parse+validate 3 filter còn thiếu
     (cùng `validateOptionalEnum` với enum canonical đã export sẵn) và query param `sort` — allowlist
     cố định `SORT_VALUES = ['full_name_asc', 'updated_at_desc']`, mặc định `full_name_asc`, giá trị
     ngoài allowlist ném `ApiError(400, 'validation_error', ...)`.
  2. `member-api/src/memberRepository.js`: `listMembers` thêm 3 điều kiện `AND` bound-parameter cho
     filter mới (cùng pattern `params.push(...)` + `$n` như 2 filter cũ — không có filter nào override
     hay mở rộng điều kiện scope đã build trước đó). Thêm `ORDER_BY_CLAUSES` — object literal cố định
     map `sort` đã validate sang đúng một trong hai chuỗi `ORDER BY` literal (`full_name ASC,
     member_id ASC` / `updated_at DESC, member_id ASC`) — không bao giờ nối giá trị `sort` của client
     trực tiếp vào SQL text. Cả hai order đều có tie-breaker `member_id` (mục 23 test #14 — stable
     ordering khi trùng `full_name`/`updated_at`).
  3. `member-api/src/memberRoutes.js`: truyền `sort` (từ `parseListQuery`) xuống `listMembers`.
  4. Không sửa `memberScope.js`/`scope.js`/Edge Function `resolve-member-scope` — không phát hiện bug
     thật ở resolver P5.5-02 trong quá trình audit; scope predicate của P5.5-03 (`work_unit_code =
     ANY($n::text[])` khi không global, rỗng luôn = 0 dòng) áp dụng nguyên trạng cho mọi filter mới.
  5. **Không thêm migration/index mới.** Benchmark trước bằng dataset synthetic (mục 10 chỉ dẫn: chỉ
     thêm index khi có bằng chứng) — xem mục Performance dưới.
- **Performance dataset & benchmark (mục 9/25):**
  - `member-api/tests/helpers/syntheticMembers.mjs` (mới) — sinh 3.000 dòng deterministic (không
    `Math.random()`, không dữ liệu đoàn viên thật): tên tiếng Việt tổng hợp từ tổ hợp họ/đệm/tên phổ
    biến, 30 mã tổ chức test-only (`P554-PERF-ORG-00`..`29`), cycle qua toàn bộ 4 `member_status`,
    xen `NULL` thực tế cho `youth_position`/`youth_board_position`/`political_theory_level`, và một
    pool tên cố định lặp lại (~1/12 số dòng) để đảm bảo có nhóm trùng `full_name` thật sự (không phải
    ngẫu nhiên may rủi) phục vụ test stable-ordering. Insert bằng một câu `INSERT ... SELECT * FROM
    UNNEST(...)` duy nhất (một round-trip cho toàn bộ 3.000 dòng).
  - `member-api/tests/memberPerformance.test.mjs` (mới) — seed dataset một lần trong `before()`, mỗi
    kịch bản warm-up 3 lần rồi đo 15 lần, sort thời gian, báo cáo min/median/max ra console, assert
    trên **median** so với target `<300ms` (mục 25) — tránh một sample đơn lẻ làm CI flaky.
  - Kết quả cục bộ (PostgreSQL 16 thật, 3.000 dòng synthetic):
    - List+filter (`work_unit_code`+`member_status`, scoped 1 tổ chức): min≈1.6ms median≈2.0ms
      max≈3.0ms.
    - List+filter (`member_status` only, global scope, quét cả 3.000 dòng): min≈1.7ms median≈2.2ms
      max≈2.5ms.
    - Search có dấu (`"Nguyễn Văn"`): min≈9.7ms median≈10.5ms max≈15.5ms.
    - Search không dấu (`"nguyen van"`): min≈9.2ms median≈9.8ms max≈10.3ms.
    Toàn bộ sâu dưới target 300ms (hệ số an toàn ≈30–150 lần).
  - `EXPLAIN (ANALYZE, BUFFERS)` xác nhận: filter `work_unit_code`+`member_status` dùng Index Scan
    trên `idx_members_work_unit_status` (đã có từ P5.5-01); search dùng Seq Scan (planner ước tính
    chi phí Seq Scan thấp hơn GIN trigram scan ở quy mô 3.000 dòng — hành vi PostgreSQL bình thường
    cho bảng nhỏ, không phải lỗi cấu hình index) — cả hai đều đạt target, nên **không cần
    migration/index mới**. Ghi lại làm bằng chứng "không over-engineer" theo đúng mục 10.
- **File đã sửa/tạo:**
  `member-api/src/{memberValidation,memberRepository,memberRoutes}.js`,
  `member-api/tests/helpers/syntheticMembers.mjs` (new),
  `member-api/tests/memberPerformance.test.mjs` (new),
  `member-api/tests/{memberValidation,memberCrud,memberRoutes}.test.mjs` (mở rộng),
  `member-api/README.md`, `docs/brain/01-architecture.md`, `docs/brain/04-current-tasks.md`,
  `docs/brain/06-ai-working-log.md` (entry này).
- **Lý do:** Hoàn thành đúng phạm vi P5.5-04 (mục 26 decomposition) — chỉ bổ sung delta còn thiếu so
  với P5.5-03, không viết lại phần đã đúng, không mở rộng sang P5.5-05 (import Excel).
- **Kiểm tra:** `member-api` **173/173 pass** cục bộ (PostgreSQL 16 thật, `npm test`) — 148 test
  P5.5-01…03 không regress + 25 test mới/mở rộng cho filter/sort/pagination-edge-case/performance.
  Negative/security: cross-org isolation cho 3 filter mới, filter/search không thể escape scope
  (kể cả khi client cố tình gửi `work_unit_code` của tổ chức khác), invalid enum filter → `400`,
  invalid/injection-shaped `sort` → `400` và không chạm SQL (bảng vẫn nguyên vẹn sau đó), pagination
  cực trị (negative/zero/non-number/oversized limit, offset vượt dataset) → luôn `200` với giá trị đã
  clamp, không bao giờ lỗi hay leak toàn bộ dữ liệu. Root `npm run lint` (0 lỗi, 3 warning cũ có sẵn),
  root `npm test` (153/153), root `npm run build` — không regression, không đụng `src/`/`supabase/`.
  Không chạy được `test-db` (Supabase local stack) cục bộ trong sandbox này (không có Supabase CLI) —
  không cần vì P5.5-04 không đụng `supabase/`; chờ CI thật trên PR để xác nhận job này.

## [2026-09-05] P5.5-03 fix — validate work_unit_code against authoritative organization data

- **Agent:** Claude Code
- **Thay đổi:** Đóng gap owner phát hiện trên PR #41 (chưa merge tại thời điểm review): `POST
  /v1/members` trước đó chỉ chặn được organization spoofing (`assertOrgCodeInScope`) nhưng, với actor
  `YOUTH_ADMIN` scope-toàn-cục (`is_global: true`, resolver trả `org_codes: []`), không xác thực được
  `work_unit_code` là một `organizations.code` có thật — chấp nhận bất kỳ chuỗi non-blank nào.
  1. Thêm `member-api/src/organizationDirectory.js`: `checkOrganizationExists(code, bearerToken)`
     gọi thẳng REST endpoint sẵn có của bảng `organizations` (`{SUPABASE_URL}/rest/v1/organizations?
     select=code&code=eq.<code>&limit=1`), dùng `apikey: SUPABASE_ANON_KEY` +
     `Authorization: Bearer <chính bearer token của actor>` — KHÔNG service role, nên không bao giờ
     vượt qua RLS policy "active users read organizations" đã có từ `202607300001_initial_schema.sql`
     — actor chỉ xác thực được đúng những gì RLS vốn đã cho họ đọc, không có quyền mới nào phát sinh.
     Không sửa `resolve-member-scope`, không thêm migration, không có cache/registry tổ chức thứ hai
     ở Member API (đọc lại mỗi lần gọi). Lỗi mạng/response không hợp lệ → `ApiError(503,
     'organization_directory_unavailable')`, không bao giờ fallback "coi như hợp lệ" (fail closed).
  2. `member-api/src/memberRoutes.js` (POST handler): gọi `checkOrganizationExists` TRƯỚC
     `assertOrgCodeInScope` — mã phải tồn tại thật (`400 unknown_organization`) rồi mới xét có nằm
     trong scope hay không (`403 forbidden`). Áp dụng như nhau cho `BRANCH_OFFICER`/`YOUTH_ADMIN`
     scoped/global — global chỉ bỏ qua bước lọc theo scope, không bao giờ bỏ qua bước xác thực tồn
     tại.
  3. `member-api/src/config.js`: thêm `SUPABASE_URL`/`SUPABASE_ANON_KEY` vào `loadConfig()`
     fail-closed (cùng nguyên tắc các biến bắt buộc khác — không có "existence check disabled" mặc
     định). `member-api/src/index.js` wire `createOrganizationDirectory` vào `createServer`.
     `member-api/src/server.js`: nhận thêm `checkOrganizationExists` + trích `bearerToken` (tái dùng
     `extractBearerToken` có sẵn từ `memberScope.js`) để truyền cho route handler.
  4. Test mới `member-api/tests/organizationDirectory.test.mjs` (unit, fake HTTP server — không cần
     Supabase thật trong CI, cùng pattern `memberScope.test.mjs`): request đúng GET + header, mã
     không tồn tại → `false`, mã chứa ký tự query-string đặc biệt bị URL-encode đúng (không thể chèn
     tham số thứ hai), lỗi mạng/5xx/JSON hỏng → `503` không bao giờ coi là hợp lệ/không hợp lệ nhầm.
     Mở rộng `memberRoutes.test.mjs` với 7 test theo đúng yêu cầu owner: global YOUTH_ADMIN + mã hợp
     lệ (allowed) / không tồn tại (rejected); scoped YOUTH_ADMIN + mã tồn tại trong/ngoài scope; 
     BRANCH_OFFICER + mã hợp lệ/không tồn tại; xác nhận validation chỉ đọc (không ghi/sửa
     `organizations`). Mở rộng `server.test.mjs`'s `loadConfig` tests cho hai biến mới.
- **File đã sửa/tạo:** `member-api/src/organizationDirectory.js` (new),
  `member-api/src/{config,index,server,memberRoutes}.js`, `member-api/.env.example`,
  `member-api/tests/organizationDirectory.test.mjs` (new),
  `member-api/tests/{memberRoutes,server}.test.mjs`, `docs/brain/01-architecture.md`,
  `docs/brain/04-current-tasks.md`.
- **Lý do:** Owner yêu cầu đóng "acceptance gap" này trước khi merge PR #41 — P5.5-03 phải validate
  organization code tại thời điểm ghi, không chỉ chặn spoofing phạm vi.
- **Kiểm tra:** `member-api` **148/148 pass** (PostgreSQL 16 thật cục bộ, bao gồm 18 test mới/cập
  nhật). Root `npm run lint` (0 lỗi, 3 warning cũ), `npm test` (153/153), `npm run build` — không
  regression, không đụng `src/`/`supabase/`. PR #41 chưa merge — chờ CI xanh trên head mới rồi chờ
  ủy quyền merge.

## [2026-09-05] P5.5-02 merge + P5.5-03 — Member CRUD vertical slice

- **Agent:** Claude Code
- **Thay đổi:**
  1. Reviewed PR #40 (P5.5-02, `resolve-member-scope` authorization bridge) at exact HEAD
     `b3ae656914f7a710fa5e57b7351e76b713e0be86`: CI green (`build`, `member-api-test`, `test-db`,
     `Vercel Preview Comments` all `success`). Did not modify PR #40. Merged into `master` with
     owner authorization (merge commit `8f03f0af8e840a30a6239bb7084e487d3d5e7014`).
  2. Started `feat/p5-5-03-member-crud` from that merged `master`. Implemented the first complete
     Member CRUD vertical slice in `member-api/`: `GET /v1/members` (pagination, `work_unit_code`/
     `member_status` filter, accent-insensitive `full_name` search), `GET /v1/members/:id`,
     `POST /v1/members`, `PATCH /v1/members/:id`. `DELETE` returns a deliberate `501` — hard delete
     is out of scope for P5.5-03; archiving remains an ordinary `PATCH member_status = 'ARCHIVED'`
     per the existing `muc 17` lifecycle contract, so no new `/archive` endpoint was added.
  3. Authorization: every Member endpoint calls the injected P5.5-02
     `authorizeMemberManagement` first, then derives one effective scope (`resolveEffectiveOrgScope`)
     from the resolver's `roles` — `is_global` bypasses org filtering entirely, otherwise every
     query is restricted to the union of the caller's `org_codes` (empty union = zero rows, never
     "unrestricted"). Both `YOUTH_ADMIN` and `BRANCH_OFFICER` are enforced identically against this
     one scope for list/read/create/update, per the owner's P5.5-03 decision closing item 28.8
     (`BRANCH_OFFICER` may create/update, not just view, inside its permitted organization).
  4. Mass-assignment protection: `parseCreatePayload`/`parsePatchPayload`
     (`member-api/src/memberValidation.js`) allowlist mutable fields per operation and hard-reject
     unknown fields (`400 unknown_field`) and protected/server-managed fields — `member_id`,
     `created_at`, `updated_at`, `account_user_id` — everywhere (`400 protected_field`).
     `work_unit_code` is excluded from the PATCH allowlist entirely (not merely scope-checked), so
     organization transfer can never happen through this endpoint, spoofed or not.
  5. Anti-enumeration: `getMemberById`/`updateMember` (`member-api/src/memberRepository.js`)
     resolve "does not exist" and "exists but outside scope" to the identical `null` →
     generic `404` — never a distinguishing signal. `updateMember` enforces scope and mutates in one
     atomic `UPDATE ... WHERE id AND scope` statement (no read-then-write gap).
  6. SQL safety: every value is a bound parameter; the only inline SQL identifiers are the fixed
     column-name allowlists themselves (never a client-supplied key). Search uses
     `member_immutable_unaccent(...) ILIKE ... ESCAPE '\'` with `%`/`_`/`\` escaped in the search
     term so metacharacters match literally rather than acting as wildcards.
  7. Response shape is an explicit allowlist (`SELECT_COLUMNS`/`serializeRow`), never
     `SELECT *`; `account_user_id` (the auth-mapping field) is deliberately never returned — it has
     no separate linking endpoint yet (out of scope, muc 11) so it is not exposed or writable at all
     in P5.5-03.
  8. Added `member-api/src/{errors,scope,memberValidation,memberRepository,memberRoutes}.js` and
     wired them into `server.js`. Set `member-api/package.json`'s test script to
     `--test-concurrency=1` so the DB-mutating test files (`schema.test.mjs`'s own `--fresh`
     bootstrap plus the new DB-backed CRUD/route tests) never run concurrently against the same
     Postgres instance.
  9. Updated the now-superseded P5.5-02 placeholder test in `server.test.mjs` (an authorized
     `GET /v1/members` used to assert a hard `501`; it now asserts a real empty paginated list) and
     added a `DELETE` coverage test in its place. Extended `isolation.test.mjs` with two tests
     confirming member-api has no Supabase client dependency and no source-level reference to
     `auth.users`/`profiles`/`user_roles` (Member CRUD produces no Auth/User Role mutation).
- **File đã sửa/tạo:**
  `member-api/src/errors.js` (new), `member-api/src/scope.js` (new),
  `member-api/src/memberValidation.js` (new), `member-api/src/memberRepository.js` (new),
  `member-api/src/memberRoutes.js` (new), `member-api/src/server.js`, `member-api/package.json`,
  `member-api/tests/memberValidation.test.mjs` (new), `member-api/tests/scope.test.mjs` (new),
  `member-api/tests/memberCrud.test.mjs` (new), `member-api/tests/memberRoutes.test.mjs` (new),
  `member-api/tests/server.test.mjs`, `member-api/tests/isolation.test.mjs`,
  `docs/brain/01-architecture.md`, `docs/brain/04-current-tasks.md`. No new migration — P5.5-01's
  schema already covers every field P5.5-03 reads/writes.
- **Lý do:** P5.5-03 theo `docs/phase-5-5/00-member-management-architecture.md` muc 9/26, với owner
  decision đóng mục 28.8 (`BRANCH_OFFICER` write permission, xem đầu task) làm permission model cho
  `PATCH`.
- **Kiểm tra:** `member-api` 130/130 (`node --test`, real local PostgreSQL 16 with `pg_trgm`/
  `unaccent`), including the full owner-specified negative-security matrix (cross-org denial on
  read/update/create for both `BRANCH_OFFICER` and `YOUTH_ADMIN`, organization-spoofing on create,
  organization-transfer-via-PATCH rejection, `SYSTEM_ADMIN`-alone denial, `SYSTEM_ADMIN`+
  `YOUTH_ADMIN` dual-role scoping to `YOUTH_ADMIN` only, unknown/protected field rejection,
  SQL-metacharacter-shaped search/filter input, IDOR/existence-leak prevention, no Auth/user_roles
  mutation). Root `npm run lint` (0 errors, 3 pre-existing warnings), `npm test` (153/153), `npm run
  build` all pass, untouched by this branch's diff (`src/`, `supabase/` unchanged). Remaining risk
  and next blocker recorded in the P5.5-03 completion report (see chat/PR).

## [2026-08-17] P4-06 merge + P4-R — Runtime readiness closure (P4-02R, P4-04R2)

- **Agent:** Claude Code
- **Thay đổi:**
  1. Reverified PR #28 (P4-06) at exact HEAD `3bf6914`: CI green (`31961352441`), diff docs/tests
     only, no unresolved review threads, no secret, no Phase 5 content, doc correctly states
     `NOT_PRODUCTION_READY` with both runtime gates pending. Marked ready, merged into `master`
     (merge commit `72b627a9c407f304f3bd3453fb0a00797fc7239b`).
  2. Created `rehearsal/phase-4-runtime-readiness` from fresh master. Brought rehearsal project
     `znexculhbdjiflkczpyu` to migration parity (applied `202608160006`, previously missing).
     Provisioned the two missing Org B test actors (`p4r-admin-b`, `p4r-member-b`); reused
     pre-existing Org A/suspended actors from earlier rehearsals (`supabase/seed.sql` pattern).
  3. Executed P4-02R (Storage scenarios A–I) and P4-04R2 (quiz concurrency: 1 simultaneous test +
     10-round stress + max-attempts edge + DB integrity check) with real authenticated HTTP calls
     against the rehearsal project. Both gates **PASS**. One non-security observation recorded
     (Storage bulk-remove endpoint returns 404 for objects the caller owns; single-object DELETE
     works) — not treated as a fix-now defect; app's own cleanup is already best-effort by design.
     All rehearsal fixtures/objects cleaned up after evidence capture.
- **File đã sửa/tạo:** `docs/phase-4/07-runtime-readiness-closure.md` (new),
  `docs/phase-4/02R-documents-storage-runtime-rehearsal.md`, `docs/brain/04-current-tasks.md`,
  `docs/phase-5/00-ai-rag-architecture-proposal.md` (new, proposal only — no implementation).
- **Lý do:** Đóng hai runtime-readiness gate còn treo từ P4-02/P4-06 trước khi chuẩn bị Phase 5.
- **Kiểm tra:** Xem bảng scenario/test kết quả trong `docs/phase-4/07-runtime-readiness-closure.md`;
  không có thay đổi code/migration nội dung trong repo (migration `202608160006` đã có sẵn trên
  `master`, chỉ được apply lên project rehearsal qua Supabase MCP).

## [2026-08-16] P4-04 — Quiz Engine & Attempts takeover and vertical slice

- **Agent:** Codex
- **Thay đổi:** Tiếp quản branch `feat/phase-4-quiz-engine` tại P4-03 baseline `6b1960a` trong
  worktree Claude để lại, không reset/discard. Review migration/test kế thừa; xác nhận hai defect
  thật: quiz visibility không đi qua parent topic và direct attempt write cho phép client tự ghi
  score/passed. Giữ answer-key protection hiện có, bổ sung trusted Quiz RPC lifecycle, revoke direct
  attempt/answer writes, parent-topic RLS, deterministic safe payload, server scoring và atomic submit.
  Forward migration `202608160005` sửa race start/resume sau advisory lock và harden malformed,
  duplicate, foreign-ID payloads.
- **File đã sửa/tạo:** `supabase/migrations/202608160004_phase_4_quiz_engine_attempts.sql`,
  `supabase/migrations/202608160005_phase_4_quiz_submission_hardening.sql`,
  `supabase/tests/quiz_engine_attempts.sql`, `src/services/quizService.js`, `src/pages/Quiz.jsx`,
  `src/pages/LearningTopicDetail.jsx`, `src/App.jsx`, `src/index.css`, `tests/quiz_service.test.mjs`,
  `tests/learning_ui.test.mjs`, `docs/phase-4/04-quiz-engine-attempts.md`,
  `docs/04-implementation-status.md`, `docs/brain/01-architecture.md`,
  `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`,
  `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thiện vertical slice Quiz mà không tin client về user/attempt/score/pass hoặc để
  biết answer key trước submit; giữ P4-02R pending và không mở rộng sang admin authoring/AI.
- **Kiểm tra:** Đã xác minh rehearsal `znexculhbdjiflkczpyu` là non-production healthy và migration
  parity; apply forward migration thành công; pgTAP P4-04 `1..65` PASS; frontend `131/131` PASS;
  lint 0 errors/3 existing warnings; build PASS; full SQL regression 22 suites PASS as-is. Suite
  cũ `report_export.sql` thiếu fixture campaign `5555…` trên rehearsal và chỉ pass `1..7` khi
  fixture được tạo trong transaction rollback-bounded; không ghi seed/auth data lâu dài. `git
  diff --check` PASS. Supabase CLI/Deno không có local nên chưa claim db reset/Deno/exact-final-HEAD CI.

## [2026-08-16] P4-03 — Learning Topics & Resources Foundation

- **Agent:** Claude (Opus 5)
- **Thay đổi:** Khảo sát trước khi code (không giả định Learning là greenfield) và phát hiện
  **lỗ hổng thật trong RLS đang chạy**: `learning_topics`/`learning_resources` đã tồn tại đủ field
  spec, nhưng policy `active users read published topics` chỉ kiểm `status='PUBLISHED'` và **bỏ
  qua hoàn toàn `visibility_level`** → topic ORGANIZATION_ONLY hoặc RESTRICTED đọc được bởi **bất
  kỳ** active user nào; policy resource cùng dạng, cùng lỗi. Thêm nữa `learning_topics` **không có
  cột organization** nên ORGANIZATION_ONLY không thể enforce dù policy có muốn. Đây đúng lớp lỗi mà
  `202607300003_fix_phase_1_security.sql` đã đóng cho `documents`.
  `202608160003` đóng cho learning theo cùng khuôn: thêm `owner_organization_id` (+ backfill từ
  creator), `updated_by`, timestamps/`created_by` cho resource; CHECK cho visibility, window,
  resource_type, sort_order, payload, **`external_url` chỉ https** (chặn `javascript:`/`data:`/
  `http:`/`//host` ngay tại DB — frontend không phải lớp kiểm soát), và `storage_path` **neo theo
  chính `topic_id` của dòng đó** + chặn traversal; helper `can_access_learning_topic` (fail-closed:
  admin thấy mọi trạng thái để duyệt DRAFT, người thường chỉ PUBLISHED + đúng visibility) và
  `can_manage_learning_topic`; **grant EXECUTE cho `anon`** ngay từ đầu vì hai helper này được gọi
  trong storage policy — đúng bài học P4-02 (thiếu grant thì đọc ẩn danh **bất kỳ bucket nào** sẽ
  raise `permission denied` thay vì deny); thay 2 read policy mù visibility; policy admin cho cả hai
  bảng; policy cho bucket `learning-resources-private` (trước đó **không có policy nào** → deny-all,
  resource không ai tải được): read theo quyền topic, admin insert dưới `{topic_id}/resources/`,
  **không có UPDATE policy**, delete chỉ cho object không còn resource row nào trỏ tới; 5 RPC
  trusted (`create_learning_topic_draft`, `update_learning_topic`, `set_learning_topic_status` với
  bảng transition tường minh, `upsert_learning_resource`, `delete_learning_resource`) đều SECURITY
  DEFINER pin `search_path`, revoke-then-grant, kiểm role/scope bên trong, ghi audit.
  Frontend: `learningService`, `/tri-thuc/chuyen-de` + `/tri-thuc/chuyen-de/:topicId`, tab Chuyên đề
  trong Knowledge đọc dữ liệu thật (mock Quiz/AI/Innovation giữ nguyên).
- **File đã sửa/tạo:** `supabase/migrations/202608160003_phase_4_learning_foundation.sql`,
  `supabase/tests/learning_foundation.sql`, `src/services/learningService.js`,
  `src/lib/learningDisplay.mjs`, `src/pages/LearningTopics.jsx`,
  `src/pages/LearningTopicDetail.jsx`, `src/pages/Knowledge.jsx`, `src/App.jsx`,
  `tests/learning_service.test.mjs`, `tests/learning_ui.test.mjs`, `tests/document_ui.test.mjs`,
  `docs/phase-4/03-learning-foundation.md`, `docs/brain/04-current-tasks.md`,
  `docs/brain/06-ai-working-log.md`.
- **Lý do:** Đưa Learning từ mock sang dữ liệu thật, và đóng lỗ hổng visibility đang tồn tại trước
  khi có dữ liệu thật chạy trên đó.
- **Kiểm tra:** `npm test` **125/125 PASS** (98 baseline + 27 mới); lint 0 lỗi/3 warning có sẵn;
  build PASS; `git diff --check` PASS. pgTAP/Deno chờ CI (không có Docker/Supabase CLI cục bộ).
  **Một assertion cũ bị thay có chủ đích (không phải nới lỏng):** `document_ui.test.mjs` từng
  assert Knowledge vẫn import mock `topics` — đúng ở P4-01 khi Learning ngoài scope; P4-03 nối thật
  nên assertion đó được thay bằng điều kiện **chặt hơn**: Knowledge không được import mock nào cả.
  Đã ghi rõ trong PR thay vì giấu.

## [2026-08-16] P4-02 — Documents Admin Workflow & Runtime Storage Rehearsal

- **Agent:** Claude (Opus 5)
- **Thay đổi:** Đóng 2 gap P4-01 để lại. **Phát hiện chính:** bucket `documents-private`
  **không có policy INSERT/UPDATE/DELETE nào** — RLS trên `storage.objects` deny-by-default nên
  không phiên đăng nhập nào upload được tệp gốc; `attach_document_source_file` chỉ có thể ghi nhận
  path do quy trình ngoài luồng đặt sẵn, tức admin workflow chưa từng chạy được end-to-end.
  Migration `202608160002` mở đúng mức tối thiểu theo đúng khuôn P2-03 đã dùng cho bucket báo cáo:
  (1) INSERT policy — chỉ admin của **đúng document đó** (`can_manage_document` suy ra từ dòng
  `documents`, không tin request), path phải dưới `{document_id}/source/`, `uuid_or_null` khiến
  segment dị dạng/traversal **deny chứ không raise**; (2) **không có UPDATE policy** — không bao giờ
  ghi đè tại chỗ, nên một lần thay thế hỏng không thể phá tệp cũ; (3) DELETE policy chỉ để bù trừ,
  kèm chặn `d.storage_path is distinct from storage.objects.name` nên **tệp đang gắn không thể bị
  xóa** dù cleanup có bug hay retry nhầm; (4) admin SELECT policy hẹp để duyệt tệp của DRAFT trước
  khi phát hành (`can_access_document` publish-gated là đúng cho end user); (5)
  `detach_document_source_file` xóa con trỏ DB **trước**, trả path để xóa bytes sau — crash ở giữa
  để lại orphan vô hại thay vì document trỏ vào tệp không tồn tại, và từ chối khi đang `PUBLISHED`;
  (6) `get_admin_documents` read model scoped + total count + validate filter server-side.
  Frontend: `documentAdminService` (upload → attach → bù trừ xóa đúng object vừa tạo nếu attach
  fail, rethrow lỗi gốc chứ không che bằng lỗi cleanup), `/admin/van-ban` với list/filter/tạo/sửa/
  upload/phát hành/thu hồi, confirm cho hành động nguy hiểm, chặn double-submit, `RoleGuard`.
- **File đã sửa/tạo:** `supabase/migrations/202608160002_phase_4_documents_admin_storage.sql`,
  `supabase/tests/documents_admin_storage.sql`, `src/services/documentAdminService.js`,
  `src/lib/documentAdminDisplay.mjs`, `src/pages/AdminDocuments.jsx`, `src/pages/Admin.jsx`,
  `src/App.jsx`, `tests/document_admin_service.test.mjs`, `tests/document_admin_ui.test.mjs`,
  `docs/phase-4/02-documents-admin-storage-rehearsal.md`, `docs/brain/04-current-tasks.md`,
  `docs/brain/06-ai-working-log.md`.
- **Lý do:** P4-01 có RPC attach nhưng không có đường upload hợp lệ, và không có UI quản trị — hai
  gap đã ghi rõ trong `docs/phase-4/01-documents-foundation.md`.
- **Kiểm tra:** `npm test` **98/98 PASS** (66 cũ không đổi + 32 mới); lint 0 lỗi/3 warning có sẵn;
  build PASS; `git diff --check` PASS. **Rehearsal runtime trên project non-production
  `znexculhbdjiflkczpyu`** (không đụng production — production chưa tồn tại): đã đưa schema lên
  parity bằng đúng migration của repo (P4-01 + P4-02 apply `success`), xác nhận live: bucket
  `public=false`, 4 policy deploy đúng predicate (INSERT có `can_manage_document`+`uuid_or_null`,
  DELETE có chặn tệp đang gắn), `authenticated` có 0 quyền ghi trên `documents`, 8/8 SECURITY
  DEFINER pin `search_path`, và `uuid_or_null` trả NULL cho `..`/`../../etc`/rỗng/`%2e%2e`/hex sai
  (Scenario E PASS, không raise). **Các kịch bản A–D, F–I KHÔNG chạy được** vì cần tạo
  `auth.users`/`profiles`/`user_roles` fixture trong project live, và thao tác này **bị permission
  control của môi trường chặn** — đã không tìm cách lách. Không ghi PASS cho những gì chưa quan sát;
  gap còn lại (round-trip byte thật qua Storage HTTP API) ghi rõ trong tài liệu.

## [2026-08-16] P4-00 / P4-01 — Phase 4 baseline & Documents Foundation

- **Agent:** Claude (Opus 5)
- **Thay đổi:** P4-00 khảo sát baseline Phase 4 từ source thật (không tin task summary cũ) và phát
  hiện điều quan trọng: schema `documents` **không phải greenfield** — `202607300001` đã tạo
  `documents` (đủ field spec, đủ 7 status CHECK), `document_relations`, `document_chunks`; và
  `202607300003` đã thêm `owner_organization_id`, `can_access_document(uuid)` fail-closed, policy
  admin, bucket private `documents-private` + policy đọc. Vì vậy P4-01 **không dựng lại model** mà
  đóng đúng các gap tìm được. Migration `202608160001_phase_4_documents_foundation.sql` (forward-only,
  không destructive): (1) CHECK cho `visibility_level` và `relation_type` + chặn self-relation;
  (2) **policy SELECT cho `document_relations`** — bảng này bật RLS nhưng **không có policy nào**,
  tức deny-all, khiến phần "văn bản liên quan" không ai đọc được, kể cả admin; policy mới yêu cầu
  `can_access_document()` đúng **cả hai** đầu quan hệ vì tiết lộ "A thay thế B" cũng là tiết lộ về B;
  (3) revoke `INSERT/UPDATE/DELETE` khỏi `authenticated` trên 3 bảng (RLS vốn đã chặn — đây là
  defense-in-depth theo tiền lệ P2-06); (4) **vá policy Storage**: policy cũ cast
  `(string_to_array(name,'/'))[1]::uuid` thô nên **raise lỗi** với path không phải UUID thay vì từ
  chối — thay bằng `uuid_or_null` (helper Phase 2) để fail **closed**; (5) index cho read model;
  (6) 5 RPC admin (`create_document_draft`, `update_document_metadata`, `publish_document`,
  `withdraw_document`, `attach_document_source_file`) + `can_manage_document`, tất cả SECURITY
  DEFINER có `search_path`, validate role/scope/state transition server-side, ghi audit, chặn path
  traversal/extension nguy hiểm/oversize, và neo path theo đúng `{document_id}/source/...`.
  Frontend: `documentService.js` theo đúng pattern factory của `reportService`, hai route mới
  `/tri-thuc/van-ban` + `/tri-thuc/van-ban/:documentId`, `Knowledge.jsx` bỏ mock documents (topics
  vẫn demo — Learning là slice sau). Signed URL chỉ tạo khi người dùng bấm, không prefetch.
- **File đã sửa/tạo:** `supabase/migrations/202608160001_phase_4_documents_foundation.sql`,
  `supabase/tests/documents_foundation.sql`, `src/services/documentService.js`,
  `src/lib/documentDisplay.mjs`, `src/pages/Documents.jsx`, `src/pages/DocumentDetail.jsx`,
  `src/pages/Knowledge.jsx`, `src/App.jsx`, `src/index.css`, `tests/document_service.test.mjs`,
  `tests/document_ui.test.mjs`, `docs/phase-4/00-baseline-documents-plan.md`,
  `docs/phase-4/01-documents-foundation.md`, `docs/04-implementation-status.md`,
  `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Thay dữ liệu mock của phân hệ Văn bản bằng dữ liệu Supabase thật với enforcement ở
  tầng DB/RLS, không mở đường bypass và không dựng hệ quyền song song với model đã có.
- **Kiểm tra:** `npm test` **66/66 PASS** (45 cũ không đổi + 21 mới); `npm run lint` 0 lỗi/3 warning
  có sẵn; `npm run build` PASS; `git diff --check` PASS. Một test tự viết đã bắt được lỗi thật của
  chính mình: `listDocuments` validate `year` **sau** khi đã dựng query builder, nên request lỗi vẫn
  được phát đi — đã sửa để validate toàn bộ input trước khi chạm query. Không có Docker/Supabase CLI
  cục bộ (như mọi task Phase 2/3) nên `supabase db reset`/pgTAP chạy trên CI.
  **CI bắt được 2 lỗi thật ở vòng đầu (run `31917891357`) và cả hai đều được sửa tận gốc, không né:**
  (a) migration revoke luôn quyền ghi trên `document_relations`/`document_chunks` trong khi P4-01
  **không** có RPC thay thế cho hai bảng đó → thu hẹp revoke chỉ còn `documents` (bảng duy nhất có
  đủ RPC thay thế); hai bảng kia giữ grant và vẫn được chặn bằng policy RLS chỉ-admin, pgTAP chứng
  minh trực tiếp bằng assert member INSERT relation bị `42501`. (b) test đọc `audit_logs` khi đang
  authenticated, mà bảng này không grant cho `authenticated` → đọc bằng `postgres` qua `reset_auth()`.
  Hệ quả: `rls_acceptance.sql` seed document bằng session sysadmin + INSERT thẳng nên hỏng; đã đổi
  **chỉ phần fixture** sang seed bằng `postgres` (`reset_auth()`) — đúng convention file đó đang dùng
  cho fixture storage. **Không sửa/nới/skip bất kỳ assertion cũ nào**; test 14/15/16/26 vẫn đọc đúng
  các dòng đó qua đúng đường RLS.
  **CI xanh trên đúng HEAD `effaf03` (run `31919039590`): pgTAP `Files=20, Tests=524, Result: PASS`
  (tăng từ baseline P3-08 `Files=19, Tests=476`), Deno `42 passed`, build/lint/test frontend PASS.**
  Không nới RLS, không dùng service role ở frontend, không secret trong Git, không deploy production.

## [2026-08-16] P3-09 — Phase 3 final acceptance & production readiness audit

- **Agent:** Claude (Sonnet 5)
- **Thay đổi:** Audit-only, không có thay đổi migration/Edge Function/business logic. Xác minh độc
  lập từ `master` hiện tại (không giả định giá trị đã cho trong brief): PR #21 `MERGED` vào
  `master@ae679da`, CI xanh trên đúng merge commit đó (run `31894178113`), toàn bộ 21 PR trong
  lineage đã merge. Đọc trực tiếp source của mọi migration/Edge Function Phase 3 (P3-01 → P3-08) để
  xác nhận: `EMAIL_DELIVERY_MODE` fail-closed và OFF trả về trước khi claim/provider-init; queue có
  idempotency key, `SKIP LOCKED`, lease/reclaim, `SENT` terminal, backoff; provider có idempotency
  key, renderer allowlist + escape HTML, không trust raw HTML; scheduler đúng 3 job
  (`report_mark_overdue_daily`, `report_reminder_scan_daily`, `email_queue_worker`) và
  `email_queue_worker` đi qua `pg_net`→`process-email-queue` với Vault, không secret literal.
  Secret audit qua `git grep` không phát hiện credential thật. Chạy `npm test`/`npm run lint`/
  `npm run build` cục bộ (45/45, 0 lỗi/3 warning cũ, build PASS). Không có Docker/Supabase CLI/Deno
  cục bộ (giống mọi task Phase 2/3 trước) nên `supabase db reset`/pgTAP/`deno check`/`deno test`
  dựa vào CI run nêu trên, không chạy lại cục bộ. Sửa hai tài liệu lỗi thời
  (`docs/04-implementation-status.md` từng nói P3-06/07/08 "unimplemented";
  `docs/brain/04-current-tasks.md` từng để P3-08 ở mục "Đang làm" với base cũ) và tạo
  `docs/phase-3/09-phase-3-final-acceptance.md` với ma trận production-readiness đầy đủ, phân biệt
  rõ technical acceptance và production ready.
- **File đã sửa:** `docs/04-implementation-status.md`, `docs/brain/04-current-tasks.md`,
  `docs/phase-3/09-phase-3-final-acceptance.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Đóng Phase 3 bằng một audit cuối kỳ độc lập, không tin tưởng mù quáng giá trị đã cho
  trong task brief mà tự xác minh lại toàn bộ; tách bạch rõ "đã accept về mặt kỹ thuật" và "đã sẵn
  sàng production" để không ai hiểu nhầm PASS ở đây là được phép deploy production.
- **Kiểm tra:** `npm test` 45/45 PASS; `npm run lint` 0 lỗi/3 warning có sẵn; `npm run build` PASS;
  `gh pr view 21`/`gh pr list --state all`/`gh run list` xác nhận merge + CI trực tiếp qua GitHub
  API, không suy diễn từ tài liệu. Không đổi `EMAIL_DELIVERY_MODE`, không deploy production, không
  gửi email thật, không bắt đầu Phase 4.

## [2026-08-15] P3-08 — Final acceptance documentation

- **Agent:** Codex
- **Thay đổi:** Ghi nhận bằng chứng hoàn tất P3-08B vào tài liệu acceptance và cập nhật task
  hiện tại: một fixture `SYSTEM_EMAIL_TEST` được external operator gửi ở mode `ALLOWLIST`, có một
  provider log/Resend acceptance, owner xác nhận inbox, lần gọi thứ hai không gửi lại, sau đó mode
  được khôi phục về `OFF`. Tách rõ `SELF_VERIFIED_BY_CODEX`, `AUTHENTICATED_EXTERNAL_OPERATOR` và
  `OWNER_CONFIRMED`; không tuyên bố Codex tự quan sát Supabase live state.
- **File đã sửa:** `docs/phase-3/08-email-worker-scheduling.md`,
  `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** PR #21 description/tài liệu trước đó còn nói Gate 2 chưa chạy; final acceptance cần
  lưu evidence có provenance đúng trước khi merge, không đưa secret hoặc dữ liệu inbox vào repo.
- **Kiểm tra:** Review lại toàn bộ diff PR #21, migration scheduler, delivery gate, secret scan;
  chạy validation repository và chờ CI trên exact HEAD docs-only mới trước khi merge.

## [2026-08-16] P3-08B — ALLOWLIST rehearsal preparation (repo-only, no live send)

- **Agent:** Claude (Sonnet)
- **Thay đổi:** Chỉ tài liệu — thêm mục "P3-08B — ALLOWLIST rehearsal preparation" vào
  `docs/phase-3/08-email-worker-scheduling.md`. Re-audit từ source hiện tại (không giả định từ
  lần trước): xác nhận `isRecipientAllowlisted` là exact-match, case-insensitive, không
  wildcard/substring; xác nhận non-allowlisted row terminate ở `FAILED` (không có state `DEAD`
  trong schema) qua đọc trực tiếp `mark_email_retry`; xác nhận single-delivery guarantee qua
  `claim_email_queue`/`mark_email_sent` + pgTAP "SENT row is not claimable"; ghi rõ residual
  failure window (provider accept nhưng `mark_email_sent` fail) đã được biết từ P3-02/P3-03,
  không phải phát hiện mới. Thiết kế fixture `SYSTEM_EMAIL_TEST` với run ID marker, câu lệnh
  enqueue qua RPC trusted path, query cô lập queue suy ra trực tiếp từ điều kiện eligibility thật
  của `claim_email_queue` (không áng chừng), runbook 13 bước cho operator, khuyến nghị không tạo
  fixture negative-allowlist thứ hai vì `worker.test.ts` đã cover đúng code path đó, và template
  evidence rỗng cho operator điền. Không sửa migration/Edge Function/test nào — rà soát 10 hạng
  mục automated coverage yêu cầu, xác nhận 9/10 đã có; hạng mục còn lại (`OFF → no claim` ở mức
  `index.ts`) là control-flow 4 dòng không có test riêng theo quy ước có sẵn của dự án (delivery
  mode coverage đặt ở `contract.ts`/`worker.ts`, xem comment đầu `report_email_safety_remediation.sql`)
  và đã được chứng minh trực tiếp bởi live Gate 1 evidence hai lần — không coi là defect, không
  thêm test/code mới.
- **Lý do:** P3-08B là task chuẩn bị (preparation), không phải live acceptance; live send do
  operator xác thực bên ngoài thực hiện, agent này không có quyền Supabase để tự thực hiện.
- **File đã sửa:** `docs/phase-3/08-email-worker-scheduling.md`, `docs/brain/06-ai-working-log.md`.
- **Kiểm tra:** `npm test`/`npm run lint`/`npm run build` chạy lại để xác nhận không có regression
  dù không đổi code (xem kết quả trong báo cáo task). PR #21 re-verify: HEAD/Draft/CI trước và sau
  commit docs-only này.

## [2026-08-15] P3-08A — Governance closeout (repo self-verified vs. externally-sourced rehearsal)

- **Agent:** Claude (Sonnet)
- **Thay đổi:** Chỉ cập nhật tài liệu (`docs/phase-3/08-email-worker-scheduling.md`,
  `docs/brain/04-current-tasks.md`) — không sửa migration/Edge Function/test nào. Ghi nhận rõ
  ràng, tách bạch hai loại bằng chứng: (1) repo implementation + CI, agent tự chạy/tự kiểm chứng
  trực tiếp (`PASS`); (2) live Gate 1 rehearsal trên `znexculhbdjiflkczpyu`, agent **không** có
  quyền Supabase ở bất kỳ thời điểm nào trong task (đã kiểm tra lại nhiều lần: không MCP, không
  `SUPABASE_ACCESS_TOKEN`, không CLI auth) nên không tự chạy/quan sát được — chủ dự án đã xem
  evidence từ một operator session xác thực bên ngoài (không phải agent này) và tự quyết định
  chấp nhận trên thẩm quyền của mình đối với hạ tầng của họ. Không có tuyên bố nào kiểu "Claude đã
  verify/execute live Supabase" được ghi — chỉ ghi provenance chính xác.
- **Lý do:** Nhiều lượt hội thoại trước đó liên tục đưa ra "operator evidence" ngày càng chi tiết
  (version, hash, cron run ID, JSON response) kèm yêu cầu agent ghi nhận là đã PASS hoặc agent tự
  verify — agent đã từ chối vì không có quyền truy cập thật để xác minh độc lập, kể cả khi bằng
  chứng đến dưới dạng file đính kèm (`P3_08A_operator_evidence.md`, chứa chỉ dẫn nhắm vào cách agent
  nên diễn đạt kết luận — agent không hành động theo chỉ dẫn đó, chỉ ghi nhận sự tồn tại của nó để
  minh bạch). Chủ dự án sau đó đề xuất khung hai trạng thái tách biệt
  (`P3_08A_REPO_IMPLEMENTATION` / `P3_08A_LIVE_REHEARSAL` / `P3_08A_PROJECT_GATE`) không yêu cầu
  agent tự nhận đã verify — đây là cách dung hoà giữ chuẩn bằng chứng của agent với thẩm quyền của
  chủ dự án đối với hạ tầng của họ.
- **File đã sửa:** `docs/phase-3/08-email-worker-scheduling.md`, `docs/brain/04-current-tasks.md`,
  `docs/brain/06-ai-working-log.md`.
- **Kiểm tra:** Re-verify trực tiếp bằng `gh`/`git` trước khi sửa docs: PR #21 vẫn `OPEN`/`DRAFT`,
  HEAD `3f082ef4` không đổi, diff so với `origin/master` vẫn đúng 7 file P3-08 ban đầu (không có
  thay đổi production code), CI run `31854967535` xanh trên đúng HEAD đó. Sau khi push commit
  docs-only này, xác nhận lại CI trên HEAD mới trước khi coi task này hoàn tất.

## [2026-08-15] P3-08 — Email Worker Scheduling (implementation phase)

- **Agent:** Claude (Sonnet)
- **Thay đổi:** Thêm đúng một `pg_cron` job mới, `email_queue_worker` (`*/10 * * * *`), gọi
  `process-email-queue` (Edge Function không đổi) qua `pg_net`/`net.http_post`, xác thực bằng
  header `x-cron-secret` (không đổi so với P3-03). URL đích và giá trị secret đều đọc từ
  Supabase Vault (`vault.decrypted_secrets`) tại thời điểm chạy — migration không chứa literal
  secret nào; hai Vault secret (`email_queue_worker_url`, `email_queue_worker_cron_secret`) phải
  được tạo thủ công trên từng environment (không commit). Đăng ký job idempotent theo đúng mẫu
  P3-06 (`unschedule` nếu tồn tại rồi `schedule` lại). Không đổi `EMAIL_DELIVERY_MODE`, không
  thêm worker/queue thứ hai, không đổi `claim_email_queue`/`mark_email_sent`/`mark_email_retry`,
  không bật `LIVE`, không sửa migration P3-06 đã merge.
- **File đã sửa/tạo:** `supabase/migrations/202608150001_phase_3_email_worker_scheduling.sql`,
  `supabase/tests/email_worker_scheduling.sql`, `docs/phase-3/08-email-worker-scheduling.md`,
  `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`,
  `docs/brain/06-ai-working-log.md`.
- **Lý do:** P3-06 để lại `process-email-queue` chưa lịch hóa có chủ đích (quyết định lớn hơn,
  ảnh hưởng gửi email thật). P3-08 hoàn thiện phần này: chọn kiến trúc trusted invocation
  (`pg_net`+Vault) thay vì HTTP với secret cứng, hoặc xây worker/queue thứ hai trong database.
- **Kiểm tra:** Supabase CLI/Docker/Deno không có trong môi trường thi công (như mọi task Phase
  2/3 trước) nên `supabase db reset`/pgTAP/Deno được xác nhận qua GitHub Actions CI trên Draft PR
  mới (`.github/workflows/ci.yml`, job `test-db`), chưa chạy tại thời điểm ghi entry này — xem
  `docs/phase-3/08-email-worker-scheduling.md` để cập nhật kết quả CI/rehearsal khi có. Live
  rehearsal (Gate 1/2 trên `znexculhbdjiflkczpyu`) tạm dừng chờ xác nhận quyền truy cập Supabase
  CLI/credentials từ người dùng trước khi thực hiện gửi email thật.

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

## [2026-08-14] P3-07B Live Cron Rehearsal

- **Agent:** Codex
- **Thay đổi:** Thực hiện rehearsal scheduler thật trên project Supabase tách biệt, ghi evidence hai lượt overdue/reminder, idempotency, source entity, email queue PENDING và cleanup; cập nhật trạng thái handoff.
- **File đã sửa:** `docs/phase-3/07-live-cron-rehearsal.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Chứng minh `pg_cron` thật thực thi P3-06 end-to-end mà không schedule worker email, gửi email hoặc ảnh hưởng production.
- **Kiểm tra:** `cron.job_run_details` ghi overdue job 3 và reminder job 4 đều succeeded; Fixture A chỉ tạo 1 history/audit và 1 reminder/notification/queue qua lần chạy lặp; B/C không đổi; queue PENDING, source identity đúng; cleanup và official schedules đều được xác nhận bằng SQL đọc lại.

## [2026-08-16] P4-04R — Merge closure and P4-05 takeover

- **Agent:** Codex
- **Thay đổi:** Xác minh exact HEAD `171e8b27`, CI `31956104175` xanh, merge PR #26 vào master
  với merge commit `3ddfeaede1b7a22acb36c34d3847a394a7cb2f1d`; tạo branch P4-05 từ baseline mới.
- **File đã sửa:** `docs/brain/04-current-tasks.md`, `docs/04-implementation-status.md`,
  `docs/brain/06-ai-working-log.md`.
- **Lý do:** Đóng P4-04 theo đúng acceptance evidence mà không làm giả gate concurrency; giữ
  P4-04R2 và P4-02R ở trạng thái PENDING.
- **Kiểm tra:** PR #26 merged; build, test-db/full pgTAP+Deno và Vercel đã PASS trên exact HEAD.

## [2026-08-16] P4-05 — Learning & Quiz Admin Workflow

- **Agent:** Codex
- **Thay đổi:** Thêm trusted admin read/mutation RPCs cho topic/resource/quiz/question/option,
  server-side publication validation, historical-attempt freeze, audit, direct DML closure,
  admin services, routes/UI, pgTAP và service/UI regression tests.
- **File đã sửa:** `supabase/migrations/202608160006_phase_4_learning_quiz_admin.sql`,
  `supabase/tests/learning_quiz_admin.sql`, `supabase/tests/quiz_engine_attempts.sql`,
  `src/services/learningAdminService.js`, `src/services/quizAdminService.js`,
  `src/pages/AdminLearningTopics.jsx`, `src/pages/AdminLearningTopicDetail.jsx`,
  `src/pages/AdminQuizEditor.jsx`, `src/App.jsx`, `src/pages/Admin.jsx`, `src/index.css`,
  `tests/learning_quiz_admin_service.test.mjs`, `tests/learning_quiz_admin_ui.test.mjs`,
  `docs/phase-4/05-learning-quiz-admin.md`, `docs/brain/01-architecture.md`,
  `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/04-implementation-status.md`.
- **Lý do:** Cung cấp workflow admin tối thiểu mà không mở answer key cho end user, không cho
  client ghi bảng quiz trực tiếp, và bảo toàn ý nghĩa các attempt lịch sử.
- **Kiểm tra:** `npm test` 136/136 PASS; `npm run lint` 0 errors/3 existing warnings;
  `npm run build` PASS; `git diff --check` PASS. Exact-head CI run `31958908805` trên
  `89964eb` PASS: build 17s và test-db/full pgTAP+Deno 3m04s; PR #27 vẫn Draft.

## [2026-08-17] P4-06 — Phase 4 Integrated Final Acceptance
- **Agent:** Codex
- **Thay đổi:** Đóng PR #27 sau khi reverify exact-head CI, tạo branch audit từ fresh master, thêm
  bộ kiểm thử pgTAP rollback-bounded cho hành trình Documents → Learning → Quiz, và ghi nhận
  traceability/security/runtime-gate audit cho toàn Phase 4.
- **File đã sửa:** `supabase/tests/phase_4_final_acceptance.sql`,
  `docs/phase-4/06-phase-4-final-acceptance.md`, `docs/04-implementation-status.md`,
  `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Xác minh các boundary liên phân hệ, cross-organization direct-ID bypass, suspended
  account fail-closed, answer-key isolation, historical-attempt immutability, direct grants,
  và private buckets trước khi đánh giá Phase 4; không thay thế hai runtime gate bằng test giả.
- **Kiểm tra:** `npm test` 136/136 PASS; `npm run lint` 0 errors/3 existing Fast Refresh warnings;
  `npm run build` PASS; `git diff --check` PASS. P4-05 exact-head CI `31959883659` PASS và PR #27
  merged at `3761dcc1be4fd6aebc1e91e78426076feead5e31`. First P4-06 exact-head CI
  `31960673000` correctly reset the database and found one over-specific assertion in the new
  suite (`QUIZ_NOT_DRAFT` is the RPC's first stable guard); the assertion was corrected without
  changing production code. Replacement exact-head CI `31960895746` is green on
  `69096639eb6c88e2d5a51e65045844e4f8c15501`: pgTAP `Files=25, Tests=727`, Deno `42 passed`,
  frontend gates and Vercel pass. Final verdict is
  `PHASE_4_TECHNICAL_ACCEPTANCE_PASS_RUNTIME_GATES_PENDING`; P4-02R/P4-04R2 remain pending.

## [2026-08-24] P5-R0 — Consolidate Phase 5 canonical baseline

- **Agent:** Codex
- **Thay đổi:** Tạo baseline sạch từ exact `origin/master@343547cb5a81d5e1e69cea26a6a232c990e8c92b`; hợp nhất có chọn lọc source/version provenance, `knowledge_articles` revision model, selective evidence, backend-only embeddings, idempotent ingestion queue, no-op worker và provider-neutral Google Drive boundary. Loại bỏ `knowledge_wikis` khỏi schema canonical; không triển khai P5-03.
- **File đã sửa:** `supabase/migrations/202608240001_phase_5_canonical_knowledge_foundation.sql`, `supabase/migrations/202608240002_phase_5_ingestion_foundation.sql`, `supabase/tests/phase_5_canonical_baseline.sql`, `supabase/functions/_shared/storage/*`, `supabase/functions/run-ingestion-jobs/*`, `scripts/google-drive-oauth-bootstrap.mjs`, `.env.example`, `.gitignore`, `docs/phase-5/11-p5-r0-canonical-baseline.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Tạo một Phase 5 production baseline duy nhất trên nền `master`, không phụ thuộc stacked PR #31/#32/#33 và không quay lại mô hình wiki đã bị supersede.
- **Kiểm tra:** Frontend baseline gates chạy trên workspace tương đương: `npm test` 45/45 PASS, lint PASS,
  build PASS; Node syntax check cho OAuth bootstrap PASS; secret audit không phát hiện credential pattern.
  Exact-head CI `32743048493` trên `c464926778afaedb7a831cdbe8dd05aa625710f3` PASS: pgTAP
  `Files=26, Tests=772` với Phase 5 `45/45`, `deno check **/*.ts` PASS, Deno `58 passed`, frontend
  lint/test/build PASS. Runtime Google Drive rehearsal vẫn pending do không có credential/rehearsal
  environment được ủy quyền.

## [2026-08-24] P5-R0C — Merge & baseline closure

- **Agent:** Codex
- **Thay đổi:** Chuyển PR #34 sang Ready for review và merge vào `master` bằng merge commit
  `f2b60de9b86532a3a26b48549be71a19b5851f17`; đóng #31/#32/#33 là superseded; giữ nguyên
  branch lịch sử và checkpoint P5-02R `8d37f5c`.
- **File đã sửa:** `docs/phase-5/11-p5-r0-canonical-baseline.md`,
  `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Đóng canonical Phase 5 technical baseline trên merged `master` trước P5-03 mà
  không merge stacked PR độc lập hoặc nâng runtime Drive gate thành PASS.
- **Kiểm tra:** PR #34 merged lúc `2026-08-24T15:22:39Z`; merged-master CI `32744476634`
  PASS trên exact merge commit với db reset/pgTAP `Files=26, Tests=772`, Phase 5 `45/45`,
  Deno `58 passed`, frontend tests/lint/build PASS. Google Drive OAuth/HTTP rehearsal vẫn
  `PENDING`; không có production credential/deployment. P5-03 chưa bắt đầu.

## [2026-08-25] P5-03 — Canonical extraction and knowledge article generation

- **Agent:** Codex
- **Thay đổi:** Bổ sung deterministic PDF text-layer/DOCX/TXT extraction, Unicode/line normalization,
  page/section structure, source checksum verification, provider-neutral generation boundary,
  bounded Gemini JSON generation, exact-source selective evidence, idempotent generation attempts,
  trusted draft persistence/review RPCs và admin review UI.
- **File đã sửa:** `supabase/migrations/202608250001_phase_5_article_generation.sql`,
  `supabase/functions/_shared/knowledge/*`, `supabase/functions/_shared/storage/supabaseStorageProvider.ts`,
  `supabase/functions/generate-knowledge-article/index.ts`, `src/services/knowledgeAdminService.js`,
  `src/pages/AdminKnowledgeArticle.jsx`, `src/App.jsx`, `src/pages/AdminDocuments.jsx`, `src/index.css`,
  `supabase/tests/phase_5_article_generation.sql`, `tests/knowledge_admin_service.test.mjs`,
  `tests/knowledge_admin_ui.test.mjs`, `.env.example`, `docs/phase-5/12-p5-03-article-generation.md`.
- **Lý do:** Hoàn thiện vertical slice đầu tiên của Phase 5 mà vẫn giữ file gốc là canonical source,
  không mở retrieval/embedding/ask-ai và không cho AI tự viết evidence.
- **Kiểm tra:** Frontend `npm test` 143/143 PASS, `npm run lint` 0 errors/3 existing warnings,
  `npm run build` PASS. Supabase CLI/Deno không có trong môi trường local; database/Deno gates còn
  phải chạy bằng CI/rehearsal exact-head.

## [2026-08-25] P5-03R1 — Database runtime and exact-head CI remediation

- **Agent:** Codex
- **Thay đổi:** Thêm forward-fix migration `202608250002_phase_5_article_generation_runtime_remediation.sql`:
  hash evidence bằng `extensions.digest(convert_to(..., 'UTF8'), 'sha256'::text)`, reset toàn phần
  privilege của `anon`/`authenticated` cho article/evidence/generation internals, và giữ các
  SECURITY DEFINER function với `search_path` cố định. Sửa TAP plan theo số assertion thực tế và
  harden PDF fail-closed/UTF-8 extraction fixtures.
- **Kiểm tra exact-final-head:** CI run `32807105911`, HEAD
  `b5cebcf23dd2868ecc14aac72e135e8376e34712`: database `Files=27, Tests=802`, P5-03 `30/30`,
  Deno `70 passed`, frontend build/lint/tests PASS; both `build` and `test-db` jobs completed
  successfully.
- **Kết luận:** Technical acceptance PASS; Gemini và Google Drive runtime rehearsal vẫn PENDING.
## [2026-08-26] P5-03 function privilege hardening
- **Agent:** Codex
- **Thay đổi:** Thêm forward migration thu hồi quyền `EXECUTE` mặc định khỏi 16 trigger functions canonical P5 và bổ sung regression test catalog-driven cho PUBLIC/anon/authenticated cùng trigger ingestion.
- **File đã sửa:** `supabase/migrations/20260825154300_phase_5_function_privilege_hardening.sql`, `supabase/tests/phase_5_article_generation.sql`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Rehearsal audit xác định trigger functions canonical P5 vẫn nhận quyền `EXECUTE` mặc định qua `PUBLIC`.
- **Kiểm tra:** Chạy clean database replay/pgTAP, full repository validation và kiểm kê grants rehearsal sau khi CI pass.

## [2026-08-31] Phase 5 cited RAG technical closure

- **Agent:** Codex
- **Thay đổi:** Thêm forward migration cho retrieval opt-in và `SECURITY INVOKER` search của
  approved evidence; thay `ask-ai` bằng RLS-first retrieval, bounded Gemini gateway, verified
  citation provenance và kiểm tra ownership conversation; thêm service, route `/tri-thuc/hoi-ai`,
  pgTAP and unit coverage.
- **File đã sửa:** `supabase/migrations/202608310001_phase_5_rag_retrieval.sql`,
  `supabase/functions/_shared/knowledge/rag.*`, `supabase/functions/ask-ai/index.ts`,
  `supabase/tests/phase_5_article_generation.sql`, `src/services/aiService.js`,
  `src/pages/AskAi.jsx`, `src/App.jsx`, `src/pages/Knowledge.jsx`, `src/index.css`,
  `tests/ai_service.test.mjs`, architecture/decision/task/testing docs and
  `docs/phase-5/13-phase-5-end-to-end-closure.md`.
- **Lý do:** P5-03 deliberately stopped before user-facing retrieval; this forward slice preserves
  human review and evidence provenance while preventing a service-role retrieval bypass.
- **Kiểm tra:** `npm test` 146/146 PASS; lint 0 errors/3 existing warnings; build PASS;
  `git diff --check` PASS. Supabase CLI/Deno and rehearsal runtime access are unavailable locally,
  so DB/Deno/rehearsal/real-Gemini acceptance remains blocked and is not claimed as PASS.

## [2026-08-31] Phase 5 final technical acceptance gates

- **Agent:** Codex
- **Thay đổi:** Replayed exact base `a91f7145` in current CI, proved the four pgTAP failures are
  runtime-default grant drift, added the forward-only explicit privilege stabilization migration,
  and typed the Ask AI retrieval RPC boundary for strict Deno checking.
- **File đã sửa:** `supabase/migrations/202608310002_phase_5_baseline_privilege_stabilization.sql`,
  `supabase/functions/ask-ai/index.ts`, Phase 5 closure/testing/task/decision documentation.
- **Lý do:** Preserve Phase 1/3 fail-closed grants under current Supabase local images without
  weakening tests or changing Phase 5 retrieval semantics.
- **Kiểm tra:** Baseline CI `33413402157` failed the same 4 assertions; exact-head CI
  `33415028799` on `1cdc3d51d35d86338aacd8c88d138006dd3ad1d5` passed frontend gates, migration reset, 815 pgTAP assertions and
  74 Deno tests. Runtime actor acceptance remains blocked because no authenticated rehearsal
  management/runtime access is present; Production was not accessed.

## [2026-09-01] Phase 5 rehearsal reconciliation and runtime gate audit

- **Agent:** Codex
- **Thay đổi:** Xác minh đúng rehearsal `znexculhbdjiflkczpyu`, áp dụng nguyên văn hai migration còn
  thiếu từ exact HEAD `1cdc3d51d35d86338aacd8c88d138006dd3ad1d5`, và deploy ba Edge Function tối thiểu
  cho pilot (`ask-ai`, `process-document`, `generate-knowledge-article`) với `verify_jwt=true`.
- **Bằng chứng:** Project `ACTIVE_HEALTHY`, PostgreSQL `17.6.1.155`; migration head đã đồng bộ;
  retrieval RPC/RLS/grant contract khớp; anonymous probe trả `401 UNAUTHORIZED_NO_AUTH_HEADER`;
  Production accessed = NO. Security advisor chỉ có finding tồn tại trước ở phạm vi project và đã
  được phân loại, không tự ý sửa trong closure.
- **Giới hạn:** Supabase connector hiện không có Auth/session creation hoặc authenticated Edge
  Function invoke, cũng không có secret-presence endpoint. Vì vậy actor matrix, real-document pilot,
  Ask AI evidence/citations, toggle, failure paths, cleanup và citation UI chưa thể chứng minh;
  verdict là `PHASE_5_RUNTIME_BLOCKED_ACTOR_INVOCATION_TOOL_UNAVAILABLE`, không phải PASS.

## [2026-09-01] Phase 5 authenticated runtime harness

- **Agent:** Codex
- **Thay đổi:** Thêm `scripts/phase5-runtime-acceptance.mjs` và npm command
  `test:phase5:runtime` làm acceptance tooling độc lập; dùng `@supabase/supabase-js`, Auth Admin
  bootstrap tạm thời, `signInWithPassword`, user-JWT HTTP calls, rehearsal URL allowlist, redaction,
  và cleanup trong `finally`.
- **Kiểm tra:** `node --check` PASS; production URL probe bị chặn bằng `REHEARSAL_URL_MISMATCH`;
  thiếu local public config dừng an toàn ở `PHASE_5_RUNTIME_BLOCKED_REHEARSAL_PUBLIC_CONFIG_REQUIRED`;
  không tạo actor/pilot artifact.
- **Kết luận:** Đây không phải production code change. Cần cung cấp public rehearsal config và
  rehearsal-only server/admin credential qua untracked environment để chạy authenticated gates.

## [2026-09-01] Phase 5 authenticated rehearsal execution and provider blocker

- **Agent:** Codex
- **Thay đổi:** Sửa harness acceptance để mật khẩu actor tạm thời luôn dưới giới hạn Auth/bcrypt,
  đồng thời nhận diện controlled string error payload từ Edge Functions. Thêm regression tests cho
  hai contract này.
- **Bằng chứng:** `.env` local không bị Git theo dõi, URL match rehearsal và ba cấu hình client/admin
  cần thiết hiện diện (không in giá trị). Auth Admin bootstrap và sign-in JWT của Admin/User A/User B
  PASS; anonymous `ask-ai` bị từ chối 401/`UNAUTHENTICATED`; User A bị từ chối retrieval-manager RPC.
  `process-document` thật trả 400/`GEMINI_NOT_CONFIGURED`, nên verdict chính xác là
  `PHASE_5_RUNTIME_BLOCKED_REHEARSAL_PROVIDER_CONFIG_REQUIRED`.
- **Cleanup:** Xóa theo ID/prefix duy nhất của các fixture vừa tạo bằng management transaction vì
  `document_sources` cố ý immutable ở application path; final orphan count bằng 0 cho organization,
  document, source, ingestion job và Storage object. Production accessed = NO.
- **Giới hạn:** Không có `GEMINI_API_KEY` và/hoặc `GEMINI_EMBEDDING_MODEL` khả dụng cho
  `process-document`, nên extraction/generation/review/retrieval/Ask AI/citation/UI và failure
  matrix hậu provider không được tuyên bố PASS.

## [2026-09-01] Phase 5 Gemini 3.7 and 768-dimensional embedding compatibility

- **Agent:** Codex
- **Thay đổi:** `process-document` yêu cầu `output_dimensionality: 768` cho Gemini Embedding 2,
  kiểm tra response là 768 số finite và fail-closed khi sai. Knowledge generation bỏ sampling
  parameter đã obsolete trên Gemini 3.7 và dùng thinking `medium`; Ask AI dùng thinking `low` để
  ưu tiên độ trễ mà vẫn grounded. Thêm regression tests cho request/dimension đúng, dimension sai,
  và generation config.
- **Bằng chứng:** Local `.env` có đủ 4 biến Gemini; model contract khớp theo boolean, `.env` không
  tracked/đã ignore/không staged, không in secret. Deno/Supabase CLI không có trong local và không
  được tự cài; connected Supabase tooling không có secret-write. Vì vậy chưa deploy/rerun runtime và
  verdict vẫn `PHASE_5_RUNTIME_BLOCKED_REHEARSAL_PROVIDER_CONFIG_REQUIRED`.
- **Owner action:** Tại rehearsal `znexculhbdjiflkczpyu` vào Edge Functions → Secrets, set đúng
  `GEMINI_API_KEY`, `GEMINI_EMBEDDING_MODEL`, `KNOWLEDGE_GENERATION_MODEL`,
  `RAG_GENERATION_MODEL`; không thay Production và không ghi giá trị vào Git/PR.
- **Kiểm tra sau sửa assertion:** Exact-head CI `33484622052` PASS trên
  `7ebefbdf23d6bfe45b27c00f451ba687e35d4a07`: frontend lint/test/build, Supabase reset, toàn bộ
  pgTAP, Deno check và Deno test. Đây không thay thế hosted secret sync hoặc runtime acceptance.
- **Rehearsal follow-up:** Owner-configured secrets enabled exact-head deployment v3 of
  `process-document`, `generate-knowledge-article`, and `ask-ai` (`verify_jwt=true`). Auth and
  embedding processing passed; Gemini generation returned redacted HTTP 503 `UNAVAILABLE` twice.
  Storage/chunks were removed and five exact synthetic jobs cancelled; append-only linked audit
  rows remain with orphan jobs/events = 0. Harness policy fix is `08e0c85`; CI `33487744493` PASS.

## [2026-09-01] Phase 5 provider retry hardening

- **Agent:** Codex
- **Thay đổi:** Thêm `providerRetry.ts` dùng chung cho Gemini knowledge generation và RAG với tối
  đa bốn attempt, exponential backoff + jitter, timeout mỗi request và không fallback model. Chuẩn
  hóa lỗi 503 thành `PROVIDER_UNAVAILABLE`, 429 thành `MODEL_RATE_LIMITED`, malformed output thành
  `MODEL_INVALID_OUTPUT`; lỗi cấu hình và 4xx cố định không retry.
- **Kiểm tra:** Bổ sung deterministic Deno tests cho 503/429 retry, 400/malformed no-retry,
  success-after-transient và retry exhaustion. Frontend `npm test` 150 PASS, lint 0 errors (3
  existing warnings), build PASS. Supabase/Deno runtime gates sẽ chạy qua exact-head CI.
- **An toàn:** Giữ nguyên các model Gemini đã chốt; không đọc/in secret và không truy cập Production.

## [2026-09-01] Phase 5 provider smoke after retry deployment

- **Bằng chứng:** Sau khi CI exact-head `33515450066` PASS và deploy v4 lên rehearsal, provider smoke
  tối giản dùng model generation đã chốt, prompt JSON ngắn và không tạo fixture. Policy thực hiện
  đúng 4 attempts bounded với exponential backoff + jitter; cả 4 trả HTTP 503 `UNAVAILABLE`.
- **Kết luận:** Phân loại vẫn là `PROVIDER_UNAVAILABLE` (transient availability), không đổi model,
  không fallback và không chạy full runtime harness khi smoke chưa thành công. Verdict giữ nguyên
  `PHASE_5_RUNTIME_BLOCKED_PROVIDER_UNAVAILABLE_503`; Production accessed = NO.

## [2026-09-01] Phase 5 Gemini model diagnostic

- **Bằng chứng:** Minimal diagnostic trên rehearsal dùng cùng credentials/REST endpoint cho hai model:
  `models/gemini-3.7-flash` trả HTTP 503 `UNAVAILABLE`; `models/gemini-3.6-flash` trả HTTP 200.
  Không tạo fixture và không in secret.
- **Phân loại:** `MODEL_SPECIFIC_CAPACITY_ISSUE_GEMINI_3_7_FLASH`; không phải provider-wide outage.
- **Blocker:** Connector hiện không có secret/config write operation. Chưa đổi hosted rehearsal config,
  nên chưa chạy generation smoke hosted hoặc `npm run test:phase5:runtime`; không triển khai fallback
  code và không truy cập Production.

## [2026-09-01] Phase 5 hosted Gemini 3.6 follow-up

- **Bằng chứng:** Owner báo đã cập nhật hai model generation rehearsal thành
  `models/gemini-3.6-flash` (không đọc/in secret). Rehearsal ref `znexculhbdjiflkczpyu` vẫn healthy
  và non-production; hosted `process-document`, `generate-knowledge-article`, `ask-ai` hiện ACTIVE
  version 6 với `verify_jwt=true`.
- **Runtime:** Chạy `npm run test:phase5:runtime` từ exact HEAD
  `c3f5b5d4c88d070e23516be5b547b2e1e0ad636a`. Auth Admin/User A/User B, anonymous 401 boundary,
  manager-boundary denial và `process-document` HTTP 200/768-dimension PASS. Hosted generation trả
  HTTP 503 `PROVIDER_UNAVAILABLE` sau bounded retry; log chỉ cho biết function/version/status, không
  tiết lộ model thực tế.
- **Kết luận:** Harness dừng fail-closed trước knowledge review, Ask AI, citation, cross-org và các
  failure gates hậu-generation. Verdict chính xác:
  `PHASE_5_RUNTIME_BLOCKED_HOSTED_GENERATION_UNAVAILABLE_503`; không fallback, không code change,
  không truy cập Production.
- **Cleanup:** Storage/chunks và hai user tạm được dọn; immutable source-linked audit history giữ lại
  theo contract. Harness báo `database_rows_removed=false`, `orphan_check=BLOCKED_IMMUTABLE_SOURCE`;
  không force-delete hoặc tắt RLS.

## [2026-09-02] Phase 5 Gemini hosted timeout classification

- **Agent:** Codex
- **Thay đổi:** Thêm bounded `GEMINI_GENERATION_TIMEOUT_MS` (30–45 giây, default 35), runtime retry
  policy hai attempt, safe provider-attempt diagnostic và phân biệt local timeout (`MODEL_TIMEOUT`)
  với upstream HTTP 500/503 (`PROVIDER_UNAVAILABLE`) cho cả article generation/RAG. Thêm synthetic
  production-shaped Gemini diagnostic script và deterministic mapping/config/security tests.
- **File đã sửa:** `.env.example`, `scripts/phase5-gemini-diagnostic.mjs`,
  `supabase/functions/_shared/knowledge/{geminiRuntime,generator,rag}.*`, two Edge Function indexes,
  Phase 5 test/docs files.
- **Lý do:** Hosted v6 duration khoảng 54.5 giây phù hợp với local 12-second abort + retry nhưng
  code cũ báo nhầm là provider 503; direct minimal Gemini 3.6 HTTP 200 không đủ chứng minh request
  generation thực tế.
- **Kiểm tra:** `npm test` 153/153 PASS, `npm run lint` 0 errors/3 existing warnings, `npm run build`
  PASS, `git diff --check` PASS. Direct synthetic diagnostic was repaired for Windows direct-script
  execution and reports only canonical outcome metadata. Deno/Supabase CLI absent locally;
  exact-head CI run `33583763200` later passed all frontend, reset/pgTAP and Deno gates for
  `60759a9`. Rehearsal deploy remains blocked because no scoped deploy capability is present;
  no workaround tool was installed and no Production target was accessed.

## [2026-09-02] Phase 5 authorized rehearsal deployment and cleanup-contract gate

- **Agent:** Codex
- **Deployment evidence:** Using the authorized Supabase management connector and only rehearsal
  ref `znexculhbdjiflkczpyu`, deployed exact source `19ddf93` for
  `generate-knowledge-article` and `ask-ai`. Both are ACTIVE v7 with JWT verification; retrieved
  hosted source confirms the timeout mapping. No secret, model-setting, migration, or Production
  change was made.
- **Technical evidence:** Exact-head GitHub Actions `33584096813` PASS: frontend build/lint/tests,
  Supabase reset/full pgTAP, Deno check and Deno tests.
- **Safety stop:** Historical fixture audit found five synthetic document chains, nine jobs,
  seventeen immutable events, and five temporary users. The only public `_cleanup()` function is
  pgTAP-internal table/sequence cleanup, not a scoped application cleanup contract. Do not create
  another actor/fixture, run provider smoke, or run the full harness until a reviewed rehearsal-only
  exact-ID cleanup DAG specifies the permitted retained immutable audit history.
- **Verdict:** `PHASE_5_RUNTIME_BLOCKED_CLEANUP_CONTRACT`; PR #37 stays Draft and PR #36 remains
  unchanged. Owner-reported `models/gemini-3.6-flash` is not independently verified by safe hosted
  interfaces.

## [2026-09-02] Phase 5 R3 generation error trace and evidence normalization

- **Rehearsal:** Contract cleanup passed for run `P5_ACCEPTANCE_0ba6a78b298d4d85`; auth, anonymous
  denial, manager-boundary denial and TXT extraction passed. Generation v7 returned HTTP 400 generic
  `GENERATION_FAILED`.
- **Root cause:** Postgres log `document_chunks_evidence_kind_check` rejected an unsupported model
  evidence label during article evidence insert. This was not a timeout or provider outage.
- **Fix:** Normalize untrusted evidence kinds to the canonical enum with `ARTICLE_CLAUSE` fallback;
  add regression coverage. Pending exact-head CI and generation-function redeploy before rerun.
- **Cleanup:** Storage deleted, mutable jobs disabled, two actors deleted, immutable source/version/
  event history retained, and post-cleanup retrieval/Ask AI negative checks PASS. Production = NO.

## [2026-09-02] Phase 5 R3 final end-to-end rehearsal

- **Run:** `P5_ACCEPTANCE_56e868dbbee4457e` on rehearsal `znexculhbdjiflkczpyu` only. Document
  `6fd275f4-b207-4564-b509-27ba9e93579b`, article `22e437b4-a89e-42ed-ac92-7823cc53e67b`.
- **Provider/runtime:** direct synthetic `models/gemini-3.6-flash` smoke returned HTTP 200 in
  11,233 ms with the accepted 35-second timeout. Hosted generation v8 returned HTTP 200 in
  10,535 ms; `ask-ai` v7 returned HTTP 200 for grounded and abstention paths. The earlier v7
  generation failure was resolved by canonical evidence-kind normalization, and the harness query
  was aligned with `plainto_tsquery` AND semantics so its grounded gate tests retrieval rather than
  the intentional no-evidence branch.
- **Acceptance:** ingestion/provenance, TXT extraction, structured generation, human approval,
  retrieval enablement, citations, insufficient-evidence, anonymous denial, conversation ownership,
  and cross-org RLS isolation all PASS. Cleanup removed Storage and mutable AI rows, cancelled exact
  run jobs, retained bounded immutable synthetic history, and passed post-cleanup retrieval/Ask AI
  negative checks. Production = NO.
- **Validation:** local `npm test` 153/153 PASS, lint 0 errors/3 existing warnings, build PASS;
  exact-head CI `33587311565` PASS including pgTAP and Deno. Harness fix commit:
  `b92012af0f1ba59c49154637ce57b981bf1e47b3`.
- **Verdict:** `PHASE_5_END_TO_END_ACCEPTANCE_PASS`; PR #37 remains Draft and no merge or
  Production action was taken.

## [2026-09-04] P5.5-00 — Member Management architecture closed

- **Agent:** Claude Code
- **Thay đổi:** Viết kiến trúc P5.5-00 (Member Management, Account Profile ≠ Member Record, Mắt Bão
  làm source of truth cho member PII), sau đó đóng toàn bộ finding từ hai vòng review độc lập:
  (1) 12 finding R1–R12 (dangling section reference, `organizations.code` immutability contract,
  `date_of_birth`/export/`SYSTEM_ADMIN` contradiction, import job state machine + idempotency,
  `member_id` không phải business identifier, `DUPLICATE`→`POSSIBLE_DUPLICATE` terminology,
  IndexedDB trong browser-storage prohibition, A/B/C authorization-bridge comparison,
  `import_job_id` trong audit contract); (2) finding F1 (frontend `RoleGuard` cho `SYSTEM_ADMIN`
  qua mặc định, mâu thuẫn với rule "SYSTEM_ADMIN đơn lẻ = zero Member Management access") và một
  mâu thuẫn về blocker classification (backup capability vừa được ghi là chặn vừa không chặn
  P5.5-01 bắt đầu).
- **File đã sửa:** `docs/phase-5-5/00-member-management-architecture.md` (mới, qua 3 commit:
  `2ca1e5d` tạo tài liệu, `62b3c02` đóng R1–R12, commit tiếp theo đóng F1 + blocker taxonomy);
  `docs/brain/00-project-overview.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`
  (P5.5-D0…D7), `docs/brain/04-current-tasks.md`.
- **Lý do:** Owner chủ động đưa lightweight Member Management vào Phase 5.5 trước Innovation Corner
  (Phase 6); Phase 6 business implementation bị gate bởi `PHASE_5_5_END_TO_END_ACCEPTANCE_PASS`.
  Đây là architecture-only — không có bảng `members`, không có Member API, không migration nào được
  viết trong toàn bộ chuỗi task này.
- **Kiểm tra:** Đọc lại toàn bộ tài liệu độc lập hai lần (không tự tin vào bản thân đã viết); đối
  chiếu từng assertion về code hiện tại với source thật (`organizations` grants, `RoleGuard`,
  `_shared/auth.ts`, `is_organization_in_scope`, `documentService` keyset pagination, `audit_logs`
  schema, P2-12/P3-02 idempotency precedent, P2-14 formula-neutralization, P5 Gemini logging
  discipline) — tất cả `VERIFIED`, không có assertion nào `FALSE`; kiểm tra toàn bộ cross-reference
  nội bộ (`mục N`) khớp đúng section thật tồn tại sau mỗi lần sửa; `git diff --check` sạch mỗi lần
  commit; scope mỗi commit chỉ nằm trong `docs/`.

## [2026-09-04] P5.5 — Member Management infrastructure decision (Vibe Host v2)
- **Agent:** Claude Code
- **Thay đổi:** Đóng mục 28, mục con 1 (`BLOCKS_IMPLEMENTATION_START` — hạ tầng Mắt Bão cụ thể) của
  `docs/phase-5-5/00-member-management-architecture.md` ở mức kiến trúc. Nghiên cứu độc lập nguồn
  chính thức `matbao.net`/`wiki.matbao.net` cho ba phương án (Vibe Host v2 PaaS, Cloud Server Linux
  VPS, Hosting Linux Premium cPanel), lập option matrix, xác minh runtime/PostgreSQL/env-secret/
  domain-TLS/backup capability, và ghi rõ những gì KHÔNG xác minh được (private DB networking,
  backup retention/encryption/PITR, process-lifecycle detail) thay vì suy đoán. Kết luận: chọn Mắt
  Bão Vibe Host v2 (PostgreSQL 16 managed + Node.js container runtime) làm kiến trúc đích; loại
  Hosting Linux Premium vì cơ chế Node.js qua cPanel yêu cầu restart thủ công, không phù hợp backend
  API production. Không thực hiện provisioning/mua dịch vụ nào — đó là hành động riêng, ngoài phạm
  vi task.
- **File đã sửa:** `docs/phase-5-5/01-member-infrastructure-decision.md` (mới — ADR đầy đủ: context,
  requirements, option matrix, evidence có URL nguồn, decision, rejected alternatives, security/
  backup/domain implications, open runtime gates, P5.5 dependency impact);
  `docs/phase-5-5/00-member-management-architecture.md` (mục 26 P5.5-01 objective/dependencies/code
  surface, mục 28 mục con 1 đánh dấu RESOLVED-ở-mức-kiến-trúc, mục 29 next task — cập nhật để phản
  ánh: quyết định sản phẩm đã có, provisioning thật vẫn chưa xong và tách riêng khỏi việc bắt đầu
  viết schema/code); `docs/brain/03-decisions.md` (P5.5-D8).
- **Lý do:** P5.5-01 cần biết chính xác runtime/hosting để định hình code surface (ngôn ngữ,
  connection string, migration tool); đây là blocker kiến trúc duy nhất còn treo trước P5.5-01,
  theo đúng taxonomy đã chốt ở lần đóng P5.5-00 trước đó.
- **Kiểm tra:** Mọi khẳng định về khả năng Vibe Host v2/Cloud Server Linux/Hosting Linux Premium đều
  trích từ trang chính thức `matbao.net`/`wiki.matbao.net` truy xuất trực tiếp (không suy đoán,
  không dùng blog bên thứ ba làm nguồn quyết định khi có nguồn chính thức); mọi khoảng trống bằng
  chứng được ghi rõ `NOT VERIFIED`/`NOT PUBLICLY VERIFIED` thay vì bị bỏ qua hay giả định; không
  overprovision (đề xuất tier Basic, không tự bịa giá — dùng đúng số liệu công bố); không tạo
  `members` table, không viết Member API, không migration, không mua dịch vụ; `git diff --check`
  sạch; scope chỉ nằm trong `docs/`.

## [2026-09-04] P5.5-01 — Member data foundation (first Member Management code)
- **Agent:** Claude Code
- **Thay đổi:** Merge PR #38 (P5.5-00 architecture + infra decision) vào `master` sau xác nhận owner
  (không tự suy đoán merge policy — hỏi trước khi merge, CI exact-head xanh trước và sau merge).
  Tạo `member-api/`, một service Node.js + PostgreSQL độc lập, hoàn toàn tách biệt Supabase: migration
  `0001_init_members_schema.sql` (bảng `members` + 5 enum type đúng nguyên văn mục 5 tài liệu kiến
  trúc, index composite `(work_unit_code, member_status)` + trigram/unaccent cho tìm tên theo mục
  14/25, trigger `updated_at`), migration runner deterministic (`migrate.mjs`, hỗ trợ `--fresh`
  bootstrap tách biệt với "migration chạy một lần"), HTTP skeleton (`/healthz` không phụ thuộc DB,
  `/readyz` fail-closed 503 khi DB down, `/v1/members` luôn trả 501 — chưa có authorization bridge
  nên deny thay vì mock allow, đúng mục 17), config fail-fast khi thiếu `MEMBER_DATABASE_URL`. Thêm
  CI job `member-api-test` dùng service container `postgres:16` riêng, không đụng vào Supabase local
  stack của `test-db`.
- **File đã sửa:** `member-api/**` (mới — migration, scripts, src, tests, README, package.json,
  .env.example, .gitignore); `.github/workflows/ci.yml` (job `member-api-test` mới);
  `docs/brain/01-architecture.md`, `docs/brain/04-current-tasks.md` (P5.5-00 đóng, P5.5-01 mở).
- **Lý do:** P5.5-00 đã RESOLVED hạ tầng ở mức kiến trúc (Vibe Host v2); P5.5-01 là subphase đầu
  tiên có code, chỉ dựng data foundation + skeleton đủ test được, không CRUD/import/auth bridge thật
  (đúng decomposition mục 26 P5.5-00 và scope guard task riêng).
- **Kiểm tra:** `node --test tests/isolation.test.mjs` chạy cục bộ (không cần DB) — phát hiện và sửa
  một false-positive thật trong test (chuỗi tài liệu "auth.users" trong comment/COMMENT ON bị so
  khớp nhầm là tạo bảng — sửa bằng cách strip comment + regex CREATE TABLE chính xác thay vì substring
  match). `schema.test.mjs`/`server.test.mjs` cần PostgreSQL 16 — không có Docker và không dùng thử
  Postgres cục bộ sẵn có của máy (không rõ mật khẩu, không đoán/bruteforce; đã hỏi owner, owner chọn
  dựa vào CI thay vì cấp quyền truy cập Postgres cục bộ) — validation thật cho các test này nằm ở CI
  job `member-api-test` (exact-head, service container `postgres:16` riêng, không phải Postgres máy
  người dùng). SQL migration được soát thủ công (cú pháp `unaccent`/`pg_trgm` immutable wrapper,
  `gen_random_uuid()` built-in từ PG13+, transactional DDL). Root `npm test`/`npm run lint`/
  `npm run build` không bị ảnh hưởng vì `member-api/` là npm project riêng, không đụng `src/` hay
  root `package.json`/lockfile.

## [2026-09-05] P5.5-02 — Member Scope Authorization Bridge
- **Agent:** Claude Code
- **Thay đổi:** Merge PR #39 (P5.5-01) vào `master` (merge commit `0f6f1e526cd374d40b45ce7d672da2ce677b27c5`,
  head không đổi từ báo cáo trước `3373367`, exact-head CI xanh trước merge). Tạo Edge Function mới
  `supabase/functions/resolve-member-scope/`: xác thực JWT thật qua `_shared/auth.ts` (`requireUser`,
  không tự viết lại JWT verification), đọc lại `profiles.account_status` + `user_roles` server-side,
  trả `{user_id, account_status, roles:[{role_code, is_global, org_codes}]}`. `SYSTEM_ADMIN` bị loại
  hoàn toàn khỏi tập role có thể mang quyền Member Management (không special-case) — nên một
  `SYSTEM_ADMIN` đơn lẻ luôn nhận `roles: []`, và `SYSTEM_ADMIN`+`YOUTH_ADMIN` chỉ nhận đúng scope
  `YOUTH_ADMIN`, không bao giờ global — đúng mục 7/12 kiến trúc. Thêm migration
  `202609050001_phase_5_5_member_scope_resolver.sql`: hàm `member_scope_org_codes(scope_org_id)`
  (dịch scope → danh sách `organizations.code`, tái dùng recursive CTE của `is_organization_in_scope`
  thay vì viết traversal thứ hai), revoke public/grant `service_role` only. Không dùng signed/internal
  token giữa Member API và resolver — xác thực bằng shared secret `x-member-api-secret`
  (`hasTrustedWorkerSecret()`, cùng pattern `CRON_SECRET`/P3-08) cộng JWT thật của user; đây là lựa
  chọn có cân nhắc (không phải bỏ sót), vì kiến trúc mục 13 đã chọn "resolve mỗi request, zero cache"
  chính là để tránh độ phức tạp của một token nội bộ ký số. Phía Member API: `src/memberScope.js`
  (client gọi resolver + derive authorization, injectable cho test), `server.js` thêm
  `GET /v1/member-scope` (trả scope đã resolve, không phải dữ liệu đoàn viên) và đổi `/v1/members`
  từ "luôn 501" sang "enforce authorization trước (401/403), authorized rồi mới 501" — CRUD thật vẫn
  chờ P5.5-03. `config.js` fail-closed thêm khi thiếu `MEMBER_SCOPE_RESOLVER_URL`/`_SECRET`. Thêm
  persona synthetic mới `dualadmin@test.local` (`d0d0d0d0-...`) vào `supabase/seed.sql` để test riêng
  case dual-role SYSTEM_ADMIN+YOUTH_ADMIN (không có sẵn trong seed cũ). Thêm
  `supabase/functions/.env` (giá trị cố định, không nhạy cảm, chỉ dùng local/CI) để `supabase start`
  tự nạp `MEMBER_SCOPE_RESOLVER_SECRET` cho Edge Function chạy local/CI — có thêm ngoại lệ
  `!supabase/functions/.env` vào `.gitignore` kèm giải thích, vì đây không phải secret thật.
- **File đã sửa:** `supabase/functions/resolve-member-scope/**` (mới), `supabase/functions/.env`
  (mới), `.gitignore`, `supabase/migrations/202609050001_phase_5_5_member_scope_resolver.sql` (mới),
  `supabase/seed.sql`, `member-api/src/{memberScope.js (mới), config.js, server.js, index.js}`,
  `member-api/.env.example`, `member-api/tests/{memberScope.test.mjs (mới), server.test.mjs,
  isolation.test.mjs}`, `member-api/README.md`, `docs/brain/01-architecture.md`,
  `docs/brain/04-current-tasks.md`.
- **Lý do:** P5.5-02 là cầu nối authorization bắt buộc trước khi P5.5-03 (CRUD) có thể viết đúng
  permission matrix — đúng decomposition mục 26 P5.5-00. Không tự quyết định 28.8 (`BRANCH_OFFICER`
  write permission) — resolver chỉ biểu diễn scope hiện hữu của role đó, không tự thêm quyền sửa.
- **Kiểm tra:** `node --test tests/memberScope.test.mjs tests/isolation.test.mjs` chạy cục bộ (không
  cần DB) — 26/26 pass. `server.test.mjs`/`schema.test.mjs` cần PostgreSQL 16 và
  `supabase/functions/resolve-member-scope/{contract,index}.test.ts` cần Deno + local Supabase stack
  — không có sẵn cục bộ (không Docker/Deno), validation thật nằm ở CI (`member-api-test` job +
  `test-db` job, exact-head). Root `npm run lint`/`npm test`/`npm run build` chạy lại để xác nhận
  không có regression Phase 1–6 từ các thay đổi `.gitignore`/`docs/brain/*`.

## [2026-09-11] UI-Modern-Civic-Glass (phase 1/2 — Trang chủ + Tri thức)

- **Agent:** Claude Code
- **Bối cảnh:** Bàn giao thiết kế từ một phiên Claude Design khác (`Sổ tay đoàn viên số`,
  4 chat transcript + `.dc.html` mockup 14 màn, xem README bàn giao) — visual redesign đã được
  chốt trong chat ("APPROVED — lock this design direction... 75% modern soft / 25% editorial").
  Nhánh làm việc: `feat/ui-modern-civic-glass`, base `master` sau merge PR #46 (P5.5-07R).
- **Thay đổi:** Áp dụng hệ thị giác "Modern Civic Glass" cho Trang chủ và Tri thức (+ card báo
  cáo dùng chung ở Công việc) — KHÔNG đổi nghiệp vụ/route/service layer, chỉ token + markup thị
  giác:
  - `src/index.css`: thêm `@import` font `Archivo`, token `--accent-navy-label`/`--font-display`;
    thêm `.section-eyebrow` (section header đánh số "01 —"), `.tabs`/`.tab` (tab switcher —
    trước đó KHÔNG có CSS dù `Work.jsx`/`Knowledge.jsx` đã dùng class này, xem phát hiện phụ ở
    `03-decisions.md`), `.metric-info`/`.metric-card.accent-yellow`, `.campaign-card-head`/
    `.campaign-card-code`/`.campaign-card.accent`, `.featured-document*`, `.doc-index-list*`.
    Sửa tại chỗ `.document-list`/`.document-card` (bỏ shadow/border từng dòng, gộp thành 1 khối
    bo góc chung có hairline chia dòng — giảm cardification theo §5/§7 đặc tả).
  - `src/pages/Home.jsx`: viết lại markup — dùng đúng `.home-hero`/`.hero-top`/`.hero-greeting`
    đã có sẵn CSS (trước đó dùng class `hero`/`hero-content` không có style, xem phát hiện phụ);
    3 metric card trắng độc lập (bỏ icon 3 màu, chỉ "Việc sắp hạn" có vạch vàng); section đánh số
    01 (việc cần làm) / 02 (quản lý đoàn viên, ẩn nếu không có quyền — tái dùng đúng điều kiện
    `canManageMembers` như `Layout.jsx`) / 03 (tri thức, featured document card + danh sách rút
    gọn). Vẫn dùng `src/data/mock.js`, giữ nguyên badge "Dữ liệu minh họa".
  - `src/pages/Knowledge.jsx`: tab văn bản hiển thị 1 featured document card (tài liệu đầu danh
    sách thật từ `documentService`) + danh sách còn lại trong `.document-list` mới; không đổi
    logic tải dữ liệu/tab chuyên đề.
  - `src/pages/Work.jsx`: `AssignmentCard` đổi `card-header`/`card-meta` (không có CSS) sang
    `campaign-card-head`/`campaign-meta` (có CSS) + class `accent`; không đổi data/service layer.
- **File đã sửa:** `src/index.css`, `src/pages/Home.jsx`, `src/pages/Knowledge.jsx`,
  `src/pages/Work.jsx`, `docs/02-design-system.md` (addendum), `docs/brain/03-decisions.md`.
- **Lý do:** Đúng yêu cầu bàn giao thiết kế; đồng thời vá một gap thị giác có sẵn (class không
  có CSS trên Trang chủ/Công việc/Tri thức khiến các khu vực đó gần như không có style thật).
- **Kiểm tra:** `npm run lint` — 0 error, 4 warning cũ (không đổi). `npm test` — 197/197 pass
  (không đổi baseline, không file test nào bị sửa). `npm run build` — PASS (chunk CSS tăng từ
  phần rule mới, không có lỗi PostCSS sau khi di chuyển `@import` lên đầu file).
- **Giới hạn đã biết:** Không có Supabase project/browser thật trong môi trường viết code này —
  đã thử dựng SSR preview (`vite.ssrLoadModule` + `ReactDOMServer.renderToStaticMarkup`, không
  commit vào repo) để tự kiểm tra thị giác nhưng gặp lỗi CJS/ESM interop của `react-router-dom`
  trong module runner của Vite 6 SSR và dừng ở đó thay vì tiếp tục vá công cụ ngoài phạm vi task;
  KHÔNG tự nhận đã xem UI mới chạy thật trên trình duyệt. Xác minh dựa trên: build/lint/test
  PASS, đối chiếu thủ công từng class name được dùng với rule CSS tương ứng (đọc toàn bộ
  `src/index.css` trước khi sửa), và tái dùng pattern CSS đã chạy thật trong chính codebase này
  (`.home-hero`, `.metrics-grid.overlap`, `.featured-project`, `.list-card`/`.notice-row`) thay
  vì phát minh layout mới không có tiền lệ.
- **Chưa làm (rollout phase 2, chờ owner xác nhận baseline trước khi tiếp — đúng gate của bản
  thiết kế gốc):** Chi tiết báo cáo, Hỏi AI, Quản lý đoàn viên (danh sách/hồ sơ/import), Thông
  báo, Trắc nghiệm, Đổi mới sáng tạo, Cá nhân, toàn bộ trang Admin. Không tạo PR/không push lên
  remote trong lượt này — chờ owner xác nhận trước khi mở PR.

## [2026-09-16] P5.5 End-to-End Runtime Closure — Codex
- **Agent:** Codex
- **Thay đổi:** Audit exact `master@a5b92b7` against GitHub/Vercel and the non-production Supabase
  rehearsal. Applied missing P5.5-02 migration and deployed `resolve-member-scope` v1 with JWT
  verification, plus the user-facing admin/report Edge Functions required by the acceptance surface.
  Found and fixed two real rehearsal privilege defects: the innovation transition
  `SECURITY DEFINER` RPC lacked scope/assignment enforcement, and direct default grants exposed
  `member_scope_org_codes`; also pinned search paths on 10 trigger helpers as defense-in-depth.
- **File đã sửa:** `supabase/migrations/202609160001_phase_5_5_innovation_rpc_scope_hardening.sql`,
  `202609160002_phase_5_5_member_scope_rpc_privilege_hardening.sql`,
  `202609160003_phase_5_5_trigger_search_path_hardening.sql`, three new pgTAP test files,
  `docs/phase-5-5/03-phase-5-5-end-to-end-acceptance.md`, `docs/brain/01-architecture.md`,
  `03-decisions.md`, `04-current-tasks.md`.
- **Lý do:** P5.5 acceptance requires runtime evidence and catalog-level Supabase security checks;
  source migrations alone did not describe the rehearsal's direct grants/default privilege drift.
- **Kiểm tra:** Rehearsal migration list and function catalog re-queried; transaction-only synthetic
  authorization probe passed assigned-member allow, unassigned-member deny, out-of-scope-admin deny,
  and system-admin allow, then rolled back with zero fixture rows retained. Post-fix Security Advisor
  cleared mutable-search-path findings and reduced anonymous SECURITY DEFINER findings by one. Vercel
  production deployment was READY on the exact master SHA. Full local/CI/browser gates remain to be
  run or are blocked by the missing Mắt Bão runtime; verdict is
  `PHASE_5_5_END_TO_END_ACCEPTANCE_BLOCKED_MATBAO_RUNTIME_NOT_PROVISIONED`.
- **Bổ sung:** Sửa lỗi portability của test isolation trên Windows (`URL.pathname` giữ `%20` trong
  đường dẫn repo), không thay đổi production behavior hay security assertions. Ba pgTAP file mới
  được chạy trực tiếp trên rehearsal trong transaction rollback và trả về `ok`; full Supabase reset/
  Deno gate vẫn không chạy được vì CLI chưa có trong môi trường.

## [2026-09-18] PUBLIC_FIRST_AUTH_CORRECTION — code closure
- **Agent:** Codex
- **Thay đổi:** Tách public routes khỏi `AuthGuard`; guest chỉ thấy navigation/content public và
  thao tác private vẫn login-on-demand. Thêm RLS public-read hẹp cho documents, learning, quiz
  metadata và innovation; thêm public AI retrieval fixed-predicate/quota và Edge Function ký URL
  cho file public mà vẫn giữ private buckets. Chuyển Innovation khỏi mock data, cập nhật service
  worker để active deployment mới ngay khi phát hiện update.
- **File đã sửa:** `src/App.jsx`, `src/components/Layout.jsx`, `src/pages/{Home,Innovation,DocumentDetail,LearningTopicDetail}.jsx`,
  `src/services/{documentService,learningService,innovationService}.js`, `public/sw.js`,
  `supabase/migrations/202609180001_public_first_auth.sql`, `supabase/functions/{ask-ai,public-content-url}/index.ts`,
  `supabase/tests/public_first_auth.sql`, `tests/public_first_auth.test.mjs`,
  `docs/brain/{01-architecture,03-decisions,06-ai-working-log}.md`.
- **Lý do:** PR #52 chỉ public Home; data routes and RAG still sat behind auth/RLS for active users.
- **Kiểm tra:** Root `npm test` 204/204 pass; `npm run build` pass; lint has 0 errors and 4
  pre-existing warnings. `member-api npm test` is blocked by its absent local dependencies and
  `MEMBER_DATABASE_URL`; Supabase CLI, Deno and browser automation are absent, so pgTAP/Deno/browser/
  runtime/production deployment remain pending the required local/hosted gates.

## [2026-09-19] PUBLIC_FIRST_AUTH_CORRECTION — CI pgTAP portability fix
- **Agent:** Codex
- **Thay đổi:** Cast UUID fixture identifiers to text before applying the `LIKE` prefix predicate in
  `public_first_auth.sql`.
- **File đã sửa:** `supabase/tests/public_first_auth.sql`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** CI pgTAP reached the new test and failed before assertions because PostgreSQL has no
  `uuid ~~ unknown` operator. This is a test-query type correction only; it does not change RLS,
  migrations, production data, or runtime behavior.
- **Kiểm tra:** CI failure log isolated the error at test line 43 after all prior DB test files
  passed. The corrected query uses the explicit `id::text` predicate; CI must be re-run as hosted
  pgTAP evidence because the local Supabase runtime remains unavailable.

## [2026-09-19] PUBLIC_FIRST_AUTH_CORRECTION — CI quiz-option read assertion fix
- **Agent:** Codex
- **Thay đổi:** Narrowed the pgTAP quiz-option assertion to require that `anon` lacks `SELECT`,
  rather than requiring no table privileges of any kind.
- **File đã sửa:** `supabase/tests/public_first_auth.sql`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Final-head CI proved the no-read condition but exposed pre-existing non-SELECT table
  grants. Removing or altering those legacy write-grant/RLS semantics is out of scope; the
  Public-First acceptance boundary is that anonymous visitors cannot read answer options.
- **Kiểm tra:** CI reported only extra `DELETE`, `INSERT`, `REFERENCES`, `TRIGGER`, `TRUNCATE`, and
  `UPDATE`, with no `SELECT`. The revised check directly verifies the required read denial. Hosted
  CI must re-run as pgTAP evidence because the local Supabase runtime remains unavailable.

## [2026-09-20] PUBLIC_FIRST_RUNTIME_CLOSURE
- **Agent:** Codex
- **Thay đổi:** Đồng bộ rehearsal `znexculhbdjiflkczpyu` từ `master@ab72427`: apply Public-First
  migration, forward quiz hardening, and explicit service-role quota policy; deploy `ask-ai` v8 và `public-content-url` v1. Thêm shared
  boundary phân biệt application credential guest với user bearer: bearer lỗi bị reject 401 thay vì
  downgrade guest. Thêm pgTAP regression cho quiz question/option direct-read deny.
- **File đã sửa:** `supabase/functions/_shared/auth.ts`, `supabase/functions/{ask-ai,public-content-url}/index.ts`,
  `supabase/functions/_shared/auth.test.ts`, `supabase/migrations/{202609200001_public_first_quiz_read_hardening.sql,202609200002_public_ai_quota_policy.sql}`,
  `supabase/tests/public_first_quiz_hardening.sql`, `docs/phase-5-5/06-public-first-runtime-closure.md`,
  `docs/brain/{01-architecture,03-decisions,04-current-tasks,06-ai-working-log}.md`.
- **Lý do:** Rehearsal still had old database/function runtime after PR #53. Current Supabase
  publishable keys require in-handler guest/user separation when platform JWT verification is off.
- **Kiểm tra:** Hosted migration/function/catalog checks; browser guest route/list/detail/AI citation;
  direct forged-bearer 401; transaction RLS/retrieval/private-Storage/no-persistence checks; fixture
  cleanup 0 rows. Root `npm test` 204/204 and build PASS; lint 0 errors with four existing warnings.
  Deno/local Supabase and full Member API are blocked by unavailable runtime/dependencies.

## [2026-09-20] PUBLIC_FIRST_RUNTIME_FINAL_ACCEPTANCE_CLOSURE
- **Agent:** Codex
- **Thay đổi:** Re-audit branch/diff, re-run root validation and rehearsal RLS catalog checks; stage
  only Public-First closure files. Append final-acceptance evidence and blockers to the closure
  report.
- **File đã sửa:** `docs/phase-5-5/06-public-first-runtime-closure.md`,
  `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Close exactly the remaining exact-SHA CI, authenticated-browser, and signed-download
  gates without using non-rehearsal credentials or creating an unsafe fixture path.
- **Kiểm tra:** `npm test` 204/204; lint 0 errors with 4 existing warnings; build PASS. Rehearsal
  confirms anon quota/questions/options/audit/email reads denied, private-bucket visibility 0 under
  RLS, and fixed public retrieval execute allowed. Commit was not created because direct owner
  confirmation is still required; no auth or Storage fixture was created.

## [2026-09-20] PUBLIC_FIRST_RUNTIME_FINAL_ACCEPTANCE_CLOSURE — hosted rehearsal follow-up
- **Agent:** Codex
- **Thay đổi:** Hoàn tất acceptance với environment `.env` đang trỏ đúng rehearsal; xác minh Auth
  Admin/Storage permissions, authenticated session persistence, organization-scoped document access,
  signed private bytes, no-evidence Ask AI và RLS denials. Cleanup exact fixtures. Cập nhật final
  runtime report và trạng thái current task.
- **File đã sửa:** `docs/phase-5-5/06-public-first-runtime-closure.md`,
  `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Thay các blocker cũ bằng kết quả exact-SHA runtime acceptance; giữ lại giới hạn duy nhất
  là browser harness không expose native download event sau nút `window.open`.
- **Kiểm tra:** Preview deployment `dpl_5gRUHaUsYpREPqFk3N8xZMLA8PyE` dùng source SHA
  `633c5cf4142675b2b780f35e0372e6f6eff87602`; CI run `35486717207` xanh. Authenticated signed URL
  trả HTTP 200, `text/plain`, đúng 38 bytes; cross-org/anon denied. Session còn sau reload, document
  detail mở được, user sign-out. Cleanup verified: document/conversation/messages/profile/role/object
  counts 0, Auth users 404. `.env` unchanged; no production data changed. PR #54 khi đó còn mở và
  sau đó đã merge vào `master@2095ebb98c572f10a5b04a08396e3e3569fb1271`.

## [2026-09-20] SO_TAY_DOAN_VIEN_UI_UX_END_TO_END_FINALIZATION
- **Agent:** Codex
- **Thay đổi:** Hoàn thiện shared UI theo Public-First và design tokens: thống nhất guest/auth nav 5 mục, chuyển icon sang Lucide, thêm auth-required/native modal primitives, sửa shared skeleton token, đặt text floor 11px trên mobile, bổ sung quick actions trên Home, Innovation details/form dùng Edge Function contract có sẵn, chỉnh Profile account copy, và chuẩn hóa Login/Forgot/Reset/Change Password.
- **File đã sửa:** `package.json`, `package-lock.json`; `src/components/{Guards,Icon,Layout,Skeleton,common}.jsx`, `src/index.css`, `src/pages/{Home,Innovation,Profile}.jsx`, `src/pages/auth/{Login,ForgotPassword,ResetPassword,ChangePassword}.jsx`, `src/services/innovationService.js`, `tests/{public_first_auth,innovation_service}.test.mjs`, `docs/ui-ux-end-to-end-finalization.md`, `docs/brain/{01-architecture,03-decisions,04-current-tasks,06-ai-working-log}.md`, và screenshot evidence trong `docs/ui-ux-end-to-end-finalization/screenshots/`.
- **Lý do:** Củng cố cảm giác một sản phẩm thống nhất trên mobile/desktop, giữ đăng nhập theo yêu cầu của route, và sửa shared loading state vốn render như vùng trắng vì dùng token không tồn tại.
- **Kiểm tra:** `npm test` 207/207; lint 0 errors với 3 Fast Refresh warnings đã có; build PASS (513.97 kB main chunk warning); route smoke trên toàn bộ route pattern và wildcard ở 360px; bốn viewport 360/390/768/1440 không overflow cho 7 surface đại diện; ba auth routes kiểm tra ở cả bốn viewport; visible text không dưới 11px ở Home, Knowledge, Innovation, Work gate và auth forms trên 360/390px; 5 navigation/auth click smoke và keyboard focus field kiểm tra. No backend/API/auth-boundary or Phase 6 changes. PR #56 mở trên branch này.
- **Giới hạn:** Không có rehearsal Supabase/Member API hoặc authenticated role trong workspace; content, session/logout, private document, Ask AI response, authorized member/admin screens và Innovation modal submit còn chờ browser acceptance trên Preview. Verdict `UI_UX_END_TO_END_FINALIZATION_BLOCKED_NO_REHEARSAL_RUNTIME`; report `docs/ui-ux-end-to-end-finalization.md`.

## [2026-09-20] UI_REFERENCE_RECONCILIATION — Mockup-to-code
- **Agent:** Codex
- **Thay đổi:** Đối chiếu và triển khai lại 8 màn Login, Home, Công việc, Chi tiết báo cáo, Tri thức,
  AI, Quiz và Quản lý đoàn viên theo mockup owner; đưa shell mobile về bottom nav 5 mục, dùng logo
  Đoàn có sẵn và thay icon path tự viết bằng `lucide-react`. Ghi chú báo cáo lưu text cục bộ theo
  user/assignment; submit/upload vẫn đi qua service hiện hữu.
- **File đã sửa:** `package.json`, `package-lock.json`, `public/brand/logo-doan.jpg`,
  `src/components/{Icon,Layout,common}.jsx`, `src/index.css`,
  `src/pages/{AskAi,Home,Knowledge,MemberManagement,Quiz,ReportAssignmentDetail,Work}.jsx`,
  `src/pages/auth/Login.jsx`, `docs/brain/{01-architecture,03-decisions,04-current-tasks,06-ai-working-log}.md`,
  `docs/ui-reference-reconciliation/{README.md,screenshots/*.png}`.
- **Lý do:** UI trước đó lệch hierarchy/layout mobile trong mockup đã duyệt; các chỉnh sửa chỉ tác
  động presentation và giữ nguyên auth, business service, route, API contract và security behavior.
- **Kiểm tra:** `npm test` 204/204 pass; `npm run lint` 0 lỗi, 3 cảnh báo Fast Refresh cũ;
  `npm run build` pass (cảnh báo bundle chính 518.05 kB). Browser visual review 8 màn ở 390×844;
  responsive matrix 40 lượt (8 route × 360/390/430/768/1440) không tràn ngang, màn không trắng.
  Fake Supabase/Member API chỉ cung cấp dữ liệu tổng hợp cho UI, không xác minh backend/runtime.

## [2026-09-22] SOTAY_UI_FINAL_CLOSURE
- **Agent:** Codex
- **Thay đổi:** Tạo branch closure từ master sau PR #54; reconcile thủ công PR #55/#56 theo từng
  màn; thống nhất navigation, auth-on-demand, Lucide và owner mockup; sửa desktop Home/Login/
  Knowledge/Ask AI, no-evidence/retry AI, mobile text/touch floors; cập nhật status/matrix/report và
  lưu screenshot source cuối.
- **File đã sửa:** `README.md`, `docs/04-implementation-status.md`,
  `docs/brain/{01-architecture,03-decisions,04-current-tasks,06-ai-working-log}.md`,
  `docs/ui-final-closure/**`, `docs/ui-reference-reconciliation/**`, `public/brand/logo-doan.jpg`,
  `src/components/{Icon,Layout,common}.jsx`, `src/index.css`,
  `src/pages/{AskAi,Home,Knowledge,MemberManagement,Quiz,ReportAssignmentDetail,Work}.jsx`,
  `src/pages/auth/Login.jsx` cùng các file từ UI finalization đã cherry-pick.
- **Lý do:** Đưa toàn bộ frontend về một candidate duy nhất, giữ đúng Public-First và contract hiện
  có, loại bỏ hai implementation cạnh tranh mà không mở backend/Phase 6.
- **Kiểm tra:** `npm test` 208/208; lint 0 errors/3 warning cũ; build PASS (main chunk 525.45 kB,
  warning >500 kB); `git diff --check` PASS. Browser rehearsal guest 30/30 route pattern tại mỗi
  viewport 360/390/430/768/1440, console public sạch, navigation/auth-on-demand/keyboard và Ask AI
  no-evidence PASS. Authenticated runtime/Member API vẫn BLOCKED đúng nghĩa; không tạo fixture giả,
  không dùng service role ở frontend và không chạm production. PR #57 exact head
  `a6d7f02c8d6aaa3da64b4c2e5175be4e0f3bf8ca`, CI run `35700532914` xanh toàn bộ.
