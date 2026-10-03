# Trang chủ — responsive mobile & logo Đoàn (2026-10-03)

Kiểm tra bằng Chromium thật (Playwright), font Be Vietnam Pro, `deviceScaleFactor=2`, ở **360×800,
390×844, 430×932**, cả **khách** và **đã đăng nhập** (phiên + REST giả lập, tên dài và tiêu đề báo cáo
dài để thử tràn chữ). Ảnh trong `screenshots/` (`before-*` = trước khi sửa).

## Nguyên nhân từng lỗi

| Lỗi | Nguyên nhân | Sửa (`src/index.css`) |
|---|---|---|
| Card "TRI THỨC CÔNG KHAI" bị bó cột hẹp, bẻ từng từ (tiêu đề 5 dòng, mô tả 7–11 dòng ở 360 px; cột chữ chỉ 85 px) | Rule mobile của `.home-public-card` chỉ đặt `display:grid;gap` mà **không đặt lại `grid-template-columns`**, nên vẫn dùng `minmax(0,1fr) auto` của desktop; cột `auto` (nút + "Hỏi AI", không xuống dòng) chiếm gần hết chiều rộng | `grid-template-columns:minmax(0,1fr)`; `.home-public-actions` thành `flex-wrap`, nằm dưới nội dung |
| 3 quick-action card cao 94–135 px, "Khám phá"/"Đổi mới sáng tạo" xuống 2 dòng, khoảng trắng dư | `min-height:88px` + `padding:10px`, `<small>` inline thừa `line-height` thân trang; `1fr` có thể bị nội dung đẩy rộng | `repeat(3,minmax(0,1fr))`, `min-height:0`, tiêu đề 16 px `line-clamp:2`, nhãn `display:-webkit-box; line-height:1.3`; cao còn **88–103 px** |
| Logo mờ, huy hiệu quá nhỏ trong ô vuông | `logo-doan.jpg` là ảnh vuông 2000×2001 nền vải xanh, ép vào ô 38×38 `object-fit:cover` | Dùng `logo-doan-badge.png` (huy hiệu tách từ chính ảnh gốc), cao 32 px, `width:auto` |
| Header: tên đơn vị ép 2–3 dòng, nút "Đăng nhập" xuống dòng ở 360 px | Không có `min-width:0` cho khối chữ, nút bên phải được phép co | Brand `flex:1 1 0;min-width:0`, nút `flex:none; white-space:nowrap`, tên đơn vị tối đa 2 dòng |
| Nguy cơ nội dung bị bottom nav che | Chiều cao nav và padding trang là hai số rời (62 px / 88 px) | Token `--bottom-nav-h`; `.home-page` đệm `nav + 32 px + safe-area` |
| (Do chính thay đổi logo) tên app trong sidebar desktop mồ côi chữ "số" | Logo rộng hơn làm cột chữ hẹp | Sidebar logo cao 34 px, `text-wrap:balance` |

## Kết quả đo (trình duyệt thật)

| Viewport | Scroll ngang | Phần tử tràn | Text tràn | Tiêu đề card công khai | Chiều cao quick-card | Logo | Chừa trên bottom nav |
|---|---|---|---|---|---|---|---|
| 360 | 0 | 0 | 0 | 292 px, 1 dòng | 103 px (trước 135) | 60×32 | 32 px (đăng nhập) |
| 390 | 0 | 0 | 0 | 322 px, 1 dòng | 103 px (trước 116) | 60×32 | 32 px |
| 430 | 0 | 0 | 0 | 362 px, 1 dòng | 88 px (trước 94) | 60×32 | 32 px |

Kiểm tra thêm: 320, 600, 768, 960 (không scroll ngang; card công khai 252–892 px), 1280 (desktop
không đổi), Đăng nhập 360/1280, trang con `/tri-thuc/van-ban` 360.

## Giới hạn cần biết

- Repo chỉ có **một** logo Đoàn do owner cung cấp (`logo-doan.jpg`, huy hiệu "THANH NIÊN VIỆT NAM").
  Đã dùng đúng huy hiệu đó; **chưa có** biểu tượng ngọn đuốc – ngôi sao. Nếu cần, owner gửi file chính
  thức rồi thay theo ghi chú ở `docs/02-design-system.md` mục 2.
- Phiên đăng nhập trong ảnh `after-auth-*` là giả lập ở trình duyệt (không có tài khoản thật, không
  chạm Supabase/production). Con số "Đoàn viên" hiển thị "—" vì Member API giả lập không khớp.
- Repo không có `DESIGN.md`; tài liệu thiết kế là `docs/02-design-system.md` (đã cập nhật).
