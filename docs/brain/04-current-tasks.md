# 04 — Current Tasks

> Cập nhật mỗi khi bắt đầu hoặc hoàn thành task. Agent đọc đây để biết được phép làm gì.
> Trạng thái triển khai chi tiết: `docs/04-implementation-status.md`; kế hoạch phase: `docs/phase-2/`.

---

## Đang làm

### P3-08 — Email Worker Scheduling & End-to-End Delivery Rehearsal
- **Base:** `master@63d1b7a` (P3-06 merged via PR #20, confirmed clean baseline).
- **Branch:** `claude/phase-3-email-worker-scheduling-825108`.
- **Trạng thái:** `P3_08_FINAL_ACCEPTANCE_READY_FOR_MERGE`. Repository implementation,
  scheduler migration, P3-R1 safety gate, full diff và secret audit do Codex tự kiểm chứng;
  P3-08A (OFF) do `AUTHENTICATED_EXTERNAL_OPERATOR` thực hiện và `OWNER_ACCEPTED`; P3-08B
  (ALLOWLIST một người nhận) do `AUTHENTICATED_EXTERNAL_OPERATOR` thực hiện, có đúng một provider
  send và `OWNER_CONFIRMED` inbox receipt. Lần gọi thứ hai gửi `0`; trạng thái delivery cuối là
  `OFF`. Codex không có truy cập Supabase xác thực nên không tuyên bố tự quan sát live state.
  Production không bị thay đổi. Chi tiết/provenance: `docs/phase-3/08-email-worker-scheduling.md`.
- **Phạm vi:** một `pg_cron` job `email_queue_worker` (mỗi 10 phút) gọi `process-email-queue`
  qua `pg_net`/`net.http_post`, xác thực bằng `x-cron-secret` (không đổi, P3-03), URL và secret
  đọc từ Supabase Vault tại thời điểm chạy (không có literal secret trong migration). Không đổi
  `EMAIL_DELIVERY_MODE`, không thêm worker/queue thứ hai, không bật `LIVE`.
- **Giới hạn:** Không deploy production, không bật `EMAIL_DELIVERY_MODE=LIVE`; chỉ merge PR #21
  sau khi CI xanh trên đúng HEAD cuối.

### Phase 3 Stack Consolidation through P3-05 (PASS)
- **Master:** `2a68f20` — merged integration PR #17 from `integrate/phase-3-through-p3-05`.
- **Trạng thái:** P3-00 → P3-05 đã nằm trên `master`; final merged-master CI `31783521687` xanh.
- **Validation:** frontend 45/45, lint 0 errors/3 existing warnings, build PASS, 21 migrations,
  16 pgTAP suites, Deno 37/37 PASS.
- **Giới hạn:** Không triển khai P3-06/P3-07/P3-08, không bật cron/scheduler, không deploy production,
  không gửi live email mới.

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
  vào `master@63d1b7a`. P3-08 (xem "Đang làm" ở trên) là task hiện tại kế tiếp.
- **Báo cáo:** `docs/phase-3/06-cron-overdue-automation.md`,
  `docs/phase-3/07-live-cron-rehearsal.md`.

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
