# Kiến trúc triển khai

```text
React/Vite PWA
  -> Supabase Auth
  -> PostgreSQL + RLS
  -> Storage private/public theo bucket
  -> Edge Functions cho nghiệp vụ quan trọng
  -> Cron/queue cho nhắc hạn và email
  -> pgvector + Gemini cho RAG
```

Frontend hiện dùng custom history router để không tăng dependency. Mỗi route có URL riêng và hoạt động với rewrite SPA.

## Chế độ dữ liệu

- Demo: dữ liệu trong `src/App.jsx`, phục vụ duyệt UI/UX.
- Connected: service tại `src/services/supabaseClient.js` gọi Auth/REST/Edge Functions bằng anon key và access token.
- Production: loại bỏ dữ liệu demo khỏi các trang đã kết nối, giữ seed demo ở môi trường rehearsal.
