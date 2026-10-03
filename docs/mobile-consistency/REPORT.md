# Mobile consistency (nhóm B) — 2026-10-03

Nhánh `ui/mobile-consistency-b` (từ PR #62 `1b94b79`). Đo trên bản build local (Supabase giả, chỉ để xem
giao diện) bằng browser pane; **chưa có Vercel Preview** cho nhánh này.

| Việc | Thay đổi | Kết quả đo |
|---|---|---|
| Đầu trang thống nhất | `.mobile-topbar` (Đổi mới, Cá nhân/Công việc khi chưa đăng nhập, trang con admin…) từ nền trắng → xanh `--brand-700`, chữ trắng, chừa `safe-area-inset-top`. Trang đã có app bar xanh riêng (Tri thức, Hỏi AI, Công việc đã đăng nhập…) giữ nguyên | 390: cao 66 px, `rgb(18,87,196)`, tên app trắng; không scroll ngang ở 360 trên `/doi-moi-sang-tao`, `/login`, `/cong-viec`, `/ca-nhan`, `/tri-thuc` |
| Đăng nhập không còn "ngõ cụt" | Thêm liên kết "Về trang chủ" (44 px) phía trên thẻ; bỏ logo trùng ở thẻ đơn vị (chỉ còn 1 logo) | Bấm liên kết → `/`; 1 `<img>` trên trang |
| Lời văn | Bỏ "cho tài khoản của bạn" ở trạng thái trống của Tri thức/Chuyên đề (khách không có tài khoản); Trang chủ khách đồng nhất "bạn" ("Tài khoản cần thiết khi bạn làm bài…") | — |
| Ô trống 2 lớp viền | `.document-list .empty-state` bỏ viền đứt, nền, bo, margin-top | viền ngoài 1 px còn, viền trong `0px none` |
| Desktop 1280 | không đổi | top bar ẩn, sidebar 268 px, không scroll ngang |

Ảnh: `local-innovation-390.jpg`, `local-login-390.jpg`, `local-work-gate-390.jpg`.

Không làm (ngoài phạm vi): mục "Mới công bố" cho Trang chủ khách (tính năng mới); dọn `src/index.css` bị ghi đè nhiều lớp
(`.metric-card` 4 lần, `.bottom-nav` 3 lần) — để PR riêng; logo vẫn `BRAND_LOGO_PENDING_OWNER_ASSET`.
