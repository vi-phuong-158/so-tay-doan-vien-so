# Vercel Preview PR #64 — bản đã đăng nhập (2026-10-03)

- Preview: https://so-tay-doan-vien-so-git-ui-brand-34d06b-vi-phuong-158s-projects.vercel.app (project rehearsal `znexculhbdjiflkczpyu`).
- Tài khoản thử nghiệm do owner tạo và **tự đăng nhập** trong browser pane; agent không nhập mật khẩu. Không ghi thông tin đăng nhập vào repo.
- Trình duyệt: Chromium của browser pane, giả lập mobile, DPR 2.

## Đã đo (đăng nhập)

| Hạng mục | 360 | 390 | 430 |
|---|---|---|---|
| Trang chủ: scroll ngang / phần tử tràn | 360/360 · 0 | 390/390 · 0 | 430/430 · 0 |
| Hero bo 2 góc dưới; chuông thông báo 44×44 trong hero | có · mép phải 344 | có · 374 | có · 414 |
| Lời chào / chỉ số | "Chào đồng chí" 1 dòng; 3 ô cao 98 px, tiêu đề 1 dòng | 98 px | 98 px |
| Mục "Mới công bố" (chỉ dành cho khách) | không hiện (đúng) | không hiện | không hiện |
| Cách bottom nav khi cuộn hết | 107 px (trang ngắn, không cuộn) | — | — |
| Đổi mới: top bar xanh + chuông | 66 px, `rgb(18,87,196)`, chuông 44×44 nền trắng mờ | như 360 | như 360 |
| Đổi mới / Tri thức: scroll ngang / tràn | 0 / 0 | 0 / 0 | 0 / 0 |

## Công việc, Cá nhân, Thông báo (sau khi owner bổ sung `profiles` + `user_roles` MEMBER)

| Hạng mục | 360 | 390 | 430 |
|---|---|---|---|
| `/cong-viec`: scroll ngang / tràn | 360/360 · 0 | 390/390 · 0 | 430/430 · 0 |
| `/cong-viec`: app bar xanh, tiêu đề 1 dòng, 2 tab | 76 px, `rgb(18,87,196)`; tab 44×158 | 76 px; tab 44×173 | 76 px; tab 44×193 |
| `/cong-viec`: trạng thái trống ("Chưa có nhiệm vụ báo cáo"), pill tab Công việc | có | — | — |
| `/ca-nhan`: scroll ngang / tràn / chữ tràn | 360/360 · 0 · 0 | 390/390 · 0 · 0 | 430/430 · 0 · 0 |
| `/ca-nhan`: top bar xanh + chuông; 3 mục bấm | 66 px; cao 56 px (≥44) | 66 px; 56 px | 66 px; 56 px |
| `/ca-nhan/thong-bao`: top bar xanh, trạng thái trống | 66 px, 0 tràn | — | — |

- Sau khi có hồ sơ, hai trang không còn báo "Không tải được thông tin tài khoản" → xác nhận nguyên nhân trước đó là tài khoản thiếu dòng `profiles`, không phải lỗi code.
- Tên hiển thị "Tài khoản thử nghiệm", tổ chức "Ban Thanh niên".
- Console (đã đăng nhập): không có lỗi nào ngoài CSP của thanh góp ý Vercel.
- Chưa đo: Quản lý đoàn viên / Bảng điều hành (cần vai trò `YOUTH_ADMIN`), nhiệm vụ báo cáo có dữ liệu (tài khoản chưa có báo cáo nào).

## Phát hiện nhỏ (đã sửa trong PR này)
- Trang chủ đã đăng nhập: ô **"Thông báo mới"** thiếu nền ô icon. Đã thêm `tone="blue"` (commit "fix(home): give the notification quick card its icon chip").
- Ảnh: `auth-home-360.png` (chụp **trước** khi sửa), `auth-innovation-360.jpg`, `auth-work-360.jpg`, `auth-profile-360.jpg`.
