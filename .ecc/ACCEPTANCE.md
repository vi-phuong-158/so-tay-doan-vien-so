# Acceptance policy — evidence before verdict

## Verdict

| Verdict | Điều kiện |
|---|---|
| PASS | Mọi requirement/gate applicable trong task scope có evidence đúng candidate/target; không blocker/failure; required review hoàn tất |
| PARTIAL | Có usable deliverable/gates pass; còn requirement/gate thiếu hoặc blocked, liệt kê phần đạt/chưa đạt |
| BLOCKED | Prerequisite/quyền/tooling thiếu khiến bước bắt buộc không thể hoàn tất; action/lỗi/evidence và thứ cần cung cấp |
| FAIL | Assertion/check hoặc violation đã xác nhận; không đổi thành environment issue nếu chưa chứng minh |

Từng gate PASS/FAIL/BLOCKED hoặc N/A có diff reason. Verdict tổng không che FAIL
của required gate. Prerequisite đã xác minh có thể ghi execution error + gate BLOCKED,
nhưng giữ nguyên exit code. Không dùng “Agent thấy ổn”, số files hay historical CI.

## Completion stages

- CODE_COMPLETE: implementation + required source checks/review pass trên candidate.
  Lint/build/typecheck relevant blocked thì chỉ implementation done, chưa CODE_COMPLETE.
- RUNTIME_ACCEPTED: relevant journeys chạy thật trên exact Preview/service deployment
  + verified rehearsal DB, expected/observed, role/org denial, cleanup khi có fixtures.
  Source tests không suy ra runtime. Missing Preview/rehearsal access thì BLOCKED khi
  task yêu cầu; docs/tooling-only có thể N/A với evidence runtime surface không đổi.
- PRODUCTION_VERIFIED: explicit approval, deployed source/migration parity, real
  Production smoke/observability/recovery đúng target. Preview READY không đủ.
  Production ngoài task ghi NOT_REQUESTED, không PASS và không cản scoped verdict.

## Evidence contract

Mỗi row: gate, UTC time, baseline/candidate SHA hoặc working-tree fingerprint,
command + actual exit code hoặc CI job URL/head SHA, target identity không credential,
expected/observed, counts/skip/warnings và sanitized log/artifact path.
Không dùng exit code tail thay command gốc; lưu exit code trước khi tóm tắt.
Không fake log, không dùng report cũ thay current run.

- npm ci + lockfile: installation integrity. Manifest/lock static check không thay
  install hoặc vulnerability audit.
- npm run verify: ECC structure/locks, lint, root tests, build. Root tests có pure/
  mocked-service/source-contract checks; không tự là DB integration/browser E2E.
- Frontend JS typecheck N/A; TS/Deno changes cần deno check/tests + backend gates.
  Không thêm giả typecheck chỉ để đủ checklist.
- HIGH DB cần migration + RLS/security review + test/rehearsal; file tồn tại không
  nghĩa applied/runtime PASS. Static grep không chứng minh effective grants.
- Security review toàn new diff: secret/data exposure, remote execution, dependencies,
  auth và policy bypass. Pattern scan là backstop, không full certification.
- Preview READY/build success không đủ browser acceptance. Read-only Production
  observation không chứng minh write flows; không mutate Production chỉ để test.

Chốt bằng requirement coverage, diff, source gates, regression, fresh review/runtime.
CI missing/failed/pending ghi đúng. ECC V1 yêu cầu branch pushed + PR created;
thiếu chúng không được tổng PASS. Fresh simulation và structural PASS là hai gates.
Handoff giữ missing gates kể cả technical subset PASS.

## Report

Verdict/scope; baseline/branch/head; files; decisions/provenance; commands/exit codes;
tests/regression/security; fresh review; runtime/Production; blockers/limitations;
deferred items; PR; next action. [Handoff template](memory/handoffs/TEMPLATE.md).
Self-referential final SHA: “commit containing this report”, exact hash ở PR/final,
không bịa hash hay endless amend.
