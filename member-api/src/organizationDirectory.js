// P5.5-03 fix — validates a Member `work_unit_code` against Supabase's own `organizations` table,
// the ONE authoritative source of truth for organization codes per
// docs/phase-5-5/00-member-management-architecture.md muc 6 ("Thẩm quyền tên/hiển thị:
// `organizations` vẫn là source of truth duy nhất... Member API không lưu bản sao đầy đủ
// `organizations`"). This does NOT introduce a second organization registry: it reads the real
// table, every call, through the row-level-security-protected REST endpoint Supabase already
// exposes for it (`grant select ... to anon, authenticated` + policy
// "active users read organizations" in `202607300001_initial_schema.sql`) — no new Supabase
// migration, no change to `resolve-member-scope` or its authorization/scope logic at all.
//
// The request is authenticated with the SAME end-user bearer token already forwarded to
// resolve-member-scope (never the Supabase service-role key) — RLS's `is_active_user()` passes
// because that user was already confirmed ACTIVE by the P5.5-02 resolver earlier in this same
// request. This intentionally stays bound by ordinary RLS, same as any other authenticated
// Supabase client; it grants no privilege beyond what the caller already has.
import { ApiError } from './errors.js';

export function loadOrganizationDirectoryConfig(env = process.env) {
  const supabaseUrl = env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error(
      'SUPABASE_URL is required. Set it in member-api/.env (never commit real values) — see member-api/.env.example. Used only to verify work_unit_code against Supabase\'s own organizations table (muc 6); Member API still never talks to Supabase Auth/Postgres for anything else.'
    );
  }
  const supabaseAnonKey = env.SUPABASE_ANON_KEY;
  if (!supabaseAnonKey) {
    throw new Error(
      'SUPABASE_ANON_KEY is required. Set it in member-api/.env (never commit real values) — see member-api/.env.example. This is the public anon key (same value the frontend already ships), never the service-role key.'
    );
  }
  return { supabaseUrl, supabaseAnonKey };
}

// Returns a function (code, bearerToken) => Promise<boolean>. Injected into createServer so tests
// can supply a deterministic stub instead of a real network call — same pattern as
// createMemberManagementAuthorizer (memberScope.js).
//
// Resolves to `true`/`false` for "does/doesn't exist" — it NEVER throws for a merely-nonexistent
// code (that is an ordinary, expected outcome the caller turns into a 400). It throws ApiError(503)
// only when the directory itself could not be consulted at all (network failure, non-2xx, malformed
// body) — the caller must treat that as a deny too (fail closed, muc 13/19 doctrine: no fallback
// "assume valid" just because verification was unavailable).
export function createOrganizationDirectory(config, fetchImpl = fetch) {
  return async function organizationCodeExists(code, bearerToken) {
    const url = `${config.supabaseUrl}/rest/v1/organizations?select=code&code=eq.${encodeURIComponent(code)}&limit=1`;
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${bearerToken}`,
        },
      });
    } catch {
      throw new ApiError(503, 'organization_directory_unavailable', 'Could not verify the organization code. Try again later.');
    }
    if (!response.ok) {
      throw new ApiError(503, 'organization_directory_unavailable', 'Could not verify the organization code. Try again later.');
    }
    let rows;
    try {
      rows = await response.json();
    } catch {
      throw new ApiError(503, 'organization_directory_unavailable', 'Could not verify the organization code. Try again later.');
    }
    return Array.isArray(rows) && rows.length > 0 && typeof rows[0]?.code === 'string';
  };
}
