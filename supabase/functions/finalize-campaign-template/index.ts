import { clients, requireUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, json, readJson } from '../_shared/http.ts';
import { assertUuid, fileExtension, safeFileName } from '../_shared/validation.ts';

type Payload = { campaign_id: string; storage_path: string; original_name: string };

const BUCKET = 'report-templates-private';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let moved: { from: string; to: string } | null = null;
  try {
    const { userClient, adminClient } = clients(request);
    await requireUser(userClient);
    const body = await readJson<Payload>(request);
    const campaignId = assertUuid(body.campaign_id);
    const safeName = safeFileName(body.original_name);
    const expectedPrefix = `${campaignId}/staging/`;
    const sourceSegments = String(body.storage_path || '').split('/');
    if (
      !body.storage_path?.startsWith(expectedPrefix)
      || sourceSegments.length !== 3
      || sourceSegments[1] !== 'staging'
      || !sourceSegments[2]
      || body.storage_path.includes('..')
    ) throw new Error('TEMPLATE_SCOPE_INVALID');

    const objectName = sourceSegments[2];
    if (objectName.length < 38 || objectName[36] !== '-') throw new Error('TEMPLATE_SCOPE_INVALID');
    assertUuid(objectName.slice(0, 36), 'TEMPLATE_SCOPE_INVALID');
    const folder = body.storage_path.slice(0, body.storage_path.lastIndexOf('/'));
    const { data: listed, error: listError } = await adminClient.storage.from(BUCKET).list(folder, { limit: 100, search: objectName });
    if (listError) throw listError;
    const object = listed?.find(item => item.name === objectName);
    const sizeBytes = Number(object?.metadata?.size);
    if (!object || !Number.isFinite(sizeBytes) || sizeBytes < 1) throw new Error('STORAGE_OBJECT_NOT_FOUND');

    // The database RPC remains the source of truth for draft state, scope, extension and size.
    // This check only prevents moving a malformed client request before the RPC validates it again.
    if (!fileExtension(body.original_name)) throw new Error('INVALID_TEMPLATE_METADATA');
    const finalPath = `${campaignId}/${objectName.slice(0, 36)}-${safeName}`;
    const { error: moveError } = await adminClient.storage.from(BUCKET).move(body.storage_path, finalPath);
    if (moveError) throw moveError;
    moved = { from: body.storage_path, to: finalPath };

    const { data, error: rpcError } = await userClient.rpc('register_report_campaign_template', {
      p_campaign_id: campaignId,
      p_storage_path: finalPath,
      p_file_name: body.original_name,
      p_mime_type: object.metadata?.mimetype ?? null,
      p_size_bytes: sizeBytes
    });
    if (rpcError) throw rpcError;
    const template = Array.isArray(data) ? data[0] : data;
    if (!template) throw new Error('TEMPLATE_REGISTER_FAILED');
    return json({ success: true, template }, 201);
  } catch (error) {
    if (moved) {
      const { adminClient } = clients(request);
      const { error: rollbackError } = await adminClient.storage.from(BUCKET).move(moved.to, moved.from);
      if (rollbackError) await adminClient.storage.from(BUCKET).remove([moved.to]);
    }
    const message = String(error);
    return errorResponse(error,
      message.includes('UNAUTHENTICATED') ? 401
        : ['ACCOUNT_NOT_ACTIVE', 'REPORT_CAMPAIGN_SCOPE_DENIED', 'ASSIGNMENT_SCOPE_DENIED'].some(code => message.includes(code)) ? 403
          : 400
    );
  }
});
