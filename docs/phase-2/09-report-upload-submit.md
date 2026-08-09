# P2-09 — Upload & submit report

## Scope and baseline

P2-09 mở rộng `ReportAssignmentDetail` thành luồng read/write của cán bộ: chọn tệp → kiểm tra UX → upload Storage private staging → xác nhận → gọi `submit-report` → refresh assignment. Không có submission-history UI, admin hoặc export.

Baseline branch `feat/phase-2b-branch-submission`, P2-08 `e628b39`.

## UI and client validation

Form chỉ hiện cho `PENDING`, `OVERDUE`, `NEEDS_SUPPLEMENT`, hoặc `SUBMITTED`/`RESUBMITTED` khi campaign cho phép resubmit. Terminal `ACCEPTED`, `EXEMPTED`, `CLOSED` không có form. `NEEDS_SUPPLEMENT` hiển thị “Nộp bổ sung”.

Browser kiểm tra UX theo campaign thật: extension, số lượng, kích thước, file rỗng và duplicate `name + size + lastModified`. `accept` chỉ là hint; Edge Function vẫn là source of truth. Không có fake percentage progress.

## Upload, confirmation, and submit

Mọi upload gọi `reportService.uploadReportFile({ campaignId, organizationId, assignmentId, file })`, dùng path:

```text
{campaign}/{organization}/{assignment}/staging/{uuid}-{safe-name}
```

Files có local status `selected`, `uploading`, `uploaded`, `error`. Chỉ files `uploaded` mới được submit. Confirmation hiển thị số/tên file; submit button bị khóa khi upload/submit đang chạy và không tự retry.

Payload submit chỉ chứa `assignment_id`, text hợp lệ và `{ storage_path, original_name }` (checksum nếu có). Không gửi `size_bytes`, `mime_type`, `safe_name`; Edge Function đọc metadata Storage thật và RPC finalize version atomically.

Success hiển thị message/version nếu backend trả về, clear form rồi gọi `getAssignment` để lấy status server. Error backend được map thân thiện và cũng refresh assignment; không tự mutate status phía client.

## Cleanup security model

`removeStagedReportFile(path)` gọi Storage `remove([exactPath])` qua RLS. Migration `202608090007_phase_2_report_staging_cleanup.sql` chỉ cho phép DELETE khi đồng thời đúng bucket, uploader (`storage.objects.owner = auth.uid()`), account ACTIVE + BRANCH_OFFICER, org/assignment/path hợp lệ, path có `/staging/`, và chưa được tham chiếu bởi `report_submission_files`.

Điều này bảo vệ file finalized dù path vẫn chứa `/staging/`. Remove/reset chỉ xóa khỏi UI sau cleanup thành công; nếu cleanup lỗi, file được giữ lại và hiển thị cảnh báo. Không dùng `beforeunload`, `sendBeacon`, wildcard/folder delete hoặc auto-cleanup sau submit success. Chưa có scheduled GC cho abandoned sessions.

## Notification route

`submit-report` dùng helper `buildReportActionUrl(assignment.id)` để notification trỏ tới `/cong-viec/bao-cao/:assignmentId`, khớp route P2-08; có regression test Deno contract.

## Tests and remaining risks

- Frontend: validation, service upload/remove/submit payload and UI contract tests.
- Database: C1 own unfinalized delete; C2 cross-org; C3 anon; C4 suspended; C5 finalized reference; C6 non-staging; C7 malformed fail-closed.
- Deno: notification assignment route contract.

Local environment không có Supabase CLI/Docker hoặc Deno nên DB/Deno gate cần CI rehearsal xác nhận. P2-10 còn phụ trách version history; P2-13 còn phụ trách download/export hardening.
