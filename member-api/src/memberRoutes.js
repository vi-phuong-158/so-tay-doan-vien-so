// P5.5-03 — Member CRUD route handlers. Called from server.js ONLY after
// authorizeMemberManagement has already approved the request and resolveEffectiveOrgScope has
// already computed `scope` — this module never sees a raw Authorization header and never makes an
// authorization decision itself; it only enforces `scope` against the requested data (muc 13/22).
import { assertOrgCodeInScope } from './scope.js';
import { parseCreatePayload, parseListQuery, parsePatchPayload } from './memberValidation.js';
import { createMember, getMemberById, listMembers, updateMember } from './memberRepository.js';

const MEMBER_ID_PATTERN = /^\/v1\/members\/([^/]+)$/;

export function matchMemberRoute(pathname) {
  if (pathname === '/v1/members') return { kind: 'collection' };
  const match = MEMBER_ID_PATTERN.exec(pathname);
  if (match) return { kind: 'item', id: decodeURIComponent(match[1]) };
  return null;
}

export async function handleMemberRoute({ req, res, url, pool, scope, route, sendJson, readJsonBody }) {
  if (route.kind === 'collection') {
    if (req.method === 'GET') {
      const { limit, offset, filters } = parseListQuery(url.searchParams);
      const result = await listMembers(pool, { scope, filters, limit, offset });
      sendJson(res, 200, result);
      return;
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const payload = parseCreatePayload(body);
      // Reject organization spoofing before ever touching the database: the target
      // work_unit_code must be inside the caller's own resolved scope, never trusted as-is just
      // because it looks like a well-formed code (muc 6/22).
      assertOrgCodeInScope(scope, payload.work_unit_code);
      const member = await createMember(pool, { payload });
      sendJson(res, 201, member);
      return;
    }
    sendJson(res, 404, { error: 'not_found' });
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
    const member = await updateMember(pool, { scope, id: route.id, patch });
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
