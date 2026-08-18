import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { createIngestionHandler } from './handler.ts';

function buildHandler() {
  let clientCalls = 0;
  const handler = createIngestionHandler({
    expectedSecret: 'cron-secret',
    config: { batchSize: 10, leaseSeconds: 300 },
    createAdminClient: () => {
      clientCalls += 1;
      return { rpc: async () => ({ data: [], error: null }) };
    },
    workerId: () => 'test-worker'
  });
  return { handler, getClientCalls: () => clientCalls };
}

Deno.test('missing or wrong cron secret is rejected before a job can be claimed', async () => {
  const missing = buildHandler();
  const missingResponse = await missing.handler(new Request('https://example.test', { method: 'POST' }));
  assertEquals(missingResponse.status, 403);
  assertEquals(missing.getClientCalls(), 0);

  const wrong = buildHandler();
  const wrongResponse = await wrong.handler(new Request('https://example.test', {
    method: 'POST', headers: { 'x-cron-secret': 'wrong' }
  }));
  assertEquals(wrongResponse.status, 403);
  assertEquals(wrong.getClientCalls(), 0);
});

Deno.test('correct cron secret has a clean success response when no jobs are available', async () => {
  const runtime = buildHandler();
  const response = await runtime.handler(new Request('https://example.test', {
    method: 'POST', headers: { 'x-cron-secret': 'cron-secret' }
  }));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    success: true, claimed: 0, succeeded: 0, retried: 0, failed: 0, stale: 0, rpcErrors: 0
  });
  assertEquals(runtime.getClientCalls(), 1);
});
