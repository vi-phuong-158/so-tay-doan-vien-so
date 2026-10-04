# ECC upstream research / provenance

Checked: **2026-10-04 UTC**, before implementation.
Repository: [affaan-m/ECC](https://github.com/affaan-m/ECC).
Latest release observed: **v2.2.3**, published 2026-10-01.
Current main inspected and pinned: **ef648e01899ba3e8dc6371642deaaf64b4477775**
([immutable tree](https://github.com/affaan-m/ECC/tree/ef648e01899ba3e8dc6371642deaaf64b4477775)).
Release label and inspected main commit are recorded separately; not assumed identical.

All paths below were read at that pinned commit. This is a design comparison,
not invocation of upstream policies/installers. No upstream executable was copied/run.

| Read surface | Applied in Lite | Not applied / reason |
|---|---|---|
| AGENTS.md, CLAUDE.md | Short onboarding, project conventions, review/security | Agent catalog, universal TDD/80% threshold, generic patterns unrelated to existing app |
| skills/codebase-onboarding/SKILL.md | Inspect actual manifests/entry points/config, preserve existing instructions | Generic starter replacing repo docs; current Code Graph retained |
| skills/verification-loop/SKILL.md | Build/lint/tests/types when applicable, security/diff evidence | Piped truncated checks, invented frontend typecheck, fixed coverage requirement without repo tooling |
| skills/production-audit/SKILL.md | Local evidence, release boundaries, missing evidence/recovery | Readiness score claiming deployment acceptance; no external scanner |
| skills/security-review/SKILL.md | Input/auth/RLS/secret/CSP/lockfile review | Cookie/CSRF/Next.js prescriptions transplanted into this bearer-token SPA; auto audit fix/update |
| agents/database-reviewer.md | Least privilege, RLS, constraints, transactions/performance evidence | Blanket index/UUID/pagination rules replacing established DB decisions |
| skills/safety-guard/SKILL.md | Destructive operation/target approval boundaries | Executable hooks, home-directory logs and guard mode config |
| skills/delivery-gate/SKILL.md | Completion gate requires machine evidence | Stop hook, mtime/learning-library/disk heuristics: do not prove code/runtime correctness; global install |
| skills/unified-memory/SKILL.md | Portable Markdown, source/branch/evidence, context never policy | ecc-universal CLI/MCP, user scope, local-only project ignore rules; cloud source of truth must be Git |
| docs/design/ecc-memory-vault.md | Inspectable durable knowledge, no transcripts/automatic promotion | Vault schema/runtime/graph/vector adapters; unnecessary for four small repo directories |
| .codex/AGENTS.md | Thin provider entrypoint, scoped external actions, fresh review | Global TOML sync/MCP servers/model settings/native hooks; no provider config dependency |
| hooks/README.md | Understand PreToolUse/PostToolUse/lifecycle and differing harness support | No hooks enabled/copied; policy + explicit verification + existing CI works across providers |

Claude compatibility: CLAUDE links AGENTS; Codex/other harnesses read AGENTS directly.
No requirement to support upstream slash commands, plugin skill discovery or native hook schemas.

Research downloaded text outside tracked repo only, through authorized GitHub connector.
Lite docs/scripts are original project-specific implementation. Upstream executable source
audit unnecessary in V1 because zero executable code is imported. Future import requires
pinned source/license/provenance review plus safety/regression tests before activation.
