insert into public.organizations (id, code, name, short_name, organization_type, parent_id) values
('11111111-1111-1111-1111-111111111111', 'TĐ', 'Ban Thanh niên Công an tỉnh Phú Thọ', 'Ban Thanh niên', 'YOUTH_ADMIN', null),
('22222222-2222-2222-2222-222222222222', 'CĐA', 'Chi đoàn A', 'Chi đoàn A', 'YOUTH_BRANCH', '11111111-1111-1111-1111-111111111111'),
('33333333-3333-3333-3333-333333333333', 'CĐB', 'Chi đoàn B', 'Chi đoàn B', 'YOUTH_BRANCH', '11111111-1111-1111-1111-111111111111'),
('44444444-4444-4444-4444-444444444444', 'CĐC', 'Chi đoàn C', 'Chi đoàn C', 'YOUTH_BRANCH', '11111111-1111-1111-1111-111111111111')
on conflict (id) do update set parent_id = excluded.parent_id;

-- Create auth users
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous) values 
('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'sysadmin@test.local', crypt('password123', gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}', '{}', false, false),
('00000000-0000-0000-0000-000000000000', 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'authenticated', 'authenticated', 'sysadmin2@test.local', crypt('password123', gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}', '{}', false, false),
('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'youthadmin@test.local', crypt('password123', gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}', '{}', false, false),
('00000000-0000-0000-0000-000000000000', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', 'officera@test.local', crypt('password123', gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}', '{}', false, false),
('00000000-0000-0000-0000-000000000000', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'authenticated', 'authenticated', 'officerb@test.local', crypt('password123', gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}', '{}', false, false),
('00000000-0000-0000-0000-000000000000', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'authenticated', 'authenticated', 'member@test.local', crypt('password123', gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}', '{}', false, false),
('00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'authenticated', 'authenticated', 'innovation@test.local', crypt('password123', gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}', '{}', false, false),
('00000000-0000-0000-0000-000000000000', '11112222-3333-4444-5555-666677778888', 'authenticated', 'authenticated', 'youthadmina@test.local', crypt('password123', gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}', '{}', false, false),
('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999999', 'authenticated', 'authenticated', 'suspended@test.local', crypt('password123', gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}', '{}', false, false)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at) values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"sysadmin@test.local","email_verified":true}', 'email', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), now(), now()),
('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', '{"sub":"a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2","email":"sysadmin2@test.local","email_verified":true}', 'email', 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', now(), now(), now()),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","email":"youthadmin@test.local","email_verified":true}', 'email', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), now(), now()),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","email":"officera@test.local","email_verified":true}', 'email', 'cccccccc-cccc-cccc-cccc-cccccccccccc', now(), now(), now()),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","email":"officerb@test.local","email_verified":true}', 'email', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now(), now(), now()),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","email":"member@test.local","email_verified":true}', 'email', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', now(), now(), now()),
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '{"sub":"ffffffff-ffff-ffff-ffff-ffffffffffff","email":"innovation@test.local","email_verified":true}', 'email', 'ffffffff-ffff-ffff-ffff-ffffffffffff', now(), now(), now()),
('11112222-3333-4444-5555-666677778888', '11112222-3333-4444-5555-666677778888', '{"sub":"11112222-3333-4444-5555-666677778888","email":"youthadmina@test.local","email_verified":true}', 'email', '11112222-3333-4444-5555-666677778888', now(), now(), now()),
('99999999-9999-9999-9999-999999999999', '99999999-9999-9999-9999-999999999999', '{"sub":"99999999-9999-9999-9999-999999999999","email":"suspended@test.local","email_verified":true}', 'email', '99999999-9999-9999-9999-999999999999', now(), now(), now())
on conflict (id) do nothing;

insert into auth.sessions (id, user_id, created_at, updated_at) values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), now()),
('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', now(), now()),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), now()),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'cccccccc-cccc-cccc-cccc-cccccccccccc', now(), now()),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now(), now()),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', now(), now()),
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'ffffffff-ffff-ffff-ffff-ffffffffffff', now(), now()),
('11112222-3333-4444-5555-666677778888', '11112222-3333-4444-5555-666677778888', now(), now()),
('99999999-9999-9999-9999-999999999999', '99999999-9999-9999-9999-999999999999', now(), now())
on conflict (id) do nothing;

-- Create profiles
insert into public.profiles (id, full_name, organization_id, account_status) values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'System Admin', '11111111-1111-1111-1111-111111111111', 'ACTIVE'),
('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'System Admin 2', '22222222-2222-2222-2222-222222222222', 'ACTIVE'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Youth Admin', '11111111-1111-1111-1111-111111111111', 'ACTIVE'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Officer A', '22222222-2222-2222-2222-222222222222', 'ACTIVE'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Officer B', '33333333-3333-3333-3333-333333333333', 'ACTIVE'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Member', '22222222-2222-2222-2222-222222222222', 'ACTIVE'),
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Innovation Member', '11111111-1111-1111-1111-111111111111', 'ACTIVE'),
('11112222-3333-4444-5555-666677778888', 'Youth Admin A', '22222222-2222-2222-2222-222222222222', 'ACTIVE'),
('99999999-9999-9999-9999-999999999999', 'Suspended Member', '22222222-2222-2222-2222-222222222222', 'SUSPENDED')
on conflict (id) do nothing;

-- Create user roles
insert into public.user_roles (user_id, role_code, scope_organization_id) values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SYSTEM_ADMIN', null),
('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'SYSTEM_ADMIN', null),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'YOUTH_ADMIN', '11111111-1111-1111-1111-111111111111'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'BRANCH_OFFICER', '22222222-2222-2222-2222-222222222222'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'BRANCH_OFFICER', '33333333-3333-3333-3333-333333333333'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'MEMBER', '22222222-2222-2222-2222-222222222222'),
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'INNOVATION_MEMBER', '11111111-1111-1111-1111-111111111111'),
('11112222-3333-4444-5555-666677778888', 'YOUTH_ADMIN', '22222222-2222-2222-2222-222222222222')
on conflict do nothing;

insert into public.report_campaigns (id, title,description,issuer,open_at,due_at,status,allow_resubmission)
values ('55555555-5555-5555-5555-555555555555', 'Báo cáo kết quả công tác Đoàn tháng 7/2026','Dữ liệu rehearsal phục vụ kiểm thử.','Ban Thanh niên Công an tỉnh',now(),now()+interval '7 days','PUBLISHED',true)
on conflict do nothing;

insert into public.report_assignments (campaign_id, organization_id, status) values 
('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'PENDING'),
('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'PENDING')
on conflict do nothing;
