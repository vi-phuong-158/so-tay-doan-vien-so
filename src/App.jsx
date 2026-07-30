import React, { useEffect, useMemo, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { daysUntil, getReportStatus } from './lib/status.mjs';

const PATHS = {
  home: 'M3 11.5 12 4l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-9.5Z',
  work: 'M9 5h6M9 9h6M9 13h4M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22V5.5ZM20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22V5.5Z',
  bulb: 'M9 18h6M10 22h4M8.5 14.5A6 6 0 1 1 15.5 14.5c-.9.8-1.5 1.8-1.5 3.5h-4c0-1.7-.6-2.7-1.5-3.5Z',
  user: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4',
  search: 'm21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  calendar: 'M7 2v3M17 2v3M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M8 13h8M8 17h6',
  check: 'M20 6 9 17l-5-5',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',
  alert: 'M10.3 3.4 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.4a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01',
  sparkles: 'm12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4L12 3ZM5 14l.9 2.1L8 17l-2.1.9L5 20l-.9-2.1L2 17l2.1-.9L5 14ZM19 13l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z',
  send: 'm22 2-7 20-4-9-9-4 20-7ZM11 13 22 2',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  filter: 'M4 5h16M7 12h10M10 19h4',
  chevron: 'm9 18 6-6-6-6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  logout: 'M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10ZM9 12l2 2 4-4',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  chart: 'M4 19V9M10 19V5M16 19v-7M22 19H2',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V20H9.7v-.09a1.7 1.7 0 0 0-1.03-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 5 14.7a1.7 1.7 0 0 0-1.55-1.03H3.3V10.7h.09A1.7 1.7 0 0 0 4.94 9.7a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 9.63 4.5V4.4h3v.09a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.03h.09v3h-.09A1.7 1.7 0 0 0 19.4 15Z'
};

function Icon({ name, size = 21, className = '' }) {
  return <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name] || PATHS.file} /></svg>;
}

const campaigns = [
  { id: 'bao-cao-thang-7', title: 'Báo cáo kết quả công tác Đoàn tháng 7/2026', issuer: 'Ban Thanh niên Công an tỉnh', due: '2026-08-02T17:00:00+07:00', status: 'PENDING', progress: 72, submitted: 144, total: 200, files: ['Mẫu báo cáo tháng 7.docx'] },
  { id: 'chien-dich-he', title: 'Tổng hợp hoạt động Chiến dịch Thanh niên tình nguyện hè', issuer: 'Ban Thanh niên Công an tỉnh', due: '2026-08-08T17:00:00+07:00', status: 'SUBMITTED', progress: 44, submitted: 88, total: 200, files: ['Phụ lục số liệu.xlsx'] },
  { id: 'sang-kien', title: 'Đăng ký công trình, phần việc thanh niên năm 2026', issuer: 'Câu lạc bộ đổi mới sáng tạo', due: '2026-07-28T17:00:00+07:00', status: 'NEEDS_SUPPLEMENT', progress: 93, submitted: 186, total: 200, files: ['Phiếu đăng ký.docx'] }
];

const documents = [
  { id: 'hd-12', number: '12-HD/ĐTN', type: 'Hướng dẫn', title: 'Hướng dẫn tổ chức sinh hoạt Chi đoàn chủ điểm năm 2026', authority: 'Ban Thanh niên Công an tỉnh', date: '25/07/2026', effective: 'Còn hiệu lực', summary: 'Hướng dẫn nội dung, hình thức và tiêu chí tổ chức sinh hoạt Chi đoàn chủ điểm trong toàn lực lượng.' },
  { id: 'kh-88', number: '88-KH/ĐTN', type: 'Kế hoạch', title: 'Kế hoạch tổ chức Chiến dịch Thanh niên tình nguyện hè 2026', authority: 'Ban Thanh niên Công an tỉnh', date: '18/07/2026', effective: 'Còn hiệu lực', summary: 'Triển khai các hoạt động tình nguyện, chuyển đổi số và hỗ trợ nhân dân trên địa bàn.' },
  { id: 'bm-01', number: 'BM-01', type: 'Biểu mẫu', title: 'Mẫu báo cáo kết quả công tác Đoàn theo tháng', authority: 'Ban Thanh niên Công an tỉnh', date: '10/07/2026', effective: 'Đang áp dụng', summary: 'Biểu mẫu chuẩn để các cơ sở Đoàn tổng hợp kết quả, số liệu và hình ảnh hoạt động.' },
  { id: 'qc-clb', number: '03-QC/CLB', type: 'Quy chế', title: 'Quy chế hoạt động Câu lạc bộ đổi mới sáng tạo', authority: 'Câu lạc bộ đổi mới sáng tạo', date: '04/07/2026', effective: 'Còn hiệu lực', summary: 'Quy định nguyên tắc tiếp nhận, nghiên cứu, thử nghiệm và nhân rộng giải pháp.' }
];

const topics = [
  { id: 'chuyen-doi-so', title: 'Thanh niên Công an tiên phong chuyển đổi số', progress: 75, duration: '35 phút', resources: 4, status: 'Đang học', description: 'Nhận diện vai trò của đoàn viên trong chuyển đổi số, bảo đảm an toàn dữ liệu và xây dựng sáng kiến từ thực tiễn.' },
  { id: 'ky-nang-doan', title: 'Kỹ năng tổ chức sinh hoạt Chi đoàn hiệu quả', progress: 0, duration: '28 phút', resources: 3, status: 'Chưa học', description: 'Phương pháp chuẩn bị nội dung, điều hành, tạo tương tác và đánh giá một buổi sinh hoạt.' },
  { id: 'an-toan-mang', title: 'An toàn thông tin trong hoạt động Đoàn', progress: 100, duration: '22 phút', resources: 5, status: 'Hoàn thành', description: 'Nguyên tắc xử lý tài liệu, sử dụng nền tảng số và phòng tránh lộ lọt thông tin.' }
];

const projects = [
  { id: 'ban-do-cong-an-so', status: 'Đang triển khai mở rộng', title: 'Bản đồ Công an số tỉnh Phú Thọ', team: 'CLB Đổi mới sáng tạo', progress: 82, summary: 'Hỗ trợ người dân tra cứu đúng trụ sở, điểm cấp căn cước và thủ tục hành chính bằng bản đồ trực quan.', result: 'Đã phủ dữ liệu cơ bản toàn tỉnh và tiếp tục bổ sung điểm phục vụ.' },
  { id: 'f-alert', status: 'Đã triển khai hiệu quả', title: 'F-Alert — cảnh báo quản lý người nước ngoài', team: 'Phòng An ninh đối ngoại', progress: 100, summary: 'Tin học hóa quy trình rà soát, tổng hợp và cảnh báo phục vụ quản lý người nước ngoài.', result: 'Rút ngắn thời gian tổng hợp, tăng khả năng phát hiện thông tin cần chú ý.' },
  { id: 'tro-ly-thu-tuc', status: 'Đang thử nghiệm', title: 'Trợ lý AI hướng dẫn thủ tục hành chính', team: 'Nhóm AI thanh niên', progress: 64, summary: 'Hỏi đáp có dẫn nguồn, tạo checklist hồ sơ và chỉ dẫn địa điểm thực hiện phù hợp.', result: 'Đã hoàn thiện luồng hỏi đáp cơ bản và kiểm thử dữ liệu nguồn.' }
];

const problems = [
  { id: 'bt-001', title: 'Tổng hợp báo cáo từ nhiều Chi đoàn còn thủ công', status: 'RESEARCHING', date: '28/07/2026', organization: 'Chi đoàn PA01', update: 'Nhóm phụ trách đang khảo sát biểu mẫu và quy trình hiện tại.' },
  { id: 'bt-002', title: 'Khó tra cứu nhanh biểu mẫu đang còn hiệu lực', status: 'PROPOSED', date: '21/07/2026', organization: 'Chi đoàn PX03', update: 'Đã đề xuất kho biểu mẫu có phiên bản và cảnh báo hết hiệu lực.' }
];

