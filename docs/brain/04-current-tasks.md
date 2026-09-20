# 04 — Current Tasks

> Cập nhật mỗi khi bắt đầu hoặc hoàn thành task. Agent đọc đây để biết được phép làm gì.
> Trạng thái triển khai chi tiết: `docs/04-implementation-status.md`; kế hoạch phase: `docs/phase-2/`.

---

## Đang làm

### PUBLIC_FIRST_RUNTIME_FINAL_ACCEPTANCE_CLOSURE (2026-09-20)
- **Base:** `origin/master@ab7242787965c7669caeeef6eb6e2d44b214b974` (PR #53 merge).
- **Runtime đã đồng bộ:** rehearsal `znexculhbdjiflkczpyu` nhận `202609180001_public_first_auth`
  và forward migrations `202609200001_public_first_quiz_read_hardening` / `202609200002_public_ai_quota_policy`; `ask-ai` ACTIVE v8 và
  `public-content-url` ACTIVE v1 đều `verify_jwt=false` với authentication boundary trong handler.
- **Evidence guest:** Browser thật trên Vercel production (SHA `ab72427`) mở public routes, list/detail
  content synthetic, và Ask AI trả citation public; SQL transaction chứng minh PUBLIC allow,
  INTERNAL deny, fixed public retrieval deny private source, private Storage deny, and guest AI
  persistence = 0. Fixture đã cleanup theo exact IDs.
- **Final acceptance attempt:** source Public-First đã review và stage, nhưng exact SHA/CI chờ owner
  xác nhận commit/push trực tiếp. Connector không có Auth Admin hoặc Storage object-upload; local
  credential config không trỏ rehearsal nên không dùng. Không tạo user/profile/role/document/object
  synthetic. **Verdict:** `PUBLIC_FIRST_RUNTIME_ACCEPTANCE_BLOCKED_COMMIT_CONFIRMATION_AND_REHEARSAL_FIXTURE_CAPABILITY`.
  Không mở Phase 6.
- **Report:** `docs/phase-5-5/06-public-first-runtime-closure.md`.

### P5.5 — End-to-End Final Closure (2026-09-18)
- **Base:** `origin/master@7f468a5111df54486f7e98688b4c16057668a519`. PR #51 giữ nguyên như
  historical hosted-runtime acceptance artifact; không merge vì không có Mắt Bão runtime.
  Branch closure mới: `codex/p5-5-final-e2e-closure`.
- **Phạm vi vòng này:** sửa auth architecture sang `PUBLIC_FIRST_AUTH_ON_DEMAND`: Home/demo shell
  public, route dữ liệu thật vẫn AuthGuard/RLS; guest nhận CTA đăng nhập tại điểm cần quyền. Không
  mở anonymous AI/retrieval và không tách Account khỏi Member Record đã chốt ở P5.5-D1…D4.
- **Đã xác minh:** root `200/200`, auth/public-first tests `17/17`, lint `0 errors` (4 warning cũ),
  build PASS, Member API targeted `73/73`; CI artifact trước đó full Member API `273/273`, Deno
  `116 passed / 0 failed`, test-db job PASS, Vercel PASS trên exact PR #51 head.
- **Còn BLOCKED:** full local Member API không chạy đủ vì thiếu `MEMBER_DATABASE_URL` và npm cache
  Windows trả `EPERM` khi cài `exceljs`; Mắt Bão chưa provision; không có hosted Member API
  hostname/database/secrets; authenticated browser, hosted CORS/CSP và hosted backup/restore chưa
  chạy. Không giả lập các gate này và không bắt đầu Phase 6.
- **Verdict bắt buộc giữ nguyên:**
  `PHASE_5_5_END_TO_END_ACCEPTANCE_BLOCKED_MATBAO_RUNTIME_NOT_PROVISIONED`.
- **Report:** `docs/phase-5-5/05-p5-5-end-to-end-final-closure.md`.

### P5.5 — Production Runtime Closure (partial)
- **Base:** `master` sau merge PR #48 (`be128d320bdde7e6c0d5fea2d51e90954b950003`). Branch
  `feat/p5-5-production-runtime-closure`.
- **Kết quả:** `SOTAY_P5_5_PRODUCTION_RUNTIME_CLOSURE_PARTIAL`. Lần đầu sandbox này có PostgreSQL 16
  server thật (trước đây chỉ có client tools) — dùng để chạy `member-api` test suite thật (273/273),
  chạy `member-api` process thật cho smoke test CORS/auth (health/ready/401/403/CORS exact-origin
  đều đúng, không cần sửa code), và chạy rehearsal backup(`pg_dump`)/restore end-to-end thật.
- **Defect thật tìm được + đã vá:** restore một `pg_dump` của Member DB luôn lỗi
  `function unaccent(unknown, text) does not exist` (search_path rỗng lúc restore không resolve được
  lời gọi `unaccent(...)` không schema-qualify trong migration 0001). Vá bằng migration mới
  `member-api/migrations/0004_fix_unaccent_restore_qualification.sql` — không sửa migration cũ,
  regression test lại 273/273, chạy lại toàn bộ rehearsal backup→restore→verify PASS sau vá.
- **Còn `BLOCKED` (hạ tầng/credential, không phải bỏ qua):** Mắt Bão chưa provisioning
  (`MATBAO_RUNTIME_BLOCKED_NOT_PROVISIONED`, không đổi); sandbox này không có egress ra
  `*.vercel.app`/Supabase thật (`connect_rejected` từ agent proxy, xác nhận bằng curl trực tiếp) nên
  browser acceptance với runtime thật + Supabase/Member API runtime + CORS/CSP runtime thật + config
  drift thật đều `BLOCKED_NO_EGRESS`/`BLOCKED_NO_CREDENTIALS`; Email `BLOCKED` (chưa cấu hình
  provider, đúng theo policy).
- **Chi tiết đầy đủ:** entry `[2026-09-13] PR48 closure + P5.5 Production Runtime Closure (partial)`
  trong `docs/brain/06-ai-working-log.md`; ma trận acceptance đầy đủ trong PR body.

### P5.5 — End-to-End Runtime Closure (Codex audit 2026-09-16)
- **Branch:** `codex/p5-5-end-to-end-runtime-closure`, base `origin/master@a5b92b7e50dd70475becc177e8ce594726b2cf97`.
- **Verdict:** `PHASE_5_5_END_TO_END_ACCEPTANCE_BLOCKED_MATBAO_RUNTIME_NOT_PROVISIONED`.
- **Đã xác minh:** GitHub master đúng SHA; PR #49 đã merged và không còn PR mở; Vercel production
  deployment READY chạy đúng merge SHA; rehearsal Supabase `znexculhbdjiflkczpyu` ACTIVE_HEALTHY,
  PostgreSQL 17.6.1.155. Rehearsal đã nhận các migration P5.5-02 và ba forward security migrations;
  `resolve-member-scope` đã deploy ACTIVE v1 với `verify_jwt=true`; các Edge Functions user-facing cần
  cho admin/report surface cũng đã deploy ACTIVE v1 với JWT verification. `run-ingestion-jobs`/
  `send-reminder` còn deferred worker; innovation submit/update không deploy vì Phase 6 chưa được mở.
  Không có dữ liệu thật được tạo.
- **Security delta:** audit catalog tìm thấy defect scope/assignment trong `transition_problem_status`
  và direct grants ngoài ý muốn trên `member_scope_org_codes`; đã sửa bằng migration forward và
  regression pgTAP. Security Advisor sau hardening còn: 14 RLS-no-policy (intentional backend-only/
  deny-by-default), 2 extension-in-public (accepted project layout), 16 anon + 66 authenticated
  SECURITY DEFINER warnings (helper/RPC contracts có auth/scope checks), và 1 leaked-password
  protection (configuration pending — chưa có quyền cấu hình Auth để xác minh).
- **Blocker owner/infra:** chưa có instance Mắt Bão Vibe Host v2, Member API hostname/TLS,
  `MEMBER_DATABASE_URL`, `MEMBER_SCOPE_RESOLVER_SECRET`/runtime secret sync, `CORS_ALLOWED_ORIGIN`,
  `VITE_MEMBER_API_URL`, và CSP `connect-src` entry cho hostname thật. Vì vậy chưa thể chạy
  authenticated browser matrix, Member API hosted health/ready/auth/CORS, cross-system bridge, hay
  backup/restore thật. Không dùng placeholder hostname, không deploy/mutate production, không mở Phase 6.
- **Report:** `docs/phase-5-5/03-phase-5-5-end-to-end-acceptance.md` và entry mới trong
  `docs/brain/06-ai-working-log.md`.

### UI Modern Civic Glass — Phase 2 rollout (CLOSED — merged qua PR #48)
- **Base:** `master` sau merge PR #47 (`22ba73e47d2f449dbab762cfba80e1d01f688cd3`). Branch
  `feat/ui-modern-civic-glass-phase2`.
- **Phạm vi:** Mở rộng Modern Civic Glass (đã chốt ở PR47: Trang chủ/Công việc/Tri thức) sang các
  màn còn lại theo đúng danh sách rollout đã ghi trong `docs/02-design-system.md` addendum. Chỉ
  CSS/JSX presentation — không đổi route/schema/RLS/API/business logic.
- **Nội dung:** Sửa dead-CSS/touch-target/layout defect thật tìm được qua browser Chromium thật
  (Playwright, network Supabase/Member API mocked — sandbox không có backend thật/Docker) ở
  `Guards.jsx` (loading/forbidden state dùng chung mọi route), `Profile.jsx`,
  `ReportAssignmentDetail.jsx`, `Innovation.jsx`, `Admin.jsx`, và 3 touch-target/select sizing gap
  trong `index.css`. Các màn còn lại (Notifications, MemberManagement/Detail/Import, AskAi,
  LearningTopics/Detail, Quiz, phần lớn Admin) được audit và xác nhận `ALREADY_COMPLIANT` — đã dùng
  đúng component/token sẵn có, không cần sửa.
- **Chi tiết đầy đủ:** entry `[2026-09-13] PR47 closure + Modern Civic Glass Phase 2 rollout` trong
  `docs/brain/06-ai-working-log.md`; bảng audit + rủi ro còn lại trong PR body.
- **Không có trong round này:** modal "Gửi bài toán, điểm nghẽn" (chưa từng xây — feature gap, không
  phải style bug), `pages/auth/*` (dead-class riêng, để round sau), Vercel Preview click-through
  thật với backend thật (không có egress trong sandbox này).

### P5.5-00 — Member Management Architecture & Data Contract (architecture only) — CLOSED
- **Base:** `master@a775a637a29217dbce6d658086935fd1b64da5c9` (Phase 1–5 đã đóng). Branch
  `docs/p5-5-member-management-architecture`, merged vào `master` qua PR #38 (merge commit
  `fdffc494d549f3440b5fec2963722b15cb67de54`).
