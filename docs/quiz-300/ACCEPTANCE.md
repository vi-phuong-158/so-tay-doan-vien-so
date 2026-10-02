# QUIZ 300 — báo cáo triển khai và nghiệm thu

## VERDICT

`QUIZ_300_END_TO_END_BLOCKED_GITHUB_WRITE_ACCESS`

Code, migration, ngân hàng 300 câu và các luồng Quiz đã được triển khai/kiểm tra trên Supabase thật
của môi trường rehearsal. Chưa đưa frontend mới lên hosting, chưa push/tạo PR hoặc chạy đầy đủ CI:
GitHub trả HTTP 403 `Resource not accessible by integration`; git HTTPS không có credential ghi.
Không kết luận end-to-end PASS.

Ngân hàng và chuyên đề hiện được giữ **DRAFT** để frontend cũ không quảng bá một bài thi cần frontend
mới. Không xóa câu hỏi: 300 câu và 1200 phương án vẫn nằm trong Supabase. Seed mới không tự mở lại
ngân hàng khi chạy lại. Các tests nghiệp vụ chạy với publication tạm thời rồi rollback.

## STARTING SHA / FINAL SHA

- Starting SHA: `8f3d99425e0147bf045c95988589c2b7e6704df1`.
- Starting branch/worktree: `master`, sạch; không có thay đổi chưa commit của người khác.
- Task branch: `codex/quiz-300-nq`.
- Final SHA: được ghi trong thông báo bàn giao của commit chứa báo cáo này; chưa có SHA remote mới.

## SUPABASE TARGET

- Project name: `so-tay-doan-vien-rehearsal`.
- Project ref: `znexculhbdjiflkczpyu`.
- Environment: hosted rehearsal, `ACTIVE_HEALTHY`, PostgreSQL 17.
- Production accessed: **NO**.
- Đối chiếu từ `docs/brain/04-current-tasks.md`, `05-testing-and-deploy.md` và management metadata.
  Không suy đoán production project. Không sử dụng Supabase project khác.

## SOURCE VALIDATION

- Source: `Ngan hang 300 câu hỏi NQ.xlsx`, sheet `Sheet1`.
- Worksheet physical dimensions: 921 rows / 26 columns; 300 hàng dữ liệu trong các cột nghiệp vụ,
  bỏ qua các hàng trống/formatted bên ngoài ngân hàng.
- Excel data rows: **300**; valid questions: **300**; invalid questions: **0**.
- STT đầy đủ 1–300; duplicate question numbers: **0**.
- Tất cả có nội dung, đủ A/B/C/D và một key hợp lệ; cột mức độ đều null, không suy luận.
- Answer distribution: **A 98 / B 94 / C 65 / D 43**.
- Source SHA-256: `abdd3343948ff01bafc26a7ec4bc91a9b71214caf3535070ef2e51c7e0b14f6c`.
- Nội dung không sửa chính tả, diễn giải hay trim khoảng trắng. Ô **G104**, phương án D của
  **câu 103**, là số `1`; giữ nguyên thành text `1` ở database, không suy luận thành tỷ lệ phần trăm.
- Sau seed, đọc lại toàn bộ 300 câu/phương án/key từ database và so với canonical source:
  **300/300 khớp**, mismatches **0**.

## DATABASE

- Applied migrations:
  - `20261002133337_quiz_300_nq.sql`.
  - `20261002140348_quiz_300_legacy_guard_fix.sql`.
- Reused: `learning_topics`, `quizzes`, `quiz_questions`, `quiz_options`, `quiz_attempts`, `quiz_answers`.
- Additive fields: `bank_code`, `question_number`, `source_label`; partial unique indexes.
- Created: **one private snapshot table**, `quiz_private.attempt_snapshots`, with RLS and no client
  schema/table grant. Không có bộ bảng ngân hàng/attempt thứ hai.
- `TOTAL QUESTIONS = 300`.
- `DISTINCT question_number = 300`.
- `MIN(question_number) = 1`; `MAX(question_number) = 300`.
- Options: **1200**, mỗi câu 4 nhãn và một key đúng.
- Idempotency: chạy seed lần hai vẫn **300**, không tăng 600; chạy lại trong lúc có attempt
  synthetic vẫn giữ nguyên snapshot checksum `6d1154d551954c879bf028cadbc9f499`, deadline và status.
