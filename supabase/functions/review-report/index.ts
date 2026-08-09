import { clients, requireUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, json, readJson } from '../_shared/http.ts';
import { assertUuid, safeText } from '../_shared/validation.ts';

type Payload = { assignment_id: string; action: 'ACCEPTED' | 'NEEDS_SUPPLEMENT' | 'EXEMPTED'; reason?: string };

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { userClient, adminClient } = clients(request);
    await requireUser(userClient);
    const body = await readJson<Payload>(request);
    const id = assertUuid(body.assignment_id);
    if (!['ACCEPTED', 'NEEDS_SUPPLEMENT', 'EXEMPTED'].includes(body.action)) throw new Error('INVALID_ACTION');
    const reason = safeText(body.reason, 2000);

    // All authorization (scope), state-machine transition guards, review_status sync, history and
    // audit happen atomically inside the RPC (called with the user's JWT so auth.uid() is the actor).
    const { data: rows, error } = await userClient.rpc('review_report_assignment', {
      p_assignment_id: id,
      p_action: body.action,
      p_reason: reason,
    });
    if (error) throw error;
    const result = rows?.[0];
    if (!result) throw new Error('REVIEW_FAILED');

    // Best-effort in-app notification to the submitter (never rolls back the committed review).
    if (result.notified_user_id) {
      await adminClient.from('notifications').insert({
        user_id: result.notified_user_id,
        type: `REPORT_${result.resulting_status}`,
        title: result.resulting_status === 'ACCEPTED' ? 'Báo cáo đã hoàn thành' : 'Báo cáo cần cập nhật',
        body: reason || 'Bản nộp đã được xử lý.',
        action_url: `/cong-viec/bao-cao/${result.campaign_id}`,
      });
    }

    return json({ success: true, status: result.resulting_status });
  } catch (error) {
    const message = String(error);
    const status = message.includes('UNAUTHENTICATED') ? 401
      : (message.includes('SCOPE_DENIED') || message.includes('FORBIDDEN')) ? 403
      : 400;
    return errorResponse(error, status);
  }
});
