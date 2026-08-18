# P5-02 — Ingestion Job Foundation + Storage Provider Amendment

## Scope

Migration `202608180001_phase_5_ingestion_foundation.sql` extends accepted P5-01 without editing
its migration. It adds a provider-neutral canonical-source locator, a database-owned ingestion job
lifecycle and a NO_OP worker. No AI, Drive API, document extraction, Wiki, evidence or embedding is
implemented.

## Storage decision

- Pilot Phase 5 source provider: `GOOGLE_DRIVE` backed by one personal My Drive.
- Supabase remains source of truth for document identity, metadata, organizations, RLS, publication,
  ingestion state, provenance and all future knowledge records.
- `external_file_id` is opaque. A frontend must never construct a Drive URL or use public sharing.
- `storage_path` is retained unchanged for Phase 4 and legacy Supabase Storage sources.
- OAuth client/refresh credentials are backend secrets only. `provider_metadata` is bounded and
  rejects credential-shaped fields.

## Job lifecycle

`document_sources` registration queues one `EXTRACT` job in the same transaction when its version
is current and the document is published. Its unique idempotency key prevents a replay from adding a
second job. `claim_ingestion_jobs` atomically uses `FOR UPDATE SKIP LOCKED`; each claim has a token
and lease. `complete_ingestion_job` and `fail_ingestion_job` accept only the current live token.
Retry backoff is 60s, 300s, 900s, then 3600s; reclaiming an expired final attempt produces terminal
`FAILED`. Lifecycle events have bounded operational metadata only and are append-only.

## Worker and schedule

`run-ingestion-jobs` accepts POST only and checks `x-cron-secret` before it constructs a service
client or claims a job. The current handler is deliberately NO_OP. The migration schedules it every
five minutes through `pg_cron` → `pg_net`; both the URL and cron secret are read from Vault by name.
Until runtime Vault values are provisioned, no real invocation is considered proven.

## Runtime gate before P5-03

1. OAuth consent/bootstrap for the personal My Drive owner, with least-privilege `drive.file` where feasible.
2. Store refresh token only in backend secret configuration; do not commit it or expose it to frontend.
3. Create/identify the app-managed root folder and rehearse a synthetic upload/read through
   `GoogleDriveStorageProvider`.
4. Confirm deleted external files, revoked credentials and Drive outage surface as source unavailable
   while `documents.status` and accepted Phase 4 storage flows remain unchanged.
