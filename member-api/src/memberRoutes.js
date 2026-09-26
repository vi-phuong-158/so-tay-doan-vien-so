// P5.5-03 — Member CRUD route handlers. Called from server.js ONLY after
// authorizeMemberManagement has already approved the request and resolveEffectiveOrgScope has
// already computed `scope` — this module never makes an authorization decision itself; it only
// enforces `scope` (and, on create, real organization existence) against the requested data
// (muc 13/22).
import { ApiError } from './errors.js';
import { assertOrgCodeInScope } from './scope.js';
import { parseCreatePayload, parseListQuery, parsePatchPayload } from './memberValidation.js';
import { createMember, getMemberById, listMembers, updateMember } from './memberRepository.js';
import { listMemberAuditLogs } from './memberAudit.js';

const MEMBER_ID_PATTERN = /^\/v1\/members\/([^/]+)$/;
const MEMBER_AUDIT_PATTERN = /^\/v1\/members\/([^/]+)\/audit$/;

export function matchMemberRoute(pathname) {
  if (pathname === '/v1/members') return { kind: 'collection' };
  // Checked before the generic item pattern, same reason as importRoutes.js's ordering — otherwise
  // `/v1/members/<id>/audit` would be swallowed by MEMBER_ID_PATTERN with a bogus id.
  const auditMatch = MEMBER_AUDIT_PATTERN.exec(pathname);
  if (auditMatch) return { kind: 'audit', id: decodeURIComponent(auditMatch[1]) };
  const match = MEMBER_ID_PATTERN.exec(pathname);
  if (match) return { kind: 'item', id: decodeURIComponent(match[1]) };
  return null;
}

export async function handleMemberRoute({
  req,
  res,
  url,
  pool,
  scope,
  route,
  sendJson,
  readJsonBody,
  checkOrganizationExists,
  bearerToken,
  userId,
}) {
  if (route.kind === 'collection') {
    if (req.method === 'GET') {
      const { limit, offset, filters, sort } = parseListQuery(url.searchParams);
      const result = await listMembers(pool, { scope, filters, limit, offset, sort });
      sendJson(res, 200, result);
      return;
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const payload = parseCreatePayload(body);

      // Two independent checks, in this order, both required (P5.5-03 fix): the code must be a
      // real organization (authoritative existence — muc 6) AND it must be inside the caller's own
      // resolved scope (muc 7/22 — never trusted as-is just because it looks well-formed, and
      // never skipped just because the caller is global: "is_global" means unrestricted AMONG
      // valid organizations, not unrestricted arbitrary strings).
      const exists = await checkOrganizationExists(payload.work_unit_code, bearerToken);
      if (!exists) {
        throw new ApiError(400, 'unknown_organization', 'work_unit_code does not match any existing organization.');
      }
      assertOrgCodeInScope(scope, payload.work_unit_code);

      const member = await createMember(pool, { payload, actorUserId: userId });
      sendJson(res, 201, member);
      return;
    }
    sendJson(res, 404, { error: 'not_found' });
    return;
  }

  if (route.kind === 'audit') {
    if (req.method !== 'GET') {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    // Same scope check as reading the member itself (muc 22 threat #3) — audit history for a
    // member outside the caller's scope is exactly as invisible as the member itself, never a
    // second, unscoped way to reach the same data.
    const member = await getMemberById(pool, { scope, id: route.id });
    if (!member) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    const limitRaw = Number(url.searchParams.get('limit'));
    const offsetRaw = Number(url.searchParams.get('offset'));
    const result = await listMemberAuditLogs(pool, {
      memberId: route.id,
      limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
      offset: Number.isFinite(offsetRaw) ? offsetRaw : undefined,
    });
    sendJson(res, 200, result);
    return;
  }

  // route.kind === 'item'
  if (req.method === 'GET') {
    const member = await getMemberById(pool, { scope, id: route.id });
    if (!member) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    sendJson(res, 200, member);
    return;
  }

  if (req.method === 'PATCH') {
    const body = await readJsonBody(req);
    const patch = parsePatchPayload(body);
    const member = await updateMember(pool, { scope, id: route.id, patch, actorUserId: userId });
    if (!member) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    sendJson(res, 200, member);
    return;
  }

  if (req.method === 'DELETE') {
    // No hard delete in P5.5-03 (owner instruction; muc 17 lifecycle contract already provides
    // archive via ordinary PATCH member_status -> ARCHIVED). Deliberate 501, not a bare 404, so the
    // non-implementation is visible and intentional rather than looking like a routing miss.
    sendJson(res, 501, {
      error: 'not_implemented',
      message: 'Hard delete is not implemented. Use PATCH member_status to archive (ARCHIVED) instead.',
    });
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}
