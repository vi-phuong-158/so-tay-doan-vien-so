-- P5.5 Production Runtime Closure — forward-fix, found via a real pg_dump/pg_restore rehearsal
-- (not a hypothetical): restoring a plain-text pg_dump of this schema into a fresh database fails
-- with `ERROR: function unaccent(unknown, text) does not exist` on
-- idx_members_full_name_trgm (see migration 0001).
--
-- Root cause: pg_dump's plain-text output starts every restore session with
-- `SELECT pg_catalog.set_config('search_path', '', false);` (a documented, standard pg_dump
-- security convention) and schema-qualifies every object it emits EXCEPT literal text inside a
-- function body, which is dumped byte-for-byte as originally written. Migration 0001's
-- member_immutable_unaccent() calls the bare, unqualified `unaccent('unaccent', $1)` — under the
-- empty search_path a restore runs with, PostgreSQL cannot resolve the unqualified `unaccent`
-- function (defined in schema `public` by the `unaccent` extension), so the functional index that
-- depends on it fails to (re)build. This blocks every future restore of this database, which is
-- exactly the failure the P5.5-00 architecture's backup/restore acceptance gate exists to catch.
--
-- Minimal fix: schema-qualify both the function call and the dictionary reference so the same
-- expression resolves correctly regardless of search_path. `CREATE OR REPLACE FUNCTION` keeps the
-- function's OID/dependents (including the functional index) intact — no data migration, no
-- signature change, no behavior change for any caller.
CREATE OR REPLACE FUNCTION public.member_immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, $1);
$$;
