import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, PageHeader, StatusBadge } from '../components/common';
import Skeleton from '../components/Skeleton';
import { supabase } from '../services/supabaseClient';
import { createReportAdminService } from '../services/reportAdminService';
import { DEFAULT_CAMPAIGN_FORM, formatCampaignConfirmation, toggleOrganizationSelection, validateCampaignForm } from '../lib/reportAdmin.mjs';
import { formatReportDate } from '../lib/reportDisplay.mjs';

const service = createReportAdminService(supabase);

function toLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toForm(campaign) {
  return {
    title: campaign.title || '',
    description: campaign.description || '',
    issuer: campaign.issuer || '',
    openAt: toLocalDateTime(campaign.openAt),
    dueAt: toLocalDateTime(campaign.dueAt),
    closeAt: toLocalDateTime(campaign.closeAt),
    allowLateSubmission: Boolean(campaign.allowLateSubmission),
    allowResubmission: Boolean(campaign.allowResubmission),
    allowedExtensions: campaign.allowedExtensions || [],
    maxFileSizeMb: campaign.maxFileSizeMb,
    maxFiles: campaign.maxFiles,
    reminderPolicy: campaign.reminderPolicy || {},
    visibilityLevel: campaign.visibilityLevel || 'INTERNAL_YOUTH'
  };
}

function errorMessage(error) {
  const messages = {
    ORGANIZATION_REQUIRED: 'Chọn ít nhất một đơn vị trước khi phát hành.',
    ORGANIZATION_INACTIVE: 'Danh sách có đơn vị đã ngừng hoạt động. Hãy tải lại và chọn lại.',
    ASSIGNMENT_SCOPE_DENIED: 'Bạn không có quyền giao cho một hoặc nhiều đơn vị đã chọn.',
    CAMPAIGN_NOT_DRAFT: 'Đợt báo cáo này không còn ở trạng thái nháp.',
    REPORT_CAMPAIGN_SCOPE_DENIED: 'Bạn không có quyền quản lý đợt báo cáo này.',
    ACCOUNT_NOT_ACTIVE: 'Tài khoản của bạn không còn hoạt động.'
  };
  return messages[error?.code] || 'Không thể hoàn tất thao tác. Hãy thử lại.';
}

