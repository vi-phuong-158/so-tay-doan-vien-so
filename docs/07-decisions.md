# Quyết định kiến trúc

1. Tách dự án mới khỏi runtime Apps Script cũ.
2. Dùng URL thật cho từng nội dung; custom history router hiện tại có thể thay bằng React Router khi dependency được cài.
3. Frontend chỉ giữ anon key và access token; service role nằm trong Edge Functions.
4. Tệp nghiệp vụ private, mở qua signed URL ngắn hạn.
5. Báo cáo nộp lại tạo phiên bản mới, không ghi đè.
6. Quiz không cho frontend đọc `is_correct` trước khi chấm.
7. AI chỉ truy hồi chunk `APPROVED` và phải trả nguồn.
8. Dữ liệu giao diện mẫu không được dùng như dữ liệu production.
