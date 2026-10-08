-- Regression: NQ_300's anonymous Auth identity has the authenticated DB role and an INVITED
-- profile. Public documents must still be readable through documents' actual RLS policy, while
-- unpublished and non-public documents remain inaccessible to that guest.
begin;
set local search_path = public, extensions, pg_temp;
select plan(20);

insert into auth.users(id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data)
values (
  '6f937301-3b91-4c21-bde5-804359704011',
  'authenticated',
  'authenticated',
  true,
  '{"provider":"anonymous","providers":["anonymous"]}'::jsonb,
  '{}'::jsonb
);

-- Fresh CI resets run pgTAP before the standalone NQ_300 seed. Supply only the published metadata
-- the provisioning RPC needs; reuse an existing valid bank where the test environment has one.
do $$
declare
  v_topic_id uuid;
begin
  if not exists (
    select 1
    from public.quizzes q
    join public.learning_topics t on t.id = q.topic_id
    where q.bank_code = 'NQ_300'
      and q.status = 'PUBLISHED'
      and t.status = 'PUBLISHED'
      and t.visibility_level = 'PUBLIC'
  ) then
    if exists (select 1 from public.quizzes where bank_code = 'NQ_300') then
      raise exception 'NQ_300 exists but is not a published public quiz fixture';
    end if;

    insert into public.learning_topics (
      id, title, status, visibility_level, owner_organization_id, created_by
    ) values (
      '6f937301-3b91-4c21-bde5-804359704012',
      'NQ guest documents RLS fixture',
      'PUBLISHED',
      'PUBLIC',
      '11111111-1111-1111-1111-111111111111',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    ) returning id into v_topic_id;

    insert into public.quizzes(id, topic_id, title, status, bank_code)
    values (
      '6f937301-3b91-4c21-bde5-804359704013',
      v_topic_id,
      'NQ guest documents RLS fixture',
      'PUBLISHED',
      'NQ_300'
    );
  end if;
end;
$$;

insert into public.documents (
  id, title, document_number, document_type, issuing_authority, issued_date,
  status, visibility_level, owner_organization_id, created_by
) values
  ('6f937301-3b91-4c21-bde5-804359704021', 'NQ RLS public', 'NQ-RLS-01', 'Hướng dẫn', 'Ban TN', current_date,
   'PUBLISHED', 'PUBLIC', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('6f937301-3b91-4c21-bde5-804359704022', 'NQ RLS internal', 'NQ-RLS-02', 'Hướng dẫn', 'Ban TN', current_date,
   'PUBLISHED', 'INTERNAL_YOUTH', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('6f937301-3b91-4c21-bde5-804359704023', 'NQ RLS organization', 'NQ-RLS-03', 'Hướng dẫn', 'Ban TN', current_date,
   'PUBLISHED', 'ORGANIZATION_ONLY', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('6f937301-3b91-4c21-bde5-804359704024', 'NQ RLS restricted', 'NQ-RLS-04', 'Hướng dẫn', 'Ban TN', current_date,
   'PUBLISHED', 'RESTRICTED', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('6f937301-3b91-4c21-bde5-804359704025', 'NQ RLS pending public', 'NQ-RLS-05', 'Hướng dẫn', 'Ban TN', current_date,
   'PENDING_REVIEW', 'PUBLIC', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('6f937301-3b91-4c21-bde5-804359704026', 'NQ RLS withdrawn public', 'NQ-RLS-06', 'Hướng dẫn', 'Ban TN', current_date,
   'WITHDRAWN', 'PUBLIC', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.documents'::regclass),
  'documents RLS remains enabled'
);
select ok(
  (select p.prosecdef and 'search_path=public' = any(coalesce(p.proconfig, '{}'))
   from pg_proc p
   where p.oid = 'public.can_access_document(uuid)'::regprocedure),
  'can_access_document remains SECURITY DEFINER with a pinned search_path'
);
select is(
  (select count(*)::integer
   from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'documents'
     and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'the fix does not add direct write grants'
);
select ok(
  (select qual like '%is_active_user()%'
   from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'active users read accessible document files'),
  'public document metadata access does not open private Storage to NQ guests'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6f937301-3b91-4c21-bde5-804359704011","role":"authenticated","is_anonymous":true}',
  true
);
select lives_ok(
  $$select public.ensure_nq_quiz_guest()$$,
  'the NQ guest provisioning RPC accepts the anonymous Auth identity'
);
select ok(public.is_nq_300_guest(), 'the provisioned identity remains registered as an NQ_300 guest');
select is(
  (select account_status from public.profiles where id = auth.uid()),
  'INVITED',
  'guest provisioning keeps the profile in INVITED status'
);
select ok(not public.is_active_user() and not public.has_role('MEMBER')
  and not public.has_role('YOUTH_ADMIN') and not public.has_role('SYSTEM_ADMIN'),
  'the anonymous quiz guest remains INVITED and receives no member or admin role');
select is(
  (select count(*)::integer from public.documents where id = '6f937301-3b91-4c21-bde5-804359704021'),
  1,
  'B: authenticated anonymous NQ guest reads PUBLISHED + PUBLIC through documents RLS'
);
select is(
  (select count(*)::integer from public.documents where id = '6f937301-3b91-4c21-bde5-804359704022'),
  0,
  'D: INVITED NQ guest cannot read INTERNAL_YOUTH through documents RLS'
);
select is(
  (select count(*)::integer from public.documents where id = '6f937301-3b91-4c21-bde5-804359704023'),
  0,
  'E: INVITED NQ guest cannot read ORGANIZATION_ONLY through documents RLS'
);
select is(
  (select count(*)::integer from public.documents where id = '6f937301-3b91-4c21-bde5-804359704024'),
  0,
  'F: INVITED NQ guest cannot read RESTRICTED through documents RLS'
);
select is(
  (select count(*)::integer from public.documents where id = '6f937301-3b91-4c21-bde5-804359704025'),
  0,
  'G: INVITED NQ guest cannot read PENDING_REVIEW + PUBLIC through documents RLS'
);
select is(
  (select count(*)::integer from public.documents where id = '6f937301-3b91-4c21-bde5-804359704026'),
  0,
  'H: INVITED NQ guest cannot read WITHDRAWN + PUBLIC through documents RLS'
);
reset role;

select is(
  (select count(*)::integer from public.user_roles where user_id = '6f937301-3b91-4c21-bde5-804359704011'),
  0,
  'NQ guest provisioning creates no application role'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated","is_anonymous":false}',
  true
);
select is(
  (select count(*)::integer from public.documents where id = '6f937301-3b91-4c21-bde5-804359704021'),
  1,
  'C: an ACTIVE authenticated member continues to read PUBLISHED + PUBLIC through documents RLS'
);
select is(
  (select count(*)::integer from public.documents where id = '6f937301-3b91-4c21-bde5-804359704022'),
  1,
  'an ACTIVE authenticated member retains the existing INTERNAL_YOUTH access'
);
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (select count(*)::integer from public.documents where id = '6f937301-3b91-4c21-bde5-804359704021'),
  1,
  'A: an unauthenticated anon role reads PUBLISHED + PUBLIC through documents RLS'
);
select is(
  (select count(*)::integer from public.documents where id = '6f937301-3b91-4c21-bde5-804359704025'),
  0,
  'anon cannot read PENDING_REVIEW + PUBLIC through documents RLS'
);
select is(
  (select count(*)::integer from public.documents where id = '6f937301-3b91-4c21-bde5-804359704026'),
  0,
  'anon cannot read WITHDRAWN + PUBLIC through documents RLS'
);
reset role;

select * from finish();
rollback;
