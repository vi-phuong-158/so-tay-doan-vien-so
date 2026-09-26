begin;

select plan(3);

select function_privs_are(
  'public', 'member_scope_org_codes', array['uuid'], 'anon', array[]::text[],
  'Anonymous callers cannot enumerate member scope organization codes'
);
select function_privs_are(
  'public', 'member_scope_org_codes', array['uuid'], 'authenticated', array[]::text[],
  'Authenticated browser callers cannot enumerate member scope organization codes'
);
select function_privs_are(
  'public', 'member_scope_org_codes', array['uuid'], 'service_role', array['EXECUTE'],
  'Only the trusted resolver worker can execute member scope organization lookup'
);

select * from finish();
rollback;
