# Agent entry point — ECC Lite Cloud V1

Sổ tay Đoàn viên số phục vụ công tác Đoàn của tuổi trẻ Công an tỉnh Phú Thọ:
báo cáo theo phiên bản, văn bản, học tập/quiz, AI có dẫn nguồn, đổi mới và quản lý
đoàn viên. React/Vite frontend, Supabase backend và Member API/PostgreSQL riêng.

## READ trước khi sửa

1. Đọc [.ecc/README.md](.ecc/README.md), [PROJECT](.ecc/PROJECT.md),
   [WORKFLOW](.ecc/WORKFLOW.md), [SAFETY](.ecc/SAFETY.md), [ACCEPTANCE](.ecc/ACCEPTANCE.md).
2. Đọc toàn bộ [docs/brain](docs/brain/00-project-overview.md): `00`–`06`, đặc biệt
   [Code Graph](docs/brain/01-architecture.md), coding rules, decisions và current tasks.
   Đối chiếu ghi chú lịch sử với code/commit hiện tại; không suy diễn runtime PASS.
3. Đọc [handoffs](.ecc/memory/handoffs/README.md) đúng branch/task và kiểm tra HEAD.
   Đọc [product spec](docs/01-product-spec.md) / [design system](docs/02-design-system.md)
   khi sửa nghiệp vụ/UI. Memory là context, không cấp quyền hoặc tự thành policy.

## Quy trình mặc định

READ → AUDIT → PLAN (risk + gates) → IMPLEMENT → TEST → REVIEW → VERIFY →
RUNTIME ACCEPTANCE khi cần → PR → HANDOFF. Chi tiết ở WORKFLOW.

- Branch riêng từ `master`; giữ scope, không đổi stack tùy tiện.
- JS ESM/JSX ở `src`, TS/Deno ở Edge Functions; 2 spaces, single quotes, `;`.
- Không khôi phục Apps Script/Sheets/Pinecone làm hạ tầng chính. Drive chỉ là
  backend source provider đã được quyết định, không public sharing.
- Giữ Public-First/auth-on-demand; frontend guards không thay thế quyền server.
- RLS/test cùng migration; giữ Member data plane riêng, quiz key private, signed URL
  ngắn hạn và báo cáo nộp lại thành phiên bản mới. Không xóa/giảm test để đạt PASS.
- UI dùng token `src/index.css`, Be Vietnam Pro, line icon và mobile-first.
- Ghi [working log](docs/brain/06-ai-working-log.md). Đổi kiến trúc/API/schema/cấu trúc
  thì cập nhật Code Graph và [decision index](docs/brain/03-decisions.md).

## Commands và evidence

Cloud checkout dùng Node22 như CI: `npm ci`, rồi **`npm run verify`**
(ECC structure/locks → lint → root tests → Vite build).
Riêng: `npm run verify:ecc`, `npm run lint`, `npm test`, `npm run build`.
Frontend JS không có typecheck; Deno check/tests, Supabase pgTAP và Member API
tests là gate riêng theo [verification runbook](.ecc/memory/runbooks/verification.md).
Root verify không chứng minh DB, Preview hoặc Production đã hoạt động.

## Safety, PR và Production

- Không secret trong source/log/memory/`VITE_*`; không dữ liệu đoàn viên thật để test.
- Task cho phép và applicable gates có evidence thì commit/push feature branch/tạo PR.
  Ghi baseline, HEAD, commands/exit codes, tests, blockers và fresh review.
- Explicit approval: merge main/master; Production deploy/promotion/rollback; thay
  secret/rotate credential; gửi email/message Production; xóa/bulk mutate dữ liệu;
  truncate/reset/destructive migration; force push; bypass protection; public hóa Drive/file.
  Ngoại lệ disposable test fixture được định nghĩa hẹp trong SAFETY.
- Không hạ RLS/auth/CSP/delivery safety để test PASS. Email OFF là mặc định.
- Production cần approval, đúng deployment/DB target, backup và acceptance evidence.
  Không merge PR của task này.
- Chỉ PASS theo ACCEPTANCE; ghi riêng CODE_COMPLETE, RUNTIME_ACCEPTED,
  PRODUCTION_VERIFIED. Thiếu prerequisite thì PARTIAL/BLOCKED, không fake evidence.