- Không reset, truncate, drop bảng hoặc xóa attempt nghiệp vụ. Fixture SQL rollback; fixture browser
  được cleanup đúng user ID/email. Số synthetic users cuối cùng: **0**.
- Migration thứ hai sửa alias guard `q` va chạm với record `q` của grader cũ; sau sửa, Quiz cũ
  qua lại đầy đủ 65 assertions.

## IMPLEMENTED

- Quiz: một chế độ 30 câu ngẫu nhiên từ 300, không trùng, đảo câu/4 lựa chọn; không giới hạn lượt.
- Timer: backend tạo immutable deadline đúng 20 phút; frontend đếm ngược theo `server_now` và
  monotonic elapsed time. Không dùng giờ máy người dùng để quyết định tính hợp lệ.
- Persistence: snapshot/order/deadline/selected IDs ở database. Refresh, rời trang và quay lại giữ
  attempt; pending selections khi mất mạng ngắn được lưu theo user/attempt, đồng bộ lại trong hạn.
- Grading: backend chấm 30 câu đã snapshot, tính đúng/sai/bỏ trống/tỷ lệ và actual elapsed time;
  không nhận score/key từ client. Submit lặp không tạo kết quả khác; submit xong không đổi đáp án.
- Expiry: browser tự submit; request muộn không ghi lựa chọn mới. Đóng browser rồi quay lại sẽ
  finalize từ các đáp án đã được server nhận, với submitted time chặn tại deadline.
- Review: hiển thị đầy đủ từng câu/options, lựa chọn người dùng, đáp án đúng và STT gốc.
- Lookup: số `1`, `300`, `Câu 125`, từ khóa câu/phương án; pagination 20; hiển thị A/B/C/D và key.
- UI: dùng route hiện có, Be Vietnam Pro, Lucide, card/button/color tokens; mobile-first.
- Không thêm Import/CRUD UI, AI, embeddings, leaderboard, pass/fail, chứng chỉ hoặc email.

## SECURITY

- Actual HTTP exam payload và SQL safe payload không chứa `correct`, `is_correct`, `answer_key`,
  `correct_option_id` hoặc explanation trước nộp.
- Snapshot private không có schema USAGE/table grant cho client; RLS bật.
- Không thay đổi policy/grants của bảng nghiệp vụ hiện có; không lộ service key.
- Cross-user read và answer mutation đều bị `ATTEMPT_SCOPE_DENIED`.
- Anonymous actual HTTP RPC bị từ chối; anon không có EXECUTE trên NQ RPC/lookup.
- Existing generic attempt RPCs từ chối NQ bank để không tạo/chấm một đề 300 câu bằng luồng cũ.
- Advisor notices mới: hai authenticated SECURITY DEFINER RPCs có explicit auth/owner checks và
  một private RLS/no-policy table — chủ ý deny direct access. Các notice extension/public helpers/
  password protection của project không được mở rộng hoặc sửa ngoài scope.

## TESTS

| Suite/gate | Kết quả thực tế |
|---|---|
| Excel extraction/validation | PASS, 300/300, invalid 0 |
| Hosted source/database equality | PASS, 300 matches, 0 mismatch |
| Hosted seed rerun / active snapshot stability | PASS |
| `npm test` | **208/208 PASS** (baseline 205 + 3 NQ tests) |
| `npm run lint` | **0 errors**, 3 warnings đã có ở Guards/AuthContext |
| `npm run build` | PASS; main chunk 529.40 kB, size warning |
| `git diff --check` | PASS |
| Hosted `scripts/nq-runtime-check.sql` | PASS: sample, time, save/resume, grading, expiry, immutability, ownership, anon ACL, lookup |
| Hosted `quiz_engine_attempts.sql` | **65/65 PASS**, sau forward fix |
| Hosted `learning_quiz_admin.sql` | **14/14 PASS** |
| Hosted `learning_foundation.sql` | **57/57 PASS** |
| Hosted `public_first_quiz_hardening.sql` | **4/4 PASS** |
| Actual Auth/HTTP `nq-http-acceptance.mjs` | PASS; password sign-in, RPC, resume, safe payload, anon denied |
| Member API local full command | 104 tests pass, 10 DB-dependent files blocked by missing `MEMBER_DATABASE_URL` |
| Member API baseline reproduction | Exact starting SHA reproduces the same missing database precondition in `schema.test.mjs`; `member-api` diff is 0 bytes |
| Full remote CI (all pgTAP/Deno/Member DB gates) | **NOT RUN**: no writable branch/PR; local Docker/PostgreSQL unavailable |

