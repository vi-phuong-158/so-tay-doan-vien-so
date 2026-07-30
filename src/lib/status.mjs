export const REPORT_STATUS = {
  PENDING: { label: 'Chưa nộp', tone: 'warning' },
  SUBMITTED: { label: 'Đã nộp', tone: 'success' },
  NEEDS_SUPPLEMENT: { label: 'Cần bổ sung', tone: 'purple' },
  RESUBMITTED: { label: 'Đã nộp lại', tone: 'info' },
  ACCEPTED: { label: 'Hoàn thành', tone: 'success' },
  OVERDUE: { label: 'Quá hạn', tone: 'danger' },
  LATE_SUBMITTED: { label: 'Nộp muộn', tone: 'danger' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral' },
  EXEMPTED: { label: 'Miễn nộp', tone: 'neutral' }
};

export function getReportStatus(status) {
  return REPORT_STATUS[status] || { label: status || 'Không xác định', tone: 'neutral' };
}

export function daysUntil(date, now = new Date()) {
  return Math.ceil((new Date(date).getTime() - now.getTime()) / 86400000);
}

export function normalizeSafeFileName(name) {
  return String(name || 'tep')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 120);
}