const problemStatus = {
  NEW: ['Mới tiếp nhận', 'info'], SCREENING: ['Đang sàng lọc', 'warning'], NEEDS_INFO: ['Cần bổ sung', 'purple'], ACCEPTED: ['Đã tiếp nhận', 'success'], ASSIGNED: ['Đã phân công', 'info'], RESEARCHING: ['Đang nghiên cứu', 'info'], PROPOSED: ['Đã có phương án', 'purple'], PILOTING: ['Đang thử nghiệm', 'warning'], COMPLETED: ['Hoàn thành', 'success'], ON_HOLD: ['Tạm dừng', 'neutral'], DECLINED: ['Chưa phù hợp', 'danger']
};

function usePath() {
  const [path, setPath] = useState(() => window.location.pathname || '/');
  useEffect(() => {
    const listener = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
  }, []);
  const navigate = (to) => {
    if (to === path) return;
    window.history.pushState({}, '', to);
    setPath(to);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  };
  return [path, navigate];
}

function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
    <img src="/brand/app-icon.svg" alt="" />
    <div><strong>Sổ tay Đoàn viên số</strong>{!compact && <span>Tuổi trẻ Công an tỉnh Phú Thọ</span>}</div>
  </div>;
}

function Button({ children, icon, variant = 'primary', onClick, type = 'button', className = '', disabled = false }) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`button button-${variant} ${className}`}>{icon && <Icon name={icon} size={19} />}{children}</button>;
}

function StatusBadge({ status, label, tone }) {
  const meta = status ? getReportStatus(status) : { label, tone };
  return <span className={`status status-${tone || meta.tone}`}>{label || meta.label}</span>;
}

