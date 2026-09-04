-- P5.5-01 — Member data foundation
-- Source of truth: docs/phase-5-5/00-member-management-architecture.md mục 5 (data model),
-- mục 8 (Ban Thanh niên constraint — no hard count enforced), mục 14/25 (search/index target).
-- This database is a separate Member PostgreSQL instance (Mắt Bão target per
-- docs/phase-5-5/01-member-infrastructure-decision.md) — it is NOT Supabase, and must never
-- create auth.users/profiles/user_roles or any Supabase-owned table.

-- Trigram + accent-insensitive Vietnamese name search (mục 14/25). Requires the connecting role
-- to be able to create extensions — true for local/rehearsal Postgres 16; availability on the
-- eventual Vibe Host v2 managed instance is NOT VERIFIED (see 01-member-infrastructure-decision.md
-- mục 5) and must be confirmed before production deploy.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() is STABLE, not IMMUTABLE, because its behavior depends on the search_path-resolved
-- text search configuration. Wrap it with a fixed dictionary so it can be used in an index
-- expression (standard PostgreSQL pattern for accent-insensitive indexing).
CREATE OR REPLACE FUNCTION member_immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT unaccent('unaccent', $1);
$$;

CREATE TYPE member_status AS ENUM ('ACTIVE', 'INACTIVE', 'TRANSFERRED', 'ARCHIVED');

-- Literal values per architecture mục 5 — not translated to an ASCII canonical code because the
-- architecture document chose these exact labels. Do not add values beyond what mục 5/mục 28.5
-- (NON_BLOCKING_OWNER_DECISION on whether gender is needed at all) has approved.
CREATE TYPE member_gender AS ENUM ('NAM', 'NỮ', 'KHÁC');

CREATE TYPE member_political_theory_level AS ENUM ('SO_CAP', 'TRUNG_CAP', 'CAO_CAP');

CREATE TYPE member_youth_position AS ENUM ('BI_THU', 'PHO_BI_THU', 'UY_VIEN');

CREATE TYPE member_youth_board_position AS ENUM ('TRUONG_BAN_THANH_NIEN', 'PHO_BAN_THANH_NIEN');

CREATE TABLE members (
  member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  gender member_gender,
  work_unit_code TEXT NOT NULL,
  job_title TEXT,
  member_status member_status NOT NULL DEFAULT 'ACTIVE',
  political_theory_level member_political_theory_level,
  youth_position member_youth_position,
  youth_board_position member_youth_board_position,
  account_user_id UUID,
  external_ref_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT members_full_name_not_blank CHECK (btrim(full_name) <> ''),
  CONSTRAINT members_work_unit_code_not_blank CHECK (btrim(work_unit_code) <> ''),
  CONSTRAINT members_job_title_length CHECK (job_title IS NULL OR char_length(job_title) <= 200),
  CONSTRAINT members_external_ref_note_length
    CHECK (external_ref_note IS NULL OR char_length(external_ref_note) <= 500),
  CONSTRAINT members_date_of_birth_not_future
    CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE)
);

COMMENT ON TABLE members IS
  'Member Record (P5.5) — separate from Supabase Account Profile. See docs/phase-5-5/00-member-management-architecture.md muc 2/5.';
COMMENT ON COLUMN members.member_id IS
  'Technical primary key only. NOT a "so hieu"/badge number/business identifier. Do not display as a member-facing code.';
COMMENT ON COLUMN members.work_unit_code IS
  'References organizations.code in Supabase (UNIQUE, IMMUTABLE, NEVER REPURPOSED per muc 6). Validated at the API layer at write time — no cross-database foreign key is possible.';
COMMENT ON COLUMN members.account_user_id IS
  'Optional mapping to Supabase auth.users.id. Nullable by design — members do not get an account by default (muc 11).';

-- muc 25: composite index for the most common query shape (an org viewing its own members,
-- filtered by status).
CREATE INDEX idx_members_work_unit_status ON members (work_unit_code, member_status);

-- muc 14/25: accent-insensitive Vietnamese name search for ~3,000 rows, no external search engine.
CREATE INDEX idx_members_full_name_trgm
  ON members USING gin (member_immutable_unaccent(full_name) gin_trgm_ops);

CREATE OR REPLACE FUNCTION member_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER members_set_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW
  EXECUTE FUNCTION member_set_updated_at();
