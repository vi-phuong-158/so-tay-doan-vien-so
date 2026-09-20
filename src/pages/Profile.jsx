import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/common';
import { useAuth } from '../contexts/AuthContext';

const ROLE_LABELS = {
  SYSTEM_ADMIN: 'Quản trị hệ thống',
  YOUTH_ADMIN: 'Quản trị nội dung',
  BRANCH_OFFICER: 'Cán bộ Đoàn'
};

export function Profile() {
  const { profile, roles, logout } = useAuth();
  const navigate = useNavigate();
  const roleLabel = (roles || []).map((role) => ROLE_LABELS[role]).filter(Boolean).join(' · ') || 'Tài khoản được cấp';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="page">
      <PageHeader title="Cá nhân" />
      <div style={{ padding: '16px' }}>
        <div className="profile-header">
          <div className="avatar-large">{profile ? profile.full_name.substring(0,2).toUpperCase() : 'ĐV'}</div>
          <div>
            <h2>{profile ? profile.full_name : 'Tên tài khoản'}</h2>
            <p>{roleLabel}</p>
            <p className="org-name">{profile?.organization?.short_name || profile?.organization?.name || 'Đơn vị chưa được gán'}</p>
          </div>
        </div>

        <p className="account-record-note">Đây là thông tin tài khoản đăng nhập. Hồ sơ đoàn viên được quản lý riêng theo quyền truy cập.</p>

        <div className="list menu-list" style={{ marginTop: '24px' }}>
          <button type="button" className="list-item" onClick={() => navigate('/ca-nhan/doi-mat-khau')}><Icon name="shield" /><span>Đổi mật khẩu</span><Icon name="chevron" className="ms-auto text-muted" /></button>
          <button type="button" className="list-item" onClick={() => navigate('/ca-nhan/thong-bao')}><Icon name="bell" /><span>Thông báo</span><Icon name="chevron" className="ms-auto text-muted" /></button>
          <button type="button" className="list-item text-danger" onClick={handleLogout}><Icon name="logout" /><span>Đăng xuất</span></button>
        </div>
      </div>
    </div>
  );
}
