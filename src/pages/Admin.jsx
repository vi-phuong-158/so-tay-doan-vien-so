import { PageHeader } from '../components/common';
import { useAuth } from '../contexts/AuthContext';

export function AdminDashboard() {
  const { profile } = useAuth();
  return (
    <div className="page">
      <PageHeader title="Bảng điều hành" subtitle="Quản trị nội dung" />
      <div style={{ padding: '16px' }}>
        <p>Chào mừng <strong>{profile?.full_name}</strong> đến với trang quản trị.</p>
        <p>Đây là khu vực dành riêng cho các thao tác quản trị hệ thống và nội dung. Module quản lý chi tiết sẽ được phát triển trong các phase sau.</p>
      </div>
    </div>
  );
}
