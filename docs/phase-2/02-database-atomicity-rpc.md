# P2-02 — DATABASE ATOMICITY & RPC

**Phase:** 2 — Công việc & Báo cáo
**Task:** P2-02 (database/RPC — remediation S1/C3 & C1)
**Ngày:** 2026-08-09
**Branch:** `feat/phase-2a-report-foundation` (tiếp nối P2-01 @ `9e64de8`)
**Quyết định áp dụng:** D1–D5 (đã được chủ dự án chốt).

> Chỉ chạm database/RPC + pgTAP. KHÔNG sửa Storage policy (P2-03), `submit-report` (P2-04), `review-report` (P2-05), frontend.

---

## 1. Before state (điểm xuất phát)

- `create_report_submission` (migration `202607300002`) đã atomic version (`FOR UPDATE` + `max()+1` + unique) nhưng:
  - **C1:** gán `status='LATE_SUBMITTED'` **ghi đè** `'RESUBMITTED'` khi nộp lại sau hạn ⇒ mất nhãn workflow.
  - error codes rời rạc (`CAMPAIGN_NOT_OPEN`, `SUBMISSION_CLOSED`, `ASSIGNMENT_CLOSED`…).
  - `close_at` không đóng cứng khi `allow_late=true` (dùng `coalesce(close_at,due_at)`).
- **S1/C3:** RLS policy `"branch officers insert own submissions"` (`202607300001:331`) + GRANT `insert` cho `authenticated` ⇒ chi đoàn có thể `INSERT report_submissions` thẳng qua PostgREST, **bỏ qua RPC** (bỏ lock cấp version + mọi kiểm tra hạn/campaign/terminal).
- `report_submission_files` và `report_status_history` có GRANT write cho `authenticated` nhưng không có policy write (dead grant).

## 2. Threat → remediation

| Threat | Remediation trong P2-02 |
| --- | --- |
| S1/C3 — direct INSERT bypass cấp version | Drop policy INSERT + `revoke insert,update on report_submissions from authenticated`. Submission chỉ tạo qua RPC (SECURITY DEFINER). |
| C1 — mất nhãn RESUBMITTED khi nộp lại muộn | `is_late` (cột submission) là nguồn chân lý; nhãn assignment chỉ `LATE_SUBMITTED` cho **bản nộp đầu tiên** (version=1). Resubmission (version>1) luôn `RESUBMITTED`. |
| D5 — close_at chưa hard-stop | `close_at IS NOT NULL AND now()>close_at ⇒ REPORT_CLOSED` bất kể `allow_late`. |
| D1/D2/D3 — terminal chưa chuẩn hoá | Chặn submit khi assignment `ACCEPTED/EXEMPTED/CLOSED` và campaign `CLOSED/ARCHIVED`. |
| Immutability (RPT-V03/V04) | `revoke insert,update,delete on report_submission_files`, `revoke insert on report_status_history` (defense-in-depth). |

## 3. Migration

`supabase/migrations/202608090001_phase_2_report_submission_atomicity.sql` — **forward-only, không sửa migration lịch sử, không mất dữ liệu.**

Nội dung: (1) drop policy INSERT + revoke write grants; (2) `create or replace` RPC hardened (same signature); (3) least-privilege execute grants.

## 4. RPC contract — `create_report_submission(p_assignment_id uuid, p_summary text, p_submit_note text)`

Trả về `table(submission_id uuid, version_number integer, resulting_status text)` (giữ nguyên signature ⇒ `submit-report` không đổi contract).

Thứ tự kiểm tra (fail-closed, dừng ở lỗi đầu tiên):

