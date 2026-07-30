insert into public.organizations (id, code, name, short_name, organization_type, parent_id) values
('11111111-1111-1111-1111-111111111111', 'TĐ', 'Ban Thanh niên Công an tỉnh Phú Thọ', 'Ban Thanh niên', 'YOUTH_ADMIN', null),
('22222222-2222-2222-2222-222222222222', 'CĐA', 'Chi đoàn A', 'Chi đoàn A', 'YOUTH_BRANCH', '11111111-1111-1111-1111-111111111111'),
('33333333-3333-3333-3333-333333333333', 'CĐB', 'Chi đoàn B', 'Chi đoàn B', 'YOUTH_BRANCH', '11111111-1111-1111-1111-111111111111'),
('44444444-4444-4444-4444-444444444444', 'CĐC', 'Chi đoàn C', 'Chi đoàn C', 'YOUTH_BRANCH', '11111111-1111-1111-1111-111111111111')
on conflict (id) do update set parent_id = excluded.parent_id;

-- Create auth users
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values 
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'sysadmin@test.local', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'youthadmin@test.local', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', 'officera@test.local', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'authenticated', 'authenticated', 'officerb@test.local', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'authenticated', 'authenticated', 'member@test.local', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}'),
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'authenticated', 'authenticated', 'innovation@test.local', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}'),
('gggggggg-gggg-gggg-gggg-gggggggggggg', 'authenticated', 'authenticated', 'youthadmina@test.local', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

-- Create profiles
insert into public.profiles (id, full_name, organization_id, account_status) values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'System Admin', '11111111-1111-1111-1111-111111111111', 'ACTIVE'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Youth Admin', '11111111-1111-1111-1111-111111111111', 'ACTIVE'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Officer A', '22222222-2222-2222-2222-222222222222', 'ACTIVE'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Officer B', '33333333-3333-3333-3333-333333333333', 'ACTIVE'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Member', '22222222-2222-2222-2222-222222222222', 'ACTIVE'),
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Innovation Member', '11111111-1111-1111-1111-111111111111', 'ACTIVE'),
('gggggggg-gggg-gggg-gggg-gggggggggggg', 'Youth Admin A', '22222222-2222-2222-2222-222222222222', 'ACTIVE')
on conflict (id) do nothing;

-- Create user roles
insert into public.user_roles (user_id, role_code, scope_organization_id) values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SYSTEM_ADMIN', null),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'YOUTH_ADMIN', '11111111-1111-1111-1111-111111111111'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'BRANCH_OFFICER', '22222222-2222-2222-2222-222222222222'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'BRANCH_OFFICER', '33333333-3333-3333-3333-333333333333'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'MEMBER', '22222222-2222-2222-2222-222222222222'),
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'INNOVATION_MEMBER', '11111111-1111-1111-1111-111111111111'),
('gggggggg-gggg-gggg-gggg-gggggggggggg', 'YOUTH_ADMIN', '22222222-2222-2222-2222-222222222222')
on conflict do nothing;

insert into public.report_campaigns (id, title,description,issuer,open_at,due_at,status,allow_resubmission)
values ('55555555-5555-5555-5555-555555555555', 'Báo cáo kết quả công tác Đoàn tháng 7/2026','Dữ liệu rehearsal phục vụ kiểm thử.','Ban Thanh niên Công an tỉnh',now(),now()+interval '7 days','PUBLISHED',true)
on conflict do nothing;

insert into public.report_assignments (campaign_id, organization_id, status) values 
('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'PENDING'),
('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'PENDING')
on conflict do nothing;
