# Runtime acceptance trên Vercel Preview — PR #62 (2026-10-03)

- **HEAD:** `b2fb9fc7839d4cb261e51a2b96d0e6cb90dda177` (nhánh `ccr-c9f5da1a-deo6vu`)
- **URL:** https://so-tay-doan-vien-so-git-ccr-c9f5-3c0143-vi-phuong-158s-projects.vercel.app (Vercel Authentication bật; owner đăng nhập trong trình duyệt)
- **Trình duyệt:** Chromium của Claude desktop app (browser pane), giả lập mobile (UA Android, touch), `devicePixelRatio=2`.
- **Phiên:** khách (guest). **Chưa kiểm tra bản đã đăng nhập** vì không có tài khoản thử nghiệm hợp lệ.

## Số đo

| Hạng mục | 360×800 | 390×844 | 430×932 |
|---|---|---|---|
| `scrollWidth` / `clientWidth` | 360 / 360 | 390 / 390 | 430 / 430 |
| Phần tử tràn viewport / text tràn | 0 / 0 | 0 / 0 | 0 / 0 |
| Card "Tri thức công khai": cột grid | 1 cột (292 px) | 1 cột (323 px) | 1 cột (363 px) |
| Tiêu đề h2 / mô tả | 1 dòng / 2 dòng | 1 / 2 | 1 / 2 |
| Nút "Mở kho tri thức" | dưới nội dung, 160×44, 1 dòng | như 360 | như 360 |
| Quick card (Tra cứu/Học tập/Khám phá) | tiêu đề 1 dòng, cao 102 px, rộng 104 | 1 dòng, 102 px, 114 | 1 dòng, 88 px, 127 |
| Logo header | 60×32 `logo-doan-badge.png` | 60×32 | 60×32 |
| Tên app / tên đơn vị | 1 dòng / 2 dòng | 1 / 2 | 1 / 1 |
| Nút "Đăng nhập" | 1 dòng, mép phải 344 (≤ 360) | 1 dòng, 374 | 1 dòng, 414 |
| Be Vietnam Pro (`fonts.check` 600) / h1 font | true / "Be Vietnam Pro" | true / như 360 | true / như 360 |

**Bottom nav:** ở 3 kích thước chuẩn, trang khách ngắn hơn màn hình (không cuộn; card cuối cách nav 237/281/386 px).
Để buộc phải cuộn, đo thêm ở chiều cao thấp với `scroll-behavior:auto`: 360×520, 390×520, 430×480 → cuộn hết,
khoảng cách card cuối → đỉnh bottom nav = **32 px** cả 3 (padding `.home-page` = 94 px = 62 + 32).

**Refresh trực tiếp:** `/`, `/tri-thuc`, `/tri-thuc/van-ban`, `/login` — mở thẳng và reload đều `200`, render đúng h1, không scroll ngang.

**Console:** chỉ có CSP chặn `https://vercel.live/_next-live/feedback/feedback.js` (thanh góp ý Vercel tự chèn vào
Preview, không phải code app; production không chèn). Không có lỗi CSP cho font; `fonts.gstatic.com` trả 200.

**Service worker:** lần đầu mở Preview: `caches.keys()` = `["so-tay-doan-vien-v4"]`, `index.html` trong cache dùng
`favicon-64.png`, logo `/brand/logo-doan-badge.png`. Giả lập cache cũ: tạo cache `so-tay-doan-vien-v3`, gỡ SW,
reload 1 lần → SW mới cài, cache chỉ còn `v4`. **Giới hạn:** không giả lập được SW v3 *cũ đang chạy* trên origin
Preview (không thể deploy `sw.js` cũ cùng origin), nên hành vi "reload lần 1 vẫn thấy giao diện cũ, lần 2 mới thấy mới"
chỉ đã đo trên bản build local (xem `../REPORT.md`) — cần kiểm tra lại trên production sau khi merge.

**Desktop 1280×800 (kiểm tra hồi quy):** không scroll ngang, sidebar hiện, logo sidebar 64×34, card công khai vẫn 2 cột desktop, bottom nav ẩn.

## Ảnh (cắt theo viewport từ browser pane, độ phân giải thấp do pane hẹp)

- `preview-guest-360.png`, `preview-guest-390.png`, `preview-guest-430.png` — đầu trang (trang không cuộn ở kích thước này)
- `preview-guest-360-bottom.png` (360×520), `preview-guest-390-bottom.png` (390×520), `preview-guest-430-bottom.png` (430×480) — đã cuộn hết

> Logo vẫn là **BRAND_LOGO_PENDING_OWNER_ASSET** — không phải nghiệm thu logo cuối cùng.
