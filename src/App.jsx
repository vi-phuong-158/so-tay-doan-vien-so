import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AuthGuard, RoleGuard } from './components/Guards';
import { AppShell } from './components/Layout';

import { Login } from './pages/auth/Login';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { ResetPassword } from './pages/auth/ResetPassword';
import { ChangePassword } from './pages/auth/ChangePassword';

import { Home } from './pages/Home';
import { Work } from './pages/Work';
import { Knowledge } from './pages/Knowledge';
import { Innovation } from './pages/Innovation';
import { Profile } from './pages/Profile';
import { AdminDashboard } from './pages/Admin';

import { EmptyState } from './components/common';

function NotFound() {
  return (
    <div className="page">
      <div style={{ padding: '40px 16px', display: 'flex', justifyContent: 'center' }}>
        <EmptyState icon="alert" title="Không tìm thấy trang" description="Trang bạn yêu cầu không tồn tại hoặc đã bị di chuyển." />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/quen-mat-khau" element={<ForgotPassword />} />
          <Route path="/dat-lai-mat-khau" element={<ResetPassword />} />

          {/* Protected Routes inside AppShell */}
          <Route path="/" element={<AuthGuard><AppShell /></AuthGuard>}>
            <Route index element={<Home />} />
            <Route path="cong-viec" element={<Work />} />
            <Route path="tri-thuc" element={<Knowledge />} />
            <Route path="doi-moi-sang-tao" element={<Innovation />} />
            <Route path="ca-nhan" element={<Profile />} />

            {/* Profile Routes */}
            <Route path="ca-nhan/thong-bao" element={
              <div className="page"><div style={{padding: '16px'}}><h2>Thông báo</h2><p>Tính năng đang phát triển.</p></div></div>
            } />
            <Route path="ca-nhan/doi-mat-khau" element={<ChangePassword />} />

            {/* Admin Routes */}
            <Route path="admin" element={
              <RoleGuard allowedRoles={['YOUTH_ADMIN']}>
                <AdminDashboard />
              </RoleGuard>
            } />
            
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
