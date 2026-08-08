# P2-00 — BASELINE & GAP AUDIT

**Phase:** 2 — Công việc & Báo cáo
**Task:** P2-00 (khảo sát, không thi công nghiệp vụ)
**Ngày:** 2026-08-09
**Branch khảo sát:** `feat/phase-2a-report-foundation` (tách từ `master` @ `807c1eb`)
**Người thực hiện:** AGENT Phase 2

> Tài liệu này chỉ khảo sát và phân loại hiện trạng. KHÔNG sửa schema, RLS, RPC, Edge Function hay UI trong task này.

---

## 0. Cảnh báo cần xử lý ngoài phạm vi code

| Mục | Hiện trạng | Ghi chú |
| --- | --- | --- |
| **Repo visibility** | **PUBLIC** (`vi-phuong-158/so-tay-doan-vien-so`) | Task yêu cầu chỉ BÁO CÁO, không tự đổi. Đề nghị chủ repo cân nhắc chuyển **private** vì đây là nền tảng nội bộ ngành. Không có secret thật trong repo (đã kiểm tra `.env.example`, seed dùng giá trị rehearsal), nhưng toàn bộ schema/RLS/logic bảo mật đang công khai. |

---

## 1. Phương pháp khảo sát

Đã đọc: `AGENTS.md`, `README.md`, `BUILD_REPORT.md`, `docs/01-product-spec.md`, `docs/03-architecture.md`, toàn bộ 4 migrations, `supabase/seed.sql`, `supabase/tests/rls_acceptance.sql`, 4 Edge Functions báo cáo (`submit-report`, `review-report`, `export-report-status`, `download-report-bundle`) + `_shared/{auth,http,validation}.ts`, `src/App.jsx`, `src/pages/Work.jsx`, `src/pages/Admin.jsx`, `src/contexts/AuthContext.jsx`, `src/components/Guards.jsx`, `src/services/supabaseClient.js`, `src/lib/status.mjs`, `src/data/mock.js`, `tests/*.mjs`, `.github/workflows/ci.yml`, `package.json`.

---

## 2. Sơ đồ workflow — hiện trạng vs mục tiêu

### Mục tiêu Phase 2 (vertical slice)
```text
Admin tạo campaign → chọn đơn vị → tạo assignments
→ chi đoàn thấy nhiệm vụ → tải template → upload file → submit (v1)
→ admin review (ACCEPT / NEEDS_SUPPLEMENT / EXEMPT)
→ chi đoàn nộp lại (v2, v1 immutable)
→ admin ACCEPT → dashboard đúng → export đúng scope
```

### Hiện trạng thực tế (điều gì đã chạy được)
```text
[DB] campaign (seed) ──> assignment (seed, KHÔNG có đường tạo qua app)
                              │
        chi đoàn: RLS cho phép ĐỌC assignment của org mình ✔
                              │
        [submit] create_report_submission() RPC atomic ✔  ── nhưng ──
                 • KHÔNG có storage policy để upload file  ✘
                 • submit-report tin metadata frontend      ⚠
                 • RLS còn cho INSERT submission trực tiếp (bỏ qua RPC) ⚠
                              │
        [review] review-report EF: đúng role nhưng
                 • KHÔNG kiểm scope đơn vị                  ⚠
                 • KHÔNG kiểm transition state-machine       ✘
                              │
        [dashboard] KHÔNG có RPC tổng hợp, Work.jsx = MOCK  ✘
        [export/bundle] có EF nhưng không lọc theo scope     ⚠
```

**Kết luận nhanh:** phần **database nền + RPC nộp báo cáo** khá vững; phần **tạo assignment, storage upload, review state-machine, dashboard, và toàn bộ UI** chưa sẵn sàng.

---

## 3. Inventory chi tiết theo lớp

