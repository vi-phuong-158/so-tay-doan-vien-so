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
    }
  };
}

Deno.test('NO_OP worker claims and completes a bounded job without external providers', async () => {
  const client = fakeClient([{ id: 'job-1', job_kind: 'EXTRACT', claim_token: 'claim-1' }]);
  const result = await processIngestionBatch({ adminClient: client, workerId: 'worker-test', batchSize: 10, leaseSeconds: 300 });
  assertEquals(result, { claimed: 1, succeeded: 1, retried: 0, failed: 0, stale: 0, rpcErrors: 0 });
  assertEquals(client.calls.map(call => call.name), ['claim_ingestion_jobs', 'complete_ingestion_job']);
  assertEquals(client.calls[1].args.p_result, { handler: 'NO_OP' });
});

Deno.test('a simulated handler failure transitions through the database retry policy', async () => {
  const client = fakeClient([{ id: 'job-failure', job_kind: 'EXTRACT', claim_token: 'claim-failure' }]);
  const result = await processIngestionBatch({
    adminClient: client, workerId: 'worker-test', batchSize: 1, leaseSeconds: 300,
    execute: async () => { throw new Error('fixture'); }
  });
  assertEquals(result.retried, 1);
  assertEquals(client.calls.map(call => call.name), ['claim_ingestion_jobs', 'fail_ingestion_job']);
  assertEquals(client.calls[1].args.p_error_code, 'NO_OP_HANDLER_FAILED');
});

Deno.test('two near-concurrent worker calls cannot share a job when claim RPC returns distinct leases', async () => {
  const claimed = new Set<string>();
  const client = {
    rpc: async (name: string, _args: Record<string, unknown>) => {
      if (name === 'claim_ingestion_jobs') {
        if (claimed.has('job-race')) return { data: [], error: null };
        claimed.add('job-race');
        return { data: [{ id: 'job-race', job_kind: 'EXTRACT', claim_token: 'claim-race' }], error: null };
      }
      return { data: true, error: null };
    }
  };
  const [first, second] = await Promise.all([
    processIngestionBatch({ adminClient: client, workerId: 'worker-a', batchSize: 1, leaseSeconds: 300 }),
    processIngestionBatch({ adminClient: client, workerId: 'worker-b', batchSize: 1, leaseSeconds: 300 })
  ]);
  assertEquals(first.claimed + second.claimed, 1);
  assertEquals(first.succeeded + second.succeeded, 1);
});

Deno.test('worker responses retain only operational counts, never a claimed job payload', async () => {
  const client = fakeClient([{ id: 'job-safe-output', job_kind: 'EXTRACT', claim_token: 'claim-safe-output', payload: { content: 'secret' } }]);
  const result = await processIngestionBatch({ adminClient: client, workerId: 'worker-test', batchSize: 1, leaseSeconds: 300 });
  assertEquals(JSON.stringify(result).includes('secret'), false);
  assertEquals(JSON.stringify(result).includes('payload'), false);
});
