# ECC_LITE_CLOUD_V1_PARTIAL

Observed: 2026-10-04 UTC. CODE_COMPLETE is established by reviewed source + CI.
Draft PR delivered under explicit user approval; overall PARTIAL because browser
Preview acceptance remains BLOCKED. HTTP smoke is not RUNTIME_ACCEPTED.

1. Baseline: master@c03f2d5cab298c6469a22a8c2049f6620e813b11.
2. Branch: codex/ecc-lite-cloud-v1 (pushed).
3. Final commit: commit containing this report; exact SHA in PR/final delivery.
   User explicitly approved a Draft PR exception on 2026-10-04 to obtain missing CI
   evidence before all gates pass; this does not waive acceptance requirements.
4. Created: .ecc core policies/PROJECT/AUDIT/ECC_UPSTREAM/REVIEW/REPORT; memory README,
   decisions README/template/ADR0001, handoffs README/template/task handoff, lessons
   README, runbooks README/verification/database/runtime/fresh-agent-review;
   scripts/verify-ecc.mjs, tests/ecc_lite.test.mjs.
5. Modified: AGENTS.md, CLAUDE.md, README.md, package.json, existing ci.yml,
   docs/brain 00–06, docs/05-testing.md, docs/06-deploy.md.
6. Decisions: shared provider-neutral entrypoint, original read-only structural verifier,
   reusing checks/CI, Git Markdown context, no upstream runtime/executable/dependency.
   [ADR](memory/decisions/0001-ecc-lite-cloud-v1.md).
7. Upstream: latest observed release v2.2.3; inspected main
   ef648e01899ba3e8dc6371642deaaf64b4477775, checked 2026-10-04;
   [read/apply/reject provenance](ECC_UPSTREAM.md).
8. Commands/evidence: table below + [audit](AUDIT.md), [review](REVIEW.md),
   [handoff](memory/handoffs/2026-10-04-ecc-lite-cloud-v1.md).
9. Tests: root 231/231, ECC 7/7, full Member 273/273, Supabase 856 assertions/33
   files, NQ runtime assertions and Deno 119 tests PASS in initial candidate CI.
10. Regression: old tests/scripts/dependencies/lockfiles retained; CI backend jobs unchanged.
    Candidate CI install/verify/full backend PASS; baseline CI remains historical.
    Local install/build/backend blockers remain, covered by identified remote CI evidence.
11. Security: new/modified files reviewed; credential/private-key/remote-pipe shapes
    not found; no secrets/upstream executables/new dependencies/remote code execution/
    hooks. Validator read-only, no network/process writes; fixtures synthetic/temp only.
    Static scan is not full security certification. Existing advisor/history gaps retained.
    CI npm ci reports 3 root dependency vulnerabilities (1 low, 2 high) on unchanged
    manifests/locks; no automatic audit fix or clean-dependency certification.
12. Fresh simulation: PASS 9/9; independent full-diff review PASS after documented
    reconciliation correction. Final evidence docs re-reviewed separately.
13. Runtime: app/DB behavior unchanged. Exact initial-head Preview READY and HTTP
    smoke PASS; browser acceptance attempt BLOCKED by Chromium socket EPERM/SIGTRAP.
    No authenticated journeys or RUNTIME_ACCEPTED claim. Production NOT_REQUESTED/no action.
14. Limitations: cloud sandbox blocks network and socket listen; missing npm cache/
    dependencies, Supabase/Deno/psql and verified disposable Member DB. Only text/public
    assets reconstructed from connector; historical screenshots untouched/not downloaded.
    Hosted/source migration drift and existing security advisor findings need separate task.
15. V2 deferred: ECC Full/catalog/hooks, daemon/learning/evolution, auto policy promotion,
    MCP/index service, autonomous merge/deploy; none enabled.
