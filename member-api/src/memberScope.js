// P5.5-02 — Member API side of the authorization bridge. Calls the Supabase Edge Function
// resolve-member-scope (supabase/functions/resolve-member-scope) to turn an end-user's Supabase JWT
// into a Member Management authorization decision. Never trusts anything the client (browser, via
// this Member API) claims about its own role or organization — see
// docs/phase-5-5/00-member-management-architecture.md muc 13.

export class MemberScopeError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'MemberScopeError';
    this.reason = reason;
  }
}

export function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match ? match[1] : null;
}

// Fails closed (throws) on any missing config — same fail-fast contract as loadConfig() in
// config.js: no insecure default, no "authorization disabled" fallback mode.
export function loadResolverConfig(env = process.env) {
  const resolverUrl = env.MEMBER_SCOPE_RESOLVER_URL;
  if (!resolverUrl) {
    throw new Error(
      'MEMBER_SCOPE_RESOLVER_URL is required. Set it in member-api/.env (never commit real values) — see member-api/.env.example.'
    );
  }
  const resolverSecret = env.MEMBER_SCOPE_RESOLVER_SECRET;
  if (!resolverSecret) {
    throw new Error(
      'MEMBER_SCOPE_RESOLVER_SECRET is required. Set it in member-api/.env (never commit real values) — see member-api/.env.example.'
    );
  }
  return { resolverUrl, resolverSecret };
}

// Calls resolve-member-scope and returns its raw JSON body on success. Throws MemberScopeError on
// every failure mode (network error, non-2xx, malformed body) — the caller decides the HTTP status,
// but every branch here is a DENY, never a fallback "allow" (muc 13/19).
export async function resolveMemberScope(bearerToken, config, fetchImpl = fetch) {
  if (!bearerToken) throw new MemberScopeError('missing_authorization');

  let response;
  try {
    response = await fetchImpl(config.resolverUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'x-member-api-secret': config.resolverSecret,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
  } catch {
    throw new MemberScopeError('resolver_unreachable');
  }

  if (response.status === 401) throw new MemberScopeError('unauthenticated');
  if (!response.ok) throw new MemberScopeError('resolver_error');

  let body;
  try {
    body = await response.json();
  } catch {
    throw new MemberScopeError('resolver_malformed_response');
  }

  if (!body || typeof body.user_id !== 'string' || !Array.isArray(body.roles)) {
    throw new MemberScopeError('resolver_malformed_response');
  }
  return body;
}

// Pure — derives the Member Management authorization decision from an already-resolved scope
// response. Ignores (and never reads) any field the client could have supplied; every value here
// came from resolve-member-scope, which itself never trusts the caller's own claims.
export function deriveMemberManagementAuthorization(scope) {
  const roles = Array.isArray(scope?.roles) ? scope.roles : [];
  const valid = roles.filter(
    (role) =>
      role &&
      (role.role_code === 'YOUTH_ADMIN' || role.role_code === 'BRANCH_OFFICER') &&
      typeof role.is_global === 'boolean' &&
      Array.isArray(role.org_codes)
  );
  if (valid.length === 0) return { authorized: false };
  return { authorized: true, roles: valid };
}

// Wires the pieces above into the single function server.js needs per request. Returns either
// { authorized: true, userId, roles } or { authorized: false, status, body } — every failure path
// fails closed (no exception escapes to the caller; server.js does not need its own try/catch here).
export function createMemberManagementAuthorizer(config, fetchImpl = fetch) {
  return async function authorizeMemberManagement(authorizationHeader) {
    const token = extractBearerToken(authorizationHeader);
    if (!token) {
      return { authorized: false, status: 401, body: { error: 'unauthenticated', reason: 'missing_authorization' } };
    }

    let scope;
    try {
      scope = await resolveMemberScope(token, config, fetchImpl);
    } catch (error) {
      if (error instanceof MemberScopeError && error.reason === 'unauthenticated') {
        return { authorized: false, status: 401, body: { error: 'unauthenticated' } };
      }
      // resolver_unreachable / resolver_error / resolver_malformed_response: the resolver could not
      // be trusted to answer, so this is a DENY, not a 5xx "try again" — no fallback allow, ever.
      return { authorized: false, status: 403, body: { error: 'forbidden' } };
    }

    const authz = deriveMemberManagementAuthorization(scope);
    if (!authz.authorized) {
      return { authorized: false, status: 403, body: { error: 'forbidden' } };
    }
    return { authorized: true, userId: scope.user_id, roles: authz.roles };
  };
}
