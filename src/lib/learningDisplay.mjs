// Pure presentation helpers for the Chuyên đề học tập (learning) area.
// No Supabase/React imports so these stay directly unit-testable, matching reportDisplay.mjs.

export const AVAILABILITY_LABELS = {
  OPEN: 'Đang mở',
  UPCOMING: 'Sắp mở',
  CLOSED: 'Đã đóng'
};

export const RESOURCE_TYPE_LABELS = {
  TEXT: 'Bài đọc',
  DOCUMENT: 'Tài liệu',
  VIDEO: 'Video',
  IMAGE: 'Hình ảnh',
  LINK: 'Liên kết'
};

export const RESOURCE_TYPE_ICONS = {
  TEXT: 'book',
  DOCUMENT: 'file',
  VIDEO: 'sparkles',
  IMAGE: 'file',
  LINK: 'arrow'
};

/** Tone for the availability badge; the label is always rendered alongside it. */
export function availabilityTone(availability) {
  switch (availability) {
    case 'OPEN':
      return 'success';
    case 'UPCOMING':
      return 'info';
    case 'CLOSED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** dd/MM/yyyy in Vietnam time; a dash rather than "Invalid Date" for missing/bad input. */
export function formatLearningDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh'
  }).format(date);
}

/** Human sentence for the availability window, tolerant of either bound being absent. */
export function availabilityWindowLabel(topic) {
  const open = topic?.openAt ? formatLearningDate(topic.openAt) : null;
  const close = topic?.closeAt ? formatLearningDate(topic.closeAt) : null;
  if (open && close) return `${open} – ${close}`;
  if (open) return `Từ ${open}`;
  if (close) return `Đến ${close}`;
  return 'Không giới hạn thời gian';
}

export function resourceTypeLabel(resourceType) {
  return RESOURCE_TYPE_LABELS[resourceType] ?? 'Tài liệu';
}

export function resourceTypeIcon(resourceType) {
  return RESOURCE_TYPE_ICONS[resourceType] ?? 'file';
}

/** What the UI may offer for a resource, derived from what the row actually carries. */
export function resourceActions(resource) {
  return {
    canOpenLink: Boolean(resource?.externalUrl),
    canDownload: Boolean(resource?.hasFile && resource?.storagePath),
    hasText: Boolean(resource?.content)
  };
}

export function learningErrorMessage(error) {
  switch (error?.code) {
    case 'TOPIC_NOT_FOUND':
      return 'Không tìm thấy chuyên đề hoặc bạn không có quyền xem chuyên đề này.';
    case 'AUTHENTICATION_REQUIRED':
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    case 'ACCOUNT_NOT_ACTIVE':
      return 'Tài khoản chưa được kích hoạt.';
    case 'INVALID_STORAGE_PATH':
    case 'INVALID_EXPIRY':
      return 'Không thể tạo liên kết tải tài liệu này.';
    default:
      return 'Không tải được dữ liệu chuyên đề. Vui lòng thử lại.';
  }
}
