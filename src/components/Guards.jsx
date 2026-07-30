import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const AuthGuard = ({ children }) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="page"><div className="loading-skeleton">Đang kiểm tra phiên làm việc...</div></div>;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!profile) {
    return <div className="page"><div className="loading-skeleton">Đang tải hồ sơ...</div></div>;
  }

  if (profile.account_status !== 'ACTIVE') {
    return (
      <div className="page">
        <div className="unauthorized-state">
          <h2>Tài khoản không hợp lệ</h2>
          <p>Tài khoản của bạn đang ở trạng thái {profile.account_status}. Vui lòng liên hệ quản trị viên.</p>
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