- **Trạng thái:** `P5_5_00_ARCHITECTURE_READY`, merged. Bao gồm quyết định hạ tầng
  `docs/phase-5-5/01-member-infrastructure-decision.md` (Mắt Bão Vibe Host v2, PostgreSQL 16 +
  Node.js) — mục 28.1 RESOLVED ở mức kiến trúc; provisioning thật vẫn chưa thực hiện.
- **Nội dung:** Kiến trúc Member Management tách biệt Supabase (Account Profile) khỏi Member API +
  PostgreSQL tại Mắt Bão VN (Member Record); data model, API contract, import Excel, authorization
  cross-system, audit, backup/restore, threat model, test matrix, decomposition P5.5-01…10.
- **Gate:** `PHASE_6_BUSINESS_IMPLEMENTATION_MUST_NOT_START until PHASE_5_5_END_TO_END_ACCEPTANCE_PASS`.
- **Report:** `docs/phase-5-5/00-member-management-architecture.md`,
  `docs/phase-5-5/01-member-infrastructure-decision.md`.

### P5.5-01 — Member data foundation — CLOSED
- **Base:** `master` sau merge PR #38. Branch `feat/p5-5-01-member-data-foundation`, merged vào
  `master` qua PR #39 (merge commit `0f6f1e526cd374d40b45ce7d672da2ce677b27c5`).
- **Nội dung:** `member-api/` — service Node.js độc lập, KHÔNG phải Supabase Edge Function. Migration
  `0001_init_members_schema.sql` (bảng `members` + 5 enum type theo đúng mục 5 tài liệu kiến trúc),
  migration runner deterministic (`scripts/migrate.mjs`, hỗ trợ `--fresh` bootstrap), HTTP skeleton
  (`/healthz`, `/readyz`).
- **Test:** `member-api/tests/` (`schema.test.mjs`, `isolation.test.mjs`, `server.test.mjs`) chạy qua
  `node --test`, CI job `member-api-test` trong `.github/workflows/ci.yml` dùng service container
  `postgres:16` riêng biệt — không dùng chung Postgres của Supabase local stack.
- **Report:** `member-api/README.md`.

### P5.5-02 — Member Scope Authorization Bridge
- **Base:** `master` sau merge PR #39. Branch `feat/p5-5-02-member-scope-bridge`.
- **Nội dung:** Edge Function `supabase/functions/resolve-member-scope/` — xác thực Supabase JWT thật
  (`_shared/auth.ts` `requireUser`), đọc lại `profiles.account_status` + `user_roles` server-side,
  trả `{ user_id, account_status, roles: [{role_code, is_global, org_codes}] }`. Một `SYSTEM_ADMIN`
  đơn lẻ luôn resolve về `roles: []` (đúng mục 7/12); `SYSTEM_ADMIN` + `YOUTH_ADMIN` chỉ resolve đúng
  scope của `YOUTH_ADMIN`, không bao giờ global. Migration mới
  `202609050001_phase_5_5_member_scope_resolver.sql` thêm hàm `member_scope_org_codes()` (dịch
  `scope_organization_id` → danh sách `organizations.code` trong scope, tái dùng cùng recursive CTE
  với `is_organization_in_scope()`). `member-api/src/memberScope.js` gọi resolver này (secret dùng
  chung `x-member-api-secret`, cùng pattern `CRON_SECRET`/P3-08) và derive quyết định authorize.
  `GET /v1/member-scope` (mới) chứng minh bridge hoạt động (trả scope đã resolve, không phải dữ liệu
  đoàn viên); `/v1/members` nay enforce authorization trước (401/403), chỉ khi authorized mới rơi về
  `501` (CRUD vẫn chưa có, chờ P5.5-03). Không dùng signed/internal token — lý do: kiến trúc mục 13
  đã chọn "resolve mỗi request, không cache" chính vì lý do tránh thêm độ phức tạp đó.
- **Không có trong subphase này:** Member CRUD/list thật, import XLSX, frontend, deploy Mắt Bão,
  mua/provision dịch vụ, quyết định 28.8 (`BRANCH_OFFICER` write permission).
- **Test:** `supabase/functions/resolve-member-scope/` (`contract.test.ts` pure, `index.test.ts` full
  auth flow qua local Supabase stack — invalid/expired/forged JWT, suspended account, cross-org scope,
  dual-role SYSTEM_ADMIN+YOUTH_ADMIN — persona synthetic mới `dualadmin@test.local` trong
  `supabase/seed.sql`); `member-api/tests/memberScope.test.mjs` (resolver HTTP client, derive logic);
  `member-api/tests/server.test.mjs` mở rộng (ma trận 401/403/501); `member-api/tests/isolation.test.mjs`
  mở rộng (không đọc header/body do client tự khai để authorize).
- **Report:** `member-api/README.md`.

### P5.5-02 — Member scope authorization bridge (merged)
- **Base:** `master` sau merge PR #39 (P5.5-01). Branch `feat/p5-5-02-member-scope-bridge`.
- **Trạng thái:** merged qua PR #40 (merge commit `8f03f0af8e840a30a6239bb7084e487d3d5e7014`),
  exact-head CI (`b3ae656`) xanh trước merge (`build`/`member-api-test`/`test-db`/Vercel đều
  `success`).
- **Nội dung:** Edge Function `supabase/functions/resolve-member-scope` (xác minh JWT thật qua
  `requireUser`, re-check `profiles.account_status`/`user_roles`, dịch scope sang
  `organizations.code`); migration `202609050001_phase_5_5_member_scope_resolver.sql`
  (`member_scope_org_codes()`); `member-api/src/memberScope.js` (resolver client + derive
  authorization) wired vào `server.js`; `GET /v1/member-scope` chứng minh bridge end-to-end.
  `/v1/members` lúc này đã enforce authorization trước, còn CRUD thật vẫn 501 (đúng phạm vi P5.5-02).

### P5.5-03 — Member CRUD vertical slice
- **Base:** `master` sau merge PR #40 (`8f03f0af8e840a30a6239bb7084e487d3d5e7014`). Branch
  `feat/p5-5-03-member-crud`.
- **Owner decision áp dụng (đóng mục 28.8):** `BRANCH_OFFICER` được tạo/sửa Member (không chỉ xem)
  trong đúng phạm vi tổ chức do P5.5-02 resolver trả về; không có quyền Account/Auth nào kèm theo.
  `YOUTH_ADMIN` giữ nguyên quyền list/read/create/update toàn bộ scope đã resolve.
- **Nội dung:** `GET/POST /v1/members`, `GET/PATCH /v1/members/:id` thật (không còn 501) —
  pagination, filter `work_unit_code`/`member_status`, search tên tiếng Việt không dấu
  (`pg_trgm`+`unaccent`, đã có từ P5.5-01); scope enforce server-side qua
  `resolveEffectiveOrgScope(roles)` (global hoặc union `org_codes`, rỗng = 0 dòng, không bao giờ
  "rỗng = xem hết"); allowlist mass-assignment tường minh cho create/patch; `work_unit_code` không
  nằm trong allowlist PATCH (bất biến qua endpoint này); phản hồi allowlist field, không `SELECT *`,
  không trả `account_user_id`. `DELETE` trả `501` có chủ đích — không hard delete; archive dùng
  PATCH `member_status = 'ARCHIVED'` theo đúng hợp đồng mục 17 sẵn có, không thêm endpoint riêng.
- **Không có trong subphase này:** import Excel (P5.5-05), audit table (khuyến nghị đi kèm nhưng
  owner instruction P5.5-03 không yêu cầu — để P5.5-07), frontend (P5.5-06), `/member-metadata`.
- **Xác thực `work_unit_code` là tổ chức có thật khi tạo mới (RESOLVED, sửa trên đúng PR #41 trước
  khi merge):** phát hiện ban đầu — với actor `YOUTH_ADMIN` scope-toàn-cục (`is_global: true`),
  resolver P5.5-02 trả `org_codes: []` nên Member API không có danh sách để đối chiếu, chỉ chặn được
  spoofing phạm vi chứ không chặn được mã tổ chức không tồn tại. **Đã vá**, không đổi
  `resolve-member-scope`/logic scope, không tạo registry tổ chức thứ hai: `POST /v1/members` giờ gọi
  `member-api/src/organizationDirectory.js` (`checkOrganizationExists`) — đọc thẳng bảng
  `organizations` thật của Supabase qua REST endpoint đã có sẵn (`grant select ... to anon,
  authenticated` + RLS policy "active users read organizations", `202607300001_initial_schema.sql`),
  xác thực bằng CHÍNH bearer token của actor hiện tại (không phải service role — không vượt RLS,
  không cấp thêm quyền nào actor chưa có). Thứ tự kiểm tra khi create: (1) mã phải tồn tại thật
  (`400 unknown_organization` nếu không) → (2) mã phải trong scope đã resolve (`403 forbidden` nếu
  ngoài scope, kể cả khi mã đó có thật). `is_global` giờ đúng nghĩa "không giới hạn giữa các tổ chức
  hợp lệ", không còn là "chấp nhận chuỗi bất kỳ". Directory không cache, không tạo/sửa bảng
  `organizations` (chỉ `SELECT`), fail-closed 503 nếu không xác thực được (không bao giờ fallback
  "coi như hợp lệ"). Cấu hình mới (fail-closed, giống các biến bắt buộc khác):
  `SUPABASE_URL`/`SUPABASE_ANON_KEY` trong `member-api/.env` — cùng giá trị anon key công khai
  frontend đã dùng, không phải secret, không phải service role key.
