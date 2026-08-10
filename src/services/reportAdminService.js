import { normalizeSafeFileName } from '../lib/status.mjs';
import { REPORT_TEMPLATES_BUCKET, ReportServiceError, normalizeReportError } from './reportService.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value, fieldName) {
  if (!UUID_PATTERN.test(String(value))) {
    throw new ReportServiceError('INVALID_ID', `${fieldName} must be a UUID.`, undefined);
  }
}

async function unwrap(request) {
  try {
    const { data, error } = await request;
    if (error) throw error;
    return data;
  } catch (error) {
    throw normalizeReportError(error);
  }
}

function mapCampaign(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    issuer: row.issuer,
    openAt: row.open_at,
    dueAt: row.due_at,
    closeAt: row.close_at,
    allowLateSubmission: row.allow_late_submission,
    allowResubmission: row.allow_resubmission,
    allowedExtensions: row.allowed_extensions || [],
    maxFileSizeMb: row.max_file_size_mb,
    maxFiles: row.max_files,
    reminderPolicy: row.reminder_policy || {},
    visibilityLevel: row.visibility_level,
    status: row.status,
    assignmentCount: Array.isArray(row.report_assignments) ? Number(row.report_assignments[0]?.count || 0) : Number(row.assignment_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toRpcPayload(payload) {
  return {
    p_title: payload.title,
    p_description: payload.description || null,
    p_issuer: payload.issuer || null,
    p_open_at: payload.openAt,
    p_due_at: payload.dueAt,
    p_close_at: payload.closeAt || null,
    p_allow_late_submission: Boolean(payload.allowLateSubmission),
    p_allow_resubmission: Boolean(payload.allowResubmission),
    p_allowed_extensions: payload.allowedExtensions,
    p_max_file_size_mb: Number(payload.maxFileSizeMb),
    p_max_files: Number(payload.maxFiles),
    p_reminder_policy: payload.reminderPolicy || {},
    p_visibility_level: payload.visibilityLevel
  };
}

export function buildCampaignTemplateUploadPath({ campaignId, objectId, fileName }) {
  assertUuid(campaignId, 'campaignId');
  assertUuid(objectId, 'objectId');
  const safeFileName = normalizeSafeFileName(fileName);
  if (!safeFileName) throw new ReportServiceError('INVALID_FILE_NAME', 'A file name is required.', undefined);
  return `${campaignId}/staging/${objectId}-${safeFileName}`;
}

export function createReportAdminService(client, { createObjectId = () => globalThis.crypto.randomUUID() } = {}) {
  if (!client) throw new Error('A Supabase client is required.');

  return {
    async getAdminCampaigns() {
      const data = await unwrap(client.rpc('get_admin_report_campaigns'));
      return (data || []).map(mapCampaign);
    },

    async getCampaignForAdmin(campaignId) {
      assertUuid(campaignId, 'campaignId');
      const data = await unwrap(client.rpc('get_admin_report_campaign', { p_campaign_id: campaignId }));
      const campaign = Array.isArray(data) ? data[0] : data;
      if (!campaign) throw new ReportServiceError('NOT_FOUND_OR_FORBIDDEN', 'The report campaign was not found or is outside your scope.', undefined);
      return mapCampaign(campaign);
    },

    async createCampaign(payload) {
      const data = await unwrap(client.rpc('create_report_campaign', toRpcPayload(payload)));
      return mapCampaign(Array.isArray(data) ? data[0] : data);
    },

    async updateDraftCampaign(campaignId, payload) {
      assertUuid(campaignId, 'campaignId');
      const data = await unwrap(client.rpc('update_report_campaign_draft', { p_campaign_id: campaignId, ...toRpcPayload(payload) }));
      return mapCampaign(Array.isArray(data) ? data[0] : data);
    },

    async getAssignableOrganizations() {
      return unwrap(client.rpc('get_assignable_report_organizations'));
    },

    async getCampaignTemplates(campaignId) {
      assertUuid(campaignId, 'campaignId');
      return unwrap(
        client
          .from('report_campaign_templates')
          .select('id,campaign_id,storage_path,file_name,mime_type,size_bytes,created_at')
          .eq('campaign_id', campaignId)
          .order('created_at', { ascending: false })
      );
    },

    async uploadCampaignTemplate({ campaignId, file }) {
      if (!file || typeof file.name !== 'string') throw new ReportServiceError('INVALID_FILE', 'A file with a name is required.', undefined);
      const storagePath = buildCampaignTemplateUploadPath({ campaignId, objectId: createObjectId(), fileName: file.name });
      await unwrap(client.storage.from(REPORT_TEMPLATES_BUCKET).upload(storagePath, file, { upsert: false }));
      try {
        const data = await unwrap(client.functions.invoke('finalize-campaign-template', {
          body: { campaign_id: campaignId, storage_path: storagePath, original_name: file.name }
        }));
        return data.template;
      } catch (error) {
        await client.storage.from(REPORT_TEMPLATES_BUCKET).remove([storagePath]);
        throw error;
      }
    },

    async publishCampaign(campaignId, organizationIds) {
      assertUuid(campaignId, 'campaignId');
      const data = await unwrap(client.rpc('publish_report_campaign', {
        p_campaign_id: campaignId,
        p_organization_ids: organizationIds
      }));
      return Array.isArray(data) ? data[0] : data;
    }
  };
}
