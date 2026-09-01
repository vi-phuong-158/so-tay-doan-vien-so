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

### Phase 5 closure baseline regression evidence

Use the same CI runtime when classifying an existing pgTAP failure. On 2026-08-31, exact base
`a91f7145` was replayed by manual CI run `33413402157` and failed the same four assertions as the
first closure candidate: anonymous notification read and three unexpected `profiles` INSERT grants.
The forward grant remediation then passed exact-head CI `33415028799` on `1cdc3d51d35d86338aacd8c88d138006dd3ad1d5`: reset/migration,
`Files=27, Tests=815`, `deno check`, and `deno test` (`74 passed`). This is CI evidence only; it
does not replace the non-production actor rehearsal.

### Phase 5 final rehearsal reconciliation (2026-09-01)

Connected Supabase management evidence was collected only for rehearsal project
`znexculhbdjiflkczpyu` (`so-tay-doan-vien-rehearsal`, `ACTIVE_HEALTHY`, PostgreSQL `17.6.1.155`).
The project was reconciled from `20260825154300_phase_5_function_privilege_hardening` to the exact
HEAD migrations `202608310001_phase_5_rag_retrieval` and
`202608310002_phase_5_baseline_privilege_stabilization`. RPC/RLS/grant checks passed: anonymous
retrieval EXECUTE and notification SELECT are denied; authenticated retrieval EXECUTE is limited to
the intended functions; search is SECURITY INVOKER; profile INSERT is denied and scoped update
columns are preserved. Security advisor findings were classified as existing project-wide notices.

Exact HEAD `1cdc3d51d35d86338aacd8c88d138006dd3ad1d5` deployed `ask-ai` v1,
`process-document` v1, and `generate-knowledge-article` v1 with `verify_jwt=true`; the no-op
`run-ingestion-jobs` foundation was not required for the selected pilot. An anonymous HTTP probe
returned controlled 401. The connector has no authenticated Auth/session or Edge Function invoke
operation and no secret-presence endpoint; consequently authenticated actor/runtime, Gemini
presence, pilot, Ask AI, citations, failure paths, cleanup, and UI gates remain blocked and are not
claimed as PASS. Production access: NO.

### Phase 5 authenticated runtime harness (2026-09-01)

`scripts/phase5-runtime-acceptance.mjs` is acceptance-only and uses the existing Supabase JS SDK.
It hard-rejects non-rehearsal URLs, creates random temporary Auth users only with a server/admin
credential, signs in normally to obtain user sessions, sends user JWTs to `ask-ai`,
`process-document`, and `generate-knowledge-article`, redacts sensitive output, and cleans up in a
`finally` block. Run with `npm run test:phase5:runtime` after supplying untracked rehearsal env
configuration. Current local run stopped before any remote mutation with
`PHASE_5_RUNTIME_BLOCKED_REHEARSAL_PUBLIC_CONFIG_REQUIRED`; no actor or pilot artifact was created.

### Phase 5 authenticated rehearsal execution (2026-09-01)

The untracked rehearsal configuration was preflighted by presence only and its URL was verified to
match `znexculhbdjiflkczpyu`; no credential values were printed. The configuration uses PowerShell
assignment syntax and was parsed into the harness child process only. Real Auth Admin bootstrap and
user password sign-in passed for synthetic admin, Organization A, and Organization B actors.

The anonymous `ask-ai` request was denied (HTTP 401 / `UNAUTHENTICATED`), and a normal User A was
denied the retrieval-manager RPC. The selected synthetic document then reached the deployed
`process-document` function, which failed closed with HTTP 400 / `GEMINI_NOT_CONFIGURED`.
Accordingly the runtime verdict is
`PHASE_5_RUNTIME_BLOCKED_REHEARSAL_PROVIDER_CONFIG_REQUIRED`; generation, review, retrieval, Ask
AI, citations, and UI gates remain unrun rather than assumed.

All artifacts from the failed rehearsal runs were removed under an exact-ID management cleanup;
the final counts for synthetic organizations, documents, sources, jobs, and storage objects were
zero. Production accessed: NO. The harness also has regression coverage for the Auth-compatible
temporary password length and controlled string-error payload decoding.

### Gemini model/dimension compatibility (2026-09-01)

The local untracked environment now has all Gemini variables required by the selected Phase 5
functions; their values were checked only as presence/equality booleans. The accepted identifiers
match `models/gemini-embedding-2` and `models/gemini-3.7-flash`. The processing request now asks
Gemini Embedding 2 for `output_dimensionality: 768`, validates a finite 768-number response, and
fails closed for an invalid dimension. Gemini 3.7 generation removes deprecated sampling
parameters; knowledge draft generation requests medium thinking and Ask AI requests low thinking.

Hosted secret sync is blocked locally because neither Supabase CLI nor a management secret-write
capability is present. An authorized owner must set exactly the four Gemini variables under the
rehearsal project's **Edge Functions → Secrets** page. This is the only permitted configuration
target; Production remains out of scope.

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