Hosted pgTAP runs dùng fixtures trong transaction, lưu toàn bộ TAP assertion output vào temp table
để kiểm tra `not ok`, rồi rollback. 140 assertions của 4 suite liên quan đều không có failure.
Đây không thay thế bằng chứng CI/reset từ exact pushed SHA.

## BROWSER ACCEPTANCE

- Playwright + Chromium headless; giao diện local build/dev dùng **Supabase thật**, không fake RPC/Auth.
- Mobile **390 × 844**: Tri thức → Trắc nghiệm → Bắt đầu thi → trả lời/chuyển câu → reload →
  giữ attempt/deadline/answers → rời trang/quay lại → offline/reconnect → trả lời 30 câu → nộp →
  kết quả → review 30 keys → lookup 1/300/Câu 125/từ khóa: **PASS**.
- Desktop **1440 × 1000**: lookup/retry/attempt, no horizontal overflow: **PASS**.
- Browser page errors: **0**; retry tạo attempt ID/bộ câu mới.
- Auto-submit: **PASS**, status `EXPIRED`, elapsed **1200 seconds**. Test rút ngắn thời gian chờ
  chỉ trên một attempt synthetic bằng backend fixture clock, giữ interval start→deadline 20 phút;
  browser nhận deadline mới, đếm về 0 và tự nộp. Không đổi timer cấu hình sản phẩm.
- Visual review: mobile attempt/result và desktop lookup đã được xem trực tiếp; text/control/card
  không bị vỡ hoặc horizontal overflow.
- Evidence: `evidence/mobile-{intro,attempt,result,review,lookup,auto-submit}.png`,
  `evidence/desktop-{lookup,attempt}.png`, `browser-summary.json`, `auto-submit-summary.json`.
- `agent-browser` daemon không chạy được; Playwright là fallback thực tế được sử dụng.

## FILES CHANGED

- `.github/workflows/ci.yml`.
- `src/pages/Quiz.jsx`, `src/pages/NqQuiz.jsx`, `src/services/nqQuizService.js`, `src/index.css`.
- Hai migrations và `supabase/seeds/nq300.sql`.
- `scripts/validate-nq-source.py`, `scripts/build-nq-seed.py`, `scripts/data/nq-300.json`.
- `scripts/nq-runtime-check.sql`, `scripts/nq-http-acceptance.mjs`, `scripts/nq-browser-acceptance.mjs`.
- `tests/nq_quiz.test.mjs`.
- Brain architecture, decisions, current task/log; acceptance report và screenshot evidence.
- Không commit `.env.local`, credential fixture hoặc Supabase CLI temp files.

## COMMITS / PR

- Commit thực hiện tại task branch local; SHA được ghi ở thông báo bàn giao.
- Push: BLOCKED; GitHub branch creation: HTTP 403.
- PR: chưa tạo được; merge master: **NO**; frontend deployment: **NO**.

## REMAINING RISKS

1. Frontend chưa deploy và full exact-SHA CI chưa chạy. Không thể tuyên bố production/end-to-end PASS.
2. Bank/topic DRAFT cần mở lại sau frontend deploy và các gate còn thiếu; dữ liệu đã seed không cần
   owner nhập lại hoặc tự chạy SQL.
3. Câu 103/D = `1` đúng nguyên file; nếu owner sửa source, cần validate/reseed đúng bank, không tự sửa.
4. Chấm expiry khi browser đóng là lazy finalization; deadline và việc chặn đáp án muộn vẫn có hiệu lực.

## NEXT STEP

Khôi phục quyền ghi cho kết nối GitHub của repository. Sau đó Agent có thể push commit, tạo PR,
chạy đầy đủ CI, deploy frontend, kiểm tra trên hosting và mở ngân hàng. Không mở phase mới.
