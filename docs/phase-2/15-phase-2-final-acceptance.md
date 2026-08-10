# P2-15 — Phase 2 final acceptance & end-to-end vertical slice

## TASK

Technical acceptance cho Phase 2 — Công việc & Báo cáo. Đây là gate tích hợp, không mở rộng
nghiệp vụ Phase 3.

## STATUS

`ACCEPTANCE CANDIDATE — CI PENDING`

## BASELINE

- Baseline branch: `feat/phase-2g-scoped-export-bundle`.
- Baseline SHA: `bdf0156b13de0d3d65c4c080fc17f5bce6e76d60`.
- Baseline PR: draft PR #9.
- Acceptance branch: `test/phase-2-final-acceptance`, tạo trực tiếp từ đúng baseline SHA.
- Baseline CI run `31409496394`: PASS; frontend 40/40, pgTAP 10 files/220 tests,
  Deno 16 tests, lint và build PASS.

## CAPABILITY INVENTORY

| Capability | Production path | Bằng chứng | Kết quả |
| --- | --- | --- | --- |
| Assignment list/detail | `Work` / `ReportDetail` → `reportService` → RLS | frontend tests + pgTAP | PASS |
| Upload/submit | staging private → `submit-report` → vN → atomic RPC | Deno + pgTAP P2-09/P2-11/P2-15 | PASS sau P1 fix |
| Review | `review-report` → locked RPC/history/audit/notification | pgTAP review + vertical slice | PASS |
| Resubmission/history | expected-version, immutable v1/v2, lazy signed URL | pgTAP history + vertical slice | PASS |
| Campaign/template/publish | admin UI/service → private template → atomic publish RPC | frontend + pgTAP admin | PASS |
| Dashboard | server-scoped aggregate/list RPC | frontend + 7-org pgTAP matrix | PASS |
| CSV export | dashboard scope/filter → Edge CSV + audit | frontend + Deno + pgTAP scope | PASS |
| Latest bundle | scoped rows → latest submission → private ZIP + audit | frontend + Deno + pgTAP scope | PASS |

## VERTICAL SLICE

`supabase/tests/phase_2_final_acceptance.sql` chạy toàn bộ chuỗi trong một transaction:

1. `YOUTH_ADMIN` scoped tạo draft campaign, đăng ký template private và publish assignment.
2. `BRANCH_OFFICER` cùng đơn vị nộp file Storage thật thành submission v1.
3. Admin chuyển `SUBMITTED → NEEDS_SUPPLEMENT` với lý do.
4. Officer nộp lại file khác thành v2; v1 và file v1 không bị ghi đè.
5. Admin chuyển `RESUBMITTED → ACCEPTED`.
6. History giữ đủ 5 transition; v1 giữ review `NEEDS_SUPPLEMENT`, v2 giữ `ACCEPTED`.
7. Dashboard trả `1/1 completed`, completion `100.00`; nguồn dùng chung của export/bundle trả
   assignment `ACCEPTED`, latest version `2`, latest review `ACCEPTED`.

Edge serialization cho CSV/ZIP tiếp tục được chứng minh bằng Deno contract tests. Không có
Supabase rehearsal/project secrets trong workspace nên chưa tuyên bố live cloud E2E hoặc production-ready.

## SECURITY

### Blocker tìm thấy và đã sửa

P1: cả overload 4 tham số và 5 tham số của `create_report_submission_with_files` từng được
`authenticated` gọi trực tiếp. Caller có thể bỏ qua Edge Function, tạo version không có stale guard
qua overload 4 tham số, hoặc ghi metadata trỏ đến object Storage không tồn tại qua cả hai overload.

Forward migration `202608100003_phase_2_submit_rpc_storage_guard.sql` đóng bypass:

- thu hồi `EXECUTE` overload 4 tham số khỏi `authenticated`;
- overload 5 tham số bắt buộc `p_expected_version`;
- kiểm path đúng `{campaign}/{org}/{assignment}/vN/object`, duplicate và traversal;
- kiểm extension, max files, actual Storage size/mimetype và campaign max size;
- chỉ ghi metadata lấy từ `storage.objects`; lỗi rollback submission/status/history atomically.

Regression `report_submit_atomic_finalize.sql` chứng minh object thiếu bị từ chối và không để lại
submission; privilege assertions chứng minh authenticated chỉ còn overload expected-version.

### Scope và account gates

- Org A không đọc/nộp/review assignment hoặc object Org B; admin scope hẹp không nhận aggregate,
  export hoặc bundle row ngoài scope.
- `MEMBER`, `INNOVATION_MEMBER`, `BRANCH_OFFICER` không có admin/review/dashboard privilege.
- `SUSPENDED` fail-closed; `anon` không có RPC execute/private Storage read.
- Service role chỉ nằm trong Edge Functions; frontend không có secret và không quyết định scope.
- Signed URL là ngắn hạn và chỉ tạo lazy cho bucket private.

## DATA INTEGRITY

- Assignment lock + unique `(assignment_id, version_number)` + expected-version chống double-click,
  retry cũ và duplicate version.
- Submission, file metadata, status history và notification cùng DB transaction.
- Review lock đồng bộ assignment/latest submission; terminal `ACCEPTED`/`EXEMPTED` fail-closed.
- Namespace vN và quyền table không cho client update/delete history/file metadata cũ.
- Publish campaign tạo assignment/history/audit atomically và idempotent với organization trùng.
- Dashboard/export/bundle dùng latest submission theo version, không trộn file cũ vào bundle mới.

## TEST RESULTS

