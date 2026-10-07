# Sửa chi tiết văn bản trên điện thoại — 07/10/2026

## Kết quả mã nguồn

- Cover không bị ép ngang khi tiêu đề dài; nhãn loại văn bản dễ đọc.
- Nút “Mở đọc tài liệu” ở đầu thẻ thông tin; mở bản gốc ở tab mới.
- Khung “Xem tài liệu” đọc tệp Drive ngay trên trang, có sandbox và hướng dẫn mở ngoài nếu lỗi.
- Bổ sung hiển thị số/ký hiệu, loại văn bản, cơ quan ban hành; từ khóa không còn giả dạng nút vô hiệu.
- Giữ nguyên kiểm quyền danh mục và luồng signed URL tệp Storage khi bấm.

## Metadata và trạng thái thực tế

Đã đọc và đối chiếu 5 bản gốc; dữ liệu đề xuất nằm trong `verified_metadata` của
`docs/document-metadata-review-2026-10-07.json`, kèm source URL và dẫn chứng từng bản gốc.
Chưa ghi các thông tin này vào Supabase: automatic approval review từ chối privileged SQL bỏ qua
RPC quản trị/actor. Không có audit mới. Cần session quản trị hợp lệ để cập nhật bằng luồng hiện hữu.

Không có ngày hiệu lực riêng trong 4 tài liệu nên giữ NULL. Quyết định 1518 ghi hiệu lực từ ngày
ký 08/08/2025; chưa kiểm tra văn bản thay thế để kết luận còn hiệu lực hiện nay.

## Kiểm tra

- `npm test`: 227/227 trên baseline production, gồm chuẩn hóa Drive URL và từ chối scheme/credential/host nhúng không hợp lệ.
- `npm run lint`: 0 lỗi; 3 cảnh báo Fast Refresh có sẵn.
- `npm run build`: thành công; cảnh báo bundle lớn hơn 500kB có sẵn.
- Trình duyệt thật với backend đang dùng bởi website: 360/390/430/768/1440px không tràn ngang;
  cover rộng 72px trên điện thoại/88px trên màn hình lớn, nút cao 48px.
- Tệp Word trong ảnh người dùng đã hiện nội dung trong iframe; bấm nút mở đúng Drive file ở tab mới.
- Ảnh: `document-mobile-reader-390.jpg`, `document-mobile-reader-preview-390.jpg`.

Không gọi toàn bộ luồng PASS: metadata chưa được lưu, chưa có session quản trị, chưa deploy
giao diện/CSP lên Vercel. Iframe đã kiểm tra trên Vite local; header CSP production cần kiểm tra
sau deployment. Build cuối dùng đúng URL và publishable key public hiện có, không đưa secret vào frontend.

Owner đã đăng nhập trong trình duyệt Codex; sau reload trang quản trị hiển thị “Không có quyền
truy cập”. Route yêu cầu YOUTH_ADMIN (RoleGuard còn cho SYSTEM_ADMIN đi qua UI, nhưng RPC vẫn
kiểm quyền riêng). Không sửa quyền tài khoản. Ảnh trạng thái: `document-admin-access-390.jpg`.

## Rủi ro và cách sửa tiếp

Drive viewer phụ thuộc quyền tệp/dịch vụ bên ngoài; nút mở bản gốc luôn có sẵn khi source URL hợp lệ.
Khung xem không thay đổi quyền Drive và không biến nguồn hạn chế thành công khai. Khi cần hoàn tác
UI, khôi phục riêng phần diff của task trong component/helper/CSS/CSP và tests; giữ các thay đổi
đang có của owner. Nếu metadata cần sửa, dùng quản trị/RPC có audit, không xóa tệp hoặc audit.

Owner cho phép commit/push, PR và triển khai. PR #56 đã đóng; nhánh cũ thiếu các thay đổi mới
đang chạy, nên task dùng checkout riêng `.worktrees/document-mobile-reader`, nhánh
`codex/document-mobile-reader`, từ production `c03f2d5`. Không đổi master hoặc phần thay đổi cũ.
Service Worker cache nâng v4 → v5 để máy đã cài PWA nhận shell mới; không cache API/Drive.
