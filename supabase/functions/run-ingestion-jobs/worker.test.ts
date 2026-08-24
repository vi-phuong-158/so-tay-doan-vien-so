import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { processIngestionBatch } from './worker.ts';

function fakeClient(rows: any[]) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === 'claim_ingestion_jobs') return { data: rows, error: null };
      return { data: true, error: null };
    },
  };
}

Deno.test('foundation worker claims and completes a bounded no-op job', async () => {
  const client = fakeClient([{ id: 'job-1', job_kind: 'SOURCE_READY', claim_token: 'claim-1' }]);
  const result = await processIngestionBatch({ adminClient: client, workerId: 'worker-test', batchSize: 10, leaseSeconds: 300 });
  assertEquals(result, { claimed: 1, succeeded: 1, retried: 0, failed: 0, stale: 0, rpcErrors: 0 });
  assertEquals(client.calls.map(call => call.name), ['claim_ingestion_jobs', 'complete_ingestion_job']);
  assertEquals(client.calls[1].args.p_result, { handler: 'NO_OP_FOUNDATION' });
});

Deno.test('handler failure uses the database retry transition', async () => {
  const client = fakeClient([{ id: 'job-failure', job_kind: 'SOURCE_READY', claim_token: 'claim-failure' }]);
  const result = await processIngestionBatch({
    adminClient: client, workerId: 'worker-test', batchSize: 1, leaseSeconds: 300,
    execute: async () => { throw new Error('fixture'); },
  });
  assertEquals(result.retried, 1);
  assertEquals(client.calls.map(call => call.name), ['claim_ingestion_jobs', 'fail_ingestion_job']);
  assertEquals(client.calls[1].args.p_error_code, 'NO_OP_HANDLER_FAILED');
});

Deno.test('near-concurrent worker calls cannot share a claimed job', async () => {
  const claimed = new Set<string>();
  const client = {
    rpc: async (name: string, _args: Record<string, unknown>) => {
      if (name === 'claim_ingestion_jobs') {
        if (claimed.has('job-race')) return { data: [], error: null };
        claimed.add('job-race');
        return { data: [{ id: 'job-race', job_kind: 'SOURCE_READY', claim_token: 'claim-race' }], error: null };
      }
      return { data: true, error: null };
    },
  };
  const [first, second] = await Promise.all([
    processIngestionBatch({ adminClient: client, workerId: 'worker-a', batchSize: 1, leaseSeconds: 300 }),
    processIngestionBatch({ adminClient: client, workerId: 'worker-b', batchSize: 1, leaseSeconds: 300 }),
  ]);
  assertEquals(first.claimed + second.claimed, 1);
  assertEquals(first.succeeded + second.succeeded, 1);
});
