import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { getWorkerConfig, hasTrustedWorkerSecret } from './contract.ts';

Deno.test('worker invocation requires an exact configured secret', () => {
  assertEquals(hasTrustedWorkerSecret('secret', 'secret'), true);
  assertEquals(hasTrustedWorkerSecret('secret', 'wrong'), false);
  assertEquals(hasTrustedWorkerSecret('secret', undefined), false);
  assertEquals(hasTrustedWorkerSecret(null, 'secret'), false);
});

Deno.test('worker config remains bounded by queue safety limits', () => {
  assertEquals(getWorkerConfig({ EMAIL_WORKER_BATCH_SIZE: '999', EMAIL_WORKER_LEASE_SECONDS: '1', EMAIL_PROVIDER_TIMEOUT_MS: '60000' }), {
    batchSize: 50,
    leaseSeconds: 30,
    timeoutMs: 30000
  });
});
