# BUILD REPORT — Sổ tay Đoàn viên số

**Ngày:** 30/07/2026  
**Nguồn:** đặc tả thi công, DESIGN.md và frontend dự án `baovenentang`.

## Phạm vi đã thi công

- Frontend React/Vite theo 5 khu vực chính. Hoàn thành **Phase 1** phân tách Component và Routing bằng `react-router-dom`.
- Giao diện mobile-first, desktop sidebar, bottom navigation mobile.
- Trang chủ cá nhân hóa, công việc/báo cáo, kho tri thức, chuyên đề/quiz, trợ lý AI, đổi mới sáng tạo, cá nhân và dashboard quản trị.
- Luồng demo có tương tác: lọc danh sách, nộp tệp, nộp lại, quiz, chat AI có nguồn, gửi bài toán bằng bottom sheet.
- PWA manifest, service worker và cấu hình Vercel.
- Supabase schema, RLS nền tảng, Storage buckets, RPC và Edge Functions chính.
- Setup test `pgTAP` chứng minh RLS an toàn (cách ly tổ chức và role).
- Tài liệu kiến trúc, kiểm thử, triển khai, quyết định và working log (`docs/phase-1-implementation-report.md`).

## Bằng chứng kiểm tra

- TypeScript parser kiểm tra thành công toàn bộ JSX/JS/TS trong `src` và `supabase/functions`.
- Unit test: **3/3 pass**.
- Không còn tham chiếu runtime đến `/api/gas`, Apps Script hoặc Pinecone.

## Chưa thể xác nhận trong môi trường này

- `npm run build`: registry nội bộ không cung cấp các package cần thiết, nên chưa cài được dependency để chạy Vite build.
- Migration/RLS/Edge Functions chưa chạy trên Supabase rehearsal vì chưa có project và secrets.
- Dữ liệu trên giao diện đang là dữ liệu demo; không được coi là kết nối nghiệp vụ thật.

## Bước tiếp theo bắt buộc

1. Tạo Supabase dev/rehearsal tách production.
2. Chạy migration và seed; sửa lỗi SQL nếu extension/vector của project có khác biệt.
3. Cấu hình Auth, Storage, secrets và email provider.
4. Kết nối từng màn hình với service thật theo phase.
5. Chạy RLS acceptance, integration và E2E trước pilot.
