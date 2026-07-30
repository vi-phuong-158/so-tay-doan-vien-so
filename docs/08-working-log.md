# Working log — 30/07/2026

- Tách frontend khỏi repo `baovenentang` và loại bỏ API `/api/gas`.
- Thiết kế lại toàn bộ 5 khu vực theo DESIGN.md.
- Tạo các route nghiệp vụ, PWA shell và dữ liệu demo.
- Tạo Supabase schema, RLS, Storage buckets, RPC phiên bản báo cáo và trạng thái bài toán.
- Tạo Edge Functions chính: submit/review báo cáo, reminder/email queue, AI, xử lý tài liệu, bài toán đổi mới, export và ZIP.
- Chạy unit test nền tảng: 3/3 pass.
- Chưa chạy build do môi trường thi công không tải được package từ registry; đã kiểm tra cú pháp JSX bằng TypeScript parser.
- Chưa chạy migration/RLS trên Supabase rehearsal vì chưa có project và secret của người dùng.
