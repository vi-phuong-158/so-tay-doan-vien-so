# P5.5 Hosted Runtime — Owner Readiness and Acceptance Checklist

Status: PREPARATION ONLY. This checklist does not claim a hosted runtime pass and does not start
Phase 6. Provision real infrastructure and credentials before scheduling the acceptance task.
Current provider-neutral deployment details are in
[`02-member-api-deployment-runbook.md`](./02-member-api-deployment-runbook.md).

## Owner must provide before acceptance

### Mắt Bão application runtime

- [ ] Provision the agreed Node.js 20+ container/runtime for `member-api`.
- [ ] Provide deployment access and the supported build/start procedure.
- [ ] Document restart/redeploy, log access, health monitoring, and rollback to the prior release.
- [ ] Confirm the service can expose the existing `GET /healthz` liveness and `GET /readyz`
  database-readiness endpoints over HTTPS.

### PostgreSQL Member database

- [ ] Provision PostgreSQL 16 with TLS and the required `unaccent` and `pg_trgm` extensions.
- [ ] Create a least-privilege runtime database user and provide `MEMBER_DATABASE_URL` through the
  host's secret store only.
- [ ] Agree on the forward-only migration operator/procedure and verify schema parity through the
  latest checked-in migration.
- [ ] Name a protected backup destination, retention policy, restore operator, and isolated restore
  target. No production records may be used as test fixtures.

### DNS, HTTPS, and frontend wiring

- [ ] Choose a stable Member API hostname and a production frontend origin; issue/verify the TLS
  certificate before routing traffic.
- [ ] Set server-side `CORS_ALLOWED_ORIGIN` to the exact frontend origin, without wildcard or
  trailing slash.
- [ ] Set Vercel `VITE_MEMBER_API_URL` to the real HTTPS API origin and include that exact API host
  in `vercel.json` CSP `connect-src`; redeploy the frontend after both are reviewed.

### Server-side configuration and secrets

- [ ] Provide `SUPABASE_URL` and the required publishable/anon configuration for the Member API.
- [ ] Provide `MEMBER_SCOPE_RESOLVER_URL` and a newly generated
  `MEMBER_SCOPE_RESOLVER_SECRET` that matches the server-side resolver configuration.
- [ ] Put `MEMBER_DATABASE_URL` and resolver secret only in the host's protected server-side secret
  store. Do not put database credentials, service-role keys, or resolver secrets in `VITE_*`, source,
  logs, or handoff evidence.
- [ ] Give the acceptance operator authorized synthetic accounts/roles in at least two test
  organizations; agree on cleanup IDs and owner for cleanup verification.

## Acceptance matrix for `P5.5_HOSTED_RUNTIME_FINAL_ACCEPTANCE`

Run every row against the provisioned rehearsal/hosted environment, record timestamps and safe
evidence, and mark each gate PASS, FAIL, or BLOCKED. Do not use a fake host, mocked service, or
production data to satisfy a runtime gate.

### A. Member API infrastructure

- [ ] HTTPS certificate/hostname validates.
- [ ] `/healthz` returns liveness success; `/readyz` succeeds only with the database reachable.
- [ ] Database connectivity and migration parity are verified.
- [ ] Browser bundle and logs contain no server secrets.

### B. Authentication and authorization

- [ ] Missing JWT returns 401.
- [ ] Invalid/expired JWT returns 401.
- [ ] Authenticated user with the wrong role returns 403.
- [ ] Correct role and organization scope allows only the permitted operation.

### C. Organization isolation

- [ ] Create/use synthetic users A and B in two distinct organizations.
- [ ] User A cannot read, update, or infer Member B outside A's organization scope.
- [ ] Repeat denial checks for detail, list/search/filter, audit, and import paths where applicable.

### D. Member CRUD and audit

- [ ] List, search, filter, detail, create, and update work for authorized roles.
- [ ] Required-field, invalid-value, duplicate, and organization-scope validation fail safely.
- [ ] Audit history records the expected actor and changes without leaking unrelated fields.

### E. Excel import

- [ ] Preview validates supported workbook shape and reports row-level errors.
- [ ] Duplicate handling and confirm behavior match the documented contract.
- [ ] Retry is idempotent; failure/rollback leaves no partial untracked import.
- [ ] Audit records the import actor and outcome.

### F. Authenticated browser journeys

- [ ] Login, reload/session restore, logout, profile, notifications, and change password.
- [ ] Work/report list, upload, submit, resubmit, history, and authorized review.
- [ ] Quiz start, answer, submit, and result without exposing answer keys before submit.
- [ ] Member list/detail/create/update, Excel import, audit, and authorized Admin journeys.
- [ ] Innovation submission only if a separately authorized task includes it; it is outside UI closure.

### G. CORS and CSP

- [ ] Exact production frontend origin passes preflight and allowed requests.
- [ ] A wrong origin is rejected and receives no allow-origin response.
- [ ] Browser CSP permits only the selected Member API origin in `connect-src`.
- [ ] Rebuilt Vercel deployment uses the expected `VITE_MEMBER_API_URL` and CSP policy.

### H. Backup and restore

- [ ] Create a backup artifact and verify its integrity and protected destination.
- [ ] Restore to an isolated database, not over production.
- [ ] Verify schema, rows, extensions, indexes, and required functions after restore.
- [ ] Record backup/restore duration and operator; clean up the isolated restore target if required.

## Exit rule

The hosted runtime task may report a full PASS only when infrastructure, authz, organization
isolation, CRUD/import, browser journeys, CORS/CSP, and backup/restore gates have real evidence.
Until then keep `PHASE_5_5_END_TO_END_ACCEPTANCE_BLOCKED_MATBAO_RUNTIME_NOT_PROVISIONED` and do not
start Phase 6.
