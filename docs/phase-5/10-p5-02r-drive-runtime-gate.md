# P5-02R — Google My Drive runtime gate

> **Current verdict:** `P5_02R_RUNTIME_BLOCKED_REHEARSAL_SCHEMA_DRIFT_AND_CRON_CONFIG_MISSING`.
> The live rehearsal was started against the configured non-production Supabase project, but the
> project cannot execute the accepted P5-02 runtime path safely: P5-01 tables required by P5-02 are
> absent, the P5-02 Vault names are absent, and the worker Edge Function is not deployed. No Drive
> request or production deployment was performed.

## Technical contract

`supabase/functions/_shared/storage/contract.ts` defines only the P5-03-needed primitives:
`getMetadata`, `read`, `put`, `delete`. `GoogleDriveStorageProvider` exchanges a backend refresh
token for short-lived access tokens and maps errors without response-body logging:

| Error | Retryable | Meaning |
| --- | --- | --- |
| `AUTH_INVALID` | No | missing, revoked or rejected credentials |
| `SOURCE_NOT_FOUND` | No | deleted/trashed Drive file |
| `PERMISSION_DENIED` | No | Drive rejected the existing narrow grant |
| `RATE_LIMITED` | Yes | Drive HTTP 429 |
| `PROVIDER_UNAVAILABLE` | Yes | timeout/network or Drive 5xx |
| `INVALID_LOCATOR` | No | non-opaque ID/URL/path rejected locally |
| `MALFORMED_RESPONSE` | No | unsafe or incomplete upstream payload |

The P5-02 job queue owns bounded retries (60s, 300s, 900s, then 3600s); the provider does not
hide Drive failures with unbounded retries or a public-link fallback.

`authorizedSourceGateway` is the authorization invariant test seam: it awaits the
`can_access_document`-equivalent **before** it validates or submits `external_file_id` to a
provider. A denied user produces `PERMISSION_DENIED` with provider call count zero. It also rejects
a Google source if `storage_path` is non-null, preserving the P5-02 provider-neutral schema invariant.

## OAuth configuration required from the owner

Google documents `drive.file` as its recommended non-sensitive per-file scope: it permits files
created by the app or explicitly opened/shared with it, not arbitrary My Drive discovery. The provider
and bootstrap request **only**:

```text
https://www.googleapis.com/auth/drive.file
```

In a **separate non-production/rehearsal Google Cloud project**, the account owner must:

1. Enable **Google Drive API**.
2. In **Google Auth Platform → Data Access**, add only `drive.file`; do not add `drive`,
   `drive.readonly`, or `drive.metadata.readonly`.
3. In **Google Auth Platform → Audience**, set the personal-account app to **External** and publish
   it as **In production**. Do not leave it as Testing: Drive authorization refresh tokens issued in
   Testing expire after seven days.
4. Create an OAuth client suitable for this local bootstrap's loopback callback
   `http://127.0.0.1:53682/oauth2/callback`. Do not create/use a service account for My Drive.
5. In a local PowerShell session (not in chat, Git or CI), enter the client ID/secret using prompts
   and run `node scripts/google-drive-oauth-bootstrap.mjs`. The script opens a local callback,
   requests offline access with consent, creates `SO-TAY-DOAN-VIEN-SO/KNOWLEDGE/{SOURCES,REHEARSAL}`
   and writes the refresh token plus root ID to the ignored local file
   `google-drive-oauth-bootstrap.local.json`. It never prints an authorization code, access token,
   refresh token, client secret or full root ID.

The owner must put these four values in **rehearsal Edge Function secrets** only:

```text
GOOGLE_DRIVE_CLIENT_ID
GOOGLE_DRIVE_CLIENT_SECRET
GOOGLE_DRIVE_REFRESH_TOKEN
GOOGLE_DRIVE_ROOT_FOLDER_ID
```

Then delete or move the ignored bootstrap artifact to an approved local secret store. Do **not** send
any of those values, authorization URL code, account email, or full Drive ID in chat/Git/PR/CI output.

## Runtime rehearsal to run after provisioning

1. Instantiate `GoogleDriveStorageProvider` from Edge Function secrets, create only
   `phase-5-storage-rehearsal.txt` containing synthetic text under the root's `REHEARSAL` child,
   read its metadata and bytes, and compare a SHA-256 hash locally in the trusted runtime.
2. Inspect returned permissions: no `type: anyone`; do not call the Drive permissions API and do
   not create a public link. Record only redacted file/root IDs and the cleanup result.
