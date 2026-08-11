# 04 — Current Tasks

> Cập nhật mỗi khi bắt đầu hoặc hoàn thành task. Agent đọc đây để biết được phép làm gì.
> Trạng thái triển khai chi tiết: `docs/04-implementation-status.md`; kế hoạch phase: `docs/phase-2/`.

---

## Đang làm

### P3-01 — Notification Foundation
- **Branch:** feat/phase-3a-notification-foundation, stack trên P3-00 commit 1377265 vì Draft PR #11 chưa merge.
- **Trạng thái:** PASS technical acceptance; migration/RPC/service/UI/pgTAP/frontend tests đã triển khai,
  CI run 31491748132 xanh.
- **Phạm vi:** in-app notification only; không email provider, queue worker, reminder hoặc cron.
- **Next gate:** Owner review Draft PR; P3-02 chỉ mở sau handoff này.

P3-00 đã PASS ở mức audit/docs-only; P3-01 đang chờ CI database acceptance.

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

### Phase 3 — Notification, Email Queue & Reminder/Cron
- **Mô tả:** P3-00 và P3-01 đã PASS technical acceptance; P3-02 là bước kế tiếp sau review.
- **Báo cáo:** `docs/phase-3/00-baseline-rehearsal-plan.md`.
- **Next recommended sau P3-01 PASS:** P3-02 Email Queue State Machine & Concurrency Safety.
- **Ưu tiên:** Cao sau baseline.

---

## Không làm lúc này

- Đoàn phí, chuyển sinh hoạt, hồ sơ đoàn viên đầy đủ, xếp loại tự động — ngoài scope bản đầu.
- Mạng xã hội nội bộ, nhắn tin riêng, bình luận công khai — ngoài scope.
- Tích hợp dữ liệu bí mật nhà nước / nghiệp vụ nhạy cảm — chưa có hạ tầng/quy trình được phép.
- Mở đăng ký tài khoản tự do — tài khoản do quản trị viên tạo/nhập.

---

## Đã hoàn thành gần đây

- [2026-08-11] P3-01: Notification Foundation PASS; CI 31491748132 xanh với migration reset, 267 pgTAP, Edge Function và frontend gates.

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
- Status: technical acceptance PASS; live acceptance remains PASS_WITH_REHEARSAL_BLOCKED because
  no controlled rehearsal project/provider secret/test inbox is available. Resend adapter, safe
  SYSTEM_EMAIL_TEST renderer and queue-claim worker are complete; report hooks, reminders, cron
  and production deploy are not in scope.
- Acceptance distinction: technical CI may PASS, but full P3-03 requires a controlled
  rehearsal project/provider/test inbox. Without those, status is PASS_WITH_REHEARSAL_BLOCKED.
- Verification: GitHub Actions run 31498548925 PASS; migration reset + 14 pgTAP files / 292
  assertions (279 P3-02 baseline + 13 P3-03 assertions), Deno check/tests (30 passed), and
  frontend lint/test/build all passed. No live provider request was made.

# P3-03R - Live Email Rehearsal Acceptance

- Branch: `feat/phase-3c-email-provider`, baseline `7edce42` (P3-03 acceptance HEAD); Draft PR
  #14 remains open and is not merged.
- Status: `BLOCKED`. No dedicated rehearsal Supabase project/credentials, Resend provider key,
  accepted sender or controlled test inbox is available. No live provider request was made.
- Scope guard: no production data, cron, reminder, report hook, bulk send or production deploy.
- Evidence: local frontend 45/45, lint 0 errors with 3 existing warnings, build PASS; P3-03 CI
  run 31499062927 remains PASS. See `docs/phase-3/03r-live-email-rehearsal.md`.
- Next action: provision the controlled rehearsal environment and rerun P3-03R; do not start
  P3-04 before live acceptance PASS.
