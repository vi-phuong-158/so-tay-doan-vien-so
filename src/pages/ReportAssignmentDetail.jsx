import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader, StatusBadge } from '../components/common';
import Skeleton from '../components/Skeleton';
import {
  createReportService,
  REPORT_TEMPLATES_BUCKET
} from '../services/reportService';
import { supabase } from '../services/supabaseClient';
import { formatFileSize, formatReportDate, getEffectiveDueAt } from '../lib/reportDisplay.mjs';

const reportService = createReportService(supabase);

function formatExtensions(extensions) {
  return Array.isArray(extensions) && extensions.length > 0
    ? extensions.map((extension) => extension.toUpperCase()).join(', ')
    : 'Theo quy định của đợt báo cáo';
}

function formatPolicy(value) {
  return value ? 'Được phép' : 'Không được phép';
}

export function ReportAssignmentDetail() {
  const navigate = useNavigate();
  const { assignmentId } = useParams();
  const [assignment, setAssignment] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [templateError, setTemplateError] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const loadDetail = useCallback(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    setTemplateError(null);

    reportService.getAssignment(assignmentId)
      .then((loadedAssignment) => Promise.all([
        loadedAssignment,
        reportService.getCampaignTemplates(loadedAssignment.campaign?.id)
      ]))
      .then(([loadedAssignment, loadedTemplates]) => {
        if (!mounted) return;
        setAssignment(loadedAssignment);
        setTemplates(loadedTemplates);
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
  }, [assignmentId]);

  useEffect(() => {
    let cleanup;
    const timer = setTimeout(() => {
      cleanup = loadDetail();
    }, 0);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [loadDetail]);

  async function downloadTemplate(template) {
    setDownloadingId(template.id);
    setTemplateError(null);
    try {
      const signedUrl = await reportService.getSignedFileUrl(template.storage_path, {
        bucket: REPORT_TEMPLATES_BUCKET,
        expiresIn: 60
      });
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (requestError) {
      setTemplateError(requestError);
    } finally {
      setDownloadingId(null);
    }
  }

  const campaign = assignment?.campaign;

  return (
    <div className="page">
      <PageHeader title={campaign?.title || 'Chi tiết nhiệm vụ'} back="/cong-viec" navigate={navigate} />
      {loading && <Skeleton lines={7} />}
      {!loading && error && (
        <EmptyState
          icon="alert"
          title="Không tìm thấy nhiệm vụ"
          description="Không tìm thấy nhiệm vụ hoặc bạn không có quyền truy cập."
          action="Thử lại"
          onAction={loadDetail}
        />
      )}
      {!loading && !error && assignment && campaign && (
        <>
          <section className="detail-hero">
            <StatusBadge status={assignment.status} />
            <h2>{campaign.title}</h2>
            {campaign.issuer && <p>{campaign.issuer}</p>}
          </section>

          <section className="content-card">
            <h3>Thông tin nhiệm vụ</h3>
            {campaign.description && <p>{campaign.description}</p>}
            <div className="info-grid">
              <div><span>Mở đợt</span><strong>{formatReportDate(campaign.openAt)}</strong></div>
              <div><span>Hạn nộp</span><strong>{formatReportDate(getEffectiveDueAt(assignment))}</strong></div>
              {campaign.closeAt && <div><span>Đóng đợt</span><strong>{formatReportDate(campaign.closeAt)}</strong></div>}
              <div><span>Nộp muộn</span><strong>{formatPolicy(campaign.allowLateSubmission)}</strong></div>
              <div><span>Nộp lại</span><strong>{formatPolicy(campaign.allowResubmission)}</strong></div>
            </div>
          </section>

          <section className="content-card">
            <h3>Yêu cầu tệp</h3>
            <div className="info-grid">
              <div><span>Định dạng</span><strong>{formatExtensions(campaign.allowedExtensions)}</strong></div>
              <div><span>Dung lượng tối đa</span><strong>{campaign.maxFileSizeMb ? `${campaign.maxFileSizeMb} MB/tệp` : 'Theo quy định của đợt báo cáo'}</strong></div>
              <div><span>Số tệp tối đa</span><strong>{campaign.maxFiles || 'Theo quy định của đợt báo cáo'}</strong></div>
            </div>
          </section>

          <section className="content-card">
            <h3>Biểu mẫu đính kèm</h3>
            {templates.length === 0 && <p>Không có biểu mẫu đính kèm.</p>}
            {templates.length > 0 && templates.map((template) => (
              <button
                type="button"
                className="file-row"
                key={template.id}
                onClick={() => downloadTemplate(template)}
                disabled={downloadingId === template.id}
              >
                <span><Icon name="file" size={20} /></span>
                <div>
                  <strong>{template.file_name}</strong>
                  <small>{formatFileSize(template.size_bytes)}{template.mime_type ? ` · ${template.mime_type}` : ''}</small>
                </div>
                <Icon name="download" size={18} />
              </button>
            ))}
            {templateError && <p role="alert">Không thể tải biểu mẫu. Vui lòng thử lại.</p>}
          </section>
        </>
      )}
    </div>
  );
}
