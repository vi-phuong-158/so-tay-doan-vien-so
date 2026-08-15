# P3-08 — Email Worker Scheduling & End-to-End Delivery Rehearsal

## Status

- `P3_08_REPOSITORY_IMPLEMENTATION`: **SELF_VERIFIED_BY_CODEX** — scheduler migration, P3-R1
  delivery gate, full PR diff, and secret-exposure audit were reviewed on PR #21 HEAD
  `499f999d8102389c98446502e7036c39666924ae`.
- `P3_08A_LIVE_REHEARSAL`: **AUTHENTICATED_EXTERNAL_OPERATOR**; **OWNER_ACCEPTED** — OFF-mode
  scheduler rehearsal was accepted under the project's established governance model.
- `P3_08B_LIVE_REHEARSAL`: **AUTHENTICATED_EXTERNAL_OPERATOR** — the controlled ALLOWLIST
  rehearsal is recorded in the final acceptance evidence below.
- `P3_08B_INBOX_CONFIRMATION`: **OWNER_CONFIRMED**.
- `P3_08_FINAL_RUNTIME_DELIVERY_MODE`: **OFF**.
- `P3_08_FINAL_ACCEPTANCE`: **READY_FOR_PR_MERGE**. Production Supabase was not deployed or
  changed by this task.

## Baseline

