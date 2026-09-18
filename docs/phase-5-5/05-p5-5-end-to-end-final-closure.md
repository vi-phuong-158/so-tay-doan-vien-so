# P5.5 — End-to-End Final Closure

## VERDICT

`PHASE_5_5_END_TO_END_ACCEPTANCE_BLOCKED_MATBAO_RUNTIME_NOT_PROVISIONED`

This report records the final closure attempt from the current repository baseline. It does not
claim production runtime acceptance, and Phase 6 must not start until the remaining hosted gates
are completed and P5.5 receives an end-to-end PASS.

## REPOSITORY STATE

- Repository: `vi-phuong-158/so-tay-doan-vien-so`.
- Base: `master@7f468a5111df54486f7e98688b4c16057668a519`.
- Branch: `codex/p5-5-final-e2e-closure`.
- PR #51 (`codex/p5-5-hosted-runtime-final-acceptance`) was audited as a valid one-commit
  historical acceptance artifact, not an empty/stale branch. It is not merged by this task.
- Final SHA: the exact PR head is recorded in the PR metadata and final handoff after commit.
- Existing owner files outside this change were preserved and not staged.

## PR #51 RECONCILIATION

PR #51 head was `cd875b7ed80c7515f6364c7e4970514484eade02`, exactly one commit ahead of the then
current master baseline, with hosted-runtime documentation. It was not merged because its verdict
was correctly blocked by missing Mắt Bão infrastructure. Its checks were green on its exact head
and it remains historical evidence; this closure continues from the exact current
`origin/master`, not from an unmerged PR branch.

## PUBLIC-FIRST AUTH

`src/App.jsx` now renders the AppShell/Home demo surface without a whole-app authentication
redirect. Data-bearing routes are grouped under `AuthGuard`. `src/components/Guards.jsx` returns a
clear login-on-demand CTA with the original destination instead of redirecting every guest to
`/login`.

This is not anonymous data access. The Home page uses explicitly labelled demo data. Documents,
learning, reports, notifications, member management, admin and AI/retrieval remain protected by
the existing AuthGuard, active-user checks, RLS and Edge Function JWT/scope checks. `ask-ai` is not
opened to anonymous callers.

Account and Member Record remain separate: Supabase Auth/profile/roles provide identity and
authorization, while the Member API owns member PII and rechecks JWT, role and organization scope
server-side without reading `auth.users`, `profiles` or `user_roles`.

## TEST RESULTS

| Gate | Result | Evidence / limitation |
|---|---|---|
| Root tests | PASS — `200/200` | Local `npm test` |
| Public-first/auth targeted tests | PASS — `17/17` | Local auth/guard suite; included in root total |
| Member API targeted tests | PASS — `73/73` | Local validation/scope/isolation subset |
| Root lint | PASS — `0 errors` | Four pre-existing Fast Refresh warnings remain |
| Root build | PASS | Local Vite production build |
| Full Member API local | BLOCKED | `MEMBER_DATABASE_URL` absent; `exceljs` install was blocked by Windows npm cache `EPERM` |
| Full Member API CI | PASS — `273/273` | Existing CI run `35177161631`, job `105061287912` |
| Supabase CLI/Deno CI | PASS | Existing test-db job; Deno `116 passed / 0 failed` |
| Supabase CLI/Deno local | NOT RUN | CLI/Deno unavailable in this environment |

The blocked local full suite is not converted into PASS by substituting CI evidence. The CI result
is reported separately and is tied to the existing PR #51 source lineage.

## SUPABASE

Read-only rehearsal audit found project `znexculhbdjiflkczpyu` (`so-tay-doan-vien-rehearsal`)
ACTIVE_HEALTHY, PostgreSQL `17.6.1.155`, 41 migrations through the P5.5 hardening migrations and
11 active Edge Functions. Public tables were RLS-enabled. Required resolver/admin/report functions
were deployed with the expected JWT posture; no production mutation was made in this round.

The existing rehearsal security delta remains in force:

- `transition_problem_status` validates authorization, organization scope and assignment.
- Direct execution of `member_scope_org_codes` is revoked from `anon` and `authenticated`.
- Affected trigger helpers use pinned `search_path=public`.
- Supabase CI test-db and Deno gates were green in the existing exact-head evidence.

Security Advisor snapshot observed at `2026-09-18 14:14:55Z` reported 14 intentional
RLS-without-policy backend/deny-by-default tables, 2 public extensions (`vector`, `pgtap`),
16 anonymous and 66 authenticated SECURITY DEFINER warnings for existing guarded helper/RPC
contracts, and 1 pending Auth leaked-password-protection configuration warning. These are recorded
as owner/configuration follow-ups, not silently labelled clean.

## SECURITY

No anonymous path was added to private document, learning, report, member or AI data. Existing
role boundaries remain: member management permits `YOUTH_ADMIN` and `BRANCH_OFFICER` as designed;
a lone `SYSTEM_ADMIN` is not implicitly a Member API role; import remains `YOUTH_ADMIN` only.
The Member API independently authorizes requests and does not inherit frontend visibility.

