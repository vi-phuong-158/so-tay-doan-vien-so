import { clients, requireUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, readJson } from '../_shared/http.ts';
import { assertUuid, safeFileName } from '../_shared/validation.ts';
import { escapeCsvCell, getExportHttpStatus, normalizeExportStatus } from './contract.ts';

type ExportBody = { campaign_id: string; status?: string | null; search?: string | null };

function asRow<T>(data: T | T[]): T | null {
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

async function rpc<T>(client: any, name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, params);
  if (error) throw error;
  return data as T;
}

function formatCsv(campaign: any, rows: any[]): string {
  const header = [
    'STT', 'Mã đơn vị', 'Tên đơn vị', 'Tên đợt báo cáo', 'Trạng thái', 'Hạn nộp',
    'Thời gian nộp gần nhất', 'Phiên bản gần nhất', 'Nộp đúng hạn / nộp muộn',
    'Trạng thái review', 'Thời điểm hoàn thành', 'Ghi chú/yêu cầu bổ sung', 'Lý do miễn'
  ];
  const lines = [header.map(escapeCsvCell).join(',')];
  rows.forEach((row, index) => {
    lines.push([
      index + 1,
      row.organization_code,
      row.organization_name,
      campaign.title,
      row.status,
      row.effective_due_at,
      row.latest_submitted_at,
      row.latest_version,
      row.latest_submitted_at ? (row.is_late ? 'Nộp muộn' : 'Đúng hạn') : '',
      row.review_status,
      row.accepted_at,
      row.review_note,
      row.exempt_reason
    ].map(escapeCsvCell).join(','));
  });
  return `\uFEFF${lines.join('\r\n')}`;
}

async function writeAudit(adminClient: any, userId: string, campaignId: string, status: string | null, search: string | null, rowCount: number) {
  const { error } = await adminClient.from('audit_logs').insert({
    actor_user_id: userId,
    action: 'REPORT_STATUS_EXPORTED',
    entity_type: 'report_campaign',
    entity_id: campaignId,
    after_data: { status, search, row_count: rowCount }
  });
  if (error) throw new Error('AUDIT_LOG_FAILED');
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse(new Error('METHOD_NOT_ALLOWED'), 405);
  try {
    const { userClient, adminClient } = clients(request);
    const user = await requireUser(userClient);
    const body = await readJson<ExportBody>(request);
    const campaignId = assertUuid(body.campaign_id);
    const status = normalizeExportStatus(body.status);
    const search = body.search == null ? null : String(body.search).trim();
    if (search && search.length > 100) throw new Error('INVALID_DASHBOARD_FILTER');
    const dashboardRows = await rpc<any[]>(userClient, 'get_report_dashboard', { p_campaign_id: campaignId });
    const campaign = asRow(dashboardRows);
    if (!campaign) throw new Error('REPORT_DASHBOARD_NOT_FOUND_OR_FORBIDDEN');
    const rows = (await rpc<any[]>(userClient, 'get_report_dashboard_assignments', {
      p_campaign_id: campaignId, p_status: status, p_search: search || null
    })) || [];
    await writeAudit(adminClient, user.id, campaignId, status, search || null, rows.length);
    const filename = `bao-cao-trang-thai-${safeFileName(campaign.title)}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(formatCsv(campaign, rows), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(error, getExportHttpStatus(message));
  }
});
