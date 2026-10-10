# V2 — Đặc tả kỹ thuật: Google Drive làm kho tệp chính + Cập nhật số liệu

> **Phiên bản:** v0.2 (2026-10-10) — sửa theo review độc lập của Codex (verdict REJECT, 13 finding; xem mục 13).
> **Trạng thái:** DRAFT để owner review. Chưa thi công, chưa có migration.
> **Nhánh:** `docs/v2-drive-data-reporting`
> **Đầu vào:** `DE_XUAT_KIEN_TRUC_V2_VAN_BAN_BAO_CAO_CAP_NHAT_SO_LIEU.md` (đề xuất của owner), review Claude Code
> 2026-10-09/10, review Codex 2026-10-10.
> **Quyết định liên quan:** `docs/brain/03-decisions.md` mục V2-D1 … V2-D6.
> **Đề xuất chỉ tiêu để bàn với Ban Thanh niên:** `01-de-xuat-chi-tieu-bao-cao-thang.md`.

---

## 0. Tóm tắt

| Hạng mục | Chốt |
|---|---|
| Kho tệp nghiệp vụ mới | **Google Drive** (tài khoản owner hiện có, ~3,4 TB trống) sau `StorageProvider` |
| Supabase | Nguồn sự thật cho trạng thái, quyền, số liệu, metadata tệp. Gói **Free** |
| Upload | Trình duyệt PUT byte **thẳng lên Google** vào resumable session do Edge Function cấp. Frontend không giữ credential Google, không tự khai `drive_file_id` |
| Xóa tệp | **Không bao giờ** xóa/trash trong luồng request. Chỉ job dọn dẹp, chỉ tệp chứng minh được là của intent hết hạn chưa dùng |
| Đơn vị | **182 chi đoàn ngang hàng** cùng một cha, chưa có tài khoản |
| Số đoàn viên | **Đơn vị tự khai** |
| Kỳ số liệu MVP | **Chỉ tháng** (`MONTH`); mỗi tháng tối đa một đợt thu số liệu |
| Ngoài MVP | Form quý/năm có chỉ tiêu, form builder, repeater, Văn bản đến/đi & điều hành, lineage đơn vị |

Hiện trạng đo 2026-10-09 bằng truy vấn chỉ đọc (Codex chưa xác minh lại): DB 41 MB / 500 MB; Supabase Storage
0 object; `organizations` 20 dòng.

---

## 1. Vì sao Drive (bối cảnh gói Free)

| Hạn mức Supabase Free | Nhu cầu ước tính | Hệ quả |
|---|---|---|
| Storage 1 GB | 12–25 đợt × 182 đơn vị × 5–20 MB ≈ 10–90 GB/năm | Không đủ ngay năm đầu |
| Egress 5 GB uncached + 5 GB cached/tháng | Admin xem/tải 182 hồ sơ của một đợt ≈ 1 GB | Byte Edge Function trả cho client **tính egress**, kể cả stream ⇒ không proxy cho admin |
| Không có backup/PITR tự động dùng được | — | Tự backup từ V2-1 (mục 9) |
| Pause sau 1 tuần không hoạt động | Kỳ nghỉ dài | Theo dõi; không coi job backup là bảo đảm chống pause |
| Edge Function giới hạn RAM/thời gian | 5 × 20 MB | Không ghép cả tệp trong RAM |

---

## 2. Hiện trạng tái sử dụng (đã đối chiếu repo)

- Nộp báo cáo: 9 trạng thái `report_assignments.status`; versioning `report_submissions`; metadata
  `report_submission_files`; cấu hình đợt; dashboard; CSV export; reminder; cron overdue; email queue.
- RPC nộp hiện tại `create_report_submission_with_files` có `p_expected_version` (chống nộp trên phiên bản cũ),
  `p_submit_note` (`202608110001_phase_3_notification_foundation.sql`). Contract V2 **giữ hai tham số này**.
- `_shared/storage/contract.ts` (`StorageProvider`: `getMetadata/read/put/delete`) và
  `googleDriveStorageProvider.ts` (OAuth refresh token, `drive.file`; `put` buffer toàn tệp; `delete` là HTTP
  DELETE vĩnh viễn; `isPublic` chỉ nhận diện `anyone`). **Phải mở rộng**, xem mục 3.8.
- `document_sources.provider_kind` đã chấp nhận `GOOGLE_DRIVE`.
- Helper SQL: `is_active_user()`, `current_org_id()`, `has_role()`, `has_role_in_scope()` (scope NULL = toàn
  cục), `is_organization_in_scope()`. Lưu ý: helper Edge `requireGlobalRole` **không** kiểm
  `scope_organization_id IS NULL`. V2 không dùng nó để định nghĩa "admin toàn cục".
- Danh mục đơn vị: `organizations` là nguồn chuẩn; `member-api` đã đọc `organizations` (không phải danh mục
  riêng). Bảng tách rời duy nhất là `nq_competition_units` (NQ13), có column grant đã siết
  (`20261008130000_nq13_public_statistics_privacy.sql`).
- Frontend: `reportService` chỉ biết `storage_path` + signed URL Supabase; CSP trong `vercel.json` có
  `connect-src` chỉ cho `*.supabase.co`.
- Test: frontend/unit dùng **Node test runner** (`node --test tests/*.test.mjs`); DB dùng pgTAP; Edge dùng Deno test.
- `admin-users` mời từng người: gọi Auth invite **trước**, rồi setup DB, lỗi thì xóa user. Chưa có import hàng loạt.

---

## 3. Google Drive — thiết kế lưu trữ

### 3.1 Tài khoản & OAuth (owner đã chấp nhận rủi ro dùng tài khoản hiện có)

- Tài khoản Google hiện tại của owner; OAuth client riêng cho hệ thống; **chỉ** scope `drive.file`.
  `drive.file` cho phép app truy cập tệp do app tạo (hoặc người dùng chọn qua Picker; V2 không dùng Picker).
- OAuth consent screen ở trạng thái **In production** (ở Testing, refresh token hết hạn sau 7 ngày). `drive.file`
  là scope không nhạy cảm; không xin thêm scope nào khác.
- Refresh token chỉ ở Supabase Secrets. Không ở DB, log, frontend, GitHub.
- Bắt buộc 2FA.
- Thư mục gốc **do app tạo** bằng script bootstrap (quy ước để mọi thư mục/tệp nằm trong phạm vi `drive.file`).
- Quy ước vận hành: không xóa/đổi tên/di chuyển tay trong `SO_TAY_DOAN_VIEN/`. Job đối soát phát hiện vi phạm.
- **Runbook token (sửa theo review):**
  - *Thay secret định kỳ / đổi máy cấu hình:* tạo refresh token mới cho cùng client → cập nhật secret → health
    check. **Không** vào myaccount.google.com/permissions gỡ app (thao tác đó thu hồi cả grant, làm chết token mới).
  - *Token bị lộ:* thu hồi grant trước (chấp nhận gián đoạn upload) → cấp quyền lại → cập nhật secret → health
    check. Trong thời gian gián đoạn, Edge trả lỗi `STORAGE_UNAVAILABLE`, frontend báo "tạm dừng nhận tệp".
  - Health check hằng ngày: `files.get` thư mục gốc; lỗi `AUTH_INVALID` → cảnh báo admin.

