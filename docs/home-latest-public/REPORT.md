# Trang chủ khách — mục "Mới công bố" (2026-10-03)

- Hiển thị tối đa **3 văn bản** + **2 chuyên đề** mới nhất dưới thẻ "Tri thức công khai", nút "Xem tất cả" → `/tri-thuc`.
- Dùng lại `documentService.listDocuments` / `learningService.listTopics` và `DocumentCard` / `TopicCard` có sẵn.
  Không thêm API, bảng hay RLS: khách chỉ nhận nội dung PUBLIC đã công bố như trang Tri thức.
- Chỉ chạy khi chưa đăng nhập. Đang tải → khung xương; tải xong mà **không có gì** (hoặc lỗi) → **ẩn mục**.

## Kiểm tra (bản build local, Supabase REST giả lập 3 văn bản + 2 chuyên đề mẫu)

| Bề rộng | Mục hiện | Số thẻ | Scroll ngang / tràn | Ghi chú |
|---|---|---|---|---|
| 360 | có | 5 | 0 / 0 | rộng 328 px |
| 390 | có | 5 | 0 / 0 | cách bottom nav 32 px khi cuộn hết |
| 430 | có | 5 | 0 / 0 | rộng 398 px |
| 1280 | có | 5 | 0 / 0 | rộng 916 px |

- API không truy cập được → khung xương rồi ẩn (~16 s, do supabase-js chờ kết nối).
- Production hiện **chưa có văn bản/chuyên đề công khai** cho khách → mục sẽ ẩn cho tới khi có nội dung công bố.
- Ảnh: `local-mock-390.jpg` (dữ liệu mẫu, không phải dữ liệu thật).
