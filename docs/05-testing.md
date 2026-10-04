# Kiểm thử

## Current verification

npm ci rồi npm run verify (structure/locks, lint, root tests, build).
DB/Deno/Member/runtime gates riêng: [.ecc verification](../.ecc/memory/runbooks/verification.md).
Root tests có pure/service-mock/source-contract suites; phần dưới là lịch sử ban đầu.

## Đã chạy trong gói bàn giao ban đầu

```bash
node --test tests/*.test.mjs
```

Bộ test kiểm tra ánh xạ trạng thái, tính số ngày đến hạn và chuẩn hóa tên tệp.

## Bắt buộc chạy khi có Supabase rehearsal

1. Migration/RLS trên disposable local/CI đã verify target. Reset chỉ theo
   [.ecc DB gate](../.ecc/memory/runbooks/database.md), không reset hosted/shared rehearsal
   nếu chưa explicit approval.
2. Tạo hai tổ chức, hai cán bộ chi đoàn và một quản trị viên.
3. Chạy các case trong `supabase/tests/rls_acceptance.sql`.
4. Test luồng nộp báo cáo, nộp lại, review và quá hạn.
5. Test tệp private bằng URL đoán trước và signed URL hết hạn.
6. Test AI chỉ truy hồi chunk `APPROVED`, đúng quyền.
7. E2E tại 360, 390, 430, 768 và 1440 px.
