import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Button } from '../components/common';
import { useAuth } from '../contexts/AuthContext';
import { Icon } from '../components/Icon';
import { supabase } from '../services/supabaseClient';

export function AdminDashboard() {
  const { profile } = useAuth();
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', fullName: '', roleCode: 'MEMBER' });
  const [managingRoleUserId, setManagingRoleUserId] = useState(null);
  const [roleForm, setRoleForm] = useState({ roleCode: 'MEMBER' });
  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('profiles').select('*, organizations(name)');
      if (error) alert('Lỗi tải danh sách người dùng');
      if (data) setUsers(data);
      setLoading(false);
    };

    const fetchOrgs = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('organizations').select('*');
      if (error) alert('Lỗi tải danh sách đơn vị');
      if (data) setOrgs(data);
      setLoading(false);
    };

    if (tab === 'users') fetchUsers();
    if (tab === 'orgs') fetchOrgs();
  }, [tab]);

  const toggleUserStatus = async (user) => {
    if (user.id === profile.id) {
      alert('Bạn không thể tự khóa tài khoản của chính mình.');
      return;
    }
    const newStatus = user.account_status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (!window.confirm(`Bạn có chắc muốn ${newStatus === 'ACTIVE' ? 'Mở khóa' : 'Khóa'} người dùng ${user.full_name}?`)) return;
    
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'update_status', target_user_id: user.id, status: newStatus }
    });
    if (!error) {
      setUsers(users.map(u => u.id === user.id ? { ...u, account_status: newStatus } : u));
    } else {
      alert(error.message || 'Có lỗi xảy ra');
    }
  };

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    const { email, fullName, roleCode } = inviteForm;
    if (!email || !fullName) return;
    
    // Simplification for UI demo: we assign them to the current user's org.
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'invite', email, full_name: fullName, role_code: roleCode, organization_id: profile.organization_id }
    });
    
    if (error) {
      alert(error.message || 'Lỗi gửi lời mời');
    } else {
      alert('Đã gửi lời mời thành công!');
      setShowInvite(false);
      setInviteForm({ email: '', fullName: '', roleCode: 'MEMBER' });
      setTab('users');
    }
  };

  const handleAssignRole = async (user) => {
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'assign_role', target_user_id: user.id, role_code: roleForm.roleCode, scope_organization_id: user.organization_id }
    });
    if (error) alert('Lỗi cấp quyền: ' + error.message);
    else { alert('Thành công!'); setManagingRoleUserId(null); }
  };

  const handleRevokeRole = async (user) => {
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'revoke_role', target_user_id: user.id, role_code: roleForm.roleCode, scope_organization_id: user.organization_id }
    });
    if (error) alert('Lỗi thu hồi quyền: ' + error.message);
    else { alert('Thành công!'); setManagingRoleUserId(null); }
  };

  return (
    <div className="page">
      <PageHeader title="Bảng điều hành" subtitle="Quản trị hệ thống" />
      <div style={{ padding: '16px' }}>
        <p style={{ marginBottom: '24px' }}>Chào mừng <strong>{profile?.full_name}</strong>. Đây là khu vực quản trị.</p>
        <div className="campaign-form-actions" style={{ marginBottom: '16px' }}>
          <Link className="button button-primary" to="/admin/bao-cao">Quản lý đợt báo cáo</Link>
          <Link className="button button-secondary" to="/admin/van-ban">Quản trị văn bản</Link>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
          <button className={`btn ${tab === 'users' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('users')}>Người dùng</button>
          <button className={`btn ${tab === 'orgs' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('orgs')}>Đơn vị trực thuộc</button>
        </div>

        {tab === 'users' && (
          <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3>Danh sách người dùng</h3>
              <Button onClick={() => setShowInvite(!showInvite)}><Icon name="plus" size={16} /> Mời thành viên</Button>
            </div>
            
            {showInvite && (
              <form onSubmit={handleInviteSubmit} style={{ padding: '16px', background: 'var(--background)', marginBottom: '16px', borderRadius: '4px' }}>
                <h4 style={{ marginBottom: '12px' }}>Gửi lời mời thành viên mới</h4>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input required placeholder="Email" type="email" value={inviteForm.email} onChange={e => setInviteForm({...inviteForm, email: e.target.value})} style={{ flex: 1, padding: '8px' }} />
                  <input required placeholder="Họ và tên" value={inviteForm.fullName} onChange={e => setInviteForm({...inviteForm, fullName: e.target.value})} style={{ flex: 1, padding: '8px' }} />
                  <select value={inviteForm.roleCode} onChange={e => setInviteForm({...inviteForm, roleCode: e.target.value})} style={{ padding: '8px' }}>
                    <option value="MEMBER">Đoàn viên</option>
                    <option value="BRANCH_OFFICER">Cán bộ chi đoàn</option>
                    <option value="YOUTH_ADMIN">Quản trị cấp bộ Đoàn</option>
                  </select>
                </div>
                <Button type="submit" variant="primary">Gửi lời mời</Button>
                <Button type="button" variant="outline" onClick={() => setShowInvite(false)} style={{ marginLeft: '8px' }}>Hủy</Button>
              </form>
            )}
            
            {loading ? <p>Đang tải...</p> : (
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
                  {users.map(user => (
                    <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px' }}>{user.full_name}</td>
                      <td style={{ padding: '8px' }}>{user.organizations?.name || '---'}</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ color: user.account_status === 'ACTIVE' ? 'var(--success)' : 'var(--error)' }}>
                          {user.account_status}
                        </span>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <button className="icon-button" title={user.account_status === 'ACTIVE' ? "Khóa" : "Mở khóa"} onClick={() => toggleUserStatus(user)}>
                          <Icon name={user.account_status === 'ACTIVE' ? "lock" : "unlock"} size={16} />
                        </button>
                        <button className="icon-button" title="Phân quyền" onClick={() => setManagingRoleUserId(managingRoleUserId === user.id ? null : user.id)}>
                          <Icon name="key" size={16} />
                        </button>
                        {managingRoleUserId === user.id && (
                          <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}>
                            <select value={roleForm.roleCode} onChange={e => setRoleForm({ roleCode: e.target.value })}>
                              <option value="MEMBER">Đoàn viên</option>
                              <option value="BRANCH_OFFICER">Cán bộ chi đoàn</option>
                              <option value="YOUTH_ADMIN">Quản trị cấp bộ Đoàn</option>
                            </select>
                            <button onClick={() => handleAssignRole(user)}>Cấp</button>
                            <button onClick={() => handleRevokeRole(user)}>Thu hồi</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'orgs' && (
          <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3>Đơn vị trực thuộc</h3>
              <Button disabled title="Chức năng đang phát triển"><Icon name="plus" size={16} /> Thêm đơn vị</Button>
            </div>
            {loading ? <p>Đang tải...</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Tên đơn vị</th>
                    <th style={{ padding: '8px' }}>Loại</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map(org => (
                    <tr key={org.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px' }}>{org.name}</td>
                      <td style={{ padding: '8px' }}>{org.organization_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
