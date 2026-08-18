import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { createIngestionHandler, getRuntimeIngestionConfig } from './handler.ts';

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

Deno.serve(createIngestionHandler({
  expectedSecret: Deno.env.get('CRON_SECRET'),
  config: getRuntimeIngestionConfig(),
  createAdminClient: () => createClient(
    requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } }
  ) as any,
  workerId: () => `ingestion-worker-${crypto.randomUUID()}`
}));