```text
1  auth.uid() null                       → UNAUTHENTICATED
2  không ACTIVE                           → ACCOUNT_NOT_ACTIVE
3  không BRANCH_OFFICER                   → REPORT_ROLE_DENIED
4  load assignment FOR UPDATE (lock)      ; không thấy → ASSIGNMENT_NOT_FOUND
5  assignment.org ≠ current_org_id()      → ASSIGNMENT_SCOPE_DENIED
6  status ACCEPTED/EXEMPTED/CLOSED        → REPORT_ALREADY_ACCEPTED / REPORT_EXEMPTED / REPORT_CLOSED
7  campaign DRAFT / CLOSED|ARCHIVED       → REPORT_NOT_OPEN / REPORT_CLOSED
8  now()<open_at                          → REPORT_NOT_OPEN
   close_at set & now()>close_at          → REPORT_CLOSED         (D5 hard close)
   is_late = now()>effective_due
   is_late & !allow_late                  → LATE_SUBMISSION_NOT_ALLOWED
9  version = max(version)+1  (dưới lock)
10 version>1 & !(allow_resubmission OR status=NEEDS_SUPPLEMENT) → RESUBMISSION_NOT_ALLOWED
11 status = version=1 ? (is_late?LATE_SUBMITTED:SUBMITTED) : RESUBMITTED
12 insert submission → update assignment → insert history → insert audit  (cùng transaction)
```

`effective_due = COALESCE(assignment.due_at_override, campaign.due_at)`.

## 5. Authorization

- Chỉ `BRANCH_OFFICER` submit; MEMBER/INNOVATION_MEMBER/YOUTH_ADMIN/SYSTEM_ADMIN → `REPORT_ROLE_DENIED` (RPT-A02).
- Isolation theo `organization_id = current_org_id()` (RPT-A01). Không dựa input frontend.
- `report_submissions`: `authenticated` chỉ còn **SELECT** (RLS `"organization reads own submissions"` giữ nguyên). INSERT/UPDATE bị thu hồi.
- RPC: `revoke all from public,anon` + `grant execute to authenticated`; hàm tự kiểm quyền, `SECURITY DEFINER`, `SET search_path = public`.

## 6. State/time behavior

Theo §4–§5 `01-report-state-machine.md` + D4/D5. Điểm mấu chốt: `is_late` là cột bất biến của submission; nhãn `RESUBMITTED` không bị ghi đè bởi `LATE_SUBMITTED` (giải C1). `close_at` hard-stop (giải C2/D5). `close_at IS NULL` + `allow_late=true` ⇒ late tiếp tục sau due cho tới khi campaign đóng qua lifecycle (CLOSED/ARCHIVED).

## 7. Version strategy

`version_number` = `MAX(version_number)+1` tính **sau** khi `SELECT ... FOR UPDATE` khoá dòng assignment. Backstop `unique(assignment_id, version_number)`. Resubmission luôn là submission mới; không UPDATE/DELETE bản cũ (RPT-V01..V08).

## 8. Concurrency strategy

`FOR UPDATE` trên dòng `report_assignments` serialize mọi caller đồng thời cùng assignment: request thứ hai chờ tới khi request đầu commit rồi mới đọc `max(version)` (đã gồm bản của request đầu) ⇒ version khác nhau, không trùng. Nếu vì lý do bất thường hai caller cùng tính một version, `unique(assignment_id, version_number)` chặn (SQLSTATE 23505). Test T3 chứng minh backstop; mô phỏng concurrency thực (2 kết nối) là integration test — xem §11 (BLOCKED_BY_ENVIRONMENT).

## 9. Grants/RLS changes (tóm tắt)

| Đối tượng | Trước | Sau |
| --- | --- | --- |
| policy `"branch officers insert own submissions"` | tồn tại | **DROP** |
| `report_submissions` (authenticated) | select, insert, update | **select** |
| `report_submission_files` (authenticated) | select, insert, update, delete | **select** |
| `report_status_history` (authenticated) | select, insert | **select** |
| `create_report_submission` execute | public revoked, authenticated | anon revoked, **authenticated** |

## 10. Tests

`supabase/tests/report_submission_atomicity.sql` (pgTAP, `no_plan()`, begin/rollback). Bao phủ:

