// Pure presentation helpers for Member Management (P5.5-06). No Supabase/React imports so these
// stay directly unit-testable, matching documentAdminDisplay.mjs/reportDisplay.mjs.

export const MEMBER_STATUS_LABELS = {
  ACTIVE: 'Đang sinh hoạt',
  INACTIVE: 'Tạm ngừng sinh hoạt',
  TRANSFERRED: 'Đã chuyển sinh hoạt',
  ARCHIVED: 'Đã lưu trữ',
};

export const GENDER_LABELS = { NAM: 'Nam', 'NỮ': 'Nữ', 'KHÁC': 'Khác' };

export const POLITICAL_THEORY_LEVEL_LABELS = {
  SO_CAP: 'Sơ cấp',
  TRUNG_CAP: 'Trung cấp',
  CAO_CAP: 'Cao cấp',
};

export const YOUTH_POSITION_LABELS = {
  BI_THU: 'Bí thư',
  PHO_BI_THU: 'Phó Bí thư',
  UY_VIEN: 'Ủy viên',
};

export const YOUTH_BOARD_POSITION_LABELS = {
  TRUONG_BAN_THANH_NIEN: 'Trưởng Ban Thanh niên',
  PHO_BAN_THANH_NIEN: 'Phó Ban Thanh niên',
};

export const IMPORT_JOB_STATUS_LABELS = {
  UPLOADED: 'Đang xử lý',
  READY_FOR_CONFIRM: 'Chờ xác nhận',
  COMMITTED: 'Đã hoàn tất',
  CANCELLED: 'Đã hủy',
  FAILED: 'Thất bại',
};

export const IMPORT_ROW_STATUS_LABELS = {
  VALID: 'Hợp lệ',
  INVALID: 'Lỗi',
  POSSIBLE_DUPLICATE: 'Nghi trùng',
  WARNING: 'Cảnh báo',
};

/** Badge tone for member_status. Label is always rendered next to the badge (docs/02-design-system.md
 * accessibility rule — colour is never the only carrier of meaning). */
export function memberStatusTone(status) {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'INACTIVE':
      return 'warning';
    case 'TRANSFERRED':
      return 'info';
    case 'ARCHIVED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function importJobStatusTone(status) {
  switch (status) {
    case 'COMMITTED':
      return 'success';
    case 'READY_FOR_CONFIRM':
    case 'UPLOADED':
      return 'info';
    case 'FAILED':
      return 'danger';
    case 'CANCELLED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function importRowStatusTone(status) {
  switch (status) {
    case 'VALID':
      return 'success';
    case 'INVALID':
      return 'danger';
    case 'POSSIBLE_DUPLICATE':
      return 'purple';
    case 'WARNING':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** Admin-facing message for a MemberServiceError. Deliberately free of database/HTTP vocabulary. */
export function memberErrorMessage(error) {
  switch (error?.code) {
    case 'NOT_CONFIGURED':
      return 'Chức năng quản lý đoàn viên chưa được cấu hình. Liên hệ quản trị hệ thống.';
    case 'AUTHENTICATION_REQUIRED':
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    case 'FORBIDDEN':
    case 'forbidden':
      return 'Bạn không có quyền thực hiện thao tác này.';
    case 'NOT_FOUND':
    case 'not_found':
      return 'Không tìm thấy dữ liệu yêu cầu.';
    case 'unknown_organization':
      return 'Mã đơn vị không tồn tại.';
    case 'organization_out_of_scope':
      return 'Đơn vị này nằm ngoài phạm vi quản lý của bạn.';
    case 'validation_error':
      return 'Vui lòng kiểm tra lại các trường đã nhập.';
    case 'malformed_workbook':
      return 'Tệp không phải file Excel (.xlsx) hợp lệ hoặc đã bị hỏng.';
    case 'missing_header':
      return 'Thiếu cột bắt buộc trong file Excel (cần có "full_name" và "work_unit_code").';
    case 'duplicate_header':
      return 'File Excel có cột tiêu đề bị trùng lặp.';
    case 'too_many_rows':
      return 'File vượt quá số dòng cho phép.';
    case 'payload_too_large':
      return 'File vượt quá dung lượng cho phép (tối đa 10MB).';
    case 'empty_upload':
      return 'Không nhận được nội dung file.';
    case 'conflict':
      return 'Đợt import này không còn ở trạng thái chờ xác nhận.';
    case 'scope_changed':
      return 'Phạm vi quyền của bạn đã thay đổi kể từ khi tải file lên. Vui lòng tải lại file để import.';
    case 'invalid_row_override':
      return 'Lựa chọn dòng không hợp lệ.';
    case 'database_unavailable':
    case 'organization_directory_unavailable':
      return 'Hệ thống tạm thời không khả dụng. Vui lòng thử lại sau.';
    default:
      return 'Không thực hiện được thao tác. Vui lòng thử lại.';
  }
}
