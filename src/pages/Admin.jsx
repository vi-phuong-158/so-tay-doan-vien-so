import { useState } from 'react';
import { PageHeader, Button } from '../components/common';
import { useAuth } from '../contexts/AuthContext';
import { Icon } from '../components/Icon';

export function AdminDashboard() {
  const { profile } = useAuth();
  const [tab, setTab] = useState('users');

  return (
    <div className="page">
      <PageHeader title="Bảng điều hành" subtitle="Quản trị hệ thống" />
      <div style={{ padding: '16px' }}>
        <p style={{ marginBottom: '24px' }}>Chào mừng <strong>{profile?.full_name}</strong>. Đây là khu vực quản trị.</p>
        
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
          <button className={`btn ${tab === 'users' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('users')}>Người dùng</button>
          <button className={`btn ${tab === 'orgs' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('orgs')}>Đơn vị trực thuộc</button>
        </div>

        {tab === 'users' && (
          <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3>Danh sách người dùng</h3>
              <Button><Icon name="plus" size={16} /> Mời thành viên</Button>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input type="text" placeholder="Tìm kiếm..." style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', flex: 1 }} />
              <select style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                <option value="">Tất cả trạng thái</option>
                <option value="ACTIVE">Hoạt động</option>
                <option value="SUSPENDED">Đã khóa</option>
              </select>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Họ tên</th>
                  <th style={{ padding: '8px' }}>Đơn vị</th>
                  <th style={{ padding: '8px' }}>Trạng thái</th>
                  <th style={{ padding: '8px' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px' }}>Nguyễn Văn A</td>
                  <td style={{ padding: '8px' }}>Chi đoàn Mẫu</td>
                  <td style={{ padding: '8px' }}><span style={{ color: 'var(--success)' }}>ACTIVE</span></td>
                  <td style={{ padding: '8px' }}>
                    <button className="icon-button" title="Khóa"><Icon name="lock" size={16} /></button>
                    <button className="icon-button" title="Phân quyền"><Icon name="shield" size={16} /></button>
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px' }}>Trần Thị B</td>
                  <td style={{ padding: '8px' }}>Chi đoàn Mẫu</td>
                  <td style={{ padding: '8px' }}><span style={{ color: 'var(--error)' }}>SUSPENDED</span></td>
                  <td style={{ padding: '8px' }}>
                    <button className="icon-button" title="Mở khóa"><Icon name="unlock" size={16} /></button>
                    <button className="icon-button" title="Phân quyền"><Icon name="shield" size={16} /></button>
                  </td>
                </tr>
              </tbody>
            </table>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '16px' }}>(Dữ liệu minh họa)</p>
          </div>
        )}

        {tab === 'orgs' && (
          <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3>Đơn vị trực thuộc</h3>
              <Button><Icon name="plus" size={16} /> Thêm đơn vị</Button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Tên đơn vị</th>
                  <th style={{ padding: '8px' }}>Loại</th>
                  <th style={{ padding: '8px' }}>Số thành viên</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px' }}>Chi đoàn Mẫu 1</td>
                  <td style={{ padding: '8px' }}>Cơ sở</td>
                  <td style={{ padding: '8px' }}>45</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px' }}>Chi đoàn Mẫu 2</td>
                  <td style={{ padding: '8px' }}>Cơ sở</td>
                  <td style={{ padding: '8px' }}>32</td>
                </tr>
              </tbody>
            </table>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '16px' }}>(Dữ liệu minh họa)</p>
          </div>
        )}
      </div>
    </div>
  );
}
