import { assertEquals, assertRejects } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { StorageProviderError } from './contract.ts';
import { GoogleDriveStorageProvider, googleDriveScope } from './googleDriveStorageProvider.ts';

const rootId = 'root-folder-123';
const fileId = 'drive-file-123';
const metadata = {
  id: fileId,
  name: 'phase-5-storage-rehearsal.txt',
  mimeType: 'text/plain',
  size: '23',
  parents: [rootId],
  trashed: false,
  permissions: [{ type: 'user', role: 'owner' }],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function provider(fetchFn: typeof fetch): GoogleDriveStorageProvider {
  return new GoogleDriveStorageProvider({
    clientId: 'client-id', clientSecret: 'client-secret', refreshToken: 'refresh-token', rootFolderId: rootId,
  }, fetchFn);
}

async function expectCode(run: () => Promise<unknown>, code: string) {
  const error = await assertRejects(run, StorageProviderError);
  assertEquals((error as StorageProviderError).code, code);
}

Deno.test('provider refreshes server-side and reads metadata/bytes without returning a token', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const instance = provider(async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('oauth2.googleapis.com')) {
      return json({ access_token: 'access-token-not-returned', expires_in: 3600, scope: googleDriveScope });
    }
    if (String(url).includes('alt=media')) return new Response('synthetic rehearsal bytes');
    return json(metadata);
  });
  const result = await instance.getMetadata(fileId);
  const bytes = await instance.read(fileId);
  assertEquals(result.isPublic, false);
  assertEquals(new TextDecoder().decode(bytes), 'synthetic rehearsal bytes');
  assertEquals(calls.length, 3);
  assertEquals((calls[1].init?.headers as Record<string, string>).Authorization, 'Bearer access-token-not-returned');
  assertEquals(JSON.stringify(result).includes('access-token-not-returned'), false);
});

Deno.test('provider creates a private-by-default artifact and deletes it without sharing calls', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const instance = provider(async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('oauth2.googleapis.com')) return json({ access_token: 'test-token', expires_in: 3600 });
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    return json(metadata);
  });
  const created = await instance.put({
    name: 'phase-5-storage-rehearsal.txt', mimeType: 'text/plain', bytes: new TextEncoder().encode('synthetic'),
  });
  await instance.delete(fileId);
  assertEquals(created.isPublic, false);
  assertEquals(calls.some(call => call.url.includes('/permissions')), false);
  assertEquals(calls.at(-1)?.init?.method, 'DELETE');
});

Deno.test('missing credentials fail closed before OAuth or Drive calls', async () => {
  let calls = 0;
  const instance = new GoogleDriveStorageProvider({ rootFolderId: rootId }, async () => {
    calls += 1;
    return json({});
  });
  await expectCode(() => instance.getMetadata(fileId), 'AUTH_INVALID');
  assertEquals(calls, 0);
});

Deno.test('token failures, malformed token responses and timeout are typed', async () => {
  await expectCode(() => provider(async () => new Response('{}', { status: 400 })).getMetadata(fileId), 'AUTH_INVALID');
  await expectCode(() => provider(async () => json({ access_token: 'test-token', expires_in: 0 })).getMetadata(fileId), 'MALFORMED_RESPONSE');
  await expectCode(() => provider(async () => { throw new DOMException('timeout', 'AbortError'); }).getMetadata(fileId), 'PROVIDER_UNAVAILABLE');
});

Deno.test('Drive statuses map to stable retry semantics and public metadata is rejected', async () => {
  for (const [status, code, retryable] of [
    [404, 'SOURCE_NOT_FOUND', false], [403, 'PERMISSION_DENIED', false],
    [429, 'RATE_LIMITED', true], [503, 'PROVIDER_UNAVAILABLE', true],
  ] as const) {
    const instance = provider(async url => String(url).includes('oauth2.googleapis.com')
      ? json({ access_token: 'test-token', expires_in: 3600 })
      : new Response('{}', { status }));
    const error = await assertRejects(() => instance.getMetadata(fileId), StorageProviderError);
    assertEquals((error as StorageProviderError).code, code);
    assertEquals((error as StorageProviderError).retryable, retryable);
  }
  await expectCode(() => provider(async url => String(url).includes('oauth2.googleapis.com')
    ? json({ access_token: 'test-token', expires_in: 3600 })
    : json({ ...metadata, permissions: [{ type: 'anyone', role: 'reader' }] })).getMetadata(fileId), 'PUBLIC_OBJECT_REJECTED');
});

Deno.test('malformed locators and Drive metadata are rejected safely', async () => {
  const instance = provider(async url => String(url).includes('oauth2.googleapis.com')
    ? json({ access_token: 'test-token', expires_in: 3600 })
    : json({ id: fileId, name: 'missing fields' }));
  await expectCode(() => instance.getMetadata('https://example.test/not-an-id'), 'INVALID_LOCATOR');
  await expectCode(() => instance.getMetadata(fileId), 'MALFORMED_RESPONSE');
});
