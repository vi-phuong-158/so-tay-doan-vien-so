# P5.5 Hosted Runtime Final Acceptance — 2026-09-17

## VERDICT

`PHASE_5_5_END_TO_END_ACCEPTANCE_BLOCKED_MATBAO_RUNTIME_NOT_PROVISIONED`

Gate-level result: `P5_5_HOSTED_RUNTIME_BLOCKED_INFRASTRUCTURE_NOT_READY`.

This report does not claim production runtime acceptance and does not change the
previous blocked verdict to PASS.

## BASELINE

- Base: `master`
- Starting SHA: `7f468a5111df54486f7e98688b4c16057668a519`
- Acceptance branch: `codex/p5-5-hosted-runtime-final-acceptance`
- Baseline source is the PR #50 merge commit and contains the previously accepted
  P5.5 security/runtime-closure changes.

## HOSTED INFRASTRUCTURE

The required Mắt Bão Vibe Host v2 application/runtime has not been provisioned,
and no account or deployment access is available in this environment. Consequently,
the following required inputs are unavailable: Member API hostname and HTTPS/TLS,
hosted PostgreSQL endpoint/database/user/password/port/TLS settings, runtime secret
storage and deployment/restart/logging access, and the production resolver secret
sync.

No placeholder values were used to simulate the hosted runtime, and no hosted
deployment was attempted.

## DATABASE

- Hosted Member PostgreSQL: not provisioned; Member API migrations `0001` through
  `0004` have not been applied to a hosted database.
- Supabase rehearsal: project `znexculhbdjiflkczpyu` is `ACTIVE_HEALTHY`, PostgreSQL
  `17.6.1.155`, with migrations through the P5.5 security hardening migrations.
  This is rehearsal evidence only and is not the separate Member API database.
- Hosted backup: no backup artifact or retention evidence is available.
- Hosted restore: no hosted restore rehearsal has been performed.

## MEMBER API

- Root tests: `197/197 PASS`.
- Member API targeted tests: `73/73 PASS`.
- Full Member API suite: not run. It requires the unavailable `MEMBER_DATABASE_URL`,
  and the local checkout does not contain `exceljs`.
- Hosted `/healthz`, `/readyz`, authentication, authorization, and CORS smoke tests:
  not run because no hosted runtime exists.

## SUPABASE

Supabase rehearsal reconciliation confirmed the expected P5.5 migration set and
active Edge Function catalog, including `resolve-member-scope` v1 with
`verify_jwt=true` and the deployed admin/report functions. No new production
Supabase mutation was made during this acceptance.

The targeted pgTAP security regression files previously passed against the rehearsal
in rollback transactions. The full Supabase CLI/Deno gate was not rerun because
those CLIs are unavailable in this environment.

The rehearsal Security Advisor still reports residual findings: 14 RLS-no-policy
informational findings, 2 extensions in `public`, 16 anonymous and 66 authenticated
security-definer execution warnings, and 1 leaked-password-protection warning.
These remain classified as existing project/configuration findings; the prior
mutable-search-path finding is cleared by the P5.5 hardening migration.

## FRONTEND / VERCEL

The merged master baseline retained the prior green Vercel deployment/checks.
This acceptance did not deploy a new frontend. The repository still has the local
placeholder `VITE_MEMBER_API_URL`, and `vercel.json` has no real Member API hostname
in CSP `connect-src`, because the production hostname is not available.

## BROWSER ACCEPTANCE

Authenticated browser acceptance against the hosted runtime was not performed:
there is no hosted Member API hostname, production runtime credential set, or
authenticated hosted test target.

## SECURITY FINDINGS

The following fixes remain part of the accepted baseline:

- `transition_problem_status` authorization and scope/assignment hardening;
- revoked direct execution of `member_scope_org_codes` from `anon` and
  `authenticated`;
- pinned `search_path=public` for affected trigger helpers.

No new security regression was introduced or evaluated against a production runtime
in this acceptance round.

## BLOCKERS

Owner/infrastructure action is required to provision the Mắt Bão application and
hosted PostgreSQL, supply secrets through the host's secret store, apply migrations
through `0004`, configure production hostname/TLS, exact CORS and CSP origins,
`VITE_MEMBER_API_URL`, and resolver-secret synchronization. After that, the full
Member API suite, hosted health/auth/authz/CORS checks, authenticated desktop/mobile
browser matrix, and backup/restore rehearsal must be run with evidence.

The following gates remain incomplete: Mắt Bão provisioning, hosted Member API
acceptance, authenticated browser acceptance, and hosted backup/restore.

## CHANGED FILES

- `docs/phase-5-5/04-hosted-runtime-final-acceptance.md`
- `docs/brain/04-current-tasks.md`
- `docs/brain/06-ai-working-log.md`

No feature, database migration, deployment configuration, or production runtime was
changed by this acceptance round.

## PR / COMMIT

The documentation-only changes are proposed on
`codex/p5-5-hosted-runtime-final-acceptance` for owner review. The final commit SHA
and PR URL are recorded after push and PR creation.

## NEXT STEP

Do not start Phase 6. Resume hosted-runtime acceptance only after the infrastructure
and remaining hosted gates are provisioned and evidenced. The verdict must remain
blocked until the complete P5.5 end-to-end acceptance receives a real PASS.
