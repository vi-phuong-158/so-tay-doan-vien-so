# Runtime acceptance / deploy / rollback

1. Inspect exact candidate CI + Vercel Preview deployment status/source SHA. Use verified
   Preview URL, not mutable production alias; confirm which Supabase/Member API it targets.
2. Confirm non-production target, safe authorized synthetic account/roles/orgs and
   cleanup contract. Missing protected Preview access/test actor/Member endpoint BLOCKED
   when relevant. Never disable protection/RLS/CSP to gain access.
3. Choose changed critical flow(s) from PROJECT; test expected and denial paths through
   real browser → API → DB. Record SHA/deployment/UTC, target, expected/observed,
   screenshot/HTTP/SQL evidence sanitized; UI source/mock tests do not substitute.
4. Verify fixture cleanup by exact IDs/ownership. Report missing cleanup as blocker.

Journey examples: public list/detail/login; private report upload/submit/history/resubmit/
review and cross-org denial; private signed file/expiry/export; admin content/evidence/
AI no-private-citation; quiz key/owner/expiry; Member JWT denial/scope/CRUD/import/audit.

Existing harness caveats:
- phase5 runtime command creates synthetic actors/data and calls paid providers; it needs
  scoped rehearsal credentials and a reviewed cleanup contract, not root verify.
- nq-http-acceptance reflects a historical auth-only assertion; it is not proof of current
  NQ guest behavior. Inspect current task/source before using.
- nq-browser-acceptance currently needs external Playwright path/env and bypasses TLS
  verification; not a portable V1 default or approved security reduction. Use supported
  browser tooling with normal TLS against verified Preview; audit harness in a separate task.
- EMAIL_DELIVERY_MODE=OFF by default; ALLOWLIST sends real mail. Do not invoke queue/cron/
  LIVE/provider/Drive-public-sharing as smoke tests without authorization.

## Release and recovery

Vercel Preview from authorized feature PR is allowed; Production deploy/merge/promotion/
rollback requires explicit approval. Master merge can auto deploy frontend. Backend SQL/
Edge Functions, Member host, secrets and cron are independent rollout steps; green frontend
doesn't update them. Read [deploy](../../../docs/06-deploy.md) and
[Member deployment runbook](../../../docs/phase-5-5/02-member-api-deployment-runbook.md).

Before release: verified exact source/DB parity, gates, target/config metadata (no values),
backup/rehearsed recovery and owner acceptance. [Hosted checklist](../../../docs/phase-5-5/05-hosted-runtime-readiness-checklist.md)
still governs Member provisioning/CORS/CSP/backup; not closed by ECC V1.
Rollback only authorized target to known previous deployment; immutable SQL forward-fix
or explicitly approved restore. Observe smoke/error state and record evidence afterward.
Never mutate Production just to produce acceptance. Report stages separately.
