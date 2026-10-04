# Database gate / recovery

Before migration: confirm source baseline, target identity, remote/local history,
pending changes and whether prior migrations already applied. Hosted history can use
different version/name mapping; inspect SQL/body parity. Do not replay/rename applied
migration or auto pull unexpected hosted schema into source.

Use installed CLI help (`supabase --help`, `supabase migration --help`) before
version-specific flags. Create a new pending file with `supabase migration new <name>`,
write reviewed SQL/RLS and tests there, and inspect local migration history.
Member migration runner uses ordered files under member-api/migrations and tracks
applied filenames; add a new forward file, don't rename/replay an applied version.

## HIGH-risk review checklist

- Forward-only migration; validation/constraints, locks/timeouts/transaction atomicity,
  concurrent writes/idempotency and affected data; rollback or forward-fix decision.
- Every exposed table RLS, explicit table/sequence/function grants; effective anon,
  authenticated (including anonymous Auth) and service_role behavior.
- SECURITY DEFINER fixed search_path, actor/ACTIVE/role/org checks; PUBLIC default
  EXECUTE revoked where inappropriate. Triggers/helpers and views reviewed too.
- WITH CHECK/USING, owner and foreign-org denial, private storage policies/helpers,
  no key/PII/provider-locator leaks; client role/org never trusted.
- Service-role bypass only in trusted backend with authorization/validation first.
- Member DB is separate: parameterized SQL, resolver fresh scope, transactional audit/
  import, no member roster in Supabase/AI and no client authorization claims.

## Disposable regression

Only the isolated local/CI exception in SAFETY permits reset/bootstrap without a separate
destructive-action approval. Verify local CLI ports/container ownership and synthetic
data, then reproduce [CI test-db](../../../.github/workflows/ci.yml): start local Supabase,
local reset, supabase test db, double NQ seed + runtime SQL and Deno checks/tests.
No --linked/remote/reset URL substitution. Existing NQ seed must remain bank-scoped.
Member tests use a newly created PostgreSQL16 member_api_test DB, never real member data;
npm --prefix member-api ci + test. Full suite internally runs migrate --fresh.

## Hosted rehearsal / Production

Existing [deploy guide](../../../docs/06-deploy.md) describes release order, not approval.
Shared rehearsal reset/destructive SQL needs explicit approval even if test task authorized.
Non-destructive pending migration/rehearsal mutation must be within task scope, verified
target and cleanup/recovery contract. Seed/file existence alone is not runtime evidence.

Record actual migration history/body parity, pgTAP/Deno/integration results, scoped
positive/negative actor evidence and cleanup. Missing rights/tools BLOCKED.
Never fix tests by broad grants/disabling RLS. Review advisors without assuming every
notice is a defect or harmless; link rationale/negative tests for intentional cases.

Recovery: applied migrations immutable; forward-fix new migration with tests. Production
rollback/schema restore requires explicit target approval and verified backup/isolated
restore/RPO/RTO. Frontend rollback alone doesn't undo DB changes or queues.
