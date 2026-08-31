# 06 — AI Working Log

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
