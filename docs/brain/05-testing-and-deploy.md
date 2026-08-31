# 05 — Testing & Deploy

> Mọi lệnh để dựng môi trường, chạy, test, build, deploy. Agent đọc đây thay vì đoán lệnh.
> Chi tiết bổ sung: `docs/05-testing.md`, `docs/06-deploy.md`.

## Cài đặt môi trường local

```bash
cp .env.example .env.local
npm install
```

Biến môi trường frontend (`.env.local`, không commit — chỉ giá trị public):
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Secret backend (Supabase Secrets, KHÔNG đưa ra frontend): `SUPABASE_SERVICE_ROLE_KEY`,
Gemini API key, email provider key. Xem `01-architecture.md` mục Biến môi trường.

## Chạy local (dev)

```bash
npm run dev
```
Truy cập: http://localhost:5173 (cổng mặc định Vite).

### Xem nhanh khi chưa cài dependency
Phục vụ thư mục qua HTTP và mở `preview.html` (React qua ESM CDN, chỉ để duyệt giao diện):
```bash
python -m http.server 4173
# http://localhost:4173/preview.html
```

## Build (production)

```bash
npm run build
```

## Test

```bash
npm test          # node --test tests/*.test.mjs (unit thuần: status.mjs, AuthGuard)
npm run lint      # eslint src
```

### Bắt buộc chạy khi có Supabase rehearsal
1. `supabase db reset` và kiểm tra toàn bộ migration.
2. Tạo 2 tổ chức, 2 cán bộ chi đoàn, 1 quản trị viên.
3. Chạy các case trong `supabase/tests/rls_acceptance.sql`.
4. Test luồng nộp báo cáo, nộp lại, review, quá hạn.
5. Test tệp private bằng URL đoán trước và signed URL hết hạn.
6. Test AI chỉ truy hồi chunk `APPROVED`, đúng quyền.
7. E2E responsive tại 360, 390, 430, 768, 1440 px.

### Phase 5 cited retrieval rehearsal

Run on the non-production rehearsal project only: enable retrieval through its trusted RPCs for one
approved document/article, invoke `ask-ai` as an allowed user and confirm its evidence citation
opens the canonical document route. Repeat as a cross-organization user and with an unsupported
question; the former must reveal no source/metadata and the latter must return the no-evidence
answer. Record only source type, checksum, short IDs, statuses and result counts—never secrets,
tokens, storage paths or document body.

Checklist thủ công trước khi commit/push:
- [ ] `npm test` xanh và `npm run lint` sạch (không thêm cảnh báo mới).
- [ ] `npm run build` chạy được.
- [ ] Đã thêm entry vào `docs/brain/06-ai-working-log.md`.
- [ ] Nếu đổi kiến trúc/route/schema: đã cập nhật `01-architecture.md` (gồm Code Graph) + `03-decisions.md`.

## Deploy

Môi trường:

| Môi trường | Mô tả | Ghi chú |
|-----------|-------|---------|
| dev/local | Supabase CLI + seed | `supabase db reset` |
| rehearsal | Supabase project tách biệt | test migration/RLS/Edge Functions |
| production | promote sau checklist bảo mật + backup/restore | chỉ khi đã pilot |

Trình tự:
1. Tạo Supabase rehearsal, chạy migration.
2. Tạo buckets, secrets, lịch cron.
3. Deploy Edge Functions theo phase.
4. Cấu hình `.env.local` bằng URL + anon key (không dùng service role ở web).
5. Chạy test, build, smoke test route sâu.
6. Deploy frontend lên Vercel/Mắt Bão với SPA rewrite (`vercel.json`).
7. Pilot nhóm nhỏ trước khi mở toàn đơn vị.

Rollback: **không** sửa migration đã chạy — tạo forward-fix migration mới; rollback frontend về
deployment trước; tạm khóa chức năng lỗi bằng feature flag.

## Lưu ý

- Môi trường thi công có thể không tải được package từ registry — khi đó kiểm cú pháp bằng parser,
  ghi rõ nếu chưa chạy được build/test thật.
- Cron: nhắc hạn 07:00, chuyển OVERDUE 00:05, xử lý email queue mỗi 10–15 phút (xem spec mục 12).
- Chống gửi email trùng bằng khóa idempotency `{campaign_id}:{assignment_id}:{reminder_type}:{date}`.
