import { clients, requireUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, json, readJson } from '../_shared/http.ts';
import { assertUuid, safeText } from '../_shared/validation.ts';
import { getReviewHttpStatus, isReviewAction, type ReviewAction } from './contract.ts';

type Payload = { assignment_id: string; action: ReviewAction; reason?: string };

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { userClient } = clients(request);
    await requireUser(userClient);
    const body = await readJson<Payload>(request);
    const id = assertUuid(body.assignment_id);
    if (!isReviewAction(body.action)) throw new Error('INVALID_ACTION');
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

    return json({ success: true, status: result.resulting_status });
  } catch (error) {
    const message = String(error);
    return errorResponse(error, getReviewHttpStatus(message));
  }
});
