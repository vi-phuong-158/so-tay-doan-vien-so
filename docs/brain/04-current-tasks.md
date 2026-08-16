# 04 — Current Tasks

> Cập nhật mỗi khi bắt đầu hoặc hoàn thành task. Agent đọc đây để biết được phép làm gì.
> Trạng thái triển khai chi tiết: `docs/04-implementation-status.md`; kế hoạch phase: `docs/phase-2/`.

---

## Đang làm

### P4-04 — Quiz Engine & Attempts
- **Base:** `master@6b1960a` — P4-03 merged qua PR #25; branch `feat/phase-4-quiz-engine`.
- **Trạng thái:** đang hoàn thiện technical acceptance; PR chưa mở/push trong takeover này.
- **Phát hiện chính:** năm bảng Quiz đã tồn tại từ initial schema. Hai defect thật là quiz/question
  đọc không xét visibility của topic cha và `authenticated` có đường INSERT/UPDATE attempt để tự
  ghi score/passed. `is_correct` đã được bảo vệ bởi RLS, nhưng P4-04 giữ defense-in-depth bằng
  safe RPC payload không chọn answer key.
- **Phạm vi:** migration `202608160004` đóng direct attempt writes, thay read policy bằng parent-topic
  access, trusted start/resume/submit/result RPC; `202608160005` forward-fix concurrency resume và
  malformed payload; pgTAP A–Z; `quizService`; route `/tri-thuc/trac-nghiem/:quizId`; intro/attempt/result
  UI và link từ topic detail.
- **Giới hạn:** Không admin authoring UI lớn, không AI/RAG, không leaderboard/gamification, không
  Production. P4-02R vẫn PENDING. Chi tiết: `docs/phase-4/04-quiz-engine-attempts.md`.

### P4-02R — Documents Storage Actor-Based Runtime Rehearsal (PENDING)
- **Trạng thái:** **PENDING** — chưa bắt đầu. Đây là **cổng production-readiness**, **không chặn**
  P4-03 hay các task Phase 4 sau.
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
