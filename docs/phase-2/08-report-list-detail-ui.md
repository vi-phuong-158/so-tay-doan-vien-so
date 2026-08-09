# P2-08 — Danh sách & chi tiết nhiệm vụ báo cáo

## Scope and routes

P2-08 thay mock ở trang Công việc bằng dữ liệu từ `reportService`, thêm loading/empty/error/retry state và trang đọc chi tiết nhiệm vụ. Routes:

- `/cong-viec`: danh sách assignment của user hiện tại.
- `/cong-viec/bao-cao/:assignmentId`: chi tiết theo assignment UUID, vì đây là resource được RLS authorize trực tiếp.

Không có upload, submit, resubmit, submission history hoặc admin UI.

## Components and data flow

- `Work.jsx` khởi tạo service bằng Supabase client hiện tại, gọi `getMyAssignments()` khi mount, nhóm và sort dữ liệu trong bộ nhớ, rồi render `Link` accessible tới detail.
- `ReportAssignmentDetail.jsx` gọi `getAssignment(assignmentId)` và `getCampaignTemplates(campaign.id)`. Template chỉ gọi `getSignedFileUrl` sau click tải, với URL ngắn hạn cho bucket private.
- UI chỉ gọi service; không query bảng trực tiếp, không tự lọc organization để làm authorization.

```text
AuthGuard
  → Work / ReportAssignmentDetail
     → createReportService(supabase)
        → Supabase RLS / private Storage
```

## Status, deadline, and states

Nhóm “Đang thực hiện” gồm `PENDING`, `SUBMITTED`, `NEEDS_SUPPLEMENT`, `RESUBMITTED`, `OVERDUE`, `LATE_SUBMITTED`; nhóm “Đã kết thúc” gồm `ACCEPTED`, `EXEMPTED`, `CLOSED`. Counts được tính từ array đã load. Active tasks ưu tiên `NEEDS_SUPPLEMENT`, `OVERDUE`, `LATE_SUBMITTED`, sau đó deadline gần nhất.

Deadline hiển thị `assignment.dueAtOverride` nếu có, ngược lại `campaign.dueAt`. Browser chỉ format ngày giờ để hiển thị; không chuyển trạng thái nghiệp vụ.

Work có skeleton, empty state và error state với retry. Detail dùng cùng skeleton/retry và thông báo không phân biệt assignment không tồn tại với assignment ngoài scope.

## Template flow and accessibility

```text
getCampaignTemplates(campaign.id)
  → user click nút template (button keyboard-accessible)
  → getSignedFileUrl(path, private bucket, 60s)
  → window.open short-lived URL
```

Cards là `Link` có `aria-label`; không dùng click-only `div`. Không tạo signed URL trước khi user yêu cầu.

## Tests and remaining work

`tests/report_ui.test.mjs` kiểm tra nhóm trạng thái, deadline override, sorting, helpers, loại bỏ mock/banner/counters, service calls, route link, và template download contract. P2-07 tests vẫn giữ nguyên.

Không có migration. P2-09 còn phụ trách upload/submit và staging cleanup; P2-10 phụ trách version history; P2-13 phụ trách hardening download/export.
