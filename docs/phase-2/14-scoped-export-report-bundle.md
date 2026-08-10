# P2-14 — Scoped export & report bundle download

Baseline branch: `feat/phase-2f-report-dashboard`  
Starting SHA: `3e7c03d4e1f801bb689dafa48cf70992ffd65721`  
Implementation branch: `feat/phase-2g-scoped-export-bundle`

## Phạm vi

P2-14 hoàn thiện hai đường tải xuống đang có khung: `export-report-status` (CSV) và
`download-report-bundle` (ZIP). Cả hai chỉ chạy với JWT của tài khoản ACTIVE có
`YOUTH_ADMIN` trong scope hoặc `SYSTEM_ADMIN`.

## Luồng và scope

Edge Function gọi `get_report_dashboard` và `get_report_dashboard_assignments` qua
`userClient` (JWT/RLS context). `campaign_id`, `status` và `search` là input duy nhất;
client không được gửi organization/assignment IDs để mở rộng scope. Bundle dùng danh sách
assignment đã được RPC lọc để giới hạn truy vấn service-role tới submission/file tương ứng.

## CSV

- UTF-8 có BOM, CRLF, header tiếng Việt và các cột trạng thái/review/hoàn thành; không đưa
  `storage_path` hay signed URL vào file.
- Mọi ô được quote và escape dấu `"`; giá trị bắt đầu bằng `=`, `+`, `-`, `@` được thêm dấu
  nháy đơn để trung hòa công thức spreadsheet.
- Tôn trọng filter dashboard hiện tại; tên file được chuẩn hóa an toàn.

## ZIP

- Chỉ lấy submission mới nhất (`version_number` lớn nhất) của mỗi assignment trong scope;
  assignment chưa nộp không tạo file.
- Cấu trúc `{campaign}/{organization}/v{version}/{safe-file-name}` và `README.txt`; tên
  được chuẩn hóa backend, path có `..`/absolute bị từ chối. Tên trùng được thêm hậu tố
  `-2`, `-3` có tính quyết định, không ghi đè.
- Bucket `report-submissions-private` chỉ đọc bằng service-role trong Edge Function; object
  thiếu, download lỗi hoặc kích thước thực tế lệch metadata DB đều fail-closed.
- Giới hạn cứng 100 file và 50 MiB tổng, tối đa 30 giây cho mỗi object download; không trả ZIP một phần khi vi phạm.

## Audit và bất biến

Mỗi thành công ghi `audit_logs` với actor từ JWT, campaign, filter và số dòng/số file/dung
lượng. Lỗi ghi audit làm request thất bại. Hai thao tác không mutate campaign, assignment,
submission hoặc file; response có `Cache-Control: private, no-store`.

## Kiểm thử và rollback

Frontend unit tests bao phủ payload/filter và guard chống double-click; contract tests Deno
bao phủ CSV formula neutralization, allowlist filter, duplicate ZIP path và limits/status.
Rollback an toàn bằng cách revert commit/PR P2-14; không có migration/schema change.

CI acceptance: GitHub Actions run `31409166458` PASS (frontend lint/test/build, Supabase db reset + pgTAP, Deno check/test).