### 3.2 Cấu trúc thư mục

```text
SO_TAY_DOAN_VIEN/                 ← app tạo; id = GOOGLE_DRIVE_ROOT_FOLDER_ID; KHÔNG chia sẻ
├── _INCOMING/                    ← tệp vừa upload, chưa nộp; KHÔNG chia sẻ
├── BAO_CAO/                      ← chia sẻ đích danh cho admin toàn cục (3.5)
│   └── <YYYY>/<ma_dot>/          ← tệp ĐÃ NỘP của mọi đơn vị trong một đợt (phẳng)
├── BIEU_MAU/<ma_dot>/            ← template đính kèm đợt
├── VAN_BAN/                      ← nguồn văn bản
└── BACKUP/                       ← snapshot Excel; KHÔNG chia sẻ
```

- Tệp chưa nộp nằm ngoài cây chia sẻ nên admin không thấy được tệp nháp hoặc bị từ chối.
- Tên tệp sau khi nộp: `<YYYY>_<ma_dot>_<ma_don_vi>_V<n>_<stt>_<safe_name>`.
- Không tạo thư mục con theo đơn vị/phiên bản.

**Tạo thư mục an toàn (sửa theo review — advisory lock không bao được lời gọi Drive):**

```sql
create table public.storage_folders (
  key text primary key,                         -- 'BAO_CAO/2026/BC-2026-10'
  status text not null check (status in ('RESERVED','READY')),
  external_folder_id text unique,
  reserved_at timestamptz not null default now(),
  check ((status = 'READY') = (external_folder_id is not null))
);  -- không grant anon/authenticated; chỉ service role
```

Thuật toán `ensureFolder(key)` (Edge, service role), idempotent:

1. `READY` → dùng luôn.
2. Insert `RESERVED` (on conflict do nothing). Dòng `RESERVED` của người khác còn mới (< 2 phút) → trả
   `FOLDER_BUSY`, client thử lại.
3. Tìm trên Drive thư mục có `appProperties.folder_key = key` (`files.list`). Có thì nhận lại thư mục đó (xử lý
   trường hợp lần trước tạo xong nhưng chưa kịp ghi DB). Không có thì tạo mới với `appProperties.folder_key`.
4. Update `READY` + id.

Thư mục đợt được tạo khi **phát hành** đợt (ít đồng thời).

### 3.3 Luồng upload báo cáo

```text
[1] FE → Edge `report-upload-session` {assignment_id, original_name, size_bytes, mime_type}
      Edge gọi RPC create_upload_intent (JWT người dùng), RPC khóa assignment FOR UPDATE và kiểm:
        - is_active_user; BRANCH_OFFICER; assignment.organization_id = current_org_id()
        - đợt PUBLISHED; trong hạn hoặc allow_late; nếu đã nộp thì allow_resubmission/NEEDS_SUPPLEMENT
        - extension ∈ allowed_extensions; 0 < size ≤ max_file_size_mb
        - số intent PENDING/VERIFIED chưa hết hạn của assignment < max_files
        - ngân sách: ≤ 30 intent/assignment/ngày
      → insert upload_intents (PENDING, expires_at = now() + 24h)
      Edge tạo resumable session: parents=[_INCOMING], appProperties={upload_id},
        X-Upload-Content-Length = size_bytes, Origin = origin app
      ← {upload_id, session_url}
      session_url là thông tin cấp quyền: không log, FE chỉ giữ trong bộ nhớ.
[2] FE PUT bytes → session_url.
[3] FE → Edge `submit-report` {assignment_id, expected_version, summary, submit_note, upload_ids[]}
      (client KHÔNG gửi drive_file_id)
      Với từng upload_id:
        - đọc intent (service role): phải thuộc assignment, uploaded_by = caller, PENDING/VERIFIED, chưa hết hạn
        - tìm tệp trên Drive theo appProperties.upload_id (files.list trong _INCOMING); đúng 1 tệp
        - files.get: size == expected_size; không trashed; mimeType khớp extension;
          permissions đúng một dòng owner (không anyone/domain/user khác; thiếu trường permissions → từ chối)
        - kiểm tiền tố định dạng: Range bytes=0-15 (chỉ nhận diện loại tệp, KHÔNG phải xác thực toàn bộ định dạng)
        - sha256Checksum (nếu Drive có) hoặc md5Checksum
        - service role: UPDATE upload_intents SET status='VERIFIED', ... WHERE id=? AND status='PENDING'
      Không đạt → intent REJECTED (điều kiện status IN ('PENDING','VERIFIED')), trả lỗi. KHÔNG trash, KHÔNG sửa tệp.
      Gọi RPC create_report_submission_with_drive_files (JWT người dùng) — atomic.
      Sau commit (best-effort, lỗi để job đối soát làm lại):
        - Drive files.update: chuyển _INCOMING → BAO_CAO/<YYYY>/<ma_dot>, đổi tên chuẩn
        - report_submission_files.drive_placed_at = now()
```

**Idempotency (sửa theo review — mất response sau commit):** gọi lại `submit-report` với cùng `upload_ids` sau
khi đã commit → RPC thấy các intent `CONSUMED` bởi đúng một submission của cùng caller/assignment → trả lại
submission đó, không tạo phiên bản mới, không gửi lại thông báo. Lỗi mạng không rõ kết quả không bao giờ dẫn tới
xóa tệp.

```sql
create table public.upload_intents (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('REPORT_SUBMISSION','REPORT_TEMPLATE')),
  assignment_id uuid references public.report_assignments(id),
  campaign_id uuid not null references public.report_campaigns(id),
  uploaded_by uuid not null references public.profiles(id),
  original_name text not null, safe_name text not null,
  expected_size bigint not null check (expected_size > 0),
  status text not null default 'PENDING'
    check (status in ('PENDING','VERIFIED','CONSUMED','EXPIRED','REJECTED')),
  consumed_by_submission_id uuid references public.report_submissions(id),
  external_file_id text unique,
  sha256 text, md5 text, verified_mime text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((purpose = 'REPORT_SUBMISSION') = (assignment_id is not null)),
  check ((status = 'CONSUMED') = (consumed_by_submission_id is not null))
);
-- Trigger chuyển trạng thái: chỉ cho PENDING→VERIFIED|REJECTED|EXPIRED, VERIFIED→CONSUMED|REJECTED|EXPIRED.
-- CONSUMED, EXPIRED, REJECTED là trạng thái cuối. Không DELETE.
-- RLS bật; authenticated chỉ SELECT dòng uploaded_by = auth.uid(); mọi ghi qua RPC/service role.
```

