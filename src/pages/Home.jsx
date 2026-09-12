import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Brand, StatusBadge } from '../components/common';
import { NotificationBell } from '../components/NotificationBell';
import { campaigns, documents } from '../data/mock';
import { useAuth } from '../contexts/AuthContext';

const WEEKDAY_DATE = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' }).format(new Date());

export function Home() {
  const navigate = useNavigate();
  const { profile, roles } = useAuth();
  const userName = profile ? profile.full_name : 'Đồng chí';
  const canManageMembers = (roles || []).includes('YOUTH_ADMIN') || (roles || []).includes('BRANCH_OFFICER');
  const urgentCount = campaigns.filter((c) => c.status !== 'SUBMITTED').length;
  const primaryCampaign = campaigns[0];
  const featuredDoc = documents[0];
  const otherDocs = documents.slice(1, 4);

  return (
    <div className="page home-page">
      <div className="home-hero">
        <div className="hero-top">
          <Brand />
          <NotificationBell />
        </div>
        <div className="hero-greeting">
          <span style={{ textTransform: 'capitalize' }}>{WEEKDAY_DATE}</span>
          <h1>Chào {userName},</h1>
          <p>{urgentCount > 0 ? `${urgentCount} việc cần xử lý hôm nay` : 'Không có việc gấp hôm nay'}</p>
        </div>
      </div>

      <div className="home-body">
        <div className="metrics-grid overlap">
          <div className="metric-card"><div className="metric-info"><strong>3</strong><small>THÔNG BÁO MỚI</small></div></div>
          <div className="metric-card accent-yellow"><div className="metric-info"><strong>{urgentCount}</strong><small>VIỆC SẮP HẠN</small></div></div>
          <button type="button" className="metric-card" onClick={() => navigate('/tri-thuc')}><div className="metric-info"><strong>1</strong><small>CHUYÊN ĐỀ MỚI</small></div></button>
        </div>

        <span className="status status-warning" style={{ margin: '14px 0', display: 'inline-flex' }}>Dữ liệu minh họa</span>

        <div className="section-eyebrow"><span>01 — VIỆC CẦN LÀM</span><i /><Link to="/cong-viec">TẤT CẢ →</Link></div>
        <Link className="card campaign-card accent" to="/cong-viec">
          <div className="campaign-card-head">
            <div>
              {primaryCampaign.code && <span className="campaign-card-code">{primaryCampaign.code}</span>}
              <h3>{primaryCampaign.title}</h3>
            </div>
            <StatusBadge status={primaryCampaign.status} />
          </div>
          <p>{primaryCampaign.issuer}</p>
          <div className="campaign-meta">
            <span><Icon name="clock" size={15} />Hạn {new Date(primaryCampaign.due).toLocaleDateString('vi-VN')}</span>
            <span><Icon name="check" size={15} />{primaryCampaign.submitted}/{primaryCampaign.total}</span>
          </div>
          <div className="progress" aria-label={`Tiến độ ${primaryCampaign.progress}%`}><span style={{ width: `${primaryCampaign.progress}%` }} /></div>
        </Link>

        {canManageMembers && (
          <>
            <div className="section-eyebrow"><span>02 — QUẢN LÝ ĐOÀN VIÊN</span><i /></div>
            <Link className="quick-card" to="/quan-ly-doan-vien" style={{ background: 'var(--brand-800)' }}>
              <span style={{ background: 'rgba(255,255,255,.16)', color: 'var(--accent-yellow)' }}><Icon name="users" /></span>
              <div><strong style={{ color: '#fff' }}>Quản lý đoàn viên</strong><small style={{ color: 'rgba(255,255,255,.72)' }}>Danh sách, tìm kiếm, hồ sơ</small></div>
            </Link>
          </>
        )}

        <div className="section-eyebrow"><span>03 — TRI THỨC MỚI</span><i /><Link to="/tri-thuc">TẤT CẢ →</Link></div>
        <div className="featured-document">
          <div className="featured-document-head">
            <span className="featured-document-code">{featuredDoc.number} · {featuredDoc.date}</span>
            <span className="featured-document-badge">MỚI BAN HÀNH</span>
          </div>
          <h3>{featuredDoc.title}</h3>
          <p>{featuredDoc.authority} · {featuredDoc.summary}</p>
          <div className="featured-document-actions">
            <Link className="primary" to="/tri-thuc/hoi-ai"><Icon name="sparkles" size={15} />Hỏi AI về văn bản</Link>
            <Link className="secondary" to="/tri-thuc">Xem văn bản</Link>
          </div>
        </div>
        {otherDocs.length > 0 && (
          <div className="doc-index-list">
            {otherDocs.map((doc, index) => (
              <Link key={doc.id} className="doc-index-row" to="/tri-thuc">
                <b>{String(index + 2).padStart(2, '0')}</b>
                <div className="doc-index-row-body">
                  <strong>{doc.title}</strong>
                  <span>{doc.type} · {doc.number} · {doc.date}</span>
                </div>
                <Icon name="arrow" size={16} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
