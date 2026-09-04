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

  return { databaseUrl, port };
}
