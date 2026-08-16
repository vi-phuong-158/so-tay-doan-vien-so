// Pure presentation helpers for the documents admin area (P4-02).
// No Supabase/React imports so these stay directly unit-testable, matching reportDisplay.mjs.

export const DOCUMENT_STATUS_LABELS = {
  DRAFT: 'Bản nháp',
  PROCESSING: 'Đang xử lý',
  PENDING_REVIEW: 'Chờ duyệt',
  PUBLISHED: 'Đã phát hành',
  REPLACED: 'Đã thay thế',
  EXPIRED: 'Hết hiệu lực',
  WITHDRAWN: 'Đã thu hồi'
};

export const VISIBILITY_LABELS = {
  PUBLIC: 'Công khai',
  INTERNAL_YOUTH: 'Nội bộ Đoàn',
  ORGANIZATION_ONLY: 'Chỉ đơn vị',
  RESTRICTED: 'Hạn chế'
};

/**
 * Badge tone for a document status. The label is always rendered next to the badge, so colour is
 * never the only carrier of meaning (docs/02-design-system.md accessibility rule).
 */
export function documentStatusTone(status) {
  switch (status) {
    case 'PUBLISHED':
      return 'success';
    case 'PENDING_REVIEW':
    case 'PROCESSING':
      return 'info';
    case 'WITHDRAWN':
      return 'danger';
    case 'EXPIRED':
    case 'REPLACED':
      return 'warning';
    default:
      return 'neutral';
  }
}

/**
 * Admin-facing message for a service error.
 * Deliberately free of database vocabulary — an admin should never be shown a PostgreSQL error,
 * a constraint name, or an RPC identifier.
 */
export function adminErrorMessage(error) {
  switch (error?.code) {
    case 'DOCUMENT_SCOPE_DENIED':
      return 'Bạn không có quyền quản trị văn bản của đơn vị này.';
    case 'DOCUMENT_NOT_FOUND':
      return 'Không tìm thấy văn bản.';
    case 'DOCUMENT_NOT_EDITABLE':
      return 'Văn bản ở trạng thái này không thể chỉnh sửa.';
    case 'DOCUMENT_HAS_NO_SOURCE':
      return 'Văn bản chưa có tệp gốc để gỡ.';
    case 'INVALID_DOCUMENT_TRANSITION':
      return 'Không thể chuyển trạng thái văn bản từ trạng thái hiện tại.';
    case 'INVALID_DOCUMENT_TITLE':
      return 'Tên văn bản không hợp lệ.';
    case 'INVALID_DOCUMENT_DATES':
      return 'Ngày hết hiệu lực phải sau ngày hiệu lực.';
    case 'INVALID_VISIBILITY_LEVEL':
      return 'Mức hiển thị không hợp lệ.';
    case 'FILE_TYPE_NOT_ALLOWED':
      return 'Định dạng tệp không được phép. Chỉ nhận PDF, Word, Excel, PowerPoint hoặc TXT.';
    case 'FILE_TOO_LARGE':
      return 'Tệp vượt quá dung lượng cho phép (tối đa 50 MB).';
    case 'FILE_REQUIRED':
      return 'Vui lòng chọn một tệp.';
    case 'INVALID_STORAGE_PATH':
      return 'Đường dẫn tệp không hợp lệ.';
    case 'ORGANIZATION_REQUIRED':
      return 'Tài khoản của bạn chưa gắn với đơn vị nào.';
    case 'ACCOUNT_NOT_ACTIVE':
      return 'Tài khoản chưa được kích hoạt.';
    case 'AUTHENTICATION_REQUIRED':
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    case 'VALIDATION_FAILED':
      return 'Vui lòng kiểm tra lại các trường bắt buộc.';
    default:
      return 'Không thực hiện được thao tác. Vui lòng thử lại.';
  }
}

/** Which trusted transitions the UI may offer, derived from the server's own rules. */
export function availableDocumentActions(status) {
  return {
    canPublish: ['DRAFT', 'PENDING_REVIEW', 'WITHDRAWN'].includes(status),
    canWithdraw: ['PUBLISHED', 'PENDING_REVIEW'].includes(status),
    canEdit: !['REPLACED', 'EXPIRED'].includes(status),
    // Detaching a live source file is blocked while published, matching
    // detach_document_source_file's own guard.
    canDetachSource: status !== 'PUBLISHED'
  };
}
