// Pure presentation helpers for the Văn bản (documents) area.
// Kept free of Supabase/React so they can be unit-tested directly, matching reportDisplay.mjs.

export const RELATION_LABELS = {
  AMENDS: 'Sửa đổi, bổ sung',
  REPLACES: 'Thay thế',
  GUIDES: 'Hướng dẫn thi hành',
  RELATED: 'Liên quan'
};

export const EFFECT_FILTER_LABELS = {
  ALL: 'Tất cả',
  EFFECTIVE: 'Còn hiệu lực',
  EXPIRED: 'Hết hiệu lực'
};

/** dd/MM/yyyy for a date-only column; falls back to a dash rather than printing "Invalid Date". */
export function formatDocumentDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

export function relationLabel(relationType) {
  return RELATION_LABELS[relationType] ?? 'Liên quan';
}

/**
 * Tone for the effect-status badge. Status is always accompanied by its text label in the UI, so
 * colour is never the only signal (accessibility rule in docs/02-design-system.md).
 */
export function effectStatusTone(effectStatus) {
  if (!effectStatus) return 'neutral';
  const normalized = String(effectStatus).toLowerCase();
  if (normalized.includes('hết hiệu lực') || normalized.includes('hết hạn')) return 'neutral';
  if (normalized.includes('còn hiệu lực') || normalized.includes('đang áp dụng')) return 'success';
  return 'neutral';
}

/** Human-readable message for a document service error code. */
export function documentErrorMessage(error) {
  switch (error?.code) {
    case 'DOCUMENT_NOT_FOUND':
      return 'Không tìm thấy văn bản hoặc bạn không có quyền xem văn bản này.';
    case 'AUTHENTICATION_REQUIRED':
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    case 'ACCOUNT_NOT_ACTIVE':
      return 'Tài khoản chưa được kích hoạt.';
    case 'INVALID_STORAGE_PATH':
    case 'INVALID_EXPIRY':
      return 'Không thể tạo liên kết tải tệp cho văn bản này.';
    default:
      return 'Không tải được dữ liệu văn bản. Vui lòng thử lại.';
  }
}

/** True when the detail view should offer a download control. */
export function canDownloadSource(document) {
  return Boolean(document?.hasSourceFile && document?.storagePath);
}
