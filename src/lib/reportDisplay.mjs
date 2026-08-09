export const REPORT_STATUS_GROUPS = {
  active: ['PENDING', 'SUBMITTED', 'NEEDS_SUPPLEMENT', 'RESUBMITTED', 'OVERDUE', 'LATE_SUBMITTED'],
  completed: ['ACCEPTED', 'EXEMPTED', 'CLOSED']
};

export function canSubmitAssignment(assignment) {
  const status = assignment?.status;
  if (status === 'PENDING' || status === 'OVERDUE' || status === 'NEEDS_SUPPLEMENT') return true;
  return (status === 'SUBMITTED' || status === 'RESUBMITTED' || status === 'LATE_SUBMITTED') && assignment?.campaign?.allowResubmission === true;
}

const REVIEWABLE_SUBMISSION_STATUSES = ['SUBMITTED', 'RESUBMITTED', 'LATE_SUBMITTED'];

export function getReviewActions(assignment) {
  if (REVIEWABLE_SUBMISSION_STATUSES.includes(assignment?.status)) {
    return ['ACCEPTED', 'NEEDS_SUPPLEMENT'];
  }
  if (assignment?.status === 'PENDING' || assignment?.status === 'OVERDUE') {
    return ['EXEMPTED'];
  }
  return [];
}

export function canReviewAssignment(assignment) {
  return getReviewActions(assignment).length > 0;
}

const ATTENTION_ORDER = {
  NEEDS_SUPPLEMENT: 0,
  OVERDUE: 1,
  LATE_SUBMITTED: 2,
  PENDING: 3,
  SUBMITTED: 4,
  RESUBMITTED: 5
};

export function getEffectiveDueAt(assignment) {
  return assignment?.dueAtOverride || assignment?.campaign?.dueAt || null;
}

export function formatReportDate(value) {
  if (!value) return 'Chưa xác định';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa xác định';

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function sortAssignments(assignments, group) {
  const list = [...assignments];
  return list.sort((left, right) => {
    if (group === 'active') {
      const priorityDifference = (ATTENTION_ORDER[left.status] ?? 99) - (ATTENTION_ORDER[right.status] ?? 99);
      if (priorityDifference !== 0) return priorityDifference;

      const leftDue = new Date(getEffectiveDueAt(left) || 8640000000000000).getTime();
      const rightDue = new Date(getEffectiveDueAt(right) || 8640000000000000).getTime();
      return leftDue - rightDue;
    }

    const leftDue = new Date(getEffectiveDueAt(left) || 0).getTime();
    const rightDue = new Date(getEffectiveDueAt(right) || 0).getTime();
    return rightDue - leftDue;
  });
}

export function formatFileSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return '';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileExtension(fileName) {
  return String(fileName || '').toLowerCase().split('.').pop() || '';
}

export function getReportFileAccept(allowedExtensions) {
  return (Array.isArray(allowedExtensions) ? allowedExtensions : [])
    .map((extension) => extension.startsWith('.') ? extension : `.${extension}`)
    .join(',');
}

export function validateReportFileSelection(fileList, campaign) {
  const files = Array.from(fileList || []);
  const maxFiles = Number(campaign?.maxFiles);
  const maxFileSizeBytes = Number(campaign?.maxFileSizeMb) * 1024 * 1024;
  const allowedExtensions = new Set((campaign?.allowedExtensions || []).map((extension) => extension.toLowerCase().replace(/^\./, '')));

  if (Number.isFinite(maxFiles) && maxFiles > 0 && files.length > maxFiles) {
    return { files: [], errorCode: 'TOO_MANY_FILES' };
  }

  const seen = new Set();
  for (const file of files) {
    const identity = `${file.name}:${file.size}:${file.lastModified || 0}`;
    if (seen.has(identity)) return { files: [], errorCode: 'DUPLICATE_FILE_PATH' };
    seen.add(identity);
    if (file.size <= 0) return { files: [], errorCode: 'INVALID_FILE' };
    if (allowedExtensions.size > 0 && !allowedExtensions.has(getFileExtension(file.name))) {
      return { files: [], errorCode: 'FILE_TYPE_NOT_ALLOWED' };
    }
    if (Number.isFinite(maxFileSizeBytes) && maxFileSizeBytes > 0 && file.size > maxFileSizeBytes) {
      return { files: [], errorCode: 'FILE_TOO_LARGE' };
    }
  }

  return { files, errorCode: null };
}
