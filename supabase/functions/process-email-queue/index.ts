import { corsHeaders, errorResponse, json } from '../_shared/http.ts';
import { getQueueWorkerStatus } from './contract.ts';

// P3-02 owns the database lifecycle only. Provider delivery is intentionally
// disabled until P3-03 supplies a provider adapter and its secret boundary.
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse(new Error('METHOD_NOT_ALLOWED'), 405);

  try {
    const expectedSecret = Deno.env.get('CRON_SECRET');
    if (!expectedSecret || request.headers.get('x-cron-secret') !== expectedSecret) {
      throw new Error('FORBIDDEN');
    }

    const workerStatus = getQueueWorkerStatus();
    return json({ success: false, ...workerStatus }, 503);
  } catch (error) {
    return errorResponse(error, String(error).includes('FORBIDDEN') ? 403 : 400);
  }
});
