import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { corsHeaders, errorResponse, json } from '../_shared/http.ts';
import { getEmailDeliveryConfig, getWorkerConfig, hasTrustedWorkerSecret, isRecipientAllowlisted } from './contract.ts';
import { createResendProvider } from './provider.ts';
import { processQueueBatch } from './worker.ts';

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse(new Error('METHOD_NOT_ALLOWED'), 405);

  try {
    if (!hasTrustedWorkerSecret(request.headers.get('x-cron-secret'), Deno.env.get('CRON_SECRET'))) {
      throw new Error('FORBIDDEN');
    }

    // Delivery mode is the first gate evaluated, before any provider secret is even read.
    // OFF (missing/invalid EMAIL_DELIVERY_MODE included) never claims a queue row and never
    // requires provider configuration to be present. This must stay fail-closed: only the
    // exact string LIVE reaches the unrestricted send path below.
    const delivery = getEmailDeliveryConfig({
      EMAIL_DELIVERY_MODE: Deno.env.get('EMAIL_DELIVERY_MODE'),
      EMAIL_TEST_RECIPIENTS: Deno.env.get('EMAIL_TEST_RECIPIENTS')
    });
    if (delivery.mode === 'OFF') {
      return json({
        success: true, delivery_mode: 'OFF',
        claimed: 0, sent: 0, retried: 0, failed: 0, stale: 0, rpcErrors: 0, skippedNotAllowlisted: 0
      });
    }

    const config = getWorkerConfig({
      EMAIL_WORKER_BATCH_SIZE: Deno.env.get('EMAIL_WORKER_BATCH_SIZE'),
      EMAIL_WORKER_LEASE_SECONDS: Deno.env.get('EMAIL_WORKER_LEASE_SECONDS'),
      EMAIL_PROVIDER_TIMEOUT_MS: Deno.env.get('EMAIL_PROVIDER_TIMEOUT_MS')
    });
    if ((Deno.env.get('EMAIL_PROVIDER') ?? 'RESEND') !== 'RESEND') {
      throw new Error('EMAIL_PROVIDER_UNSUPPORTED');
    }

    const provider = createResendProvider({
      apiKey: requiredEnv('EMAIL_PROVIDER_API_KEY'),
      fromAddress: requiredEnv('EMAIL_FROM_ADDRESS'),
      fromName: Deno.env.get('EMAIL_FROM_NAME') ?? undefined,
      baseUrl: Deno.env.get('EMAIL_PROVIDER_BASE_URL') ?? undefined,
      timeoutMs: config.timeoutMs
    });
    const adminClient = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const result = await processQueueBatch({
      adminClient: adminClient as any,
      provider,
      workerId: `email-worker-${crypto.randomUUID()}`,
      batchSize: config.batchSize,
      leaseSeconds: config.leaseSeconds,
      appUrl: Deno.env.get('APP_URL') ?? undefined,
      isRecipientAllowed: delivery.mode === 'ALLOWLIST'
        ? email => isRecipientAllowlisted(email, delivery.allowlist)
        : undefined
    });
    return json({ success: true, delivery_mode: delivery.mode, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(new Error(message.includes('FORBIDDEN') ? 'FORBIDDEN' : message), message.includes('FORBIDDEN') ? 403 : 503);
  }
});
