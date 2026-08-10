# P2-11 — Submission History & Resubmission

## Scope

P2-11 chỉ bổ sung lịch sử submission trong assignment detail và nộp lại theo version. Không có
dashboard tổng hợp, export, ZIP, email/reminder hoặc P2-12.

## Trusted submit path

P2-09 vẫn upload vào staging path do client sở hữu. submit-report đọc assignment và latest
version từ database, kiểm tra file staging thật bằng service-role Storage client, rồi move từng
object sang:

{campaign_id}/{organization_id}/{assignment_id}/v{expected_version}/{uuid}-{safe_name}

Function gọi create_report_submission_with_files(..., p_expected_version). RPC khóa assignment
qua create_report_submission, từ chối expected version cũ bằng STALE_SUBMISSION_VERSION, kiểm
tra namespace vN, tạo submission/file metadata/history/audit/notification cùng transaction.
Nếu RPC fail, Edge Function move object về staging để retry không để lại finalized orphan.

## Business rules

- Submission đầu tiên tạo v1.
- Resubmit tự nguyện yêu cầu allow_resubmission=true.
- NEEDS_SUPPLEMENT là ngoại lệ explicit: được resubmit dù campaign tắt voluntary resubmit.
- ACCEPTED, EXEMPTED, CLOSED, campaign đóng, account inactive, sai organization hoặc sai role bị từ chối.
- Late decision dùng server clock và is_late riêng từng version; version cũ không bị sửa.

## Read model/UI

getSubmissionHistory đọc RLS-scoped submissions theo version_number DESC, map profile
display-safe và file metadata. Assignment detail hiển thị latest marker, lịch sử accordion,
summary/note/review note, late flag và file metadata. Signed URL chỉ tạo khi người dùng mở file.

## Acceptance

- H1–H26: version monotonicity, immutable old versions, scope/lifecycle/reason guards, stale
  expected version, atomic rollback và notification route.
- Regression: toàn bộ P2-09 C1–C8 và P2-10 R1–R14.
- Frontend test/lint/build, clean Supabase reset + pgTAP, Deno check/test và PR CI phải PASS.
