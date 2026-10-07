# Nguồn tài liệu Google Drive — 2026-10-07

## Trạng thái hiện tại: đã phát hành công khai

Owner xác nhận tiếp: “các tài liệu mở công khai hết”. Đã đổi đúng 5 document IDs trong danh mục
sang PUBLIC, giữ PUBLISHED; mọi người có thể đọc danh mục và mở nguồn Drive mà không đăng nhập.

Đã xác minh role anon đọc đủ 5 dòng PUBLISHED/PUBLIC có liên kết nguồn. Browser chưa đăng nhập
trên website chính thức hiển thị “5 văn bản” và đúng 5 mục; trang chi tiết QĐ 1518.pdf mở được
và có Nguồn công bố trỏ đúng tệp Drive. Ảnh kiểm chứng:
`docs/google-drive-public-catalog-2026-10-07.png`.

Ghi 5 audit events DOCUMENT_METADATA_UPDATED với before INTERNAL_YOUTH, after PUBLIC và
authorization owner_explicitly_requested_all_five_documents_public. Không đổi visibility của
tài liệu khác, RLS, quyền Drive, AI, Storage, mã nguồn hoặc deployment.

Phương án PUBLIC bị chặn trước đây đã được owner xác nhận rõ trong lượt tiếp theo; thao tác
PUBLIC mới được thực hiện thành công qua approval review. Các phần bên dưới mô tả lịch sử nhập
và phát hành nội bộ trước bước mở công khai này.

## Lịch sử phát hành nội bộ

