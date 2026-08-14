import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { Brand } from './common';
import { useAuth } from '../contexts/AuthContext';
import { NotificationBell } from './NotificationBell';

function Sidebar() {
  const navigate = useNavigate();
  const { profile, hasRole } = useAuth();
  
  const items = [
    ['/', 'home', 'Trang chủ'], 
    ['/cong-viec', 'work', 'Công việc'], 
    ['/tri-thuc', 'book', 'Tri thức'], 
    ['/doi-moi-sang-tao', 'bulb', 'Đổi mới sáng tạo'], 
    ['/ca-nhan', 'user', 'Cá nhân']
  ];
  
  return (
    <aside className="sidebar">
      <Brand />
      <nav>
        {items.map(([url, icon, label]) => (
          <NavLink key={url} to={url} end={url === '/'} className={({isActive}) => isActive ? 'active' : ''}>
            <Icon name={icon} /><span>{label}</span>{url === '/cong-viec' && <b>2</b>}
          </NavLink>
        ))}
      </nav>
      {(hasRole('YOUTH_ADMIN') || hasRole('SYSTEM_ADMIN')) && (
        <div className="sidebar-admin">
          <span>Quản trị nội dung</span>
          <button onClick={() => navigate('/admin')}><Icon name="shield" />Bảng điều hành</button>
        </div>
      )}
      {profile && (
        <div className="sidebar-user">
          <div className="avatar">{profile.full_name.substring(0,2).toUpperCase()}</div>
          <div><strong>{profile.full_name}</strong><span>{profile.organization?.short_name || 'Hệ thống'}</span></div>
        </div>
      )}
    </aside>
  );
}

function BottomNav() {
  const items = [
    ['/', 'home', 'Trang chủ'], 
    ['/cong-viec', 'work', 'Công việc'], 
    ['/tri-thuc', 'book', 'Tri thức'], 
    ['/doi-moi-sang-tao', 'bulb', 'Đổi mới'], 
    ['/ca-nhan', 'user', 'Cá nhân']
  ];
  return (
    <nav className="bottom-nav">
      {items.map(([url, icon, label]) => (
        <NavLink key={url} to={url} end={url === '/'} className={({isActive}) => isActive ? 'active' : ''}>
          <span className="nav-icon"><Icon name={icon} size={22} />{url === '/cong-viec' && <i>2</i>}</span><small>{label}</small>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="mobile-topbar">
          <Brand compact />
          <NotificationBell />
        </div>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
