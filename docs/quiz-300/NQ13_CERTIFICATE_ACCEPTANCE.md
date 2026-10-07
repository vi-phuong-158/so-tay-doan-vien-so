# NQ13 Learning Assessment & Digital Certificate Acceptance

## 1. Tổng quan & Mục tiêu

Nâng cấp chuyên đề trắc nghiệm NQ_300 thành hoạt động chính thức:
**"KIỂM TRA HỌC TẬP — NGHỊ QUYẾT ĐẠI HỘI ĐOÀN TOÀN QUỐC LẦN THỨ XIII"**
dành cho toàn thể đoàn viên, thanh niên và quần chúng nhân dân thuộc Công an tỉnh Phú Thọ.

### Luồng nghiệp vụ khép kín:
`Trang chủ (Campaign Banner)`
→ `Bắt đầu thi`
→ `Nhập Họ tên + Đơn vị & Xác nhận thông tin`
→ `Làm bài thi 30 câu ngẫu nhiên / 20 phút (Server-side snapshot & auto-submit)`
→ `Nộp bài & Chấm điểm (Server-side source of truth)`
→ `Phân loại ĐẠT (>= 80% / >= 24 câu) hoặc CHƯA ĐẠT (<= 23 câu)`
→ `Nếu ĐẠT: Tự động cấp Chứng nhận điện tử (Mã định danh duy nhất NQ13-XXXXXXXX, QR Code)`
→ `Xem / Tải ảnh PNG / In PDF`
→ `Xác minh công khai qua QR hoặc mã tra cứu tại /xac-minh-chung-nhan/:code`

---

## 2. Các yêu cầu nghiệp vụ đã triển khai

### 2.1. Hero/Campaign trên Trang chủ (`src/pages/Home.jsx`)
- Hiển thị ngay phần đầu `home-body` cho cả khách vãng lai (Guest) và đoàn viên đã đăng nhập.
- Kicker: `KIỂM TRA HỌC TẬP`
- Tiêu đề: `Nghị quyết Đại hội Đoàn toàn quốc lần thứ XIII`
- Thông số: `30 câu hỏi · 20 phút · Đạt từ 80%`
- Thông điệp: `Hoàn thành đạt yêu cầu để nhận chứng nhận`
- CTA chính: `BẮT ĐẦU THI` (dẫn tới `/tri-thuc/trac-nghiem/7c620b81-6dc6-4a57-9908-3a1f68652a00`)
- CTA phụ: `TRA CỨU 300 CÂU HỎI` (dẫn tới `/tri-thuc/trac-nghiem/7c620b81-6dc6-4a57-9908-3a1f68652a00?view=lookup`)
- Asset huy hiệu Đoàn chính thống: `public/brand/logo-doan-badge.png`.

### 2.2. Thu thập & Snapshot thông tin người dự thi
- Modal nhập thông tin xuất hiện khi bấm `BẮT ĐẦU THI` hoặc khi tiếp tục (resume) lượt thi cũ chưa có snapshot:
  - **Họ và tên**: 2–120 ký tự, bắt buộc, tự động trim và escape.
  - **Đơn vị**: 2–180 ký tự, bắt buộc, tự động trim và escape.
  - Checkbox bắt buộc: `Tôi xác nhận thông tin trên là chính xác.`
  - Thông báo minh bạch: `Thông tin này được sử dụng để ghi nhận kết quả và cấp chứng nhận hoàn thành bài kiểm tra.`
  - Không thu thập CCCD, SĐT, địa chỉ, email.
- Dữ liệu được lưu trữ server-side tại bảng `public.nq_attempt_participants`, bất biến (immutable) sau khi nộp bài.

### 2.3. Ngưỡng chấm điểm 80% chuẩn mực máy chủ
- `pass_score = 80` đồng bộ trong database, migrations, seeds và runtime checks.
- Logic phân định nghiêm ngặt tại RPC `public.nq_attempt`:
  - `correct >= 24` (80.00% trở lên) → `passed = true` (ĐẠT).
  - `correct <= 23` (76.67% trở xuống) → `passed = false` (CHƯA ĐẠT).
- Máy chủ là nguồn chân lý duy nhất (server source of truth). Frontend tuyệt đối không tự chấm hay ghi đè kết quả.

### 2.4. Màn hình kết quả
- **ĐẠT (>= 24 câu)**:
  - Banner: `HOÀN THÀNH ĐẠT YÊU CẦU`, huy hiệu xanh `ĐẠT YÊU CẦU`.
  - Hiển thị điểm số, tỷ lệ %, số câu đúng/sai/chưa làm, thời gian làm bài, Họ tên, Đơn vị, Ngày hoàn thành, Mã chứng nhận.
  - CTA chính: `XEM CHỨNG NHẬN` (mở viewer chứng nhận).
  - CTA phụ: `Xem lại đáp án`, `Làm đề khác`, `Tra cứu 300 câu hỏi`.
