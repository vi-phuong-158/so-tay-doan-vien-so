import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { getQueueWorkerStatus } from './contract.ts';

Deno.test('process-email-queue remains disabled before provider integration', () => {
  const status = getQueueWorkerStatus();
  assertEquals(status.code, 'EMAIL_PROVIDER_DEFERRED');
  assertStringIncludes(status.message, 'P3-03');
});
