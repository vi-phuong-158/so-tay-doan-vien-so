# P2-01 — REPORT STATE MACHINE & SECURITY INVARIANTS

**Phase:** 2 — Công việc & Báo cáo
**Task:** P2-01 (đặc tả state machine + invariants + test spec — KHÔNG code nghiệp vụ)
**Ngày:** 2026-08-09
**Branch:** `feat/phase-2a-report-foundation` (tiếp nối P2-00 @ `98ea17b`)

> Tài liệu này là **nguồn chân lý** cho các task P2-02 → P2-06. Mọi RPC/Edge Function/RLS/test sau này phải tuân theo. Task này KHÔNG sửa `submit-report`, `review-report`, Storage policy, migration cũ, hay frontend.

---

## 1. Scope

Chốt hành vi chính thức của phân hệ báo cáo ở tầng backend (database + RPC + Edge Function + Storage) **trước** khi remediation:

- State machine của `report_assignments.status` (9 trạng thái).
- Ngữ nghĩa thời gian dựa trên server/database.
- Invariants: versioning, authorization, storage, database access, audit, notification.
- Error model ổn định.
- Test matrix cho P2-02 → P2-06.
- Danh sách mâu thuẫn spec↔code và mapping S1–S7 → task.

**Ngoài scope:** email (Phase 3), reminder/cron, dashboard UI, frontend, AI, đổi mới sáng tạo.

---

## 2. Source-of-truth references (đã đối chiếu)

