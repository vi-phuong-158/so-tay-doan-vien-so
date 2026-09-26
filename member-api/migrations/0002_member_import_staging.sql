-- P5.5-05 — Excel import staging (upload -> validate -> preview -> confirm -> commit).
-- Source: docs/phase-5-5/00-member-management-architecture.md muc 10 (state machine, staging
-- contract, dedup soft-match, atomicity/idempotency) and muc 22/23 (security/negative tests).
-- Staging tables NEVER hold real Member data on their own — a row only becomes a real `members`
-- row when confirm/commit copies its normalized_data across, in the same transaction that also
-- marks the job COMMITTED.

CREATE TYPE member_import_job_status AS ENUM (
  'UPLOADED', 'READY_FOR_CONFIRM', 'COMMITTED', 'CANCELLED', 'FAILED'
);
-- Note: architecture muc 10 also names a PARSED state ("da parse xong, dang chay validate/dedup
-- tung dong"). This implementation runs parse + per-row validate/dedup synchronously within the
-- same request that creates the job (pilot scale ~3,000 rows finishes in low single-digit seconds
-- per muc 25 — no background worker), so there is no externally observable window where a job sits
-- "still validating". A job becomes durably UPLOADED the moment it is created (so a crash mid-parse
-- still leaves a traceable job row an operator can find), then transitions directly to
-- READY_FOR_CONFIRM or FAILED once validation completes.

CREATE TYPE member_import_row_status AS ENUM ('VALID', 'INVALID', 'POSSIBLE_DUPLICATE', 'WARNING');

CREATE TABLE member_import_jobs (
  import_job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status member_import_job_status NOT NULL DEFAULT 'UPLOADED',
  created_by_user_id UUID NOT NULL,
  source_filename TEXT,
  total_rows INT NOT NULL DEFAULT 0,
  valid_rows INT NOT NULL DEFAULT 0,
  invalid_rows INT NOT NULL DEFAULT 0,
  possible_duplicate_rows INT NOT NULL DEFAULT 0,
  warning_rows INT NOT NULL DEFAULT 0,
  committed_count INT NOT NULL DEFAULT 0,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT member_import_jobs_source_filename_length
    CHECK (source_filename IS NULL OR char_length(source_filename) <= 255),
  CONSTRAINT member_import_jobs_failure_reason_length
    CHECK (failure_reason IS NULL OR char_length(failure_reason) <= 500),
  CONSTRAINT member_import_jobs_counts_non_negative CHECK (
    total_rows >= 0 AND valid_rows >= 0 AND invalid_rows >= 0 AND
    possible_duplicate_rows >= 0 AND warning_rows >= 0 AND committed_count >= 0
  )
);

COMMENT ON TABLE member_import_jobs IS
  'P5.5-05 import job header/state machine. See docs/phase-5-5/00-member-management-architecture.md muc 10.';
COMMENT ON COLUMN member_import_jobs.created_by_user_id IS
  'Supabase auth.users.id of the actor who uploaded this job, from the P5.5-02 resolver on the upload request — never a client-supplied value.';
COMMENT ON COLUMN member_import_jobs.source_filename IS
  'Original filename only, kept for operator troubleshooting. The raw file bytes themselves are never persisted anywhere (muc 10/16: no permanent raw Excel storage, no per-cell logging).';
COMMENT ON COLUMN member_import_jobs.failure_reason IS
  'A bounded, fixed application-level reason code/message (e.g. "malformed_workbook") — never a raw driver/parser exception message (muc 22 threat #6).';

CREATE INDEX idx_member_import_jobs_created_by ON member_import_jobs (created_by_user_id, created_at DESC);

CREATE TRIGGER member_import_jobs_set_updated_at
  BEFORE UPDATE ON member_import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION member_set_updated_at();

CREATE TABLE member_import_job_rows (
  import_job_id UUID NOT NULL REFERENCES member_import_jobs (import_job_id) ON DELETE CASCADE,
  row_number INT NOT NULL,
  row_status member_import_row_status NOT NULL,
  normalized_data JSONB NOT NULL,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  duplicate_candidate_member_id UUID REFERENCES members (member_id),
  duplicate_reason TEXT,
  committed_member_id UUID REFERENCES members (member_id),

  PRIMARY KEY (import_job_id, row_number),
  CONSTRAINT member_import_job_rows_row_number_positive CHECK (row_number > 0),
  CONSTRAINT member_import_job_rows_duplicate_reason_length
    CHECK (duplicate_reason IS NULL OR char_length(duplicate_reason) <= 200)
);

COMMENT ON TABLE member_import_job_rows IS
  'P5.5-05 per-row staging: normalized parsed data plus validation/dedup outcome. Never itself the source of a real Member row — confirm/commit is the only path that copies normalized_data into `members` (muc 10).';
COMMENT ON COLUMN member_import_job_rows.normalized_data IS
  'Normalized, allowlisted field set matching members-creatable columns only (see importValidation.js) — never a raw dump of the Excel row/extra columns.';
COMMENT ON COLUMN member_import_job_rows.duplicate_candidate_member_id IS
  'Soft-match signal only (muc 10/E) — never auto-merged. NULL unless row_status is POSSIBLE_DUPLICATE or WARNING.';
COMMENT ON COLUMN member_import_job_rows.committed_member_id IS
  'Set only after a successful confirm/commit created a real member from this row. NULL for INVALID rows and for rows skipped at confirm time.';

CREATE INDEX idx_member_import_job_rows_status ON member_import_job_rows (import_job_id, row_status);
