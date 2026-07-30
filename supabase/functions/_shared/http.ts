export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  return json({ success: false, error: message }, status);
}

export async function readJson<T>(request: Request): Promise<T> {
  try { return await request.json() as T; }
  catch { throw new Error('INVALID_JSON'); }
}