Sau yêu cầu “Phát hành lên bản chính thức đi”, cả 5 document IDs dưới đây đã chuyển sang
PUBLISHED, giữ nguyên INTERNAL_YOUTH. Website chính thức:
[Kho văn bản](https://so-tay-doan-vien-so.vercel.app/tri-thuc/van-ban). Người dùng cần đăng nhập
bằng tài khoản đang hoạt động để xem danh mục.

Đã xác minh Vercel production deployment `dpl_CMWZLC6fFvBpStmnrFsnYbsfB9GC`, READY,
source SHA `c03f2d5cab298c6469a22a8c2049f6620e813b11`. Bundle đang phục vụ
`/assets/index-CPCPJ6fs.js` trỏ vào `https://znexculhbdjiflkczpyu.supabase.co`. Do đó project
tên rehearsal thực tế cũng phục vụ website chính thức; đợt phát hành này có tác động dữ liệu live.
Không deploy lại frontend, đổi environment, schema, RLS hoặc mã nguồn.

Management readback: 5 PUBLISHED, 5 INTERNAL_YOUTH, 5 liên kết nguồn, 5 audit events
DOCUMENT_PUBLISHED; 0 Storage files, 0 AI/retrieval opt-ins. Phép đọc role anon trả 0 dòng.
Browser guest trên website chính thức mở được kho văn bản; chưa có session đăng nhập để nghiệm thu
hiển thị 5 mục và mở nguồn theo tài khoản. Không tuyên bố authenticated browser gate PASS.

Phương án đổi visibility sang PUBLIC bị automatic approval review từ chối vì owner chưa xác nhận
mở danh mục và liên kết cho anonymous audience. Sau đó đã thực hiện phương án hẹp hơn: chỉ đổi
trạng thái sang PUBLISHED, không mở rộng quyền đọc. Actor audit NULL cho management publication;
không giả danh profile quản trị, không cấp quyền hoặc tạo credential.

Các mục mô tả DRAFT ở dưới là bằng chứng đợt nhập ban đầu, trước yêu cầu phát hành tiếp theo.

## Phạm vi đã thực hiện

Owner đã chọn: tệp gốc trên Drive; Supabase giữ danh mục, phân quyền và chỉ mục AI. Đợt này nhập danh mục qua liên kết nguồn có sẵn, chưa kết nối đồng bộ Google Drive API.

- Thư mục: [Tài liệu Đoàn](https://drive.google.com/drive/folders/1IXL5laJIQUPoVduKaF-BxjCEOPjfGRcP).
- Môi trường đã ghi dữ liệu: `so-tay-doan-vien-rehearsal` (`znexculhbdjiflkczpyu`). Không đổi production.
- Đơn vị sở hữu: Ban Thanh niên Công an tỉnh Phú Thọ, ID `11111111-1111-1111-1111-111111111111`, đã xác minh từ runtime.
- Nhập 5 dòng `documents`: DRAFT, INTERNAL_YOUTH, `source_url` trỏ vào từng tệp Drive, `storage_path = NULL`.
- Giữ tên tệp Drive; không suy diễn số hiệu/ngày ban hành/nội dung. Hiệu lực: Chưa xác minh.
- Không sao chép 1566864 bytes tệp nguồn vào Storage; không tạo version/checksum giả, chunk, embedding, bài tri thức, credential hoặc quyền chia sẻ mới.
- `ai_processing_allowed = false`, `retrieval_enabled = false`, `current_version_id = NULL`.
- Ghi 5 audit events DOCUMENT_DRIVE_CATALOG_IMPORTED, actor NULL cho thao tác management được owner yêu cầu; không giả danh tài khoản quản trị.

## Danh mục đã nhập

| Tệp nguồn | Drive file ID | Document ID |
| --- | --- | --- |
| KH_tinhnguyen_dongxuan.pdf | `15pYljdPlA-nHsnha6jUZN7gHti4YecLz` | `a082432f-4dc9-4eed-97bf-7841d49cc8b4` |
| Ch__ng tr_nh_donghanhnguoiyeuthe - PhuTho_signed.pdf | `1wK4RRLgtgn6h581cs-_hb1Wcf2HrqVCC` | `ccb15380-540f-4668-bbe5-a871a0406f46` |
| Thể thức văn bản Đoàn.docx | `1DPZayoSNEQqeezkgBNR8zKQ9Hha8IXok` | `a024851e-e2b7-4e42-ac36-0d992028f7dc` |
| Kế hoạch triển khai phong trào 3 nhất trong đoàn viên thanh niên CAT Phú Thọ.doc | `1_kdEciVqzvJ4M8X0JNrEGXkid8UIvVDG` | `ce875364-18a0-4f27-9243-16460c990fbc` |
| QĐ 1518.pdf | `1AZMnkYIOVGSUdZ9QdFGNBmpmrDYlJcbB` | `5a426629-f6ca-4946-9c1b-3c8632d2bd5e` |

Snapshot metadata: `docs/google-drive-document-catalog.json`. Đây là hồ sơ nguồn tại ngày kiểm tra, không phải database hoặc cấu hình đồng bộ runtime.

## Xác minh sau nhập

- Management readback: 5 dòng danh mục/DRAFT/liên kết/audit; 0 tệp Storage gắn vào các dòng này; 0 dòng bật AI/retrieval; 0 canonical version.
- Transaction với role anon: 0 bản nháp được đọc; rollback sau phép thử.
- Trước nhập không có dòng tương ứng với 5 Drive IDs. Transaction có advisory lock theo folder ID; bỏ qua ID đã xuất hiện ở source_url hoặc document_sources.external_file_id.
- Chưa nghiệm thu trình duyệt với tài khoản quản trị. Không đổi frontend/schema/RLS/RPC/Edge Function/deployment; không gọi toàn bộ hệ thống PASS.

## Giới hạn và phần tiếp theo

- Đợt nhập ban đầu tạo bản nháp trong /admin/van-ban. Owner tiếp tục yêu cầu phát hành rồi mở công khai; cả 5 mục hiện PUBLISHED/PUBLIC, metadata chưa xác minh vẫn được ghi rõ.
- Thư mục hiện có quyền anyone/reader. RLS bảo vệ danh mục, không thu hồi quyền mở liên kết Drive đã có. Tài liệu hạn chế phải dùng thư mục private và gateway kiểm quyền.
- Không tự đồng bộ tệp mới/xóa/sửa. Connector Drive của phiên Codex không cấp credential cho phần mềm; backend OAuth phải được cấp quyền đúng tệp/thư mục.
- GoogleDriveStorageProvider hiện từ chối public objects; không bỏ guard để đưa nguồn public vào luồng private.
- Form admin có sourceUrl nhưng createDraft/updateMetadata không gửi nó đến RPC hiện có. Đợt này dùng management transaction có audit; không tuyên bố form đã hỗ trợ nhập thêm liên kết. UI nhập nguồn cần RPC ghi liên kết atomic, kiểm scope và regression riêng.
- AI cần đọc tệp qua gateway, checksum, version/source thật, trích xuất và duyệt evidence theo Phase 5; danh mục liên kết chưa đủ để Ask AI đọc nội dung.

## Hướng sửa / hoàn tác

Không xóa tệp Drive hoặc audit log. Sửa metadata của từng bản nháp qua quản trị. Nếu không dùng nguồn nữa, đánh dấu đúng các document IDs ở trên WITHDRAWN qua thao tác được cấp quyền, giữ audit. Không sửa fixture hoặc tài liệu khác. Tệp Drive không chịu tác động từ đợt nhập.

## [2026-10-07] Đọc bản gốc và chuẩn bị bổ sung metadata

Đọc cả 5 tài liệu, đối chiếu số/ngày trên bản hiển thị Drive; lớp text PDF/DOCX không chứa đầy đủ
phần số/ngày ở đầu trang. `verified_metadata` trong JSON là bản đề xuất đã xác minh nguồn, chưa
phải readback sau cập nhật database. Trạng thái áp dụng: `PENDING_AUTHORIZED_ADMIN_SESSION`.

| Tài liệu | Số, ký hiệu | Ngày ban hành | Cơ quan ban hành | Ngày hiệu lực trong bản gốc |
| --- | --- | --- | --- | --- |
| Tình nguyện mùa đông 2026 - Xuân tình nguyện 2027 | 8849/KH-CAT-PX03 | 01/10/2026 | Công an tỉnh Phú Thọ | Không nêu riêng |
| Đồng hành, hỗ trợ người yếu thế 2026 - 2030 | 8848/CTr-CAT-PX03 | 01/10/2026 | Công an tỉnh Phú Thọ | Không nêu riêng |
| Thể thức văn bản Đoàn | 186-HD/BTN | 14/04/2026 | Ban Thanh niên Công an tỉnh Phú Thọ | Không nêu riêng |
| Phong trào thi đua Ba nhất | 133-KH/ĐTN | 28/11/2025 | Ban Thanh niên Công an tỉnh Phú Thọ | Không nêu riêng |
| Quy định tổ chức và hoạt động của Đoàn trong CAND | 1518-QĐ/TWĐTN-CTĐ | 08/08/2025 | Ban Thường vụ Trung ương Đoàn TNCS Hồ Chí Minh | 08/08/2025, Điều 2 |

JSON còn chứa tiêu đề chuẩn, loại văn bản, phạm vi, tóm tắt, từ khóa và dẫn chứng cho từng mục.
Không lấy thời gian tổ chức hoạt động làm ngày hiệu lực/hết hiệu lực; không kết luận văn bản
hiện còn hiệu lực khi chưa kiểm tra văn bản thay thế. Không đưa nội dung vào AI/RAG trong đợt này.

Read-only database xác nhận metadata cũ còn trống. Automatic approval review từ chối transaction
SQL cập nhật 5 bản ghi và audit trực tiếp vì bỏ qua `update_document_metadata` và xác thực actor.
Transaction không chạy, không có metadata/audit mới. Trang quản trị chưa có session; cần owner
đăng nhập để cập nhật qua RPC hiện hữu. Không giả danh người dùng hoặc tạo credential để vượt rào.

Owner đã đăng nhập sau lời nhắc; trang `/admin/van-ban` báo “Không có quyền truy cập”. Phiên hiện
có chưa đủ quyền quản trị văn bản; vẫn chưa ghi metadata. Cần tài khoản có quyền YOUTH_ADMIN phù hợp.

Bản sửa giao diện, kiểm thử và giới hạn triển khai: `docs/document-mobile-reader-fix-2026-10-07.md`.