- **Test:** `member-api/tests/{memberValidation,scope,memberCrud,memberRoutes,organizationDirectory}.test.mjs`
  (mới) + cập nhật `server.test.mjs`/`isolation.test.mjs`. **148/148 pass** với PostgreSQL 16 thật cục
  bộ, phủ toàn bộ ma trận bảo mật âm tính owner yêu cầu bao gồm cả xác thực tổ chức tồn tại (global
  YOUTH_ADMIN + mã hợp lệ/không hợp lệ, scoped YOUTH_ADMIN + mã tồn tại trong/ngoài scope,
  BRANCH_OFFICER + mã hợp lệ/không hợp lệ, xác nhận validation không ghi/sửa bảng `organizations`)
  (xem `06-ai-working-log.md`).
- **Report:** xem entry `[2026-09-05]` trong `docs/brain/06-ai-working-log.md`. **Không còn blocker
  P5.5-03 nào đã biết.**
- **Trạng thái:** merged qua PR #41 vào `master`.

### P5.5-04 — Search/filter/list
- **Base:** `master` sau merge PR #41 (P5.5-03, `56f858296bcd02c3a805d77dba2b3086cace8a4b`). Branch
  `feat/p5-5-04-member-search-filter-list`.
- **Audit trước khi code:** P5.5-03 đã có sẵn pagination `limit/offset`, filter
  `work_unit_code`/`member_status`, search accent-insensitive theo `full_name` (`pg_trgm`+
  `unaccent`), scope enforcement, parameter binding, LIKE-metacharacter escaping, và
  `ORDER BY full_name ASC, member_id ASC` cố định. Delta còn thiếu theo mục 14/23 kiến trúc: 3
  filter (`youth_position`, `youth_board_position`, `political_theory_level`), `sort` có thể chọn
  (`updated_at DESC` — mục 14 chỉ có một order cứng), và performance evidence trên dataset
  ~3.000 dòng synthetic (mục 9/25) — chưa tồn tại trước task này.