`report_submission_files` (giữ tương thích, không xóa đường Supabase Storage và test cũ):

```sql
alter table public.report_submission_files
  add column provider_kind text not null default 'SUPABASE_STORAGE'
    check (provider_kind in ('SUPABASE_STORAGE','GOOGLE_DRIVE')),
  add column external_file_id text unique,
  add column upload_intent_id uuid unique references public.upload_intents(id),
  add column drive_placed_at timestamptz,
  alter column storage_path drop not null,
  add constraint rsf_locator_by_provider check (
    (provider_kind = 'SUPABASE_STORAGE' and storage_path is not null and external_file_id is null)
    or (provider_kind = 'GOOGLE_DRIVE' and storage_path is null
        and external_file_id is not null and upload_intent_id is not null));
```

`report_campaign_templates` đổi tương tự. Template chỉ upload khi đợt `DRAFT` hoặc `PUBLISHED`, người upload là
admin có quyền `can_manage_report_campaign` (helper hiện có). `report_campaigns` thêm `code text unique`.

RPC `create_report_submission_with_drive_files(p_assignment_id, p_expected_version, p_upload_ids uuid[],
p_summary, p_submit_note)`, `SECURITY DEFINER`, `search_path` cố định, revoke `public/anon`:

- `p_upload_ids` không rỗng, không trùng, độ dài ≤ `max_files` của đợt.
- Khóa assignment `FOR UPDATE`, rồi khóa các intent `FOR UPDATE`.
- Nhánh idempotent như trên.
- Mọi intent phải `VERIFIED`, `purpose='REPORT_SUBMISSION'`, đúng assignment/campaign, `uploaded_by = auth.uid()`,
  chưa hết hạn.
- Kiểm quyền/hạn/nộp lại/`p_expected_version` giống RPC hiện tại.
- Cấp `version_number`; insert submission + files; intent → `CONSUMED`; history; audit; thông báo.
- RPC cũ `create_report_submission_with_files` giữ nguyên.

### 3.4 Spike S0 — phải PASS trước V2-2

Chạy với **tài khoản/thư mục thử** và **CSP của bản Preview thật**:

1. Edge tạo session có `Origin`; trình duyệt (Preview + localhost) `PUT` được, không lỗi CORS/preflight. Xác định
   host cần thêm vào `connect-src` (dự kiến `https://www.googleapis.com`).
2. `files.list` theo `appProperties` tìm được tệp vừa upload; `files.update` chuyển thư mục và đổi tên được.
3. Tệp trong `BAO_CAO/` kế thừa chia sẻ của thư mục; tệp trong `_INCOMING/` chỉ có owner.
4. `files.get` trả `sha256Checksum`/`md5Checksum` cho PDF/DOCX/XLSX/JPG; `Range: bytes=0-15` với `alt=media`
   trả đúng 16 byte.
5. Upload sai kích thước so với `X-Upload-Content-Length` → Google từ chối hoặc bước [3] bắt được.
6. Đo 5 × 20 MB trên 4G.

**Fallback nếu (1) FAIL:** Edge proxy resumable theo chunk **5 MiB** (bội số 256 KiB, trừ chunk cuối), không giữ
cả tệp trong RAM; trần mặc định 10 MB/tệp; đo egress/thời gian thật. Kết quả ghi
`docs/v2-data-reporting/S0-drive-spike.md` và cập nhật V2-D2.

### 3.5 Quyền xem tệp

| Người xem | Cách |
|---|---|
| **Admin toàn cục** (SYSTEM_ADMIN, hoặc YOUTH_ADMIN có `scope_organization_id IS NULL`) — owner xác nhận 2026-10-10: **Ban Thanh niên và owner** được đọc toàn bộ 182 đơn vị | Owner chia sẻ **chỉ thư mục `BAO_CAO/`** cho đích danh tài khoản Google, quyền Người xem. Xem/tải thẳng trên Drive; Drive tự nén thư mục |
| YOUTH_ADMIN có scope (nếu có) | **Không** được chia sẻ Drive. Tải qua Edge `report-file-download` có kiểm quyền (tốn egress, chấp nhận vì ít) |
| Đơn vị tải lại tệp của mình | Edge `report-file-download {file_id}`: kiểm quyền bằng predicate của policy `report_submission_files` hiện có, rồi stream `response.body` từ Drive |

- Nút "Mở trong Drive" chỉ hiện cho admin toàn cục.
- Thu hồi vai trò/đình chỉ/đổi scope admin → runbook bắt buộc gỡ chia sẻ Drive cùng ngày.
- Job đối soát so danh sách permission của `BAO_CAO/` với danh sách admin được phép. Job cũng tìm quyền **cấp
  trực tiếp** trên tệp con (`permissionDetails.inherited = false`, khác owner), vì gỡ ở thư mục không xóa quyền
  cấp trực tiếp.
- Mọi kiểm tra ACL: không đọc được permissions → coi như không an toàn (fail-closed).

### 3.6 Văn bản

Giữ mô hình `document_versions` / `document_sources`. Upload văn bản mới qua Drive làm ở phase sau (thêm `purpose`).

### 3.7 Dọn dẹp & đối soát (pg_cron → Edge, mỗi ngày)

Quy tắc an toàn: **chỉ trash tệp thỏa đồng thời** (a) `appProperties.upload_id` trỏ tới intent có thật;
(b) intent `EXPIRED` hoặc `REJECTED`; (c) không có dòng `report_submission_files` nào tham chiếu
`external_file_id`; (d) tệp nằm trong `_INCOMING/`. Dùng `files.update trashed=true` (Drive giữ 30 ngày), không
dùng HTTP DELETE.

- Intent `PENDING/VERIFIED` quá hạn → `EXPIRED`
  (`UPDATE ... WHERE status IN ('PENDING','VERIFIED') AND expires_at < now()`, `FOR UPDATE SKIP LOCKED`). Không
  bao giờ đụng `CONSUMED`.
- Upload hoàn tất muộn (session Google sống 1 tuần, intent chỉ 24h): tệp tìm thấy theo `upload_id` của intent
  `EXPIRED` → trash theo quy tắc trên.
- Tệp đã nộp có `drive_placed_at IS NULL` → chuyển thư mục/đổi tên lại.
- Dòng DB có `external_file_id` nhưng Drive 404/trashed → `MISSING_FILE`.
- Checksum lệch → `CHECKSUM_MISMATCH`.
- Tệp lạ trong cây `SO_TAY_DOAN_VIEN/` không gắn intent/thư mục nào → chỉ báo cáo, không xóa.
- Permission bất thường (mục 3.5) → cảnh báo.
- Ghi `audit_logs` (`STORAGE_RECONCILE`) và hiện trên trang quản trị.

### 3.8 Thay đổi contract `StorageProvider` & frontend

