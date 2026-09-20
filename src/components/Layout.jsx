import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { Brand } from './common';
import { useAuth } from '../contexts/AuthContext';
import { NotificationBell } from './NotificationBell';

const primaryNavItems = [
  ['/', 'home', 'Trang chủ'],
  ['/cong-viec', 'work', 'Công việc'],
  ['/tri-thuc', 'book', 'Tri thức'],
  ['/doi-moi-sang-tao', 'bulb', 'Đổi mới'],
  ['/ca-nhan', 'user', 'Cá nhân']
];

function Sidebar() {
  const navigate = useNavigate();
  const { profile, hasRole, roles } = useAuth();
  // P5.5-06: deliberately NOT `hasRole` — `hasRole` bakes in a SYSTEM_ADMIN bypass
  // (`roles.includes(role) || roles.includes('SYSTEM_ADMIN')`), which mục 7/12 explicitly forbids
  // for Member Management (see Guards.jsx's MemberManagementGuard for the same rule enforced on
  // the routes themselves — this is UX-only, the Member API re-checks regardless).
  const canManageMembers = (roles || []).includes('YOUTH_ADMIN') || (roles || []).includes('BRANCH_OFFICER');

  return (
    <aside className="sidebar">
      <Brand />
      <nav>
        {primaryNavItems.map(([url, icon, label]) => (
          <NavLink key={url} to={url} end={url === '/'} className={({isActive}) => isActive ? 'active' : ''}>
            <Icon name={icon} /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
      {(hasRole('YOUTH_ADMIN') || hasRole('SYSTEM_ADMIN')) && (
        <div className="sidebar-admin">
          <span>Quản trị nội dung</span>
          <button onClick={() => navigate('/admin')}><Icon name="shield" />Bảng điều hành</button>
        </div>
      )}
      {canManageMembers && (
        <div className="sidebar-admin">
          <span>Đoàn viên</span>
          <button onClick={() => navigate('/quan-ly-doan-vien')}><Icon name="users" />Quản lý đoàn viên</button>
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

export function BottomNavigation() {
  return (
    <nav className="bottom-nav" aria-label="Điều hướng chính">
      {primaryNavItems.map(([url, icon, label]) => (
        <NavLink key={url} to={url} end={url === '/'} className={({isActive}) => isActive ? 'active' : ''}>
          <span className="nav-icon"><Icon name={icon} size={22} /></span><small>{label}</small>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const usesBrandedMobileHeader = pathname === '/'
    || pathname === '/tri-thuc'
    || pathname === '/tri-thuc/hoi-ai'
    || (Boolean(user) && (
      pathname === '/cong-viec'
      || pathname.startsWith('/cong-viec/bao-cao/')
      || pathname.startsWith('/tri-thuc/trac-nghiem/')
      || pathname.startsWith('/quan-ly-doan-vien')
    ));

  return (
    <div className={`app-layout${usesBrandedMobileHeader ? ' app-layout--branded-mobile-header' : ''}`}>
      <Sidebar />
      <main className="main-content">
        <div className="mobile-topbar">
          <Brand compact />
          {user && <NotificationBell />}
        </div>
        <Outlet />
      </main>
      <BottomNavigation />
    </div>
  );
}
