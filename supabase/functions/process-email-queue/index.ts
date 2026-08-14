import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { corsHeaders, errorResponse, json } from '../_shared/http.ts';
import { getWorkerConfig, hasTrustedWorkerSecret } from './contract.ts';
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
      appUrl: Deno.env.get('APP_URL') ?? undefined
    });
    return json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(new Error(message.includes('FORBIDDEN') ? 'FORBIDDEN' : message), message.includes('FORBIDDEN') ? 403 : 503);
  }
});
