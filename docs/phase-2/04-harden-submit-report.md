# P2-04 — HARDEN `submit-report`

**Phase:** 2 — Công việc & Báo cáo
**Task:** P2-04 (Edge Function orchestration an toàn — remediation S2, S7)
**Ngày:** 2026-08-09
**Branch:** `feat/phase-2a-report-foundation` (tiếp nối P2-03 @ `84d235d`)

> Chỉ chạm `submit-report`, `_shared/validation.ts`, và thêm 1 RPC bọc (atomic finalize). KHÔNG sửa `review-report` (P2-05), `create_report_submission` lõi (P2-02), storage policy (P2-03), frontend.

---

## 1. Before state

`submit-report` cũ (2 vấn đề P1):
- **S2 — tin metadata frontend:** dùng `size_bytes`, `mime_type`, `storage_path` do client gửi; chỉ kiểm `path.includes('/'+assignmentId+'/')` (yếu). Client có thể khai gian dung lượng/kiểu, hoặc trỏ path bất kỳ.
- **S7 — half-completed:** gọi `create_report_submission` (commit submission) **rồi** mới `adminClient.insert(report_submission_files)` ở bước riêng. Nếu insert file lỗi ⇒ submission tồn tại **không có file**, không rollback.

## 2. Threat → remediation

| Threat | Remediation |
| --- | --- |
| S7 — atomicity | RPC bọc `create_report_submission_with_files(uuid,text,text,jsonb)`: tạo submission + insert files trong **một transaction**. Lỗi bất kỳ ⇒ rollback toàn bộ. |
| S2 — tin metadata | EF **xác minh object Storage tồn tại** (`adminClient.storage.list`), dùng **size + mimetype THẬT** từ Storage (bỏ giá trị client), ràng `storage_path` bắt đầu bằng `{campaign}/{org}/{assignment}/` và không chứa `..`. |
| safe_name giả từ client | `safeFileName()` chuẩn hoá tên tải-về ở backend (không tin `safe_name` client). |

## 3. Kiến trúc — phân chia trách nhiệm

```text
Frontend (untrusted)
   │  upload file -> report-submissions-private/{campaign}/{org}/{assignment}/v?/uuid-file
   │  POST submit-report { assignment_id, summary, files:[{storage_path, original_name, checksum?}] }
   ▼
submit-report (trusted backend, service_role cho Storage; user JWT cho RPC)
   1. requireUser
   2. load assignment + campaign constraints (adminClient)
   3. mỗi file:
        - extension ∈ allowed_extensions
        - storage_path startsWith {campaign}/{org}/{assignment}/ , không '..'
        - Storage.list -> object PHẢI tồn tại; lấy size + mimetype THẬT
        - realSize ≤ max_file_size_mb
        - chống trùng storage_path trong cùng request
   4. userClient.rpc('create_report_submission_with_files', { ..., p_files: verified })
   5. notification best-effort (không rollback submission)
   ▼
create_report_submission_with_files (SECURITY DEFINER, 1 transaction)
   - gọi create_report_submission() (authz/lifecycle/version — P2-02)
   - ràng lại mỗi path theo prefix org/campaign/assignment (defense-in-depth)
   - insert report_submission_files
   - atomic: lỗi bất kỳ -> rollback cả submission lẫn files
```

Không trùng lặp logic: RPC bọc **gọi lại** RPC lõi (`create_report_submission`), chỉ thêm phần file. RPC lõi vẫn là source of truth về authz/lifecycle/version.

## 4. Files changed

| File | Thay đổi |
| --- | --- |
| `supabase/migrations/202608090003_phase_2_submit_report_atomic_finalize.sql` | RPC bọc `create_report_submission_with_files` (mới). |
| `supabase/functions/submit-report/index.ts` | Rewrite: verify Storage object + real size/mime, path binding, gọi RPC atomic, notification best-effort. |
| `supabase/functions/_shared/validation.ts` | Thêm `safeFileName()`. |
| `supabase/tests/report_submit_atomic_finalize.sql` | pgTAP cho RPC bọc (mới). |

## 5. Verification model (S2)

| Trường | Nguồn TIN CẬY |
| --- | --- |
| tồn tại object | `adminClient.storage.list(folder, {search})` — bắt buộc thấy object |
| `size_bytes` | **Storage metadata.size** (không dùng client) |
| `mime_type` | **Storage metadata.mimetype** (không dùng client) |
| `safe_name` | `safeFileName(original_name)` backend |
| `storage_path` | phải khớp prefix `{campaign}/{org}/{assignment}/`, không `..`, không trùng |
| `original_name`, `checksum` | client (không phải quyết định bảo mật; extension kiểm từ original_name) |