### 3.1. Schema (bảng)
| Thành phần | Phân loại | Ghi chú |
| --- | --- | --- |
| `report_campaigns` | READY | Đủ trường + check `due_at>=open_at`, `close_at>=due_at`, giới hạn file/size. |
| `report_campaign_templates` | READY (schema) | Bảng OK. Vấn đề nằm ở RLS (mục 3.3). |
| `report_assignments` | READY | `unique(campaign_id, organization_id)` ✔, status enum đủ 9 trạng thái. |
| `report_submissions` | READY | `unique(assignment_id, version_number)` ✔, `version_number>0` ✔, `review_status` enum. |
| `report_submission_files` | READY | `storage_path unique` ✔, có `checksum`, `safe_name`. |
| `report_status_history` | READY (schema) | Bảng OK. Vấn đề nằm ở RLS đọc (mục 3.3). |

### 3.2. RPC / Database functions
| Thành phần | Phân loại | Ghi chú |
| --- | --- | --- |
| `create_report_submission(uuid,text,text)` | PARTIAL | Atomic tốt: `SELECT ... FOR UPDATE` trên assignment + `max(version)+1`. Kiểm role BRANCH_OFFICER, org, campaign PUBLISHED, `open_at`, hạn+allow_late, status ACCEPTED/EXEMPTED/CLOSED, quy tắc resubmit. Ghi history + audit. **Cần review:** logic gán `LATE_SUBMITTED` ghi đè `RESUBMITTED`; `search_path=public` ✔; `SECURITY DEFINER` ✔; grant `authenticated` ✔. |
| `mark_overdue_assignments()` | READY | Forward-only, revoke public, chỉ service_role (cron). Chưa gắn cron (thuộc Phase 3). |
| `create_report_assignments(campaign_id, org_ids[])` | **MISSING** | Spec §11.2 yêu cầu. Không tồn tại → không có đường tạo assignment idempotent khi publish campaign. Chặn P2-11. |
| `get_report_dashboard(campaign_id)` | **MISSING** | Spec §11.2 yêu cầu. Không có tổng hợp phía DB. Chặn P2-12. |

### 3.3. RLS & GRANT (bảng báo cáo)
| Bảng | RLS hiện có | Phân loại | Vấn đề |
| --- | --- | --- | --- |
| `report_campaigns` | SELECT (PUBLISHED/CLOSED cho active user); ALL cho admin scope | READY | — |
| `report_assignments` | SELECT (org mình / admin scope); ALL cho admin scope. GRANT `authenticated` = **chỉ select, update** (không insert) | PARTIAL | Admin *có* policy ALL nhưng **thiếu GRANT INSERT** ở tầng bảng → không insert trực tiếp được; kết hợp với thiếu RPC ⇒ không tạo assignment được (mục 3.2). |
| `report_submissions` | SELECT (org/admin); **INSERT policy trực tiếp cho BRANCH_OFFICER** | SECURITY_RISK | Policy INSERT cho phép chi đoàn `INSERT` submission thẳng qua PostgREST, **bỏ qua** `create_report_submission` (bỏ qua lock version + kiểm campaign/hạn). Nguy cơ trùng/spoof version. Không có UPDATE policy ⇒ immutability OK. |
| `report_campaign_templates` | **KHÔNG có policy nào** (RLS bật) | **MISSING** | Default-deny ⇒ chi đoàn **không đọc được template** để tải. Chặn "tải biểu mẫu" (P2-09). |
| `report_submission_files` | Chỉ SELECT (org/admin) | READY | INSERT/UPDATE/DELETE default-deny cho authenticated ⇒ chỉ service_role ghi (qua submit-report). Đúng ý đồ. |
| `report_status_history` | **KHÔNG có policy nào** (RLS bật) | PARTIAL | Chi đoàn không đọc được lịch sử trạng thái timeline. Insert chỉ qua RPC/service. Ảnh hưởng hiển thị P2-10 (nhưng review_note nằm ở `report_submissions` vẫn đọc được). |

