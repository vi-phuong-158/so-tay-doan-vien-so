# ECC Lite Cloud V1

Lớp vận hành Agent version-control cùng code. Clone GitHub repository và đọc
[AGENTS](../AGENTS.md); không cần global config, ECC installer hoặc lịch sử chat.

| File | Mục đích / authority |
|---|---|
| [PROJECT](PROJECT.md) | Kiến trúc hiện tại, đối chiếu source khi có drift |
| [WORKFLOW](WORKFLOW.md) | Policy phát triển, risk gates, review và delivery |
| [SAFETY](SAFETY.md) | Policy approval và giới hạn thao tác |
| [ACCEPTANCE](ACCEPTANCE.md) | Policy evidence và verdict |
| [ECC_UPSTREAM](ECC_UPSTREAM.md) | Provenance và phần không áp dụng |
| [AUDIT](AUDIT.md) | Snapshot trước implementation, không phải runtime certification |
| [memory](memory/README.md) | Durable context: decisions/handoffs/lessons/runbooks |

Policy Agent nằm ở AGENTS, WORKFLOW, SAFETY, ACCEPTANCE và
[coding rules](../docs/brain/02-coding-rules.md). CLAUDE chỉ trỏ entry point chung.
`docs/brain/` giữ Code Graph, nghiệp vụ, task/log và lịch sử quyết định; không copy
thành bộ tài liệu song song. Chỉ dẫn cũ trái safety phải reconcile trước thao tác.
User instructions rõ ràng và platform constraints vẫn có authority cao hơn, trong scope.

`npm run verify:ecc` kiểm tra files không rỗng, local Markdown links và
manifest/lock consistency. `npm run verify` thêm lint/tests/build. Verifier không
hiểu nghĩa policy, không quét đầy đủ secrets, không chứng nhận DB/runtime.
[Fresh-agent simulation](memory/runbooks/fresh-agent-review.md) bổ sung semantic review.

Evidence cần commit/deployment/target, UTC time, command/exit code hoặc CI URL và
expected/observed. Handoff chỉ tóm tắt đã sanitize; raw logs ở artifact hoặc file
untracked. Memory là context, không tự thành policy hoặc cấp quyền.

V2 chưa bật: ECC Full/catalog, upstream executable hooks, learning daemon, skill
evolution, auto memory promotion, memory MCP/index, background service,
autonomous merge và Production deploy. Mỗi option cần task/review riêng.
