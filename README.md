# Sổ tay Đoàn viên số

Nền tảng số phục vụ đoàn viên, cán bộ Đoàn, Ban Thanh niên và Câu lạc bộ đổi mới sáng tạo tuổi trẻ Công an tỉnh Phú Thọ.

## Trạng thái bàn giao

- Hoàn thiện giao diện responsive của 5 khu vực: Trang chủ, Công việc, Tri thức, Đổi mới sáng tạo, Cá nhân.
- Có các luồng mẫu: xem/nộp báo cáo, lịch sử phiên bản, kho văn bản, chuyên đề, quiz, trợ lý AI có nguồn, công trình đổi mới, gửi/theo dõi bài toán, dashboard quản trị.
- Có PWA manifest và service worker.
- Có REST client kết nối Supabase không đưa secret vào frontend.
- Có migration khởi tạo schema/RLS nền tảng và khung Edge Functions.
- Dữ liệu giao diện hiện là dữ liệu demo. Phải tạo Supabase dev/rehearsal, chạy migration và nối từng service trước khi production.

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
npm run build
```

## Nguyên tắc production

Không đưa service role key, Gemini key, SMTP key vào frontend. Mọi thao tác chuyển trạng thái, tải tệp private, AI/RAG, email và export phải chạy qua RLS/RPC hoặc Edge Functions.
