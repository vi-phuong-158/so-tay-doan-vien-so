import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';

const url = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const testOptions = {
  name: 'reminder scan is idempotent under concurrent invocations',
  ignore: !url || !serviceRoleKey,
  fn: async () => {
    const admin = createClient(url!, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const campaignId = crypto.randomUUID();
    const assignmentId = crypto.randomUUID();
    const asOf = '2026-08-15T00:00:00.000Z';
    const dueAt = '2026-08-18T00:00:00.000Z';

    const { error: campaignError } = await admin.from('report_campaigns').insert({
      id: campaignId,
      title: 'P3-05 concurrent scan fixture',
      issuer: 'CI',
      open_at: '2026-08-01T00:00:00.000Z',
      due_at: dueAt,
      status: 'PUBLISHED',
      reminder_policy: { due_soon_days: [3] }
    });
    if (campaignError) throw campaignError;

    const { error: assignmentError } = await admin.from('report_assignments').insert({
      id: assignmentId,
      campaign_id: campaignId,
      organization_id: '22222222-2222-2222-2222-222222222222',
      status: 'PENDING'
    });
    if (assignmentError) throw assignmentError;

    try {
      const scan = () => admin.rpc('scan_report_reminders', { p_as_of: asOf });
      const scans = await Promise.all([scan(), scan()]);
      for (const result of scans) {
        if (result.error) throw result.error;
      }

      const { count: eventCount, error: eventError } = await admin
        .from('report_reminder_events')
        .select('id', { count: 'exact', head: true })
        .eq('assignment_id', assignmentId);
      if (eventError) throw eventError;
      const { count: notificationCount, error: notificationError } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('source_entity_id', assignmentId)
        .eq('type', 'REPORT_DUE_SOON');
      if (notificationError) throw notificationError;
      const { count: queueCount, error: queueError } = await admin
        .from('email_queue')
        .select('id', { count: 'exact', head: true })
        .eq('source_entity_id', assignmentId)
        .eq('template_code', 'REPORT_DUE_SOON');
      if (queueError) throw queueError;

      assertEquals(eventCount, 1);
      assertEquals(notificationCount, 1);
      assertEquals(queueCount, 1);
    } finally {
      await admin.from('email_queue').delete().eq('source_entity_id', assignmentId);
      await admin.from('notifications').delete().eq('source_entity_id', assignmentId);
      await admin.from('report_reminder_events').delete().eq('assignment_id', assignmentId);
      await admin.from('report_assignments').delete().eq('id', assignmentId);
      await admin.from('report_campaigns').delete().eq('id', campaignId);
    }
  }
};

Deno.test(testOptions);
