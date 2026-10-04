# Claude Code / Claude Agents

Đọc và áp dụng [AGENTS.md](AGENTS.md) trước mọi task. Đây là entry point chung
cho mọi provider; chi tiết ở [.ecc/README.md](.ecc/README.md).

Quy tắc dự án trước đây ở file này được hợp nhất vào AGENTS, WORKFLOW, SAFETY và
`docs/brain/02-coding-rules.md`; không có policy riêng cho Claude. Giữ nghĩa vụ đọc
`docs/brain/00`–`06`, ghi working log, cập nhật Code Graph/decisions.

Không cần `~/.claude`, plugin, hooks hay service nền. Nếu harness không tự đọc links,
mở AGENTS và từng file liên kết bằng công cụ đọc file. Fresh reviewer dùng context
mới khi có hỗ trợ; nếu không, ghi packet và pending review theo
[WORKFLOW](.ecc/WORKFLOW.md).
