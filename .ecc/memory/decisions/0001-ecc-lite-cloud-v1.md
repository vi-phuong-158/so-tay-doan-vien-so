# 0001 — ECC Lite Cloud V1

Date: 2026-10-04 UTC
Status: ACCEPTED (design within the requested task; release gates separate)

## Context

New cloud Agent sessions need reproducible architecture/workflow/acceptance context.
Existing AGENTS/CLAUDE duplicate rules; brain contains useful Code Graph and historical
reports plus dated claims. Source/backend tests already exist; no need for another framework.

## Decision

Single provider-neutral AGENTS; CLAUDE thin entrypoint. .ecc owns workflow/safety/
acceptance policies, project summary and original Markdown memory. Keep brain Code Graph/
decisions/tasks/working log authoritative for project specifics; link, don't duplicate.
Add dependency-free verify:ecc structural/lock checker, compose existing root checks as
verify and run it in existing build CI job. DB/Deno/Member gates remain explicit/separate.
Fresh review + fresh-agent simulation cover semantics the structural checker cannot.

## Reason / alternatives

Git travels with every cloud clone. Rejected ECC Full/global installs, hooks/runtime/
daemon/MCP memory, hidden home/session state: extra dependency, different provider
semantics and no need for this repo. Rejected replacing docs/brain: loses project history.
Rejected universal frontend typecheck/full E2E: JS frontend and risk-based checks.
No executable imported; [upstream provenance](../../ECC_UPSTREAM.md).

## Consequences / evidence

Instructions require Agent adherence; no sandbox enforcement claimed. Existing CI gives
machine checks; fresh review tests discoverability/meaning. Missing tools/runtime remain
BLOCKED. No new dependencies/secrets/workflows or app/DB/deployment behavior changes.
[Audit](../../AUDIT.md), [acceptance policy](../../ACCEPTANCE.md), package.json,
scripts/verify-ecc.mjs, tests/ecc_lite.test.mjs and .github/workflows/ci.yml.
