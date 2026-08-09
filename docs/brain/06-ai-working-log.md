# 06 — AI Working Log

> Nhật ký các lần AI (Claude Code / Codex) sửa code. Mỗi agent PHẢI thêm entry sau mỗi lần
> chạm vào code. Đọc ngược từ trên xuống để biết gần đây ai đã làm gì và vì sao.

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

## [2026-08-09] P2-06 security test gate

- **Agent:** Codex
- **Thay đổi:** Đóng quyền gọi trực tiếp RPC lõi nộp báo cáo bằng migration forward-only, chuyển pgTAP lifecycle sang wrapper có file và thêm test âm cho bypass quyền RPC; lập báo cáo nghiệm thu Phase 2A.
- **File đã sửa:** `supabase/migrations/202608090005_phase_2_close_core_submission_rpc.sql`, `supabase/tests/report_submission_atomicity.sql`, `docs/phase-2/06-phase-2a-acceptance.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Đường production bắt buộc qua finalize có file; RPC lõi không được là public/authenticated contract.
- **Kiểm tra:** `npm ci`, `npm run lint`, `npm test`, `npm run build`; pgTAP/Deno chờ CI vì máy local không có Supabase CLI, Docker hoặc Deno.

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
