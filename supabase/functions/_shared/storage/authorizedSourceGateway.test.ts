import { assertEquals, assertRejects } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { StorageProviderError } from './contract.ts';
import { readAuthorizedGoogleDriveSource } from './authorizedSourceGateway.ts';

const source = {
  documentId: 'document-123', fileProvider: 'GOOGLE_DRIVE' as const,
  externalFileId: 'drive-file-123', storagePath: null,
};

Deno.test('authorization gate denies before Google provider receives a locator', async () => {
  let providerCalls = 0;
  const error = await assertRejects(() => readAuthorizedGoogleDriveSource({
    source,
    canAccessDocument: async () => false,
    provider: { read: async () => { providerCalls += 1; return new Uint8Array(); } },
  }), StorageProviderError);
  assertEquals((error as StorageProviderError).code, 'PERMISSION_DENIED');
  assertEquals(providerCalls, 0);
});

Deno.test('authorized source uses the opaque locator only after Supabase authorization', async () => {
  const calls: string[] = [];
  const bytes = await readAuthorizedGoogleDriveSource({
    source,
    canAccessDocument: async documentId => documentId === source.documentId,
    provider: { read: async locator => { calls.push(locator); return new TextEncoder().encode('synthetic'); } },
  });
  assertEquals(new TextDecoder().decode(bytes), 'synthetic');
  assertEquals(calls, [source.externalFileId]);
});

Deno.test('a source violating the provider-neutral database invariant never calls the provider', async () => {
  let providerCalls = 0;
  const error = await assertRejects(() => readAuthorizedGoogleDriveSource({
    source: { ...source, storagePath: 'legacy-path' },
    canAccessDocument: async () => true,
    provider: { read: async () => { providerCalls += 1; return new Uint8Array(); } },
  }), StorageProviderError);
  assertEquals((error as StorageProviderError).code, 'INVALID_LOCATOR');
  assertEquals(providerCalls, 0);
});
