# Trang chủ — responsive mobile & logo tạm thời (2026-10-03)

> **BRAND_LOGO_PENDING_OWNER_ASSET** — phần responsive đã kiểm tra; **logo chưa được nghiệm thu** (xem cuối file).

Kiểm tra bằng Chromium thật (Playwright), font Be Vietnam Pro, `deviceScaleFactor=2`, ở **360×800,
390×844, 430×932**, cả **khách** và **đã đăng nhập** (phiên + REST giả lập, tên dài và tiêu đề báo cáo
dài để thử tràn chữ). Ảnh trong `screenshots/` (`before-*` = trước khi sửa).

## Nguyên nhân từng lỗi

| Lỗi | Nguyên nhân | Sửa (`src/index.css`) |
|---|---|---|
| Card "TRI THỨC CÔNG KHAI" bị bó cột hẹp, bẻ từng từ (tiêu đề 5 dòng, mô tả 7–11 dòng ở 360 px; cột chữ chỉ 85 px) | Rule mobile của `.home-public-card` chỉ đặt `display:grid;gap` mà **không đặt lại `grid-template-columns`**, nên vẫn dùng `minmax(0,1fr) auto` của desktop; cột `auto` (nút + "Hỏi AI", không xuống dòng) chiếm gần hết chiều rộng | `grid-template-columns:minmax(0,1fr)`; `.home-public-actions` thành `flex-wrap`, nằm dưới nội dung |
| 3 quick-action card cao 94–135 px, "Khám phá"/"Đổi mới sáng tạo" xuống 2 dòng, khoảng trắng dư | `min-height:88px` + `padding:10px`, `<small>` inline thừa `line-height` thân trang; `1fr` có thể bị nội dung đẩy rộng | `repeat(3,minmax(0,1fr))`, `min-height:0`, tiêu đề 16 px `line-clamp:2`, nhãn `display:-webkit-box; line-height:1.3`; cao còn **88–103 px** |
| Logo mờ, huy hiệu quá nhỏ trong ô vuông | `logo-doan.jpg` là ảnh vuông 2000×2001 nền vải xanh, ép vào ô 38×38 `object-fit:cover` | Tạm dùng `logo-doan-badge.png` (tách từ asset cũ), cao 32 px, `width:auto` — **chưa phải logo chuẩn của owner** |
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

- **BRAND_LOGO_PENDING_OWNER_ASSET:** `logo-doan-badge.png` chỉ là giải pháp tạm từ asset cũ, chưa đáp ứng
  yêu cầu logo Đoàn Thanh niên của owner; không được coi là nghiệm thu cuối. Danh sách file phải thay
  đồng bộ khi có logo chuẩn: `docs/02-design-system.md` mục 2.
- Phiên đăng nhập trong ảnh `after-auth-*` là giả lập ở trình duyệt (không có tài khoản thật, không
  chạm Supabase/production). Con số "Đoàn viên" hiển thị "—" vì Member API giả lập không khớp.
- Repo không có `DESIGN.md`; tài liệu thiết kế là `docs/02-design-system.md` (đã cập nhật).

## Acceptance trên bản production build local (2026-10-03, HEAD `f4e3fa6`)

> **Không phải bằng chứng Vercel Preview.** Môi trường chạy bị chặn `*.vercel.app`, nên chạy `vite build`
> của đúng HEAD, phục vụ bằng server mô phỏng `vercel.json` (rewrite SPA + toàn bộ header, gồm CSP),
> kiểm tra bằng Chromium thật. Preview thật vẫn cần chạy lại khi có truy cập.

| Hạng mục | 360×800 | 390×844 | 430×932 |
|---|---|---|---|
| Scroll ngang / phần tử tràn / text tràn (khách và đăng nhập giả lập) | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Card "Tri thức công khai" | tiêu đề 1 dòng, 292 px | 1 dòng, 322 px | 1 dòng, 362 px |
| 3 quick card | tiêu đề 1 dòng, cao 103 px | 1 dòng, 103 px | 1 dòng, 88 px |
| Header | tên app 1 dòng, đơn vị 2 dòng, nút Đăng nhập 1 dòng | như 360 | cả hai 1 dòng |
| Bottom nav che nội dung | không (chừa 32 px khi cuộn hết) | không (32 px) | không (32 px) |
| Be Vietnam Pro | đã nạp (400/600/700) | đã nạp | đã nạp |
| Refresh trực tiếp `/`, `/tri-thuc`, `/tri-thuc/van-ban`, `/login` | 200, hiển thị đúng sau reload | như 360 | như 360 |

**Service worker (nâng cấp thật master → PR, cùng origin):** build master (cache `v3`, logo cũ) → thay
bằng build PR → reload lần 1 vẫn thấy giao diện cũ (cache-first, SW mới cài và dọn `v3` ở nền) → reload
lần 2 hiển thị giao diện mới, cache chỉ còn `v4`. Tức là không cần xóa dữ liệu trình duyệt thủ công,
nhưng người dùng cũ cần **một lần tải lại thêm** sau lần triển khai đầu.

Ghi chú: font được nạp từ file Google Fonts tải về và trả lại qua route của Playwright (trình duyệt test
không tự ra được internet). Phiên đăng nhập và Supabase REST là giả lập. Ảnh: `local-prod-build/`.
