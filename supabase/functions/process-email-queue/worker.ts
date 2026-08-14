import { renderQueueEmail, TemplateError, type QueueTemplateRow } from './renderer.ts';
import { ProviderError, type ProviderResult, type TransactionalEmail } from './provider.ts';

export type WorkerQueueClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type WorkerProvider = {
  send: (email: TransactionalEmail) => Promise<ProviderResult>;
};

export type WorkerResult = {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  stale: number;
  rpcErrors: number;
  skippedNotAllowlisted: number;
};

function classifyWorkerError(error: unknown): { code: string; retryable: boolean; message: string } {
  if (error instanceof TemplateError) return { code: error.code, retryable: false, message: error.code };
  if (error instanceof ProviderError) return { code: error.code, retryable: error.retryable, message: error.message };
  return { code: 'WORKER_UNKNOWN_ERROR', retryable: true, message: 'Worker processing failed' };
}

export async function processQueueBatch(options: {
  adminClient: WorkerQueueClient;
  provider: WorkerProvider;
  workerId: string;
  batchSize: number;
  leaseSeconds: number;
  appUrl?: string;
  // Gate applied to every claimed row before the provider is ever invoked. Omit (or
  // always return true) for unrestricted delivery; the caller decides the policy
  // (delivery mode) — this function only enforces whatever gate it is given.
  isRecipientAllowed?: (recipientEmail: string) => boolean;
}): Promise<WorkerResult> {
  const { data, error } = await options.adminClient.rpc('claim_email_queue', {
    p_worker_id: options.workerId,
    p_batch_size: Math.min(Math.max(options.batchSize, 1), 50),
    p_lease_seconds: options.leaseSeconds
  });
  if (error) throw new Error('QUEUE_CLAIM_FAILED');

  const rows = (data ?? []) as Array<QueueTemplateRow & { claim_token: string }>;
  const result: WorkerResult = {
    claimed: rows.length, sent: 0, retried: 0, failed: 0, stale: 0, rpcErrors: 0, skippedNotAllowlisted: 0
  };

  for (const row of rows) {
    if (options.isRecipientAllowed && !options.isRecipientAllowed(row.recipient_email)) {
      const transition = await options.adminClient.rpc('mark_email_retry', {
        p_queue_id: row.id,
        p_claim_token: row.claim_token,
        p_error_code: 'RECIPIENT_NOT_ALLOWLISTED',
        p_error_message: 'Recipient is not in the configured delivery allowlist',
        p_retryable: false
      });
      if (transition.error) result.rpcErrors += 1;
      else if (transition.data !== true) result.stale += 1;
      else result.skippedNotAllowlisted += 1;
      continue;
    }

    try {
      const rendered = renderQueueEmail(row, options.appUrl);
      const providerResult = await options.provider.send({
        to: row.recipient_email,
        from: '',
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        idempotencyKey: `email:${row.id}`
      });
      const completion = await options.adminClient.rpc('mark_email_sent', {
        p_queue_id: row.id,
        p_claim_token: row.claim_token,
        p_provider: providerResult.provider,
        p_provider_message_id: providerResult.providerMessageId,
        p_provider_code: providerResult.providerCode
      });
      if (completion.error) {
        result.rpcErrors += 1;
      } else if (completion.data === true) {
        result.sent += 1;
      } else {
        result.stale += 1;
      }
    } catch (error) {
      const failure = classifyWorkerError(error);
      const transition = await options.adminClient.rpc('mark_email_retry', {
        p_queue_id: row.id,
        p_claim_token: row.claim_token,
        p_error_code: failure.code,
        p_error_message: failure.message,
        p_retryable: failure.retryable
      });
      if (transition.error) {
        result.rpcErrors += 1;
      } else if (transition.data !== true) {
        result.stale += 1;
      } else if (failure.retryable) {
        result.retried += 1;
      } else {
        result.failed += 1;
      }
    }
  }
  return result;
}