function Progress({ value }) {
  return <div className="progress" aria-label={`Tiến độ ${value}%`}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function PageHeader({ title, subtitle, action, back, navigate }) {
  return <header className="page-header">
    <div className="page-title-wrap">{back && <button className="icon-button back-button" onClick={() => navigate(back)} aria-label="Quay lại"><Icon name="chevron" /></button>}<div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div></div>
    {action}
  </header>;
}

function SectionHeader({ title, action, onAction }) {
  return <div className="section-header"><h2>{title}</h2>{action && <button onClick={onAction}>{action}<Icon name="arrow" size={16} /></button>}</div>;
}

function EmptyState({ icon = 'file', title, description, action, onAction }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={30} /></span><h3>{title}</h3><p>{description}</p>{action && <Button variant="secondary" onClick={onAction}>{action}</Button>}</div>;
}

function Toast({ message, onClose }) {
  useEffect(() => { const id = setTimeout(onClose, 3800); return () => clearTimeout(id); }, [onClose]);
  return <div className="toast"><span><Icon name="check" size={18} /></span>{message}</div>;
}

function Sidebar({ path, navigate }) {
  const items = [
    ['/', 'home', 'Trang chủ'], ['/cong-viec', 'work', 'Công việc'], ['/tri-thuc', 'book', 'Tri thức'], ['/doi-moi-sang-tao', 'bulb', 'Đổi mới sáng tạo'], ['/ca-nhan', 'user', 'Cá nhân']
  ];
  return <aside className="sidebar">
    <Brand />
    <nav>{items.map(([url, icon, label]) => <button key={url} className={path === url || (url !== '/' && path.startsWith(url)) ? 'active' : ''} onClick={() => navigate(url)}><Icon name={icon} /><span>{label}</span>{url === '/cong-viec' && <b>2</b>}</button>)}</nav>
    <div className="sidebar-admin"><span>Quản trị nội dung</span><button onClick={() => navigate('/admin')}><Icon name="shield" />Bảng điều hành</button></div>
    <div className="sidebar-user"><div className="avatar">VP</div><div><strong>Vi Ngọc Phương</strong><span>Chi đoàn PA01</span></div></div>
  </aside>;
}

function BottomNav({ path, navigate }) {
  const items = [['/', 'home', 'Trang chủ'], ['/cong-viec', 'work', 'Công việc'], ['/tri-thuc', 'book', 'Tri thức'], ['/doi-moi-sang-tao', 'bulb', 'Đổi mới'], ['/ca-nhan', 'user', 'Cá nhân']];
  return <nav className="bottom-nav">{items.map(([url, icon, label]) => <button key={url} className={path === url || (url !== '/' && path.startsWith(url)) ? 'active' : ''} onClick={() => navigate(url)}><span className="nav-icon"><Icon name={icon} size={22} />{url === '/cong-viec' && <i>2</i>}</span><small>{label}</small></button>)}</nav>;
}

function AppShell({ path, navigate, children }) {
  return <div className="app-layout"><Sidebar path={path} navigate={navigate} /><main className="main-content"><div className="mobile-topbar"><Brand compact /><button className="icon-button" aria-label="Thông báo" onClick={() => navigate('/ca-nhan/thong-bao')}><Icon name="bell" /><i>3</i></button></div>{children}</main><BottomNav path={path} navigate={navigate} /></div>;
}

function Home({ navigate }) {
  const urgent = campaigns[0];
  return <div className="home-page">
    <section className="home-hero">
      <div className="hero-top"><Brand /><button className="hero-bell" onClick={() => navigate('/ca-nhan/thong-bao')} aria-label="Xem thông báo"><Icon name="bell" /><i>3</i></button></div>
      <div className="hero-greeting"><span>Chào buổi tối,</span><h1>Đồng chí Vi Ngọc Phương</h1><p>Hôm nay có <strong>2 công việc</strong> cần đồng chí chú ý.</p></div>
      <div className="hero-orb orb-one" /><div className="hero-orb orb-two" />
    </section>
    <div className="home-body">
      <section className="metrics-grid overlap">
        <button className="metric-card" onClick={() => navigate('/ca-nhan/thong-bao')}><span className="metric-icon blue"><Icon name="bell" /></span><strong>03</strong><small>Thông báo mới</small></button>
        <button className="metric-card" onClick={() => navigate('/cong-viec')}><span className="metric-icon orange"><Icon name="clock" /></span><strong>02</strong><small>Việc sắp hạn</small></button>
        <button className="metric-card" onClick={() => navigate('/tri-thuc/chuyen-de')}><span className="metric-icon green"><Icon name="book" /></span><strong>01</strong><small>Chuyên đề mới</small></button>
      </section>
      <SectionHeader title="Việc cần làm" action="Xem tất cả" onAction={() => navigate('/cong-viec')} />
      <article className="urgent-card">
        <div className="urgent-head"><StatusBadge status="PENDING" /><span><Icon name="calendar" size={16} />Còn {daysUntil(urgent.due)} ngày</span></div>
        <h3>{urgent.title}</h3><p>{urgent.issuer}</p>
        <div className="due-row"><span>Hạn nộp</span><strong>17:00 · 02/08/2026</strong></div>
        <Button onClick={() => navigate(`/cong-viec/bao-cao/${urgent.id}`)}>Xem yêu cầu <Icon name="arrow" size={18} /></Button>
      </article>
      <SectionHeader title="Tổng quan nhanh" />
      <div className="quick-grid">
        <button className="quick-card" onClick={() => navigate('/tri-thuc/van-ban')}><span><Icon name="file" /></span><div><strong>Văn bản mới</strong><small>04 tài liệu vừa cập nhật</small></div><Icon name="chevron" /></button>
        <button className="quick-card" onClick={() => navigate('/tro-ly-ai')}><span><Icon name="sparkles" /></span><div><strong>Hỏi Trợ lý AI</strong><small>Tra cứu có dẫn nguồn</small></div><Icon name="chevron" /></button>
      </div>
      <SectionHeader title="Đổi mới sáng tạo nổi bật" action="Khám phá" onAction={() => navigate('/doi-moi-sang-tao')} />
      <article className="featured-project" onClick={() => navigate('/doi-moi-sang-tao/cong-trinh/ban-do-cong-an-so')}>
        <div><StatusBadge label="Đang triển khai mở rộng" tone="info" /><h3>Bản đồ Công an số tỉnh Phú Thọ</h3><p>Đưa thông tin trụ sở và thủ tục đến gần người dân bằng bản đồ trực quan.</p></div>
        <span className="feature-symbol"><Icon name="bulb" size={36} /></span>
        <div className="featured-foot"><span>Tiến độ 82%</span><Icon name="arrow" /></div>
      </article>
      <SectionHeader title="Thông báo mới" action="Xem thêm" onAction={() => navigate('/ca-nhan/thong-bao')} />
      <div className="list-card">
        <button className="notice-row"><span className="notice-dot important" /><div><strong>Triển khai đợt báo cáo công tác Đoàn tháng 7</strong><small>Ban Thanh niên · 2 giờ trước</small></div><Icon name="chevron" /></button>
        <button className="notice-row"><span className="notice-dot" /><div><strong>Mời tham gia chuyên đề chuyển đổi số</strong><small>Câu lạc bộ ĐMST · Hôm qua</small></div><Icon name="chevron" /></button>
      </div>
    </div>
  </div>;
}

function Work({ navigate }) {
  const [filter, setFilter] = useState('Tất cả');
  const filtered = campaigns.filter(c => filter === 'Tất cả' || getReportStatus(c.status).label === filter);
  return <div className="page"><PageHeader title="Công việc" subtitle="Theo dõi nhiệm vụ và nộp báo cáo đúng hạn" action={<button className="icon-button"><Icon name="filter" /></button>} />
    <div className="summary-banner"><div><span>Tiến độ đơn vị</span><strong>4/6 nhiệm vụ</strong><small>Đã hoàn thành trong tháng này</small></div><div className="ring" style={{ '--value': '67%' }}><b>67%</b></div></div>
    <div className="chip-row">{['Tất cả','Chưa nộp','Đã nộp','Cần bổ sung'].map(x => <button key={x} className={filter === x ? 'active' : ''} onClick={() => setFilter(x)}>{x}</button>)}</div>
    <SectionHeader title="Đợt báo cáo đang mở" />
    <div className="campaign-list">{filtered.map(c => <ReportCampaignCard key={c.id} campaign={c} onClick={() => navigate(`/cong-viec/bao-cao/${c.id}`)} />)}</div>
    <SectionHeader title="Tiện ích" />
    <div className="quick-grid"><button className="quick-card" onClick={() => navigate('/cong-viec/lich-su')}><span><Icon name="clock" /></span><div><strong>Lịch sử nộp</strong><small>Xem các phiên bản đã gửi</small></div><Icon name="chevron" /></button><button className="quick-card" onClick={() => navigate('/admin/bao-cao')}><span><Icon name="chart" /></span><div><strong>Tổng hợp đơn vị</strong><small>Dành cho quản trị</small></div><Icon name="chevron" /></button></div>
  </div>;
}

function ReportCampaignCard({ campaign, onClick }) {
  return <article className="campaign-card" onClick={onClick} tabIndex="0" role="button">
    <div className="card-head"><StatusBadge status={campaign.status} /><span><Icon name="calendar" size={15} />{daysUntil(campaign.due) > 0 ? `Còn ${daysUntil(campaign.due)} ngày` : 'Đã đến hạn'}</span></div>
    <h3>{campaign.title}</h3><p>{campaign.issuer}</p><div className="campaign-meta"><span>Hạn nộp</span><strong>{new Date(campaign.due).toLocaleDateString('vi-VN')} · 17:00</strong></div>
    <div className="campaign-footer"><div><Progress value={campaign.progress} /><small>{campaign.submitted}/{campaign.total} đơn vị đã nộp</small></div><span className="circle-arrow"><Icon name="arrow" size={18} /></span></div>
  </article>;
}

function ReportDetail({ campaign, navigate }) {
  if (!campaign) return <NotFound navigate={navigate} />;
  return <div className="page"><PageHeader title="Yêu cầu báo cáo" subtitle="Chi tiết nhiệm vụ được giao" back="/cong-viec" navigate={navigate} />
    <article className="detail-hero"><div className="card-head"><StatusBadge status={campaign.status} /><span><Icon name="calendar" size={16} />Hạn 17:00 · 02/08/2026</span></div><h2>{campaign.title}</h2><p>{campaign.issuer}</p></article>
    <section className="content-card"><h3>Nội dung yêu cầu</h3><p>Tổng hợp đầy đủ kết quả công tác Đoàn, phong trào thanh niên; nêu hoạt động nổi bật, số liệu, mô hình mới và đề xuất nhiệm vụ tháng tiếp theo.</p><div className="info-grid"><div><span>Ngày mở</span><strong>25/07/2026</strong></div><div><span>Cho phép nộp lại</span><strong>Có</strong></div><div><span>Số tệp tối đa</span><strong>05 tệp</strong></div><div><span>Dung lượng/tệp</span><strong>20 MB</strong></div></div></section>
    <section className="content-card"><h3>Biểu mẫu đính kèm</h3>{campaign.files.map(f => <button className="file-row" key={f}><span><Icon name="file" /></span><div><strong>{f}</strong><small>DOCX · 48 KB</small></div><Icon name="download" /></button>)}</section>
    <section className="content-card"><h3>Lịch sử của đơn vị</h3>{campaign.status === 'PENDING' ? <EmptyState icon="upload" title="Chưa có bản nộp" description="Đơn vị chưa gửi báo cáo cho đợt này." /> : <div className="timeline"><div><i /><strong>Phiên bản 1</strong><span>29/07/2026 · 15:24</span><p>Đã gửi 02 tệp báo cáo.</p></div>{campaign.status === 'NEEDS_SUPPLEMENT' && <div><i /><strong>Yêu cầu bổ sung</strong><span>30/07/2026 · 08:15</span><p>Bổ sung số liệu đoàn viên tham gia và ảnh minh họa.</p></div>}</div>}</section>
    <div className="sticky-action"><Button icon="upload" onClick={() => navigate(`/cong-viec/bao-cao/${campaign.id}/nop`)}>{campaign.status === 'PENDING' ? 'Nộp báo cáo' : 'Nộp phiên bản mới'}</Button></div>
  </div>;
}

function SubmitReport({ campaign, navigate, notify }) {
  const [files, setFiles] = useState([]); const [summary, setSummary] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const submit = (e) => { e.preventDefault(); if (!files.length || !confirmed) return; notify('Đã tạo bản nộp phiên bản mới và gửi xác nhận.'); navigate(`/cong-viec/bao-cao/${campaign.id}`); };
  return <div className="page"><PageHeader title="Nộp báo cáo" subtitle={campaign?.title} back={`/cong-viec/bao-cao/${campaign?.id}`} navigate={navigate} />
    <form className="form-card" onSubmit={submit}><label className="form-field"><span>Nội dung tóm tắt</span><textarea value={summary} onChange={e => setSummary(e.target.value)} rows="5" placeholder="Nêu ngắn gọn kết quả chính, số liệu nổi bật..." /></label>
      <label className="upload-zone"><input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={e => setFiles([...e.target.files])} /><span><Icon name="upload" size={28} /></span><strong>Chọn tệp báo cáo</strong><small>PDF, DOCX, XLSX, JPG, PNG · tối đa 20 MB/tệp</small></label>
      {files.length > 0 && <div className="selected-files">{files.map((f,i) => <div key={`${f.name}-${i}`}><Icon name="file" /><span><strong>{f.name}</strong><small>{Math.max(1, Math.round(f.size/1024))} KB</small></span><button type="button" onClick={() => setFiles(files.filter((_,x) => x !== i))}>×</button></div>)}</div>}
      <label className="check-row"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>Tôi xác nhận nội dung và tệp đã kiểm tra, không chứa thông tin không được phép đưa lên hệ thống.</span></label>
      <Button type="submit" icon="send" disabled={!files.length || !confirmed}>Xác nhận nộp báo cáo</Button>
    </form>
  </div>;
}

function SubmissionHistory({ navigate }) {
  return <div className="page"><PageHeader title="Lịch sử nộp" subtitle="Các báo cáo đơn vị đã gửi" back="/cong-viec" navigate={navigate} />
    <div className="timeline-card">{campaigns.slice(1).map((c, i) => <div className="history-item" key={c.id}><span className={`history-icon ${i ? 'purple' : ''}`}><Icon name={i ? 'alert' : 'check'} /></span><div><StatusBadge status={c.status} /><h3>{c.title}</h3><p>Phiên bản {i + 1} · {i ? '28/07/2026' : '29/07/2026'} · 02 tệp</p><button onClick={() => navigate(`/cong-viec/bao-cao/${c.id}`)}>Xem chi tiết <Icon name="arrow" size={16} /></button></div></div>)}</div>
  </div>;
}

function Knowledge({ navigate }) {
  return <div className="page"><PageHeader title="Tri thức" subtitle="Tra cứu, học tập và hỏi đáp có căn cứ" />
    <button className="search-bar" onClick={() => navigate('/tri-thuc/van-ban')}><Icon name="search" /><span>Tìm văn bản, biểu mẫu, chuyên đề...</span></button>
    <button className="ai-banner" onClick={() => navigate('/tro-ly-ai')}><span><Icon name="sparkles" size={28} /></span><div><small>TRỢ LÝ TRI THỨC</small><h2>Hỏi AI, nhận câu trả lời có nguồn</h2><p>Tra cứu nhanh trong kho tài liệu đã được kiểm duyệt.</p></div><Icon name="arrow" /></button>
    <div className="knowledge-grid"><button onClick={() => navigate('/tri-thuc/van-ban')}><span><Icon name="file" /></span><strong>Kho văn bản</strong><small>124 tài liệu</small></button><button onClick={() => navigate('/tri-thuc/chuyen-de')}><span><Icon name="book" /></span><strong>Chuyên đề</strong><small>08 đang mở</small></button><button onClick={() => navigate('/tri-thuc/chuyen-de')}><span><Icon name="check" /></span><strong>Trắc nghiệm</strong><small>03 bài chưa làm</small></button><button onClick={() => navigate('/tri-thuc/van-ban')}><span><Icon name="download" /></span><strong>Biểu mẫu</strong><small>21 mẫu dùng chung</small></button></div>
    <SectionHeader title="Văn bản mới" action="Xem tất cả" onAction={() => navigate('/tri-thuc/van-ban')} />
    <div className="document-list">{documents.slice(0,3).map(d => <DocumentCard key={d.id} document={d} onClick={() => navigate(`/tri-thuc/van-ban/${d.id}`)} />)}</div>
    <SectionHeader title="Tiếp tục học" action="Chuyên đề" onAction={() => navigate('/tri-thuc/chuyen-de')} />
    <TopicCard topic={topics[0]} onClick={() => navigate(`/tri-thuc/chuyen-de/${topics[0].id}`)} />
    <button className="floating-ai" onClick={() => navigate('/tro-ly-ai')}><Icon name="sparkles" /><span>Hỏi AI</span></button>
  </div>;
}

function DocumentCard({ document, onClick }) {
  return <article className="document-card" onClick={onClick} role="button" tabIndex="0"><span className="doc-icon"><Icon name="file" /></span><div><div className="doc-tags"><span>{document.type}</span><b>{document.effective}</b></div><h3>{document.title}</h3><p>{document.number} · {document.authority}</p><small>{document.date}</small></div><Icon name="chevron" /></article>;
}

function Documents({ navigate }) {
  const [q, setQ] = useState(''); const [type, setType] = useState('Tất cả');
  const filtered = documents.filter(d => (type === 'Tất cả' || d.type === type) && `${d.title} ${d.number} ${d.authority}`.toLowerCase().includes(q.toLowerCase()));
  return <div className="page"><PageHeader title="Kho văn bản" subtitle="Tài liệu chính thống đã được kiểm duyệt" back="/tri-thuc" navigate={navigate} />
    <label className="search-input"><Icon name="search" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Tên, số ký hiệu, từ khóa..." /></label>
    <div className="chip-row">{['Tất cả','Hướng dẫn','Kế hoạch','Biểu mẫu'].map(x => <button key={x} className={type === x ? 'active' : ''} onClick={() => setType(x)}>{x}</button>)}</div>
    <p className="result-count">Tìm thấy {filtered.length} tài liệu</p><div className="document-list">{filtered.map(d => <DocumentCard key={d.id} document={d} onClick={() => navigate(`/tri-thuc/van-ban/${d.id}`)} />)}</div>
  </div>;
}

function DocumentDetail({ document, navigate }) {
  if (!document) return <NotFound navigate={navigate} />;
  return <div className="page"><PageHeader title="Chi tiết văn bản" subtitle={document.number} back="/tri-thuc/van-ban" navigate={navigate} />
    <article className="document-detail"><div className="document-cover"><Icon name="file" size={42} /><span>PDF</span></div><div><StatusBadge label={document.effective} tone="success" /><h2>{document.title}</h2><p>{document.number}</p></div></article>
    <section className="content-card"><h3>Thông tin văn bản</h3><dl className="metadata"><div><dt>Cơ quan ban hành</dt><dd>{document.authority}</dd></div><div><dt>Ngày ban hành</dt><dd>{document.date}</dd></div><div><dt>Loại văn bản</dt><dd>{document.type}</dd></div><div><dt>Phạm vi</dt><dd>Nội bộ đoàn viên</dd></div></dl></section>
    <section className="content-card"><h3>Tóm tắt nội dung</h3><p>{document.summary}</p><div className="source-note"><Icon name="shield" /><span>Nội dung đã được quản trị viên kiểm duyệt trước khi công bố và sử dụng cho Trợ lý AI.</span></div></section>
    <div className="action-grid"><Button variant="secondary" icon="download">Tải văn bản</Button><Button icon="sparkles" onClick={() => navigate(`/tro-ly-ai?document=${document.id}`)}>Hỏi AI về văn bản</Button></div>
  </div>;
}

function Topics({ navigate }) {
  return <div className="page"><PageHeader title="Chuyên đề học tập" subtitle="Tự học, làm bài kiểm tra và theo dõi kết quả" back="/tri-thuc" navigate={navigate} />
    <div className="learning-summary"><div><strong>2/5</strong><span>Chuyên đề hoàn thành</span></div><div><strong>86</strong><span>Điểm trung bình</span></div><div><strong>3</strong><span>Chứng nhận</span></div></div>
    <div className="topic-list">{topics.map(t => <TopicCard key={t.id} topic={t} onClick={() => navigate(`/tri-thuc/chuyen-de/${t.id}`)} />)}</div>
  </div>;
}

function TopicCard({ topic, onClick }) {
  return <article className="topic-card" onClick={onClick} role="button" tabIndex="0"><div className="topic-visual"><Icon name="book" size={30} /><span>{topic.duration}</span></div><div><StatusBadge label={topic.status} tone={topic.progress === 100 ? 'success' : topic.progress ? 'info' : 'neutral'} /><h3>{topic.title}</h3><p>{topic.resources} nội dung học tập</p><Progress value={topic.progress} /><small>{topic.progress}% hoàn thành</small></div></article>;
}

function TopicDetail({ topic, navigate }) {
  if (!topic) return <NotFound navigate={navigate} />;
  return <div className="page"><PageHeader title="Chuyên đề" subtitle="Nội dung học tập cá nhân" back="/tri-thuc/chuyen-de" navigate={navigate} />
    <article className="learning-hero"><StatusBadge label={topic.status} tone="info" /><h2>{topic.title}</h2><p>{topic.description}</p><div><span><Icon name="clock" />{topic.duration}</span><span><Icon name="file" />{topic.resources} tài liệu</span></div><Progress value={topic.progress} /></article>
    <SectionHeader title="Nội dung chuyên đề" />
    <div className="lesson-list"><button><span className="lesson-status done"><Icon name="check" /></span><div><strong>1. Tổng quan và mục tiêu</strong><small>Video · 08 phút</small></div><Icon name="chevron" /></button><button><span className="lesson-status current"><Icon name="file" /></span><div><strong>2. Tài liệu nội dung chính</strong><small>PDF · 12 trang</small></div><Icon name="chevron" /></button><button><span className="lesson-status"><Icon name="file" /></span><div><strong>3. Infographic ghi nhớ</strong><small>Hình ảnh</small></div><Icon name="chevron" /></button></div>
    <section className="quiz-cta"><span><Icon name="check" size={28} /></span><div><h3>Bài kiểm tra nhận thức</h3><p>10 câu hỏi · Điểm đạt 70 · Tối đa 3 lần</p></div><Button onClick={() => navigate('/tri-thuc/trac-nghiem/nhan-thuc')}>Làm bài</Button></section>
  </div>;
}

function Quiz({ navigate, notify }) {
  const questions = [
    { q: 'Đâu là nguyên tắc đúng khi sử dụng AI để tra cứu văn bản?', options: ['Dùng mọi câu trả lời như quy định chính thức', 'Luôn kiểm tra nguồn và phạm vi hiệu lực', 'Không cần quan tâm tài liệu nguồn', 'Sao chép nguyên văn mọi nội dung'], correct: 1 },
    { q: 'Tài liệu nào được phép sử dụng cho trợ lý AI trong hệ thống?', options: ['Mọi tệp người dùng tải lên', 'Tài liệu chưa phân loại', 'Tài liệu đã duyệt và đúng phạm vi quyền', 'Tài liệu từ tài khoản cá nhân'], correct: 2 },
    { q: 'Khi gửi bài toán đổi mới sáng tạo, người dùng cần làm gì?', options: ['Tự viết sẵn mã nguồn', 'Mô tả rõ quy trình và điểm nghẽn', 'Công khai dữ liệu thật', 'Tự phê duyệt giải pháp'], correct: 1 }
  ];
  const [index, setIndex] = useState(0); const [answers, setAnswers] = useState({}); const [done, setDone] = useState(false);
  const score = Math.round(questions.reduce((s,q,i) => s + (answers[i] === q.correct ? 1 : 0), 0) / questions.length * 100);
  if (done) return <div className="page"><PageHeader title="Kết quả bài kiểm tra" back="/tri-thuc/chuyen-de" navigate={navigate} /><div className="result-card"><div className="score-ring"><strong>{score}</strong><span>điểm</span></div><h2>{score >= 70 ? 'Đạt yêu cầu' : 'Chưa đạt'}</h2><p>Bạn trả lời đúng {Math.round(score/100*questions.length)}/{questions.length} câu hỏi.</p><div className="action-grid"><Button variant="secondary" onClick={() => { setDone(false); setIndex(0); setAnswers({}); }}>Làm lại</Button><Button onClick={() => { notify('Kết quả học tập đã được lưu.'); navigate('/ca-nhan/ket-qua-hoc-tap'); }}>Xem kết quả học tập</Button></div></div></div>;
  const q = questions[index];
  return <div className="page quiz-page"><PageHeader title="Bài kiểm tra nhận thức" subtitle={`Câu ${index+1}/${questions.length}`} back="/tri-thuc/chuyen-de" navigate={navigate} /><Progress value={(index+1)/questions.length*100} />
    <div className="question-card"><span>CÂU HỎI {index+1}</span><h2>{q.q}</h2><div className="options">{q.options.map((o,i) => <button key={o} className={answers[index] === i ? 'selected' : ''} onClick={() => setAnswers({...answers,[index]:i})}><i>{String.fromCharCode(65+i)}</i><span>{o}</span>{answers[index] === i && <Icon name="check" />}</button>)}</div></div>
    <div className="quiz-nav"><Button variant="secondary" disabled={index === 0} onClick={() => setIndex(index-1)}>Câu trước</Button><Button disabled={answers[index] === undefined} onClick={() => index === questions.length-1 ? setDone(true) : setIndex(index+1)}>{index === questions.length-1 ? 'Nộp bài' : 'Câu tiếp theo'}</Button></div>
  </div>;
}

function AIAssistant({ navigate }) {
  const [messages, setMessages] = useState([{role:'assistant', content:'Xin chào! Tôi có thể giúp đồng chí tra cứu văn bản, hỗ trợ công tác Đoàn hoặc tìm giải pháp đổi mới sáng tạo. Mỗi câu trả lời sẽ kèm nguồn khi có căn cứ.'}]);
  const [text, setText] = useState(''); const [loading, setLoading] = useState(false); const [mode, setMode] = useState('Tra cứu văn bản');
  const ask = (e) => { e.preventDefault(); const value = text.trim(); if (!value) return; setMessages(m => [...m,{role:'user',content:value}]); setText(''); setLoading(true); setTimeout(() => { setMessages(m => [...m,{role:'assistant',content:'Theo Hướng dẫn 12-HD/ĐTN, sinh hoạt Chi đoàn chủ điểm cần xác định rõ chủ đề, mục tiêu, nội dung thảo luận và hình thức tổ chức phù hợp với đoàn viên. Đây là phần tóm tắt từ tài liệu đã được duyệt.',sources:[documents[0]]}]); setLoading(false); }, 850); };
  return <div className="ai-page"><header className="ai-header"><button className="icon-button" onClick={() => navigate('/tri-thuc')}><Icon name="chevron" /></button><div><span><Icon name="sparkles" /></span><div><strong>Trợ lý AI</strong><small>Tra cứu có dẫn nguồn</small></div></div><button className="icon-button"><Icon name="settings" /></button></header>
    <div className="ai-mode-row">{['Tra cứu văn bản','Hỗ trợ công tác Đoàn','Tìm giải pháp'].map(x => <button key={x} className={mode === x ? 'active' : ''} onClick={() => setMode(x)}>{x}</button>)}</div>
    <div className="chat-body">{messages.map((m,i) => <div className={`message ${m.role}`} key={i}>{m.role === 'assistant' && <span className="bot-avatar"><Icon name="sparkles" /></span>}<div><p>{m.content}</p>{m.sources && <div className="message-sources"><small>Nguồn tham khảo</small>{m.sources.map(s => <button key={s.id} onClick={() => navigate(`/tri-thuc/van-ban/${s.id}`)}><Icon name="file" /><span><strong>{s.number}</strong>{s.title}</span><Icon name="chevron" /></button>)}</div>}</div></div>)}{loading && <div className="message assistant"><span className="bot-avatar"><Icon name="sparkles" /></span><div className="typing"><i/><i/><i/></div></div>}</div>
    <form className="chat-input" onSubmit={ask}><textarea rows="1" value={text} onChange={e => setText(e.target.value)} placeholder="Nhập câu hỏi về tài liệu..." /><button disabled={!text.trim() || loading}><Icon name="send" /></button><small>AI có thể sai. Hãy kiểm tra tài liệu nguồn trước khi sử dụng.</small></form>
  </div>;
}

function Innovation({ navigate, openProblem }) {
  return <div className="page"><PageHeader title="Đổi mới sáng tạo" subtitle="Kết nối bài toán thực tiễn với giải pháp hiệu quả" />
    <section className="innovation-hero"><div><span>GÓC ĐỔI MỚI SÁNG TẠO</span><h2>Từ điểm nghẽn thực tiễn đến giải pháp có thể nhân rộng</h2><p>Cùng chia sẻ công trình, đề xuất bài toán và kết nối nguồn lực hỗ trợ.</p></div><span className="innovation-mark"><Icon name="bulb" size={42} /></span></section>
    <div className="innovation-entry"><button onClick={() => navigate('/doi-moi-sang-tao/cong-trinh')}><span className="blue"><Icon name="work" /></span><div><strong>Đang triển khai</strong><small>Theo dõi tiến độ công trình</small></div><Icon name="chevron" /></button><button onClick={() => navigate('/doi-moi-sang-tao/cong-trinh?status=done')}><span className="green"><Icon name="check" /></span><div><strong>Đã triển khai hiệu quả</strong><small>Giải pháp có khả năng nhân rộng</small></div><Icon name="chevron" /></button><button className="problem-entry" onClick={openProblem}><span className="yellow"><Icon name="send" /></span><div><strong>Gửi bài toán, điểm nghẽn</strong><small>Không cần tự viết giải pháp kỹ thuật</small></div><Icon name="chevron" /></button></div>
    <SectionHeader title="Công trình nổi bật" action="Xem tất cả" onAction={() => navigate('/doi-moi-sang-tao/cong-trinh')} />
    <ProjectCard project={projects[0]} onClick={() => navigate(`/doi-moi-sang-tao/cong-trinh/${projects[0].id}`)} featured />
    <SectionHeader title="Bài toán của đơn vị" action="Theo dõi" onAction={() => navigate('/doi-moi-sang-tao/bai-toan')} />
    <div className="problem-mini-list">{problems.map(p => <button key={p.id} onClick={() => navigate(`/doi-moi-sang-tao/bai-toan/${p.id}`)}><span><Icon name="bulb" /></span><div><strong>{p.title}</strong><small>{problemStatus[p.status][0]} · {p.date}</small></div><Icon name="chevron" /></button>)}</div>
  </div>;
}

function Projects({ navigate }) {
  const [filter, setFilter] = useState('Tất cả');
  const list = projects.filter(p => filter === 'Tất cả' || (filter === 'Hiệu quả' ? p.progress === 100 : p.progress < 100));
  return <div className="page"><PageHeader title="Công trình đổi mới" subtitle="Các giải pháp đang triển khai và đã chứng minh hiệu quả" back="/doi-moi-sang-tao" navigate={navigate} />
    <div className="chip-row">{['Tất cả','Đang triển khai','Hiệu quả'].map(x => <button key={x} className={filter === x ? 'active' : ''} onClick={() => setFilter(x)}>{x}</button>)}</div>
    <div className="project-list">{list.map(p => <ProjectCard key={p.id} project={p} onClick={() => navigate(`/doi-moi-sang-tao/cong-trinh/${p.id}`)} />)}</div>
  </div>;
}

function ProjectCard({ project, onClick, featured = false }) {
  return <article className={`project-card ${featured ? 'featured' : ''}`} onClick={onClick} role="button" tabIndex="0"><div className="project-symbol"><Icon name="bulb" size={30} /></div><div className="project-content"><StatusBadge label={project.status} tone={project.progress === 100 ? 'success' : 'info'} /><h3>{project.title}</h3><p>{project.summary}</p><small>{project.team}</small><div className="project-progress"><Progress value={project.progress} /><span>{project.progress}%</span></div></div><Icon name="chevron" /></article>;
}

function ProjectDetail({ project, navigate }) {
  if (!project) return <NotFound navigate={navigate} />;
  return <div className="page"><PageHeader title="Chi tiết công trình" subtitle="Thông tin đã được phê duyệt công bố" back="/doi-moi-sang-tao/cong-trinh" navigate={navigate} />
    <article className="project-detail-hero"><StatusBadge label={project.status} tone={project.progress === 100 ? 'success' : 'info'} /><h2>{project.title}</h2><p>{project.team}</p><div><Progress value={project.progress} /><strong>{project.progress}%</strong></div></article>
    <section className="content-card"><h3>Vấn đề thực tiễn</h3><p>{project.summary}</p></section><section className="content-card"><h3>Giải pháp</h3><p>Xây dựng nền tảng số tập trung, giao diện thân thiện trên điện thoại, dữ liệu được chuẩn hóa và cập nhật theo đầu mối phụ trách.</p></section><section className="content-card"><h3>Kết quả bước đầu</h3><p>{project.result}</p><div className="impact-grid"><div><strong>{project.progress === 100 ? '100%' : '82%'}</strong><span>Tiến độ</span></div><div><strong>12</strong><span>Đơn vị tham gia</span></div><div><strong>Cao</strong><span>Khả năng nhân rộng</span></div></div></section><section className="security-note"><Icon name="shield" /><div><strong>Thông tin công bố có kiểm soát</strong><p>Không hiển thị mã nguồn, secret, dữ liệu người dùng thật hoặc sơ đồ hạ tầng nhạy cảm.</p></div></section>
  </div>;
}

function Problems({ navigate, openProblem }) {
  return <div className="page"><PageHeader title="Bài toán, điểm nghẽn" subtitle="Theo dõi đề xuất của cá nhân và đơn vị" back="/doi-moi-sang-tao" navigate={navigate} action={<Button icon="send" onClick={openProblem}>Gửi mới</Button>} />
    <div className="problem-list">{problems.map(p => <article key={p.id} onClick={() => navigate(`/doi-moi-sang-tao/bai-toan/${p.id}`)}><div className="card-head"><StatusBadge label={problemStatus[p.status][0]} tone={problemStatus[p.status][1]} /><span>{p.id.toUpperCase()}</span></div><h3>{p.title}</h3><p>{p.update}</p><div><span>{p.organization}</span><span>{p.date}</span></div></article>)}</div>
  </div>;
}

function ProblemDetail({ problem, navigate }) {
  if (!problem) return <NotFound navigate={navigate} />;
  return <div className="page"><PageHeader title="Theo dõi bài toán" subtitle={problem.id.toUpperCase()} back="/doi-moi-sang-tao/bai-toan" navigate={navigate} />
    <article className="detail-hero"><StatusBadge label={problemStatus[problem.status][0]} tone={problemStatus[problem.status][1]} /><h2>{problem.title}</h2><p>{problem.organization} · gửi ngày {problem.date}</p></article>
    <section className="content-card"><h3>Điểm nghẽn</h3><p>Quy trình tổng hợp hiện sử dụng nhiều biểu mẫu rời, cán bộ phải kiểm tra thủ công từng đơn vị và mất thời gian nhắc các đơn vị chưa hoàn thành.</p><h3>Kết quả mong muốn</h3><p>Có một nơi giao yêu cầu, nộp tệp, theo dõi trạng thái và nhắc hạn tự động.</p></section>
    <section className="content-card"><h3>Tiến trình xử lý</h3><div className="timeline"><div><i /><strong>Đang nghiên cứu</strong><span>30/07/2026</span><p>Nhóm phụ trách khảo sát biểu mẫu và luồng nghiệp vụ.</p></div><div><i /><strong>Đã phân công</strong><span>29/07/2026</span><p>Phân công nhóm nền tảng số tiếp nhận.</p></div><div><i /><strong>Tiếp nhận đề xuất</strong><span>28/07/2026</span><p>Hệ thống xác nhận hồ sơ đầy đủ.</p></div></div></section>
  </div>;
}

function ProblemSheet({ onClose, notify, navigate }) {
  const [step, setStep] = useState(1); const [title, setTitle] = useState(''); const [pain, setPain] = useState(''); const [safe, setSafe] = useState(false);
  const submit = (e) => { e.preventDefault(); if (step === 1) return setStep(2); notify('Bài toán đã được tiếp nhận với mã BT-003.'); onClose(); navigate('/doi-moi-sang-tao/bai-toan'); };
  return <div className="sheet-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}><form className="bottom-sheet" onSubmit={submit}><div className="sheet-handle" /><header><div><span>BƯỚC {step}/2</span><h2>Gửi bài toán, điểm nghẽn</h2><p>Câu lạc bộ sẽ sàng lọc và liên hệ khi cần bổ sung.</p></div><button type="button" onClick={onClose}>×</button></header>
    {step === 1 ? <div className="sheet-fields"><label className="form-field"><span>Tên vấn đề</span><input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Tổng hợp báo cáo còn thủ công" /></label><label className="form-field"><span>Quy trình hiện tại và điểm nghẽn</span><textarea required rows="6" value={pain} onChange={e => setPain(e.target.value)} placeholder="Mô tả công việc hiện làm, bước gây mất thời gian hoặc dễ sai..." /></label><label className="form-field"><span>Kết quả mong muốn</span><textarea rows="3" placeholder="Mong muốn cải thiện điều gì?" /></label></div> : <div className="sheet-fields"><label className="form-field"><span>Mức độ cấp thiết</span><select defaultValue="MEDIUM"><option value="LOW">Có thể nghiên cứu</option><option value="MEDIUM">Cần cải thiện sớm</option><option value="HIGH">Cấp thiết</option></select></label><label className="form-field"><span>Tệp minh họa (không bắt buộc)</span><input type="file" /></label><div className="security-box"><Icon name="shield" /><p>Không tải lên bí mật nhà nước, dữ liệu nghiệp vụ nhạy cảm hoặc dữ liệu cá nhân không được phép xử lý.</p></div><label className="check-row"><input type="checkbox" checked={safe} onChange={e => setSafe(e.target.checked)} /><span>Tôi xác nhận nội dung phù hợp phạm vi sử dụng của nền tảng.</span></label></div>}
    <footer>{step === 2 && <Button type="button" variant="secondary" onClick={() => setStep(1)}>Quay lại</Button>}<Button type="submit" icon={step === 1 ? 'arrow' : 'send'} disabled={!title || !pain || (step === 2 && !safe)}>{step === 1 ? 'Tiếp tục' : 'Gửi hỗ trợ'}</Button></footer>
  </form></div>;
}

function Profile({ navigate, notify }) {
  return <div className="page"><PageHeader title="Cá nhân" subtitle="Thông tin tài khoản và hoạt động của đồng chí" />
    <section className="profile-card"><div className="profile-avatar">VP</div><h2>Vi Ngọc Phương</h2><p>Chi đoàn PA01 · Cán bộ chi đoàn</p><StatusBadge label="Tài khoản đang hoạt động" tone="success" /></section>
    <div className="profile-stats"><div><strong>06</strong><span>Báo cáo đã nộp</span></div><div><strong>03</strong><span>Chuyên đề đạt</span></div><div><strong>02</strong><span>Bài toán đã gửi</span></div></div>
    <SectionHeader title="Hoạt động của tôi" />
    <div className="settings-list"><button onClick={() => navigate('/ca-nhan/thong-bao')}><span><Icon name="bell" /></span><div><strong>Thông báo</strong><small>03 thông báo chưa đọc</small></div><b>3</b><Icon name="chevron" /></button><button onClick={() => navigate('/cong-viec/lich-su')}><span><Icon name="file" /></span><div><strong>Lịch sử báo cáo</strong><small>Các phiên bản đã nộp</small></div><Icon name="chevron" /></button><button onClick={() => navigate('/ca-nhan/ket-qua-hoc-tap')}><span><Icon name="book" /></span><div><strong>Kết quả học tập</strong><small>Điểm và chuyên đề đã hoàn thành</small></div><Icon name="chevron" /></button><button onClick={() => navigate('/doi-moi-sang-tao/bai-toan')}><span><Icon name="bulb" /></span><div><strong>Bài toán đã gửi</strong><small>Theo dõi tiến trình xử lý</small></div><Icon name="chevron" /></button></div>
    <SectionHeader title="Tài khoản" /><div className="settings-list"><button onClick={() => notify('Tính năng đổi mật khẩu sẽ dùng Supabase Auth khi kết nối dự án.')}><span><Icon name="shield" /></span><div><strong>Đổi mật khẩu</strong><small>Bảo vệ tài khoản của đồng chí</small></div><Icon name="chevron" /></button><button className="logout-row" onClick={() => navigate('/login')}><span><Icon name="logout" /></span><div><strong>Đăng xuất</strong><small>Kết thúc phiên làm việc hiện tại</small></div><Icon name="chevron" /></button></div>
    <p className="version">Sổ tay Đoàn viên số · Phiên bản 0.1.0</p>
  </div>;
}

function Notifications({ navigate }) {
  return <div className="page"><PageHeader title="Thông báo" subtitle="Cập nhật mới và nhắc việc cá nhân" back="/ca-nhan" navigate={navigate} />
    <div className="notification-list">{[
      ['danger','Báo cáo tháng 7 sắp đến hạn','Còn 3 ngày để Chi đoàn hoàn thành bản nộp.','2 giờ trước'],
      ['info','Mời học chuyên đề chuyển đổi số','Chuyên đề mở đến hết ngày 10/8/2026.','Hôm qua'],
      ['success','Báo cáo Chiến dịch hè đã được tiếp nhận','Bản nộp phiên bản 1 đã được xác nhận hoàn thành.','28/07/2026']
    ].map(([tone,title,body,time]) => <article key={title}><span className={`notification-icon ${tone}`}><Icon name={tone === 'danger' ? 'alert' : tone === 'success' ? 'check' : 'bell'} /></span><div><strong>{title}</strong><p>{body}</p><small>{time}</small></div><i /></article>)}</div>
  </div>;
}

function LearningResults({ navigate }) {
  return <div className="page"><PageHeader title="Kết quả học tập" subtitle="Tiến độ và lịch sử bài kiểm tra" back="/ca-nhan" navigate={navigate} />
    <div className="result-overview"><div className="score-ring small"><strong>86</strong><span>điểm TB</span></div><div><h2>Hoàn thành tốt</h2><p>3/5 chuyên đề đã hoàn thành</p><Progress value={60} /></div></div>
    <div className="result-list">{topics.map((t,i) => <article key={t.id}><span className={t.progress === 100 ? 'done' : ''}><Icon name={t.progress === 100 ? 'check' : 'book'} /></span><div><h3>{t.title}</h3><p>{t.progress === 100 ? `Điểm: ${90-i*4} · Đạt` : `${t.progress}% hoàn thành`}</p></div><Icon name="chevron" /></article>)}</div>
  </div>;
}

function Admin({ navigate }) {
  const units = [
    ['Chi đoàn PA01','SUBMITTED','30/07/2026 · 15:24'],['Chi đoàn PA02','PENDING','Chưa nộp'],['Chi đoàn PX03','NEEDS_SUPPLEMENT','29/07/2026 · 09:10'],['Đoàn phường Phú Thọ','ACCEPTED','28/07/2026 · 14:02'],['Đoàn phường Phong Châu','OVERDUE','Chưa nộp']
  ];
  return <div className="admin-page"><PageHeader title="Bảng điều hành" subtitle="Tổng hợp hoạt động toàn hệ thống" back="/" navigate={navigate} action={<Button icon="settings" variant="secondary">Cấu hình</Button>} />
    <div className="admin-metrics"><div><span className="blue"><Icon name="users" /></span><strong>1.286</strong><small>Người dùng hoạt động</small><b>+42 tháng này</b></div><div><span className="orange"><Icon name="clock" /></span><strong>56</strong><small>Đơn vị chưa nộp</small><b>Đợt tháng 7</b></div><div><span className="purple"><Icon name="file" /></span><strong>07</strong><small>Văn bản chờ duyệt</small><b>Cần xử lý</b></div><div><span className="green"><Icon name="bulb" /></span><strong>12</strong><small>Bài toán đang xử lý</small><b>03 bài toán mới</b></div></div>
    <div className="admin-grid"><section className="admin-card wide"><div className="admin-card-head"><div><h2>Tình trạng báo cáo tháng 7</h2><p>200 đơn vị được giao</p></div><Button variant="secondary" icon="download">Xuất Excel</Button></div><div className="admin-progress"><div className="big-progress"><span style={{width:'72%'}}/><i style={{left:'72%'}}>72%</i></div><div className="legend"><span><i className="success"/>144 đã nộp</span><span><i className="warning"/>43 chưa nộp</span><span><i className="danger"/>13 quá hạn</span></div></div><div className="admin-table"><div className="table-head"><span>Đơn vị</span><span>Trạng thái</span><span>Cập nhật</span><span /></div>{units.map(([u,s,t]) => <div className="table-row" key={u}><strong>{u}</strong><span><StatusBadge status={s} /></span><span>{t}</span><button><Icon name="chevron" /></button></div>)}</div></section>
      <section className="admin-card"><div className="admin-card-head"><div><h2>Cần xử lý</h2><p>Công việc ưu tiên</p></div></div><div className="todo-admin"><button><span className="purple"><Icon name="file" /></span><div><strong>07 văn bản chờ duyệt</strong><small>Kho tri thức</small></div><Icon name="chevron" /></button><button><span className="orange"><Icon name="alert" /></span><div><strong>12 báo cáo cần xem xét</strong><small>03 yêu cầu bổ sung</small></div><Icon name="chevron" /></button><button><span className="blue"><Icon name="bulb" /></span><div><strong>03 bài toán mới</strong><small>Chờ sàng lọc</small></div><Icon name="chevron" /></button></div></section>
      <section className="admin-card"><div className="admin-card-head"><div><h2>Hoạt động AI</h2><p>30 ngày gần nhất</p></div></div><div className="ai-stats"><div><strong>2.418</strong><span>Lượt hỏi</span></div><div><strong>91%</strong><span>Có nguồn</span></div><div><strong>4,6/5</strong><span>Phản hồi</span></div></div><div className="mini-bars">{[52,76,48,88,66,92,81].map((x,i) => <i key={i} style={{height:`${x}%`}} />)}</div></section>
    </div>
  </div>;
}

function Login({ navigate }) {
  const [email, setEmail] = useState('viphuong@congan.phutho.gov.vn'); const [password, setPassword] = useState('demo1234');
  const submit = e => { e.preventDefault(); localStorage.setItem('demo-session','1'); navigate('/'); };
  return <div className="login-page"><div className="login-decoration one"/><div className="login-decoration two"/><section className="login-brand"><Brand /><h1>Sổ tay đồng hành cùng mỗi đoàn viên</h1><p>Cập nhật đúng, làm việc đúng hạn và đổi mới từ thực tiễn.</p><div className="login-values"><span><Icon name="shield" />Thông tin chính thống</span><span><Icon name="clock" />Nhắc việc đúng hạn</span><span><Icon name="bulb" />Kết nối sáng kiến</span></div></section><form className="login-card" onSubmit={submit}><img src="/brand/app-icon.svg" alt="Logo Sổ tay Đoàn viên số" /><div><span>ĐĂNG NHẬP HỆ THỐNG</span><h2>Chào mừng đồng chí trở lại</h2><p>Sử dụng tài khoản được Ban Thanh niên cấp.</p></div><label className="form-field"><span>Email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label className="form-field"><span>Mật khẩu</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button type="button" className="forgot">Quên mật khẩu?</button><Button type="submit">Đăng nhập</Button><p className="demo-note">Bản bàn giao đang chạy ở chế độ dữ liệu mẫu. Kết nối Supabase Auth để vận hành thật.</p></form></div>;
}

function NotFound({ navigate }) {
  return <div className="page"><EmptyState icon="alert" title="Không tìm thấy nội dung" description="Đường dẫn không tồn tại hoặc nội dung đã được di chuyển." action="Về Trang chủ" onAction={() => navigate('/')} /></div>;
}

export default function App() {
  const [path, navigate] = usePath();
  const [toast, setToast] = useState('');
  const [problemOpen, setProblemOpen] = useState(false);
  const notify = (message) => setToast(message);
  const campaignId = path.match(/^\/cong-viec\/bao-cao\/([^/]+)/)?.[1];
  const documentId = path.match(/^\/tri-thuc\/van-ban\/([^/]+)/)?.[1];
  const topicId = path.match(/^\/tri-thuc\/chuyen-de\/([^/]+)/)?.[1];
  const projectId = path.match(/^\/doi-moi-sang-tao\/cong-trinh\/([^/]+)/)?.[1];
  const problemId = path.match(/^\/doi-moi-sang-tao\/bai-toan\/([^/]+)/)?.[1];
  const content = useMemo(() => {
    if (path === '/') return <Home navigate={navigate} />;
    if (path === '/cong-viec') return <Work navigate={navigate} />;
    if (path === '/cong-viec/lich-su') return <SubmissionHistory navigate={navigate} />;
    if (campaignId && path.endsWith('/nop')) return <SubmitReport campaign={campaigns.find(c => c.id === campaignId)} navigate={navigate} notify={notify} />;
    if (campaignId) return <ReportDetail campaign={campaigns.find(c => c.id === campaignId)} navigate={navigate} />;
    if (path === '/tri-thuc') return <Knowledge navigate={navigate} />;
    if (path === '/tri-thuc/van-ban') return <Documents navigate={navigate} />;
    if (documentId) return <DocumentDetail document={documents.find(d => d.id === documentId)} navigate={navigate} />;
    if (path === '/tri-thuc/chuyen-de') return <Topics navigate={navigate} />;
    if (path.startsWith('/tri-thuc/trac-nghiem/')) return <Quiz navigate={navigate} notify={notify} />;
    if (topicId) return <TopicDetail topic={topics.find(t => t.id === topicId)} navigate={navigate} />;
    if (path === '/tro-ly-ai') return <AIAssistant navigate={navigate} />;
    if (path === '/doi-moi-sang-tao') return <Innovation navigate={navigate} openProblem={() => setProblemOpen(true)} />;
    if (path === '/doi-moi-sang-tao/cong-trinh') return <Projects navigate={navigate} />;
    if (projectId) return <ProjectDetail project={projects.find(p => p.id === projectId)} navigate={navigate} />;
    if (path === '/doi-moi-sang-tao/bai-toan') return <Problems navigate={navigate} openProblem={() => setProblemOpen(true)} />;
    if (path === '/doi-moi-sang-tao/bai-toan/gui') { setTimeout(() => setProblemOpen(true), 0); return <Problems navigate={navigate} openProblem={() => setProblemOpen(true)} />; }
    if (problemId) return <ProblemDetail problem={problems.find(p => p.id === problemId)} navigate={navigate} />;
    if (path === '/ca-nhan') return <Profile navigate={navigate} notify={notify} />;
    if (path === '/ca-nhan/thong-bao') return <Notifications navigate={navigate} />;
    if (path === '/ca-nhan/ket-qua-hoc-tap') return <LearningResults navigate={navigate} />;
    if (path.startsWith('/admin')) return <Admin navigate={navigate} />;
    return <NotFound navigate={navigate} />;
  }, [path, campaignId, documentId, topicId, projectId, problemId]);

  if (path === '/login' || path === '/quen-mat-khau') return <ErrorBoundary><Login navigate={navigate} /></ErrorBoundary>;
  if (path === '/tro-ly-ai') return <ErrorBoundary>{content}{toast && <Toast message={toast} onClose={() => setToast('')} />}</ErrorBoundary>;
  return <ErrorBoundary><AppShell path={path} navigate={navigate}>{content}</AppShell>{problemOpen && <ProblemSheet onClose={() => setProblemOpen(false)} notify={notify} navigate={navigate} />}{toast && <Toast message={toast} onClose={() => setToast('')} />}</ErrorBoundary>;
}
