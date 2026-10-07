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
3. `supabase/tests/nq13_certificate_assessment.sql`: Bộ 16 test assertions pgTAP về schema, quyền, xác minh công khai và retention.
4. `scripts/nq-runtime-check.sql`: Kịch bản SQL kiểm tra runtime parity.

---

## 4. Final Acceptance Evidence (2026-10-08)

### Verdict

`NQ13_CERTIFICATE_ACCEPTANCE_BLOCKED`

The database runtime and a real rehearsal certificate passed. End-to-end browser acceptance is incomplete because the browser control bridge timed out after the submit confirmation dialog opened. The browser result screen, certificate viewer, QR, PNG download, print/PDF, and desktop flow were not verified.

### PR and CI

- PR: [#67](https://github.com/vi-phuong-158/so-tay-doan-vien-so/pull/67), open, mergeable, not merged.
- Branch: `codex/nq13-learning-certificate`; base: `master` at `a7f0aa2eb713e0cb619924fb0e43da1740de3459`.
- Browser-tested UI head: `c8d5791121a5bb9a46c15595ec78495d02e60d2b`.
- Runtime-assertion and evidence commit: `02722602e35bcc86aaa2a12a4a2769602c81fa19`. GitHub Actions run `37662296932` passed `build`, `member-api-test`, and `test-db`; Vercel and Vercel Preview Comments passed for this exact head.
- Exact-head Vercel deployment: `https://so-tay-doan-vien-aqy21kfgp-vi-phuong-158s-projects.vercel.app` (deployment `dpl_HmEQ2ahCqcwdSisM3CYYAoYPqqEy`, state `READY`, source SHA `0272260`).
- The new commit changes only the runtime SQL check and documentation. Its Preview was deployed successfully, but the browser flow was not retried on that deployment because the earlier browser control bridge timed out at submit.
- Local root checks: `npm test` 241/241; `npm run lint` 0 errors and 3 existing Fast Refresh warnings; `npm run build` succeeded with the existing >500 kB bundle warning.

### Database

- The Preview bundle and workspace `.env` both target Supabase project `znexculhbdjiflkczpyu`, verified as `so-tay-doan-vien-rehearsal` (`ACTIVE_HEALTHY`). Production was not accessed.
- Applied the PR migration only to that rehearsal project. Supabase recorded it as `20261007172523 / nq13_learning_certificate`.
- Ran `scripts/nq-runtime-check.sql` on rehearsal; result: `NQ_RUNTIME_ASSERTIONS_PASS`. The runtime script now exercises the exact `23/30 → 76.67% FAIL` and `24/30 → 80% PASS` boundaries, no certificate on FAIL, one idempotent certificate on PASS, participant immutability, public verification privacy, guest isolation, client write restrictions, and certificate survival after guest cleanup. The script transaction rolled back its fixtures.
- A separate browser-created synthetic guest attempt persisted all 30 selections. Internal rehearsal fixture inspection showed 24 correct and 6 wrong. The attempt was submitted through `public.nq_attempt` under the guest’s `authenticated` role after the browser bridge failed. The RPC returned 24/30, 80%, PASS, and issued `NQ13-4E6FBD0421A64629` for `Nguyễn Văn Kiểm Thử` / `Đơn vị kiểm thử NQ13`.
- Anonymous `verify_nq_certificate` returned VALID, the correct participant, score, issue time, and quiz title without auth IDs, email, or answer data. The synthetic attempt and certificate remain in rehearsal for inspection.
- The existing pgTAP file declares `plan(16)`; the earlier claim of 22 assertions was incorrect. Exact boundary and runtime coverage are in `scripts/nq-runtime-check.sql`.

### Browser acceptance

- Mobile viewport: `390 × 844` on the hosted `c8d5791` Preview. The home page showed the required campaign text and both CTAs. The participant form opened; empty submission was blocked. Synthetic participant data was accepted, and the quiz displayed 30 questions with a 20-minute timer. The frontend files are unchanged on `0272260`, but that exact-head Preview did not receive an interactive browser pass.
- All 30 answer controls were selected in the browser. The database snapshot confirmed 24 correct and 6 wrong. Clicking `Nộp bài` opened the application’s confirmation dialog, then the browser bridge timed out. A later read confirmed the attempt was still unsubmitted; the database RPC submission above was used to finish backend runtime verification.
- Because the browser bridge stopped, no browser PASS result screen, certificate viewer, direct verification route, invalid-code route, PNG download, print/PDF, desktop viewport, lookup regression, authenticated regression, or mobile certificate/verification layout was verified.
- QR unit tests passed, but no rendered certificate QR or independent scan was tested. Do not claim `QR SCAN PASS` or `QR_RENDER_AND_PAYLOAD_PASS` from this session.

### Session changes and limitations

- Changed `scripts/nq-runtime-check.sql` to cover the missing exact 23/30 boundary and strengthen runtime assertions.
- No feature implementation changes, production migration, merge, or master push were made.
- Final verdict remains `NQ13_CERTIFICATE_ACCEPTANCE_BLOCKED` until the browser gates above can be run on the exact final Preview head.
