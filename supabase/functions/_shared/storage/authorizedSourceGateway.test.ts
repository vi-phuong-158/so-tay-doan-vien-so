import { assertEquals, assertRejects } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { readAuthorizedSource } from './authorizedSourceGateway.ts';
import { StorageProviderError } from './contract.ts';

const source = {
  documentId: 'document-123',
  providerKind: 'GOOGLE_DRIVE' as const,
  storagePath: null,
  externalFileId: 'drive-file-123',
};

Deno.test('authorization is checked before a provider receives a locator', async () => {
  let providerCalls = 0;
  const error = await assertRejects(() => readAuthorizedSource({
    source,
    canAccessDocument: async () => false,
    provider: { read: async () => { providerCalls += 1; return new Uint8Array(); } },
  }), StorageProviderError);
  assertEquals((error as StorageProviderError).code, 'PERMISSION_DENIED');
  assertEquals(providerCalls, 0);
});

Deno.test('authorized source uses an opaque provider locator after authorization', async () => {
  const locators: string[] = [];
  const bytes = await readAuthorizedSource({
    source,
    canAccessDocument: async documentId => documentId === source.documentId,
    provider: { read: async locator => { locators.push(locator); return new TextEncoder().encode('synthetic'); } },
  });
  assertEquals(new TextDecoder().decode(bytes), 'synthetic');
  assertEquals(locators, [source.externalFileId]);
});

Deno.test('a provider-neutral source invariant fails before the provider call', async () => {
  let providerCalls = 0;
  const error = await assertRejects(() => readAuthorizedSource({
    source: { ...source, storagePath: 'legacy-path' },
    canAccessDocument: async () => true,
    provider: { read: async () => { providerCalls += 1; return new Uint8Array(); } },
  }), StorageProviderError);
  assertEquals((error as StorageProviderError).code, 'INVALID_LOCATOR');
  assertEquals(providerCalls, 0);
});
