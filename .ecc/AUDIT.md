# Pre-implementation architecture audit

Observed 2026-10-04 UTC, baseline master:
`c03f2d5cab298c6469a22a8c2049f6620e813b11`.
No source edits preceded this audit and pinned ECC research.
Scope: manifests/locks, README/AGENTS/CLAUDE, all docs/brain, architecture/test/deploy
docs, CI, source service/auth boundaries, migration/RLS/grant/search_path patterns,
Member API migration/config/tests, runtime harnesses and Vercel/Supabase metadata.

## Source findings

- React18/Vite6/Router7 JS/JSX SPA; TS/Deno Edge Functions; Supabase Auth/Postgres/
  Storage/RPC/pgvector + Gemini; separate Node Member API/Postgres16/exceljs.
- Commands: npm test (Node tests), lint (eslint src), build (Vite); no root verify
  or frontend typecheck. Root tests include source contracts and mocked services.
- Existing CI has build (Node22, npm ci/lint/test/build), test-db (local Supabase
  bootstrap/reset/pgTAP + NQ double seed + SQL + Deno check/tests), member-api-test
  (separate disposable PostgreSQL16). No new workflow/secret needed.
- 49 source Supabase migrations, 33 pgTAP files, 4 Member migrations. Static scan
  found 136 SECURITY DEFINER declarations, all with explicit search_path. This
  does not certify effective privilege/authorization.
- Supabase migrations forward-only; don't edit applied SQL or replay hosted history.
  Member migrate tracks versions/transactions; migrate:fresh drops public schema.
- Browser secrets only public config; service role/provider/resolver/DB credentials
  backend. Tracked supabase/functions/.env is the documented local/CI placeholder,
  not permission to put a real secret there.
- ACTIVE/role/org private checks; anonymous NQ_300 users are authenticated DB role
  but INVITED/no roles. Private schema/key/owner policies and cleanup registry matter.
- Google Drive source-provider gateway is an existing backend decision, distinct
  from rejected Apps Script/Sheets/Drive-as-primary-infrastructure design.
- Vercel config: Vite/dist SPA rewrite, CSP/security headers, asset/SW caching.
  Git integration produces Preview; master merge can automatically deploy Production.
  Backend migrations/functions and Member hosting are separate release surfaces.

## Read-only external evidence

Baseline [CI run 37133998335](https://github.com/vi-phuong-158/so-tay-doan-vien-so/actions/runs/37133998335)
completed success on exact baseline; GitHub Vercel status success.
Vercel project inspection: Vite, Node24 deployment setting, latest baseline deployment
READY/production; Preview has SSO protection. This is baseline metadata, not current
candidate/runtime acceptance. No deployment/config/secret mutation performed.

Connected Supabase rehearsal identified by verified project metadata; 50 hosted migration
records through nq_guest_privilege_boundary. Historical hosted versions often differ from
source filenames, so comparison normalized stored migration names. Observed drift:
- Source-only: 202608150001_phase_3_email_worker_scheduling.
- Hosted-only: 202608170001_phase_5_wiki_knowledge_model,
  202609260001_phase_5_semantic_retrieval.
Names/counts alone don't establish body parity. Reconcile history/source deliberately
before a DB release; do not auto apply/reset/import missing items in this task.

Security Advisor at 2026-10-04 10:59Z: 16 RLS-without-policy notices, 2 public extensions,
17 anon-executable and 73 authenticated-executable SECURITY DEFINER warnings,
anonymous-access policy warnings and leaked-password-protection disabled.
Deny-by-default/backend-only tables may intentionally have no policy; guarded RPC/public
content may explain some warnings. Each affected change needs effective grants/negative
tests; **not** a clean security certificate.
[Advisor guidance](https://supabase.com/docs/guides/database/database-linter)
and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Conflicts to reconcile / things to preserve

CLAUDE and old overview describe demo-only pages; current source/services/README say
real vertical slices. Keep historical narrative with dated correction; unify provider
instructions. Old test docs say reset rehearsal: narrow to disposable local/CI, never
shared hosted. Preserve required brain reading/log/Code Graph/decision updates.
Keep existing RLS/tests, API/account-vs-member isolation, quiz/server expiry/key privacy,
report versions, email OFF/allowlist, Drive private gateway, UI tokens/PWA, phase blockers.
Hosted Member API/provisioning/CORS/CSP/backup/restore remain blocked in existing reports.

## Environment evidence before implementation

Shell Git clone failed connecting proxy:8080; a network-permission retry hung and was
canceled. Reconstructed exact baseline through GitHub connector: 407 text blobs SHA-1
verified, original Git tree/commit hashes verified, 5 public binary assets restored and
hashed. Historical screenshot blobs not downloaded; no tracked binary changes.
Default root Node24 runner summarized 29 test files; additional
node --test --test-isolation=none tests/*.test.mjs reported **224 assertions PASS**.
Initial missing-image failure resolved by downloading original assets, not altering tests.
npm ci offline returned ENOTCACHED; installation/lint/build and DB tools need runtime
capabilities. Baseline historical CI is separate from new candidate verification.

## Implementation choices

[Decision 0001](memory/decisions/0001-ecc-lite-cloud-v1.md): one shared entrypoint,
repo-local policies + Markdown context, zero upstream executables/dependencies, explicit
structural validator and existing CI integration. This MEDIUM tooling change has no app,
DB/auth/secret/deployment mutation; new ECC tests and fresh review still required.
