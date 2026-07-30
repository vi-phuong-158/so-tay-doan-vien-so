import { clients, requireAnyRole, requireUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, json, readJson } from '../_shared/http.ts';
import { assertUuid, safeText } from '../_shared/validation.ts';

type Payload = { assignment_id: string; action: 'ACCEPTED'|'NEEDS_SUPPLEMENT'|'EXEMPTED'; reason?: string };
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { userClient, adminClient } = clients(request); const user = await requireUser(userClient); await requireAnyRole(adminClient,user.id,['YOUTH_ADMIN','SYSTEM_ADMIN']);
    const body = await readJson<Payload>(request); const id = assertUuid(body.assignment_id); if (!['ACCEPTED','NEEDS_SUPPLEMENT','EXEMPTED'].includes(body.action)) throw new Error('INVALID_ACTION');
    const reason = safeText(body.reason,2000); if (body.action !== 'ACCEPTED' && !reason) throw new Error('REASON_REQUIRED');
    const { data: assignment, error } = await adminClient.from('report_assignments').select('*,report_submissions(id,submitted_by,version_number)').eq('id',id).single(); if (error) throw error;
    const patch: Record<string,unknown> = { status: body.action, updated_at: new Date().toISOString() };
    if (body.action==='ACCEPTED') patch.accepted_at=new Date().toISOString();
    if (body.action==='EXEMPTED') { patch.exempted_at=new Date().toISOString(); patch.exempt_reason=reason; }
    const { error: updateError } = await adminClient.from('report_assignments').update(patch).eq('id',id); if (updateError) throw updateError;
    await adminClient.from('report_status_history').insert({ assignment_id:id, from_status:assignment.status, to_status:body.action, changed_by:user.id, reason });
    const latest = [...(assignment.report_submissions || [])].sort((a,b)=>b.version_number-a.version_number)[0];
    if (latest?.submitted_by) await adminClient.from('notifications').insert({ user_id:latest.submitted_by,type:`REPORT_${body.action}`,title:body.action==='ACCEPTED'?'Báo cáo đã hoàn thành':'Báo cáo cần cập nhật',body:reason || 'Bản nộp đã được xác nhận.',action_url:`/cong-viec/bao-cao/${assignment.campaign_id}` });
    await adminClient.from('audit_logs').insert({ actor_user_id:user.id,action:'REPORT_REVIEWED',entity_type:'report_assignment',entity_id:id,organization_id:assignment.organization_id,before_data:{status:assignment.status},after_data:{status:body.action,reason} });
    return json({success:true,status:body.action});
  } catch(error){ return errorResponse(error,String(error).includes('UNAUTHENTICATED')?401:String(error).includes('FORBIDDEN')?403:400); }
});