| # | Nguồn | Vai trò |
| --- | --- | --- |
| 1 | `docs/01-product-spec.md` §7.4, §8.3, §9, §10, §11 | Đặc tả nghiệp vụ + mô hình dữ liệu (spec mong muốn) |
| 2 | `docs/phase-2/00-baseline-gap-audit.md` | Hiện trạng + S1–S7 |
| 3 | `migrations/202607300001_initial_schema.sql:112-154` | Schema `report_*` + RLS + GRANT |
| 4 | `migrations/202607300002_storage_rpc_security.sql:15-91` | `create_report_submission`, `mark_overdue_assignments`, buckets |
| 5 | `migrations/202607300003_fix_phase_1_security.sql` | `has_role_in_scope` đệ quy, `is_organization_in_scope` |
| 6 | `functions/submit-report/index.ts` | Orchestration nộp báo cáo (hiện tin metadata FE) |
| 7 | `functions/review-report/index.ts` | Review (hiện global role, không transition guard) |
| 8 | `functions/_shared/auth.ts` | `requireGlobalRole` (=`requireAnyRole`), `requireScopedRole`, `is_organization_in_scope` |
| 9 | `supabase/seed.sql:74-81` | Campaign + assignment rehearsal (PENDING) |
| 10 | `supabase/tests/rls_acceptance.sql` | 48 pgTAP (báo cáo mới có #3, #22, #24) |
| 11 | `src/lib/status.mjs` | `REPORT_STATUS` mapping FE (9 nhãn) |

**Quy ước ưu tiên khi mâu thuẫn:** `docs/01-product-spec.md` là *nguồn mong muốn (desired)*; code hiện tại là *hiện trạng (actual)*. P2-01 chỉ ghi nhận + đề xuất; remediation ở task tương ứng.

---

## 3. Định nghĩa trạng thái `report_assignments.status`

Enum thực tế (schema `202607300001:133`): `PENDING, SUBMITTED, NEEDS_SUPPLEMENT, RESUBMITTED, ACCEPTED, OVERDUE, LATE_SUBMITTED, CLOSED, EXEMPTED`.

| Status | Ý nghĩa | Có submission? | Actor tạo ra | Terminal? | Chi đoàn còn nộp? | Admin còn review? |
| --- | --- | --- | --- | --- | --- | --- |
| `PENDING` | Đã giao, chưa nộp, còn trong hạn | Không | Hệ thống (khi publish campaign) | Không | Có (nếu campaign mở) | Không (chưa có bản nộp) |
| `SUBMITTED` | Đã nộp đúng hạn, chờ review | Có (≥v1) | BRANCH_OFFICER qua RPC | Không | Có (nếu allow_resubmission) | **Có** |
| `NEEDS_SUPPLEMENT` | Admin yêu cầu bổ sung | Có | YOUTH_ADMIN/SYSTEM_ADMIN | Không | **Có** (bắt buộc cho phép) | Chờ nộp lại |
| `RESUBMITTED` | Đã nộp lại sau yêu cầu bổ sung | Có (≥v2) | BRANCH_OFFICER qua RPC | Không | Có (nếu tiếp tục allow) | **Có** |
| `ACCEPTED` | Admin xác nhận hoàn thành | Có | YOUTH_ADMIN/SYSTEM_ADMIN | **Có (terminal)** | **Không** | Không (đã đóng) |
| `OVERDUE` | Quá hạn, chưa nộp | Không | Cron `mark_overdue_assignments()` | Không | Có nếu allow_late (→ LATE_SUBMITTED) | Không |
| `LATE_SUBMITTED` | Nộp sau hạn | Có | BRANCH_OFFICER qua RPC (khi `now()>due`) | Không | Có (nếu allow_resubmission) | **Có** |
| `CLOSED` | Đóng ở cấp assignment (không nộp, không hoàn thành) | Có thể không | Admin/hệ thống (khi đóng campaign — xem §5.C) | **Có (terminal)** | Không | Không |
| `EXEMPTED` | Được miễn nộp, có lý do + người duyệt | Không (thường) | YOUTH_ADMIN/SYSTEM_ADMIN | **Có (terminal)** | **Không** | Không |

**Trạng thái khởi đầu:** `PENDING` (mọi assignment mới).
**Terminal states:** `ACCEPTED`, `EXEMPTED`, `CLOSED`.
**Terminal đối với việc nộp (chặn RPC):** hiện `create_report_submission` chặn `status in ('ACCEPTED','EXEMPTED','CLOSED')` (migration `0002:38`).

> **Lưu ý mã hoá hiện tại:** `review-report` ghi trực tiếp `report_assignments.status = action` cho `ACCEPTED/NEEDS_SUPPLEMENT/EXEMPTED`, nhưng **không** cập nhật `report_submissions.review_status` (vẫn `PENDING`). ⇒ mâu thuẫn C4 (§15).

---

## 4. Ma trận transition (chính thức — desired)

Ký hiệu actor: **BO** = BRANCH_OFFICER (scope org của assignment); **YA** = YOUTH_ADMIN (scope org của assignment, gồm descendant qua `is_organization_in_scope`); **SA** = SYSTEM_ADMIN (global); **SYS** = tiến trình hệ thống/cron; **PUB** = hành động publish campaign.

| From | To | Actor | Điều kiện | Server-side check bắt buộc | Side effects | Audit |
| --- | --- | --- | --- | --- | --- | --- |
| (none) | `PENDING` | PUB | Campaign `PUBLISHED`; org được chọn; chưa có assignment `(campaign,org)` | `unique(campaign_id,organization_id)`; role YA/SA scope org | notif BO org; history `(null→PENDING)` | ✔ |
| `PENDING` | `SUBMITTED` | BO | `open_at ≤ now ≤ effective_due_at`; campaign `PUBLISHED`; có ≥1 file | RPC: role BO, org khớp, campaign mở, hạn, file meta | tạo submission v1; notif submitter; history | ✔ |
| `PENDING` | `LATE_SUBMITTED` | BO | `now > effective_due_at`; `allow_late=true`; campaign `PUBLISHED` | RPC như trên + `is_late=true` | submission v1 (`is_late`); notif; history | ✔ |
| `PENDING` | `OVERDUE` | SYS | `now > effective_due_at`; chưa nộp; campaign `PUBLISHED` | cron `mark_overdue_assignments()` | history | ✔ (batch) |
| `PENDING` | `EXEMPTED` | YA/SA | có lý do | scope check + reason | notif; history; `exempted_at`,`exempt_reason` | ✔ |
| `OVERDUE` | `LATE_SUBMITTED` | BO | `allow_late=true`; campaign `PUBLISHED` | RPC | submission (`is_late`); notif; history | ✔ |
| `OVERDUE` | `EXEMPTED` | YA/SA | có lý do | scope + reason | như trên | ✔ |
| `SUBMITTED` | `ACCEPTED` | YA/SA | có submission | scope + transition guard | notif hoàn thành; `accepted_at`; set `review_status=ACCEPTED` bản mới nhất | ✔ |
| `SUBMITTED` | `NEEDS_SUPPLEMENT` | YA/SA | reason bắt buộc | scope + reason + guard | notif bổ sung; history; `review_status=NEEDS_SUPPLEMENT` | ✔ |
| `LATE_SUBMITTED` | `ACCEPTED` | YA/SA | — | scope + guard | như SUBMITTED→ACCEPTED | ✔ |
| `LATE_SUBMITTED` | `NEEDS_SUPPLEMENT` | YA/SA | reason | scope + reason | như trên | ✔ |
| `NEEDS_SUPPLEMENT` | `RESUBMITTED` | BO | được phép nộp lại (luôn cho khi NEEDS_SUPPLEMENT); campaign `PUBLISHED`; trong cửa sổ thời gian đã chốt (§5.E) | RPC: role/org/version + `is_late` theo thời điểm | submission vN+1; notif; history | ✔ |
| `RESUBMITTED` | `ACCEPTED` | YA/SA | — | scope + guard | như trên | ✔ |
| `RESUBMITTED` | `NEEDS_SUPPLEMENT` | YA/SA | reason | scope + reason | vòng lặp bổ sung | ✔ |
| `SUBMITTED`/`RESUBMITTED`/`LATE_SUBMITTED`/`PENDING`/`OVERDUE` | `CLOSED` | YA/SA/SYS | campaign chuyển `CLOSED` (§5.C) | scope | history `(x→CLOSED)` | ✔ |

### 4bis. Trả lời câu hỏi bắt buộc §3 (MASTER PROMPT)

- **A. ACCEPTED có nộp lại?** **KHÔNG.** `ACCEPTED` terminal; RPC đã chặn (`0002:38`). Nếu cần mở lại phải có transition admin tường minh `ACCEPTED→NEEDS_SUPPLEMENT` — **hiện KHÔNG có use case trong spec ⇒ để đóng (fail-closed).** → `DECISION_REQUIRED D1`.
- **B. EXEMPTED → PENDING?** Spec không quy định ⇒ **fail-closed: KHÔNG cho quay lại.** EXEMPTED terminal. → `DECISION_REQUIRED D2`.
- **C. CLOSED là assignment hay campaign?** Schema có `CLOSED` ở cả campaign (`report_campaigns.status`) và assignment. **Chốt:** `CLOSED` cấp assignment = trạng thái *dẫn xuất* khi **campaign** chuyển `CLOSED` mà assignment chưa terminal. Không dùng `CLOSED` như hành động review độc lập của admin trên một assignment đơn lẻ. → §5.C.
- **D. Campaign đóng khi assignment đang SUBMITTED chưa review?** Giữ nguyên bản nộp (immutable), assignment có thể vẫn cho admin `ACCEPTED`/`NEEDS_SUPPLEMENT` trong cửa sổ review sau `close_at` (§5). Nếu chính sách là "đóng cứng", chuyển sang `CLOSED`. → `DECISION_REQUIRED D3`.
- **E. Admin yêu cầu bổ sung sau hạn — nộp lại được không? `is_late`?** **Được** (NEEDS_SUPPLEMENT luôn mở đường nộp lại). `is_late` tính theo `now() > effective_due_at` tại thời điểm nộp lại ⇒ bản nộp lại sau hạn sẽ `is_late=true`. **Nhưng** hiện RPC gán `status='LATE_SUBMITTED'` **ghi đè** `'RESUBMITTED'` (`0002:43-44`) ⇒ mất dấu "đã nộp lại". → mâu thuẫn C1 (§15), đề xuất tách `is_late` (cột) khỏi `status` (nhãn workflow).
- **F. `allow_resubmission=false` chặn gì?** Phân biệt: (i) **nộp lại tự nguyện** (assignment đang SUBMITTED/LATE_SUBMITTED) → **BỊ CHẶN** khi false; (ii) **nộp lại do admin yêu cầu** (assignment `NEEDS_SUPPLEMENT`) → **VẪN CHO** bất kể `allow_resubmission`. Code hiện đúng: `not (allow_resubmission or status='NEEDS_SUPPLEMENT')` (`0002:39-40`). ✔ Giữ nguyên semantics này.

---

## 5. Forbidden transitions (bắt buộc chặn ở server)

| Bị cấm | Lý do | Error code |
| --- | --- | --- |
| `ACCEPTED → SUBMITTED/RESUBMITTED` (nộp tiếp) | Terminal | `REPORT_ALREADY_ACCEPTED` |
| `EXEMPTED → *` (nộp/nộp lại) | Terminal | `REPORT_EXEMPTED` |
| `CLOSED → *` (nộp) | Terminal | `REPORT_CLOSED` |
| `PENDING/OVERDUE → ACCEPTED` (accept khi chưa có submission) | Không có bản nộp để duyệt | `INVALID_REPORT_TRANSITION` |
| `PENDING → NEEDS_SUPPLEMENT` (yêu cầu bổ sung khi chưa nộp) | Không có gì để bổ sung | `INVALID_REPORT_TRANSITION` |
| BO thực hiện `→ ACCEPTED/NEEDS_SUPPLEMENT/EXEMPTED` | Không phải actor review | `ASSIGNMENT_SCOPE_DENIED` / `FORBIDDEN` |
| YA/SA ngoài scope org của assignment thực hiện bất kỳ transition | Isolation | `ASSIGNMENT_SCOPE_DENIED` |
| Submit khi `now < open_at` | Chưa mở | `REPORT_NOT_OPEN` |
| Submit khi `now > effective_due_at` và `allow_late=false` | Quá hạn | `LATE_SUBMISSION_NOT_ALLOWED` |
| Submit khi campaign `status≠PUBLISHED` | Chưa/đã đóng đợt | `REPORT_NOT_OPEN` / `REPORT_CLOSED` |
| Nộp lại tự nguyện khi `allow_resubmission=false` và không NEEDS_SUPPLEMENT | Policy | `RESUBMISSION_NOT_ALLOWED` |
| Tạo assignment trùng `(campaign,org)` | Idempotency | (unique constraint) |
| Đổi `organization_id` của assignment | Isolation | (không expose) |

### Time semantics (server/database `now()` — KHÔNG dùng đồng hồ browser)

```text
effective_due_at = COALESCE(report_assignments.due_at_override, report_campaigns.due_at)
open_at          = report_campaigns.open_at
close_at         = report_campaigns.close_at   (nullable)
```

| Cửa sổ | Submit | Ghi chú |
| --- | --- | --- |
| `now < open_at` | DENY (`REPORT_NOT_OPEN`) | Kể cả campaign đã PUBLISHED |
| `open_at ≤ now ≤ effective_due_at` | ALLOW → `SUBMITTED` | `is_late=false` |
| `effective_due_at < now` và `allow_late=true` | ALLOW → `LATE_SUBMITTED` (`is_late=true`) | Chỉ khi campaign còn `PUBLISHED` |
| `effective_due_at < now` và `allow_late=false` | DENY (`LATE_SUBMISSION_NOT_ALLOWED`) | — |

**§5.C — CLOSED / close_at:**
- `close_at` là mốc **đóng cứng cấp campaign**. **Chốt (desired):** sau `close_at`, KHÔNG nhận submission mới **bất kể** `allow_late` (khác code hiện tại — xem C2 §15). `allow_late` chỉ áp dụng cho cửa sổ `due_at → close_at`.
- Sau `close_at`: **còn cho admin `ACCEPTED`/`NEEDS_SUPPLEMENT`** trên bản đã nộp trong **cửa sổ review** (không giới hạn cứng ở P2, trừ khi campaign `ARCHIVED`). Resubmit sau `close_at`: **DENY** (đợt đã đóng). → `DECISION_REQUIRED D3` xác nhận độ dài cửa sổ review.
- Khi campaign chuyển `CLOSED`: assignment chưa terminal → gợi ý set `CLOSED` (batch), giữ submission immutable.

---

## 6. Version invariants

| ID | Invariant |
| --- | --- |
| `RPT-V01` | Mỗi assignment có `version_number` tăng đơn điệu, bắt đầu từ 1. |
| `RPT-V02` | Không tồn tại 2 submission cùng `(assignment_id, version_number)` (đã có unique `0001:144`). |
| `RPT-V03` | Version đã tạo là **immutable** với BRANCH_OFFICER (không UPDATE/DELETE). |
| `RPT-V04` | Không sửa danh sách file của submission cũ để biểu diễn nộp lại; nộp lại = submission mới + file mới. |
| `RPT-V05` | Mỗi resubmission luôn tạo submission mới (không ghi đè). |
| `RPT-V06` | Cấp version phải **atomic** dưới đồng thời: 2 request cùng assignment ⇒ 2 version khác nhau, hoặc 1 request fail hợp lệ; **tuyệt đối không duplicate**. (Hiện đảm bảo bằng `SELECT ... FOR UPDATE` trên assignment + `max()+1` + unique — `0002:32,42`.) |
| `RPT-V07` | `is_late` là thuộc tính **của submission** (bất biến sau khi ghi), độc lập với nhãn workflow của assignment. |
| `RPT-V08` | `review_status` của một submission phản ánh kết quả review **của chính bản đó**; review bản mới không được viết lại bản cũ. |

---

## 7. Authorization invariants

Actors: `MEMBER, BRANCH_OFFICER, INNOVATION_MEMBER, YOUTH_ADMIN, SYSTEM_ADMIN`.

| ID | Invariant |
| --- | --- |
| `RPT-A01` | **BRANCH_OFFICER** chỉ thao tác assignment thuộc `organization_id = current_org_id()`; không tạo assignment, không review/accept/exempt, không sửa submission cũ. |
| `RPT-A02` | **MEMBER** và **INNOVATION_MEMBER** không được submit/review báo cáo (submit yêu cầu BO — `0002:28`). Chỉ đọc theo RLS org nếu áp dụng. |
| `RPT-A03` | **YOUTH_ADMIN** KHÔNG mặc định global. Phải kiểm qua `has_role_in_scope('YOUTH_ADMIN', assignment.organization_id)`: `scope_organization_id IS NULL` ⇒ toàn hệ; ngược lại chỉ trong cây org (`is_organization_in_scope`, gồm descendant). |
| `RPT-A04` | **SYSTEM_ADMIN** có global access nhưng **vẫn phải đi qua state-machine** (không bypass forbidden transitions §5). Không có "super submit/accept" tuỳ tiện. |
| `RPT-A05` | Không actor nào được đổi `organization_id` của assignment/submission, hay tự nâng role. |
| `RPT-A06` | Mọi quyết định authorization dựa trên dữ liệu server (role/org/time), không dựa input frontend (chống S2/S3). |
| `RPT-A07` | Ẩn nút/route frontend KHÔNG phải biện pháp bảo mật; enforce tại RLS/RPC/Edge Function. |

> **Hiện trạng cần siết (P2-05):** `review-report`, `export-report-status`, `download-report-bundle` dùng `requireAnyRole` = **global** (`auth.ts:37,61`) ⇒ vi phạm `RPT-A03`. Phải chuyển sang `requireScopedRole(..., assignment.organization_id)`.

---

## 8. Storage invariants

| ID | Invariant |
| --- | --- |
| `RPT-F01` | File báo cáo mặc định **private** (`report-submissions-private`, `report-templates-private`). |
| `RPT-F02` | Org A không đọc object của Org B (isolation theo path org). |
| `RPT-F03` | Không suy quyền từ path do client tự khai; đường dẫn phải khớp `campaign/org/assignment` được xác thực. |
| `RPT-F04` | Signed URL chỉ tạo **sau** authorization; thời hạn ngắn. |
| `RPT-F05` | Submission đã finalized không overwrite file (không dùng `upsert`/trùng `storage_path`; đã có unique `0001:148`). |
| `RPT-F06` | Storage object phải được **xác minh tồn tại** (và mức an toàn: size/owner) trước hoặc trong khi finalize submission (chống S2/S7). |
| `RPT-F07` | Không để orphan object/submission mà không có chiến lược cleanup/reconciliation. |

**Path convention (chốt, theo spec §9.2):**
```text
report-submissions-private/{campaign_id}/{organization_id}/{assignment_id}/v{version}/{uuid}-{safe_filename}
report-templates-private/{campaign_id}/{uuid}-{safe_filename}
```

**Chiến lược finalization đề xuất (giải S7 ở mức kiến trúc — implement P2-04, KHÔNG ở P2-01):**
```text
1. Client xin quyền upload (server cấp signed upload URL vào path staging đã ràng buộc org/assignment)
   HOẶC upload trực tiếp qua Storage policy INSERT có kiểm org (P2-03).
2. submit-report: verify object tồn tại qua adminClient.storage (size/owner/path khớp).
3. Finalize ATOMIC: tạo submission + insert file metadata trong CÙNG một RPC/transaction.
   Nếu bước file lỗi ⇒ rollback cả submission (không để half-completed).
4. Reconciliation job (Phase sau): dọn object staging không được finalize.
```

---

## 9. Database access invariants (mức khái niệm — enforce ở P2-02/P2-03)

| Bảng | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `report_campaigns` | active user: PUBLISHED/CLOSED; admin scope: all | YA/SA scope | YA/SA scope | YA/SA scope (soft) |
| `report_campaign_templates` | org được giao + admin scope (**cần policy — G3**) | YA/SA scope | YA/SA scope | YA/SA scope |
| `report_assignments` | org mình + admin scope | **chỉ qua RPC** `create_report_assignments` (không INSERT trực tiếp FE — G5) | chỉ qua RPC/EF review | không (giữ lịch sử) |
| `report_submissions` | org mình + admin scope | **KHÔNG INSERT trực tiếp FE** — chỉ qua `create_report_submission` (siết **S1**) | không (immutable RPT-V03); review_status chỉ do EF/RPC review | không |
| `report_submission_files` | org mình + admin scope | không FE trực tiếp (chỉ service_role/RPC) | không | không |
| `report_status_history` | org mình + admin scope (**cần policy đọc — G14**) | không FE trực tiếp (chỉ RPC/EF) | không | không |

**Chốt (desired) trả lời §8 MASTER PROMPT:**
- `report_submissions`: **BRANCH_OFFICER KHÔNG INSERT trực tiếp** → gỡ policy "branch officers insert own submissions" (`0001:331`) hoặc thay bằng trigger chặn ghi ngoài RPC. (**S1**, P2-02.)
- `report_submission_files`: FE không insert metadata finalized (hiện đã default-deny — giữ).
- `report_status_history`: FE không insert trực tiếp (hiện đã default-deny — giữ; chỉ cần **bổ sung policy SELECT** để hiển thị timeline).

---

## 10. Audit invariants

Sự kiện bắt buộc ghi `audit_logs` (chỉ trường cần thiết — KHÔNG lưu file/nội dung nhạy cảm, token, path đầy đủ nếu nhạy cảm):

| Sự kiện | action (đề xuất) | entity | after_data tối thiểu |
| --- | --- | --- | --- |
| Publish campaign | `REPORT_CAMPAIGN_PUBLISHED` | `report_campaign` | `{status, org_count}` |
| Tạo assignment | `REPORT_ASSIGNMENT_CREATED` | `report_assignment` | `{campaign_id, organization_id}` |
| Submit / Resubmit | `REPORT_SUBMITTED` | `report_submission` | `{version, status, is_late}` (đã có `0002:53`) |
| Review ACCEPTED | `REPORT_REVIEWED` | `report_assignment` | `{status:ACCEPTED}` (đã có `review-report`) |
| NEEDS_SUPPLEMENT | `REPORT_REVIEWED` | `report_assignment` | `{status, reason}` |
| EXEMPTED | `REPORT_REVIEWED`/`REPORT_EXEMPTED` | `report_assignment` | `{status:EXEMPTED, reason}` |
| Manual admin transition (nếu có sau này) | `REPORT_TRANSITION` | `report_assignment` | `{from,to,reason}` |

Invariant `RPT-AU01`: mọi transition thay đổi `status` phải có bản ghi `report_status_history` **và** `audit_logs` tương ứng, trong cùng transaction với thay đổi.

---

## 11. Notification side effects (in-app; email = Phase 3)

| Transition | Notification | Người nhận |
| --- | --- | --- |
| (publish) → assignment `PENDING` | "Có đợt báo cáo mới" | BRANCH_OFFICER của org được giao |
| → `SUBMITTED`/`LATE_SUBMITTED`/`RESUBMITTED` | "Đã nộp báo cáo (vN)" | submitter (đã có `submit-report`) |
| → `NEEDS_SUPPLEMENT` | "Báo cáo cần bổ sung" + reason | submitter bản mới nhất (đã có `review-report`) |
| → `ACCEPTED` | "Báo cáo đã hoàn thành" | submitter (đã có) |
| → `EXEMPTED` | "Đơn vị được miễn nộp" | BRANCH_OFFICER org (nếu phù hợp) |

Invariant `RPT-N01`: notification là side effect **không được chặn** transaction chính; lỗi notification không rollback submission/review (best-effort). `RPT-N02`: không đưa file/link private trực tiếp; chỉ `action_url` route nội bộ.

---

## 12. Error model (ổn định, cho frontend map)

Đề xuất mã lỗi ổn định (Edge Function trả `{success:false, error:CODE}`; RPC `raise exception CODE`). Frontend map CODE→thông điệp, **không** parse chuỗi SQL.

| Code | Ý nghĩa | HTTP |
| --- | --- | --- |
| `REPORT_NOT_OPEN` | `now<open_at` hoặc campaign chưa PUBLISHED | 409 |
| `REPORT_CLOSED` | Sau `close_at` / campaign CLOSED | 409 |
| `REPORT_OVERDUE` | (nếu cần phân biệt) quá hạn chưa nộp | 409 |
| `LATE_SUBMISSION_NOT_ALLOWED` | Quá hạn + `allow_late=false` | 409 |
| `RESUBMISSION_NOT_ALLOWED` | Nộp lại tự nguyện khi cấm | 409 |
| `INVALID_REPORT_TRANSITION` | Transition không hợp lệ theo §4/§5 | 409 |
| `ASSIGNMENT_SCOPE_DENIED` | Actor ngoài scope org | 403 |
| `REPORT_ALREADY_ACCEPTED` | Assignment đã ACCEPTED | 409 |
| `REPORT_EXEMPTED` | Assignment đã EXEMPTED | 409 |
| `FILE_SCOPE_INVALID` | Path/file không khớp assignment/org | 400 |
| `FILE_TYPE_NOT_ALLOWED` / `FILE_TOO_LARGE` / `TOO_MANY_FILES` | Vi phạm ràng buộc file (đã có) | 400 |
| `UNAUTHENTICATED` / `FORBIDDEN` | Auth/role (đã có) | 401/403 |

> Hiện `create_report_submission` dùng: `FORBIDDEN, ASSIGNMENT_NOT_FOUND, CAMPAIGN_NOT_OPEN, SUBMISSION_CLOSED, ASSIGNMENT_CLOSED, RESUBMISSION_NOT_ALLOWED`. P2-02 nên **ánh xạ về bộ chuẩn trên** (giữ tương thích hoặc đổi có kiểm soát). → mâu thuẫn nhẹ C5 (§15).

---

## 13. Test matrix (spec cho P2-02 → P2-06)

Ký hiệu kỳ vọng: **PASS** = thành công; **DENY** = bị từ chối với error code đúng.

### 13.1. Happy path (P2-02)
| # | Kịch bản | Kỳ vọng |
| --- | --- | --- |
| H1 | `PENDING` → submit v1 (trong hạn) | PASS, version=1, status SUBMITTED, is_late=false |
| H2 | admin NEEDS_SUPPLEMENT | PASS, status NEEDS_SUPPLEMENT, reason ghi |
| H3 | submit lại → v2 | PASS, version=2, status RESUBMITTED |
| H4 | admin ACCEPTED | PASS, terminal; v1 vẫn tồn tại & immutable |

### 13.2. Version & Concurrency (P2-02) — chứng minh `RPT-V01/02/06`
| # | Kịch bản | Kỳ vọng |
| --- | --- | --- |
| V1 | version đầu tiên | =1 |
| V2 | lần nộp kế | =2 |
| V3 | 2 request đồng thời cùng assignment | 2 version khác nhau HOẶC 1 fail; KHÔNG duplicate |
| V4 | thử UPDATE/DELETE submission cũ (BO) | DENY |

### 13.3. Isolation (P2-02/P2-03) — `RPT-A01/F02`
| # | Kịch bản | Kỳ vọng |
| --- | --- | --- |
| I1 | Org A submit assignment Org B | DENY (`ASSIGNMENT_SCOPE_DENIED`/`ASSIGNMENT_NOT_FOUND`) |
| I2 | Org A đọc file Org B (metadata) | DENY |
| I3 | Org A tải object Org B trong `report-submissions-private` | DENY |
| I4 | Anonymous đọc object | DENY |
| I5 | Suspended BO submit/đọc | DENY (fail-closed) |
| I6 | Org A đọc submission Org B | DENY |

### 13.4. Terminal state (P2-02)
| # | Kịch bản | Kỳ vọng |
| --- | --- | --- |
| T1 | ACCEPTED → submit | DENY (`REPORT_ALREADY_ACCEPTED`) |
| T2 | EXEMPTED → submit | DENY (`REPORT_EXEMPTED`) |
| T3 | CLOSED → submit | DENY (`REPORT_CLOSED`) |

### 13.5. Role (P2-02/P2-05)
| # | Kịch bản | Kỳ vọng |
| --- | --- | --- |
| R1 | MEMBER submit | DENY (yêu cầu BO) |
| R2 | BRANCH_OFFICER review | DENY |
| R3 | INNOVATION_MEMBER submit/review | DENY |
| R4 | direct `INSERT report_submissions` qua PostgREST (BO) | DENY sau siết S1 |

### 13.6. Scope (P2-05)
| # | Kịch bản | Kỳ vọng |
| --- | --- | --- |
| SC1 | YOUTH_ADMIN scope Org A review assignment Org B | DENY (`ASSIGNMENT_SCOPE_DENIED`) |
| SC2 | YOUTH_ADMIN scope Ban TN (parent) review CĐ con | PASS (recursive scope) |
| SC3 | SYSTEM_ADMIN review bất kỳ | PASS (nhưng vẫn theo transition) |
| SC4 | export/bundle scope Org A chứa dữ liệu Org B | KHÔNG chứa Org B (P2-13) |

### 13.7. Transition guard (P2-05)
| # | Kịch bản | Kỳ vọng |
| --- | --- | --- |
| G1 | ACCEPT khi assignment PENDING (chưa có submission) | DENY (`INVALID_REPORT_TRANSITION`) |
| G2 | NEEDS_SUPPLEMENT khi PENDING | DENY |
| G3 | NEEDS_SUPPLEMENT không kèm reason | DENY (`REASON_REQUIRED`) |
| G4 | ACCEPT rồi ACCEPT lại | DENY / idempotent (chốt ở P2-05) |

### 13.8. Time (P2-02) — dùng server time
| # | Kịch bản | Kỳ vọng |
| --- | --- | --- |
| TM1 | submit khi `now<open_at` | DENY (`REPORT_NOT_OPEN`) |
| TM2 | submit sau due, `allow_late=false` | DENY (`LATE_SUBMISSION_NOT_ALLOWED`) |
| TM3 | submit sau due, `allow_late=true`, trước close | PASS, LATE_SUBMITTED, is_late=true |
| TM4 | submit sau `close_at` (kể cả allow_late) | DENY (`REPORT_CLOSED`) — theo §5.C desired |
| TM5 | review sau `close_at` (bản đã nộp) | PASS trong cửa sổ review (§5.C, D3) |

### 13.9. Storage finalization (P2-04) — `RPT-F06/F07/S7`
| # | Kịch bản | Kỳ vọng |
| --- | --- | --- |
| F1 | submit với `storage_path` không tồn tại thật | DENY (`FILE_SCOPE_INVALID`) |
| F2 | submit với size khai gian khác object thật | DENY hoặc dùng size thật |
| F3 | RPC tạo submission nhưng insert file lỗi | rollback, KHÔNG half-completed |
| F4 | path không khớp `{org}/{assignment}` | DENY (`FILE_SCOPE_INVALID`) |

---

## 14. Mapping phát hiện P2-00 (S1–S7) → task remediation

| Finding | Mô tả ngắn | Remediation Task | Invariant liên quan |
| --- | --- | --- | --- |
| S1 | INSERT trực tiếp `report_submissions` bypass RPC | **P2-02** | `RPT-V06`, §9 |
| S2 | `submit-report` tin metadata frontend | **P2-04** | `RPT-F06`, `RPT-A06` |
| S3 | `review-report` thiếu scope check | **P2-05** | `RPT-A03` |
| S4 | `review-report` chưa enforce transition | **P2-05** | §4/§5, `INVALID_REPORT_TRANSITION` |
| S5 | Thiếu Storage isolation policy submissions | **P2-03** | `RPT-F01/F02/F03` |
| S6 | export/bundle chưa lọc admin scope | **P2-13** | `RPT-A03`, SC4 |
| S7 | submission tạo nhưng file insert lỗi (half-completed) | **P2-04** | `RPT-F06/F07`, F3 |
| G3 | Thiếu RLS đọc `report_campaign_templates` | P2-03 | §9 |
| G5 | Thiếu `create_report_assignments` + GRANT | P2-11 (RPC nền) / thiết kế P2-02 | §4 dòng publish |
| G6 | Thiếu `get_report_dashboard` | P2-12 | — |
| G14 | Thiếu RLS đọc `report_status_history` | P2-03/P2-10 | §9 |

---

## 15. Mâu thuẫn spec ↔ code hiện tại (ghi nhận, chưa sửa)

| ID | Mâu thuẫn | Nguồn desired | Xử lý ở |
| --- | --- | --- | --- |
| C1 | `create_report_submission` gán `status='LATE_SUBMITTED'` **ghi đè** `'RESUBMITTED'` khi nộp lại sau hạn ⇒ mất dấu resubmit. Đề xuất: `is_late` là cột riêng (đã có), giữ nhãn workflow đúng (RESUBMITTED) và set `is_late=true`. | spec §7.4.2/§7.4.4 | P2-02 |
| C2 | RPC cho submit sau `close_at` nếu `allow_late=true` (`0002:37` dùng `coalesce(close_at,due_at)`), trong khi desired coi `close_at` là đóng cứng. | §5.C | P2-02 |
| C3 | RLS `report_submissions` cho **BO INSERT trực tiếp** (`0001:331`) song song với RPC ⇒ đường bypass (S1). | §9, `RPT-V06` | P2-02 |
| C4 | `review-report` cập nhật `report_assignments.status` nhưng **không** cập nhật `report_submissions.review_status` ⇒ hai nguồn lệch nhau. | `RPT-V08` | P2-05 |
| C5 | Error codes RPC hiện (`CAMPAIGN_NOT_OPEN`, `SUBMISSION_CLOSED`, `ASSIGNMENT_CLOSED`...) khác bộ chuẩn §12. | §12 | P2-02 (ánh xạ) |
| C6 | `review-report`/export/bundle dùng role **global** thay vì scoped (S3/S6). | `RPT-A03` | P2-05/P2-13 |
| C7 | `report_campaign_templates` & `report_status_history` bật RLS nhưng **không có policy** ⇒ FE không đọc được (template/timeline). | §9, G3/G14 | P2-03 |

---

## 16. DECISION_REQUIRED (cần chủ dự án chốt trước/khi vào P2-02, kèm đề xuất fail-closed)

| ID | Câu hỏi | Đề xuất an toàn nhất |
| --- | --- | --- |
| **D1** | Có cho phép `ACCEPTED → NEEDS_SUPPLEMENT` (mở lại bản đã duyệt)? | **Không** (fail-closed). Nếu cần, chỉ SYSTEM_ADMIN + audit rõ, thêm ở task riêng — không mặc định. |
| **D2** | `EXEMPTED` có thể huỷ để quay lại `PENDING`? | **Không** (fail-closed, terminal). |
| **D3** | Sau `close_at`, cửa sổ review kéo dài bao lâu? Review có bị chặn khi campaign `ARCHIVED`? | Cho review đến khi campaign `ARCHIVED`; `ARCHIVED` = khoá cả review. Resubmit sau close: **cấm**. |
| **D4** | `is_late` vs nhãn `LATE_SUBMITTED`: dùng cột `is_late` làm nguồn, hay nhãn status? | Dùng **cột `is_late`** làm nguồn chân lý về trễ hạn; `LATE_SUBMITTED` chỉ là nhãn hiển thị cho lần nộp đầu tiên sau hạn khi assignment trước đó là PENDING/OVERDUE. Nộp lại giữ nhãn RESUBMITTED + `is_late` (giải C1). |
| **D5** | `close_at` đóng cứng bất kể `allow_late`? | **Có** (đề xuất §5.C). Nếu chủ dự án muốn allow_late vượt close, phải ghi rõ — hiện code đang theo hướng đó (C2). |

> Các quyết định trên **ảnh hưởng trực tiếp code P2-02/P2-05**. Không được âm thầm chọn khác trong lúc code; nếu chủ dự án không phản hồi, P2-02 mặc định theo cột "Đề xuất an toàn nhất" và ghi lại.

---

## 17. Self-review (§15 MASTER PROMPT)

1. Mọi status có định nghĩa? ✔ (§3, 9 trạng thái).
2. Transition quan trọng có actor? ✔ (§4).
3. Terminal state rõ? ✔ ACCEPTED/EXEMPTED/CLOSED (§3, D1/D2).
4. Late submission rõ? ✔ (§5, D4/C1).
5. `close_at` rõ? ✔ (§5.C, D3/D5 — có điểm cần chốt).
6. Admin scope rõ? ✔ (`RPT-A03`, C6).
7. Version immutable rõ? ✔ (`RPT-V01..V08`).
8. Storage finalization strategy rõ? ✔ (§8, staging→verify→atomic finalize).
9. S1–S7 map task? ✔ (§14).
10. Test matrix đủ bắt regression? ✔ (§13, phủ happy/late/isolation/concurrency/terminal/role/scope/time/storage).

**Điểm mơ hồ ảnh hưởng code P2-02:** đã nêu công khai tại D1–D5 và C1–C7 — không giấu.

---

**Kết luận:** State machine + invariants + error model + test matrix đã chốt (kèm 5 `DECISION_REQUIRED` an toàn-mặc-định). Đủ nền tảng để vào **P2-02 — DATABASE ATOMICITY & RPC**.

**DỪNG. Chờ lệnh cho task tiếp theo.**
