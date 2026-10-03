# Vercel Preview PR #63 — nhóm B (commit `4ae5b4e`, 2026-10-03)

- **URL:** https://so-tay-doan-vien-so-git-ui-mobil-bfc3e3-vi-phuong-158s-projects.vercel.app (Vercel Authentication; owner đã đăng nhập trong browser pane)
- Chromium của browser pane, giả lập mobile, DPR 2, phiên **khách**. Chưa kiểm tra bản đã đăng nhập.

| Hạng mục | 360×800 | 390×844 | 430×932 |
|---|---|---|---|
| Scroll ngang / phần tử tràn (6 trang: `/`, `/tri-thuc`, `/doi-moi-sang-tao`, `/cong-viec`, `/ca-nhan`, `/login`) | 0 / 0 | 0 / 0 | 0 / 0 |
| Top bar `/doi-moi-sang-tao`, `/cong-viec`, `/ca-nhan` | 66 px, `rgb(18,87,196)`, tên app trắng | như 360 | như 360 |
| `/tri-thuc` (app bar xanh riêng) | top bar ẩn, giữ nguyên | giữ nguyên | giữ nguyên |
| `/login`: "Về trang chủ" / số logo | 44 px, `href="/"` / 1 | 44 px / 1 | `href="/"` / 1 |
| Ô trống Tri thức | viền ô trong `0px`, viền khung ngoài 1 px; "Chưa có văn bản nào được công bố." | `0px` | `0px` |
| Hero Trang chủ | `0 0 24px 24px` | như 360 | như 360 |
| Trang chủ: "Tài khoản cần thiết khi **bạn** làm bài…" | có | — | — |

- Bấm "Về trang chủ" ở `/login` → điều hướng tới `/` (390).
- Console: chỉ có CSP chặn `vercel.live/.../feedback.js` (thanh góp ý Vercel chèn vào Preview).
- Desktop 1280 (`/doi-moi-sang-tao`): top bar và bottom nav ẩn, sidebar 268 px, không scroll ngang.
- Ảnh: `preview-innovation-390.png`, `preview-login-430.png`.
- Logo vẫn là **BRAND_LOGO_PENDING_OWNER_ASSET**, không phải nghiệm thu cuối.