## MẮT BÃO

No Mắt Bão Vibe Host v2 instance, hosted PostgreSQL endpoint, production hostname, TLS
certificate, runtime access, logs or credentials were available. Therefore the Mắt Bão provisioning
gate is BLOCKED and no fake deployment or smoke test was performed.

### MATBAO_PROVISIONING_REQUIREMENTS

1. Provision a Mắt Bão Vibe Host v2 runtime and provide owner/operator access, deployment and
   restart procedure, health/readiness URL, logs and rollback path.
2. Provision the hosted PostgreSQL 16 Member database and provide a TLS-enabled
   `MEMBER_DATABASE_URL` with endpoint, port, database and least-privilege runtime user.
3. Configure server-side secrets only: `MEMBER_DATABASE_URL`, Supabase URL/anon key as required
   by the resolver bridge, `MEMBER_SCOPE_RESOLVER_URL`, `MEMBER_SCOPE_RESOLVER_SECRET`, and the
   exact `CORS_ALLOWED_ORIGIN`. Never place service-role, resolver or database secrets in frontend
   `VITE_*` variables.
4. Publish a stable HTTPS Member API hostname with DNS/TLS and expose only the required routes.
5. Configure Vercel `VITE_MEMBER_API_URL` and the exact production Member API origin in CSP
   `connect-src`, then redeploy and retain deployment evidence.
6. Provide an isolated backup destination, scheduled backup policy, restore target and an owner
   who can perform the destructive-free restore rehearsal with RPO/RTO evidence.

## MEMBER API

Hosted health/ready, JWT 401/403, exact-origin CORS/preflight, resolver bridge, CRUD, scoped
organization isolation, import, audit and unauthorized-actor checks were not run against a real
hostname because the host/database/secrets do not exist in this environment. Local targeted tests
and existing CI full-suite evidence are recorded above; no hosted PASS is claimed.

## VERCEL/CSP

Existing Vercel preview evidence was green on PR #51's exact head. The current repository still has
no real hosted Member API origin to validate against: `VITE_MEMBER_API_URL` is a deployment input
and `vercel.json` cannot be confirmed for a production hostname that has not been provisioned.
The production CORS/CSP exact-origin gate is therefore BLOCKED, not PASS.

## BROWSER E2E

Authenticated browser acceptance against a hosted runtime was not performed: no hosted Member API
hostname, Mắt Bão runtime or test credentials were available. Local static/public-first tests verify
route grouping and the guest CTA only; they do not replace browser acceptance against deployed
Supabase + Member API + Vercel.

## BACKUP/RESTORE

No hosted backup/restore rehearsal was performed. The earlier local Member database rehearsal and
restore qualification remain historical evidence only and do not prove Mắt Bão backup/restore.

## BLOCKERS

- Mắt Bão Vibe Host v2 is not provisioned.
- No hosted Member API hostname, PostgreSQL endpoint or production runtime secrets are available.
- Production CORS/CSP and Vercel Member API origin are not configured.
- Authenticated hosted browser acceptance is not run.
- Hosted backup/restore is not run.
- Full local Member API cannot run in this environment without `MEMBER_DATABASE_URL` and a usable
  `exceljs` installation; npm cache access failed with `EPERM`.
- Local Supabase CLI/Deno gates are unavailable, although the existing CI artifact is green.

## OWNER ACTION REQUIRED

Provision the requirements above, then run the hosted Member API, authenticated browser, CORS/CSP,
and backup/restore matrices. Re-run the full acceptance report on the resulting exact deployment
and only then decide whether P5.5 can change from BLOCKED to PASS. Do not start Phase 6 before that
decision.

## CHANGED FILES

- `src/App.jsx`
- `src/components/Guards.jsx`
- `tests/AuthGuard.test.mjs`
- `tests/public_first_auth.test.mjs`
- `docs/brain/01-architecture.md`
- `docs/brain/03-decisions.md`
- `docs/brain/04-current-tasks.md`
- `docs/brain/06-ai-working-log.md`
- `docs/04-implementation-status.md`
- `docs/phase-5-5/05-p5-5-end-to-end-final-closure.md`

## COMMITS

- Starting SHA: `7f468a5111df54486f7e98688b4c16057668a519`.
- Final SHA: exact tip of the closure PR, reported after commit/push.

## PR

A new PR will target `master` from `codex/p5-5-final-e2e-closure`. PR #51 remains unmerged and
historical. The PR body repeats the exact final head SHA, validation matrix and blocked verdict.

## NEXT STEP

Owner/infra provisions Mắt Bão and the hosted Member API, supplies production origin/secrets and
backup access, then runs the remaining gates. Until that evidence exists, keep the verdict BLOCKED
and do not merge or begin Phase 6.