### 3.4. Storage
| Bucket | Tồn tại | Policy `storage.objects` | Phân loại | Vấn đề |
| --- | --- | --- | --- | --- |
| `report-templates-private` | ✔ (private, 50MB) | **KHÔNG có** | **MISSING** | Không ai (trừ service_role) đọc được ⇒ tải template phải qua signed URL do EF cấp — chưa có EF đó. |
| `report-submissions-private` | ✔ (private, 100MB) | **KHÔNG có** | SECURITY_RISK / MISSING | RLS bật + không policy = fail-closed (an toàn: không rò rỉ) **nhưng** chặn luôn upload trực tiếp của chi đoàn ⇒ luồng P2-09 không chạy. Cần policy INSERT có kiểm org **hoặc** upload qua EF. Chưa có test isolation cho bucket này. |
| `documents-private` | ✔ | có (migration 0003) | READY | Tham chiếu mẫu tốt cho cách viết policy theo path. |
| `innovation-public-media` | ✔ | có (migration 0002) | READY | — |

**Path convention** (spec §9.2): `report-submissions-private/{campaign_id}/{organization_id}/{assignment_id}/v{version}/{uuid}-{safe_filename}`. Chưa được enforce ở đâu; `submit-report` chỉ kiểm `path.includes('/'+assignmentId+'/')` (yếu).

### 3.5. Edge Functions
| Function | Phân loại | Ghi chú |
| --- | --- | --- |
| `submit-report` | PARTIAL / SECURITY_RISK | Gọi RPC bằng `userClient` (tốt). **Nhưng:** (a) tin `size_bytes`/`mime_type`/`storage_path` từ frontend, **không** xác minh object Storage thật; (b) **atomicity**: RPC tạo submission xong mới `adminClient.insert(files)` — nếu insert file lỗi ⇒ submission "rỗng file" (half-completed), không rollback; (c) path check yếu. |
| `review-report` | PARTIAL / SECURITY_RISK | `requireAnyRole` = **global** (không scope) ⇒ YOUTH_ADMIN Org A review được assignment Org B. **Không** kiểm transition hợp lệ (có thể set ACCEPTED khi chưa có submission). Update `report_assignments` bằng adminClient (bỏ RLS). Có ghi history + audit + notification. |
| `export-report-status` | PARTIAL | Role global; **không** lọc dữ liệu theo scope admin ⇒ xuất mọi đơn vị của campaign. CSV có BOM ✔. |
| `download-report-bundle` | PARTIAL | Role global, không lọc scope. Có giới hạn 100 file / 50MB ✔. Tải bằng service_role (bỏ RLS) ✔. |

### 3.6. Frontend
| Thành phần | Phân loại | Ghi chú |
| --- | --- | --- |
| `src/pages/Work.jsx` | **MISSING (mock)** | Import `campaigns` từ `src/data/mock.js`; hard-code "Còn 4 ngày", "2/5"; banner "dữ liệu minh họa". Không gọi Supabase. |
| `src/services/reportService.js` | **MISSING** | Chưa tồn tại. Spec §14.1 yêu cầu. Chặn P2-07. |
| `src/pages/Admin.jsx` | PARTIAL | Có tab users/orgs (Supabase thật) nhưng **không** có quản trị campaign/dashboard báo cáo. Chặn P2-11/P2-12. |
| Routes | PARTIAL | `App.jsx` chỉ có `/cong-viec`. **Thiếu** `/cong-viec/bao-cao/:campaignId`, `/nop`, `/lich-su`, `/admin/bao-cao` (spec §6.1). |
| `src/lib/status.mjs` | READY | `REPORT_STATUS`, `daysUntil`, `normalizeSafeFileName` dùng lại tốt. |
| `AuthContext` / `Guards` | READY | Auth/role guard hoạt động; `hasRole` kiểm ACTIVE + SYSTEM_ADMIN override. |

