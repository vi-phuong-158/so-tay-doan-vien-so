export const REPORT_STATUS_GROUPS = {
  active: ['PENDING', 'SUBMITTED', 'NEEDS_SUPPLEMENT', 'RESUBMITTED', 'OVERDUE', 'LATE_SUBMITTED'],
  completed: ['ACCEPTED', 'EXEMPTED', 'CLOSED']
};

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
