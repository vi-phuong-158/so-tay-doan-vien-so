import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { corsHeaders, errorResponse, json } from '../_shared/http.ts';
import { hasTrustedWorkerSecret, parseReminderRequest } from './contract.ts';

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

    const rawBody = await request.text();
    const body = rawBody.trim() ? JSON.parse(rawBody) : {};
    const { asOf } = parseReminderRequest(body);
    const adminClient = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data, error } = await adminClient.rpc('scan_report_reminders', {
      p_as_of: asOf ?? new Date().toISOString()
    });
    if (error) throw error;

    return json({ success: true, result: data?.[0] ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(
      new Error(message.includes('FORBIDDEN') ? 'FORBIDDEN' : message),
      message.includes('FORBIDDEN') ? 403 : 503
    );
  }
});