Mở rộng contract (provider Supabase hiện có không bắt buộc cài các method mới):

```ts
createResumableSession(req: { name: string; mimeType: string; size: number; parentId: string;
  appProperties: Record<string, string>; origin: string }): Promise<{ sessionUrl: string }>;
findByAppProperty(key: string, value: string, parentId: string): Promise<StorageFileMetadata[]>;
getMetadata(locator): Promise<StorageFileMetadata & { sha256?: string; md5?: string;
  permissions: { type: string; role: string; inherited: boolean }[] }>;
readRange(locator, start: number, endInclusive: number): Promise<Uint8Array>;
readStream(locator): Promise<ReadableStream<Uint8Array>>;
move(locator, fromParentId, toParentId, newName?): Promise<void>;
trash(locator): Promise<void>;          // files.update trashed=true
```

- `assertPrivateStorageMetadata` siết lại: từ chối `anyone`, `domain`, và mọi permission không phải owner với
  tệp `_INCOMING`; thiếu `permissions` → từ chối.
- `delete` (HTTP DELETE vĩnh viễn) không dùng trong V2.
- Frontend: `reportService` thêm nhánh `provider_kind`; tải tệp Drive qua Edge (không signed URL); dùng tên
  field `submit_note`, `expected_version`.
- CSP: thêm host upload theo kết quả S0 vào `connect-src` (không mở `frame-src`).
- Cờ triển khai `REPORT_UPLOAD_PROVIDER` (`SUPABASE_STORAGE|GOOGLE_DRIVE`) ở Edge: tắt upload Drive mới mà vẫn
  đọc được tệp Drive đã nhận (rollback V2-2).

---

## 4. Danh mục đơn vị (Phase V2-1)

```sql
alter table public.organizations
  add column group_code text check (group_code in ('XA_PHUONG','KHOI_CO_QUAN')),
  add column is_reporting_unit boolean not null default false,
  add column effective_from date,
  add column effective_to date,
  add constraint organizations_effective_range
    check (effective_to is null or effective_from is null or effective_to >= effective_from);
```

- 182 chi đoàn ngang hàng, cùng cha là đơn vị gốc. `organization_type = 'YOUTH_BRANCH'`; xã/phường lưu ở
  `metadata.unit_type`. `group_code` dùng để lọc dashboard.

**Quy ước mã đơn vị (V2-D7, owner giao Claude đề xuất 2026-10-10):**

| Nhóm | Mã | Số lượng | Ghi chú |
|---|---|---|---|
| Chi đoàn Công an xã/phường | `XP001` … `XP148` | 148 | Số thứ tự **trùng** `PT-NQ-001…148` của NQ13 (`XP017` ↔ `PT-NQ-017`) |
| Chi đoàn khối cơ quan Công an tỉnh | `CQ001` … `CQ034` | 34 | Owner điền tên; đánh số theo thứ tự owner sắp |
| Đơn vị gốc | giữ nguyên dòng `TĐ` (Ban Thanh niên) | 1 | Không đổi mã trong MVP vì `member-api.work_unit_code` có thể đang tham chiếu |

Quy tắc:
1. Chỉ chữ in hoa ASCII + 3 chữ số; regex `^(XP|CQ)[0-9]{3}$`. Không dấu, không khoảng trắng, an toàn khi
   dùng trong tên tệp Drive và Excel.
2. Mã **không mang tên đơn vị**: đổi tên xã/phường hoặc xã lên phường thì giữ nguyên mã, chỉ sửa `name`.
   Vì vậy xã và phường dùng chung tiền tố `XP`.
3. **Không bao giờ tái sử dụng** mã. Đơn vị giải thể: đặt `effective_to`, `is_active = false`. Đơn vị mới hoặc
   sau sáp nhập: cấp số tiếp theo (`XP149`, `CQ035`…).
4. Mã đợt: báo cáo `BC-YYYY-MM` (định kỳ) hoặc `BC-YYYY-DXnn` (đột xuất); số liệu `SL-YYYY-MM`.

- Bản nháp danh mục: `docs/v2-data-reporting/02-danh-muc-don-vi-du-thao.csv` (148 dòng XP dựng từ
  `nq_competition_units`; 34 dòng CQ để owner điền). Tên chính thức dạng "Chi đoàn Công an xã …" cần owner
  xác nhận.
- Dọn dữ liệu: production hiện có 3 đơn vị demo (`CĐA/CĐB/CĐC`) và 16 đơn vị rehearsal `P5R-*` nằm ở gốc.
  V2-1 đặt `is_active = false`, `is_reporting_unit = false` sau khi kiểm không còn tài khoản/dữ liệu thật gắn vào.
  **Không xóa.**
- `nq_competition_units` thêm `organization_id uuid references organizations(id)`. **Không** grant cột mới cho
  anon/authenticated, giữ nguyên column grant đã siết; không xóa snapshot NQ13. Script đối chiếu tên → owner
  duyệt trước khi ghi.
- Seed 182 đơn vị bằng migration dữ liệu có danh sách owner duyệt.
- **Import 182 tài khoản BRANCH_OFFICER** (Edge mới `admin-users-import`, chỉ admin toàn cục):
  - bước `preview` (dry-run) trả lỗi từng dòng: email trùng/sai, mã đơn vị không tồn tại, đã có tài khoản;
  - bước `commit` xử lý theo lô (ví dụ 20 dòng), idempotent theo email (đã tồn tại thì bỏ qua);
  - mỗi dòng ghi trạng thái để chạy tiếp sau lỗi giữa chừng; ghi audit;
  - tôn trọng giới hạn gửi thư mời của Supabase Auth/SMTP đang cấu hình (kiểm trước; không mặc định đi qua
    `email_queue` nghiệp vụ);
  - tái dùng `admin_invite_user_db_setup` cho từng dòng; giữ nguyên thứ tự invite → setup → bù trừ đang có.
- **Backup tối thiểu (mục 9) phải chạy được trước khi import tài khoản.**

---

## 5. Cập nhật số liệu — mô hình dữ liệu

### 5.1 Metric Catalog

```sql
create table public.metric_catalog (
  code text primary key check (code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  name text not null, description text not null,
  unit text not null,
  value_type text not null check (value_type in ('INTEGER','DECIMAL','CURRENCY_VND')),
  temporal_kind text not null check (temporal_kind in ('STOCK','FLOW')),
  unit_rollup text not null default 'SUM' check (unit_rollup in ('SUM','NONE')),
  min_value numeric, max_value numeric,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DEPRECATED')),
  superseded_by text references public.metric_catalog(code),
  first_published_at timestamptz,          -- set khi lần đầu được một form PUBLISHED tham chiếu; không đảo ngược
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
```

- Không có `BOOLEAN` trong metric (trường có/không là trường form không gắn metric).
- Khi `first_published_at IS NOT NULL`, trigger cấm đổi `code/unit/value_type/temporal_kind/unit_rollup/min/max`
  (sửa theo review: khóa từ lúc form publish, không đợi có fact). Chỉ được sửa `name/description`, chuyển
  `DEPRECATED`, đặt `superseded_by`. Đổi nghĩa ⇒ metric mới.
