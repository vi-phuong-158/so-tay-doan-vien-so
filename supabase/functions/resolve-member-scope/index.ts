// P5.5-02 — Member Scope Authorization Bridge.
//
// Verifies a real Supabase-authenticated user (via _shared/auth.ts requireUser, i.e. Supabase's own
// JWT signature/issuer/audience/expiry check — no second JWT verification implemented here), re-reads
// profiles.account_status and user_roles server-side (never trusts anything the caller sends about
// role/org), and returns the minimal Member Management assertion the Member API needs to authorize a
// request. See docs/phase-5-5/00-member-management-architecture.md muc 13.
//
// Deliberately NOT a signed/internal token: this is Option A from muc 13 (resolved fresh on every
// call, zero caching) called directly server-to-server over HTTPS by the Member API, authenticated by
// a shared secret (same `x-*-secret` + hasTrustedWorkerSecret() pattern already used by
// process-email-queue/send-reminder/run-ingestion-jobs, P3-08). Signing an additional internal
// assertion on top of that would reintroduce exactly the complexity muc 13 rejected when it chose
// Option A over Option C — it is not required for security here, since nothing but this Edge Function
// and the Member API ever see the response, and it never reaches the browser.
import { clients, requireUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, json } from '../_shared/http.ts';
import { buildMemberScopeRoles, hasTrustedWorkerSecret, selectMemberManagementRoleRows, type UserRoleRow } from './contract.ts';

export const handler = async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse(new Error('METHOD_NOT_ALLOWED'), 405);

  try {
    // Server-to-server gate first, before spending any work on JWT verification: only the Member
    // API (holder of the shared secret) may call this resolver at all.
    if (!hasTrustedWorkerSecret(request.headers.get('x-member-api-secret'), Deno.env.get('MEMBER_SCOPE_RESOLVER_SECRET'))) {
      throw new Error('FORBIDDEN');
    }

    const { userClient, adminClient } = clients(request);
    // requireUser calls Supabase's own userClient.auth.getUser(token): signature, issuer, audience
    // and expiry are all checked by Supabase Auth itself, not reimplemented here (muc 13).
    const user = await requireUser(userClient);

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('account_status')
      .eq('id', user.id)
      .single();
    if (profileError || !profile || profile.account_status !== 'ACTIVE') {
      // Covers: no profile, SUSPENDED, ARCHIVED, INVITED — all fail closed the same way (muc 13/22).
      throw new Error('UNAUTHENTICATED');
    }

    const { data: roleRows, error: rolesError } = await adminClient
      .from('user_roles')
      .select('role_code, scope_organization_id')
      .eq('user_id', user.id);
    if (rolesError) throw rolesError;

    const relevantRows = selectMemberManagementRoleRows((roleRows ?? []) as UserRoleRow[]);

    // Resolve org codes only for the scopes actually present (dedup by scope id) — never more than
    // one RPC call per distinct scope_organization_id on this request.
    const orgCodesByScope = new Map<string, string[]>();
    for (const row of relevantRows) {
      if (row.scope_organization_id === null || orgCodesByScope.has(row.scope_organization_id)) continue;
      const { data: codes, error: codesError } = await adminClient.rpc('member_scope_org_codes', {
        scope_org_id: row.scope_organization_id,
      });
      if (codesError) throw codesError;
      // PostgREST returns a setof-text RPC result as either a plain array of strings or an array of
      // { member_scope_org_codes: string } rows depending on version — normalize both shapes.
      const normalized = (codes ?? []).map((entry: unknown) =>
        typeof entry === 'string' ? entry : (entry as { member_scope_org_codes: string }).member_scope_org_codes
      );
      orgCodesByScope.set(row.scope_organization_id, normalized);
    }

    const roles = buildMemberScopeRoles(relevantRows, (scopeOrgId) => orgCodesByScope.get(scopeOrgId) ?? []);

    return json({ user_id: user.id, account_status: profile.account_status, roles });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'FORBIDDEN') return errorResponse(new Error('FORBIDDEN'), 403);
    if (message.startsWith('UNAUTHENTICATED')) return errorResponse(new Error('UNAUTHENTICATED'), 401);
    // Fail closed on anything unexpected too (DB error, RPC error, etc.) — never echo the raw error
    // (could contain a SQL message) back to the caller.
    return errorResponse(new Error('RESOLVER_ERROR'), 500);
  }
};

if (import.meta.main) {
  Deno.serve(handler);
}
