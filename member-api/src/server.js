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

// P5.5-01 exposes no Member data endpoint. `/v1/members` exists only as an explicit fail-closed
// placeholder for the authorization bridge seam (P5.5-02) — per
// docs/phase-5-5/00-member-management-architecture.md muc 17 of the P5.5-01 task instructions:
// "DENY / NOT IMPLEMENTED tot hon mock allow. Khong tao route allow-all roi sua sau."
// This handler never queries the database, regardless of any request header.
function handleMembersPlaceholder(req, res) {
  sendJson(res, 501, {
    error: 'not_implemented',
    message: 'Member Management authorization bridge is not implemented yet (P5.5-02). This endpoint never returns member data.',
  });
}

export function createServer(pool) {
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

      if (pathname === '/v1/members') {
        handleMembersPlaceholder(req, res);
        return;
      }

      sendJson(res, 404, { error: 'not_found' });
    } catch {
      // Structured, bounded error response — never leak stack traces or internals to the client.
      sendJson(res, 500, { error: 'internal_error' });
    }
  });
}
