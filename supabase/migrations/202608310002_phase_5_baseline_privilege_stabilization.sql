-- Reassert the Phase 1/3 table-grant contract under newer local Supabase runtimes.
-- RLS remains the row filter; these grants prevent inherited PUBLIC defaults from widening access.

revoke all privileges on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to anon;
grant select, references on table public.profiles to authenticated;
grant update (full_name, job_title, phone, last_seen_at) on table public.profiles to authenticated;

revoke all privileges on table public.notifications from public, anon, authenticated;
grant select on table public.notifications to authenticated;
