# Workflow policy

## Sequence

1. READ: AGENTS, core .ecc, docs/brain/00–06, handoff đúng branch.
2. AUDIT: git status/baseline/HEAD, affected code/Code Graph, scripts/locks/tests,
   environment/deploy paths; verify target/quyền trước external actions.
3. PLAN: scope, highest risk, required gates, runtime needs, recovery và blockers.
   Current explicit task có thể supersede historical task list; ghi lý do.
4. IMPLEMENT: diff tối thiểu; preserve tests/contracts/deploy config; không vendor ECC.
5. TEST: thu command/exit code, counts/skip/warnings và target.
6. REVIEW: requirement coverage, security, DB khi liên quan, diff; sửa findings.
7. VERIFY: final gates trên candidate + git diff --check; thay code sau evidence
   thì rerun affected gates.
8. RUNTIME ACCEPTANCE: relevant Preview + rehearsal journeys; missing prerequisite
   BLOCKED, không thay bằng mock/CI cũ.
9. PR: applicable gates/self-review pass và task authorize thì commit, push feature
   branch, PR vào master. Source và runtime limitations ghi riêng; không merge.
10. HANDOFF: working log + template, pending items, evidence/PR, next action.

## Risk / verification

Mức cao nhất của affected surface. Docs đổi policy/verification/CI là MEDIUM,
không mặc định mọi Markdown là LOW.

| Risk | Examples | Required evidence |
|---|---|---|
| LOW | Copy, docs không policy, CSS nhỏ | ECC links khi docs, diff-check, targeted check/review; UI cần viewport/screenshot phù hợp, không full E2E bắt buộc |
| MEDIUM | Business logic/UI flow/API non-critical, Agent policy/scripts/CI | npm run verify + relevant regression + fresh review; runtime journey khi behavior đổi |
| HIGH | Auth/RLS/DB/migration/permissions/import/export/security | MEDIUM + migration/RLS/grant review + relevant pgTAP/Deno/Member tests + negative actors/orgs + isolated rehearsal + recovery plan |
| CRITICAL | Production deploy, destructive SQL, credentials/security model, bulk mutation | HIGH + explicit action/target approval + backup/isolated restore + rehearsed rollout/recovery + Production verification nếu được giao |

[Verification runbook](memory/runbooks/verification.md) và
[DB runbook](memory/runbooks/database.md) chọn backend gates; root build không thay chúng.
LOW skip ghi N/A + diff reason. Missing capability là BLOCKED, không N/A.
Task yêu cầu full regression (ECC V1) thì chạy mọi suite khả thi và ghi blockers.
Exact-candidate CI có thể cung cấp machine evidence; local unavailable báo riêng.
Historical baseline CI không làm candidate PASS.

## Fresh-context final review

Nếu harness hỗ trợ: reviewer context mới, chỉ nhận repo, baseline/candidate,
requirements/evidence paths; không implementation narrative. Read AGENTS rồi tự trace
requirement → file/test. Read-only review, không tự deploy/send/merge.
Check coverage, architecture/contracts, regression, security/DB, tests, deployment,
complexity và acceptance honesty; findings có file/line và gate status.

Nếu không hỗ trợ: handoff + diff + commands/results/CI URLs cho Agent/session khác;
fresh review BLOCKED/PENDING. Self-review không thay fresh review cho MEDIUM+.
Review lại affected corrections. ECC layer đổi thì chạy
[fresh-agent simulation](memory/runbooks/fresh-agent-review.md).

## Delivery / memory

Commit type(scope): description. PR: concrete change/architecture, safety,
baseline/head, verification/DB/runtime evidence, upstream provenance khi có,
limitations và recovery. Check CI trên exact PR HEAD trước đề nghị merge.
Merge luôn cần approval, có thể trigger Production.

Working log bắt buộc ở docs/brain/06-ai-working-log.md. Đổi architecture/API/structure/
schema thì Code Graph 01 và decision index 03 cập nhật, link ADR thay copy nội dung.
Memory context không tự promote policy; xem [memory README](memory/README.md).
