#!/usr/bin/env node
// One-time local bootstrap for a non-production My Drive owner.
// Credential values are never logged, committed or sent to Supabase by this script.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { access, chmod, writeFile } from 'node:fs/promises';

const scope = 'https://www.googleapis.com/auth/drive.file';
const redirectUri = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI ?? 'http://127.0.0.1:53682/oauth2/callback';
const outputPath = process.env.GOOGLE_DRIVE_BOOTSTRAP_OUTPUT ?? 'google-drive-oauth-bootstrap.local.json';
const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

function assertRedirectUri(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port) {
    throw new Error('GOOGLE_DRIVE_OAUTH_REDIRECT_URI must be http://127.0.0.1:<port>.');
  }
  return parsed;
}

async function assertOutputIsNew() {
  try {
    await access(outputPath);
    throw new Error(`Refusing to overwrite ${outputPath}. Move it outside the repository.`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function jsonFetch(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Google request failed (${response.status}).`);
  try { return await response.json(); }
  catch { throw new Error('Google returned malformed JSON.'); }
}

async function createFolder(accessToken, name, parentId) {
  return await jsonFetch('https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents,permissions(type,role)', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) }),
  });
}

async function main() {
  if (!clientId || !clientSecret) throw new Error('Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in the local environment.');
  const callback = assertRedirectUri(redirectUri);
  await assertOutputIsNew();
  const state = randomBytes(32).toString('base64url');
  const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId, redirect_uri: callback.toString(), response_type: 'code', scope,
    access_type: 'offline', prompt: 'consent', state,
  }).toString();

  const authorizationCode = await new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const incoming = new URL(request.url ?? '/', callback);
      if (incoming.pathname !== callback.pathname) { response.writeHead(404).end(); return; }
      if (incoming.searchParams.get('state') !== state || !incoming.searchParams.get('code')) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Authorization rejected.');
        server.close(); reject(new Error('OAuth callback state or code was invalid.')); return;
      }
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Authorization received.');
      const code = incoming.searchParams.get('code'); server.close(); resolve(code);
    });
    server.once('error', reject);
    server.listen(Number(callback.port), callback.hostname, () => {
      process.stdout.write(`Open this authorization URL in the non-production My Drive owner account:\n${authorizationUrl}\n`);
    });
  });

  const token = await jsonFetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: authorizationCode, client_id: clientId, client_secret: clientSecret,
      redirect_uri: callback.toString(), grant_type: 'authorization_code' }),
  });
  const grantedScopes = String(token.scope ?? '').split(' ').filter(Boolean);
  if (!token.refresh_token || !token.access_token || grantedScopes.length !== 1 || grantedScopes[0] !== scope) {
    throw new Error('OAuth exchange did not return exactly drive.file with a refresh token.');
  }

  const root = await createFolder(token.access_token, 'SO-TAY-DOAN-VIEN-SO');
  const knowledge = await createFolder(token.access_token, 'KNOWLEDGE', root.id);
  await createFolder(token.access_token, 'SOURCES', knowledge.id);
  await createFolder(token.access_token, 'REHEARSAL', knowledge.id);
  if ((root.permissions ?? []).some(permission => permission.type === 'anyone')) {
    throw new Error('The new root unexpectedly has public sharing.');
  }

  await writeFile(outputPath, `${JSON.stringify({
    GOOGLE_DRIVE_REFRESH_TOKEN: token.refresh_token,
    GOOGLE_DRIVE_ROOT_FOLDER_ID: root.id,
    GOOGLE_DRIVE_SCOPE: scope,
    created_at: new Date().toISOString(),
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await chmod(outputPath, 0o600);
  process.stdout.write(`Bootstrap succeeded. Values were written only to ${outputPath}; move it outside the repository.\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Bootstrap failed'}\n`);
  process.exitCode = 1;
});
