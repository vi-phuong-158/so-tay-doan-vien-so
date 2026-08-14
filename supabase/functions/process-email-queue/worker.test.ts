import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { processQueueBatch } from './worker.ts';
import { ProviderError } from './provider.ts';

const row = (id: string) => ({
  id,
  template_code: 'SYSTEM_EMAIL_TEST',
  recipient_email: 'recipient@example.com',
  recipient_name: 'Test recipient',
  payload: { title: 'Test', message: 'Hello' },
  claim_token: `token-${id}`
});

function fakeClient(rows: any[]) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === 'claim_email_queue') return { data: rows, error: null };
      return { data: true, error: null };
    }
  };
}

Deno.test('worker claims through RPC, sends, and persists provider metadata', async () => {
  const client = fakeClient([row('queue-success')]);
  const result = await processQueueBatch({
    adminClient: client,
    provider: { send: async email => ({ provider: 'RESEND', providerMessageId: 'msg-1', providerCode: 'HTTP_200' }) },
    workerId: 'worker-test', batchSize: 50, leaseSeconds: 300, appUrl: 'https://app.example'
  });
  assertEquals(result, { claimed: 1, sent: 1, retried: 0, failed: 0, stale: 0, rpcErrors: 0 });
  assertEquals(client.calls.map(call => call.name), ['claim_email_queue', 'mark_email_sent']);
  assertEquals(client.calls[1].args.p_provider_message_id, 'msg-1');
  assertEquals(client.calls[1].args.p_provider_code, 'HTTP_200');
});

Deno.test('worker maps transient and permanent provider failures through queue retry RPC', async () => {
  const transient = fakeClient([row('queue-transient')]);
  const transientResult = await processQueueBatch({
    adminClient: transient,
    provider: { send: async () => { throw new ProviderError('RATE_LIMITED', true, 429); } },
    workerId: 'worker-test', batchSize: 1, leaseSeconds: 300
  });
  assertEquals(transientResult.retried, 1);
  assertEquals(transient.calls[1].args.p_retryable, true);

  const permanent = fakeClient([row('queue-permanent')]);
  const permanentResult = await processQueueBatch({
    adminClient: permanent,
    provider: { send: async () => { throw new ProviderError('INVALID_RECIPIENT', false, 422); } },
    workerId: 'worker-test', batchSize: 1, leaseSeconds: 300
  });
  assertEquals(permanentResult.failed, 1);
  assertEquals(permanent.calls[1].args.p_retryable, false);
});

Deno.test('malformed queue payload fails without calling provider', async () => {
  const client = fakeClient([{ ...row('queue-malformed'), payload: { message: 123 } }]);
  let providerCalls = 0;
  const result = await processQueueBatch({
    adminClient: client,
    provider: { send: async () => { providerCalls += 1; return { provider: 'RESEND', providerMessageId: 'never', providerCode: 'HTTP_200' }; } },
    workerId: 'worker-test', batchSize: 1, leaseSeconds: 300
  });
  assertEquals(providerCalls, 0);
  assertEquals(result.failed, 1);
  assertEquals(client.calls[1].args.p_error_code, 'TEMPLATE_MESSAGE_INVALID');
});
