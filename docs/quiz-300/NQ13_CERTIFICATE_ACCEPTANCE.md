# NQ13 Learning Assessment & Digital Certificate Acceptance

## Certificate V2 hardening — asset security, one visual source, responsive (2026-10-08)

Status: **source gates PASS · local browser checks PASS · hosted runtime acceptance NOT RUN (BLOCKED)**.
Do not merge until the hosted section below is completed for the exact final head.

### Findings fixed (independent review of PR #72 head `b33ce249`)

| # | Finding | Fix |
|---|---------|-----|
| 1 | Raw 3250×3250 owner PNG was served at `/brand/chu-ky.png` | Moved out of `public/`; only a derivative is bundled |
| 2 | HTML used `object-fit: cover` in a 270×106 frame → real crop into seal/signature | `object-fit: contain`, `width:auto`; derivative is already tight-cropped |
| 3 | HTML, canvas and print each cropped differently (alpha scan only in canvas) | One derivative for all three; canvas alpha scan removed; print reuses the screen rule |
| 4 | Fixed 860×608 + horizontal scroll on phones | Whole certificate scales by width (`--cert-scale`), no sideways scroll |
| 5 | Print layout used mm overrides, different from screen/PNG | Print = same 860×608 design scaled ×1.3053 to 297×210 mm |
| 6 | Ctrl+P could print a certificate whose assets failed to load | `@media print` hides the certificate unless `data-assets-ready="true"` |

### Asset security decision

- **Owner source (never served):** `design-source/nq13-certificate/chu-ky-owner-source.png`,
  3250×3250 RGBA, 1,756,022 bytes, SHA-256
  `BFB2B8445D7B1FC22372880331ED013D08427212B0DDD1E9C1569F0E91881F28`. It lives outside `public/`
  and is not imported by any browser code, so Vite never publishes it (`dist/` contains no copy;
  verified after `npm run build`). A test pins this hash so the owner file cannot be altered silently.
- **Browser derivative:** `src/assets/certificate/chu-ky-certificate.png`, 1000×452 RGBA, 248,904 bytes,
  SHA-256 `BA5978FE0813A01A4912A221DEC05FC3916027C966C83942BB221C6EE6949249`. Built into
  `/assets/chu-ky-certificate-<hash>.png`. A test pins this hash too.
- **How it is made:** `python3 scripts/build-certificate-signature.py` verifies the source hash, crops only
  fully transparent padding (12 px margin), downsizes uniformly with a premultiplied Lanczos resize.
  No re-drawing, recolouring, splitting or re-positioning; seal and signature remain one image
  (visible-ink aspect 2565×1147 → derivative aspect 2.212). The script is deterministic (re-run gives the same hash).
- **Old URL:** `/brand/chu-ky.png` is no longer part of the build. Post-deploy check on the Preview is part
  of the hosted section (NOT RUN). Residual risk: the raw file still exists in git history of this PR branch
  (commit `b33ce249`) and in the repository's non-public `design-source/`; it is not served by the deployment.

### Source gates (local, this change)

- `npm ci`: OK. `npm test`: previous 261 → **267** tests; 267 passed, 0 failed, 0 skipped.
- `npm run lint`: 0 errors, 3 existing Fast Refresh warnings. `npm run build`: PASS (existing >500 kB chunk warning).
  `git diff --check`: clean.

### Local browser checks (headless Chromium + Vite dev harness with a synthetic certificate record)

These are NOT hosted/Preview acceptance — no Vercel Preview or Supabase was reachable from this session.

- Widths 360/390/430/768/1280/1440: whole certificate visible, document `scrollWidth == clientWidth`, no
  horizontal scroller, aspect 1.4145 at every width (scale 0.381/0.416/0.463/0.828/1/1), toolbar buttons inside the viewport.
- Downloaded PNG: 1754×1240; seal + signature complete and undistorted; QR decoded with `jsQR` (independent of the
  generator) from the PNG, from the rasterised PDF and from the 360 px screenshot → `/xac-minh-chung-nhan/<code>`.
- `page.pdf()` with print media: exactly 1 page, A4 (841.92×594.96 pt), no toolbar, certificate not cropped.
- Fail-closed: signature 404 → buttons disabled + clear message, print hides the certificate; corrupt PNG → same;
  canvas export rejects (`Không thể tải chữ ký và con dấu…`); slow load → "Đang tải…" then enabled; reload with cache → enabled.