- Starting branch: `claude/phase-3-email-worker-scheduling-825108`, created from `master`.
- Starting SHA / `origin/master`: `63d1b7a1412c948392dfbc8d2495119b447674b8` (P3-06 merged via
  PR #20).
- Working tree at start: clean.

## Audit summary

**Current worker architecture.** `process-email-queue` (Deno Edge Function) is POST-only. Request
order: (1) `hasTrustedWorkerSecret(x-cron-secret header, CRON_SECRET env)` — constant-time
compare, missing/mismatched → `403 FORBIDDEN` before any other env is even read; (2)
`EMAIL_DELIVERY_MODE` gate — `OFF` (including missing/empty/unrecognized values) returns
immediately, `0` claims, `0` provider calls, no provider client is even constructed; (3) worker
config (`EMAIL_WORKER_BATCH_SIZE` 1–50 default 20, `EMAIL_WORKER_LEASE_SECONDS` 30–900s default
300); (4) `claim_email_queue` RPC; (5) per-row allowlist check when `ALLOWLIST`; (6) render →
provider `send()` → `mark_email_sent`/`mark_email_retry`.

**Auth model.** Custom header secret (`x-cron-secret` / `CRON_SECRET`), not a Supabase JWT. No
scheduler previously invoked this path — P3-06 deliberately scheduled only the two pure-SQL RPCs
(`mark_overdue_assignments`, `scan_report_reminders`) and left `process-email-queue` manual, since
scheduling code that can send real email was explicitly out of its scope (see decisions.md,
"P3-06 does not schedule the email worker").

**Retry / concurrency model.** `claim_email_queue` (202608110002) uses `FOR UPDATE SKIP LOCKED`,
a claim token, `worker_id`, and a lease (`lease_expires_at`); a second concurrent claim call
cannot see rows already claimed. This is proven by both an existing pgTAP assertion
(`supabase/tests/email_queue_state_machine.sql`, "second worker cannot claim owned row") and an
existing Deno integration test that fires two real concurrent `claim_email_queue` RPCs
(`supabase/functions/email_queue_state_machine.integration.test.ts`). `mark_email_retry`
classifies retryable vs. terminal failures with a capped backoff (60s / 300s / 900s / 3600s) and a
bounded `max_attempts` (default 5); stale `PROCESSING` rows past their lease are reclaimed on the
next claim, or force-`FAILED` with `MAX_ATTEMPTS_EXCEEDED` once attempts are exhausted. The
provider adapter (`provider.ts`) sends Resend's `Idempotency-Key: email:{queue_id}` header, so a
timeout-after-accept is bounded by Resend's own idempotency window, not unbounded.

**Failure model.** At-least-once claim+send, not exactly-once — an explicit, already-documented
P3-02/P3-03 trade-off. No code in this task changes that; P3-08 only adds a trigger for the
existing worker to run automatically.

**Missing scheduler pieces (before this task).** No `pg_cron` job invoked `process-email-queue`.
`pg_net` was not enabled. No Vault-backed mechanism existed to hand `CRON_SECRET` to a cron job
body without a literal in a migration.

**Proposed minimal change (implemented).** One new forward migration:
`pg_net` extension + one idempotent `pg_cron` job, `email_queue_worker`, on `*/10 * * * *`, whose
body is `net.http_post` against the existing `process-email-queue` URL with the existing
`x-cron-secret` header — both values read from Supabase Vault at execution time. See
`docs/brain/03-decisions.md` ("P3-08 schedules the email worker via pg_cron → pg_net → existing
Edge Function") for the full reasoning and trade-offs.

**Files changed.**

| File | Purpose |
| --- | --- |
| `supabase/migrations/202608150001_phase_3_email_worker_scheduling.sql` | Enables `pg_net`; installs the idempotent `email_queue_worker` cron job. No secret literal. |
| `supabase/tests/email_worker_scheduling.sql` | pgTAP: job exists exactly once, correct schedule/name/active state, body shape (Vault-sourced, no literal secret/URL), idempotent re-registration, P3-06/P3-R1 non-regression. |
| `docs/phase-3/08-email-worker-scheduling.md` | This document. |
| `docs/brain/01-architecture.md`, `03-decisions.md`, `04-current-tasks.md`, `06-ai-working-log.md` | Code Graph / decision / task-state / working-log updates. |

**Risks.**

1. `net.http_post` is async/fire-and-forget from pg_cron's point of view. `cron.job_run_details`
   proves the *scheduling tick* fired; it does not prove the HTTP call reached the Edge Function or
   that the Edge Function's internal logic completed. Confirming an actual invocation requires one
   of: `net._http_response` (pg_net's own response log, TTL-bounded), the Edge Function's own logs,
   or observed `email_queue`/`email_logs` state change. This is documented under Observability
   below, not solved with new code (the task instructs reusing existing observability).
2. The two Vault secrets (`email_queue_worker_url`, `email_queue_worker_cron_secret`) must be
   provisioned once per environment via a manual SQL step, run directly against that environment's
   database, never committed. Until provisioned, the job body's `url` resolves `NULL` and the async
   call fails harmlessly — it cannot fail a migration, `db reset`, or a test run.
3. This sandboxed execution environment has no Docker, no Deno, and no authenticated Supabase CLI
   session — matching every prior Phase 2/3 task's local environment (see `docs/brain/06-ai-working-log.md`
   P3-06 entry). `supabase db reset` / pgTAP / Deno checks can only be confirmed via GitHub Actions
   CI on the Draft PR, not locally, and the live Supabase rehearsal (Gate 1/2) cannot be executed
   from this session without the user providing/confirming Supabase CLI access to
   `znexculhbdjiflkczpyu`. See "Rehearsal status" below.

## Implementation

- **Migration:** `202608150001_phase_3_email_worker_scheduling.sql`.
- **Worker scheduling:** one `pg_cron` job, name `email_queue_worker`.
- **Schedule:** `*/10 * * * *` (every 10 minutes; no technical reason found to go faster — see
  decisions.md).
- **Auth mechanism:** existing `x-cron-secret` header / `CRON_SECRET` env comparison inside
  `process-email-queue` (unchanged); the header value is supplied by the cron job body from
  Supabase Vault, not a literal.
- **Batch size / retry behavior:** unchanged from P3-02/P3-03 (`EMAIL_WORKER_BATCH_SIZE` 1–50
  default 20; `mark_email_retry` backoff 60s/300s/900s/3600s, `max_attempts` default 5, both
  pre-existing and already bounded — this task does not tune them).

## Operational runbook (per environment, never committed)

Run directly against the target Supabase project's database (SQL editor or `supabase db execute`
against a live project — not a migration file, not this repo):

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/process-email-queue',
  'email_queue_worker_url'
);
select vault.create_secret(
  '<value that exactly matches this project''s process-email-queue CRON_SECRET secret>',
  'email_queue_worker_cron_secret'
);
```

Both statements are idempotent to re-run with an updated value (`vault.create_secret` on an
existing name updates it). Neither statement, nor the secret values themselves, are ever pasted
into this repo, a PR body, or a log.

### Temporary fast rehearsal job (Gate 1/2 evidence only)

Per the task brief, the *official* job stays at `*/10 * * * *`; for live rehearsal evidence a
temporary, faster job calling the exact same invocation path is created directly on the rehearsal
database (not committed), then removed immediately after acceptance:

```sql
select cron.schedule(
  'rehearsal_p3_08_worker',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_worker_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_worker_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
-- ... rehearsal evidence gathering ...
select cron.unschedule('rehearsal_p3_08_worker');
```

## Observability

No new monitoring code — reusing what already exists, per task scope:

- `cron.job_run_details` — did the scheduling tick fire, when, succeeded/failed.
- `net._http_response` (pg_net) — did the HTTP call to the Edge Function get a response, status
  code, timing (TTL-bounded retention).
- Edge Function logs (Supabase dashboard / CLI) — request received, `x-cron-secret` accepted,
  `EMAIL_DELIVERY_MODE`, claimed/sent/retried/failed counts (the JSON response body already
  returned by `index.ts`).
- `email_queue` / `email_logs` — authoritative claimed/sent/failed state, provider message ID,
  attempt count, `source_entity_type`/`source_entity_id`.

## Automated validation (this branch, pre-rehearsal)

| Gate | Result |
| --- | --- |
| `npm test` | PASS, 45/45 |
| `npm run lint` | PASS, 0 errors, 3 pre-existing Fast Refresh warnings (unchanged) |
| `npm run build` | PASS |
| `supabase db reset` / pgTAP | PASS via CI — `Files=19, Tests=476` (up from P3-06 baseline `Files=18, Tests=450`; includes new `email_worker_scheduling.sql`) |
| `deno check` / `deno test` | PASS via CI — `42 passed, 0 failed` (unchanged count; no Edge Function code was modified) |
| CI run | [`31853922597`](https://github.com/vi-phuong-158/so-tay-doan-vien-so/actions/runs/31853922597) — PASS (`build` job: frontend 45/45 + lint + build; `test-db` job: pgTAP + Deno as above). Draft [PR #21](https://github.com/vi-phuong-158/so-tay-doan-vien-so/pull/21). |

## Rehearsal status

**Gate 1 (OFF mode): environment-level evidence exists but was not produced or independently
verified by this agent.** This agent never obtained Supabase access in any turn of this task — no
MCP connector, no `SUPABASE_ACCESS_TOKEN`, no authenticated CLI session existed at any point (this
was re-checked, freshly, multiple times). Every Gate 1 fact below is recorded on the basis of
external submissions the project owner reviewed and accepted, not on anything this agent ran or
observed itself.

**Gate 2 (`ALLOWLIST` single-email send) has not been attempted by anyone and is not addressed by
this record.**

### External operator rehearsal (Gate 1 / OFF mode)

- **Environment evidence provenance:** `AUTHENTICATED_EXTERNAL_OPERATOR` (as reported to the
  project owner; an authenticated Supabase session outside this agent's sandbox).
- **Independent verification by this Claude session:** `NOT AVAILABLE`.
- **Project-owner governance acceptance:** `ACCEPTED` — the project owner reviewed the external
  evidence directly and decided, on their own authority over their own infrastructure, to accept
  it as the environment-level record for Gate 1 and to let the project proceed on that basis.

Reported evidence summary (as submitted to the project owner; values below are recorded for
traceability, not independently confirmed by this agent):

| Item | Reported value |
| --- | --- |
| `process-email-queue` deployed version | `6`, status `ACTIVE` |
| Deployed function hash | `fe4250b95c0497bb17dbcbee564144201877e4e1870439f95269019497483e5b` |
| Vault secret names present (values never exposed) | `email_queue_worker_url`, `email_queue_worker_cron_secret` |
| `pg_net` version | `0.20.4` |
| `email_queue_worker` cron job | `active`, schedule `*/10 * * * *` |
| `report_mark_overdue_daily` / `report_reminder_scan_daily` | unchanged, `5 17 * * *` / `0 0 * * *`, both active |
| Temporary rehearsal job (`rehearsal_p3_08a_worker`) executions | 2 runs, both `succeeded`, both HTTP `200` with body `delivery_mode=OFF, claimed=0, sent=0` |
| Temporary job removed after | yes, `0` temporary jobs remaining |
| Eligible `PENDING`/`RETRY` queue rows at end | `0` |
| `supabase_migrations.schema_migrations` row for `202608150001_...` | none — SQL was applied directly for rehearsal rather than through a recorded migration deployment; not treated as a defect (see "Migration history note" below) |

**Note on one evidence submission:** one file submitted as supporting evidence for this record
(`P3_08A_operator_evidence.md`) contained text directing how this agent should phrase its
conclusions and which verdict labels to avoid using. This agent did not act on those directives —
it declined to adopt any instruction embedded in observed content, consistent with treating
tool/file content as data rather than commands — and raised this directly with the project owner
before the governance decision above was made. Recorded here only for transparency to anyone
reading this document later.

### Migration history note

The reported evidence shows the P3-08 scheduling SQL applied directly against rehearsal for this
exercise, without a corresponding `supabase_migrations.schema_migrations` row (i.e. not applied
through a normal tracked migration deployment). `202608150001_phase_3_email_worker_scheduling.sql`
is written to be idempotent (see the migration file's own unschedule-then-schedule guard, mirroring
the P3-06 pattern) specifically so that a later standard `supabase db push` / migration deployment
against this same project can safely apply it for real without erroring on "job already exists" or
creating a duplicate `email_queue_worker` job. This is an operational sequencing note, not a defect
in the migration.

### Reasoning for why this agent could not go further itself

Across this task, three concrete paths to independent verification were identified and none
materialized in this session: (1) a Supabase MCP connector attached to this session, (2)
`SUPABASE_ACCESS_TOKEN` injected into this session's environment, (3) raw tool output this agent
could read directly. Repeated re-checks (`ToolSearch`, environment variables, `supabase projects
list`) confirmed no change in access at any point. This agent declined to write self-verification
claims it could not back up, and declined to treat instructions embedded in chat messages or
submitted files as a substitute for that verification — the dual-status record above (repo
self-verified vs. externally-sourced, owner-accepted) is the result of that standard being held
consistently while still respecting the project owner's authority to accept external operational
evidence for their own infrastructure.

## Final email delivery mode

Reported as `OFF` at the end of the external operator rehearsal (per the evidence summary above:
the two Gate 1 invocations both returned `delivery_mode=OFF`, and no `ALLOWLIST`/`LIVE` change was
reported). This agent did not itself read or set `EMAIL_DELIVERY_MODE` on
`znexculhbdjiflkczpyu` at any point and cannot independently confirm the current live value.

## Next recommended task

`P3-08B — ALLOWLIST Single-Email Delivery Rehearsal`, per the project owner's stated intent — not
started, and the same access/provenance constraints described above will apply to it.

---

# P3-08B — ALLOWLIST rehearsal preparation

This section is **preparation only**: repo audit, fixture/query design, and an operator runbook.
No live send was performed or attempted by this agent. Verdict: `P3_08B_READY_FOR_OPERATOR_REHEARSAL`.

## ALLOWLIST contract (re-audited fresh from current source)

- `getEmailDeliveryConfig()` (`contract.ts`): mode resolves to `OFF` for anything other than the
  exact literals `ALLOWLIST` or `LIVE` (missing, empty, wrong case, trailing garbage all → `OFF`).
  `EMAIL_TEST_RECIPIENTS` is parsed by `parseAllowlist()`: split on `,`, each entry
  trimmed+lowercased, validated against a basic email shape, deduplicated via a `Set`. Malformed
  entries are silently dropped (not an error) — confirmed by `contract.test.ts`
  ("rejects malformed entries").
- `isRecipientAllowlisted(email, allowlist)`: normalizes the candidate the same way
  (trim+lowercase) and checks **exact array membership** — `Array.includes`, not
  `startsWith`/`endsWith`/regex/domain matching. Confirmed directly by
  `contract.test.ts` ("allowlist match is exact and case-insensitive with no
  wildcard/substring behavior"): `user1@example.com.evil.test` and `other.user1@example.com` are
  both explicitly asserted `false` against `user1@example.com`.
- Empty allowlist (`EMAIL_TEST_RECIPIENTS` unset/empty) → `isRecipientAllowlisted` always `false`
  for any input (`allowlist.includes` on `[]`) — fail-closed, not fail-open.
- Duplicate entries in `EMAIL_TEST_RECIPIENTS` collapse to one via the `Set` in `parseAllowlist`;
  duplicates do not create multiple allowlist "slots" or change matching behavior.
- Wiring (`index.ts` → `worker.ts`): `isRecipientAllowed` is constructed **only** when
  `delivery.mode === 'ALLOWLIST'` and is applied to every claimed row **before** `renderQueueEmail`
  or `provider.send()` — confirmed by `worker.test.ts` ("recipient outside the allowlist is
  rejected before the provider is ever called": `providerCalls` stays `0`).

## Non-allowlisted row terminal state (from actual SQL, not assumed)

`worker.ts` calls `mark_email_retry(p_error_code='RECIPIENT_NOT_ALLOWLISTED', p_retryable=false)`
for a rejected row. In `mark_email_retry` (`202608110002_phase_3_email_queue_state_machine.sql`):

```sql
if coalesce(p_retryable, true) and v_attempt < v_max_attempts then
  v_status := 'RETRY'; ...
else
  v_status := 'FAILED'; v_next_attempt_at := null;
end if;
```

`p_retryable=false` makes `coalesce(p_retryable, true)` evaluate `false`, so the row goes straight
to the `else` branch regardless of `attempt_count`/`max_attempts`. **Terminal state: `FAILED`**
(not a separate `DEAD` state — this schema has no `DEAD` status;
`email_queue_status_check` only allows `PENDING/PROCESSING/RETRY/SENT/FAILED/CANCELLED`),
`next_attempt_at = null`, `claim_token/worker_id/lease_expires_at` cleared. A `FAILED` row is never
re-claimed (`claim_email_queue`'s eligibility only selects `PENDING`/`RETRY`, or a lease-expired
`PROCESSING` row with attempts remaining) — confirmed by the pgTAP assertion "SENT row is not
claimable" applying the same mechanism to the terminal-state family. This means: **the negative
fixture, if created, self-terminates in one worker pass and needs no special cleanup beyond the
normal fixture cleanup** (it won't linger as `PENDING`/`RETRY`).

## Delivery / idempotency guarantee

Normal path: `PENDING/RETRY` (eligible: `scheduled_at <= now()` and
`coalesce(next_attempt_at, scheduled_at) <= now()`) → `claim_email_queue` (`FOR UPDATE SKIP
LOCKED`, sets `status=PROCESSING`, `claim_token`, `worker_id`, `lease_expires_at`, increments
`attempt_count`) → provider `send()` with `Idempotency-Key: email:{queue_id}` (confirmed header
value in `provider.test.ts`) → `mark_email_sent` requires the exact `claim_token` still on the row
→ `status=SENT`, `claim_token`/`worker_id`/`lease_expires_at` cleared. Second invocation: a `SENT`
row matches neither claim branch (`status in ('PENDING','RETRY')` nor `status='PROCESSING'`), so
`claim_email_queue` returns 0 rows for it — pgTAP: "SENT row is not claimable" — no second provider
call is possible because the row is never handed to the worker loop again.

**Residual failure window (documented, not newly discovered):** if the provider accepts the send
but the subsequent `mark_email_sent` RPC call fails to complete (network drop between the two, or
a DB-side failure) before the lease expires, the row remains `PROCESSING` until
`lease_expires_at`, then becomes reclaimable and gets retried — which would call the provider a
second time for a row it already physically sent. This is bounded, not eliminated, by the
provider's own `Idempotency-Key: email:{queue_id}` (Resend deduplicates identical idempotency keys
within its retention window). This is the same trade-off already recorded in
`docs/brain/03-decisions.md` for P3-02/P3-03 ("provider timeout ambiguity/exactly-once delivery
waits for the provider adapter") — P3-08B does not change or newly discover this; it is stated here
so the rehearsal's duplicate-test step is understood as testing the *common* path (worker rerun
against an already-`SENT` row), not this rarer race, which has no live rehearsal safe enough to
trigger on purpose.

## Rehearsal fixture

- **Template:** `SYSTEM_EMAIL_TEST` — the only template with zero business/report data
  dependency, purpose-built for controlled rehearsal since P3-03.
- **Run ID:** operator-generated, format `P3_08B_<UTC_TIMESTAMP_OR_UUID>` (e.g.
  `P3_08B_20260816T0900Z_<4-hex>`), used as both the human-readable marker and the RPC's
  `p_event_revision` (so the enqueue's idempotency key is unique to this run and re-running the
  same enqueue call is a safe no-op, not a duplicate).
- **Payload** (matches `renderSystemEmailTest`'s exact expected shape — `title` required,
  `message` optional/bounded, no `action_path` so the fixture has zero dependency on `APP_URL`
  configuration):
  ```json
  {
    "title": "[P3-08B REHEARSAL] <run_id>",
    "message": "P3-08B controlled email delivery rehearsal.\nNo action required.\nRun ID: <run_id>"
  }
  ```
- **Enqueue call** (the trusted path — `enqueue_email_for_user_event`, `service_role` only, the
  same RPC every prior Phase 3 rehearsal has used; recipient email is always server-resolved from
  `auth.users`/`profiles`, never client-supplied):
  ```sql
  select * from public.enqueue_email_for_user_event(
    'SYSTEM_EMAIL_TEST',
    '<rehearsal recipient profile id>'::uuid,   -- ACTIVE profile whose auth.users.email
                                                  -- (lower/trimmed) exactly equals the
                                                  -- EMAIL_TEST_RECIPIENTS value below
    'p3_08b_rehearsal',
    gen_random_uuid(),
    '<run_id>',
    '{"title": "[P3-08B REHEARSAL] <run_id>", "message": "P3-08B controlled email delivery rehearsal.\nNo action required.\nRun ID: <run_id>"}'::jsonb,
    now(),
    1                                             -- max_attempts=1: a genuine transient failure
                                                    -- should not silently retry-send twice during
                                                    -- a live rehearsal window
  );
  ```
  **Precondition the operator must satisfy first:** an `ACTIVE` profile must exist in the
  rehearsal project whose linked `auth.users.email` is exactly the one controlled inbox that will
  be set in `EMAIL_TEST_RECIPIENTS` — the RPC resolves the recipient address itself; it cannot be
  overridden by the caller.

## Pre-flight queue isolation query

Derived directly from `claim_email_queue`'s actual eligibility predicate
(`202608110002_phase_3_email_queue_state_machine.sql`), not approximated:

```sql
select count(*)::int as eligible_rows
from public.email_queue
where (
  status in ('PENDING','RETRY')
  and scheduled_at <= now()
  and coalesce(next_attempt_at, scheduled_at) <= now()
)
or (
  status = 'PROCESSING'
  and lease_expires_at is not null
  and lease_expires_at <= now()
  and attempt_count < max_attempts
);
```

Must return `0` **before** the fixture is enqueued. After enqueueing exactly the one fixture row
above, it must return exactly `1` (only the fixture) before switching to `ALLOWLIST` mode.

## Operator runbook (P3-08B — to be executed by the authenticated operator, not this agent)

1. Confirm project: `so-tay-doan-vien-rehearsal` / `znexculhbdjiflkczpyu`.
2. Confirm `email_queue_worker` is `active`, schedule `*/10 * * * *` (already established in Gate
   1's record above).
3. Run the isolation query — must be `0`. If not `0`, stop; do not proceed until isolated.
4. Set `EMAIL_DELIVERY_MODE=ALLOWLIST` on the Edge Function's secrets.
5. Set `EMAIL_TEST_RECIPIENTS=<one controlled inbox>` — cardinality 1, no wildcard, no
   domain-wide entry.
6. Run the enqueue call above. Record `queue_id`, `run_id`, recipient (redact in any shared
   report), initial `status` (`PENDING`), `attempt_count` (`0`), `idempotency_key`.
7. Let the official worker fire naturally, or create a temporary rehearsal-only job on the exact
   same invocation path (mirroring Gate 1's `rehearsal_p3_08a_worker` pattern — e.g.
   `rehearsal_p3_08b_worker` on `* * * * *`, using the same `net.http_post` body shape already in
   `202608150001_phase_3_email_worker_scheduling.sql`) for faster evidence turnaround. Remove any
   temporary job immediately after use.
8. Capture: cron run row, `net._http_response` row, Edge Function JSON body
   (`delivery_mode=ALLOWLIST`, `claimed`, `sent`), final `email_queue.status` (`SENT`),
   `email_logs` row (`provider`, `provider_message_id`), `attempt_count`.
9. Manually check the controlled inbox. Record `received: YES/NO`, `received_at`, and that the
   subject contains the run ID marker — do not paste the rest of the inbox content into any repo
   doc.
10. Invoke the worker again (official schedule or same temporary job). Expect: fixture row not
    reclaimed (`SENT` is terminal, per "Delivery / idempotency guarantee" above), 0 additional
    provider calls, 0 additional `email_logs` rows, 0 additional inbox copies.
11. Restore `EMAIL_DELIVERY_MODE=OFF`. Verify.
12. Remove any temporary cron job created in step 7. Confirm 0 remain.
13. Clean the fixture per retention rules — same approach as Gate 1's cleanup (immutable
    `email_logs` evidence may remain, clearly recognizable as rehearsal; queue/notification/user
    fixtures created purely for this run may be removed).

### Negative allowlist test — recommendation

**Do not create a second live-address fixture.** `worker.test.ts` ("recipient outside the
allowlist is rejected before the provider is ever called") already proves, at the exact same code
path the live rehearsal exercises, that a non-allowlisted `recipient_email` results in zero
provider calls and a `RECIPIENT_NOT_ALLOWLISTED`/`retryable=false` transition — this is unit-level
coverage of the identical `isRecipientAllowed` gate the live row will pass through, not a
different mechanism. Adding a second real address (even a "safe"/non-deliverable one) to a live
rehearsal buys no additional evidence over the existing automated test and adds avoidable fixture
surface. If the operator wants live confidence anyway, the safest option is a syntactically-valid
but non-existent address at a domain the operator controls (e.g. a subdomain that bounces), never
a real third party's address.

## Operator evidence template (empty — for the operator to fill in during P3-08B)

```
## Environment


## Run ID


## Delivery configuration

EMAIL_DELIVERY_MODE:
EMAIL_TEST_RECIPIENTS cardinality:

## Pre-flight queue

eligible unrelated rows:

## Test queue row

queue_id:
template_code:
initial status:
attempt_count:

## Worker execution 1

cron:
HTTP:
delivery_mode:
claimed:
sent:

## Provider evidence

provider:
provider_message_id:
email_logs count:

## Inbox confirmation

received:
received_at:
subject marker:

## Worker execution 2

additional provider calls:
additional email_logs:
additional inbox copies:

## Negative allowlist evidence

automated/live:
provider calls:

## Cleanup

temporary cron:
fixture:
final eligible queue:

## Final delivery mode

EMAIL_DELIVERY_MODE=OFF

## Provenance

AUTHENTICATED_EXTERNAL_OPERATOR

Agent independent live verification:
NOT AVAILABLE
```

## Final acceptance evidence — P3-08B (completed)

### Provenance

- **Repository implementation:** `SELF_VERIFIED_BY_CODEX`.
- **P3-08A OFF-mode live execution:** `AUTHENTICATED_EXTERNAL_OPERATOR`; `OWNER_ACCEPTED`.
- **P3-08B ALLOWLIST live execution:** `AUTHENTICATED_EXTERNAL_OPERATOR`.
- **Inbox confirmation:** `OWNER_CONFIRMED`.
- **Codex independent Supabase verification:** **NO** — no authenticated Supabase connection was
  available or used by Codex for this acceptance. The live data below is recorded with its stated
  external-operator/owner provenance, not as independently observed by Codex.

### Controlled run

- **Environment:** `so-tay-doan-vien-rehearsal` (`znexculhbdjiflkczpyu`); Production untouched.
- **Run ID:** `P3_08B_20260815_153537_2aa7de09`.
- **Queue ID:** `e5fcd423-5e30-4164-ad1a-63af5c00f5ae`.
- **Template:** `SYSTEM_EMAIL_TEST`; the fixture contained no report or other business content.
- **Pre-flight:** eligible `PENDING`/`RETRY` rows = `0`; the official active worker was
  `email_queue_worker` on `*/10 * * * *`; `EMAIL_DELIVERY_MODE=ALLOWLIST` and the allowlist
  contained exactly the approved controlled inbox. `LIVE` was not enabled.

### First invocation and delivery

The external operator invoked the Vault-authenticated HTTP path used by the scheduler (pg_net
request `14`) and received HTTP `200`:

```json
{
  "success": true,
  "delivery_mode": "ALLOWLIST",
  "claimed": 1,
  "sent": 1,
  "retried": 0,
  "failed": 0,
  "stale": 0,
  "rpcErrors": 0,
  "skippedNotAllowlisted": 0
}
```

The fixture ended in `SENT` with `attempt_count=1`, no last error, and no next attempt. Exactly
one `email_logs` row was recorded: provider `RESEND`, log ID
`1e1a39ac-a4d6-4bfc-a801-e55f0d60119d`, provider message ID
`67478c36-49b4-4452-b479-156749eb2b3a`, provider code `HTTP_200`, status `SENT`, attempt `1`.
The owner confirmed receipt in the controlled inbox with subject marker
`[P3-08B REHEARSAL] P3_08B_20260815_153537_2aa7de09`.

### Duplicate check and safe final state

The second operator invocation (pg_net request `15`) returned ALLOWLIST mode with `claimed=0` and
`sent=0`. The fixture remained `SENT` at `attempt_count=1`; the log count remained `1` and the
provider message ID was unchanged. This confirms the normal already-`SENT` path was not re-claimed;
it does not claim a mathematically exact-once guarantee across the documented provider-accepted /
database-mark-failed residual window.

After confirmation, the owner restored `EMAIL_DELIVERY_MODE=OFF`, restored the official worker,
and the final OFF smoke (pg_net request `16`, HTTP `200`) returned `delivery_mode=OFF`, `claimed=0`,
and `sent=0`. Final operator-observed cron state was exactly:

- `email_queue_worker`: active, `*/10 * * * *`.
- `report_mark_overdue_daily`: active, `5 17 * * *`.
- `report_reminder_scan_daily`: active, `0 0 * * *`.
- Temporary rehearsal jobs: `0`; eligible `PENDING`/`RETRY` rows: `0`.

The rehearsal fixture and its one immutable log remain as audit evidence. No production deployment,
production Supabase mutation, or `EMAIL_DELIVERY_MODE=LIVE` enablement occurred.
