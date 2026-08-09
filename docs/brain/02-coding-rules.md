# 02 — Coding Rules

## Nguyên tắc chung

- Viết ít nhất có thể để giải quyết đúng task. Không tính năng speculative.
- Không abstraction sớm: 3 đoạn lặp vẫn tốt hơn 1 abstraction non.
- Không xử lý lỗi cho kịch bản không thể xảy ra.
- Comment WHY, không comment WHAT — tên biến/hàm đã nói WHAT.
- Không refactor code lân cận nếu không liên quan task.

## Nguyên tắc Ponytail ("senior dev lười hiệu quả")

> LUÔN có hiệu lực, trừ khi người dùng nói **"tắt ponytail"** / **"normal mode"**.
> Lười = hiệu quả, không phải cẩu thả. Code tốt nhất là code không cần viết.

### Thang quyết định — dừng ở nấc đầu tiên thỏa mãn
1. Việc này có cần tồn tại không? Nhu cầu suy diễn → bỏ qua, nói rõ 1 dòng. (YAGNI)
2. Thư viện chuẩn (stdlib) làm được? → Dùng nó.
3. Tính năng có sẵn của nền tảng phủ được? → Dùng (ràng buộc DB/RLS thay vì code, CSS thay vì JS).
4. Dependency đã cài giải quyết được? → Dùng. KHÔNG thêm thư viện mới cho việc vài dòng.
5. Gói trong 1 dòng được? → Một dòng.
6. Chỉ khi đó: viết lượng code tối thiểu chạy được.

### Quy tắc
- Không abstraction khi chưa được yêu cầu: không interface cho 1 implementation, không factory cho 1 sản phẩm, không config cho giá trị không bao giờ đổi.
- Không boilerplate, không scaffolding "để dành sau".
- Ưu tiên xóa hơn thêm. Đơn giản hơn "thông minh". Ít file nhất, diff ngắn nhất.
- Đánh dấu mọi đơn giản hóa có chủ đích bằng comment `ponytail:` kèm đường nâng cấp.

### TUYỆT ĐỐI KHÔNG được "lười" ở
- Validation dữ liệu đầu vào ở ranh giới tin cậy (Edge Function, RPC).
- Xử lý lỗi để tránh mất dữ liệu.
- Các biện pháp bảo mật (RLS, kiểm quyền phía server, signed URL).
- Bất cứ thứ gì người dùng yêu cầu rõ ràng.
- Logic không tầm thường (nhánh, vòng lặp, parser, đường tiền/bảo mật) → để lại ÍT NHẤT 1 kiểm tra chạy được (assert hoặc test nhỏ).

### Đầu ra
Code trước. Sau đó tối đa 3 dòng: bỏ gì, khi nào nên thêm. Không viết văn dài.

## Style code

- **Ngôn ngữ / runtime:** Frontend = JavaScript ESM + JSX (React 18, Vite). KHÔNG dùng
  TypeScript ở `src/`. Edge Functions = TypeScript trên Deno (import `npm:`/`Deno.serve`).
- **Format:** 2 spaces, dấu `;`, single quotes. Component React export theo tên
  (`export function X` / `export const X`), trừ `App` là default export.
- **Linter:** ESLint 9 flat config (`eslint.config.js`) với plugin react/react-hooks/react-refresh.
  Chạy `npm run lint` (lint `src`). Sửa cảnh báo do mình tạo, không để lint bẩn.
- **CSS:** chỉ dùng token trong `src/index.css` (màu, spacing, font Be Vietnam Pro). Mobile-first,
  line icon. Không hardcode màu/kích thước rời rạc.

## Đặt tên

- File component: `PascalCase.jsx` (`Home.jsx`, `Layout.jsx`). Lib/util: `camelCase.js`/`.mjs`.
- Route path tiếng Việt không dấu, gạch nối: `/cong-viec`, `/tri-thuc`, `/doi-moi-sang-tao`.
- Role code chữ HOA có gạch: `SYSTEM_ADMIN`, `YOUTH_ADMIN`.
- Trạng thái nghiệp vụ (báo cáo, tài liệu, bài toán) dùng HẰNG chữ HOA đúng như spec/`status.mjs`.
- Bảng/cột DB: `snake_case`; mọi bảng chính có `id` (UUID), `created_at`, `updated_at`.

## Bảo mật (quan trọng nhất trong dự án này)

- **Không** đưa `service role key`, Gemini key, email/SMTP secret vào frontend. Frontend chỉ
  `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. Không dùng `VITE_*` cho secret.
- Không tin client: mọi kiểm quyền tại RLS hoặc Edge Function; ẩn nút UI không phải bảo mật.
- Người dùng không được tự đổi `organization_id` hoặc `role`.
- Tệp nghiệp vụ private; mở qua **signed URL ngắn hạn**. Backend kiểm lại `mime_type`/kích thước,
  chuẩn hóa tên tệp (`normalizeSafeFileName`), chặn phần mở rộng nguy hiểm.
- Không commit `.env`/credential. Không log secret/mật khẩu/token/toàn bộ nội dung nhạy cảm.
- RPC `security definer` phải đặt `search_path` an toàn và tự kiểm quyền.
- AI chỉ dùng chunk `APPROVED` đúng phạm vi người dùng; không đưa tài liệu hạn chế cho người
  không có quyền.

## Không làm

- Không tái đưa Google Apps Script, Google Sheets/Drive, Pinecone hoặc API `/api/gas` làm hạ tầng.
- Không tự đổi stack / thêm framework UI lớn khi chưa ghi lý do vào `03-decisions.md`.
- Không tự mở rộng phạm vi nghiệp vụ (xem "Ngoài scope" ở `00-project-overview.md`).
- Không dùng dữ liệu `src/data/mock.js` như dữ liệu production.
- Không ghi đè phiên bản báo cáo đã nộp; không xóa vật lý thông báo đã phát hành.

## Test

- Unit test thuần: `npm test` (`node --test tests/*.test.mjs`) — hiện phủ `status.mjs` và
  `getAuthGuardAction`. Logic thuần mới nên tách ra để test được (như `getAuthGuardAction`).
- Khi có Supabase rehearsal: chạy `supabase db reset`, `supabase/tests/rls_acceptance.sql`, và
  các case luồng báo cáo/tệp private/AI. Chi tiết ở `05-testing-and-deploy.md`.
- **Không bỏ test cũ để làm build/lint pass.**

## Git

- Branch từ `master`, đặt tên rõ: `feat/...`, `fix/...`, `docs/...`. Mỗi phase một branch.
- **Không push thẳng `master`/production** nếu chưa được yêu cầu rõ ràng — tạo PR.
- Commit message: `type(scope): mô tả ngắn` (theo lịch sử repo, ví dụ `fix(auth): ...`).
- Không `--force` push trừ khi được yêu cầu rõ ràng.
- Mỗi phase bàn giao: migration + test + log thay đổi + rủi ro + hướng rollback/forward-fix.
