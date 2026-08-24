import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { getIngestionWorkerConfig, hasTrustedWorkerSecret } from './contract.ts';

Deno.test('worker requires an exact configured cron secret', () => {
  assertEquals(hasTrustedWorkerSecret('secret', 'secret'), true);
  assertEquals(hasTrustedWorkerSecret('secret', 'wrong'), false);
  assertEquals(hasTrustedWorkerSecret(null, 'secret'), false);
  assertEquals(hasTrustedWorkerSecret('secret', undefined), false);
});

Deno.test('worker bounds batch and lease configuration', () => {
  assertEquals(getIngestionWorkerConfig({ INGESTION_WORKER_BATCH_SIZE: '999', INGESTION_WORKER_LEASE_SECONDS: '1' }), {
    batchSize: 50, leaseSeconds: 30,
  });
});
