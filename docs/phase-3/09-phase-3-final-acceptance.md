# P3-09 — Phase 3 Final Acceptance & Production Readiness Audit

## Verdict

`P3_09_PHASE_3_TECHNICAL_ACCEPTANCE_PASS`

Phase 3 (P3-00 through P3-08) is technically coherent and accepted on current `master`. This
verdict does **not** authorize or imply Production Supabase deployment, `EMAIL_DELIVERY_MODE=LIVE`,
or any other production rollout step — see [Production status](#production-status) below.

This document is an audit and closure record. It reimplements nothing; it does not change
`EMAIL_DELIVERY_MODE`, does not deploy Production Supabase, and does not start Phase 4.

## Master baseline

- **SHA:** `ae679da93cb45fcaa2b562cea8792261b63bc202` (merge commit of PR #21 into `master`).
- **Working tree:** clean; `git diff origin/master` empty at audit time.
- **PR #21 state:** `MERGED` (verified via `gh pr view 21`), base `master`, merged
  `2026-08-15T15:57:30Z`.
- **CI on exact merge commit:** GitHub Actions run
  [`31894178113`](https://github.com/vi-phuong-158/so-tay-doan-vien-so/actions/runs/31894178113) —
  `success`, triggered directly by the merge (`headSha = ae679da93c...`). This is CI evidence on the
  real post-merge master state, not stale pre-merge evidence from the PR branch.
- **PR lineage #1 → #21:** all merged, confirmed via `gh pr list --state all` (21/21 `MERGED`, no
  open or draft PRs remaining from the Phase 2/3 lineage).

## Phase 3 scope review

Reviewed directly from current `master` source (migrations, Edge Functions, tests, docs) — not
re-derived from memory of prior task summaries.

| Task | State on `master` | Evidence |
| --- | --- | --- |
| P3-00 | PASS (baseline/rehearsal plan, docs-only) | `docs/phase-3/00-baseline-rehearsal-plan.md` |
| P3-01 | Merged — notification foundation, RLS, mark-read RPCs | `202608110001_phase_3_notification_foundation.sql`; RLS confirmed (`notifications` policy present, `enable row level security` set at table creation in `202607300001_initial_schema.sql`) |
| P3-02 | Merged — email queue state machine | `202608110002_phase_3_email_queue_state_machine.sql`: idempotency key, `FOR UPDATE SKIP LOCKED`, claim lease/reclaim, bounded `attempt_count`/`max_attempts`, `SENT` terminal (not re-claimable), backoff 60/300/900/3600s — all verified by direct source read |
| P3-03 | Merged — Resend provider integration | `202608110003_phase_3_email_provider.sql`, `provider.ts`: idempotency key header, safe renderer allowlist, provider error classification |
| P3-03R | Live rehearsal PASS (non-production project `znexculhbdjiflkczpyu`) | `docs/phase-3/03r-live-email-rehearsal.md` |
| P3-04 | Merged — report event email hooks | `202608130001_phase_3_report_event_email_hooks.sql` |
| P3-05 | Merged — reminder engine | `202608130002_phase_3_reminder_engine.sql` |
| P3-R1 | Merged — `EMAIL_DELIVERY_MODE` fail-closed gate + reminder cycle fix | `202608140001_phase_3_r1_email_safety_remediation.sql`, `contract.ts` (verified fail-closed on missing/empty/wrong-case) |
| P3-06 | Merged — cron & overdue automation | `202608140002_phase_3_cron_overdue_automation.sql`: `report_mark_overdue_daily` (`5 17 * * *`), `report_reminder_scan_daily` (`0 0 * * *`), both pure in-database RPC calls, no HTTP/secret |
| P3-07 | Live rehearsal PASS (non-production project) | `docs/phase-3/07-live-cron-rehearsal.md`: two scheduled ticks each for overdue/reminder jobs, idempotent, no duplicate history/audit/notification/queue rows, cleanup verified |
| P3-08 | Merged — email worker scheduling | `202608150001_phase_3_email_worker_scheduling.sql`: `email_queue_worker` (`*/10 * * * *`) via `pg_net`→`process-email-queue`, Vault-sourced URL/secret, zero literal secrets (verified by direct read and by `supabase/tests/email_worker_scheduling.sql` assertions) |

All PRs (#11–#21) for this lineage are merged; no Draft/open PR remains outstanding for P3-00–P3-08.

## Documentation drift found

At audit start:

1. `docs/04-implementation-status.md` stated "P3-06, P3-07 and P3-08 remain unimplemented" — false;
   all three are merged/recorded on `master`.
2. `docs/brain/04-current-tasks.md` listed P3-08 under "Đang làm" (in progress) with a stale base
   (`master@63d1b7a`, pre-P3-06-merge) and did not mention P3-09 at all.

No other materially stale current-state claims were found in `docs/brain/01-architecture.md`
(already correctly documents the P3-08 scheduler), `docs/brain/06-ai-working-log.md` (historical
log, entries are accurate as-of-their-date and not rewritten), `docs/phase-3/*.md` (each task's own
report is internally consistent and provenance-correct), `README.md`, `AGENTS.md`, or
`BUILD_REPORT.md` (none reference Phase 3 task status). The legacy `docs/0X-*.md` files (`03-`,
`05-`through `08-`) are historical Phase 1 bootstrap snapshots dated 2026-07-30 and make no current
Phase 3 state claims, so they were left untouched.

## Documentation updated

- `docs/04-implementation-status.md`: replaced the "P3-06/07/08 unimplemented" section with an
  accurate summary of P3-00→P3-08 merged state, the exact-HEAD CI evidence, and a pointer to this
  document as the current P3-09 task.
- `docs/brain/04-current-tasks.md`: moved P3-08 from "Đang làm" to "Đã hoàn thành gần đây" with its
  merge commit/PR, added P3-09 as the current "Đang làm" entry, and updated the backlog handoff note.
- This document (`docs/phase-3/09-phase-3-final-acceptance.md`) created.
- No historical evidence (P3-03R, P3-07B, P3-08A/B rehearsal records, `06-ai-working-log.md`
  entries) was rewritten — provenance preserved as instructed.

## Security audit

**Email delivery mode** (`supabase/functions/process-email-queue/contract.ts`,
`getEmailDeliveryConfig`): resolves to `OFF` for anything except the exact literals `ALLOWLIST` or
`LIVE` — missing, empty, wrong-case, or garbage all fail closed to `OFF`. In `index.ts`, the mode
gate is evaluated immediately after worker-secret auth and strictly before `claim_email_queue` is
called, before `getWorkerConfig`, and before any provider secret (`EMAIL_PROVIDER_API_KEY`) is read
via `requiredEnv`. `OFF` returns a `{claimed:0, sent:0, ...}` response with none of those steps
executed. Verified by direct source read, matching the required "OFF must return before queue
claim / provider init / provider secret use" invariant exactly.

**Queue** (`202608110002_phase_3_email_queue_state_machine.sql`): trusted enqueue via
`enqueue_email_for_user_event` (SECURITY DEFINER, service_role-only, server-resolves recipient
email from `auth.users`/`profiles`, never client-supplied); idempotency via
`email_queue_idempotency_key_key` unique constraint + `on conflict do nothing`; bounded attempts
(`max_attempts between 1 and 10`, `attempt_count <= max_attempts`); concurrency-safe claiming via
`for update skip locked` in `claim_email_queue`; claim lease (`lease_expires_at`) with reclaim of
expired `PROCESSING` rows (still under `attempt_count < max_attempts`) or forced `FAILED` once
exhausted; `SENT` is terminal — `mark_email_sent` only transitions rows still `PROCESSING` with the
matching `claim_token`, and `claim_email_queue`'s eligibility predicate never selects `SENT`;
`FAILED` behavior and retry backoff (60s/300s/900s/3600s keyed by attempt number) confirmed in
`mark_email_retry`.

**Provider** (`provider.ts`): `Idempotency-Key: email:{queue_id}` sent on every Resend call;
renderer (`renderer.ts`) explicitly allowlists template codes (`TEMPLATE_NOT_ALLOWLISTED` thrown
otherwise) and HTML-escapes all interpolated values, with the `email_queue_payload_check`
constraint additionally blocking any `html`/`html_content`/`raw_html` key from ever reaching the
queue row — no raw HTML payload trust at any layer; provider errors are classified
(`classifyProviderFailure`) into retryable/terminal with status-code-driven logic and error
messages are redacted when they match credential-shaped patterns (`authorization|api[ _-]?key|
bearer|secret|token`); no secret is committed (see Secret audit below).

**Scheduler**: exactly the three intended jobs are defined and each verified by direct migration
read plus pgTAP assertions (`supabase/tests/report_cron_overdue.sql`,
`supabase/tests/email_worker_scheduling.sql`):

| Job | Schedule | Path |
| --- | --- | --- |
| `report_mark_overdue_daily` | `5 17 * * *` | in-database RPC (`mark_overdue_assignments()`) — no HTTP |
| `report_reminder_scan_daily` | `0 0 * * *` | in-database RPC (`scan_report_reminders()`) — no HTTP |
| `email_queue_worker` | `*/10 * * * *` | `pg_cron` → `pg_net` (`net.http_post`) → `process-email-queue` Edge Function, `x-cron-secret` header |

`email_queue_worker`'s job body sources both the target URL and the `x-cron-secret` value from
`vault.decrypted_secrets` by name at execution time — zero secret literals in the migration,
confirmed both by direct read of `202608150001_phase_3_email_worker_scheduling.sql` and by the
pgTAP assertions that the job command contains no hardcoded `https://*.supabase.co` URL and no
`bearer `/`service_role`/Resend-key-shaped literal. This is `pg_cron → pg_net → process-email-queue`,
never `pg_cron → provider directly` — the two daily jobs remain pure in-database RPC calls
untouched by P3-08 (confirmed by the P3-08 pgTAP non-regression assertions on job name/schedule/
command shape).

## Secret audit

Searched tracked repository content for `CRON_SECRET`, `service_role`, `SUPABASE_ACCESS_TOKEN`,
`EMAIL_PROVIDER_API_KEY`, `RESEND_API_KEY`-shaped (`re_[A-Za-z0-9_-]{10,}`) values, `eyJ`-prefixed
JWT-shaped strings, `Bearer `-prefixed tokens, and database password patterns.

**Result: no real credential found.** The only matches were: (1) test fixtures deliberately using
fake/example values to assert redaction behavior (`provider.test.ts`: a mocked provider error body
containing the literal string `"Authorization: Bearer re_secret_value"`, used to test that the
worker's error-message redaction regex catches it — not a real key); (2) `supabase/seed.sql`, which
uses `extensions.crypt('password123', ...)` for local/dev-only seed accounts at `@test.local`
addresses — standard Supabase local-seed practice, not a production credential. `.env` and `.env.*`
are gitignored (only `.env.example`, containing empty/placeholder values and `EMAIL_DELIVERY_MODE=
OFF` as the shipped default, is tracked). No `SUPABASE_ACCESS_TOKEN` reference found anywhere in
tracked content.

Verdict: **no** `P3_09_BLOCKED_SECRET_EXPOSURE`.

## Database / RLS

- **Migrations:** could not run `supabase db reset` locally — this sandboxed environment has no
  Docker, no Supabase CLI, and no Deno, matching every prior Phase 2/3 task's documented
  environment constraint (see `docs/brain/06-ai-working-log.md`, repeated across P3-01 through
  P3-08 entries). Migration ordering and full-reset correctness are instead evidenced by GitHub
  Actions CI job `test-db` on the exact current master merge commit `ae679da`
  (run `31894178113`, `success`), which runs `supabase start && supabase db reset && supabase test
  db` against all 22 Phase 2+3 migrations in commit order.
- **pgTAP:** same CI run; not re-executed locally for the same reason. Prior-task CI evidence
  chain shows monotonically increasing suite/test counts through the lineage (e.g. P3-06 CI
  `Files=18, Tests=450`; P3-08 CI `Files=19, Tests=476`), consistent with each task adding its own
  suite without breaking prior ones.
- **RLS:** `notifications`, `email_queue`, `email_logs`, and all other Phase 2/3 tables have RLS
  enabled at table-creation time (`202607300001_initial_schema.sql`, blanket `enable row level
  security` loop); `report_reminder_events` (added in P3-05) enables RLS in its own migration
  (`202608130002_phase_3_reminder_engine.sql:34`). Reviewed by direct source read, not assumed.
- **GRANT/REVOKE:** every Phase 3 SECURITY DEFINER function touching the email queue, reminder
  engine, or overdue automation is `revoke all ... from public, anon, authenticated` followed by
  `grant execute ... to service_role` only (`claim_email_queue`, `mark_email_sent`,
  `mark_email_retry`, `enqueue_email_for_user_event`, `get_email_queue_stats`,
  `enqueue_report_reminder_email_from_notification`, `scan_report_reminders`,
  `mark_overdue_assignments`) — confirmed by a full grep across all Phase 3 migrations
  (`202608*.sql`); no grant reopens `authenticated`/`anon` access to any of these RPCs or to
  `email_queue`/`email_logs` tables.
- **SECURITY DEFINER search_path:** every reviewed Phase 3 SECURITY DEFINER function sets
  `search_path = public` (or `public, auth` where `auth.users` is read), closing the classic
  SECURITY DEFINER search-path-hijack vector.
- **Direct RPC bypass check:** no Phase 3 migration re-opens `authenticated`/`anon` execute on any
  of the trusted worker/admin RPCs above; the P3-08 pgTAP suite explicitly re-asserts this
  non-regression (`authenticated`/`anon` still have zero privileges on `claim_email_queue` and
  `email_queue` after P3-08).

## Edge functions

- **Deno check / Deno test:** not executed locally — no Deno binary available in this environment
  (same constraint as above). Evidenced via the same CI run `31894178113`'s `test-db` job, which
  runs `deno check **/*.ts` and `deno test --allow-all` for the full `supabase/functions/` tree.
- **`process-email-queue`:** reviewed directly (`index.ts`, `contract.ts`, `worker.ts`,
  `provider.ts`, `renderer.ts`). Trusted-worker authentication (`hasTrustedWorkerSecret`) uses a
  constant-time comparison and is evaluated first, before the delivery-mode gate, before any other
  logic — fails closed (`403 FORBIDDEN`) on missing/mismatched `x-cron-secret`.
- **Scheduler functions:** `report_mark_overdue_daily`/`report_reminder_scan_daily` are pure SQL
  RPC cron jobs (no Edge Function involved, no HTTP, no `CRON_SECRET`). `email_queue_worker`
  reaches the existing `process-email-queue` Edge Function via `pg_net`, reusing the same
  `x-cron-secret` contract — no new Edge Function or new auth mechanism was introduced by P3-08.
- **Shared auth/http helpers:** `_shared/http.ts` provides `corsHeaders`/`errorResponse`/`json`
  used consistently; no bypass of the trusted-worker check was found in any Phase 3 Edge Function
  path reviewed.

## Frontend

Run directly in this session (`npm ci` succeeded, 0 vulnerabilities):

- **Tests:** `npm test` → **45/45 PASS**.
- **Lint:** `npm run lint` → **0 errors**, 3 pre-existing `react-refresh/only-export-components`
  warnings (`Guards.jsx`, `Icon.jsx`, `AuthContext.jsx`) — unchanged from prior Phase 3 baselines,
  not new.
- **Build:** `npm run build` → **PASS** (`vite build`, 111 modules, output in `dist/`).

## CI

- **Run:** [`31894178113`](https://github.com/vi-phuong-158/so-tay-doan-vien-so/actions/runs/31894178113)
- **HEAD:** `ae679da93cb45fcaa2b562cea8792261b63bc202` (the actual post-merge master commit, not a
  pre-merge PR-branch HEAD)
- **Result:** `success`
- This audit's own docs-only commit is on branch `claude/phase-3-final-audit-d18279`, Draft PR
  [#22](https://github.com/vi-phuong-158/so-tay-doan-vien-so/pull/22). CI run
  [`31915317697`](https://github.com/vi-phuong-158/so-tay-doan-vien-so/actions/runs/31915317697) on
  the exact PR HEAD `6518857665540520e27c7de7c84bcd02092fd59a` is `success` (`build` and `test-db`
  both `pass`; Vercel preview deploy also `pass`) — this is additional to, not a replacement for,
  the already-green `ae679da` evidence above, which covers the full P3-00→P3-08 implementation.

## Production readiness matrix

| Area | Implemented | Automated Tests | Rehearsal Verified | Production Verified | Remaining Gap | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Authentication | Yes (Supabase Auth, `requireUser`, RLS-scoped) | Yes (pgTAP + frontend AuthGuard tests) | No (no non-production auth rehearsal with real users beyond seed fixtures) | No | Real user provisioning, session/token config, production auth rehearsal | Technically accepted; production auth setup outstanding |
| RLS | Yes (all tables, table-creation + per-migration) | Yes (pgTAP privilege/policy assertions) | Partial (rehearsal project `znexculhbdjiflkczpyu` used for P3-03R/P3-07B/P3-08A/B, not a full `rls_acceptance.sql` run recorded in this lineage) | No | Full `supabase/tests/rls_acceptance.sql` run against a fresh rehearsal or production-shaped project | Technically accepted; full RLS acceptance rehearsal not yet re-run post-Phase-3 |
| Notifications | Yes (P3-01, in-app, RLS-scoped read + RPC mark-read) | Yes | Yes (P3-07B reminder scan created live notification rows) | No | None beyond production provisioning | Technically accepted |
| Email queue | Yes (P3-02, full state machine) | Yes (pgTAP + Deno concurrency integration test) | Yes (P3-03R, P3-07B, P3-08A/B) | No | None beyond production provisioning | Technically accepted |
| Provider (Resend) | Yes (P3-03) | Yes (pgTAP + Deno unit/contract tests) | Yes (P3-03R normal + safe-render fixtures SENT; P3-08B one real send + duplicate-suppression check) | No | Production Resend account/sender verification, production `EMAIL_PROVIDER_API_KEY` provisioning | Technically accepted; provider production account not yet provisioned |
| Report event hooks | Yes (P3-04) | Yes | Implicit (exercised by P3-07B reminder chain) | No | None beyond production provisioning | Technically accepted |
| Reminder engine | Yes (P3-05, P3-R1 fix) | Yes | Yes (P3-07B) | No | None beyond production provisioning | Technically accepted |
| Overdue automation | Yes (P3-06) | Yes | Yes (P3-07B, 2 scheduled ticks, no duplicates) | No | None beyond production provisioning | Technically accepted |
| Cron (`report_mark_overdue_daily`, `report_reminder_scan_daily`) | Yes (P3-06) | Yes (pgTAP schedule/name/active assertions) | Yes (P3-07B) | No | Production `pg_cron` provisioning, timezone re-verification against production DB timezone setting | Technically accepted; production cron not yet provisioned |
| Worker scheduler (`email_queue_worker`) | Yes (P3-08) | Yes (pgTAP: job identity, Vault-sourced body, no secret literal, non-regression) | Yes (P3-08A OFF, P3-08B ALLOWLIST, both via `AUTHENTICATED_EXTERNAL_OPERATOR`) | No | Production Vault secrets (`email_queue_worker_url`, `email_queue_worker_cron_secret`) must be provisioned per-environment (manual, never committed); production cron provisioning | Technically accepted; scheduler infra not yet provisioned in production |
| Storage | Partial (Phase 2 report file storage, signed URLs, RLS policies) | Yes (Phase 2 pgTAP suites) | Partial (rehearsal only) | No | Production Storage bucket configuration, virus scanning (noted as not yet confirmed since Phase 2 status doc), backup policy | Gap — not fully verified even at rehearsal level for Phase 3 scope |
| Backups | Not implemented/configured anywhere in this repo | No | No | No | Backup/restore procedure has never been defined, tested, or documented for any environment | **Gap** — no backup/restore verification exists at any stage |
| Observability | Partial (Postgres-native: `cron.job_run_details`, `net._http_response`, Edge Function logs, `email_queue`/`email_logs` state — all reused, none new) | No dedicated tests (by design, per P3-08 doc) | Yes, used during P3-07B/P3-08A/B to gather rehearsal evidence | No | No alerting, no dashboards, no on-call paging configured for any Phase 3 job/queue failure mode | **Gap** — observability is "queryable," not "alerting" |
| Secrets | Yes (Vault pattern established, `.env.example` documents required names, CI/CD has none committed) | N/A (secret audit is manual/grep-based, done above) | Yes (rehearsal project had its own Vault secrets, never shared with production) | No | Production Vault secrets, production `CRON_SECRET`/`EMAIL_PROVIDER_API_KEY`/`SUPABASE_SERVICE_ROLE_KEY` have never been created | **Gap** — no production secret exists yet |
| Production environment | Not created | N/A | N/A | No | No Supabase production project exists; `docs/brain/05-testing-and-deploy.md` explicitly gates production on "checklist bảo mật + backup/restore" and "chỉ khi đã pilot" (only after pilot) — neither has happened | **Gap** — production environment itself does not exist |

## Distinguishing technical acceptance from production ready

Phase 3 (P3-00 through P3-08) is **technically accepted**: every migration, RPC, Edge Function, and
scheduler job described above exists on `master`, is covered by automated tests, passed CI on the
exact current merge commit, and — where a live send or live scheduler tick was required to prove
the mechanism actually works outside a test harness — was rehearsed against a dedicated
non-production Supabase project with owner-confirmed evidence.

This is **not** the same as production-ready. Concretely outstanding, none of which this audit
performed or is authorized to perform:

1. **Production Supabase project does not exist.** No project has been created, no migration has
   ever been applied to a production database.
2. **Production secrets do not exist.** `CRON_SECRET`, `EMAIL_PROVIDER_API_KEY`, `SUPABASE_
   SERVICE_ROLE_KEY`, and the two P3-08 Vault secrets (`email_queue_worker_url`,
   `email_queue_worker_cron_secret`) have never been created anywhere production-facing — they are
   deliberately excluded from every migration and from this repository.
3. **Production cron is not provisioned.** The three `pg_cron` jobs exist only in the rehearsal
   project used for P3-07B/P3-08A/B; they must be (re-)applied via a real migration deployment to
   whatever project becomes production.
4. **Backup/restore has never been verified**, for Phase 3 data or otherwise, at any project tier.
5. **Observability is read-only/manual.** The tables and logs needed to diagnose a failure exist,
   but no alerting, dashboard, or on-call runbook trigger has been built on top of them.
6. **Operational ownership/runbook is incomplete.** P3-08's document contains a manual operator
   runbook for rehearsal, not a production on-call procedure.
7. **Controlled production rollout has not started.** `docs/brain/05-testing-and-deploy.md`
   explicitly defines production as reachable only after a security checklist and backup/restore
   verification, followed by a pilot with a small group — none of which has begun.

None of the above is invented; each is either an explicit statement already in this repository
(`docs/brain/05-testing-and-deploy.md`, `docs/04-implementation-status.md`'s pre-existing "Chưa thể
xác nhận production" section) or a direct absence confirmed by searching this repository and
finding no production configuration, secret, or backup artifact of any kind.

## Production status

**Production Supabase has not been deployed, configured, or modified by P3-09 or any prior Phase 3
task.** `EMAIL_DELIVERY_MODE` has never been set to `LIVE` in any committed configuration; the only
`LIVE` sends that ever occurred were single, owner-confirmed, rehearsal-project sends (P3-03R,
P3-08B) against non-production Supabase projects, each immediately reverted to `OFF`. This audit
did not deploy anything, did not send email, and did not change delivery mode.

## Next recommended task

The largest remaining production-readiness gap is not a single missing feature but the **absence of
a production environment and its supporting operational infrastructure** (secrets, backups,
observability/alerting, and a real on-call runbook) — every Phase 3 capability above is technically
accepted but has zero production-tier verification. The recommended next task is a dedicated
**production environment provisioning and go-live readiness task**: create the production Supabase
project, apply the full migration history, provision production secrets/Vault entries, define and
test a backup/restore procedure, wire minimal alerting on cron/queue failure states, and write the
operational runbook — all before any pilot rollout or `EMAIL_DELIVERY_MODE=LIVE` in that
environment. This is a recommendation only; it is not started by P3-09.
