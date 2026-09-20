-- The quota table is private to the Edge Function's service-role client. Make that intentional
-- policy visible to the Security Advisor while preserving its revoked client table grants.

create policy "service role manages public AI quotas" on public.public_ai_rate_limits
for all to service_role
using (true)
with check (true);
