# Verification procedure

Preflight: git status/HEAD/baseline; Node22/npm like CI; safe environment/target;
capability check for docker, supabase, psql, deno when backend suite required.
No automatic package install, DB connection or secret discovery by ECC validator.

## Root source gate

From repo root:
```sh
npm ci
npm run verify
git diff --check
```

verify composes verify:ecc → lint → npm test → build, fail-fast. Existing scripts remain
available individually. verify:ecc checks policy/context files and inline local links,
rejects symlinks/out-of-repo targets and detects manifest/lock dependency drift.
It does not enforce semantics/security/runtime. Node built-in tests cover its failure cases.
No frontend typecheck: JS/JSX. Vite production build is not Production deployment.

If logs need summarizing, retain original command exit code before tail/tee; sanitized
summary in handoff, raw evidence untracked/CI artifact. Missing tools BLOCKED, not PASS.
Use a supported Node version; if runner only reports file count, get assertion counts
from TAP/CI or direct tests. An alternate command is reported separately, not substituted.

## Existing full backend CI gates

[CI](../../../.github/workflows/ci.yml) is executable command source:
- test-db: Supabase local start/reset/pgTAP; NQ seed twice and nq-runtime-check.sql;
  Deno check and integration tests with local Auth/config.
- member-api-test: separate disposable PostgreSQL16; member-api npm ci + full npm test.
- build: root install + verify.

For cloud shell reproduction, follow CI only after verifying disposable DB/container
identity; read [DB procedure](database.md). Deno check **/*.ts uses CI's shell glob scope;
when changing nested shared TS, explicitly include touched nested files as well.
Deno tests exercise shared units plus Auth/queue/worker integrations, not just frontend.

Member full suite runs migrations --fresh and writes synthetic fixtures: never use
a hosted/shared/Production MEMBER_DATABASE_URL. No fake default DB URL.
Missing DB/deps: blocked full suite; pure targeted tests may provide limited evidence,
label them accordingly. Do not count skipped DB tests as PASS.

If default Node runner hides assertion counts, run affected test files directly or an
available reporter; record runner/version and counts honestly. No new test framework.
Exact-head CI can prove unavailable cloud gates, but doesn't turn local blocked into pass.
