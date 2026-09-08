import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const getAuthGuardAction = ({ loading, user, profileError, profile }) => {
  if (loading) return 'LOADING_SESSION';
  if (!user) return 'NAVIGATE_LOGIN';
  if (profileError) return 'ERROR_PROFILE';
  if (!profile) return 'LOADING_PROFILE';
  if (profile.account_status !== 'ACTIVE') return 'ERROR_INACTIVE';
  return 'RENDER_CHILDREN';
};

export const AuthGuard = ({ children }) => {
  const { user, profile, profileError, loading, logout } = useAuth();
  const location = useLocation();

  const action = getAuthGuardAction({ loading, user, profileError, profile });

  if (action === 'LOADING_SESSION') return <div className="page"><div className="loading-skeleton">Đang kiểm tra phiên làm việc...</div></div>;
  if (action === 'NAVIGATE_LOGIN') return <Navigate to="/login" state={{ from: location }} replace />;
  if (action === 'ERROR_PROFILE') {
    return (
      <div className="page">
        <div className="unauthorized-state">
          <h2>Lỗi tải hồ sơ</h2>
          <p>{profileError}</p>
          <button className="btn btn-primary" onClick={logout}>Đăng xuất</button>
        </div>
      </div>
    );
  }
  if (action === 'LOADING_PROFILE') return <div className="page"><div className="loading-skeleton">Đang tải hồ sơ...</div></div>;
  if (action === 'ERROR_INACTIVE') {
    return (
      <div className="page">
        <div className="unauthorized-state">
          <h2>Tài khoản không hợp lệ</h2>
          <p>Tài khoản của bạn đang ở trạng thái {profile.account_status}. Vui lòng liên hệ quản trị viên.</p>
          <button className="btn btn-primary" onClick={logout}>Đăng xuất</button>
        </div>
      </div>
    );
  }

  return children;
};

// P5.5-06 — Member Management routes deliberately do NOT reuse `RoleGuard` as-is (architecture
// mục 24, fix F1): `RoleGuard` gives a lone SYSTEM_ADMIN an automatic bypass
// (`roles.includes('SYSTEM_ADMIN') || allowedRoles.some(...)`), which directly contradicts mục 7/12
// — a SYSTEM_ADMIN without YOUTH_ADMIN has ZERO Member Management permission. This guard is UX
// only; the Member API is the real trust boundary and re-checks authorization on every request
// regardless of what this guard decides (mục 13/24).
export const getMemberManagementGuardAction = ({ loading, roles, requireImportRole = false }) => {
  if (loading) return 'LOADING_SESSION';
  const roleList = roles || [];
  if (requireImportRole) {
    // mục 7/12: only YOUTH_ADMIN may import — BRANCH_OFFICER's ordinary CRUD permission does not
    // extend to bulk import (matches member-api/src/importRoutes.js's own server-side gate).
    return roleList.includes('YOUTH_ADMIN') ? 'RENDER_CHILDREN' : 'FORBIDDEN';
  }
  return roleList.includes('YOUTH_ADMIN') || roleList.includes('BRANCH_OFFICER') ? 'RENDER_CHILDREN' : 'FORBIDDEN';
};

export const MemberManagementGuard = ({ children, requireImportRole = false }) => {
  const { roles, loading } = useAuth();
  const action = getMemberManagementGuardAction({ loading, roles, requireImportRole });

  if (action === 'LOADING_SESSION') return <div className="page"><div className="loading-skeleton">Đang tải quyền hạn...</div></div>;
  if (action === 'FORBIDDEN') {
    return (
      <div className="page">
        <div className="unauthorized-state">
          <h2>Không có quyền truy cập</h2>
          <p>
            {requireImportRole
              ? 'Cần quyền YOUTH_ADMIN để truy cập chức năng import đoàn viên.'
              : 'Cần quyền YOUTH_ADMIN hoặc BRANCH_OFFICER để truy cập Quản lý đoàn viên.'}
          </p>
        </div>
      </div>
    );
  }

  return children;
};

export const RoleGuard = ({ allowedRoles, children }) => {
  const { roles, loading } = useAuth();

  if (loading) return <div className="page"><div className="loading-skeleton">Đang tải quyền hạn...</div></div>;

  const hasPermission = roles.includes('SYSTEM_ADMIN') || allowedRoles.some(role => roles.includes(role));

  if (!hasPermission) {
    return (
      <div className="page">
        <div className="unauthorized-state">
          <h2>Không có quyền truy cập</h2>
          <p>Bạn không có quyền xem trang này.</p>
        </div>
      </div>
    );
  }

  return children;
};
