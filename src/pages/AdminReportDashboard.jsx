import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, PageHeader, Progress, StatusBadge } from '../components/common';
import Skeleton from '../components/Skeleton';
import { supabase } from '../services/supabaseClient';
import { createReportAdminService } from '../services/reportAdminService';
import { DASHBOARD_FILTERS, dashboardStatusLabel, formatCompletion, mapDashboardError } from '../lib/reportDashboard.mjs';
import { formatReportDate } from '../lib/reportDisplay.mjs';
import { normalizeSafeFileName } from '../lib/status.mjs';

const service = createReportAdminService(supabase);

function SummaryCard({ label, value, tone = '' }) {
  return <div className={`dashboard-summary-card ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function saveDownload(data, filename, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

export function AdminReportDashboard() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadState, setDownloadState] = useState('');
  const [downloadError, setDownloadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextDashboard, nextAssignments] = await Promise.all([
        service.getReportDashboard(campaignId),
        service.getDashboardAssignments(campaignId, { status, search })
      ]);
      setDashboard(nextDashboard);
      setAssignments(nextAssignments);
    } catch (requestError) {
      setDashboard(null);
      setAssignments([]);
      setError(mapDashboardError(requestError));
    } finally {
      setLoading(false);
    }
  }, [campaignId, status, search]);

  useEffect(() => {
    const timeoutId = window.setTimeout(load, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const completion = useMemo(() => formatCompletion(dashboard), [dashboard]);

  const handleDownload = async type => {
    if (downloadState) return;
    setDownloadState(type);
    setDownloadError('');
    try {
      const options = { status, search };
      const safeTitle = normalizeSafeFileName(dashboard.campaign.title) || 'bao-cao';
      const date = new Date().toISOString().slice(0, 10);
      if (type === 'csv') {
        const data = await service.exportReportStatus(campaignId, options);
        saveDownload(data, `bao-cao-trang-thai-${safeTitle}-${date}.csv`, 'text/csv;charset=utf-8');
      } else {
        const data = await service.downloadReportBundle(campaignId, options);
        saveDownload(data, `bao-cao-${safeTitle}-${date}.zip`, 'application/zip');
      }
    } catch (requestError) {
      setDownloadError(mapDashboardError(requestError));
    } finally {
      setDownloadState('');
    }
  };

  if (loading && !dashboard) return <div className="page"><PageHeader title="Dashboard báo cáo" /><Skeleton lines={8} /></div>;
  if (error) return <div className="page"><PageHeader title="Dashboard báo cáo" back="/admin/bao-cao" navigate={navigate} /><EmptyState icon="alert" title="Không tải được dashboard" description={error} action="Thử lại" onAction={load} /></div>;

  return (
    <div className="page admin-reports-page report-dashboard-page">
      <PageHeader title={dashboard.campaign.title} subtitle="Dashboard tình trạng nộp báo cáo" back="/admin/bao-cao" navigate={navigate} action={<div className="dashboard-header-actions"><button className="button button-secondary" type="button" onClick={() => handleDownload('csv')} disabled={Boolean(downloadState)}>{downloadState === 'csv' ? 'Đang xuất…' : 'Xuất CSV'}</button><button className="button button-primary" type="button" onClick={() => handleDownload('bundle')} disabled={Boolean(downloadState)}>{downloadState === 'bundle' ? 'Đang đóng gói…' : 'Tải gói báo cáo'}</button><Link className="button button-secondary" to={`/admin/bao-cao/${campaignId}`}>Cấu hình đợt</Link></div>} />
      <section className="dashboard-campaign-meta"><StatusBadge status={dashboard.campaign.status} /><span>Mở: {formatReportDate(dashboard.campaign.openAt)}</span><span>Hạn: {formatReportDate(dashboard.campaign.dueAt)}</span></section>
      <section className="dashboard-completion" aria-label="Tiến độ hoàn thành"><div><strong>{completion.completed} / {completion.total} đơn vị hoàn thành</strong><span>{completion.rate}%</span></div><Progress value={dashboard.completionRate} /></section>
      <section className="dashboard-summary-grid" aria-label="Tổng quan trạng thái"><SummaryCard label="Tổng đơn vị" value={dashboard.totalAssignments} /><SummaryCard label="Hoàn thành" value={dashboard.completedCount} tone="success" /><SummaryCard label="Chưa nộp" value={dashboard.pendingCount} tone="warning" /><SummaryCard label="Quá hạn" value={dashboard.overdueCount} tone="danger" /><SummaryCard label="Cần bổ sung" value={dashboard.needsSupplementCount} tone="attention" /></section>
      <section className="dashboard-list-section" aria-labelledby="dashboard-assignments-title">
        {downloadError && <p className="form-error" role="alert">{downloadError}</p>}
        <div className="section-header"><h2 id="dashboard-assignments-title">Danh sách đơn vị</h2><span>{assignments.length} kết quả</span></div>
        <div className="dashboard-filters"><label className="dashboard-search"><span>Tìm đơn vị</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tên hoặc mã đơn vị" /></label><div className="dashboard-filter-chips" aria-label="Lọc theo trạng thái">{DASHBOARD_FILTERS.map(([value, label]) => <button type="button" key={value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>{label}</button>)}</div></div>
        {loading && <Skeleton lines={4} />}
        {!loading && assignments.length === 0 && <EmptyState icon="file" title="Không có đơn vị phù hợp" description="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm." />}
        {!loading && assignments.length > 0 && <div className="dashboard-assignment-list">{assignments.map(item => <article className="dashboard-assignment-row" key={item.id}><div className="dashboard-organization"><strong>{item.organization.name}</strong><span>{item.organization.code || 'Chưa có mã'} · Hạn: {formatReportDate(item.effectiveDueAt)}</span></div><div className="dashboard-assignment-details"><StatusBadge status={item.status} label={dashboardStatusLabel(item.status)} />{item.isLate && <span className="late-indicator">Nộp muộn</span>}<span>{item.latestVersion ? `v${item.latestVersion} · ${formatReportDate(item.latestSubmittedAt)}` : 'Chưa có bản nộp'}</span>{item.exemptReason && <span>Lý do miễn: {item.exemptReason}</span>}</div><Link className="button button-secondary" to={`/cong-viec/bao-cao/${item.id}`}>Xem</Link></article>)}</div>}
      </section>
    </div>
  );
}