- Caveat: Be Vietnam Pro webfont was unavailable offline, so glyph metrics used the fallback sans-serif.

### Hosted runtime acceptance — BLOCKED

Egress policy of this session returned 403 for `*.vercel.app` and `*.supabase.co`, and no rehearsal credential is
available here. Therefore **not run**: Preview READY check for the final SHA, `/brand/chu-ky.png` post-deploy probe,
real 23/30 (expected FAIL, no certificate), real 24/30 (PASS, one certificate, idempotent after reload), PNG download from
the Preview, QR decode from that PNG, Preview PDF, public verification + privacy, responsive check on the Preview,
fixture cleanup. No fixture was created and Production was not touched. Record results here when run.

## Final closure receipt — 2026-10-08

`NQ13_CERTIFICATE_END_TO_END_ACCEPTANCE_PASS`

- PR #67 MERGED 2026-10-08T07:11:55Z, final head `12bb681fb5f93c0e7649a7b745c3b2a67b90b79c`,
  merge/master `b3c5393fbdcb30980f458d784a0c00c41509f8b6`. Exact final CI37741131973 and
  post-merge CI37741972809 GREEN. Exact final Preview `dpl_UeVzasYhFjoNMxH9xbHbvck9dybe`
  [final Preview](https://so-tay-doan-vien-7lkwvwbzb-vi-phuong-158s-projects.vercel.app) READY.
  Fresh23FAIL/24PASS/PNG/jsQR/verify/A4PDF all PASS; final PDF135010bytes/515chars/108496dark pixels.
  Final synthetic actors/attempts/certificates0;9unmapped/7historicalcertificates/148units preserved.
- Actual master deployment `dpl_2dmLeZ6wPeW9anJMFGFF9xStJwX2` READY metadata=b3c5393;
  read-only browser Home/invalid-code verification/admin guest gate smoke PASS. #68 rebase retains
  print fix and both certificate migrations exactly once; further real30PASS certificate regression PASS.

- Starting #67 head7195fc33099f4d3446f4d17f6ec460a838115e63. Blank PDF reproduced on its
  exact Preview:1160bytes; print DOM certificate y857px outside pageheight794px because backdrop
  blur establishes containing block. Fix anchors print backdrop to page origin and disables blur.
- Fix head **8d950b8d9af9541e860612738265025f4b86292b**:
  [CI37739168454](https://github.com/vi-phuong-158/so-tay-doan-vien-so/actions/runs/37739168454)
  build/test-db/Member API GREEN;251frontend tests,lint0errors/3existingwarnings,build/diff clean.
- [Exact fix Preview](https://so-tay-doan-vien-8qe87iowt-vi-phuong-158s-projects.vercel.app)
  `dpl_94x7QyN4rUPcU9RoPxuJBSDxKmej` READY. Browser submit23/30=76.67%,passed=false,
  UI CHƯA ĐẠT/cần thêm1câu,certificate=null/noCTA; real24/30=80%,passed=true,1certificate.
  SQL quiz_answers/attempts/certificate counts match; no client grading/mocked responses.
- Actual PNG download1754x1240; independent jsQR decode exactly matches Preview verification URL;
  public verify valid/name matches/no Auth/attempt/email/answers. Auth cookie uses legitimate
  temporary protected-Preview access; never disables protection or commits credentials.
- Chromium print after actual In/Lưu PDF button: **one A4 landscape page841.92x594.96pt,
 135039bytes,515text chars,107502dark pixels**. pdfplumber text bounds inside page,
  pypdfium2 rendered page visually reviewed: full borders/name/unit/code/QR, no app chrome, not blank.
- Rehearsal NQ_RUNTIME_ASSERTIONS_PASS; exact3fixture actors/attempts/certificates cleaned,
  original9unmapped/7historicalcertificates/148catalogue preserved. No broad DELETE/Production DB.
- `scripts/nq-final-browser.mjs` start/finish/replay and `scripts/nq-verify-pdf.py` are repeatable
  acceptance helpers using existing runtime only. Keys/session tokens remain gitignored tmp.
- Receipt commit adds docs/evidence/helpers only; final exact latest head/CI/Preview and merge
  receipt are pinned in [PR #67](https://github.com/vi-phuong-158/so-tay-doan-vien-so/pull/67)
  after fresh exact-head23/24/PDF retest and cleanup. Conditional merge requires every gate green.

### Historical evidence below

Section4 preserves the previous blocked run; its verdict and remaining-risk list are historical,
superseded by this closure and the latest exact-head PR receipt.

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
  - Checkbox bắt buộc xác nhận thông tin chính xác và đồng ý hiển thị Họ tên, Đơn vị, kết quả khi tra cứu bằng mã/QR.
  - Thông báo trước khi nhập: Họ tên, Đơn vị và kết quả hoàn thành có thể hiển thị trên trang xác minh công khai nếu người khác có mã chứng nhận hoặc QR.
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
  - Banner: `HOÀN THÀNH ĐẠT YÊU CẦU`.
  - Hiển thị điểm số, tỷ lệ %, số câu đúng/sai/chưa làm, thời gian làm bài, Họ tên, Đơn vị, Ngày hoàn thành, Mã chứng nhận.
  - Chỉ hiển thị CTA `XEM CHỨNG NHẬN` khi RPC trả về certificate record hoàn chỉnh gồm code, Họ tên, Đơn vị, ngày cấp và kết quả.
  - PASS chưa có certificate hiển thị trạng thái chờ cấp và nút `TẢI LẠI KẾT QUẢ`; không render/tải/in chứng nhận.
  - CTA phụ: `Xem lại đáp án`, `Làm đề khác`, `Tra cứu 300 câu hỏi`.
- **CHƯA ĐẠT (<= 23 câu)**:
  - Banner: `CHƯA ĐẠT YÊU CẦU`, huy hiệu `CHƯA ĐẠT`.
  - Thông báo khuyến khích: `Bạn cần thêm X câu đúng để đạt yêu cầu (tối thiểu 24/30 câu đúng, tương đương từ 80%).`
  - CTA chính: `THI LẠI`.
  - CTA phụ: `Xem lại đáp án`, `Tra cứu 300 câu hỏi`.
  - **Tuyệt đối KHÔNG có nút Xem chứng nhận, không cấp chứng nhận**.

### 2.5. Chứng nhận điện tử & Đồ họa
- **Tiêu đề**: `CHỨNG NHẬN HOÀN THÀNH` (không dùng "bằng" hoặc "văn bằng").
- **Đơn vị xác nhận**: `BAN THANH NIÊN / CÔNG AN TỈNH PHÚ THỌ`; không tạo con dấu hoặc chữ ký giả. Certificate V2 hiển thị đúng hierarchy ký `TM. BAN THANH NIÊN` → `TRƯỞNG BAN` → asset thật owner cung cấp → `Hoàng Tuấn Việt`.
- **Huy hiệu Đoàn**: Sử dụng trực tiếp `public/brand/logo-doan-badge.png`.
- **Asset ký V2**: ảnh gốc owner cung cấp (con dấu đỏ + chữ ký xanh chồng nhau) nằm ở `design-source/nq13-certificate/` và KHÔNG được publish. Trình duyệt chỉ dùng bản derivative `src/assets/certificate/chu-ky-certificate.png` (crop padding trong suốt, thu nhỏ đồng đều, giữ aspect; không tách, đổi màu hoặc vẽ lại). HTML (`object-fit: contain`), canvas và print dùng chung đúng một derivative.
- **Mã chứng nhận**: Định dạng `NQ13-[A-Z0-9]{8,32}`, entropy cao, tính idempotent (mỗi lượt thi đạt chỉ cấp đúng 1 chứng nhận).
- **Tồn tại vĩnh viễn (Retention resilience)**: Khóa ngoại `nq_certificates.attempt_id REFERENCES quiz_attempts(id) ON DELETE SET NULL` giúp chứng nhận tồn tại ngay cả khi tài khoản guest anonymous bị xóa sau 30 ngày.
- **Thiết kế V2**: dùng token xanh Đoàn `brand-900/800/700/100/050`, nền trắng/xanh rất nhạt; huy hiệu chính thức làm watermark giữa trang ở opacity 4.5%. Không dùng viền hoặc palette đỏ-vàng cho certificate.
- **Tải ảnh PNG**: Render trực tiếp canvas A4 ngang 1754×1240 (`src/lib/certificateCanvas.js`), fit chữ tên và wrap đơn vị; watermark, QR, dữ liệu và signature block đồng bộ HTML; tên file chuẩn hóa: `Chung-nhan-NQ13-[TEN-NGUOI-DUNG].png`. Thiếu asset chữ ký/con dấu thì export từ chối.
- **In / Lưu PDF**: `@media print` ẩn app chrome/layout, đặt trang A4 landscape, in đúng layout 860×608 phóng ×1.3053 lên 297×210 mm, giữ watermark nhạt và chữ ký, ẩn nội dung ngoài chứng nhận; không in nếu asset chưa tải xong.

### 2.6. QR generation và decoder test độc lập
- `src/lib/qrCode.js` dùng thư viện `qrcode` cho QR Model 2 / Error Correction Level M, bao gồm Version Information và mask selection do thư viện xử lý.
- Quiet zone tối thiểu 4 modules được áp dụng cho SVG và Canvas; SVG được dựng qua React `<svg>`/`<rect>`.
- `jsqr` là dev-only decoder độc lập. `tests/qr_code.test.mjs` decode payload short, URL xác minh và URL Preview dài lên Version 7+, sau đó so sánh exact text. Đây là decoder test trên pixel buffer của QR matrix; browser PNG download/decode vẫn phải được xác minh riêng trước verdict PASS.
- URL mã hóa trong runtime: `{window.location.origin}/xac-minh-chung-nhan/{certificateCode}`; không hardcode hostname production/Preview.

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
3. `supabase/tests/nq13_certificate_assessment.sql`: Bộ 18 test assertions pgTAP về schema, quyền, submit participant và retention.
4. `scripts/nq-runtime-check.sql`: Kịch bản SQL runtime về submit thiếu participant, deadline legacy, ranh giới 23/24 câu, idempotency, privacy, guest isolation và retention.
5. `supabase/migrations/20261008120000_nq13_certificate_submit_requires_participant.sql`: chặn submit trước hạn thiếu participant snapshot; certificate response kèm score/count từ record đã lưu.

---

## 4. Historical Acceptance Evidence (2026-10-08, before closure)

### Verdict

`NQ13_CERTIFICATE_ACCEPTANCE_BLOCKED`

Browser acceptance on `bddb3c607fe98db34f2cc7412450cf3c579f1d9f` verified the mobile guest PASS flow, certificate viewer, real PNG download, independent QR decode, public VALID verification, desktop layout, and invalid-code handling. The required 23/30 browser FAIL result was not reached because the current browser bridge dismissed the native submit confirmation. The Preview print-to-PDF output was a blank A4 landscape page. A local print-CSS fixture now renders content, but it does not replace a retest on the exact final Preview.

### PR and source heads

- Existing PR: [#67](https://github.com/vi-phuong-158/so-tay-doan-vien-so/pull/67), open and not merged. No duplicate PR created.
- Branch: `codex/nq13-learning-certificate`; starting head: `4cd7cac8ee67a8cce0a23ca36ae996fe3f7f02f4`.
- Browser-tested code head: `bddb3c607fe98db34f2cc7412450cf3c579f1d9f`.
- The evidence/documentation update and print-visibility CSS adjustment are recorded by the commit that updates this file; their exact head is shown by PR #67 and the final handoff report.
- Last fully verified CI before this evidence update: GitHub Actions run `37711174407` passed build, database, and member API jobs on `bddb3c6`.
- Last fully verified Vercel Preview before this evidence update: deployment `dpl_3rR3BeSXPBN9BFB6YVkjxidEnm8R`, state `READY`, source SHA `bddb3c607fe98db34f2cc7412450cf3c579f1d9f`. Branch alias: `https://so-tay-doan-vien-so-git-codex-nq-500c6d-vi-phuong-158s-projects.vercel.app`.
- The new evidence commit must have CI and Vercel status checked again; the browser results below are from `bddb3c6`, so exact-final-head acceptance remains blocked until retested.

### Local validation

- `npm test`: 251/251 PASS, 0 skipped.
- `npm run lint`: 0 errors; 3 pre-existing Fast Refresh warnings.
- `npm run build`: PASS; existing warning for the 593.33 kB main JavaScript chunk.
- `git diff --check`: PASS.
- A local Playwright print fixture using the repository CSS rendered certificate content at A4 landscape dimensions. This is CSS-level evidence only; the exact Preview print test remains blocked by the blank PDF output recorded below.

### Database runtime

- Rehearsal only: Supabase project `znexculhbdjiflkczpyu` (`so-tay-doan-vien-rehearsal`, `ACTIVE_HEALTHY`). Production was not used.
- Applied the participant-required migration to rehearsal; recorded migration version `20261008003637 / nq13_certificate_submit_requires_participant`.
- pgTAP: `supabase/tests/nq13_certificate_assessment.sql`, 18/18 assertions PASS.
- Runtime SQL: `scripts/nq-runtime-check.sql` returned `NQ_RUNTIME_ASSERTIONS_PASS`. It covers participant-required submission, 23/30 FAIL, 24/30 PASS, no certificate on FAIL or without participant, unique/idempotent issuance, public verification privacy, guest isolation, and retention after guest cleanup.
- Browser-created synthetic PASS certificate and a synthetic 23/30 attempt remain in rehearsal. The latter was not submitted from the browser because the confirmation dialog was dismissed by the current bridge.

### Browser acceptance on the branch Preview

- Viewports exercised: mobile `390 × 844`; desktop `1440 × 900`.
- Home showed the NQ13 campaign banner and both quiz/lookup CTAs.
- Participant gate: empty submission was blocked; privacy notice and consent copy named public display of name, organization, and completion result. Synthetic long name and long organization were accepted.
- PASS flow: browser submitted exactly 24/30 and displayed `80%`, PASS, participant snapshot, issue date, and real certificate code `NQ13-40D2529DCFBD430D`.
- Certificate viewer: mobile reflow and desktop layout were inspected; long name/organization stayed within the certificate bounds, QR remained visible, and footer did not overlap.
- Invalid code route showed `CHỨNG NHẬN KHÔNG HỢP LỆ HOẶC KHÔNG TỒN TẠI`.
- FAIL flow: 30 answers for a synthetic 23/30 attempt were selected, but `window.confirm('Nộp bài và xem kết quả?')` was auto-dismissed by the browser bridge. No browser result screen was observed. SQL runtime proves the backend 23/30 boundary, but the browser FAIL gate remains open.
- Quick lookup regression, authenticated-user flow, and browser 20-minute auto-submit were not completed. Legacy expiry and no-certificate behavior are covered by rehearsal SQL assertions.

### QR independent decode

- Browser PNG verification URL expected:
  `https://so-tay-doan-vien-so-git-codex-nq-500c6d-vi-phuong-158s-projects.vercel.app/xac-minh-chung-nhan/NQ13-40D2529DCFBD430D`
- Decoded from the actual downloaded PNG using OpenCV `QRCodeDetector`:
  `https://so-tay-doan-vien-so-git-codex-nq-500c6d-vi-phuong-158s-projects.vercel.app/xac-minh-chung-nhan/NQ13-40D2529DCFBD430D`
- Exact payload comparison: PASS. The public page showed `CHỨNG NHẬN HỢP LỆ`, the matching synthetic participant, 24/30 and 80%, and no email or phone number.

### PNG and print acceptance

- Actual browser download event: PASS. File: `Chung-nhan-NQ13-NGUYEN-THI-PHUONG-THAO.png`, 195,984 bytes, PNG 1754 × 1240.
- The downloaded file is now `docs/quiz-300/evidence/nq13-certificate-sample.png`; it was not manually edited. QR decode is independently verified above.
- Preview print attempt produced one A4 landscape PDF page with no text and a white page: FAIL. A local print fixture with the current visibility selectors rendered certificate content at A4 dimensions, but Preview PDF/print still needs browser verification on the final head.

### Visual evidence

All samples use synthetic test data and come from the browser or the real Canvas PNG exporter:

- `docs/quiz-300/evidence/nq13-certificate-sample.png`
- `docs/quiz-300/evidence/nq13-home-mobile-390.png`
- `docs/quiz-300/evidence/nq13-participant-gate-mobile-390.png`
- `docs/quiz-300/evidence/nq13-pass-result-mobile-390.png`
- `docs/quiz-300/evidence/nq13-certificate-viewer-mobile-390.png`
- `docs/quiz-300/evidence/nq13-certificate-viewer-desktop-1440.png`
- `docs/quiz-300/evidence/nq13-public-verification-valid-mobile-390.png`

### Remaining risks

- The 23/30 browser result screen still needs to be observed.
- Preview print/PDF must be retested because the observed PDF was blank.
- Final evidence/docs commit needs exact-head CI and Vercel READY checks; browser evidence currently references the previous code head `bddb3c6`.
- Authenticated member, quick lookup, and 20-minute browser auto-submit regressions are not covered by this run.
- Existing `npm audit` advisories were not introduced by the certificate dependency update: brace-expansion, dompurify 3.4.13, js-yaml 4.3.1, and source-map-js 1.2.1.
