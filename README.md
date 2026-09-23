# Sổ tay Đoàn viên số

Nền tảng số phục vụ đoàn viên, cán bộ Đoàn, Ban Thanh niên và Câu lạc bộ đổi mới sáng tạo tuổi trẻ Công an tỉnh Phú Thọ.

## Trạng thái bàn giao

- Giao diện responsive thống nhất 5 khu vực: Trang chủ, Công việc, Tri thức, Đổi mới sáng tạo, Cá nhân; Public-First và đăng nhập tại điểm cần quyền.
- Các vertical slice báo cáo, văn bản, chuyên đề/quiz, Ask AI, thông báo, quản trị và Member Management đã nối service/RPC/API tương ứng; trạng thái khả dụng phụ thuộc runtime và quyền tài khoản.
- Có PWA manifest và service worker.
- Có Supabase client chỉ dùng publishable key ở frontend; secret vẫn ở backend.
- Có schema/RLS/RPC, Edge Functions và Member API theo các phase đã nghiệm thu kỹ thuật.
- Trạng thái UI closure và các runtime gate còn lại được ghi tại `docs/ui-final-closure/FINAL_ACCEPTANCE.md`.

## Chạy bằng Vite

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Xem nhanh khi chưa cài dependency

Phục vụ thư mục bằng HTTP và mở `preview.html`. Trang preview dùng React qua ESM CDN chỉ để duyệt giao diện, không dùng cho production.

```bash
python -m http.server 4173
# http://localhost:4173/preview.html
```

## Kiểm thử

```bash
npm test
npm run lint
npm run build
```

## Nguyên tắc production

Không đưa service role key, Gemini key, SMTP key vào frontend. Mọi thao tác chuyển trạng thái, tải tệp private, AI/RAG, email và export phải chạy qua RLS/RPC hoặc Edge Functions.