| Gate | Kết quả |
| --- | --- |
| Local `npm test -- --run` | PASS — 40/40 |
| Local `npm run lint` | PASS — 0 errors, 3 warning Fast Refresh tồn tại từ baseline |
| Local `npm run build` | PASS — 108 modules |
| Baseline Supabase reset + pgTAP | PASS — 10 files/220 tests, CI `31409496394` |
| Baseline Deno check/test | PASS — 16 tests, CI `31409496394` |
| Acceptance Supabase reset + pgTAP | `PENDING_ACCEPTANCE_CI` |
| Acceptance Deno check/test | `PENDING_ACCEPTANCE_CI` |
| Acceptance frontend/lint/build | `PENDING_ACCEPTANCE_CI` |
| Browser shell 390×844 | PASS — login content/controls, 390=390 width, no overlay |
| Browser shell 768×1024 | PASS — 768=768 width, no overlay |
| Browser shell 1440×900 | PASS — 1440=1440 width, no overlay |

Browser dùng local endpoint/dummy anon key chỉ trong process để render login shell; lần chạy không env
fail-fast đúng thiết kế. Không dùng dummy credential để xác thực và không ghi `.env`.

## BLOCKERS

- P1 direct RPC/Storage metadata bypass: **FIXED**, có migration và regression.
- Acceptance CI: `PENDING_ACCEPTANCE_CI`.
- Không còn P0/P1/P2 code blocker đã biết ngoài kết quả CI đang chờ.

## ACCEPTANCE MATRIX

Ma trận deterministic trong `report_dashboard.sql` có 7 đơn vị và chạy cùng full pgTAP suite:

| Đơn vị | Trạng thái/fixture | Kỳ vọng dashboard/export |
| --- | --- | --- |
| A | `PENDING`, chưa submission | pending 1 |
| B | `SUBMITTED`, v1 | submitted 1 |
| C | `NEEDS_SUPPLEMENT`, v1 reviewed | needs supplement 1 |
| D | `RESUBMITTED`, v1 + latest v2 late | resubmitted 1; late filter 1; latest v2 |
| E | `ACCEPTED` | accepted/completed 1 |
| F | `OVERDUE` | overdue 1 |
| G | `EXEMPTED` | exempted/completed 1 |

Tổng 7; completed = E + G = 2; completion rate = 28.57%. SYSTEM_ADMIN thấy 7; admin scope
hẹp chỉ thấy 1; member/officer/suspended/anon đều bị từ chối.

## PR MERGE PLAN

Không merge trong P2-15. Tất cả PR #4–#9 đang draft/open và mergeable tại thời điểm audit.

1. Retarget PR #5 từ `master` sang branch PR #4 để biến stack ngầm thành stack tường minh.
2. Merge PR #4, rồi PR #5, giữ merge commit hoặc chiến lược không làm mất ancestry; kiểm CI sau mỗi bước.
3. Merge lần lượt PR #6 → #7 → #8 → #9 theo base hiện tại.
4. Giữ acceptance PR draft/base `master` để CI nhìn thấy toàn bộ slice; chỉ merge cuối cùng sau khi
   #4–#9 đã vào `master`, lúc đó diff tự thu về migration/test/docs P2-15.
5. Trước mỗi merge: update base, xác nhận mergeable/checks xanh, không squash riêng lẻ làm đứt stacked ancestry.

| PR | Nội dung | Base hiện tại | Thứ tự |
| --- | --- | --- | --- |
| #4 | P2-09 upload/submit (+ cumulative trước đó) | `master` | 1 |
| #5 | P2-10 review | `master` (cần retarget #4) | 2 |
| #6 | P2-11 resubmission/history | PR #5 branch | 3 |
| #7 | P2-12 campaign/assignment | PR #6 branch | 4 |
| #8 | P2-13 dashboard | PR #7 branch | 5 |
| #9 | P2-14 export/bundle | PR #8 branch | 6 |
| acceptance | P2-15 blocker fix/tests/docs | draft against `master` | 7 |

## KNOWN LIMITATIONS

- Chưa có Supabase rehearsal/project secrets: chưa chạy browser-authenticated live vertical slice,
  signed URL/object download thực hoặc backup/restore/monitoring rehearsal.
- Storage move và DB commit không phải distributed transaction; Edge có compensating move về staging,
  nhưng cần operational reconciliation/monitoring trước production.
- Bundle giới hạn 100 file/50 MiB và fail toàn bộ nếu object/metadata không khớp; đây là guard đã chốt,
  không phải background export lớn.
- Checksum hiện được lưu nếu caller cung cấp, chưa tự tính/đối chiếu cryptographic hash server-side.
- Ba cảnh báo ESLint Fast Refresh ở component/context nền tồn tại từ baseline, không phải acceptance blocker.

## PHASE 2 VERDICT

`PENDING_ACCEPTANCE_CI`

Khi acceptance CI xanh, cập nhật thành:
`Phase 2 — Công việc & Báo cáo: TECHNICAL ACCEPTANCE COMPLETE`.

Kết luận này chỉ là technical acceptance; **không đồng nghĩa production-ready**.

## NEXT

Sau khi merge đúng stack và provision rehearsal: lập kế hoạch Phase 3. Không mở rộng Phase 3 trong PR này.

## Rollback / forward-fix

- Ưu tiên forward-fix bằng migration mới; không sửa/xóa migration đã áp dụng.
- Nếu cần rollback code P2-15 trước deploy, revert acceptance commit. Nếu migration đã áp dụng, tạo
  migration mới khôi phục contract có chủ đích; không re-grant overload 4 tham số cho authenticated.
