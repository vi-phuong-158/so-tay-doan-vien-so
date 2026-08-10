import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { getBundleHttpStatus, uniqueArchivePath } from './contract.ts';

Deno.test('bundle paths are deterministic and never overwrite duplicates', () => {
  const used = new Set<string>();
  assertEquals(uniqueArchivePath('campaign/org/v1/file.txt', used), 'campaign/org/v1/file.txt');
  assertEquals(uniqueArchivePath('campaign/org/v1/file.txt', used), 'campaign/org/v1/file-2.txt');
  assertEquals(uniqueArchivePath('campaign/org/v1/file.txt', used), 'campaign/org/v1/file-3.txt');
});

Deno.test('bundle limit and storage errors map to conflict responses', () => {
  assertEquals(getBundleHttpStatus('BUNDLE_FILE_LIMIT_EXCEEDED'), 409);
  assertEquals(getBundleHttpStatus('STORAGE_OBJECT_NOT_FOUND'), 409);
  assertEquals(getBundleHttpStatus('BUNDLE_TIMEOUT'), 504);
});
