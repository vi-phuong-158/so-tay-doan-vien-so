import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Brand, Progress, StatusBadge } from '../components/common';
import { NotificationBell } from '../components/NotificationBell';
import Skeleton from '../components/Skeleton';
import { DocumentCard } from './Documents';
import { TopicCard } from './LearningTopics';
import { useAuth } from '../contexts/AuthContext';
import { createReportService } from '../services/reportService';
import { createNotificationService } from '../services/notificationService';
import { createMemberService } from '../services/memberService';
import { createDocumentService } from '../services/documentService';
import { createLearningService } from '../services/learningService';
import { supabase } from '../services/supabaseClient';
import { NQ_QUIZ_ID } from '../services/nqQuizService';
import {
  formatReportDate,
  getEffectiveDueAt,
  REPORT_STATUS_GROUPS,
  sortAssignments
} from '../lib/reportDisplay.mjs';

const WEEKDAY_DATE = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit'
}).format(new Date());

const reportService = createReportService(supabase);
const notificationService = createNotificationService(supabase);
const memberService = createMemberService(supabase, {
  baseUrl: import.meta.env.VITE_MEMBER_API_URL
});
const documentService = createDocumentService(supabase);
const learningService = createLearningService(supabase);
const LATEST_DOCUMENTS = 3;
const LATEST_TOPICS = 2;

function getDueSoonAssignments(assignments) {
  const cutoff = Date.now() + 7 * 24 * 60 * 60 * 1000;
  return sortAssignments(
    assignments.filter((assignment) => {
      if (!REPORT_STATUS_GROUPS.active.includes(assignment.status)) return false;
      const dueAt = getEffectiveDueAt(assignment);
      return dueAt && new Date(dueAt).getTime() <= cutoff;
    }),
    'active'
  );
}

function MetricCard({ href, icon, label, value, tone = '' }) {
  const content = (
    <>
      <span className={`metric-icon ${tone}`}><Icon name={icon} size={18} /></span>
      <strong>{value}</strong>
      <small>{label}</small>
    </>
  );

  return href
    ? <Link className="metric-card" to={href}>{content}</Link>
    : <div className="metric-card">{content}</div>;
}

function SectionHeading({ number, title, action, to }) {
  return (
    <div className="home-section-heading">
      <h2><span>{number}</span>{title}</h2>
      {action && <Link to={to}>{action}<Icon name="arrow" size={15} /></Link>}
    </div>
  );
}

