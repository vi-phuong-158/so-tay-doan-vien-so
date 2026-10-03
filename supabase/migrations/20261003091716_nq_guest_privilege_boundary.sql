-- Legacy ownership policies also match anonymous Auth's authenticated role.
-- Keep registered NQ identities out of non-quiz personal data surfaces without
-- changing permanent users or anonymous identities belonging to other features.
do $$
declare surface text;
begin
  foreach surface in array array[
    'ai_conversations', 'ai_messages', 'ai_message_sources', 'ai_feedback',
    'announcement_reads'
  ] loop
    execute format(
      'create policy "NQ guests cannot use non-quiz personal data" on public.%I
       as restrictive for all to authenticated
       using (not public.is_nq_300_guest())
       with check (not public.is_nq_300_guest())', surface
    );
  end loop;
end;
$$;

create policy "NQ guests cannot edit account profiles"
on public.profiles as restrictive for update to authenticated
using (not public.is_nq_300_guest())
with check (not public.is_nq_300_guest());