### 3.7. Tests
| Loại | Phân loại | Ghi chú |
| --- | --- | --- |
| Frontend (`node --test`) | PARTIAL | `status.test.mjs` (3), `AuthGuard.test.mjs`. Không có test cho report service/logic. |
| pgTAP `rls_acceptance.sql` (48 tests) | PARTIAL | Bao phủ profiles/roles/documents/storage(documents)/privileges. Báo cáo chỉ có: #3 (org đọc 1 assignment), #22/#24 (scope youth admin). **Thiếu** toàn bộ test cho submission/version/concurrency/storage submission (mục 5). |
| CI (`ci.yml`) | READY | `npm ci/lint/test/build` + `supabase db reset` + `supabase test db` + `deno check/test`. Khung chạy được. |

---

## 4. Bảng Gap Analysis tổng hợp

| # | Hạng mục | Phân loại | Task liên quan |
| --- | --- | --- | --- |
| G1 | Storage policy `report-submissions-private` (upload có kiểm org) | SECURITY_RISK/MISSING | P2-03 |
| G2 | Storage policy / EF signed URL cho `report-templates-private` | MISSING | P2-03 |
| G3 | RLS policy đọc `report_campaign_templates` | MISSING | P2-03/P2-09 |
| G4 | RLS INSERT trực tiếp `report_submissions` bỏ qua RPC | SECURITY_RISK | P2-02 |
| G5 | `create_report_assignments()` RPC (idempotent) + GRANT insert | MISSING | P2-11 |
| G6 | `get_report_dashboard()` RPC | MISSING | P2-12 |
| G7 | `submit-report`: xác minh object Storage + atomicity file | SECURITY_RISK | P2-04 |
| G8 | `review-report`: scope check + transition state-machine | SECURITY_RISK | P2-05 |
| G9 | `export`/`bundle`: lọc theo scope admin | PARTIAL | P2-13 |
| G10 | `reportService.js` | MISSING | P2-07 |
| G11 | `Work.jsx` nối Supabase thật + routes chi tiết | MISSING | P2-08/P2-09/P2-10 |
| G12 | Admin quản trị campaign + dashboard UI | MISSING | P2-11/P2-12 |
| G13 | pgTAP test cho submission/version/concurrency/storage submission | NEEDS_TEST | P2-02/P2-03/P2-06 |
| G14 | RLS đọc `report_status_history` (timeline) | PARTIAL | P2-10 |

---

## 5. Bảng Security Risk (ưu tiên)

| ID | Rủi ro | Mức | Bằng chứng | Hướng xử lý (task) |
| --- | --- | --- | --- | --- |
| S1 | Chi đoàn INSERT submission trực tiếp qua PostgREST, bỏ qua lock cấp version & kiểm hạn/campaign | **P1** | `migration 0001:331` policy "branch officers insert own submissions" + GRANT insert | Siết: bỏ INSERT trực tiếp, chỉ cho qua RPC/EF; hoặc thêm trigger chặn (P2-02) |
| S2 | `submit-report` tin metadata frontend (size/mime/path), không verify object Storage | **P1** | `submit-report/index.ts:19-22` | Verify object qua adminClient.storage (P2-04) |
| S3 | `review-report` không kiểm scope ⇒ admin Org A tác động Org B | **P1** | `review-report/index.ts:9` dùng `requireAnyRole` (global) | Chuyển sang scoped check theo `assignment.organization_id` (P2-05) |
| S4 | `review-report` không kiểm transition ⇒ set trạng thái trái quy trình | **P1** | `review-report/index.ts:13-16` update thẳng | Enforce state-machine trong RPC/EF (P2-01/P2-05) |
| S5 | Upload storage submission không có policy isolation (khi mở policy phải kiểm org, tránh IDOR path) | **P2 (hiện fail-closed)** | Không có policy cho bucket | Thiết kế policy theo path org (P2-03) |
| S6 | `export`/`bundle` xuất ngoài scope admin | **P2** | 2 EF dùng role global, filter chỉ theo campaign_id | Lọc theo scope (P2-13) |
| S7 | Atomicity half-completed (submission không có file) | **P2** | `submit-report` insert file tách rời RPC | Gộp vào RPC transaction (P2-04) |

