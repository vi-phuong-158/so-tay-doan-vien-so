# 00 — Project Overview

> Bản tóm tắt vận hành cho AI agent. Đặc tả nghiệp vụ đầy đủ ở `docs/01-product-spec.md`.

## Mục tiêu

**Sổ tay Đoàn viên số** — nền tảng dùng chung phục vụ công tác Đoàn của tuổi trẻ Công an
tỉnh Phú Thọ. Ba giá trị cốt lõi:

- **Biết đúng:** cập nhật, tra cứu thông tin/văn bản chính thống, hỏi đáp AI có dẫn nguồn.
- **Làm đúng hạn:** nhận nhiệm vụ, nộp báo cáo theo phiên bản, được nhắc hạn.
- **Đổi mới thực chất:** đưa bài toán thực tiễn đến Câu lạc bộ đổi mới sáng tạo và nhân rộng
  giải pháp hiệu quả.

Tên đầy đủ trong hồ sơ công trình: *Sổ tay Đoàn viên số và Góc đổi mới sáng tạo tuổi trẻ
Công an tỉnh Phú Thọ*.

## Người dùng chính

- **Đoàn viên** — xem nội dung được phép, tra cứu văn bản, hỏi AI, học tập/trắc nghiệm, gửi
  bài toán đổi mới.
- **Cán bộ chi đoàn** — quyền đoàn viên + nộp/nộp lại báo cáo cho đơn vị, theo dõi lịch sử nộp.
- **Thành viên CLB đổi mới sáng tạo** — xử lý bài toán được phân công, cập nhật trạng thái
  nghiên cứu/thử nghiệm.
- **Ban Thanh niên / Quản trị nội dung (`YOUTH_ADMIN`)** — tạo thông báo, đợt báo cáo, quản lý
  văn bản/chuyên đề/quiz/công trình, phân công xử lý bài toán, xuất dữ liệu.
- **Quản trị hệ thống (`SYSTEM_ADMIN`)** — tài khoản, vai trò, đơn vị, cấu hình, secret, audit log.

## Phạm vi

### Trong scope (bản đầu)
- Đăng nhập & phân quyền theo đơn vị; trang chủ cá nhân hóa; thông báo & việc cần làm.
- Kho văn bản/tài liệu/biểu mẫu; trợ lý AI RAG có dẫn nguồn.
- Vòng đời báo cáo: tạo đợt → giao đơn vị → nộp/nộp lại theo phiên bản → review → nhắc hạn.
- Chuyên đề học tập & trắc nghiệm.
- Góc đổi mới sáng tạo: công trình + tiếp nhận/xử lý bài toán.
- Trang quản trị tổng hợp; audit log.

### Ngoài scope (bản đầu)
- Đoàn phí, chuyển sinh hoạt Đoàn, hồ sơ đoàn viên đầy đủ, xếp loại tự động.
- Mạng xã hội nội bộ, nhắn tin riêng, bình luận công khai.
- Tự công khai công trình chưa duyệt; tự công nhận sáng kiến.
- Tích hợp dữ liệu bí mật nhà nước / dữ liệu nghiệp vụ nhạy cảm.

## Điểm khác biệt / giá trị cốt lõi

Không chỉ là thư viện tài liệu mà là nền tảng gắn **thông tin → nhiệm vụ → đổi mới** trong một
luồng. Kế thừa có chọn lọc frontend từ dự án `baovenentang` nhưng **loại bỏ hoàn toàn** Google
Apps Script, Google Sheets/Drive làm hạ tầng chính và Pinecone — thay bằng Supabase + pgvector.

## Trạng thái dự án (2026-08-09)

Đang phát triển, **chưa production**.

- Frontend: 5 khu vực responsive + PWA shell đã dựng; **5 trang chính hiện chạy dữ liệu demo**
  (`src/data/mock.js`), chưa nối Supabase. Chỉ luồng Auth + trang Admin đã dùng Supabase thật.
- Backend: schema/RLS/RPC nền tảng + khung Edge Functions đã có (submit/review báo cáo, reminder,
  email queue, AI, xử lý tài liệu, bài toán đổi mới, export, ZIP).
- Đã xong Phase 1 (khắc phục bảo mật auth). Đang ở **Phase 2A — nền tảng luồng báo cáo**
  (branch `feat/phase-2a-report-foundation`); xem `docs/phase-2/`.
- Việc lớn còn lại: tạo Supabase dev/rehearsal, chạy migration, nối từng service thay mock,
  chạy RLS acceptance, E2E responsive trước khi production.
