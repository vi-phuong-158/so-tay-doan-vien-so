import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader, StatusBadge } from '../components/common';
import Skeleton from '../components/Skeleton';
import { createReportService } from '../services/reportService';
import { supabase } from '../services/supabaseClient';
import { getEffectiveDueAt, formatReportDate, REPORT_STATUS_GROUPS, sortAssignments } from '../lib/reportDisplay.mjs';

const reportService = createReportService(supabase);

function AssignmentCard({ assignment }) {
  const campaign = assignment.campaign || {};
  const dueAt = getEffectiveDueAt(assignment);

  return (
    <Link
      className="card campaign-card"
      to={`/cong-viec/bao-cao/${assignment.id}`}
      aria-label={`Mở nhiệm vụ ${campaign.title || 'báo cáo'}`}
    >
      <div className="card-header">
        <h3>{campaign.title || 'Nhiệm vụ báo cáo'}</h3>
        <StatusBadge status={assignment.status} />
      </div>
      {campaign.issuer && <p>{campaign.issuer}</p>}
      <div className="card-meta">
        <span><Icon name="clock" size={15} />Hạn nộp: {formatReportDate(dueAt)}</span>
      </div>
    </Link>
  );
}

export function Work() {
  const [assignments, setAssignments] = useState([]);
  const [activeTab, setActiveTab] = useState('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAssignments = useCallback(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    reportService.getMyAssignments()
      .then((data) => {
        if (mounted) setAssignments(data);
      })
      .catch((requestError) => {
        if (mounted) setError(requestError);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cleanup;
    const timer = setTimeout(() => {
      cleanup = loadAssignments();
    }, 0);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [loadAssignments]);

  const groupedAssignments = useMemo(() => ({
    active: sortAssignments(
      assignments.filter(({ status }) => REPORT_STATUS_GROUPS.active.includes(status)),
      'active'
    ),
    completed: sortAssignments(
      assignments.filter(({ status }) => REPORT_STATUS_GROUPS.completed.includes(status)),
      'completed'
    )
  }), [assignments]);

  const visibleAssignments = groupedAssignments[activeTab];

  return (
    <div className="page">
      <PageHeader title="Công việc & Báo cáo" />

      <div className="tabs" role="tablist" aria-label="Lọc nhiệm vụ báo cáo">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'active'}
          className={`tab ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          Đang thực hiện ({groupedAssignments.active.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'completed'}
          className={`tab ${activeTab === 'completed' ? 'active' : ''}`}
          onClick={() => setActiveTab('completed')}
        >
          Đã kết thúc ({groupedAssignments.completed.length})
        </button>
      </div>

      <div className="list card-list" style={{ padding: '16px' }}>
        {loading && <Skeleton lines={5} />}
        {!loading && error && (
          <EmptyState
            icon="alert"
            title="Không thể tải nhiệm vụ"
            description="Đã có lỗi khi tải danh sách báo cáo. Vui lòng thử lại."
            action="Thử lại"
            onAction={loadAssignments}
          />
        )}
        {!loading && !error && visibleAssignments.length === 0 && (
          <EmptyState
            icon="check"
            title="Chưa có nhiệm vụ báo cáo"
            description="Hiện tại đơn vị của bạn chưa có báo cáo cần thực hiện."
          />
        )}
        {!loading && !error && visibleAssignments.length > 0 && (
          <div className="campaign-list">
            {visibleAssignments.map((assignment) => (
              <AssignmentCard key={assignment.id} assignment={assignment} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
