-- P5.5-07 — Application audit for Member mutations.
-- Source: docs/phase-5-5/00-member-management-architecture.md muc 16 (audit contract).
-- Deliberately a separate table/database from Supabase's own `audit_logs` — Member API is the
-- system of record for Member data, and every mutation already happens inside a PostgreSQL
-- transaction here; writing audit to a second database would need a distributed transaction this
-- architecture explicitly avoids (muc 16: "uu tien audit khong phu thuoc vao mot transaction
-- distributed mong manh").

CREATE TYPE member_audit_action AS ENUM ('CREATE', 'UPDATE');

CREATE TABLE member_audit_logs (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL,
  action member_audit_action NOT NULL,
  member_id UUID NOT NULL REFERENCES members (member_id),
  import_job_id UUID REFERENCES member_import_jobs (import_job_id),
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE member_audit_logs IS
  'P5.5-07 application audit. A row here IS the success signal — a rejected/failed mutation writes no row at all (muc 16/22: never a false "success" audit for a denied or failed request).';
COMMENT ON COLUMN member_audit_logs.actor_user_id IS
  'Supabase auth.users.id from the P5.5-02 resolver for the request that made this change — never a client-supplied value, never re-derived from before_data/after_data.';
COMMENT ON COLUMN member_audit_logs.import_job_id IS
  'Set only when this mutation was created by a bulk import commit (P5.5-05) — lets one committed member be traced back to the exact job/row that created it (muc 16).';
COMMENT ON COLUMN member_audit_logs.before_data IS
  'Only the business fields that actually changed (muc 16: "khong can audit thay doi cosmetic nhu ghi chu" — external_ref_note is excluded). NULL for CREATE (there is no "before").';
COMMENT ON COLUMN member_audit_logs.after_data IS
  'The new value for each field present in before_data (CREATE: the full set of business fields the row was created with). Never the full row/SELECT * — never account_user_id (not part of ordinary CRUD, muc 11).';

CREATE INDEX idx_member_audit_logs_member ON member_audit_logs (member_id, created_at DESC);
CREATE INDEX idx_member_audit_logs_import_job ON member_audit_logs (import_job_id) WHERE import_job_id IS NOT NULL;