- Gộp theo thời gian: STOCK lấy giá trị kỳ quan sát cuối (luôn hiển thị kèm kỳ đó), FLOW cộng.

### 5.2 Form template & version

```sql
create table public.form_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, name text not null,
  period_type text not null check (period_type in ('MONTH')),      -- MVP chỉ tháng
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RETIRED')),
  created_at timestamptz not null default now()
);
create table public.form_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.form_templates(id),
  version_number integer not null check (version_number > 0),
  schema jsonb not null,
  resolved_metrics jsonb,       -- snapshot thuộc tính metric tại lúc publish (validation dùng snapshot này)
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','RETIRED')),
  published_at timestamptz, published_by uuid references public.profiles(id),
  unique (template_id, version_number),
  check (octet_length(schema::text) <= 65536)
);
```

- Trigger: khi `published_at IS NOT NULL` thì `schema`, `resolved_metrics`, `template_id`, `version_number`
  bất biến; chỉ cho `PUBLISHED → RETIRED`; không DELETE. Không có đường quay về `DRAFT`.
- Contract schema (MVP, tập hữu hạn — không dùng framework JSON Schema):
  - `sections[] → fields[]`; field: `key` (`^[a-z][a-z0-9_]{1,63}$`, duy nhất), `label`, `type` ∈ {`integer`,
    `decimal`, `currency_vnd`, `boolean`, `short_text`, `long_text`, `single_select`}, `metric` (tùy chọn),
    `required`, `max_length` (text), `options[]` (select).
  - **Mỗi metric xuất hiện tối đa một field.** Field gắn metric phải có kiểu tương thích; `boolean`/text không
    gắn metric.
  - Giới hạn: ≤ 100 field, ≤ 50 rule, ≤ 20 anomaly, schema ≤ 64 KB.
  - `rules[]`: `{id, level:"error", left:<metric>, op ∈ {<,<=,=,>=,>}, right:<metric>|<number>, message}`.
  - `anomalies[]`: `{metric, max_change_ratio}` — so với kỳ tháng liền trước.
- RPC publish kiểm toàn bộ điều trên, snapshot `resolved_metrics`, set `metric_catalog.first_published_at`.

### 5.3 Đợt, giao việc, nháp, nộp

```sql
create table public.data_campaigns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, title text not null, description text,
  form_version_id uuid not null references public.form_versions(id),
  period_type text not null check (period_type = 'MONTH'),
  period_start date not null,
  period_end date not null,
  open_at timestamptz not null, due_at timestamptz not null, close_at timestamptz,
  allow_late_submission boolean not null default true,
  allow_resubmission boolean not null default true,
  report_campaign_id uuid unique references public.report_campaigns(id),  -- tối đa 1 đợt số liệu / đợt báo cáo
  source_document_id uuid references public.documents(id),
  reminder_policy jsonb not null default '{}'::jsonb,
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','CLOSED','ARCHIVED')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (period_start = date_trunc('month', period_start)::date),
  check (period_end = (date_trunc('month', period_start) + interval '1 month - 1 day')::date),
  check (due_at >= open_at), check (close_at is null or close_at >= due_at)
);
-- Mỗi tháng tối đa một đợt đang hiệu lực (sửa theo review: loại bỏ xung đột hai đợt cùng kỳ):
create unique index uq_data_campaign_month on public.data_campaigns (period_start) where status <> 'ARCHIVED';
-- Trigger: sau khi PUBLISHED, form_version_id/period_* bất biến; form_version phải PUBLISHED.
```

Các bảng còn lại:

- `data_assignments(campaign_id, organization_id, status, exempt_reason, …)`; `unique(campaign_id,
  organization_id)`. Trạng thái là **tập con** của báo cáo: `PENDING`, `SUBMITTED`, `RESUBMITTED`,
  `LATE_SUBMITTED`, `OVERDUE`, `CLOSED`, `EXEMPTED`. **Không có bước duyệt** (`ACCEPTED`/`NEEDS_SUPPLEMENT`):
  owner chốt 2026-10-10 rằng Ban tự liên hệ đơn vị khi cần bổ sung, đơn vị tự gửi lại (nếu
  `allow_resubmission`).
- `data_drafts(assignment_id pk, answers jsonb, revision integer, updated_by, updated_at)`: `save_data_draft`
  nhận `p_expected_revision`. Nếu lệch, RPC trả `DRAFT_CONFLICT` (hai cán bộ cùng sửa không ghi đè nhau).
- `data_submissions(assignment_id, version_number, form_version_id, answers jsonb, anomaly_notes jsonb,
  submitted_by, submitted_at, is_late)`: `unique(assignment_id, version_number)`; bất biến hoàn toàn.
- `data_status_history`: giống `report_status_history`.

"Hoàn thành nhiệm vụ" khi đợt có cả báo cáo và số liệu:

- Tính bằng view `work_item_completion` với `security_invoker = true`.
- **Owner chốt 2026-10-10: hoàn thành khi đơn vị đã gửi; không thêm bước bổ sung.** Mỗi phía được coi là xong
  khi đơn vị đã có ít nhất một bản nộp, hoặc assignment `EXEMPTED`. Phía báo cáo giữ luồng duyệt hiện có, nhưng
  `NEEDS_SUPPLEMENT`/`ACCEPTED` không làm đổi trạng thái hoàn thành. `PENDING` và `OVERDUE` chưa có bản nộp thì
  chưa xong.
- Không tạo bảng task đa hình.

### 5.4 Metric facts (sửa theo review)

```sql
create table public.metric_facts (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.data_campaigns(id),
  assignment_id uuid not null references public.data_assignments(id),
  organization_id uuid not null references public.organizations(id),
  metric_code text not null references public.metric_catalog(code),
  period_start date not null,                -- = data_campaigns.period_start (MONTH)
  value numeric not null,
  submission_id uuid not null references public.data_submissions(id),
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index uq_metric_facts_current on public.metric_facts (assignment_id, metric_code) where is_current;
create index idx_metric_facts_period on public.metric_facts (period_start, metric_code) where is_current;
```

- Vì mỗi tháng chỉ một đợt, "số của đợt" và "số của tháng" là một ⇒ một nghĩa duy nhất của `is_current`.
- Sinh **trong cùng transaction** của `submit_data` (assignment đã khóa `FOR UPDATE`, nên hai lần nộp cùng đơn
  vị được tuần tự hóa).
- Mỗi lần nộp: đặt **mọi** fact current của assignment thành `false`, rồi insert fact cho các metric có giá trị.
  Trường bị bỏ trống ở bản mới thì không còn fact (= "chưa có dữ liệu", khác 0).