export function Home() {
  const { user, profile, roles } = useAuth();
  const isGuest = !user;
  const canManageMembers = (roles || []).includes('YOUTH_ADMIN') || (roles || []).includes('BRANCH_OFFICER');
  const canOpenDashboard = (roles || []).includes('YOUTH_ADMIN');
  const [assignments, setAssignments] = useState([]);
  const [metrics, setMetrics] = useState({ notificationCount: null, dueSoonCount: null, memberCount: null });
  const [latest, setLatest] = useState({ loading: true, documents: [], topics: [] });

  // Guest home shows the newest public items; RLS already limits both lists to published PUBLIC content.
  useEffect(() => {
    if (!isGuest) return undefined;
    let mounted = true;
    const loadLatest = async () => {
      const [documentResult, topicResult] = await Promise.allSettled([
        documentService.listDocuments({ page: 0, pageSize: LATEST_DOCUMENTS }),
        learningService.listTopics({ page: 0, pageSize: LATEST_TOPICS })
      ]);
      if (!mounted) return;
      setLatest({
        loading: false,
        documents: documentResult.status === 'fulfilled' ? documentResult.value.items : [],
        topics: topicResult.status === 'fulfilled' ? topicResult.value.items : []
      });
    };
    const timer = setTimeout(loadLatest, 0);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [isGuest]);

  useEffect(() => {
    let mounted = true;
    const loadDashboard = async () => {
      if (!user?.id) {
        if (mounted) {
          setAssignments([]);
          setMetrics({ notificationCount: null, dueSoonCount: null, memberCount: null });
        }
        return;
      }
      const [notificationResult, assignmentResult, memberResult] = await Promise.allSettled([
        notificationService.getUnreadCount(),
        reportService.getMyAssignments(),
        canManageMembers
          ? memberService.listMembers({ page: 0, pageSize: 1, sort: 'full_name_asc' })
          : Promise.resolve(null)
      ]);

      if (!mounted) return;
      const nextAssignments = assignmentResult.status === 'fulfilled' ? assignmentResult.value : [];
      const dueSoonAssignments = getDueSoonAssignments(nextAssignments);
      setAssignments(nextAssignments);
      setMetrics({
        notificationCount: notificationResult.status === 'fulfilled' ? notificationResult.value : null,
        dueSoonCount: assignmentResult.status === 'fulfilled' ? dueSoonAssignments.length : null,
        memberCount: memberResult.status === 'fulfilled' ? memberResult.value?.total ?? null : null
      });
    };

    const timer = setTimeout(loadDashboard, 0);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [user?.id, canManageMembers]);

  const dueSoonAssignments = useMemo(() => getDueSoonAssignments(assignments), [assignments]);
  const priorityAssignment = dueSoonAssignments[0];
  const userName = profile?.full_name?.trim();

  return (
    <div className="page home-page">
      <header className="home-hero">
        <div className="home-hero-inner">
          <div className="hero-top">
            <Brand />
            {user
              ? <NotificationBell />
              : <Link className="hero-login" to="/login"><Icon name="user" size={17} />Đăng nhập</Link>}
          </div>
          <div className="hero-greeting">
            <span>{WEEKDAY_DATE}</span>
            <h1>{isGuest ? 'Chào bạn' : `Chào đồng chí${userName ? ` ${userName}` : ''}`}</h1>
            <p>
              {isGuest
                ? 'Khám phá tri thức công khai của tuổi trẻ Công an tỉnh Phú Thọ.'
                : 'Cùng theo dõi công việc và hoạt động Đoàn của đồng chí.'}
            </p>
            {user && metrics.dueSoonCount !== null && (
              <span className="hero-task-count">{metrics.dueSoonCount} việc cần chú ý trong 7 ngày tới</span>
            )}
          </div>
        </div>
      </header>

      <div className="home-body">
        <div className="metrics-grid overlap" aria-label={isGuest ? 'Lối vào nội dung công khai' : 'Tổng quan hoạt động'}>
          {isGuest ? (
            <>
              <MetricCard href="/tri-thuc/van-ban" icon="file-search" label="Văn bản công khai" value="Tra cứu" tone="blue" />
              <MetricCard href="/tri-thuc/chuyen-de" icon="school" label="Chuyên đề" value="Học tập" tone="blue" />
              <MetricCard href="/doi-moi-sang-tao" icon="bulb" label="Đổi mới sáng tạo" value="Khám phá" tone="blue" />
            </>
          ) : (
            <>
              <MetricCard href="/ca-nhan/thong-bao" icon="bell" label="Thông báo mới" value={metrics.notificationCount ?? '—'} tone="blue" />
              <MetricCard href="/cong-viec" icon="clock" label="Việc sắp hạn" value={metrics.dueSoonCount ?? '—'} tone="orange" />
              <MetricCard
                href={canManageMembers ? '/quan-ly-doan-vien' : undefined}
                icon="users"
                label="Đoàn viên"
                value={canManageMembers ? metrics.memberCount ?? '—' : '—'}
                tone="green"
              />
            </>
          )}
        </div>

        <section
          className="home-campaign-nq13"
          aria-label="Kiểm tra học tập Nghị quyết Đại hội Đoàn toàn quốc lần thứ XIII"
        >
          <div className="home-campaign-body">
            <div className="home-campaign-badge-group">
              <span className="home-campaign-kicker">KIỂM TRA HỌC TẬP</span>
              <span className="home-campaign-meta">30 câu hỏi · 20 phút · Đạt từ 80%</span>
            </div>
            <h2 className="home-campaign-title">
              Nghị quyết Đại hội Đoàn toàn quốc lần thứ XIII
            </h2>
            <p className="home-campaign-desc">
              Hoàn thành đạt yêu cầu để nhận chứng nhận
            </p>
            <div className="home-campaign-actions">
              <Link
                to={`/tri-thuc/trac-nghiem/${NQ_QUIZ_ID}`}
                className="button button-primary home-campaign-primary-btn"
              >
                <Icon name="school" size={18} />
                <span>BẮT ĐẦU THI</span>
              </Link>
              <Link
                to={`/tri-thuc/trac-nghiem/${NQ_QUIZ_ID}?view=lookup`}
                className="button button-secondary home-campaign-secondary-btn"
              >
                <Icon name="search" size={17} />
                <span>TRA CỨU 300 CÂU HỎI</span>
              </Link>
            </div>
          </div>
          <div className="home-campaign-visual" aria-hidden="true">
            <img
              src="/brand/logo-doan-badge.png"
              alt=""
              className="home-campaign-logo"
              width="88"
              height="88"
            />
          </div>
        </section>

        {isGuest ? (
          <section className="home-public-card" aria-label={isGuest ? 'Khám phá kho tri thức công khai' : 'Trang chủ'}>
            <div>
              <span className="home-public-kicker">TRI THỨC CÔNG KHAI</span>
              <h2>Tìm văn bản và chuyên đề đã công bố</h2>
              <p>Nội dung công khai mở trực tiếp. Tài khoản cần thiết khi bạn làm bài hoặc xem khu vực nội bộ.</p>
            </div>
            <div className="home-public-actions">
              <Link className="button button-primary" to="/tri-thuc">Mở kho tri thức</Link>
              <Link className="home-text-link" to="/tri-thuc/hoi-ai"><Icon name="sparkles" size={17} />Hỏi AI</Link>
            </div>
          </section>
        ) : null}

        {isGuest && (latest.loading || latest.documents.length > 0 || latest.topics.length > 0) && (
          <section className="home-section home-latest" aria-label="Nội dung mới công bố">
            <SectionHeading number="01" title="Mới công bố" action="Xem tất cả" to="/tri-thuc" />
            <div className="document-list">
              {latest.loading
                ? <Skeleton lines={4} />
                : <>
                  {latest.documents.map((item) => <DocumentCard key={item.id} item={item} />)}
                  {latest.topics.map((topic) => <TopicCard key={topic.id} topic={topic} />)}
                </>}
            </div>
          </section>
        )}

        {isGuest ? null : (
          <>
            <section className="home-section">
              <SectionHeading number="01" title="Việc cần làm" action="Tất cả" to="/cong-viec" />
              {priorityAssignment ? (
                <Link className="home-task-card" to={`/cong-viec/bao-cao/${priorityAssignment.id}`}>
                  <div className="home-task-heading">
                    <div>
                      <span className="home-card-kicker">BÁO CÁO ĐANG THỰC HIỆN</span>
                      <h3>{priorityAssignment.campaign?.title || 'Nhiệm vụ báo cáo'}</h3>
                    </div>
                    <StatusBadge status={priorityAssignment.status} />
                  </div>
                  <p>{priorityAssignment.campaign?.issuer || 'Đợt báo cáo của đơn vị'}</p>
                  <div className="home-task-progress"><Progress value={priorityAssignment.status === 'SUBMITTED' ? 100 : 45} /><span>{formatReportDate(getEffectiveDueAt(priorityAssignment))}</span></div>
                  <span className="home-task-open">Mở nhiệm vụ<Icon name="arrow" size={15} /></span>
                </Link>
              ) : (
                <div className="home-task-empty">
                  <span><Icon name="check" size={19} /></span>
                  <div>
                    <strong>Chưa có nhiệm vụ sắp hạn</strong>
                    <p>{metrics.dueSoonCount === null ? 'Chưa tải được danh sách công việc.' : 'Các nhiệm vụ đang được theo dõi trong mục Công việc.'}</p>
                  </div>
                </div>
              )}
            </section>

            {canManageMembers && (
              <section className="home-section">
                <SectionHeading number="02" title="Quản lý đoàn viên" action="Tất cả" to="/quan-ly-doan-vien" />
                <div className="home-shortcuts">
                  <Link className="home-shortcut" to="/quan-ly-doan-vien">
                    <span><Icon name="users" size={19} /></span>
                    <div><strong>Danh sách đoàn viên</strong><small>Tìm kiếm và xem hồ sơ</small></div>
                    <Icon name="chevron" size={17} />
                  </Link>
                  {canOpenDashboard && (
                    <Link className="home-shortcut" to="/admin">
                      <span><Icon name="chart" size={19} /></span>
                      <div><strong>Bảng điều hành</strong><small>Tổng quan hoạt động Đoàn</small></div>
                      <Icon name="chevron" size={17} />
                    </Link>
                  )}
                </div>
              </section>
            )}

            <section className="home-section home-knowledge-shortcut">
              <SectionHeading number={canManageMembers ? '03' : '02'} title="Tri thức" action="Khám phá" to="/tri-thuc" />
              <Link className="home-knowledge-card" to="/tri-thuc">
                <span><Icon name="book" size={20} /></span>
                <div><strong>Văn bản và chuyên đề đã công bố</strong><small>Tra cứu nội dung chính thống trong kho tri thức.</small></div>
                <Icon name="chevron" size={17} />
              </Link>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