> Không phát hiện: service_role key ở frontend (❌ không có); secret trong git (❌ không có); anon đọc audit/email/quiz_options (đã revoke, có test #30-31).

---

## 6. File dự kiến sẽ đụng tới ở các task sau (chưa sửa)

- Migration mới (forward-only): storage policies report buckets, RLS templates/status_history, siết INSERT submissions, `create_report_assignments`, `get_report_dashboard`.
- `supabase/functions/submit-report/index.ts`, `review-report/index.ts`, `export-report-status/index.ts`, `download-report-bundle/index.ts`.
- `supabase/tests/rls_acceptance.sql` (+ có thể tách file test báo cáo riêng).
- `src/services/reportService.js` (mới), `src/pages/Work.jsx`, `src/pages/Admin.jsx`, `src/App.jsx` (routes), `src/data/mock.js` (gỡ khỏi production path).

## 7. Migration dự kiến (định hướng, chưa viết)

1. `2026xxxx_report_storage_policies.sql` — policy `storage.objects` cho 2 bucket report (org isolation theo path).
2. `2026xxxx_report_rls_hardening.sql` — policy đọc templates + status_history; siết INSERT submissions.
3. `2026xxxx_report_assignment_rpc.sql` — `create_report_assignments` idempotent + GRANT.
4. `2026xxxx_report_dashboard_rpc.sql` — `get_report_dashboard`.

Không sửa `202607300001_initial_schema.sql` để đổi lịch sử.

## 8. Test còn thiếu (NEEDS_TEST)

- version đầu = 1; nộp lại = 2; concurrency không trùng version.
- user khác org bị từ chối submit; assignment ACCEPTED không nộp tiếp.
- campaign chưa mở / quá hạn + `allow_late=false` bị chặn; resubmit khi cấm bị chặn.
- storage: Org A đọc file A = PASS; file B = DENY; anon = DENY; suspended = DENY.
- `review-report`: MEMBER/BRANCH_OFFICER = DENY; admin ngoài scope = DENY; transition sai = DENY.
- INSERT submission trực tiếp qua PostgREST = DENY (sau khi siết S1).

---

## 9. Phân loại tổng thể Phase 2 (điểm xuất phát)

| Lớp | READY | PARTIAL | MISSING | SECURITY_RISK | NEEDS_TEST |
| --- | --- | --- | --- | --- | --- |
| Schema | 6 | 0 | 0 | 0 | — |
| RPC | 1 | 1 | 2 | 0 | — |
| RLS/GRANT | 2 | 2 | 2 | 1 (S1) | — |
| Storage | 2 | 0 | 2 | 1 (S5) | 1 |
| Edge Fn | 0 | 4 | 0 | 3 (S2/S3/S4) | — |
| Frontend | 2 | 2 | 2 | 0 | — |
| Tests | 1 | 2 | 0 | 0 | nhiều |

**Nghiệm thu P2-00:** Đã có bằng chứng khảo sát đầy đủ (schema/RLS/RPC/Storage/EF/FE/tests + CI) và bản đồ gap/security để bắt đầu **P2-01 (State machine & security invariants)**.

---

## 10. Đề xuất thứ tự thi công (không tự thực hiện)

`P2-01` chốt state machine → `P2-02` siết RPC/atomicity version (S1) → `P2-03` storage isolation (G1/G2/G3/S5) → `P2-04` harden submit-report (S2/S7) → `P2-05` harden review-report (S3/S4) → `P2-06` security test gate.

**DỪNG. Chờ lệnh cho task tiếp theo.**
