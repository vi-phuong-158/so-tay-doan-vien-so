# CLAUDE.md — Hướng dẫn cho Claude Code

> Dành riêng cho **Claude Code**. Codex dùng AGENTS.md.
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
những đâu" trước khi sửa. Lưu ý then chốt: 5 trang chính hiện chạy **dữ liệu demo**
(`src/data/mock.js`); mọi thao tác đặc quyền phải qua Edge Function/RPC, không gọi trực tiếp từ FE.

Đặc tả nghiệp vụ chi tiết nằm ở `docs/01-product-spec.md` và `docs/02-design-system.md` — đọc khi
task chạm vào nghiệp vụ/giao diện tương ứng.

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
- **Agent:** Claude Code
- **Thay đổi:** <mô tả ngắn>
- **File đã sửa:** <danh sách file>
- **Lý do:** <vì sao>
- **Kiểm tra:** <cách xác minh hoạt động đúng>
```

## Khi thay đổi kiến trúc / API / cấu trúc / database

Nếu thay đổi: stack/dependency mới · cấu trúc thư mục · route · endpoint/interface Edge Function ·
schema database · RPC · luồng xử lý chính —

→ **Phải cập nhật** `docs/brain/01-architecture.md` (gồm cả **Code Graph**) **VÀ**
`docs/brain/03-decisions.md`. Code Graph lỗi thời còn nguy hiểm hơn không có, vì agent sau sẽ tin nó.

---

## Quy tắc cứng (dự án Sổ tay Đoàn viên số)

1. **Không push thẳng `master`/production** nếu chưa được yêu cầu rõ ràng — tạo nhánh/PR. Mỗi phase một branch.
2. **Không tự đổi stack** nếu chưa ghi rõ lý do vào `docs/brain/03-decisions.md`.
3. **Không thêm tính năng ngoài scope task** và không tự mở rộng phạm vi nghiệp vụ.
4. **Không hardcode secret/API key** vào source. Frontend chỉ `VITE_SUPABASE_URL/ANON_KEY`;
   service role/Gemini/email key chỉ ở Edge Functions. Không dùng `VITE_*` cho secret.
5. **Không tái đưa** Google Apps Script, Sheets/Drive, Pinecone hoặc `/api/gas` làm hạ tầng chính.
6. **RLS phải viết và test cùng migration**; mọi dữ liệu private mở qua signed URL ngắn hạn.
7. **Không bỏ kiểm thử cũ** để làm build/lint pass. Không ghi đè phiên bản báo cáo đã nộp.
8. Giao diện dùng token trong `src/index.css`, font Be Vietnam Pro, line icon, mobile-first.
9. Kiểm tra `docs/brain/04-current-tasks.md` trước khi bắt đầu: task có được phép làm không?

## Nguyên tắc code

- **Suy nghĩ trước khi code:** không giả định; nêu rõ đánh đổi; tìm giải pháp đơn giản nhất.
- **Ưu tiên đơn giản (ponytail):** viết code tối thiểu; không abstraction sớm; ưu tiên ràng buộc
  DB/RLS thay vì code. Chi tiết ở `docs/brain/02-coding-rules.md`.
- **Thay đổi phẫu thuật:** chỉ chạm phần cần thiết; theo style hiện tại (JS/JSX ở `src`,
  TS/Deno ở Edge Functions); dọn biến/import thừa do mình tạo.
- **NHƯNG không "lười" ở:** validation ở ranh giới tin cậy, xử lý lỗi tránh mất dữ liệu, biện pháp
  bảo mật (RLS, kiểm quyền server, signed URL) — và điều người dùng yêu cầu rõ ràng.
