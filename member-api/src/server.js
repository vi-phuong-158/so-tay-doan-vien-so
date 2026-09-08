import http from 'node:http';
import { checkConnection } from './db.js';
import { ApiError } from './errors.js';
import { extractBearerToken } from './memberScope.js';
import { handleMemberRoute, matchMemberRoute } from './memberRoutes.js';
import { handleImportRoute, matchImportRoute } from './importRoutes.js';
import { resolveEffectiveOrgScope } from './scope.js';

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

const MAX_BODY_BYTES = 100_000;
// P5.5-05 confirm bodies can legitimately carry one row_overrides entry per POSSIBLE_DUPLICATE/
// WARNING row in a pilot-scale (~3,000 row) job — comfortably under 2 MB, still far below anything
// that would let this JSON-body route double as a file-upload vector (the actual file upload uses
// its own separate raw-byte reader, MAX_IMPORT_FILE_BYTES, in importRoutes.js).
const MAX_IMPORT_CONFIRM_BODY_BYTES = 2_000_000;

// Node's http module does not parse the request body itself. Bounded (rejects oversized bodies
// before buffering all of it) and strict (only a JSON object, never an array/primitive) — a
// malformed body is always a 400 ApiError, never an unhandled parse exception reaching the
// top-level catch as a bare 500.
function makeJsonBodyReader(maxBytes) {
  return async function readJsonBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) {
        throw new ApiError(400, 'payload_too_large', 'Request body exceeds the allowed size.');
      }
      chunks.push(chunk);
    }
    if (chunks.length === 0) return {};
    let parsed;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.');
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ApiError(400, 'invalid_json', 'Request body must be a JSON object.');
    }
    return parsed;
  };
}

const readJsonBody = makeJsonBodyReader(MAX_BODY_BYTES);
const readImportConfirmBody = makeJsonBodyReader(MAX_IMPORT_CONFIRM_BODY_BYTES);

// createServer(pool, { authorizeMemberManagement, checkOrganizationExists, checkOrganizationCodesExist })
// — all three are injected rather than imported directly so tests can supply deterministic stubs
// instead of real network calls to Supabase.
// - authorizeMemberManagement (memberScope.js) is the P5.5-02 authorization bridge. It is the ONLY
//   thing that decides whether a Member Management request is authorized — it is never told
//   anything by the request itself (no `X-Role`/`X-Organization` header, no body field, is ever
//   read for that decision; see docs/phase-5-5/00-member-management-architecture.md muc 13/22,
//   threat #1/#3).
// - checkOrganizationExists (organizationDirectory.js, P5.5-03 fix) verifies a candidate
//   work_unit_code against Supabase's own `organizations` table before create — the ONE
//   authoritative source, never a Member API-side copy (muc 6).
// - checkOrganizationCodesExist (organizationDirectory.js, P5.5-05) is the same authoritative
//   source, batched for bulk import.
// P5.5-06 — CORS for the browser frontend. `corsAllowedOrigin` is optional here (tests construct
// `createServer` directly and never pass it, so their behavior is unchanged); `index.js` always
// supplies it from the fail-closed `loadConfig()` value in every real deployment. Only ever echoes
// the configured origin back, and only on an EXACT match against the request's `Origin` header —
// never a wildcard, since these requests carry a real Authorization bearer token.
function applyCorsHeaders(req, res, corsAllowedOrigin) {
  if (!corsAllowedOrigin) return;
  const origin = req.headers.origin;
  if (origin !== corsAllowedOrigin) return;
  res.setHeader('Access-Control-Allow-Origin', corsAllowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Import-Filename');
  res.setHeader('Access-Control-Max-Age', '600');
}

export function createServer(pool, { authorizeMemberManagement, checkOrganizationExists, checkOrganizationCodesExist, corsAllowedOrigin } = {}) {
  return http.createServer(async (req, res) => {
    try {
      applyCorsHeaders(req, res, corsAllowedOrigin);
      if (req.method === 'OPTIONS') {
        // Preflight only — never routed further, never authorized/authenticated (it carries no
        // Member data and browsers never send credentials-bearing headers on it).
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url, 'http://localhost');
      const { pathname } = url;

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

      // Checked BEFORE matchMemberRoute: `/v1/members/import...` would otherwise also match the
      // generic `/v1/members/:id` item pattern (with id="import"), which is not what we want.
      const importRoute = matchImportRoute(pathname);
      if (importRoute) {
        const result = await authorizeMemberManagement(req.headers.authorization);
        if (!result.authorized) {
          sendJson(res, result.status, result.body);
          return;
        }
        const scope = resolveEffectiveOrgScope(result.roles);
        const bearerToken = extractBearerToken(req.headers.authorization);
        await handleImportRoute({
          req,
          res,
          url,
          pool,
          scope,
          route: importRoute,
          sendJson,
          readJsonBody: readImportConfirmBody,
          userId: result.userId,
          roles: result.roles,
          checkOrganizationCodesExist,
          bearerToken,
        });
        return;
      }

      const memberRoute = matchMemberRoute(pathname);
      if (memberRoute) {
        // Authorization is enforced first, for every method, before any Member data access — no
        // exception (muc 13/22). Only once a request is authenticated AND authorized does scope
        // get resolved and the CRUD handler run.
        const result = await authorizeMemberManagement(req.headers.authorization);
        if (!result.authorized) {
          sendJson(res, result.status, result.body);
          return;
        }
        const scope = resolveEffectiveOrgScope(result.roles);
        const bearerToken = extractBearerToken(req.headers.authorization);
        await handleMemberRoute({
          req,
          res,
          url,
          pool,
          scope,
          route: memberRoute,
          sendJson,
          readJsonBody,
          checkOrganizationExists,
          bearerToken,
        });
        return;
      }

      sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof ApiError) {
        sendJson(res, error.status, { error: error.code, message: error.message });
        return;
      }
      // Structured, bounded error response — never leak stack traces or internals to the client.
      sendJson(res, 500, { error: 'internal_error' });
    }
  });
}
