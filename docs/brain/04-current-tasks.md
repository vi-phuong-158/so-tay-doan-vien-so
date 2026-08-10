# 04 — Current Tasks

> Cập nhật mỗi khi bắt đầu hoặc hoàn thành task. Agent đọc đây để biết được phép làm gì.
> Trạng thái triển khai chi tiết: `docs/04-implementation-status.md`; kế hoạch phase: `docs/phase-2/`.

---

## Đang làm

**P2-14 — Scoped export & report bundle download** (branch `feat/phase-2g-scoped-export-bundle`, baseline P2-13 `3e7c03d`)
- Hoàn thiện export CSV và bundle ZIP qua Edge Functions; scope/filter lấy từ dashboard RPC, object private chỉ được đọc server-side, audit bắt buộc.
- CI run `31409166458` PASS (frontend lint/test/build, Supabase reset/pgTAP, Deno check/test); local frontend test/lint/build cũng PASS.

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

---

## Không làm lúc này

- Đoàn phí, chuyển sinh hoạt, hồ sơ đoàn viên đầy đủ, xếp loại tự động — ngoài scope bản đầu.
- Mạng xã hội nội bộ, nhắn tin riêng, bình luận công khai — ngoài scope.
- Tích hợp dữ liệu bí mật nhà nước / nghiệp vụ nhạy cảm — chưa có hạ tầng/quy trình được phép.
- Mở đăng ký tài khoản tự do — tài khoản do quản trị viên tạo/nhập.

---

## Đã hoàn thành gần đây

- [2026-08-10] P2-12: route `/admin/bao-cao`, service quản trị campaign, template private và publish assignment qua RPC.
- [2026-08-10] P2-13: dashboard báo cáo scoped server-side, aggregate trạng thái/completion, filter/search và deep link assignment.
- [2026-08-10] P2-14: export CSV scoped và bundle ZIP latest submission, giới hạn/metadata fail-closed, audit và nút tải dashboard.

- [2026-08-09] P2-07: report service layer + behavior tests; không migration, không thay UI.
- [2026-08-09] P2-08: report assignment list/detail UI, real status filters, RLS-backed detail and private template download.
- [2026-08-09] P2-09: upload/submit UI, safe staged-object cleanup policy, assignment notification route fix.
- [2026-08-09] P2-10: review transition atomicity, scope/state/reason guards, notification route và review controls tối thiểu.
- [2026-08] Phase 2 docs: audit baseline/gap + state machine & bất biến bảo mật báo cáo.
- [~2026-08] Phase 1: khắc phục bảo mật auth, `requireUser` Supabase Auth thuần, vá npm audit (PR #1).
- [2026-07-30] Dựng frontend 5 khu vực + PWA shell + dữ liệu demo; schema/RLS/RPC + khung Edge
  Functions; unit test nền tảng 3/3 pass.
