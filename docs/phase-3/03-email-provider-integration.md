# P3-03 - Email Provider Integration & Safe Template Rendering

## Status

`PASS` after controlled live rehearsal acceptance in the dedicated Supabase rehearsal
project. Technical and live-send acceptance are complete; this branch does not deploy
production.

Baseline is P3-02 final acceptance HEAD `f3afaeb`, stacked because P3-02 Draft PR #13
was not merged when this task started. Branch: `feat/phase-3c-email-provider`.

## Provider decision

Selected provider: Resend REST API. The existing code already referenced Resend/Brevo,
but P3-03 chooses one adapter to keep behavior and failure mapping centralized. Resend
provides an HTTPS REST endpoint, a provider message ID, documented sender format, a
required `User-Agent` for direct API calls, and `Idempotency-Key` support on `POST /emails`.
References: [Resend API introduction](https://resend.com/docs/api-reference/introduction),
[send email API](https://resend.com/docs/api-reference/emails/send-email),
[idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys), and
[errors](https://www.resend.com/docs/api-reference/errors).

The adapter uses direct `fetch` rather than a provider SDK so the Edge Function has a
small, auditable dependency surface. It does not use SMTP, attachments, Reply-To, CC,
BCC, provider webhooks or delivery tracking in P3-03.

## Secrets and sender

Provider configuration is server-only: `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM_ADDRESS`,
`EMAIL_FROM_NAME`, `EMAIL_PROVIDER_BASE_URL`, `EMAIL_PROVIDER_TIMEOUT_MS`, `CRON_SECRET`
and `SUPABASE_SERVICE_ROLE_KEY`. Only names are in `.env.example`; no values are tracked,
logged, returned in worker JSON, or exposed through `VITE_*`.

The sender address and display name are trusted environment configuration. Queue payloads
cannot choose `From`, arbitrary headers, Reply-To or additional recipients. The verified
rehearsal sender was accepted by Resend with HTTP 200; secret values remain server-only.

## Safe renderer

Only `SYSTEM_EMAIL_TEST` is allowlisted. The renderer accepts structured payload fields
(`title`, `message`, optional `recipientName`, optional app-relative `action_path`) and
returns subject, plain text and HTML. It escapes `&`, `<`, `>`, `"` and `'`, bounds fields,
rejects malformed payloads, removes CR/LF and header-like tokens from subject text, and
builds links only from trusted `APP_URL` plus an internal path. Full external URLs,
`javascript:`, `data:`, protocol-relative paths and backslashes are rejected.

Reminder/cron and production deployment remain deferred to later work. P3-04 adds the report event
templates on top of this shared renderer and queue boundary.
No signed Storage URL or attachment is included.

## Worker flow

`process-email-queue` requires an exact configured `x-cron-secret` value and rejects
missing/mismatched invocation before constructing the service-role client. It claims only
through `claim_email_queue`; it never selects pending rows directly. The worker keeps the
P3-02 batch/lease bounds, renders each row, sends through the Resend adapter, and completes
or retries with the current claim token. It returns counts only, never provider payloads.

Malformed queue/template data is permanent `FAILED`. Provider failures are classified once
in the adapter; queue retry timing remains P3-02's responsibility.

## Failure semantics

| Provider result | Queue result | Classification |
|---|---|---|
| 2xx with message ID | `SENT` | accepted; provider ID/code logged |
| timeout/network | `RETRY` | transient/unknown; bounded queue backoff |
| 429 | `RETRY` | rate limited |
| 5xx | `RETRY` | provider temporary failure |
| concurrent idempotent request | `RETRY` | safe to retry later |
| invalid recipient/from/4xx validation | `FAILED` | permanent |
| malformed 2xx response | `RETRY` | provider response ambiguity |
| malformed template/action path | `FAILED` | local permanent error |

Provider errors are reduced to bounded code/message values; response bodies are never
stored or returned wholesale. Database sanitization remains the final boundary.

## Idempotency and exactly-once limitation

Queue identity remains P3-02's computed idempotency key. The provider idempotency key is
stable across retries: `email:{queue_id}`. Resend documents a 24-hour idempotency-key
retention window; after that, an ambiguous timeout can still produce duplicate physical
delivery. The system guarantees one logical queue row, one active claim, stale-owner
protection and bounded retry, not exactly-once physical delivery.

## Tests and rehearsal

Deterministic Deno tests cover Resend success/message ID, stable idempotency header, 429,
5xx, permanent 4xx, timeout/network classification, malformed response, secret-bearing
errors, template escaping, external-link rejection, subject injection, worker claim-only
flow, SENT/RETRY/FAILED mapping and malformed payload handling. pgTAP preserves P3-02
queue ownership/terminal state and checks provider metadata bounds and RPC privileges.

CI passed the migration reset, 14 pgTAP files / 292 assertions (279 P3-02 baseline plus 13
P3-03 assertions), Deno check/tests (30 passed) and frontend gates in run `31498548925`. No
live provider request is executed by CI. The controlled rehearsal was completed in Supabase
project `znexculhbdjiflkczpyu` using a server-only provider secret and controlled test inbox.
The normal event reached `SENT` at attempt 1 with Resend `HTTP_200`, a provider message ID,
cleared claim state and confirmed inbox receipt. A second worker invocation claimed and sent
nothing. A separate safe-render fixture also reached `SENT`; renderer tests passed 4/4 and
the XSS payload was escaped. The initial invalid `/` fixture remains FAILED as fail-closed
evidence.

## Known limitations and deferred work

- Report notification email hooks are implemented separately by P3-04.
- No reminder/deadline/overdue engine or cron (P3-05/P3-06).
- No provider webhook, delivery/read tracking or admin email dashboard.
- No attachments or signed Storage URLs.
- No production deployment.

## Live Rehearsal Acceptance (P3-03R)

The completed P3-03R acceptance is recorded in
[03r-live-email-rehearsal.md](03r-live-email-rehearsal.md) with status `PASS` and verdict
`P3_03_FULL_ACCEPTANCE_PASS`. The rehearsal used project `znexculhbdjiflkczpyu`, did not
use production, confirmed provider acceptance and controlled inbox receipt, and retained
the invalid `/` fixture as terminal fail-closed evidence.

## Next recommended task

The next recommended task is **P3-04 - Report Event Email Hooks**. It is not part of this
acceptance and must not be started automatically.
