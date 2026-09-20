import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Brand } from '../components/common';
import { NotificationBell } from '../components/NotificationBell';
import { useAuth } from '../contexts/AuthContext';

const WEEKDAY_DATE = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' }).format(new Date());

export function Home() {
  const { user, profile, roles } = useAuth();
  const isGuest = !user;
  const userName = profile ? profile.full_name : 'bạn';
  const canManageMembers = (roles || []).includes('YOUTH_ADMIN') || (roles || []).includes('BRANCH_OFFICER');

  return (
    <div className="page home-page">
      <div className="home-hero">
        <div className="hero-top">
          <Brand />
          {user && <NotificationBell />}
        </div>
        <div className="hero-greeting">
          <span style={{ textTransform: 'capitalize' }}>{WEEKDAY_DATE}</span>
          <h1>Chào {userName},</h1>
          <p>{isGuest ? 'Khám phá kho tri thức công khai của tuổi trẻ Công an tỉnh Phú Thọ' : 'Thông tin và công việc dành cho bạn'}</p>
        </div>
      </div>

      <div className="home-body">
        {!isGuest && <div className="section-eyebrow"><span>01 — CÔNG VIỆC</span><i /><Link to="/cong-viec">XEM CÔNG VIỆC →</Link></div>}

        {canManageMembers && (
          <>
            <div className="section-eyebrow"><span>02 — QUẢN LÝ ĐOÀN VIÊN</span><i /></div>
            <Link className="quick-card" to="/quan-ly-doan-vien" style={{ background: 'var(--brand-800)' }}>
              <span style={{ background: 'rgba(255,255,255,.16)', color: 'var(--accent-yellow)' }}><Icon name="users" /></span>
              <div><strong style={{ color: '#fff' }}>Quản lý đoàn viên</strong><small style={{ color: 'rgba(255,255,255,.72)' }}>Danh sách, tìm kiếm, hồ sơ</small></div>
            </Link>
          </>
        )}

        <div className="section-eyebrow"><span>{isGuest ? '01' : '03'} — TRI THỨC CÔNG KHAI</span><i /><Link to="/tri-thuc">KHÁM PHÁ →</Link></div>
        <div className="featured-document">
          <h3>Tra cứu văn bản và chuyên đề đã công bố</h3>
          <p>Nội dung công khai mở trực tiếp; thao tác cá nhân và khu vực nội bộ vẫn yêu cầu đăng nhập.</p>
          <nav className="home-quick-actions" aria-label="Lối vào nội dung công khai">
            <Link to="/tri-thuc/van-ban"><Icon name="file" size={19} /><span>Văn bản</span></Link>
            <Link to="/tri-thuc/chuyen-de"><Icon name="book" size={19} /><span>Chuyên đề</span></Link>
            <Link to="/tri-thuc/hoi-ai"><Icon name="sparkles" size={19} /><span>Hỏi AI</span></Link>
          </nav>
        </div>
        <div className="section-eyebrow"><span>{isGuest ? '02' : '04'} — ĐỔI MỚI SÁNG TẠO</span><i /><Link to="/doi-moi-sang-tao">XEM CÔNG TRÌNH →</Link></div>
      </div>
    </div>
  );
}
