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
