insert into public.organizations (code,name,short_name,organization_type) values
('PA01','Chi đoàn Phòng An ninh đối ngoại','Chi đoàn PA01','YOUTH_BRANCH'),
('BTNCAT','Ban Thanh niên Công an tỉnh Phú Thọ','Ban Thanh niên','YOUTH_ADMIN')
on conflict (code) do nothing;

insert into public.report_campaigns (title,description,issuer,open_at,due_at,status,allow_resubmission)
values ('Báo cáo kết quả công tác Đoàn tháng 7/2026','Dữ liệu rehearsal phục vụ kiểm thử.','Ban Thanh niên Công an tỉnh',now(),now()+interval '7 days','PUBLISHED',true)
on conflict do nothing;
