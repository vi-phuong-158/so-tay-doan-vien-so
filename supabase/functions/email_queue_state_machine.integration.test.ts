import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { assertEquals, assert } from 'https://deno.land/std@0.177.0/testing/asserts.ts';

const url = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

async function rpc<T>(client: any, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data as T;
}

const testOptions = {
  name: 'email queue enqueue and claim are safe under concurrent calls',
  ignore: !url || !serviceRoleKey,
  fn: async () => {
    const admin = createClient(url!, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const queueIds: string[] = [];
    const recipientId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const sourceId = crypto.randomUUID();
    const enqueueArgs = {
      p_template_code: 'TEST_EMAIL',
      p_recipient_user_id: recipientId,
      p_source_entity_type: 'integration_test',
      p_source_entity_id: sourceId,
      p_event_revision: 'concurrent-v1',
      p_payload: { kind: 'concurrency-test' },
      p_scheduled_at: new Date().toISOString(),
      p_max_attempts: 3
    };

    try {
      const enqueues = await Promise.all(
        Array.from({ length: 12 }, () => rpc<any[]>(admin, 'enqueue_email_for_user_event', enqueueArgs))
      );
      const enqueueRows = enqueues.flat();
      assertEquals(new Set(enqueueRows.map(row => row.queue_id)).size, 1);
      assertEquals(enqueueRows.filter(row => row.created).length, 1);
      const queueId = enqueueRows[0].queue_id as string;
      queueIds.push(queueId);

      const claims = await Promise.all([
        rpc<any[]>(admin, 'claim_email_queue', { p_worker_id: 'integration-worker-a', p_batch_size: 10, p_lease_seconds: 300 }),
        rpc<any[]>(admin, 'claim_email_queue', { p_worker_id: 'integration-worker-b', p_batch_size: 10, p_lease_seconds: 300 })
      ]);
      const claimedRows = claims.flat();
      assertEquals(claimedRows.length, 1);
      assertEquals(claimedRows[0].id, queueId);
      assert(claimedRows[0].claim_token);
      assertEquals(claimedRows[0].status, 'PROCESSING');

      const staleSourceId = crypto.randomUUID();
      const staleEnqueue = await rpc<any[]>(admin, 'enqueue_email_for_user_event', {
        ...enqueueArgs,
        p_source_entity_id: staleSourceId,
        p_event_revision: 'stale-v1'
      });
      const staleId = staleEnqueue[0].queue_id as string;
      queueIds.push(staleId);
      const staleClaim = (await rpc<any[]>(admin, 'claim_email_queue', {
        p_worker_id: 'integration-stale-a', p_batch_size: 10, p_lease_seconds: 300
      }))[0];
      assertEquals(staleClaim.id, staleId);
      const { error: leaseError } = await admin
        .from('email_queue')
        .update({ lease_expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq('id', staleId);
      if (leaseError) throw leaseError;

      const reclaimed = (await rpc<any[]>(admin, 'claim_email_queue', {
        p_worker_id: 'integration-stale-b', p_batch_size: 10, p_lease_seconds: 300
      }))[0];
      assertEquals(reclaimed.id, staleId);
      assertEquals(reclaimed.worker_id, 'integration-stale-b');
      const oldOwnerResult = await rpc<boolean>(admin, 'mark_email_sent', {
        p_queue_id: staleId,
        p_claim_token: staleClaim.claim_token,
        p_provider: 'P3_FAKE'
      });
      assertEquals(oldOwnerResult, false);
      const newOwnerResult = await rpc<boolean>(admin, 'mark_email_retry', {
        p_queue_id: staleId,
        p_claim_token: reclaimed.claim_token,
        p_error_code: 'STALE_INTEGRATION_TEST',
        p_error_message: 'reclaimed by the current owner',
        p_retryable: false
      });
      assertEquals(newOwnerResult, true);
    } finally {
      if (queueIds.length) {
        await admin.from('email_queue').delete().in('id', queueIds);
      }
    }
  }
};

Deno.test(testOptions);