| Test | Nội dung | Kỳ vọng |
| --- | --- | --- |
| T1 | initial submit | v1, SUBMITTED, is_late=false |
| T2 | voluntary resubmit (allow=true) | v2, RESUBMITTED |
| T16 | status history ghi PENDING→SUBMITTED | 1 row |
| T3 | duplicate (assignment,version) | 23505 |
| T4 | cross-org submit | ASSIGNMENT_SCOPE_DENIED |
| T5 | direct INSERT (bypass) | permission denied (42501) |
| T5b | BO tự UPDATE status=ACCEPTED | no-op (RLS), status giữ RESUBMITTED |
| T6/T7 | submit vào ACCEPTED/EXEMPTED | REPORT_ALREADY_ACCEPTED / REPORT_EXEMPTED |
| T8 | before open | REPORT_NOT_OPEN |
| T9 | late + allow_late=false | LATE_SUBMISSION_NOT_ALLOWED |
| T10 | late + allow_late=true, trước close | LATE_SUBMITTED, is_late=true |
| T11 | sau close_at (late enabled) | REPORT_CLOSED (D5) |
| T12 | NEEDS_SUPPLEMENT sau due, trước close | v2, **RESUBMITTED**, is_late=true (C1/D4) |
| T13 | voluntary resubmit + allow=false | RESUBMISSION_NOT_ALLOWED |
| T14 | NEEDS_SUPPLEMENT resubmit + allow=false | v2, RESUBMITTED |
| R1/R3 | MEMBER / INNOVATION_MEMBER submit | REPORT_ROLE_DENIED |
| T15 | suspended officer submit | ACCOUNT_NOT_ACTIVE |
| priv | execute RPC: authenticated=EXECUTE, anon=∅ | pass |

**Lệnh đã chạy (môi trường này):**

```text
npm test        → 9/9 pass
npm run lint    → 0 errors (3 warnings pre-existing)
npm run build   → success (vite build OK)
npx supabase db reset → FAILED: Docker daemon không khả dụng (LegacyLocalDbRunningError: failed to inspect service)
```

**BLOCKED_BY_ENVIRONMENT:** máy này **không có Docker và Deno** ⇒ không chạy được `supabase db reset`, `supabase test db`, `deno test`. Migration + pgTAP đã viết đầy đủ nhưng **chưa được thực thi**; phải chạy trên môi trường có Docker (CI đã cấu hình sẵn: `.github/workflows/ci.yml` job `test-db`) để xác nhận PASS trước khi coi là nghiệm thu cứng.

## 11. Remaining risks

- **Chưa thực thi pgTAP** (Docker/Deno vắng). Rủi ro: sai sót SQL nhỏ chỉ lộ khi chạy. Đã tự-review kỹ (tên constraint unique, dạng `throws_ok` errmsg theo pattern repo đã pass CI, check constraint thời gian). Cần chạy CI/local-Docker để chốt.
- **Concurrency thực** cần integration test 2 kết nối — hiện chỉ chứng minh backstop unique + lập luận `FOR UPDATE`.
- Error codes RPC đã đổi (giải C5): `submit-report` hiện chỉ đối chiếu `UNAUTHENTICATED` cho 401 (vẫn hoạt động); chuẩn hoá mapping đầy đủ ở **P2-04**.

## 12. Mapping sang task sau

| Việc còn lại | Task |
| --- | --- |
| Storage isolation policy `report-submissions-private` / templates + RLS đọc templates & status_history | **P2-03** |
| `submit-report`: verify object Storage thật + finalize atomic (S2/S7) + map error codes chuẩn | **P2-04** |
| `review-report`: scope check + transition guard + đồng bộ `review_status` (S3/S4/C4) | **P2-05** |
| Security test gate tổng (chạy pgTAP thực trên Docker/CI) | **P2-06** |

---

**Kết luận:** database/RPC là source of truth cho việc tạo submission; S1/C3 và C1 đã được remediation ở tầng code + test. Chờ thực thi pgTAP trên môi trường Docker/CI để nghiệm thu cứng.

**DỪNG. Chờ lệnh cho P2-03.**
