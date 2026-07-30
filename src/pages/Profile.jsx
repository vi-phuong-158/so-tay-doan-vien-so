import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/common';
import { useAuth } from '../contexts/AuthContext';

export function Profile() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

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
            <p>{profile?.job_title || 'Đoàn viên'}</p>
            <p className="org-name">{profile?.organization?.name || 'Chi đoàn'}</p>
          </div>
        </div>
        
        <div className="list menu-list" style={{ marginTop: '24px' }}>
          <div className="list-item"><Icon name="user" /><span>Thông tin cá nhân</span><Icon name="chevron" className="ms-auto text-muted" /></div>
          <div className="list-item"><Icon name="shield" /><span>Đổi mật khẩu</span><Icon name="chevron" className="ms-auto text-muted" /></div>
          <div className="list-item"><Icon name="bell" /><span>Cài đặt thông báo</span><Icon name="chevron" className="ms-auto text-muted" /></div>
          <div className="list-item"><Icon name="chart" /><span>Thống kê hoạt động</span><Icon name="chevron" className="ms-auto text-muted" /></div>
          <div className="list-item text-danger" onClick={handleLogout} style={{ cursor: 'pointer' }}><Icon name="logout" /><span>Đăng xuất</span></div>
        </div>
      </div>
    </div>
  );
}
