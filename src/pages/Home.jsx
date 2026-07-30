import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { SectionHeader } from '../components/common';
import { campaigns, documents } from '../data/mock';
import { useAuth } from '../contexts/AuthContext';

export function Home() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userName = profile ? profile.full_name : 'Đồng chí';

  return (
    <div className="page home-page">
      <div className="hero">
        <div className="hero-content">
          <h1>Chào {userName},</h1>
          <p>Chúc bạn một ngày làm việc hiệu quả!</p>
        </div>
      </div>
      <div className="metrics-grid">
        <div className="metric-card"><span className="metric-icon" style={{color: 'var(--brand-600)', background: 'var(--brand-050)'}}><Icon name="bell" size={24} /></span><div className="metric-info"><strong>3</strong><span>Thông báo mới</span></div></div>
        <div className="metric-card"><span className="metric-icon" style={{color: 'var(--warning)', background: '#FFF7E6'}}><Icon name="clock" size={24} /></span><div className="metric-info"><strong>1</strong><span>Việc sắp hạn</span></div></div>
        <div className="metric-card" onClick={() => navigate('/tri-thuc')} style={{cursor: 'pointer'}}><span className="metric-icon" style={{color: 'var(--success)', background: '#E6F4EA'}}><Icon name="book" size={24} /></span><div className="metric-info"><strong>1</strong><span>Chuyên đề mới</span></div></div>
      </div>
      <div className="section" style={{ padding: '0 16px' }}>
        <SectionHeader title="Đợt báo cáo đang mở" action="Tất cả" onAction={() => navigate('/cong-viec')} />
        <div className="card campaign-card" onClick={() => navigate('/cong-viec')}>
          <div className="card-header">
            <h3>{campaigns[0].title}</h3>
            <span className="status status-pending">Đang thu thập</span>
          </div>
          <div className="card-meta"><span><Icon name="clock" size={15}/>Còn 4 ngày</span><span><Icon name="check" size={15}/>{campaigns[0].submitted}/{campaigns[0].total}</span></div>
          <div className="progress" aria-label="Tiến độ 72%"><span style={{width: '72%'}}></span></div>
        </div>
      </div>
      <div className="section" style={{ padding: '0 16px 32px' }}>
        <SectionHeader title="Văn bản mới ban hành" action="Tra cứu" onAction={() => navigate('/tri-thuc')} />
        <div className="list">
          {documents.slice(0, 2).map(doc => (
            <div key={doc.id} className="list-item" onClick={() => navigate('/tri-thuc')}>
              <div className="item-icon" style={{background: 'var(--surface-soft)', color: 'var(--brand-600)'}}><Icon name="file" /></div>
              <div className="item-content"><strong>{doc.title}</strong><span>{doc.number} • {doc.date}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