16. Draft PR [#65](https://github.com/vi-phuong-158/so-tay-doan-vien-so/pull/65)
    created, feature branch pushed. Initial candidate CI SUCCESS; final evidence-only
    commit gets its own CI, current result linked from PR. Never merge/Production deploy.

## Machine evidence

Node v24.19.0/npm11.9.0 in this shell; prescribed CI Node22 not tested locally.
All commands run from repo root unless stated. Raw logs untracked under /tmp;
safe command summaries retained here, not treated as future-session current evidence.

| Command/check | Actual result |
|---|---|
| GitHub connector baseline/tree/source fetch | exact tree/commit and 407 text blobs verified; 5 public binaries verified |
| ECC GitHub main/release + pinned files reads | research before edits, no installer/executable run |
| Vercel/Supabase metadata/migrations/security advisors | read-only audit; baseline/runtime gaps in AUDIT |
| node --check scripts/verify-ecc.mjs; node --check tests/ecc_lite.test.mjs | exit 0 each |
| npm run verify:ecc | exit 0; structural files/links + both manifest/lock pairs; count grows with final reports |
| node tests/ecc_lite.test.mjs | exit 0; 7/7 PASS |
| npm test | exit 0; default Node24 runner 30 file summaries |
| node --test --test-isolation=none tests/*.test.mjs | exit 0; 231/231 assertions, 0 fail/skip |
| node --test --test-isolation=none member-api/tests/{scope,memberValidation,isolation}.test.mjs | expanded explicit filenames; exit 0, 52/52 |
| Mixed Member scope/directory subsets | exit 1, some HTTP mock-server tests listen EPERM 127.0.0.1; BLOCKED environment, not full PASS |
| npm ci --offline --ignore-scripts --cache /tmp/ecc-npm-cache | exit 1 ENOTCACHED |
| timeout 20s npm ci --ignore-scripts --fetch-retries=0 --fetch-timeout=5000 --cache /tmp/ecc-npm-cache | exit 1; registry fetch EPERM, npm exit-handler error |
| npm --prefix member-api ci --offline --ignore-scripts --cache /tmp/ecc-member-npm-cache | exit 1 ENOTCACHED |
| npm run verify | exit 127 at ESLint missing; structural stage passed |
| npm run build | exit 127 at Vite missing |
| Python YAML/manifest checks | exit 0; CI parses; backend job semantics, deps/old scripts unchanged |
| Static migration scan | 49 migrations/33 SQL tests, 136 SECURITY DEFINER declarations have search_path; not runtime certification |
| git diff --check | exit 0; no whitespace errors |

## Remote delivery evidence (2026-10-04 12:42Z)

Initial head ab3f5586e8edcc81853ce13bc6e79bb91e630872;
[CI run 37202265221](https://github.com/vi-phuong-158/so-tay-doan-vien-so/actions/runs/37202265221)
SUCCESS. Actions checks PR merge d743f9d46a329bb72fd85911307c15ca739947b6;
its tree fe3e2fd969853e6f93cce73933130278ba9eb9f5 exactly matches head.
Final update changes evidence docs/log only; no executable/CI/package/app/DB change.
Final hash and exact final-head CI are recorded in PR/final response, avoiding self-reference.

| Remote gate / job | Result |
|---|---|
| build / 111436208219 | npm ci + npm run verify PASS; Node22.23.3; ECC 24 docs/2 locks; lint 0 errors/3 existing warnings; root 231/231, no skips; Vite build PASS, existing >500kB warning |
| member-api-test / 111436208025 | npm ci + full npm test PASS; 273/273, no skips; disposable CI PostgreSQL16 |
| test-db / 111436208194 | local disposable Supabase start/reset, pgTAP 33 files/856 assertions PASS; NQ seed twice + NQ_RUNTIME_ASSERTIONS_PASS; existing Deno check + 119 tests PASS |
| Read-only Vercel Preview | dpl_E2SsYfK3hqFEV9KPNbEso3qm41Nk READY, Git SHA/branch matched; target null (Preview), no Production action |
| Preview HTTP smoke | root, /tri-thuc SPA, manifest, sw.js, referenced JS: 200; HTML/JS types, CSP/DENY/nosniff, SW no-cache and asset immutable observed |
| Playwright + installed Chromium | launch exit 2 before navigation: socket setsockopt Operation not permitted, SIGTRAP; browser gate BLOCKED |

Preview: https://so-tay-doan-vien-omd1gri7q-vi-phuong-158s-projects.vercel.app
HTTP fetch through authorized connector; no auth cookie/bypass URL persisted.
No form writes, login credentials, quiz attempt or Production messages were used.
Frontend typecheck N/A (JS/JSX); Deno check evidence is existing CI scope, not a
new all-recursive typecheck certificate. Full browser/authenticated acceptance remains
pending in a browser-capable environment with approved test accounts/fixtures.
