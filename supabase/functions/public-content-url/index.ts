import { clients } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, json, readJson } from '../_shared/http.ts';
import { assertUuid } from '../_shared/validation.ts';

type Payload = { content_type?: string; content_id?: string };

function statusFor(code: string): number {
  if (code === 'CONTENT_NOT_FOUND') return 404;
  if (code === 'METHOD_NOT_ALLOWED') return 405;
  return 400;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse(new Error('METHOD_NOT_ALLOWED'), 405);

  try {
    const { adminClient } = clients(request);
    const payload = await readJson<Payload>(request);
    const contentId = assertUuid(payload.content_id, 'INVALID_CONTENT_ID');
    let bucket = '';
    let storagePath: string | null = null;

    if (payload.content_type === 'DOCUMENT') {
      const { data, error } = await adminClient
        .from('documents')
        .select('storage_path')
        .eq('id', contentId)
        .eq('status', 'PUBLISHED')
        .eq('visibility_level', 'PUBLIC')
        .maybeSingle();
      if (error) throw new Error('CONTENT_LOOKUP_FAILED');
      storagePath = data?.storage_path ?? null;
      bucket = 'documents-private';
    } else if (payload.content_type === 'LEARNING_RESOURCE') {
      const { data: resource, error: resourceError } = await adminClient
        .from('learning_resources')
        .select('topic_id, storage_path')
        .eq('id', contentId)
        .maybeSingle();
      if (resourceError || !resource) throw new Error('CONTENT_NOT_FOUND');
      const { data: topic, error: topicError } = await adminClient
        .from('learning_topics')
        .select('id')
        .eq('id', resource.topic_id)
        .eq('status', 'PUBLISHED')
        .eq('visibility_level', 'PUBLIC')
        .maybeSingle();
      if (topicError || !topic) throw new Error('CONTENT_NOT_FOUND');
      storagePath = resource.storage_path ?? null;
      bucket = 'learning-resources-private';
    } else {
      throw new Error('INVALID_CONTENT_TYPE');
    }

    if (!storagePath) throw new Error('CONTENT_NOT_FOUND');
    const { data, error } = await adminClient.storage.from(bucket).createSignedUrl(storagePath, 60);
    if (error || !data?.signedUrl) throw new Error('SIGNED_URL_FAILED');
    return json({ success: true, signed_url: data.signedUrl });
  } catch (error) {
    const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,63}$/.test(error.message)
      ? error.message
      : 'PUBLIC_CONTENT_URL_FAILED';
    return errorResponse(new Error(code), statusFor(code));
  }
});