- **CHƯA ĐẠT (<= 23 câu)**:
  - Banner: `CHƯA ĐẠT YÊU CẦU`, huy hiệu `CHƯA ĐẠT`.
  - Thông báo khuyến khích: `Bạn cần thêm X câu đúng để đạt yêu cầu (tối thiểu 24/30 câu đúng, tương đương từ 80%).`
  - CTA chính: `THI LẠI`.
  - CTA phụ: `Xem lại đáp án`, `Tra cứu 300 câu hỏi`.
  - **Tuyệt đối KHÔNG có nút Xem chứng nhận, không cấp chứng nhận**.

### 2.5. Chứng nhận điện tử & Đồ họa
- **Tiêu đề**: `CHỨNG NHẬN HOÀN THÀNH` (không dùng "bằng" hoặc "văn bằng").
- **Đơn vị xác nhận footer**: Text trang trọng `BAN THANH NIÊN / CÔNG AN TỈNH PHÚ THỌ` (tuyệt đối không tạo con dấu giả, chữ ký giả).
- **Huy hiệu Đoàn**: Sử dụng trực tiếp `public/brand/logo-doan-badge.png`.
- **Mã chứng nhận**: Định dạng `NQ13-[A-Z0-9]{8,32}`, entropy cao, tính idempotent (mỗi lượt thi đạt chỉ cấp đúng 1 chứng nhận).
- **Tồn tại vĩnh viễn (Retention resilience)**: Khóa ngoại `nq_certificates.attempt_id REFERENCES quiz_attempts(id) ON DELETE SET NULL` giúp chứng nhận tồn tại ngay cả khi tài khoản guest anonymous bị xóa sau 30 ngày.
- **Tải ảnh PNG**: Render trực tiếp canvas A4 ngang độ phân giải cao 1754×1240 (`src/lib/certificateCanvas.js`), tên file chuẩn hóa: `Chung-nhan-NQ13-[TEN-NGUOI-DUNG].png`.
- **In / Lưu PDF**: `@media print` ẩn toàn bộ chrome/layout, định dạng chuẩn A4 landscape.

### 2.6. Công nghệ QR Code không phụ thuộc thư viện ngoài (Zero-dependency)
- Module thuần ESM (`src/lib/qrCode.js`) triển khai thuật toán QR Code Model 2, Reed-Solomon Error Correction Level M trên trường hữu hạn $GF(256)$, mask evaluation tự động.
- Render SVG an toàn qua React JSX `<svg>` và `<rect>`, không dùng `dangerouslySetInnerHTML`.
- URL mã hóa: `{origin}/xac-minh-chung-nhan/{code}`.

### 2.7. Xác minh chứng nhận công khai (`/xac-minh-chung-nhan/:code`)
- Route công khai qua `src/pages/CertificateVerification.jsx` và RPC `public.verify_nq_certificate(p_code text)`.
- Không bắt buộc đăng nhập để xác minh.
- Bảo mật thông tin: Không trả về ID người dùng, email, attempt_id hay lịch sử câu trả lời.
- Giao diện tra cứu linh hoạt: Mở trực tiếp từ mã QR hoặc nhập mã thủ công vào ô tra cứu.

---

## 3. Danh mục Migration & Database Verification

1. `supabase/migrations/20261007230000_nq13_learning_certificate.sql`:
   - Cập nhật `pass_score = 80` cho NQ_300.
   - Tạo bảng `public.nq_attempt_participants` kèm RLS.
   - Tạo bảng `public.nq_certificates` kèm RLS.
   - Tạo RPC `public.nq_save_participant`.
   - Cập nhật RPC `public.nq_attempt` với logic chấm 80% và tự động cấp chứng nhận.
   - Tạo RPC `public.verify_nq_certificate`.
2. `supabase/seeds/nq300.sql`: Đồng bộ `pass_score = 80`.
3. `supabase/tests/nq13_certificate_assessment.sql`: Bộ 22 test assertions pgTAP kiểm thử toàn diện các điều kiện biên của database.
4. `scripts/nq-runtime-check.sql`: Kịch bản SQL kiểm tra runtime parity.

---

## 4. Kết quả Kiểm thử (Verification Matrix)

| Hạng mục kiểm tra | Công cụ / Môi trường | Kết quả | Ghi chú |
|---|---|---|---|
| Unit & Integration Tests | Node.js Test Runner (`npm test`) | **241 / 241 PASS** | Tăng 12 tests mới kiểm thử NQ13, QR, Campaign, Certificate |
| Frontend Code Style & Lint | ESLint (`npm run lint`) | **0 Errors, 3 Warnings** | 3 warnings cũ (Fast Refresh Guards/AuthContext) |
| Production Build | Vite Production Build (`npm run build`) | **SUCCESS** | Bundle tối ưu, không có compile errors |
| QR Code Engine | `tests/qr_code.test.mjs` | **PASS (2/2)** | Reed-Solomon GF(256), Matrix & SVG valid |
| Certificate & Validation | `tests/nq13_certificate.test.mjs` | **PASS (8/8)** | Bounded validation, 80% boundary, name sanitization |
| Home Campaign & Routes | `tests/home_campaign.test.mjs` | **PASS (4/4)** | Copy exact, CTAs, routes, anti-tamper assertions |
| Database Assertions | `supabase/tests/nq13_certificate_assessment.sql` | **22 Assertions Ready** | Coverage: 23 fail, 24 pass, idempotency, isolation, survival |
