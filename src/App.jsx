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
import { ReportAssignmentDetail } from './pages/ReportAssignmentDetail';
import { Knowledge } from './pages/Knowledge';
import { AskAi } from './pages/AskAi';
import { Documents } from './pages/Documents';
import { DocumentDetail } from './pages/DocumentDetail';
import { LearningTopics } from './pages/LearningTopics';
import { LearningTopicDetail } from './pages/LearningTopicDetail';
import { Quiz } from './pages/Quiz';
import { Innovation } from './pages/Innovation';
import { Profile } from './pages/Profile';
import { Notifications } from './pages/Notifications';
import { AdminDashboard } from './pages/Admin';
import { AdminReports } from './pages/AdminReports';
import { AdminDocuments } from './pages/AdminDocuments';
import { AdminReportDashboard } from './pages/AdminReportDashboard';
import { AdminLearningTopics } from './pages/AdminLearningTopics';
import { AdminLearningTopicDetail } from './pages/AdminLearningTopicDetail';
import { AdminQuizEditor } from './pages/AdminQuizEditor';
import { AdminKnowledgeArticle } from './pages/AdminKnowledgeArticle';

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
            <Route path="cong-viec/bao-cao/:assignmentId" element={<ReportAssignmentDetail />} />
            <Route path="tri-thuc" element={<Knowledge />} />
            <Route path="tri-thuc/hoi-ai" element={<AskAi />} />
            <Route path="tri-thuc/van-ban" element={<Documents />} />
            <Route path="tri-thuc/van-ban/:documentId" element={<DocumentDetail />} />
            <Route path="tri-thuc/chuyen-de" element={<LearningTopics />} />
            <Route path="tri-thuc/chuyen-de/:topicId" element={<LearningTopicDetail />} />
            <Route path="tri-thuc/trac-nghiem/:quizId" element={<Quiz />} />
            <Route path="doi-moi-sang-tao" element={<Innovation />} />
            <Route path="ca-nhan" element={<Profile />} />

            {/* Profile Routes */}
            <Route path="ca-nhan/thong-bao" element={<Notifications />} />
            <Route path="ca-nhan/doi-mat-khau" element={<ChangePassword />} />

            {/* Admin Routes */}
            <Route path="admin" element={
              <RoleGuard allowedRoles={['YOUTH_ADMIN']}>
                <AdminDashboard />
              </RoleGuard>
            } />
            <Route path="admin/van-ban" element={
              <RoleGuard allowedRoles={['YOUTH_ADMIN']}>
                <AdminDocuments />
              </RoleGuard>
            } />
            <Route path="admin/van-ban/:documentId/tri-thuc" element={<RoleGuard allowedRoles={['YOUTH_ADMIN']}><AdminKnowledgeArticle /></RoleGuard>} />
            <Route path="admin/chuyen-de" element={<RoleGuard allowedRoles={['YOUTH_ADMIN']}><AdminLearningTopics /></RoleGuard>} />
            <Route path="admin/chuyen-de/:topicId" element={<RoleGuard allowedRoles={['YOUTH_ADMIN']}><AdminLearningTopicDetail /></RoleGuard>} />
            <Route path="admin/chuyen-de/:topicId/trac-nghiem/:quizId" element={<RoleGuard allowedRoles={['YOUTH_ADMIN']}><AdminQuizEditor /></RoleGuard>} />
            <Route path="admin/bao-cao" element={
              <RoleGuard allowedRoles={['YOUTH_ADMIN']}>
                <AdminReports />
              </RoleGuard>
            } />
            <Route path="admin/bao-cao/:campaignId" element={
              <RoleGuard allowedRoles={['YOUTH_ADMIN']}>
                <AdminReports />
              </RoleGuard>
            } />
            <Route path="admin/bao-cao/:campaignId/dashboard" element={
              <RoleGuard allowedRoles={['YOUTH_ADMIN']}>
                <AdminReportDashboard />
              </RoleGuard>
            } />
            
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
