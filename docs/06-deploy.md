# Triển khai

## Môi trường

- `dev/local`: Supabase CLI, dữ liệu seed.
- `rehearsal`: dự án Supabase tách biệt, dùng kiểm thử migration/RLS/Edge Functions.
- `production`: chỉ promote sau checklist bảo mật và backup/restore.

## Trình tự

1. Tạo Supabase rehearsal và chạy migration.
2. Tạo buckets, secrets và lịch cron.
3. Deploy Edge Functions theo phase.
4. Cấu hình `.env.local` bằng URL + anon key; không dùng service role ở web.
5. Chạy test, build và smoke test route sâu.
6. Deploy frontend lên Vercel/Mắt Bão với SPA rewrite.
7. Pilot nhóm nhỏ trước khi mở toàn bộ đơn vị.

## Rollback

Không sửa migration đã chạy. Tạo forward-fix migration mới, rollback frontend về deployment trước và tạm khóa chức năng gây lỗi bằng feature flag.
