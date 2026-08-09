# AGENTS.md — Hướng dẫn cho Codex

> Dành riêng cho **OpenAI Codex**. Claude Code dùng CLAUDE.md.
> Dự án: **Sổ tay Đoàn viên số** — nền tảng số cho công tác Đoàn (báo cáo, tri thức, AI RAG,
> đổi mới sáng tạo) của tuổi trẻ Công an tỉnh Phú Thọ.

---

## BẮT BUỘC: Đọc trước khi code

Trước khi bắt đầu bất kỳ task nào, đọc **toàn bộ** `docs/brain/`:

```
docs/brain/00-project-overview.md   — mục tiêu, người dùng, phạm vi, trạng thái
docs/brain/01-architecture.md       — stack, luồng xử lý, CODE GRAPH (bản đồ module)
docs/brain/02-coding-rules.md       — quy tắc code, đặt tên, bảo mật
docs/brain/03-decisions.md          — các quyết định kỹ thuật đã chốt
docs/brain/04-current-tasks.md      — task đang làm, task chờ, task không làm
docs/brain/05-testing-and-deploy.md — lệnh cài đặt, chạy, test, deploy
docs/brain/06-ai-working-log.md     — nhật ký các lần AI sửa code
```

**Đặc biệt đọc Code Graph trong `01-architecture.md`** để biết "đụng vào file X thì ảnh hưởng
những đâu" trước khi sửa. Không đọc là code mù. Đặc tả nghiệp vụ đầy đủ ở `docs/01-product-spec.md`
và `docs/02-design-system.md` — đọc trước khi sửa phần nghiệp vụ/giao diện tương ứng.

## Cài đặt nhanh

Lệnh đầy đủ ở `docs/brain/05-testing-and-deploy.md`. Khởi động nhanh:
```bash
cp .env.example .env.local   # điền VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

---

## Sau khi sửa code

**Bắt buộc** thêm một entry vào `docs/brain/06-ai-working-log.md`:

```
## [YYYY-MM-DD] [Tên task]
- **Agent:** Codex
- **Thay đổi:** <mô tả ngắn>
- **File đã sửa:** <danh sách file>
- **Lý do:** <vì sao>
- **Kiểm tra:** <cách xác minh hoạt động đúng>
```

## Khi thay đổi kiến trúc / API / cấu trúc / database

Nếu thay đổi: stack/dependency mới · cấu trúc thư mục · route · endpoint/interface Edge Function ·
schema database · RPC · luồng xử lý chính —

→ **Phải cập nhật** `docs/brain/01-architecture.md` (gồm cả **Code Graph**) **VÀ**
`docs/brain/03-decisions.md`. Code Graph lỗi thời còn nguy hiểm hơn không có.

---

## Quy tắc cứng (dự án Sổ tay Đoàn viên số)

1. Đọc `docs/01-product-spec.md` và `docs/02-design-system.md` trước khi sửa nghiệp vụ/giao diện.
2. Không sửa production/`master` trực tiếp; mỗi phase dùng branch riêng, tạo PR.
3. Không tái đưa Apps Script, Sheets, Drive hoặc Pinecone thành hạ tầng chính (bỏ cả `/api/gas`).
4. RLS phải được viết và test cùng migration.
5. Không dùng service role key, Gemini key hoặc email secret ở frontend; không dùng `VITE_*` cho secret.
6. Không bỏ kiểm thử cũ để làm build/lint pass.
7. Không tự mở rộng phạm vi nghiệp vụ (xem "Ngoài scope" ở `docs/brain/00-project-overview.md`).
8. Mọi dữ liệu private mở qua signed URL ngắn hạn; báo cáo nộp lại tạo phiên bản mới, không ghi đè.
9. Mỗi phase phải bàn giao migration, test, log thay đổi, rủi ro và hướng rollback/forward-fix.
10. Giao diện phải dùng token trong `src/index.css`, Be Vietnam Pro, line icon, mobile-first.
11. Không hardcode secret/API key; kiểm tra `docs/brain/04-current-tasks.md` xem task có được phép làm.

## Nguyên tắc code

- Viết code tối thiểu để giải quyết task. Không tính năng speculative, không abstraction sớm.
- Style hiện tại: JavaScript ESM + JSX ở `src/` (KHÔNG TypeScript ở frontend); TypeScript + Deno ở
  `supabase/functions/`. 2 spaces, single quotes, `;`.
- Không xóa code mà chưa hiểu vì sao nó tồn tại (đọc working log + `git blame` trước).
- Dọn sạch biến/import thừa do mình tạo ra.
- KHÔNG "lười" ở: validation ở ranh giới tin cậy, xử lý lỗi tránh mất dữ liệu, biện pháp bảo mật.
