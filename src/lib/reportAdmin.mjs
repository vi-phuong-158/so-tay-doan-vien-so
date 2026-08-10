export const DEFAULT_CAMPAIGN_FORM = {
  title: '',
  description: '',
  issuer: '',
  openAt: '',
  dueAt: '',
  closeAt: '',
  allowLateSubmission: false,
  allowResubmission: true,
  allowedExtensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx'],
  maxFileSizeMb: 20,
  maxFiles: 5,
  reminderPolicy: {},
  visibilityLevel: 'INTERNAL_YOUTH'
};

export function validateCampaignForm(form) {
  const errors = {};
  if (!String(form.title || '').trim()) errors.title = 'Nhập tên đợt báo cáo.';
  if (!form.openAt || !form.dueAt) errors.dates = 'Chọn ngày mở và hạn nộp.';
  if (form.openAt && form.dueAt && new Date(form.dueAt) < new Date(form.openAt)) errors.dates = 'Hạn nộp phải sau ngày mở.';
  if (form.closeAt && form.dueAt && new Date(form.closeAt) < new Date(form.dueAt)) errors.closeAt = 'Ngày đóng phải từ hạn nộp trở đi.';
  if (!Array.isArray(form.allowedExtensions) || form.allowedExtensions.length === 0) errors.allowedExtensions = 'Chọn ít nhất một loại tệp.';
  if (!Number.isInteger(Number(form.maxFileSizeMb)) || Number(form.maxFileSizeMb) < 1 || Number(form.maxFileSizeMb) > 100) errors.maxFileSizeMb = 'Dung lượng phải từ 1 đến 100 MB.';
  if (!Number.isInteger(Number(form.maxFiles)) || Number(form.maxFiles) < 1 || Number(form.maxFiles) > 20) errors.maxFiles = 'Số tệp phải từ 1 đến 20.';
  return errors;
}

export function toggleOrganizationSelection(selectedIds, organizationId) {
  const current = new Set(selectedIds);
  if (current.has(organizationId)) current.delete(organizationId);
  else current.add(organizationId);
  return [...current];
}

export function formatCampaignConfirmation(form, organizationCount, templateCount) {
  return {
    title: String(form.title || '').trim(),
    dueAt: form.dueAt,
    organizationCount,
    allowLateSubmission: Boolean(form.allowLateSubmission),
    allowResubmission: Boolean(form.allowResubmission),
    templateCount
  };
}
