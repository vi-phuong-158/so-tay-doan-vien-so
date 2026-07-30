# AGENTS — Sổ tay Đoàn viên số

1. Đọc `docs/01-product-spec.md` và `docs/02-design-system.md` trước khi sửa.
2. Không sửa production/main trực tiếp; mỗi phase dùng branch riêng.
3. Không tái đưa Apps Script, Sheets, Drive hoặc Pinecone thành hạ tầng chính.
4. RLS phải được viết và test cùng migration.
5. Không dùng service role key, Gemini key hoặc email secret ở frontend.
6. Không bỏ kiểm thử cũ để làm build pass.
7. Không tự mở rộng phạm vi nghiệp vụ.
8. Mọi dữ liệu private mở qua signed URL ngắn hạn.
9. Mỗi phase phải bàn giao migration, test, log thay đổi, rủi ro và hướng rollback/forward-fix.
10. Giao diện phải dùng token trong `src/index.css`, Be Vietnam Pro, line icon, mobile-first.
