import { PageHeader } from '../components/common';
import { useAuth } from '../contexts/AuthContext';

export function AdminDashboard() {
  const { profile } = useAuth();
  return (
    <div className="page">
      <PageHeader title="Bảng điều hành" subtitle="Quản trị hệ thống" />
      <div style={{ padding: '16px' }}>
        <p>Chào mừng <strong>{profile?.full_name}</strong> đến với trang quản trị.</p>
        
        <div className="metrics-grid" style={{marginTop: '24px'}}>
          <div className="metric-card">
            <div className="metric-info"><strong>Quản lý Người dùng</strong><span>Danh sách, cấp quyền, khóa tài khoản</span></div>
          </div>
          <div className="metric-card">
            <div className="metric-info"><strong>Quản lý Đơn vị</strong><span>Cơ cấu tổ chức cấp dưới</span></div>
          </div>
          <div className="metric-card">
            <div className="metric-info"><strong>Cài đặt Hệ thống</strong><span>Cấu hình, phân quyền nâng cao</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
