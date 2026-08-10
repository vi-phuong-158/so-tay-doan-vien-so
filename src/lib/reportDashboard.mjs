export const DASHBOARD_FILTERS = [
  ['ALL', 'Tất cả'], ['PENDING', 'Chưa nộp'], ['SUBMITTED', 'Đã nộp'],
  ['NEEDS_SUPPLEMENT', 'Cần bổ sung'], ['RESUBMITTED', 'Đã nộp lại'],
  ['COMPLETED', 'Hoàn thành'], ['OVERDUE', 'Quá hạn'],
  ['LATE_SUBMITTED', 'Nộp muộn'], ['EXEMPTED', 'Miễn nộp']
];

export function dashboardStatusLabel(status) {
  return Object.fromEntries(DASHBOARD_FILTERS)[status] || status || 'Chưa xác định';
}

export function formatCompletion(summary) {
  const completed = Number(summary?.completedCount || 0);
  const total = Number(summary?.totalAssignments || 0);
  const rate = Number(summary?.completionRate || 0);
  return { completed, total, rate: Number.isFinite(rate) ? rate.toFixed(rate % 1 ? 2 : 0) : '0' };
}

export function mapDashboardError(error) {
  const messages = {
    ACCOUNT_NOT_ACTIVE: 'Tài khoản không còn hoạt động.',
    REPORT_CAMPAIGN_SCOPE_DENIED: 'Bạn không có quyền xem dashboard báo cáo.',
    REPORT_DASHBOARD_NOT_FOUND_OR_FORBIDDEN: 'Không tìm thấy đợt báo cáo hoặc bạn không có quyền truy cập.',
    NOT_FOUND_OR_FORBIDDEN: 'Không tìm thấy đợt báo cáo hoặc bạn không có quyền truy cập.',
    AUTHENTICATION_REQUIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  };
  return messages[error?.code] || 'Không thể tải dashboard báo cáo. Hãy thử lại.';
}