- **Owner chốt 2026-10-10:** dashboard/Excel tính số **mới nhất đã nộp** (fact current). Đơn vị gửi lại thì
  số mới thay số cũ.
- Tổng hợp quý/năm: chỉ từ fact `MONTH`. Luôn trả **độ đầy đủ** (số tháng có dữ liệu / số tháng của kỳ, theo
  từng đơn vị). STOCK hiển thị "tính đến tháng X". Không suy diễn tháng thiếu thành 0.
- Client không có quyền ghi; không xóa vật lý.

---

## 6. API

| Tên | Loại | Ai gọi | Việc |
|---|---|---|---|
| `admin_publish_form_version` | RPC | admin toàn cục | Validate (5.2), snapshot, khóa |
| `admin_upsert_data_campaign` / `admin_publish_data_campaign(p_campaign_id, p_org_ids)` | RPC | admin toàn cục | Tạo/sửa DRAFT; phát hành + giao (mặc định mọi `is_reporting_unit` đang hiệu lực) |
| `admin_close_data_campaign`, `admin_exempt_data_assignment` | RPC | admin toàn cục | |
| `get_data_assignment_form` | RPC | đơn vị / admin | Form snapshot + nháp + bản nộp gần nhất |
| `get_previous_period_values(p_assignment_id)` | RPC | đơn vị | Fact current của tháng liền trước, **chỉ metric STOCK**, ánh xạ theo `metric_code` |
| `save_data_draft(p_assignment_id, p_answers, p_expected_revision)` | RPC | BRANCH_OFFICER đúng đơn vị | Lưu nháp; kiểm cấu trúc/kích thước |
| `submit_data(p_assignment_id, p_answers, p_explanations)` | RPC | BRANCH_OFFICER đúng đơn vị | Validate (6.1), version, fact, trạng thái, lịch sử, audit |
| `get_data_campaign_dashboard(p_campaign_id, p_group_code)` | RPC | YOUTH_ADMIN trong scope, SYSTEM_ADMIN | Tiến độ + tổng theo metric (chỉ đơn vị trong scope) |
| `get_data_campaign_export(p_campaign_id)` | RPC | như trên | Dữ liệu 5 sheet + **audit** |
| `report-upload-session`, `submit-report` (sửa), `report-file-download`, `storage-reconcile`, `admin-users-import` | Edge | — | Mục 3, 4 |

"Admin toàn cục" = SQL helper mới `is_global_youth_admin()`: `is_active_user()` và (có `SYSTEM_ADMIN`, hoặc có
`YOUTH_ADMIN` với `scope_organization_id IS NULL`). Không dùng `requireGlobalRole` của Edge cho khái niệm này.

Mọi RPC: `SECURITY DEFINER`, `set search_path = public`, `revoke all … from public, anon`, chỉ grant đúng
overload cho `authenticated`, kiểm quyền ở đầu hàm. Helper nội bộ không grant cho client.

### 6.1 Validation contract

- **Server quyết định:**
  - `answers` phải là object; key lạ → từ chối.
  - Kiểm `jsonb_typeof` trước khi cast; `null` hoặc thiếu key = chưa nhập; `required` nghĩa là không null.
  - `integer`/`currency_vnd` phải là số nguyên; `decimal` tối đa 4 chữ số thập phân; trị tuyệt đối ≤ 1e15.
  - Text ≤ `max_length` (mặc định 4000); `single_select` ∈ options.
  - Áp `min/max` từ `resolved_metrics` (snapshot), không từ catalog hiện hành.
  - Rule: thực thi bằng nhánh `CASE` cố định theo `op`, **không SQL động**. Rule có vế thiếu dữ liệu thì bỏ qua.
  - Lỗi → `DATA_VALIDATION_FAILED` + danh sách `{field, code}`.
- **Bất thường:** server tự tính giá trị tháng trước và tỉ lệ thay đổi. Kỳ trước thiếu hoặc bằng 0 thì không
  tính tỉ lệ. Vượt ngưỡng mà `p_explanations[metric]` trống → `ANOMALY_EXPLANATION_REQUIRED`. Server lưu
  `anomaly_notes = [{metric, previous, current, ratio, explanation}]` từ số **của server**; client chỉ gửi lời
  giải trình.
- **Frontend:** `src/lib/formRules.js` (JS thuần) chạy cùng quy tắc để báo sớm.
- **Vector dùng chung:** `tests/fixtures/form-rule-vectors.json` chạy ở Node test runner và pgTAP. Gồm cả ca âm
  tính: key lạ, chuỗi thay số, số thập phân ở `integer`, vượt kích thước, null vs 0, kỳ trước = 0.

### 6.2 Xuất Excel

- RPC trả JSON đã lọc scope và ghi audit. Trình duyệt dựng `.xlsx`.
- Dependency frontend mới `exceljs` (đã dùng ở `member-api`): ghi quyết định trước khi cài; lazy-load ở trang admin.
- 5 sheet: Tổng hợp · Chi tiết theo đơn vị · Đơn vị chưa nộp · Số liệu bất thường (kèm giải trình) · Lịch sử nộp.
- Ô text bắt đầu bằng `= + - @ \t \r` được thêm tiền tố `'`. Ô số ghi kiểu number.

---

## 7. RLS & quyền (predicate cụ thể)

Ký hiệu:
- `UNIT_OFFICER(org)` = `is_active_user() and has_role('BRANCH_OFFICER') and org = current_org_id()`
- `SCOPED_ADMIN(org)` = `has_role_in_scope('YOUTH_ADMIN', org) or has_role('SYSTEM_ADMIN')`
- `GLOBAL_ADMIN` = `is_global_youth_admin()`

MEMBER, INNOVATION_MEMBER và tài khoản không ACTIVE: không đọc được gì trong phân hệ (khác policy báo cáo cũ cho
mọi user cùng đơn vị đọc assignment).

| Bảng | SELECT | Ghi |
|---|---|---|
| `metric_catalog`, `form_templates` | `is_active_user()` | RPC |
| `form_versions` | PUBLISHED/RETIRED: `UNIT_OFFICER(current_org_id()) or SCOPED_ADMIN(any)`; DRAFT: `GLOBAL_ADMIN` | RPC |
| `data_campaigns` | `GLOBAL_ADMIN` · hoặc tồn tại assignment `a` với `UNIT_OFFICER(a.org) or SCOPED_ADMIN(a.org)` | RPC |
| `data_assignments`, `data_drafts`, `data_submissions`, `data_status_history`, `metric_facts` | `UNIT_OFFICER(org) or SCOPED_ADMIN(org)` (org lấy qua assignment) | RPC |
| `work_item_completion` (view) | `security_invoker = true` ⇒ kế thừa RLS bảng gốc | — |
| `upload_intents` | `uploaded_by = auth.uid() and is_active_user()` | Edge (service role) + RPC |
| `storage_folders` | không ai | Edge (service role) |

