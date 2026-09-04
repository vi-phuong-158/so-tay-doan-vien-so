import http from 'node:http';
import { checkConnection } from './db.js';

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

// createServer(pool, { authorizeMemberManagement }) — the second argument is the P5.5-02
// authorization bridge (see memberScope.js: createMemberManagementAuthorizer). It is injected
// rather than imported directly so tests can supply a deterministic stub instead of a real network
// call to Supabase. This function is the ONLY thing that decides whether a Member Management
// request is authorized — it is never told anything by the request itself (no `X-Role`/
// `X-Organization` header, no body field, is ever read for that decision; see
// docs/phase-5-5/00-member-management-architecture.md muc 13/22, threat #1/#3).
export function createServer(pool, { authorizeMemberManagement } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && pathname === '/healthz') {
        // Liveness only — process is up. Does not depend on the database, so a DB outage does not
        // make the process look "down" for orchestration purposes; use /readyz for that.
        sendJson(res, 200, { status: 'ok' });
        return;
      }

      if (req.method === 'GET' && pathname === '/readyz') {
        try {
          await checkConnection(pool);
          sendJson(res, 200, { status: 'ok' });
        } catch {
          // Fail closed: database unavailable is a bounded, generic error — no connection string,
          // no driver stack trace, no internal detail in the response body.
          sendJson(res, 503, { status: 'error', reason: 'database_unavailable' });
        }
        return;
      }

      if (pathname === '/v1/member-scope') {
        // Proves the authorization bridge end-to-end without ever touching Member data (P5.5-02
        // scope guard: no list/CRUD here, only the resolved scope itself).
        const result = await authorizeMemberManagement(req.headers.authorization);
        if (!result.authorized) {
          sendJson(res, result.status, result.body);
          return;
        }
        sendJson(res, 200, { user_id: result.userId, roles: result.roles });
        return;
      }

      if (pathname === '/v1/members') {
        // Authorization is enforced first, for every method, before anything else runs. Only once
        // a request is authenticated AND authorized does it fall through to 501 — Member CRUD/list
        // itself is still out of scope until P5.5-03 (muc 7 of the P5.5-02 task instructions).
        const result = await authorizeMemberManagement(req.headers.authorization);
        if (!result.authorized) {
          sendJson(res, result.status, result.body);
          return;
        }
        sendJson(res, 501, {
          error: 'not_implemented',
          message: 'Member CRUD/list is not implemented yet (P5.5-03). This endpoint never returns member data.',
        });
        return;
      }

      sendJson(res, 404, { error: 'not_found' });
    } catch {
      // Structured, bounded error response — never leak stack traces or internals to the client.
      sendJson(res, 500, { error: 'internal_error' });
    }
  });
}
