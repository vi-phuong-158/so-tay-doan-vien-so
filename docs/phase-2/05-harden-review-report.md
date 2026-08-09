# P2-05 — HARDEN `review-report`

**Phase:** 2 — Công việc & Báo cáo
**Task:** P2-05 (review đúng quyền + đúng state machine — remediation S3, S4, C4)
**Ngày:** 2026-08-09
**Branch:** `feat/phase-2a-report-foundation` (tiếp nối P2-04 @ `d01db15`)

> Chạm `review-report`, thêm RPC `review_report_assignment`, revoke UPDATE trực tiếp `report_assignments`, và chỉnh test T5b của P2-02. KHÔNG sửa submit path (P2-02/P2-04), storage (P2-03), frontend.

---

## 1. Before state

`review-report` cũ (P1):
- **S3 — thiếu scope:** dùng `requireAnyRole` = kiểm role **global** ⇒ YOUTH_ADMIN Org A review được assignment Org B.
- **S4 — không transition guard:** update thẳng `report_assignments.status = action` (adminClient) ⇒ có thể ACCEPT khi chưa có submission, hoặc chuyển trạng thái trái quy trình.
- **C4 — lệch nguồn:** cập nhật `report_assignments.status` nhưng **không** đồng bộ `report_submissions.review_status` (giữ nguyên PENDING).
- Ngoài ra: RLS "admins manage assignments" cho admin **UPDATE trực tiếp** `report_assignments` qua PostgREST ⇒ bỏ qua toàn bộ state machine.

## 2. Threat → remediation

| Threat | Remediation |
| --- | --- |
| S3 — global role | RPC kiểm `has_role_in_scope('YOUTH_ADMIN', assignment.org)` hoặc `SYSTEM_ADMIN` (RPT-A03). |
| S4 — no transition guard | RPC enforce ma trận transition §4–§5; hành động sai → `INVALID_REPORT_TRANSITION`. |
| S4 — admin bypass bằng direct UPDATE | `revoke update on report_assignments from authenticated`; mọi đổi trạng thái đi qua RPC (definer). |
| C4 — review_status lệch | RPC đồng bộ `review_status` của submission mới nhất + `reviewed_by/at/note`. |

## 3. Files changed

| File | Thay đổi |
| --- | --- |
| `supabase/migrations/202608090004_phase_2_review_report_rpc.sql` | RPC `review_report_assignment` + revoke UPDATE `report_assignments`. |
| `supabase/functions/review-report/index.ts` | Rewrite: bỏ `requireAnyRole` global; gọi RPC qua userClient; notification best-effort. |
| `supabase/tests/report_review.sql` | pgTAP mới (scope/role/transition/C4). |
| `supabase/tests/report_submission_atomicity.sql` | T5b: direct UPDATE `report_assignments` giờ bị `permission denied` (đổi từ no-op → throws_ok). |

## 4. RPC contract — `review_report_assignment(p_assignment_id uuid, p_action text, p_reason text)`

Trả về `table(resulting_status text, notified_user_id uuid, campaign_id uuid)`.

```text
1  auth.uid() null                              → UNAUTHENTICATED
2  không ACTIVE                                  → ACCOUNT_NOT_ACTIVE
3  action ∉ {ACCEPTED,NEEDS_SUPPLEMENT,EXEMPTED} → INVALID_ACTION
4  lock assignment FOR UPDATE                    ; không thấy → ASSIGNMENT_NOT_FOUND
5  không (YOUTH_ADMIN scope org  hoặc SYSTEM_ADMIN) → ASSIGNMENT_SCOPE_DENIED
6  status ACCEPTED/EXEMPTED/CLOSED               → REPORT_ALREADY_ACCEPTED / REPORT_EXEMPTED / REPORT_CLOSED
7  EXEMPTED:
     status ∉ {PENDING,OVERDUE}                  → INVALID_REPORT_TRANSITION
     reason null                                 → REASON_REQUIRED
     set status=EXEMPTED, exempted_at, exempt_reason
   ACCEPTED/NEEDS_SUPPLEMENT:
     status ∉ {SUBMITTED,RESUBMITTED,LATE_SUBMITTED} → INVALID_REPORT_TRANSITION
     NEEDS_SUPPLEMENT & reason null              → REASON_REQUIRED
     latest submission.review_status := ACCEPTED|NEEDS_SUPPLEMENT (+reviewed_by/at/note)  (C4)
     set assignment.status = action (+accepted_at nếu ACCEPTED)
     notified_user_id := latest.submitted_by
8  insert report_status_history + audit_logs (cùng transaction)
```