## 6. Atomicity model (S7)

`create_report_submission_with_files` chạy trong một transaction plpgsql:
- Gọi `create_report_submission()` (insert submission + update assignment + history + audit).
- Loop insert files.
- Nếu file nào sai prefix / vi phạm constraint / RPC lõi raise (terminal/time/role…) ⇒ exception propagate ⇒ **toàn bộ rollback** (không orphan submission, không orphan file).

## 7. Error model

Bổ sung/chuẩn hoá mã lỗi EF: `FILE_REQUIRED`, `TOO_MANY_FILES`, `INVALID_FILE_METADATA`, `FILE_TYPE_NOT_ALLOWED`, `FILE_SCOPE_INVALID`, `DUPLICATE_FILE_PATH`, `STORAGE_OBJECT_NOT_FOUND`, `FILE_TOO_LARGE`, `CAMPAIGN_NOT_FOUND`. Mã lỗi RPC (từ P2-02) tiếp tục nổi lên qua RPC. `UNAUTHENTICATED` → 401; còn lại → 400.

## 8. Tests

`supabase/tests/report_submit_atomic_finalize.sql` (pgTAP):

| Test | Kỳ vọng |
| --- | --- |
| W1 happy | submission v1 + 2 file rows; assignment SUBMITTED; size persisted |
| W2 file-scope-invalid | throws `FILE_SCOPE_INVALID` **và** 0 submission (atomicity S7) |
| W3 file-required | throws `FILE_REQUIRED`, 0 submission |
| W4 inner terminal | throws `REPORT_ALREADY_ACCEPTED`, 0 file (propagate rollback) |
| priv | authenticated=EXECUTE, anon=∅ |

**Lệnh đã chạy (môi trường này):**
```text
npm test        → 9/9 pass
npm run lint    → 0 errors (3 warnings có sẵn)
npm run build   → success
npx supabase db reset / deno check → BLOCKED (không có Docker/Deno)
```

**BLOCKED_BY_ENVIRONMENT:** không có Docker/Deno ⇒ chưa chạy `supabase test db` (pgTAP RPC) và `deno check`/`deno test` (typecheck EF). Đã viết đầy đủ; phải chạy qua CI (`test-db` + `deno check **/*.ts`). **Phần không kiểm được bằng pgTAP thuần:** việc EF xác minh object Storage (list/real-size) — cần integration test với stack chạy (Storage), sẽ đưa vào P2-06/E2E.

## 9. Remaining risks

- pgTAP RPC + `deno check` chưa thực thi (Docker/Deno vắng). Đã tự-review: cú pháp plpgsql, jsonb extraction, propagate exception; TS đã thêm annotation kiểu để qua `deno check` strict.
- **Storage verification chưa có unit test tự động** (cần Storage runtime) — logic ở EF; sẽ phủ ở integration/E2E (P2-06/P2-14).
- **Minor (P2 cho P2-06):** `create_report_submission` (3-arg) vẫn `execute` được bởi `authenticated`; gọi trực tiếp có thể tạo submission **không file**. RPC bọc là đường sản xuất; đề nghị P2-06 cân nhắc thu hồi 3-arg khỏi `authenticated` (khi đó cần chỉnh test P2-02 gọi qua bọc). Không breach isolation (chỉ trong org của chính họ).
- `checksum` chưa verify nội dung (cần tải/hash) — thông tin tham khảo, không phải quyết định bảo mật.

## 10. Mapping sang task sau

| Việc còn lại | Task |
| --- | --- |
| `review-report`: scope check + transition guard + đồng bộ `review_status` (S3/S4/C4) | **P2-05** |
| Thu hồi 3-arg RPC khỏi authenticated (nếu chốt) + chạy pgTAP/deno thực | **P2-06** |
| Integration/E2E cho Storage verify + happy path đầy đủ | **P2-06 / P2-14** |
| Signed URL tải file sau authorization + export scope | **P2-13** |

---

**Kết luận:** `submit-report` giờ là orchestration an toàn: xác minh object Storage thật (size/mime), ràng path theo org/campaign/assignment, và finalize submission+files **atomic** qua RPC. S2 và S7 đã remediation ở tầng code + test. Chờ Docker/CI để nghiệm thu cứng.

**DỪNG. Chờ lệnh cho P2-05.**