3. Delete the synthetic artifact (or leave it explicitly marked rehearsal) and record result.
4. Rehearse missing configuration, revoked refresh token, a deleted file, 403, 429, 5xx/timeout and
   malformed locator. Confirm the typed error/retry mapping and no token appears in logs.
5. Use a synthetic `document_sources` row only if required: `file_provider='GOOGLE_DRIVE'`, opaque
   `external_file_id`, `storage_path IS NULL`; clean it up afterwards. An unauthorized user must
   observe zero provider calls.
6. Provision **separately** the pre-existing P5-02 Vault values
   `ingestion_jobs_worker_url` and `ingestion_jobs_worker_cron_secret` on the rehearsal Supabase
   project. Invoke the same authenticated `run-ingestion-jobs` HTTP path and observe a synthetic
   eligible job claim once, `NO_OP`, `SUCCEEDED`; missing/wrong secret must be rejected. Confirm the
   actual cron schedule independently from `cron.job_run_details` and `net._http_response`.

Only redacted evidence is needed next: consent status (`In production`), declared/granted scope,
root exists/private, synthetic create/read/hash/cleanup results, failure matrix, cron NO_OP result,
and exact commit/CI status. No secret material is needed from the owner.

## 2026-08-18 live rehearsal attempt

- **HEAD:** `56c5d0a1caf7d6e41900d328e6efa748113cbd56` (short `56c5d0a`); Draft PR **#33**.
- **Supabase project:** configured rehearsal project was healthy, but the public schema inventory
  contained `documents` only among the required Phase 5 tables. `document_sources` was absent, so
  applying the unchanged accepted P5-02 migration failed with `42P01 relation public.document_sources
  does not exist`. No migration file was changed and no replacement DDL was attempted.
- **Cron preflight:** redacted name-only checks found neither Vault name
  `ingestion_jobs_worker_url` nor `ingestion_jobs_worker_cron_secret`; `cron.job` also had no
  `ingestion_jobs_worker` row. `run-ingestion-jobs` was not present in the Edge Function inventory.
- **Google A–E:** **not executed**. No access-token exchange, provider initialization, Drive upload,
  read-back, hash, delete, or post-delete read occurred; consequently there is no locator or hash
  evidence and no rehearsal object to clean up.
- **Cron F:** **not executed**. A cron-secret gate, claim/lease, NO_OP completion, retry/idempotency,
  and duplicate-job check cannot be demonstrated without the missing schema, Vault names, and worker.
- **Safety:** no Google credential value, account email, complete Drive ID, public link, permission or
  sharing API call was printed or persisted. No production project was changed. P5-03 was not started.

This is a hard runtime block until the rehearsal project is reset/provisioned from the accepted
P5-01/P5-02 baseline, the two Vault-backed cron names are provisioned, and the accepted worker is
deployed. Re-run this document's rehearsal from A after that repair; do not report PASS from this
attempt.

## Token durability

`TOKEN_DURABILITY_PENDING`: no Google Cloud console evidence has been supplied. The gate cannot be
called PASS merely because the bootstrap succeeds; the owner must confirm the consent screen is not
Testing and complete a refresh-backed rehearsal. Google permits refresh-token invalidation in other
cases too (revocation, token limits, policy/admin controls), so the provider maps invalid refreshes
to non-retryable `AUTH_INVALID` rather than retrying indefinitely.

## Technical test evidence

- Deno unit tests for the provider and authorization gateway: **9/9 PASS** (no Google network).
- Full Edge Function type-check: **PASS** with Deno 2 and the local Node dependency resolver.
- Frontend regression: **136/136 PASS**; lint: **0 errors** (3 pre-existing Fast Refresh warnings);
  production build: **PASS**.
- P5-01/P5-02 accepted migrations and tests: **unchanged**. Supabase CLI/Docker and Deno are
  unavailable in this workspace. Frontend gates were re-run locally; the exact-head CI remains the
  authoritative DB/Deno evidence until the rehearsal project is repaired.
- Secret scan reviewed the diff for `refresh_token`, `access_token`, `client_secret`, `Bearer`,
  `ya29.`, `1//` and `AIza`: the first four appear only as code/API field names, blank example
  variable names or synthetic test values; no credential-shaped value was found. No production
  Drive URL, public-sharing call or Drive permissions API call is present.

## Sources

- [Google Drive API: choose scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google OAuth web-server flow and offline access](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google Cloud: publishing status and Testing token expiry](https://support.google.com/cloud/answer/15549945)