- **Nội dung:** Thêm 3 filter còn thiếu vào `parseListQuery`/`listMembers`
  (`member-api/src/{memberValidation,memberRepository}.js`) — cùng cơ chế bound parameter + enum
  allowlist với 2 filter cũ, luôn `AND` với scope. Thêm query param `sort` (allowlist cố định
  `full_name_asc` mặc định | `updated_at_desc`; giá trị ngoài allowlist → `400`, không bao giờ nối
  trực tiếp vào SQL — map qua object literal cố định `ORDER_BY_CLAUSES`, không string-build từ giá
  trị client). Cả hai order đều có tie-breaker `member_id` để đảm bảo stable ordering khi trùng
  `full_name`/`updated_at` (mục 23 test #14). Không sửa `memberScope.js`/`scope.js`/resolver — không
  phát hiện bug thật ở P5.5-02.
- **Performance:** thêm dataset synthetic ~3.000 dòng (`member-api/tests/helpers/syntheticMembers.mjs`
  — tên tiếng Việt tổng hợp, nhiều tổ chức/trạng thái/chức danh, có nhóm trùng `full_name` chủ đích;
  KHÔNG phải dữ liệu đoàn viên thật) và test đo hiệu năng
  (`member-api/tests/memberPerformance.test.mjs`) — warm-up rồi đo 15 lần, assert trên median, in
  min/median/max ra console thay vì assert trên một sample đơn lẻ (tránh CI flaky). Kết quả cục bộ:
  list+filter (`work_unit_code`+`member_status`, scoped) median ≈2ms; list+filter global scope theo
  `member_status` median ≈2ms; search có dấu median ≈10ms; search không dấu median ≈10ms — toàn bộ
  sâu dưới target `<300ms` mục 25. `EXPLAIN (ANALYZE, BUFFERS)` xác nhận filter theo
  `work_unit_code`+`member_status` dùng `idx_members_work_unit_status`; search ở quy mô 3.000 dòng
  planner chọn Seq Scan thay vì GIN trigram (chi phí ước tính thấp hơn ở bảng nhỏ) — cả hai đều nằm
  trong target, **không cần migration/index mới** (đúng chỉ dẫn mục 10: benchmark trước, chỉ thêm
  index khi có bằng chứng cần).
- **Không có trong subphase này:** import Excel (P5.5-05), audit table (P5.5-07), frontend
  (P5.5-06), `/member-metadata`, mọi thay đổi resolver/scope P5.5-02.
- **Test:** cập nhật `member-api/tests/{memberValidation,memberCrud,memberRoutes}.test.mjs` (filter
  mới, sort hợp lệ/không hợp lệ/injection-shaped, pagination edge case: negative/zero/non-number/
  oversized limit, offset vượt dataset, cross-org isolation cho filter/search mới) + test file mới
  `memberPerformance.test.mjs`. Toàn bộ `member-api` test suite (`npm test`) PASS cục bộ với
  PostgreSQL 16 thật (xem `06-ai-working-log.md` cho số liệu chính xác).
- **Report:** xem entry `[2026-09-05]` (P5.5-04) trong `docs/brain/06-ai-working-log.md`.
- **Trạng thái:** merged qua PR #42 (merge commit `ac2bf2c263934366f5bc3eae0ad44ebffc981f62`),
  exact-head CI (`b27f783d`) xanh trước merge (`build`/`test-db`/`member-api-test`/Vercel đều
  `success`), owner đã xác nhận merge.

### P5.5-05 — Excel import
- **Base:** `master` sau merge PR #42 (P5.5-04, `ac2bf2c263934366f5bc3eae0ad44ebffc981f62`). Branch
  `feat/p5-5-05-member-excel-import`.
- **Audit trước khi code:** xác nhận `member-api/` chưa có parser Excel, staging schema, import job
  state machine, dedup helper, import route, test fixture hay audit scaffold nào (README/
  `04-current-tasks.md` P5.5-01…04 đều ghi rõ "chưa có import Excel" — xác minh lại trực tiếp bằng
  `grep -rli "xlsx\|staging\|import_job"` trên `member-api/` trước khi viết dòng code đầu tiên,
  đúng bằng chứng thật, không tin mô tả cũ).
- **Nội dung:** Vertical slice đầy đủ mục 9/10:
  `upload → parse → validate → stage → preview → confirm → commit`.
  - Migration `migrations/0002_member_import_staging.sql`: `member_import_jobs`
    (`UPLOADED → READY_FOR_CONFIRM → COMMITTED`, hoặc `→ CANCELLED`/`→ FAILED`) và
    `member_import_job_rows` (`VALID`/`INVALID`/`POSSIBLE_DUPLICATE`/`WARNING` từng dòng, dữ liệu
    chuẩn hoá, lỗi, candidate trùng, `committed_member_id`). `PARSED` không phải trạng thái durable
    riêng — xem P5.5-D11 `03-decisions.md`.
  - `src/importParser.js` (`exceljs`) — không tin Content-Type browser, formula cell chỉ đọc cached
    `result`, header contract cố định (`full_name`/`work_unit_code` bắt buộc, 8 field optional cùng
    tên với CRUD payload), bound 10MB/10.000 dòng.
  - `src/importValidation.js` — tái dùng nguyên constant enum từ `memberValidation.js`.
  - `src/importDedup.js` — soft-match qua `member_immutable_unaccent()` (cùng hàm search đã dùng),
    hai query set-based (existing-member + in-batch), KHÔNG BAO GIỜ tự merge — xem P5.5-D9.
  - `src/importRepository.js` — `confirmImportJob`/`cancelImportJob` transaction atomic + idempotent
    qua `SELECT ... FOR UPDATE` trên job row; confirm re-authorize scope MỚI NHẤT (không tin scope
    lúc upload) — scope co hẹp giữa upload/confirm → toàn bộ commit abort `409 scope_changed`
    (all-or-nothing, không partial-commit).
  - `src/importRoutes.js` — 5 route (`POST /v1/members/import`,
    `GET /v1/members/import/:jobId[/rows]`, `POST /v1/members/import/:jobId/{confirm,cancel}`), match
    TRƯỚC `matchMemberRoute` trong `server.js` (tránh `/v1/members/import` bị nhầm `:id="import"`).
    Chỉ `YOUTH_ADMIN` được import (mục 7/12 — không mở rộng cho `BRANCH_OFFICER` dù role này có
    quyền CRUD từ P5.5-03) — xem P5.5-D10.
  - `organizationDirectory.js` thêm `createOrganizationDirectoryBatch` (một request PostgREST
    `in.()` cho toàn bộ mã tổ chức khác nhau trong file); `scope.js` thêm `isOrgCodeInScope` (biến
    thể không throw).
  - Dependency mới: `exceljs@^4.4.0` (`member-api/package.json`), cộng `overrides.uuid: ^11.1.1` để
    đóng advisory `GHSA-w5hq-g745-h8pq` trong dependency bắc cầu của `exceljs` (0 vulnerabilities sau
    khi override — `npm audit` xác nhận).
- **Không có trong subphase này:** merge/update-existing member từ dòng import (xem P5.5-D9), audit
  table cross-cutting (P5.5-07 — job table tự nó đủ cho acceptance mục 23 của P5.5-05), frontend
  (P5.5-06), `/member-metadata`, mọi thay đổi resolver/scope P5.5-02.
- **Phát hiện + vá trong quá trình viết test (không phải defect P5.5-01…04):** `getImportJob`'s
  `serializeJob` ban đầu không trả `created_by_user_id`, khiến `canAccessImportJob` (dùng để quyết
  định 404 cho job ownership) luôn nhận `undefined` và từ chối CHÍNH người tạo job (trừ khi actor là
  `YOUTH_ADMIN` scope toàn cục — che giấu bug ở path đó). `memberImportRoutes.test.mjs` (test
  ownership isolation + test global-admin-can-view) bắt được lỗi này trước khi mở PR; đã vá bằng
  cách thêm `created_by_user_id` vào output `serializeJob` (P5.5-05 chỉ, không sửa gì P5.5-01…04).
- **Test:** file mới `{importValidation,importDedup,memberImportRoutes,memberImportPerformance}.test.mjs`
  + `tests/helpers/syntheticImportWorkbook.mjs`. **221/221 pass** (`npm test`, PostgreSQL 16 thật cục
  bộ) — 173 baseline P5.5-01…04 không đổi + 48 mới (17 validation/parser + 10 dedup + 20 HTTP route/
  security matrix + 1 performance). Ma trận bảo mật âm tính bao gồm: cross-scope row → `INVALID`
  không bao giờ commit; unknown organization → `INVALID`; chỉ `YOUTH_ADMIN` import
  (`BRANCH_OFFICER` → `403`); malformed workbook → job `FAILED` có thể truy vết; oversized upload →
  `413` trước khi tạo job; double-confirm/concurrent-confirm/retry đều idempotent (đúng 1 record,
  không nhân bản); confirm job đã `CANCELLED` → `409`; cancel idempotent; override
  `POSSIBLE_DUPLICATE` chỉ tạo record MỚI tách biệt, không bao giờ merge; override row không hợp lệ
  → `400`; job ownership isolation (user B → `404` trên mọi sub-route của job user A); global
  `YOUTH_ADMIN` xem được job người khác; unknown job id → `404` mọi sub-route (không `500`); confirm
  re-check scope mới (all-or-nothing khi scope co hẹp). Root `npm test` (153/153), `npm run lint` (0
  error/3 warning cũ), `npm run build` đều PASS, không đổi baseline.
- **Performance (mục 25):** synthetic ~3.000 dòng
  (`tests/helpers/syntheticImportWorkbook.mjs`, KHÔNG phải dữ liệu đoàn viên thật) — upload
  (parse+validate+dedup+stage) ≈280ms, confirm/commit ≈550ms cho ~2.580 dòng, list sau import ≈4ms —
  toàn bộ sâu dưới target. Không cần migration/index mới (index P5.5-01/04 đã đủ cho join shape của
  dedup query).
- **Report:** xem entry `[2026-09-08]` (P5.5-05) trong `docs/brain/06-ai-working-log.md`;
  `member-api/README.md` mục "P5.5-05 — Excel import".
- **Trạng thái:** merged qua PR #43 (merge commit `9f89ba808911d8a7f6c9413436e596b239ffa87c`),
  exact-head CI (`3839b80`) xanh trước merge (`build`/`test-db`/`member-api-test`/Vercel đều
  `success`), owner đã xác nhận merge.

### P5.5-06 — Admin/Member Frontend
- **Base:** `master` sau merge PR #43 (P5.5-05, `9f89ba808911d8a7f6c9413436e596b239ffa87c`). Branch
  `feat/p5-5-06-member-frontend`.
- **Nội dung:**
  - Backend enabler tối thiểu (ngoài scope "frontend-only" nhưng bắt buộc để UI gọi được Member
    API thật qua trình duyệt — xem P5.5-D12): CORS trên Member API
    (`CORS_ALLOWED_ORIGIN` required fail-closed, `member-api/src/server.js` `applyCorsHeaders`
    exact-origin echo, `OPTIONS` preflight `204` không đi qua authorization).
  - `src/services/memberService.js` (mới) — data boundary, factory `createMemberService(client,
    {baseUrl, fetchImpl})`, không đọc `import.meta.env` trong module (testable dưới `node --test`).
    Bọc toàn bộ endpoint P5.5-02…05: `getScope`, `getOrganizationDirectory` (đọc `organizations`
    Supabase, không phải Member API), `listMembers`/`getMember`/`createMember`/`updateMember`/
    `setMemberStatus`, `uploadImport`/`getImportJob`/`listImportJobRows`/`confirmImport`/
    `cancelImport`.
  - `src/lib/memberDisplay.mjs` (mới) — nhãn tiếng Việt + tone màu cho mọi enum, tách biệt khỏi
    service theo đúng convention `documentAdminDisplay.mjs`.
  - `src/components/Guards.jsx` — thêm `MemberManagementGuard`/`getMemberManagementGuardAction`
    (pure function, cùng pattern `getAuthGuardAction`) — KHÔNG dùng `RoleGuard` (bypass
    `SYSTEM_ADMIN`), điều kiện `YOUTH_ADMIN || BRANCH_OFFICER`; `requireImportRole` chỉ
    `YOUTH_ADMIN`. Không sửa `RoleGuard`/`hasRole` hiện có (dùng nguyên cho mọi route khác).
  - `src/pages/{MemberManagement,MemberDetail,MemberImport}.jsx` (mới) — route
    `/quan-ly-doan-vien` (danh sách: search/filter đủ 5 field + sort, pagination "Tải thêm", tạo
    mới), `/quan-ly-doan-vien/:memberId` (chi tiết/sửa/lưu trữ-khôi phục), `/admin/quan-ly-doan-vien/import`
    (upload→preview theo tab row_status→override từng dòng nghi trùng (chỉ CREATE_NEW, không
    merge)→confirm→kết quả). Toàn bộ card-list/form dùng lại class CSS sẵn có
    (`campaign-list`, `campaign-form`, `content-card`/`info-grid`, `confirm-overlay`, `status-*`) —
    không viết CSS mới, không redesign.
  - `src/App.jsx`/`src/components/Layout.jsx` — wire route + nav sidebar mới ("Quản lý đoàn viên"),
    điều kiện hiện nav dùng trực tiếp `roles` (không dùng `hasRole` vì có bypass `SYSTEM_ADMIN`).
- **Quyết định kỹ thuật mới:** P5.5-D12 (CORS exact-origin), P5.5-D13 (không xây `/member-metadata`,
  tái dùng `organizations` + `/v1/member-scope` có sẵn) — xem `03-decisions.md`.
- **Không có trong subphase này:** `/member-metadata` thật, audit/lịch sử thay đổi trên trang chi
  tiết (chưa có audit table — để P5.5-07), export, hard delete UI, merge/update-existing qua import
  UI (khớp P5.5-D9).
- **Test:** `tests/member_service.test.mjs` (12 test — mapping, payload allowlist, lỗi HTTP
  401/403/404/network, `NOT_CONFIGURED`/`AUTHENTICATION_REQUIRED` fail trước khi gọi fetch,
  `error.cause` giữ `import_job_id` cho lỗi malformed workbook), `tests/MemberManagementGuard.test.mjs`
  (8 test — cùng kỹ thuật regex-extract như `AuthGuard.test.mjs`; xác nhận KHÔNG có bypass
  `SYSTEM_ADMIN` ở cả hai chế độ guard). Root `npm test` **173/173 pass** (153 baseline + 20 mới).
  `member-api` **226/226 pass** (221 baseline P5.5-01…05 + 5 CORS test mới). Root `npm run lint`
  0 error (4 warning — 3 cũ + 1 warning "fast refresh" mới cùng loại với `getAuthGuardAction` sẵn
  có, không phải lỗi mới). Root `npm run build` PASS.
- **Giới hạn xác minh runtime:** Không có Supabase project thật hoặc Member API đã deploy trong môi
  trường viết code này, nên KHÔNG thực hiện được đăng nhập thật + click-through trình duyệt trên
  các route mới (`/quan-ly-doan-vien*`) — chỉ xác minh: `vite build` thành công, dev server phục vụ
  đúng shell (`curl` xác nhận HTTP 200 + đúng HTML), lint sạch, toàn bộ unit test pure-logic pass.
  Đây là giới hạn đã biết, khớp đúng pattern "technical acceptance PASS, runtime rehearsal riêng"
  đã dùng xuyên suốt các phase trước (P4-02, P4-04...) — không tự nhận đã kiểm thử UI thật trên
  trình duyệt với dữ liệu thật.
- **Residual gap cần owner xử lý trước production (KHÔNG chặn P5.5-06 technical acceptance, cùng
  nhóm với mục 28.3 kiến trúc):** `vercel.json`'s Content-Security-Policy hiện có
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co` — KHÔNG bao gồm hostname Member
  API thật. Khi Member API được deploy thật (Vibe Host v2, mục 28.3), phải thêm hostname đó vào
  `connect-src` (và `CORS_ALLOWED_ORIGIN` phía Member API phải trỏ đúng origin production của
  frontend) — nếu không, trình duyệt sẽ tự chặn mọi request tới Member API dù CORS/auth đều đúng.
  Không tự bịa hostname vào `vercel.json` trong task này vì Member API production domain chưa được
  quyết định (mục 28.3 "OWNER/DEPLOYMENT DECISION REQUIRED").
- **Report:** xem entry mới nhất trong `docs/brain/06-ai-working-log.md`.
- **Trạng thái:** merged qua PR #44 (merge commit `03e765e234d4b0bc310629e8bda0e7407fa7c966`),
  exact-head CI (`91872e4`) xanh trước merge (`build`/`test-db`/`member-api-test`/Vercel đều
  `success`), owner đã xác nhận merge.

### P5.5-07 — Audit + Backup/Restore readiness
- **Base:** `master` sau merge PR #44 (P5.5-06, `03e765e234d4b0bc310629e8bda0e7407fa7c966`). Branch
  `feat/p5-5-07-member-audit-backup`.
- **Phạm vi:** hai lớp tách biệt theo đúng chỉ dẫn — (A) application audit, (B) infra backup/restore.

**A. APPLICATION AUDIT — hoàn thành.**
- Migration `migrations/0003_member_audit.sql`: `member_audit_logs` (bảng riêng tại Member API,
  KHÔNG dùng chung `audit_logs` Supabase — tránh distributed transaction, đúng mục 16).
- `src/memberAudit.js` (mới): `buildCreateAuditPayload`/`buildUpdateAuditPayload` (pure, chỉ audit
  9 field nghiệp vụ, loại `external_ref_note`), `insertAuditLog` (luôn nhận `client` trong
  transaction đang mở), `listMemberAuditLogs` (đọc phân trang).
- `src/memberRepository.js`: `createMember`/`updateMember` chuyển từ `pool.query` đơn sang
  transaction thật; `updateMember` thêm `SELECT ... FOR UPDATE` trước để lấy `before_data` chính
  xác (cùng scope predicate với UPDATE — không có đường lock nào ngoài scope).
- `src/importRepository.js`: `confirmImportJob` ghi 1 audit row/member được commit (không phải
  1 row/job — mục P5.5-D15), cùng transaction với insert member, có `import_job_id`.
- `src/memberRoutes.js`/`src/server.js`: route mới `GET /v1/members/:id/audit` (cùng scope check
  với GET member thường); `userId` (actor thật từ resolver) giờ được truyền xuống
  `createMember`/`updateMember` qua toàn bộ chuỗi gọi (trước đây KHÔNG được truyền — đây không phải
  bug cũ, P5.5-03 chưa cần actor identity vì chưa có audit).
- **Quyết định kỹ thuật mới:** P5.5-D14 (không có cột `outcome` — row tồn tại = thành công),
  P5.5-D15 (audit granularity: 1 row/member kể cả bulk import) — xem `03-decisions.md`.
- **Sửa fixture test cũ (không phải defect P5.5-01…06, chỉ là cập nhật contract):**
  `createMember`/`updateMember` giờ yêu cầu `actorUserId` (cột UUID `NOT NULL`) — `memberCrud.test.mjs`
  và `importDedup.test.mjs` (gọi repository trực tiếp) thêm wrapper nội bộ cung cấp actor cố định,
  không đổi bất kỳ call site nào trong ~43 test case sẵn có. `memberRoutes.test.mjs`'s
  `authorizerFor` đổi `userId: 'test-user'` (không phải UUID hợp lệ) sang một UUID cố định thật.
- **Test:** `tests/memberAudit.test.mjs` (mới, 11 test) — 1 audit row/mutation thành công, before/
  after đúng field đã đổi, patch chỉ đổi `external_ref_note` → 0 audit row, mutation bị từ chối
  (out-of-scope/not-found) → 0 audit row, mutation rollback giữa chừng (vi phạm CHECK constraint) →
  0 audit row dangling, pagination/ordering, field không audit không leak vào `after_data`. Thêm 3
  test vào `memberRoutes.test.mjs` (endpoint `GET /v1/members/:id/audit`: trail đúng, 404 ngoài
  scope, PATCH bị từ chối không audit) và 3 test vào `memberImportRoutes.test.mjs` (1 audit
  row/member commit có `import_job_id` đúng, confirm lặp không nhân đôi audit, job bị cancel có 0
  audit row). **243/243 pass** (`npm test`, PostgreSQL 16 thật cục bộ) — 226 baseline P5.5-01…06
  không đổi + 17 mới.
- **Performance:** benchmark lại `memberImportPerformance.test.mjs` sau khi thêm audit insert —
  confirm/commit cho ~2.580 member từ ~550ms (P5.5-05) lên ~1.670ms (audit tăng gấp đôi số INSERT
  trong transaction) — vẫn sâu dưới target "dưới vài giây" mục 25, không cần tối ưu thêm.
- **Root validation:** không đổi file frontend nào trong P5.5-07 — `npm run lint`/`npm test`
  (173/173)/`npm run build` chạy lại để xác nhận không ảnh hưởng, đều PASS như trước.

**B. BACKUP/RESTORE HẠ TẦNG — BLOCKED, không có bằng chứng mới.**

Audit lại đúng 5 câu hỏi checklist mục 18 tài liệu kiến trúc:

| # | Câu hỏi | Trả lời |
|---|---|---|
| 1 | Gói Mắt Bão cụ thể đang dùng có automated backup không, tần suất thế nào? | Không có gói nào "đang dùng" — chưa provisioning (đã ghi từ P5.5-01: "CHƯA THỰC HIỆN — hành động mua dịch vụ"). Chỉ có bằng chứng cấp tài liệu vendor (`CAPABILITY_VERIFIED` mức tồn tại tính năng, không phải cấu hình thật). |
| 2 | Có point-in-time recovery hay chỉ snapshot theo lịch? | `NOT VERIFIED` — không đổi từ P5.5-01. |
| 3 | Backup có encrypted at rest không? | `NOT VERIFIED` — không đổi. |
| 4 | Ai có quyền trigger restore, quy trình xác thực yêu cầu restore là gì? | Không thể trả lời — chưa có instance/tài khoản nào để có "quyền" trên đó; đây là chính sách owner/infra phải định nghĩa khi provisioning. |
| 5 | Đã từng test restore thật chưa? | `RESTORE_REHEARSAL_NOT_RUN` — không thể chạy vì không có instance non-production nào tồn tại. |

- **Không có quyền/hạ tầng thật:** agent không có tài khoản Mắt Bão, không có billing access, không
  thể tự provisioning một instance để test. Đây đúng như dự đoán ở P5.5-01 (`docs/phase-5-5/01-member-infrastructure-decision.md`
  mục 15: "Hạ tầng đã provisioned... CHƯA THỰC HIỆN").
- **Không tự ý provisioning** — nằm ngoài phạm vi một agent code, đúng cảnh báo "hành động vận
  hành/mua sắm riêng" đã ghi từ P5.5-01.
- **Blocker cụ thể owner/infra cần cung cấp trước khi P5.5-07 phần B (và P5.5-09 sau này) PASS:**
  1. Quyết định + thực hiện provisioning Mắt Bão Vibe Host v2 (hoặc phương án khác nếu đổi ý) —
     mua gói, tạo app instance, tạo PostgreSQL database, lấy connection string.
  2. Xác nhận cấu hình backup thật trên instance đó: tần suất, retention (đề xuất tối thiểu 30 ngày
     rolling — mục 18), có PITR hay chỉ snapshot.
  3. Xác nhận backup có encrypted at rest.
  4. Định nghĩa chính sách "ai được trigger restore" + quy trình xác thực yêu cầu.
  5. Cho phép một `AUTHENTICATED_EXTERNAL_OPERATOR` (hoặc tương đương) chạy restore rehearsal thật
     trên một instance non-production, dùng dữ liệu synthetic — theo đúng mô hình runtime rehearsal
     đã dùng ở Phase 3/4 (`P3-08A`/`P4-02R` là tiền lệ).
  6. Domain/TLS cho Member API (mục 28.3) — cùng nhóm quyết định, ảnh hưởng cả `CORS_ALLOWED_ORIGIN`
     (P5.5-D12) và CSP `connect-src` của `vercel.json` (đã ghi ở entry P5.5-06).
- **Không tuyên bố PASS cho phần B** — verdict cuối P5.5-07 phản ánh đúng: phần A (application
  audit) PASS, phần B (infra) BLOCKED chờ owner/infra.
- **Report:** xem entry mới nhất trong `docs/brain/06-ai-working-log.md`;
  `member-api/README.md` mục "P5.5-07 — Application audit" + "Backup / restore — infrastructure
  audit".

### P5.5-07R — Pre-Runtime Product Closure
- **Base:** `master@02a49f08419ae0e5545e95b9e4b5a2bf2f2c164d` (sau merge PR #45, P5.5-07). Branch
  `feat/p5-5-07r-pre-runtime-closure`.
- **Phạm vi:** đóng các gap code/local còn có thể đóng trước khi Astra chạy P5.5-08, Mắt Bão được
  provision, và P5.5-09 runtime rehearsal có thể chạy — KHÔNG phải P5.5-08/09/10, KHÔNG tuyên bố
  Security Acceptance hay Runtime Readiness PASS.
- **Nội dung:**
  - Đóng gap frontend audit history: `src/services/memberService.js` thêm
    `getMemberAuditHistory`/`mapAuditLog` (allowlist trước/sau field, không lộ field ngoài danh sách
    9 field nghiệp vụ, không invent tên actor từ UUID); `src/lib/memberDisplay.mjs` thêm
    `AUDIT_ACTION_LABELS`/`AUDIT_FIELD_LABELS`/`describeAuditEntry`; `src/pages/MemberDetail.jsx`
    thêm section "Lịch sử thay đổi" với loading/empty/error+retry/pagination độc lập với phần thông
    tin Member chính (lỗi audit không làm mất phần thông tin chính).
  - Security regression mới: `member-api/tests/memberAuditIntegrity.test.mjs` (16 test) — chứng
    minh client không thể forge `before_data`/`after_data`/`actor_user_id`/`audit_id`/
    `import_job_id`/nested `audit` object (bị `unknown_field`/`protected_field` chặn ở
    `memberValidation.js` sẵn có), actor luôn từ resolver, rejected/out-of-scope operation không
    sinh audit row, và rollback (audit INSERT giả lập lỗi) không để lại mutation hay audit dangling.
    **Không sửa architecture/implementation** — toàn bộ test PASS trên implementation P5.5-07 hiện
    có, xác nhận đã đúng từ đầu.
  - CORS hardening regression mới trong `member-api/tests/server.test.mjs` (+9 test): trailing
    slash, prefix/suffix trick, `Origin: null`, thiếu Origin, case-sensitivity, không bao giờ `*`,
    bearer token không lộ qua response header khi Origin không khớp. Production hostname vẫn
    `RUNTIME_PENDING` — không tự bịa domain.
  - Import edge-case regression mới: `member-api/tests/importValidation.test.mjs` (+5 test: nhiều
    sheet chỉ đọc sheet đầu, hidden row vẫn được đọc, hidden sheet đầu vẫn được đọc, cell quá khổ
    không crash parser, NFC/NFD Unicode giữ nguyên byte); `member-api/tests/importDedup.test.mjs`
    (+1 test: soft-match nhận diện đúng dù tên NFC vs NFD khác byte). Đã có sẵn từ P5.5-05: malformed
    workbook, oversized upload, duplicate header, formula cell, concurrent confirm, retry sau
    confirm, stale scope — không làm lại.
  - Data-plane isolation regression mới: `tests/member_data_plane_isolation.test.mjs` (8 test, static
    source-scan) — xác nhận Member code (frontend + `member-api/`) không tham chiếu Gemini/RAG/
    embeddings/`document_chunks`/localStorage/IndexedDB/email-provider/analytics, và các Edge
    Function AI (`ask-ai`, `generate-knowledge-article`, `process-document`, `run-ingestion-jobs`)
    không tham chiếu bảng/biến môi trường Member Record.
  - Deployment readiness: `member-api/package.json` thêm `engines.node >=20.0.0`. `/healthz`,
    `/readyz`, graceful shutdown (`SIGTERM`/`SIGINT`), `npm run migrate` (forward-only, tracked) đã
    có sẵn từ trước — không làm lại. **Không tạo `Dockerfile`** — cơ chế build của Vibe Host v2
    (Dockerfile vs buildpack) chưa xác minh được từ tài liệu chính thức; xem
    `docs/phase-5-5/02-member-api-deployment-runbook.md` mục 1.
  - `docs/phase-5-5/02-member-api-deployment-runbook.md` (mới) — runbook provider-neutral: env var
    contract (secret vs public), DB provisioning + migration, CORS/CSP/domain wiring, readiness
    contract, graceful shutdown, smoke test, rollback, backup/restore rehearsal pointer.
  - `member-api/scripts/backup-restore-rehearsal.mjs` (mới) — harness chuẩn bị rehearsal
    backup/restore (seed/mutate/verify/cleanup marker + checksum). Chỉ chạy khi có
    `--confirm-non-production` tường minh; đọc connection string CHỈ từ `MEMBER_DATABASE_URL`; không
    chứa credential; không tự động trigger backup/restore thật (không có quyền truy cập Mắt Bão) —
    hai bước đó vẫn là thao tác thủ công của operator. Đã smoke-test cục bộ (seed→mutate→verify đúng
    kỳ vọng báo MISMATCH khi chưa có restore thật xảy ra → chứng minh script phát hiện đúng, không
    tự động PASS giả). Restore thật vẫn `BLOCKED_PENDING_INFRA`.
  - **Local browser acceptance: BLOCKED (đúng thực tế, không invent PASS).** Docker daemon không thể
    khởi động trong sandbox này (`ulimit: Operation not permitted` khi start `dockerd`) → Supabase
    local (`supabase start`, phụ thuộc Docker) không chạy được → không thể đăng nhập Supabase Auth
    thật để rehearsal 15-bước journey (login → CRUD → import → audit → unauthorized actor) trên
    trình duyệt. Không có ảnh chụp màn hình nào được tạo (tránh mọi ảnh hưởng "đã kiểm thử UI"
    không đúng thực tế). Việc này không thay thế P5.5-09 hosted rehearsal — vẫn `BLOCKED` như trước.
  - Repository governance audit: `mcp__github__list_branches` xác nhận **không có branch nào bật
    protection** (`protected: false` trên toàn bộ branch kiểm tra được, gồm cả các branch
    `feat/p5-5-*` đã merge) — khuyến nghị owner bật branch protection cho `master` (require PR,
    require CI checks, prevent force-push/deletion) khi sẵn sàng; **không tự thay đổi GitHub
    settings** (ngoài phạm vi P5.5 application, cần owner quyết định).
- **Không có trong subphase này:** P5.5-08 (Security Acceptance — Astra), P5.5-09 (Runtime
  Rehearsal), P5.5-10 (End-to-End Closure), Phase 6.
- **Test:** xem entry `[YYYY-MM-DD]` P5.5-07R trong `docs/brain/06-ai-working-log.md` cho số liệu
  chính xác `npm test`/`npm run lint`/`npm run build` (root + `member-api`).
- **Verdict:** xem entry working log — luôn giữ riêng `ASTRA_SECURITY_ACCEPTANCE_PENDING` và
  `HOSTED_RUNTIME_AND_RESTORE_PENDING`, không dùng các chuỗi verdict Phase 5.5 tổng thể
  (`PHASE_5_5_SECURITY_ACCEPTANCE_PASS`/`PHASE_5_5_RUNTIME_READINESS_PASS`/
  `PHASE_5_5_END_TO_END_ACCEPTANCE_PASS`).

### Phase 5 end-to-end closure
- **Base:** isolated closure worktree/branch `codex/phase-5-full-closure`, based on P5-03 plus the
  forward-only trigger-function privilege fix `ff72ccd`.
- **Trạng thái:** `PHASE_5_END_TO_END_ACCEPTANCE_PASS`. Rehearsal-only runtime closed on namespace
  `P5_ACCEPTANCE_56e868dbbee4457e`: generation v8 and `ask-ai` v7 are ACTIVE with JWT verification;
  extraction, generation, review, retrieval, grounded/cited Ask AI, insufficient-evidence,
  cross-org isolation and post-cleanup negative checks passed. Production was not accessed.
- **Runtime guard/history:** Before the final run, an aggregate fixture audit found five
  synthetic documents/versions/sources, nine jobs, seventeen append-only events, and five temporary
  Auth users from historical attempts. The only `_cleanup()` function is pgTAP internal cleanup,
  not a supported fixture-purge contract. Provenance, version, and event immutability make a new
  full run unsafe without accumulating non-removable residue; the R3 retention contract now permits
  bounded, non-retrievable immutable history. The first R3 run still returned generic
  `GENERATION_FAILED`; Postgres identified an unsupported model evidence label violating
  `document_chunks_evidence_kind_check`. The targeted normalization fix was deployed as v8 and
  exact-head CI `33587311565` passed. Owner-reported generation model `models/gemini-3.6-flash`
  remains independently unverified because secret values and hosted model selection are not
  exposed; direct synthetic smoke on that model returned HTTP 200 under the 35-second timeout.
- **Historical model diagnostic:** `gemini-3.7-flash` returned HTTP 503 while
  `gemini-3.6-flash` returned HTTP 200, a model-specific capacity signal. The owner later reported
  3.6 configured, but the hosted resolved model remains unverified; this does not bypass the
  cleanup-contract gate.
- **Report:** `docs/phase-5/13-phase-5-end-to-end-closure.md`.

### P5-03 — Canonical document extraction → knowledge article generation
- **Base:** exact `origin/master@a91f7145a76507e171bb9e96a9a7262ed6575aaf`; isolated branch
  `feat/phase-5-03-article-generation`.
- **Trạng thái:** Đang triển khai vertical slice deterministic extraction → structured AI draft →
  selective evidence → trusted human review. Không làm embedding, retrieval, ask-ai hoặc OCR.
- **Runtime gates:** Gemini/Google Drive rehearsal là gate riêng; technical tests dùng synthetic
  fixtures/provider fake và phải không cần credential thật.

### P5-R0 — Consolidate Phase 5 Canonical Baseline
- **Base:** exact `origin/master@343547cb5a81d5e1e69cea26a6a232c990e8c92b`; isolated branch
  `feat/phase-5-canonical-baseline`.
- **Trạng thái:** `P5_R0_CANONICAL_BASELINE_MERGED_AND_CLOSED`; canonical source/version →
  `knowledge_articles` → selective evidence → optional embeddings, ingestion queue và provider-neutral
  Drive boundary. Không dùng `knowledge_wikis`; không bắt đầu P5-03 trong closure này.
- **Closure:** PR #34 merged bằng merge commit `f2b60de9b86532a3a26b48549be71a19b5851f17`;
  merged-master CI `32744476634` PASS trên exact merge commit. PR #31/#32/#33 đã đóng với lý do
  `SUPERSEDED_BY_P5_R0_PR_34`; branch và checkpoint lịch sử vẫn được giữ.
- **Historical work:** #31/#32/#33 được audit theo KEEP/ADAPT/REWRITE/DROP; P5-02R dirty docs đã
  được bảo toàn trên branch riêng bằng checkpoint `8d37f5c`, không dùng làm P5-R0 acceptance.
- **Technical evidence:** Exact-head CI `32743048493` trên implementation HEAD
  `c464926778afaedb7a831cdbe8dd05aa625710f3` PASS; pgTAP `Files=26, Tests=772`, Phase 5 `45/45`,
  Deno `58 passed`, frontend lint/test/build PASS.
- **Runtime gate:** Google OAuth/Drive rehearsal chưa chạy; cần environment rehearsal đã sync
  canonical schema, Vault/secret và cron contract trước khi claim runtime pass.
- **P5-03:** Chỉ được branch từ final `origin/master` sau closure; không branch từ PR #34/#31/#32/#33.
- **Report:** `docs/phase-5/11-p5-r0-canonical-baseline.md`.

### P4-R — Phase 4 Runtime Readiness Closure
- **Base:** fresh `origin/master@72b627a9c407f304f3bd3453fb0a00797fc7239b` (P4-06 merge).
- **Branch:** `rehearsal/phase-4-runtime-readiness`.
- **Trạng thái:** `PHASE_4_RUNTIME_GATES_PASSED`. P4-02R và P4-04R2 cả hai đã PASS bằng actor thật
  qua HTTP thật trên project rehearsal `znexculhbdjiflkczpyu`. Không phải production-ready — xem
  `docs/phase-4/07-runtime-readiness-closure.md`.
- **Report:** `docs/phase-4/07-runtime-readiness-closure.md`.

## Đã hoàn thành gần đây

### P4-06 — Phase 4 Integrated Final Acceptance (merged)
- **Base:** fresh `origin/master@3761dcc1be4fd6aebc1e91e78426076feead5e31`, merge of P4-05 PR #27.
- **Trạng thái:** `PHASE_4_TECHNICAL_ACCEPTANCE_PASS_RUNTIME_GATES_PENDING` tại thời điểm merge.
  PR #28 merged vào `master@72b627a9c407f304f3bd3453fb0a00797fc7239b`, exact-head CI `31961352441`
  PASS. P4-02R/P4-04R2 sau đó đã đóng bởi P4-R (xem trên).
- **Report:** `docs/phase-4/06-phase-4-final-acceptance.md`.

### P4-05 — Learning & Quiz Admin Workflow (merged)
- **Base:** P4-04 merge commit `3ddfeaede1b7a22acb36c34d3847a394a7cb2f1d`; branch
  `feat/phase-4-learning-quiz-admin`.
- **Trạng thái:** `P4_05_TECHNICAL_ACCEPTANCE_PASS`; PR #27 đã merge vào
  `master@3761dcc1be4fd6aebc1e91e78426076feead5e31` after exact-head CI `31959883659` PASS on
  `1706f064980ffe73150a71649b91d66807d25f71`. Scope is topic/resource/quiz admin workflow,
  trusted RPC/read model, publication validation, historical-attempt protection, audit, pgTAP,
  and frontend gates.
- **Routes:** `/admin/chuyen-de`, `/admin/chuyen-de/:topicId`,
  `/admin/chuyen-de/:topicId/trac-nghiem/:quizId`.

### P4-04R2 — Quiz two-session concurrency rehearsal (PASS)
- **Trạng thái:** **PASS** — real two-session concurrency đã chạy (1 lần + 10 vòng stress + edge
  case max_attempts), không duplicate attempt, không bypass max_attempts. Chi tiết:
  `docs/phase-4/07-runtime-readiness-closure.md`.

### P4-04 — Quiz Engine & Attempts (merged)
- **Base/merge:** P4-03 `master@6b1960a`; merged via PR #26 at
  `master@3ddfeaede1b7a22acb36c34d3847a394a7cb2f1d`.
- **Trạng thái:** `P4_04_TECHNICAL_ACCEPTANCE_PASS_CONCURRENCY_REHEARSAL_PENDING`; exact HEAD CI
  run `31956104175` PASS (build, test-db/full pgTAP+Deno, Vercel). P4-04R2 remains PENDING.
- **Phát hiện chính:** năm bảng Quiz đã tồn tại từ initial schema. Hai defect thật là quiz/question
  đọc không xét visibility của topic cha và `authenticated` có đường INSERT/UPDATE attempt để tự
  ghi score/passed. `is_correct` đã được bảo vệ bởi RLS, nhưng P4-04 giữ defense-in-depth bằng
  safe RPC payload không chọn answer key.
- **Phạm vi:** migration `202608160004` đóng direct attempt writes, thay read policy bằng parent-topic
  access, trusted start/resume/submit/result RPC; `202608160005` forward-fix concurrency resume và
  malformed payload; pgTAP A–Z; `quizService`; route `/tri-thuc/trac-nghiem/:quizId`; intro/attempt/result
  UI và link từ topic detail.
- **Giới hạn:** Không AI/RAG, không leaderboard/gamification, không Production. Chi tiết:
  `docs/phase-4/04-quiz-engine-attempts.md`.

### P4-02R — Documents Storage Actor-Based Runtime Rehearsal (PASS)
- **Trạng thái:** **PASS** — actor thật (admin/member 2 org + suspended) qua HTTP thật, scenario
  A-I đều chạy trên project rehearsal. Chi tiết: `docs/phase-4/07-runtime-readiness-closure.md`.
- **Vì sao tồn tại:** P4-02 đã verify runtime được schema parity, bucket private, policy predicate
  và fail-closed path; nhưng **không** chạy được kịch bản theo actor thật vì tạo
  `auth.users`/`profiles`/`user_roles` trong project live bị permission control của môi trường chặn
  (không lách). Cần chứng minh: upload byte thật, attach, signed URL tải được thật, từ chối
  cross-scope/DRAFT, chặn extension/size, publish/withdraw đổi quyền tức thì, và cleanup.
- **Yêu cầu:** chỉ non-production, chỉ dữ liệu tổng hợp, không secret trong repo/log.
  Chi tiết: `docs/phase-4/02R-documents-storage-runtime-rehearsal.md`.

## Đã hoàn thành gần đây

### P4-03 — Learning Topics & Resources Foundation (merged)
- **Base/merge:** `master@6b1960a` via PR #25; parent-topic visibility and organization scoping are
  now the canonical access model for Quiz.
- **Validation:** CI acceptance was recorded before this branch was created; P4-02R remains open.

### P4-02 — Documents Admin Workflow & Storage Write Authorization (merged)
- **Base:** `master@4488755` (P4-01 merged qua PR #23).
- **Trạng thái:** `P4_02_TECHNICAL_ACCEPTANCE_PASS_RUNTIME_REHEARSAL_PENDING` — **merged** qua
  PR #24. Nghĩa là: repo implementation được chấp nhận; rehearsal runtime theo actor vẫn mở
  (P4-02R); **chưa phải production-ready**.
- **Phạm vi:** đóng 2 gap của P4-01. (1) Mở đúng mức tối thiểu quyền ghi Storage cho
  `documents-private` — trước đó bucket **không có policy INSERT/UPDATE/DELETE nào**, nên không
  phiên đăng nhập nào upload được tệp gốc; (2) dựng admin UI `/admin/van-ban`.
  Migration `202608160002`: INSERT policy (chỉ admin của đúng document đó, dưới `{id}/source/`),
  DELETE policy chỉ để bù trừ + chặn xóa tệp đang gắn (`storage_path is distinct from name`),
  **không có UPDATE policy** (không ghi đè tại chỗ), admin SELECT để duyệt DRAFT trước khi phát
  hành, `detach_document_source_file` (xóa con trỏ trước, bytes sau), `get_admin_documents`.
- **Giới hạn:** rehearsal runtime chỉ chạy được phần schema/policy/fail-closed path; các kịch bản
  cần tạo user test (A–D, F–I) bị chặn bởi permission control của môi trường, **không giả lập**.
  Chi tiết: `docs/phase-4/02-documents-admin-storage-rehearsal.md`.

### P4-01 — Documents Foundation (merged)
- **Base:** `master@814b824` (P3-09 merged qua PR #22 — Phase 3 đã đóng).
- **Trạng thái:** `P4_01_DOCUMENTS_FOUNDATION_PASS` → **merged** vào `master@4488755` qua PR #23
  (CI xanh trên đúng HEAD `3014b9c`, run `31920030948`).
- **Phạm vi:** vertical slice thật cho phân hệ Văn bản: constraint + RLS cho
  `documents`/`document_relations`, đóng grant ghi trực tiếp, vá policy Storage
  `documents-private` (dùng `uuid_or_null` để fail closed), 5 RPC admin có validate transition +
  audit, `src/services/documentService.js`, route `/tri-thuc/van-ban` và
  `/tri-thuc/van-ban/:documentId`, thay mock bằng dữ liệu Supabase thật.
- **Quan trọng:** schema `documents` **đã tồn tại** từ `202607300001` + `202607300003` (đủ field,
  đủ 7 status, đã có `can_access_document`, bucket `documents-private`). P4-01 **không** dựng lại
  model — chỉ đóng gap. Xem `docs/phase-4/00-baseline-documents-plan.md`.
- **Giới hạn:** Không AI/RAG, không embedding, không `document_chunks` processing, không
  Learning/Quiz, không admin UI, không deploy production. Chi tiết:
  `docs/phase-4/01-documents-foundation.md`.

### P3-09 — Phase 3 Final Acceptance & Production Readiness Audit (merged)
- **Trạng thái:** `P3_09_PHASE_3_TECHNICAL_ACCEPTANCE_PASS` → **merged** vào `master@814b824` qua
  PR #22 (CI xanh trên đúng HEAD `b5418e9`, run `31916185019`). Phase 3 đóng về mặt kỹ thuật;
  production **chưa** được phép deploy. Ma trận production-readiness và các blocker còn lại:
  `docs/phase-3/09-phase-3-final-acceptance.md`.

### P3-08 — Email Worker Scheduling & End-to-End Delivery Rehearsal (merged)
- **Trạng thái:** `P3_08_FINAL_ACCEPTANCE_READY_FOR_MERGE` → **merged** vào `master` qua PR #21
  (`ae679da`, 2026-08-15). Repository implementation, scheduler migration, P3-R1 safety gate, full
  diff và secret audit do Codex tự kiểm chứng; P3-08A (OFF) do `AUTHENTICATED_EXTERNAL_OPERATOR`
  thực hiện và `OWNER_ACCEPTED`; P3-08B (ALLOWLIST một người nhận) do
  `AUTHENTICATED_EXTERNAL_OPERATOR` thực hiện, có đúng một provider send và `OWNER_CONFIRMED`
  inbox receipt. Lần gọi thứ hai gửi `0`; trạng thái delivery cuối là `OFF`. Production không bị
  thay đổi. Chi tiết/provenance: `docs/phase-3/08-email-worker-scheduling.md`.
- **Phạm vi:** một `pg_cron` job `email_queue_worker` (mỗi 10 phút) gọi `process-email-queue`
  qua `pg_net`/`net.http_post`, xác thực bằng `x-cron-secret` (không đổi, P3-03), URL và secret
  đọc từ Supabase Vault tại thời điểm chạy (không có literal secret trong migration). Không đổi
  `EMAIL_DELIVERY_MODE`, không thêm worker/queue thứ hai, không bật `LIVE`.

### Phase 3 Stack Consolidation through P3-05 (PASS)
- **Master:** `2a68f20` — merged integration PR #17 from `integrate/phase-3-through-p3-05`.
- **Trạng thái:** P3-00 → P3-05 đã nằm trên `master`; final merged-master CI `31783521687` xanh.
- **Validation:** frontend 45/45, lint 0 errors/3 existing warnings, build PASS, 21 migrations,
  16 pgTAP suites, Deno 37/37 PASS.

---

## Chờ làm (backlog)

### Nối Supabase thay mock cho 5 khu vực chính
- **Mô tả:** Home/Work/Knowledge/Innovation/Profile hiện đọc `src/data/mock.js`. Viết tầng service
  (theo `docs/01-product-spec.md` mục 14.1: `reportService`, `documentService`, `aiService`,
  `innovationService`) gọi bảng/RPC/Edge Function.
- **Liên quan:** `src/pages/*`, `src/data/mock.js`, `src/services/`.
- **Ưu tiên:** Cao (chặn production).

### Dựng Supabase dev/rehearsal + chạy migration/RLS
- **Mô tả:** Tạo project Supabase, chạy 4 migration, tạo bucket/secret/cron, chạy
  `supabase/tests/rls_acceptance.sql`.
- **Liên quan:** `supabase/`.
- **Ưu tiên:** Cao.

### Hoàn thiện Edge Functions còn khung
- **Mô tả:** Rà soát và hoàn thiện `ask-ai`, `process-document`, email queue, export/ZIP, bài toán
  đổi mới theo spec mục 11.
- **Liên quan:** `supabase/functions/*`.
- **Ưu tiên:** Trung bình (sau luồng báo cáo).

### Phase 3 — Done: P3-06 Final Acceptance & Merge PR #20
- **Mô tả:** P3-06 technical CI và P3-07B live scheduler rehearsal đã PASS; PR #20 đã **merged**
  vào `master@63d1b7a`.
- **Báo cáo:** `docs/phase-3/06-cron-overdue-automation.md`,
  `docs/phase-3/07-live-cron-rehearsal.md`.

### Phase 3 — Done: P3-08 Final Acceptance & Merge PR #21
- **Mô tả:** P3-08 email worker scheduling technical CI, P3-08A (OFF) và P3-08B (ALLOWLIST) live
  rehearsal đã PASS; PR #21 đã **merged** vào `master@ae679da`. P3-09 (xem "Đang làm" ở trên) là
  task hiện tại — final audit/closure cho toàn bộ Phase 3, không phải task tính năng.
- **Báo cáo:** `docs/phase-3/08-email-worker-scheduling.md`,
  `docs/phase-3/09-phase-3-final-acceptance.md` (khi hoàn thành).

---

## Không làm lúc này

- Đoàn phí, chuyển sinh hoạt, hồ sơ đoàn viên đầy đủ, xếp loại tự động — ngoài scope bản đầu.
  **[2026-09-04 cập nhật]** Quyết định này vẫn đúng cho đúng phạm vi nó mô tả (complete personnel
  dossier: đoàn phí, workflow chuyển sinh hoạt, xếp loại tự động, kỷ luật/lịch sử cán bộ). Owner đã
  chủ động đưa một **lightweight Member Management** (danh sách đoàn viên tối thiểu) vào Phase 5.5 —
  đây là deliberate scope change, không phải lỗi tài liệu. Xem `docs/brain/03-decisions.md`
  (P5.5-D0) và `docs/phase-5-5/00-member-management-architecture.md` mục 1.
- Mạng xã hội nội bộ, nhắn tin riêng, bình luận công khai — ngoài scope.
- Tích hợp dữ liệu bí mật nhà nước / nghiệp vụ nhạy cảm — chưa có hạ tầng/quy trình được phép.
- Mở đăng ký tài khoản tự do — tài khoản do quản trị viên tạo/nhập.

---

## Đã hoàn thành gần đây

- [2026-08-14] P3-06: Cron & Overdue Automation merged via PR #20 (`63d1b7a`). `P3_06_PASS`; CI
  run `31811349804` xanh (pgTAP `Files=18, Tests=450`, Deno `42 passed`, frontend 45/45 + lint +
  build); P3-07B live rehearsal PASS trên project tách biệt. Xem
  `docs/phase-3/06-cron-overdue-automation.md`, `docs/phase-3/07-live-cron-rehearsal.md`.
- [2026-08-14] P3-R1: Email delivery safety gate & reminder cycle fix merged via PR #19 (`5665dc4`).
- [2026-08-11] P3-01: Notification Foundation PASS; CI 31491748132 xanh với migration reset, 267 pgTAP, Edge Function và frontend gates.

- [2026-09-01] Phase 5 rehearsal đã đồng bộ tới exact HEAD `1cdc3d51d35d86338aacd8c88d138006dd3ad1d5`
  trên project `znexculhbdjiflkczpyu`; đã deploy `ask-ai`, `process-document`,
  `generate-knowledge-article`. Runtime actor/Ask AI/pilot vẫn bị chặn bởi thiếu API invoke/Auth
  trong connector: `PHASE_5_RUNTIME_BLOCKED_ACTOR_INVOCATION_TOOL_UNAVAILABLE`. Không truy cập Production;
  không mở Phase 6.

- [2026-09-01] Đã thêm harness `scripts/phase5-runtime-acceptance.mjs` và command
  `npm run test:phase5:runtime`; harness chỉ cho phép rehearsal, dùng user JWT thật và cleanup trong
  `finally`. Local execution chưa có public/admin env nên dừng tại
  `PHASE_5_RUNTIME_BLOCKED_REHEARSAL_PUBLIC_CONFIG_REQUIRED`; không tạo dữ liệu rehearsal.

- [2026-08-14] Phase 3 Stack Consolidation: P3-00 → P3-05 merged to `master` via PR #17 at `2a68f20`; CI `31783521687` PASS.

- [2026-08-11] P2-15: `Phase 2 — Công việc & Báo cáo: TECHNICAL ACCEPTANCE COMPLETE`; P1 direct RPC bypass đã đóng, integrated vertical slice + ma trận A–G PASS; CI `31411605381` PASS (40 frontend, 236 pgTAP, 16 Deno).
- [2026-08-11] P3-00: baseline/rehearsal audit PASS; merged Phase 2 baseline `0ecc3a9` xác nhận, Phase 3 được chia task và chưa triển khai production code.
- [2026-08-10] P2-14: export CSV scoped và bundle ZIP latest submission, giới hạn/metadata fail-closed, audit và nút tải dashboard; baseline CI `31409496394` PASS.
- [2026-08-10] P2-12: route `/admin/bao-cao`, service quản trị campaign, template private và publish assignment qua RPC.
- [2026-08-10] P2-13: dashboard báo cáo scoped server-side, aggregate trạng thái/completion, filter/search và deep link assignment.

- [2026-08-09] P2-07: report service layer + behavior tests; không migration, không thay UI.
- [2026-08-09] P2-08: report assignment list/detail UI, real status filters, RLS-backed detail and private template download.
- [2026-08-09] P2-09: upload/submit UI, safe staged-object cleanup policy, assignment notification route fix.
- [2026-08-09] P2-10: review transition atomicity, scope/state/reason guards, notification route và review controls tối thiểu.
- [2026-08] Phase 2 docs: audit baseline/gap + state machine & bất biến bảo mật báo cáo.
- [~2026-08] Phase 1: khắc phục bảo mật auth, `requireUser` Supabase Auth thuần, vá npm audit (PR #1).
- [2026-07-30] Dựng frontend 5 khu vực + PWA shell + dữ liệu demo; schema/RLS/RPC + khung Edge
  Functions; unit test nền tảng 3/3 pass.

## P3-05 completed handoff

- Cumulative P3-05 acceptance HEAD: `df7b9d0`; integrated on `master` by PR #17 merge commit `2a68f20`.
- Final merged-master CI `31783521687` passed all repository gates; no production deployment or
  new live email was performed.
- Scope: policy-driven report reminders with mandatory in-app notification and secondary email queue.
  Cron, persisted overdue transition and live email remain explicitly deferred to P3-06/rehearsal.
# P3-02 - Email Queue State Machine and Concurrency Safety

- Branch: feat/phase-3b-email-queue-safety, stacked on P3-01 acceptance HEAD b445045;
  P3-01 Draft PR #12 was not merged when this task started.
- Status: PASS technical acceptance; migration, trusted enqueue, claim/retry/reclaim, pgTAP
  and integration concurrency coverage are complete. Provider/cron/reminder remain disabled.
- Gate: CI run 31494989851 passed migration reset, 13 pgTAP files / 279 tests, Deno
  check/tests and frontend gates. Handoff recommendation: P3-03 provider integration.
# P3-03 - Email Provider Integration and Safe Template Rendering

- Branch: feat/phase-3c-email-provider, stacked on P3-02 final acceptance HEAD f3afaeb;
  P3-02 Draft PR #13 was not merged when this task started.
- Status: PASS technical and live acceptance. Resend adapter, safe SYSTEM_EMAIL_TEST
  renderer and queue-claim worker are complete; report hooks, reminders, cron and production
  deploy are not in scope.
- Verification: GitHub Actions run 31498548925 PASS; migration reset + 14 pgTAP files / 292
  assertions (279 P3-02 baseline + 13 P3-03 assertions), Deno check/tests (30 passed), and
  frontend lint/test/build all passed. P3-03R live evidence is recorded below.

# P3-03R - Live Email Rehearsal Acceptance

- Branch: feat/phase-3c-email-provider; Draft PR #14 remains open and is not merged.
- Status: PASS.
- Verdict: `P3_03_FULL_ACCEPTANCE_PASS`.
- Supabase rehearsal project: `znexculhbdjiflkczpyu`; production used: NO.
- Evidence: normal event SENT at attempt 1 with Resend HTTP 200, provider message ID,
  cleared claim and confirmed controlled inbox receipt; second invocation claimed 0/sent 0.
  Safe-render fixture also SENT with escaped XSS payload. Renderer tests 4/4 PASS, frontend
  tests 45/45 PASS, build PASS, lint 0 errors, and secret leak audit NO.
- The failed `/` fixture remains terminal FAILED as fail-closed rendering evidence and was
  not edited or deleted. No production code, cron, report hooks or P3-04 work was started.
- Full report: `docs/phase-3/03r-live-email-rehearsal.md`.
- Next recommended task: P3-04 Report Event Email Hooks (recommendation only).