## 5. State machine coverage (P2-01 §4/§5)

| Transition | Hỗ trợ |
| --- | --- |
| SUBMITTED/RESUBMITTED/LATE_SUBMITTED → ACCEPTED | ✔ (YA scope/SA) |
| SUBMITTED/RESUBMITTED/LATE_SUBMITTED → NEEDS_SUPPLEMENT | ✔ (reason) |
| PENDING/OVERDUE → EXEMPTED | ✔ (reason) |
| PENDING/OVERDUE → ACCEPTED/NEEDS_SUPPLEMENT | ✘ INVALID_REPORT_TRANSITION |
| SUBMITTED → EXEMPTED | ✘ INVALID_REPORT_TRANSITION |
| * → * bởi actor ngoài scope | ✘ ASSIGNMENT_SCOPE_DENIED |
| ACCEPTED/EXEMPTED/CLOSED → * | ✘ terminal |

## 6. Tests

`supabase/tests/report_review.sql` (pgTAP):

| Test | Kỳ vọng |
| --- | --- |
| H-ACCEPT (YA scope) | status ACCEPTED; submission review_status ACCEPTED (C4); reviewed_by; history |
| H-NEEDS (SYSTEM_ADMIN, reason) | status NEEDS_SUPPLEMENT; submission review_status synced |
| H-EXEMPT (YA parent scope, reason) | status EXEMPTED; exempt_reason |
| SCOPE | YA CĐA review CĐB → ASSIGNMENT_SCOPE_DENIED |
| ROLE | MEMBER / BRANCH_OFFICER review → ASSIGNMENT_SCOPE_DENIED |
| TR accept-no-submission | INVALID_REPORT_TRANSITION |
| TR exempt-submitted | INVALID_REPORT_TRANSITION |
| TR needs-no-reason / exempt-no-reason | REASON_REQUIRED |
| TR review-terminal | REPORT_ALREADY_ACCEPTED |
| priv | authenticated=EXECUTE, anon=∅ |

`report_submission_atomicity.sql` T5b: direct UPDATE `report_assignments` → `permission denied` (đóng đường bypass).

**Lệnh đã chạy (môi trường này):**
```text
npm test        → 9/9 pass
npm run lint    → 0 errors (3 warnings có sẵn)
npm run build   → success
npx supabase db reset / supabase test db / deno check → BLOCKED (không có Docker/Deno)
```

**BLOCKED_BY_ENVIRONMENT:** không có Docker/Deno ⇒ pgTAP và `deno check` chưa thực thi; chạy qua CI (`test-db` + `deno check **/*.ts`).

## 7. Remaining risks

- pgTAP + `deno check` chưa chạy (Docker/Deno vắng). Đã tự-review: plpgsql, OUT params không xung đột column, message `permission denied for table report_assignments`.
- Notification chỉ gửi cho `submitted_by` của bản mới nhất; EXEMPTED không có submitter ⇒ chưa notify đơn vị (fan-out thông báo đầy đủ là Phase 3).
- Đã đóng direct UPDATE `report_assignments`; các thao tác admin hợp lệ khác trên assignment (nếu phát sinh) phải qua RPC — `create_report_assignments` (P2-11) sẽ tạo assignment qua RPC, không cần INSERT trực tiếp.

## 8. Mapping sang task sau

| Việc còn lại | Task |
| --- | --- |
| Security test gate: chạy toàn bộ pgTAP/deno thực trên Docker/CI; cân nhắc thu hồi 3-arg RPC | **P2-06** |
| Report service layer + UI nộp/lịch sử | **P2-07..P2-10** |
| Admin tạo campaign + assignments (`create_report_assignments`), dashboard, review UI | **P2-11/P2-12** |
| Export/bundle lọc scope + signed URL | **P2-13** |

---

**Kết luận:** review báo cáo giờ enforce scope tổ chức + state machine, đồng bộ `review_status`, ghi history/audit atomic, và đóng đường admin đổi trạng thái trực tiếp. S3/S4/C4 remediation ở tầng code + test. Chờ Docker/CI nghiệm thu cứng.

**DỪNG. Chờ lệnh cho P2-06.**
