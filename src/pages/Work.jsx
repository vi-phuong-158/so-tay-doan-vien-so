import { Icon } from '../components/Icon';
import { PageHeader, StatusBadge, Progress, Button } from '../components/common';
import { campaigns } from '../data/mock';
import { getReportStatus } from '../lib/status.mjs';

function ReportCampaignCard({ item, onClick }) {
  getReportStatus(item.status); // Call to avoid unused meta warning since I removed meta assignment
  return (
    <div className="card campaign-card" onClick={onClick}>
      <div className="card-header">
        <h3>{item.title}</h3>
        <StatusBadge status={item.status} />
      </div>
      <div className="card-meta">
        <span><Icon name="clock" size={15} />Còn 4 ngày</span>
        <span><Icon name="check" size={15} />{item.submitted}/{item.total}</span>
      </div>
      <Progress value={item.progress} />
    </div>
  );
}

export function Work() {
  return (
    <div className="page">
      <PageHeader title="Công việc & Báo cáo" action={<Button icon="filter" variant="secondary">Bộ lọc</Button>} />
      <div className="tabs">
        <button className="tab active">Đang diễn ra (2)</button>
        <button className="tab">Đã hoàn thành</button>
      </div>
      <div className="list card-list" style={{ padding: '16px' }}>
        {campaigns.map(c => <ReportCampaignCard key={c.id} item={c} />)}
      </div>
    </div>
  );
}