- Không grant `insert/update/delete` bất kỳ bảng nào cho `authenticated`; không grant `anon`; kiểm cả grant
  cột, sequence và từng overload RPC.
- Quyền tạo/phát hành đợt số liệu: chỉ `GLOBAL_ADMIN`. Phạm vi đợt không phụ thuộc đơn vị của người tạo, nên
  người tạo đổi đơn vị không làm đổi scope.

---

## 8. Kiểm thử

### 8.1 pgTAP (viết cùng migration)

**Quyền:**
- Đơn vị A không đọc/nháp/nộp được của B.
- MEMBER cùng đơn vị, INNOVATION_MEMBER, tài khoản INVITED/SUSPENDED/ARCHIVED và anon bị từ chối ở mọi bảng/RPC.
- YOUTH_ADMIN có scope gọi thao tác toàn cục → từ chối.
- Grant: không có `insert/update/delete` cho `authenticated` trên mọi bảng mới; helper nội bộ không execute được
  từ client.

**Bất biến:**
- `data_submissions`, `metric_facts`, `form_versions` đã publish và `metric_catalog` đã khóa: UPDATE/DELETE bị chặn.
- `PUBLISHED → DRAFT` bị chặn; campaign đã phát hành không đổi được form/kỳ.
- Không tạo được 2 đợt cùng tháng.

**Nghiệp vụ:**
- Đợt đóng/quá hạn/không cho nộp lại → chặn.
- Gọi `submit_data` trực tiếp với số sai rule → chặn.
- Thiếu giải trình bất thường → chặn; `anomaly_notes` lưu số server tự tính dù client gửi số khác.
- Nộp lại bỏ trống một trường → fact của trường đó không còn current.
- `DRAFT_CONFLICT` khi revision lệch.

**Upload Drive:**
- Intent của người khác, PENDING, CONSUMED, EXPIRED, REJECTED, sai assignment/purpose, trùng trong mảng, mảng
  rỗng, vượt `max_files` → chặn.
- Gọi lại với cùng intent đã CONSUMED → trả lại đúng submission cũ, không tạo version/thông báo mới.
- Trigger trạng thái intent chặn `CONSUMED → *`.

**Vector chung:** `form-rule-vectors.json`.

**Không sửa assertion** của test hiện có cho `create_report_submission_with_files`.

### 8.2 Tranh chấp thật (hai kết nối DB, script rehearsal giống P4-04R2)

- Hai `submit_data` đồng thời cùng assignment → version liên tiếp, đúng một bộ fact current.
- Hai finalize Drive đồng thời cùng intent → một thành công, một nhận kết quả idempotent hoặc lỗi; tệp không bị
  đụng.
- Cleanup chạy đồng thời với submit → intent đã CONSUMED không bị chuyển EXPIRED.
- Hai `create_upload_intent` đồng thời → không vượt `max_files`.

### 8.3 Deno / Node test

- `report-upload-session`: từ chối extension/size/số tệp/đợt đóng/sai đơn vị/vượt ngân sách.
- `submit-report` (fetch Drive được mock): không tìm thấy tệp theo `upload_id`, nhiều hơn 1 tệp, size lệch,
  có permission ngoài owner, thiếu `permissions`, sai tiền tố định dạng, trashed → REJECTED. **Khẳng định không
  có lời gọi trash/update/delete nào tới Drive.**
- RPC lỗi sau khi verify → không đụng tệp. Mất response sau commit → gọi lại trả cùng submission.
- `ensureFolder`: hai lần gọi song song → một thư mục; lần trước tạo xong chưa ghi DB → nhận lại theo
  `appProperties`.
- `formRules.js` + vector chung; copy kỳ trước qua hai form version khác nhau (chỉ STOCK).
- Excel: mở lại bằng `exceljs`, đủ 5 sheet, ô số là number, `=cmd` bị trung hòa.

### 8.4 Runtime rehearsal (trước merge mỗi phase có runtime)

- Seed 182 đơn vị + tài khoản giả; đợt tháng; nộp ngẫu nhiên (sai rule, bất thường, muộn, nộp lại, bỏ trường).
- Dashboard 182/182; tổng khớp script đối chiếu độc lập; Excel mở được trên Microsoft Excel.
- Drive thử: 5 × 20 MB trên 390px với CSP Preview thật.
  - Tệp trong `_INCOMING` chỉ owner thấy.
  - Sau khi nộp, admin được chia sẻ mở được; tài khoản không được chia sẻ bị chặn.
- Xóa tay một tệp trên Drive → `MISSING_FILE`. Cấp quyền trực tiếp cho người lạ trên một tệp → cảnh báo.
- Đo egress/Edge invocation sau rehearsal.

---

## 9. Backup & khôi phục (đưa lên V2-1, sửa theo review)

**Mục tiêu (owner chấp nhận 2026-10-10):** mất dữ liệu DB tối đa 24 giờ; tệp tối đa 7 ngày; khôi phục trong 1
ngày làm việc.

| Đối tượng | Cách | Tần suất |
|---|---|---|
| Supabase DB | Theo hướng dẫn backup/restore của Supabase CLI: `roles.sql` (`--role-only`), `schema.sql` (mặc định), `data.sql` (`--data-only --use-copy`); nén; lưu vào thư mục Google Drive for desktop trên máy owner bằng Windows Task Scheduler | **Hằng ngày**, giữ 30 bản |
| Cấu hình ngoài DB | Danh sách secret (chỉ tên, không giá trị), cấu hình Auth/SMTP, cron/Vault, bucket — ghi trong runbook | Khi đổi |
| Manifest tệp | Có sẵn trong dump (`report_submission_files`: `external_file_id`, `sha256/md5`, kích thước) | Theo DB |
| Google Drive | Sao `SO_TAY_DOAN_VIEN/` ra ổ ngoài bằng chế độ **copy** có lưu phiên bản (không dùng sync thuần, để thao tác xóa trên Drive không lan sang bản sao) | Hằng tuần |
| Snapshot số liệu | Excel tổng hợp khi đóng đợt → `BACKUP/snapshots/` | Mỗi đợt |

**Diễn tập** (lần đầu trước import tài khoản ở V2-1, sau đó hằng quý): restore vào Supabase local, rồi:
- đăng nhập được bằng một tài khoản thử;
- chạy pgTAP quyền âm tính;
- đối chiếu số dòng;
- tải và so checksum ngẫu nhiên 5 tệp theo manifest.

Kết quả ghi vào `docs/brain/06`.

Dump chứa dữ liệu cá nhân ⇒ chỉ thư mục riêng tư.

---

## 10. Lộ trình (kiểm thử quyền & bất biến nằm trong từng phase)

