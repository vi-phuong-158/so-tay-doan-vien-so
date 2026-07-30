import { clients, requireUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, json, readJson } from '../_shared/http.ts';
import { safeText } from '../_shared/validation.ts';
Deno.serve(async request => {
  if(request.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  try{
    const {userClient,adminClient}=clients(request); const user=await requireUser(userClient); const body=await readJson<Record<string,unknown>>(request);
    const {data:profile,error:profileError}=await adminClient.from('profiles').select('organization_id').eq('id',user.id).single(); if(profileError) throw profileError;
    const row={ title:safeText(body.title,200),submitted_by:user.id,organization_id:profile.organization_id,current_process:safeText(body.current_process,6000),pain_point:safeText(body.pain_point,6000),frequency:safeText(body.frequency,500),impact:safeText(body.impact,3000),desired_outcome:safeText(body.desired_outcome,3000),urgency:['LOW','MEDIUM','HIGH'].includes(String(body.urgency))?body.urgency:'MEDIUM',current_tools:safeText(body.current_tools,2000),visibility_level:'ORGANIZATION_ONLY',status:'NEW' };
    if(!row.title||!row.pain_point) throw new Error('REQUIRED_FIELDS_MISSING');
    const {data,error}=await userClient.from('innovation_problems').insert(row).select('id,status,created_at').single(); if(error) throw error;
    const {data:admins}=await adminClient.from('user_roles').select('user_id').in('role_code',['YOUTH_ADMIN','SYSTEM_ADMIN']);
    if(admins?.length) await adminClient.from('notifications').insert(admins.map(a=>({user_id:a.user_id,type:'INNOVATION_PROBLEM_NEW',title:'Có bài toán mới cần sàng lọc',body:row.title,action_url:`/admin/doi-moi-sang-tao?problem=${data.id}`})));
    return json({success:true,problem:data},201);
  }catch(error){return errorResponse(error,String(error).includes('UNAUTHENTICATED')?401:400)}
});
