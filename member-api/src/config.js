// Startup config loading. Fails fast (throws) on missing required config — never falls back to
// an insecure default (e.g. a hardcoded local connection string). See
// docs/phase-5-5/00-member-management-architecture.md muc 13 for why secrets are server-only, and
// AGENTS.md/CLAUDE.md hard rule: no secret in VITE_*, no secret committed.

export function loadConfig(env = process.env) {
  const databaseUrl = env.MEMBER_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'MEMBER_DATABASE_URL is required. Set it in member-api/.env (never commit real credentials) — see member-api/.env.example.'
    );
  }

  const portRaw = env.PORT ?? '8080';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT must be a valid TCP port number, got "${portRaw}".`);
  }

  // P5.5-02: the authorization bridge (resolve-member-scope). Required at startup, same fail-closed
  // contract as MEMBER_DATABASE_URL — there is no "authorization disabled" mode to fall back to.
  const memberScopeResolverUrl = env.MEMBER_SCOPE_RESOLVER_URL;
  if (!memberScopeResolverUrl) {
    throw new Error(
      'MEMBER_SCOPE_RESOLVER_URL is required. Set it in member-api/.env (never commit real values) — see member-api/.env.example.'
    );
  }
  const memberScopeResolverSecret = env.MEMBER_SCOPE_RESOLVER_SECRET;
  if (!memberScopeResolverSecret) {
    throw new Error(
      'MEMBER_SCOPE_RESOLVER_SECRET is required. Set it in member-api/.env (never commit real values) — see member-api/.env.example.'
    );
  }

  // P5.5-03 fix: verifying a Member's work_unit_code against Supabase's own `organizations` table
  // (organizationDirectory.js) — the public anon key, never the service-role key, and never used
  // for anything but this read-only RLS-protected lookup.
  const supabaseUrl = env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error(
      'SUPABASE_URL is required. Set it in member-api/.env (never commit real values) — see member-api/.env.example.'
    );
  }
  const supabaseAnonKey = env.SUPABASE_ANON_KEY;
  if (!supabaseAnonKey) {
    throw new Error(
      'SUPABASE_ANON_KEY is required. Set it in member-api/.env (never commit real values) — see member-api/.env.example.'
    );
  }

  return { databaseUrl, port, memberScopeResolverUrl, memberScopeResolverSecret, supabaseUrl, supabaseAnonKey };
}