export function AdminReports() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [campaign, setCampaign] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrganizationIds, setSelectedOrganizationIds] = useState([]);
  const [form, setForm] = useState(DEFAULT_CAMPAIGN_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [dirty, setDirty] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const readOnly = campaign?.status === 'PUBLISHED' || campaign?.status === 'CLOSED' || campaign?.status === 'ARCHIVED';
  const confirmation = useMemo(
    () => formatCampaignConfirmation(form, selectedOrganizationIds.length, templates.length),
    [form, selectedOrganizationIds.length, templates.length]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextCampaigns, nextOrganizations] = await Promise.all([
        service.getAdminCampaigns(),
        service.getAssignableOrganizations()
      ]);
      setCampaigns(nextCampaigns);
      setOrganizations(nextOrganizations || []);
      if (campaignId && campaignId !== 'tao-moi') {
        const [nextCampaign, nextTemplates] = await Promise.all([
          service.getCampaignForAdmin(campaignId),
          service.getCampaignTemplates(campaignId)
        ]);
        setCampaign(nextCampaign);
        setForm(toForm(nextCampaign));
        setTemplates(nextTemplates || []);
      } else {
        setCampaign(null);
        setTemplates([]);
        setForm(DEFAULT_CAMPAIGN_FORM);
        setSelectedOrganizationIds([]);
      }
      setDirty(false);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(load, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const updateForm = (field, value) => {
    setForm(current => ({ ...current, [field]: value }));
    setDirty(true);
  };

  const saveDraft = async () => {
    const nextErrors = validateCampaignForm(form);
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) return null;
    setSaving(true);
    setError('');
    try {
      const saved = campaign
        ? await service.updateDraftCampaign(campaign.id, form)
        : await service.createCampaign(form);
      setCampaign(saved);
      setDirty(false);
      if (!campaign) navigate(`/admin/bao-cao/${saved.id}`, { replace: true });
      return saved;
    } catch (saveError) {
      setError(errorMessage(saveError));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const uploadTemplates = async event => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || !campaign || readOnly) return;
    setUploading(true);
    setError('');
    try {
      const uploaded = [];
      for (const file of files) uploaded.push(await service.uploadCampaignTemplate({ campaignId: campaign.id, file }));
      setTemplates(current => [...uploaded, ...current]);
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setUploading(false);
    }
  };

  const requestPublish = () => {
    const nextErrors = validateCampaignForm(form);
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (!campaign) {
      setError('Lưu bản nháp trước khi phát hành để đính kèm biểu mẫu và xác nhận danh sách đơn vị.');
      return;
    }
    if (dirty) {
      setError('Lưu thay đổi bản nháp trước khi phát hành.');
      return;
    }
    if (!selectedOrganizationIds.length) {
      setError('Chọn ít nhất một đơn vị trước khi phát hành.');
      return;
    }
    setShowConfirmation(true);
  };

  const publish = async () => {
    if (!campaign || publishing) return;
    setPublishing(true);
    setError('');
    try {
      await service.publishCampaign(campaign.id, selectedOrganizationIds);
      setShowConfirmation(false);
      await load();
    } catch (publishError) {
      setShowConfirmation(false);
      setError(errorMessage(publishError));
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <div className="page"><PageHeader title="Quản lý báo cáo" /><Skeleton lines={4} /></div>;
  if (error && !campaignId && campaigns.length === 0) {
    return <div className="page"><PageHeader title="Quản lý báo cáo" /><EmptyState icon="alert" title="Không tải được dữ liệu" description={error} action="Thử lại" onAction={load} /></div>;
  }

  if (!campaignId) {
    return (
      <div className="page admin-reports-page">
        <PageHeader title="Quản lý báo cáo" subtitle="Tạo, phát hành và theo dõi các đợt báo cáo" action={<Button onClick={() => navigate('/admin/bao-cao/tao-moi')}>Tạo đợt mới</Button>} />
        {campaigns.length === 0 ? (
          <EmptyState icon="file" title="Chưa có đợt báo cáo" description="Tạo đợt báo cáo đầu tiên cho các đơn vị trong phạm vi quản lý." action="Tạo đợt mới" onAction={() => navigate('/admin/bao-cao/tao-moi')} />
        ) : (
          <div className="campaign-list">
            {campaigns.map(item => (
              <article className="campaign-list-item" key={item.id}>
                <div><h2>{item.title}</h2><p>Mở: {formatReportDate(item.openAt)} · Hạn: {formatReportDate(item.dueAt)}</p></div>
                <div className="campaign-list-meta"><StatusBadge status={item.status} /><span>{item.assignmentCount} đơn vị</span><div className="campaign-list-actions"><Link className="button button-secondary" to={`/admin/bao-cao/${item.id}`}>Cấu hình</Link><Link className="button button-primary" to={`/admin/bao-cao/${item.id}/dashboard`}>Dashboard</Link></div></div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  const isNew = campaignId === 'tao-moi';
  return (
    <div className="page admin-reports-page">
      <PageHeader title={isNew ? 'Tạo đợt báo cáo' : (campaign?.title || 'Đợt báo cáo')} subtitle={readOnly ? 'Thông tin đợt đã phát hành' : 'Cấu hình bản nháp trước khi phát hành'} back="/admin/bao-cao" navigate={navigate} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <form className="campaign-form" onSubmit={event => { event.preventDefault(); saveDraft(); }}>
        <fieldset disabled={readOnly || saving || publishing}>
          <legend>1. Thông tin chung</legend>
          <label>Tên đợt báo cáo<input value={form.title} onChange={event => updateForm('title', event.target.value)} maxLength="300" required /></label>
          {formErrors.title && <p className="form-error">{formErrors.title}</p>}
          <label>Mô tả / yêu cầu<textarea value={form.description} onChange={event => updateForm('description', event.target.value)} rows="4" /></label>
          <label>Cơ quan yêu cầu<input value={form.issuer} onChange={event => updateForm('issuer', event.target.value)} /></label>
        </fieldset>

        <fieldset disabled={readOnly || saving || publishing}>
          <legend>2. Thời gian</legend>
          <div className="campaign-form-grid">
            <label>Ngày mở<input type="datetime-local" value={form.openAt} onChange={event => updateForm('openAt', event.target.value)} required /></label>
            <label>Hạn nộp<input type="datetime-local" value={form.dueAt} onChange={event => updateForm('dueAt', event.target.value)} required /></label>
            <label>Ngày đóng (nếu có)<input type="datetime-local" value={form.closeAt} onChange={event => updateForm('closeAt', event.target.value)} /></label>
          </div>
          {(formErrors.dates || formErrors.closeAt) && <p className="form-error">{formErrors.dates || formErrors.closeAt}</p>}
        </fieldset>

        <fieldset disabled={readOnly || saving || publishing}>
          <legend>3. Quy định nộp và tệp</legend>
          <label className="checkbox-row"><input type="checkbox" checked={form.allowLateSubmission} onChange={event => updateForm('allowLateSubmission', event.target.checked)} /> Cho phép nộp muộn</label>
          <label className="checkbox-row"><input type="checkbox" checked={form.allowResubmission} onChange={event => updateForm('allowResubmission', event.target.checked)} /> Cho phép tự nộp lại</label>
          <label>Loại tệp (cách nhau bằng dấu phẩy)<input value={form.allowedExtensions.join(', ')} onChange={event => updateForm('allowedExtensions', event.target.value.split(',').map(value => value.trim().replace(/^\./, '').toLowerCase()).filter(Boolean))} /></label>
          {formErrors.allowedExtensions && <p className="form-error">{formErrors.allowedExtensions}</p>}
          <div className="campaign-form-grid">
            <label>Dung lượng tối đa mỗi tệp (MB)<input type="number" min="1" max="100" value={form.maxFileSizeMb} onChange={event => updateForm('maxFileSizeMb', event.target.value)} /></label>
            <label>Số tệp tối đa<input type="number" min="1" max="20" value={form.maxFiles} onChange={event => updateForm('maxFiles', event.target.value)} /></label>
            <label>Mức hiển thị<select value={form.visibilityLevel} onChange={event => updateForm('visibilityLevel', event.target.value)}><option value="INTERNAL_YOUTH">Nội bộ Đoàn</option><option value="ORGANIZATION_ONLY">Theo đơn vị</option><option value="RESTRICTED">Hạn chế</option><option value="PUBLIC">Công khai</option></select></label>
          </div>
          {(formErrors.maxFileSizeMb || formErrors.maxFiles) && <p className="form-error">{formErrors.maxFileSizeMb || formErrors.maxFiles}</p>}
        </fieldset>

        <fieldset disabled={readOnly || saving || publishing}>
          <legend>4. Chọn đơn vị phải nộp ({selectedOrganizationIds.length})</legend>
          <div className="organization-actions"><Button variant="secondary" onClick={() => setSelectedOrganizationIds(organizations.map(organization => organization.id))}>Chọn tất cả trong phạm vi</Button><Button variant="secondary" onClick={() => setSelectedOrganizationIds([])}>Bỏ chọn</Button></div>
          <div className="organization-selection">
            {organizations.map(organization => <label className="checkbox-row" key={organization.id}><input type="checkbox" checked={selectedOrganizationIds.includes(organization.id)} onChange={() => setSelectedOrganizationIds(current => toggleOrganizationSelection(current, organization.id))} /> <span>{organization.short_name || organization.name}</span><small>{organization.code}</small></label>)}
          </div>
        </fieldset>

        <fieldset disabled={readOnly || saving || publishing}>
          <legend>5. Biểu mẫu ({templates.length})</legend>
          {!campaign && <p>Lưu bản nháp trước khi tải biểu mẫu.</p>}
          {campaign && <label className="file-input-label">{uploading ? 'Đang tải biểu mẫu…' : 'Tải biểu mẫu'}<input type="file" multiple disabled={uploading} accept={form.allowedExtensions.map(extension => `.${extension}`).join(',')} onChange={uploadTemplates} /></label>}
          {templates.length > 0 && <ul className="template-list">{templates.map(template => <li key={template.id}>{template.file_name} <span>{template.size_bytes} B</span></li>)}</ul>}
        </fieldset>

        <div className="campaign-form-actions">
          {!readOnly && <Button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu bản nháp'}</Button>}
          {!readOnly && <Button variant="secondary" onClick={requestPublish} disabled={publishing || saving}>{publishing ? 'Đang phát hành…' : 'Xác nhận & phát hành'}</Button>}
          {readOnly && <p>Đợt đã phát hành cho {campaign?.assignmentCount || 0} đơn vị.</p>}
        </div>
      </form>

      {showConfirmation && <div className="confirm-overlay" role="presentation"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-campaign-title"><h2 id="publish-campaign-title">Xác nhận phát hành</h2><dl><dt>Tên đợt</dt><dd>{confirmation.title}</dd><dt>Hạn nộp</dt><dd>{formatReportDate(confirmation.dueAt)}</dd><dt>Đơn vị nhận</dt><dd>{confirmation.organizationCount}</dd><dt>Nộp muộn</dt><dd>{confirmation.allowLateSubmission ? 'Có' : 'Không'}</dd><dt>Nộp lại</dt><dd>{confirmation.allowResubmission ? 'Có' : 'Không'}</dd><dt>Biểu mẫu</dt><dd>{confirmation.templateCount}</dd></dl><p>Sau khi phát hành, không thể sửa các quy định quan trọng của đợt báo cáo.</p><div className="campaign-form-actions"><Button variant="secondary" onClick={() => setShowConfirmation(false)} disabled={publishing}>Quay lại</Button><Button onClick={publish} disabled={publishing}>{publishing ? 'Đang phát hành…' : 'Phát hành đợt báo cáo'}</Button></div></div></div>}
    </div>
  );
}
