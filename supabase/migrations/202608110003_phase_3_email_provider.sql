-- Phase 3 / P3-03: provider metadata completion for the existing queue boundary.
-- Sending remains behind the service-role-only process-email-queue function.

alter table public.email_logs
  drop constraint if exists email_logs_provider_check,
  drop constraint if exists email_logs_provider_message_id_check,
  drop constraint if exists email_logs_provider_code_check,
  drop constraint if exists email_logs_error_code_check,
  drop constraint if exists email_logs_error_message_check;

alter table public.email_logs
  add constraint email_logs_provider_check
    check (provider is null or length(provider) between 1 and 64),
  add constraint email_logs_provider_message_id_check
    check (provider_message_id is null or length(provider_message_id) between 1 and 255),
  add constraint email_logs_provider_code_check
    check (provider_code is null or length(provider_code) between 1 and 64),
  add constraint email_logs_error_code_check
    check (error_code is null or length(error_code) between 1 and 64),
  add constraint email_logs_error_message_check
    check (error_message is null or length(error_message) <= 500);

create or replace function public.mark_email_sent(
  p_queue_id uuid,
  p_claim_token uuid,
  p_provider text,
  p_provider_message_id text,
  p_provider_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marked boolean;
begin
  v_marked := public.mark_email_sent(
    p_queue_id,
    p_claim_token,
    p_provider,
    p_provider_message_id
  );

  if not v_marked then
    return false;
  end if;

  update public.email_logs
  set provider_code = left(p_provider_code, 64)
  where id = (
    select l.id
    from public.email_logs l
    where l.queue_id = p_queue_id
      and l.status = 'SENT'
    order by l.completed_at desc nulls last, l.id desc
    limit 1
  );
  return true;
end;
$$;

revoke all on function public.mark_email_sent(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.mark_email_sent(uuid, uuid, text, text, text) to service_role;