| Phase | Nội dung | Gate | Ước |
|---|---|---|---|
| **V2-S0** | Spike Drive (3.4) với CSP Preview | Báo cáo S0 PASS/fallback | S |
| **V2-1** | Backup/restore tối thiểu + diễn tập; danh mục 182 đơn vị; import tài khoản hàng loạt | Restore drill PASS; pgTAP quyền | M |
| **V2-2** | Drive cho Nộp báo cáo (3.2–3.8), đối soát, chia sẻ admin, cờ rollback | S0 PASS; test 8.1–8.3 phần Drive; rehearsal | L |
| **V2-3** | Metric catalog + form tháng (seed) + publish validation | Ban Thanh niên chốt chỉ tiêu | M |
| **V2-4** | Đợt số liệu tháng: giao, nháp, nộp, validation, bất thường, copy kỳ trước, UI đơn vị | V2-1, V2-3; test tranh chấp | L |
| **V2-5** | Dashboard tháng + lọc `group_code` + Excel + reminder/overdue cho data assignment | V2-4 | M |
| **V2-6** | Nghiệm thu tổng: rehearsal 182 đơn vị, restore drill lần 2 | — | M |
| Sau MVP | Form quý/năm có chỉ tiêu riêng, tổng hợp nhiều loại kỳ, form builder, repeater, multi-select/date, lineage, Văn bản điều hành | — | — |

- V2-2 và V2-3 chạy song song được.
- Mỗi phase một nhánh/PR, có mục rollback/forward-fix:
  - V2-2: tắt cờ `REPORT_UPLOAD_PROVIDER`, vẫn đọc được tệp đã nhận.
  - V2-4/5: ẩn route; dữ liệu giữ nguyên.

---

## 11. Rủi ro còn lại

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Tài khoản Google cá nhân bị xâm nhập/khóa/thu hồi app | Cao | 2FA, health check hằng ngày, runbook token, bản sao tuần ra ổ ngoài. **Owner đã chấp nhận** |
| Chia sẻ Drive lệch với vai trò trong app | TB | Chỉ admin toàn cục; runbook thu hồi; đối soát quyền thư mục và quyền trực tiếp |
| Upload trực tiếp không qua được CORS | TB | S0; fallback chunk 5 MiB |
| Xóa/sửa tay trong Drive | TB | Quy ước, đối soát, thùng rác 30 ngày, bản sao tuần |
| Định nghĩa chỉ tiêu mơ hồ | Cao | Chốt với Ban Thanh niên trước V2-3 |
| Hạn mức Free | TB | Byte không qua Supabase; đo sau rehearsal; theo dõi dung lượng DB |

## 12. Câu hỏi cho owner

**Đã trả lời 2026-10-10:**

| # | Câu hỏi | Trả lời |
|---|---|---|
| Q1 | Ai được chia sẻ `BAO_CAO/`? | Ban Thanh niên và owner; được đọc toàn bộ 182 đơn vị |
| Q2 | Dashboard tính số nào? | Số mới nhất đã nộp |
| Q3 | "Hoàn thành nhiệm vụ" khi nào? | Khi đơn vị đã gửi. Số liệu không có bước duyệt/yêu cầu bổ sung; Ban tự liên hệ đơn vị (5.3) |
| Q5 | Mục tiêu backup | Chấp nhận: DB 24h, tệp 7 ngày, khôi phục 1 ngày làm việc |
| — | Quy ước mã đơn vị | Owner giao Claude đề xuất → mục 4, V2-D7 |

**Còn mở (owner bổ sung sau; không chặn review v0.2):**

1. Điền 34 chi đoàn khối cơ quan và xác nhận tên chính thức trong `02-danh-muc-don-vi-du-thao.csv` — chặn seed V2-1.
2. Danh sách tài khoản Google của cán bộ Ban Thanh niên được chia sẻ `BAO_CAO/` — chặn rehearsal V2-2.
3. *(Ban Thanh niên)* Bộ chỉ tiêu, "người" hay "lượt người", hoạt động liên chi đoàn — xem `01-…` — chặn V2-3.

---

## 13. Đối chiếu review Codex (2026-10-10)

Cả 13 finding đều được xác minh lại với code; không finding nào bị bác.

| # | Finding | Xử lý |
|---|---|---|
| 1 | Trash trong luồng lỗi có thể phá tệp người khác/tệp đã nộp | Bỏ trash khỏi luồng request; client không gửi `drive_file_id` (server tìm theo `appProperties`); state machine intent; idempotent khi gọi lại; cleanup chỉ trash theo 4 điều kiện (3.3, 3.7) |
| 2 | Chia sẻ `BAO_CAO/` vượt scope; helper ACL yếu | Chỉ admin toàn cục; `_INCOMING` ngoài cây chia sẻ; kiểm ACL fail-closed gồm quyền trực tiếp; siết `assertPrivateStorageMetadata` (3.5, 3.8) |
| 3 | `is_current` hai nghĩa; hai đợt cùng kỳ | Mỗi tháng một đợt (unique index); fact khóa theo assignment; mỗi lần nộp vô hiệu toàn bộ fact cũ; owner chốt tính số mới nhất đã nộp, không có bước duyệt số liệu (5.3, 5.4, Q2/Q3) |
| 4 | Quy tắc kỳ/độ đầy đủ chưa đủ | MVP chỉ MONTH, kỳ ràng buộc bằng check; tổng hợp kèm độ đầy đủ; STOCK kèm "tính đến tháng"; thiếu ≠ 0 (5.4) |
| 5 | Ma trận RLS chưa đủ | Predicate cụ thể có ACTIVE + vai trò; helper `is_global_youth_admin()`; view `security_invoker`; policy history (6, 7) |
| 6 | Form "bất biến" vẫn đổi nghĩa được | Khóa metric từ lần publish đầu; snapshot `resolved_metrics`; không quay về DRAFT; campaign đã phát hành cố định form/kỳ (5.1–5.3) |
| 7 | Runbook token tự hủy | Tách thay secret thường và xử lý token lộ (3.1) |
| 8 | Contract validation chưa khép kín | Một field/metric; bỏ BOOLEAN khỏi metric; null vs 0; giới hạn; không SQL động; server tự tính số bất thường (5.2, 6.1) |
| 9 | Giới hạn upload & vòng đời session | Intent tạo qua RPC khóa assignment; ngân sách; RPC kiểm lại cardinality; xử lý upload hoàn tất muộn; gọi đúng tên "kiểm tiền tố" (3.3, 3.7) |
| 10 | Contract provider/frontend/CSP | Mục 3.8; giữ `submit_note`, `expected_version`; CSP theo S0; cờ rollback |
| 11 | Advisory lock không bao được lời gọi Drive | Đặt chỗ `RESERVED/READY` + tìm lại theo `appProperties.folder_key` (3.2) |
| 12 | Backup muộn, không chứng minh khôi phục | Đưa vào V2-1; dump roles/schema/data; bản sao có phiên bản; diễn tập đăng nhập + quyền âm tính + checksum (9) |
| 13 | Khẳng định hiện trạng/quy tắc lệch | Sửa mục 2 (member-api, test runner); đồng bộ V2-D1/D2 và `02-coding-rules.md` |
