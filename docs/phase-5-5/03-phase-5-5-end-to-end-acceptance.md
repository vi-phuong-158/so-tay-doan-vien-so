# P5.5 End-to-End Acceptance — 2026-09-16

## Verdict

`PHASE_5_5_END_TO_END_ACCEPTANCE_BLOCKED_MATBAO_RUNTIME_NOT_PROVISIONED`

This is a real-runtime closure audit. A green local build, a Vercel deployment, or a Supabase
rehearsal does not substitute for the hosted Member API and authenticated browser path.

## Baseline

| Evidence | Actual | Result |
|---|---|---|
| GitHub `master` | `a5b92b7e50dd70475becc177e8ce594726b2cf97` | MATCH |
| PR | #49 merged into `master`; no open PR returned | VERIFIED |
| Vercel production | READY; deployment `EPqb8Xe4ELGGQebA7qBEoqPWm8mg`; commit SHA matches master | MATCH |
| Supabase target | rehearsal `znexculhbdjiflkczpyu`, `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.155 | NON-PRODUCTION |
| Mắt Bão Member API | No provisioned instance, hostname, or connection string found | BLOCKED |

## Supabase rehearsal reconciliation

| Repo expected | Rehearsal actual | Match / drift | Action |
|---|---|---|---|
| P5.5 scope resolver migration | `202609050001_phase_5_5_member_scope_resolver` applied | MATCH after reconciliation | Kept forward-only |
| Scope helper ACL | `member_scope_org_codes(uuid)` SECURITY DEFINER, `search_path=public`, service-role only | MATCH after `202609160002` | Added ACL regression |
| Innovation status RPC | Scoped admin or assigned innovation member | MATCH after `202609160001` | Added authorization regression |
| Trigger helper search paths | 10 helpers had mutable path | DRIFT | Pinned with `202609160003`; Advisor finding cleared |
| Public tables / RLS | All exposed public tables inspected with RLS enabled | MATCH at RLS boundary; 14 no-policy backend tables | Intentional deny-by-default; no policy added speculatively |
| Storage buckets | Six expected private/public buckets present with expected limits | MATCH |
| Cron | Queue worker + overdue + reminder jobs present | MATCH |
| Edge Functions | 11 active after reconciliation: existing 4 + resolver + admin/report 6; `run-ingestion-jobs` and `send-reminder` remain deferred workers, innovation submit/update remain Phase 6 | MATCH for P5.5 runtime surface | User-facing P5.5/report functions deployed with JWT verification; Phase 6 functions intentionally not started |

No real data was created. A synthetic SQL authorization probe used a transaction and rolled back;
the final rehearsal counts for its problem, assignment, and temporary role fixtures were zero.

## Security Advisor classification

| Finding | Classification | Evidence / disposition |
|---|---|---|
| 14 RLS-enabled tables with no policy | `INTENTIONAL_AND_SAFE` | Backend-only tables use deny-by-default RLS and restricted ACLs; innovation child tables are not opened without a reviewed contract |
| 16 anonymous SECURITY DEFINER functions | `INTENTIONAL_AND_SAFE` | Existing helper contracts fail closed on missing active user; public execution is retained only where RLS policy evaluation requires it. The newly found resolver exception was removed |
| 66 authenticated SECURITY DEFINER functions | `INTENTIONAL_AND_SAFE` | Existing UI RPC/helper contracts and server-side guards were inspected; no new bypass identified in this audit |
| 2 extensions in `public` | `DEFENSE_IN_DEPTH` / accepted layout | `vector` types and pgTAP tests currently depend on the layout; moving them would be a separate reviewed migration |
| Mutable search path on 10 trigger helpers | `DEFENSE_IN_DEPTH` | Fixed by `202609160003`; post-fix Advisor no longer reports this category |
| Auth leaked-password protection | `CONFIGURATION_PENDING` | Auth setting could not be verified or changed through the available management access; owner must confirm before production |

Post-fix Security Advisor categories: 14 RLS-no-policy, 2 extension-in-public, 16 anon SECURITY
DEFINER, 66 authenticated SECURITY DEFINER, and 1 leaked-password configuration warning.

## Verification gates

| Gate | Result | Evidence |
|---|---|---|
| Root lint | PASS with 0 errors / 4 pre-existing warnings | `npm run lint` |
| Root build | PASS | `npm run build` |
| Root tests | BLOCKED in this Windows checkout | `192/197` pass; 5 existing isolation tests build paths with `%20` and cannot find files |
| Member API full suite | BLOCKED; pure subset PASS | Full suite cannot start without `MEMBER_DATABASE_URL` and `exceljs`; the dependency-free authorization/isolation/validation subset passed `73/73`, and no dependency installation was performed |
| Supabase pgTAP/Deno | Targeted pgTAP PASS; full CLI/Deno gate BLOCKED locally | The three new pgTAP files returned `ok` on the rehearsal in rollback transactions; `supabase` and `deno` CLIs are unavailable for the full reset/check suite |
| Security Advisor | PASS for addressed categories; residual findings classified | Mutable search-path category cleared; residuals listed above |
| Authenticated browser matrix | BLOCKED | No hosted Member API/runtime credentials and no complete cross-system runtime path |

No mandatory gate in this table is being re-labelled PASS because another environment reported a
historical CI result.

## Runtime and browser gates

The hosted Member API gate is blocked with the exact required reason:

`MATBAO_RUNTIME_BLOCKED_NOT_PROVISIONED`

Required owner/infra inputs before rerun:

- provisioned Mắt Bão Vibe Host v2 Node.js runtime and PostgreSQL 16 instance;
- `MEMBER_DATABASE_URL` with TLS policy confirmed, and successful `npm run migrate` through `0004`;
- public HTTPS Member API hostname with `/healthz` and `/readyz` returning 200;
- high-entropy `MEMBER_SCOPE_RESOLVER_SECRET` set in both runtimes without exposing it to the browser;
- exact `CORS_ALLOWED_ORIGIN`, frontend `VITE_MEMBER_API_URL`, and the real hostname added to
  Vercel `connect-src`;
- Auth setting confirmation for leaked-password protection and a disposable synthetic actor set.

Until those values exist, authenticated browser acceptance and the hosted backup/restore rehearsal
remain unrun and must not be called PASS. Phase 6 remains closed by the existing gate.
