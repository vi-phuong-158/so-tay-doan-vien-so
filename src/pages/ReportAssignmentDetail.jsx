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
import {
  formatFileSize,
  formatReportDate,
  canSubmitAssignment,
  getEffectiveDueAt,
  getReportFileAccept,
  validateReportFileSelection
} from '../lib/reportDisplay.mjs';

const reportService = createReportService(supabase);

const ERROR_MESSAGES = {
  FILE_TYPE_NOT_ALLOWED: 'Định dạng tệp không được chấp nhận.',
  FILE_TOO_LARGE: 'Tệp vượt quá dung lượng cho phép.',
  TOO_MANY_FILES: 'Số lượng tệp vượt quá giới hạn.',
  DUPLICATE_FILE_PATH: 'Không thể chọn trùng cùng một tệp.',
  UPLOADS_EXIST: 'Đã có tệp tải lên. Hãy xóa hoặc giữ các tệp hiện tại trước khi chọn lại.',
  INVALID_FILE: 'Tệp rỗng hoặc không hợp lệ.',
  REPORT_NOT_OPEN: 'Đợt báo cáo chưa mở.',
  REPORT_CLOSED: 'Đợt báo cáo đã đóng.',
  LATE_SUBMISSION_NOT_ALLOWED: 'Đã quá hạn nộp báo cáo.',
  RESUBMISSION_NOT_ALLOWED: 'Báo cáo hiện không được phép nộp lại.',
  REPORT_ALREADY_ACCEPTED: 'Báo cáo đã được xác nhận hoàn thành.',
  REPORT_EXEMPTED: 'Đơn vị đã được miễn nộp báo cáo này.',
  AUTHENTICATION_REQUIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
};

function getReportErrorMessage(error, fallback = 'Không thể hoàn tất thao tác báo cáo.') {
  return ERROR_MESSAGES[error?.code] || fallback;
}

function formatExtensions(extensions) {
  return Array.isArray(extensions) && extensions.length > 0
    ? extensions.map((extension) => extension.toUpperCase()).join(', ')
    : 'Theo quy định của đợt báo cáo';
}

function formatPolicy(value) {
  return value ? 'Được phép' : 'Không được phép';
}

function getLocalFileId(file, index) {
  return `${file.name}:${file.size}:${file.lastModified || 0}:${index}`;
}

function statusLabel(status) {
  if (status === 'uploading') return 'Đang tải lên...';
  if (status === 'uploaded') return 'Đã tải lên';
  if (status === 'error') return 'Tải lên thất bại';
  return 'Chờ tải lên';
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
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileError, setFileError] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);
  const [summary, setSummary] = useState('');
  const [submitNote, setSubmitNote] = useState('');

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

  async function refreshAssignment() {
    try {
      const refreshed = await reportService.getAssignment(assignmentId);
      setAssignment(refreshed);
    } catch {
      // Keep the original operation result visible; the next explicit retry reloads the page.
    }
  }

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

  function selectFiles(event) {
    if (selectedFiles.some(({ status }) => status === 'uploaded')) {
      setFileError('UPLOADS_EXIST');
      event.target.value = '';
      return;
    }
    const result = validateReportFileSelection(event.target.files, assignment?.campaign);
    setFileError(result.errorCode);
    setUploadError(null);
    setSubmitError(null);
    if (!result.errorCode) {
      setSelectedFiles(result.files.map((file, index) => ({
        localId: getLocalFileId(file, index),
        file,
        status: 'selected',
        storagePath: null,
        originalName: file.name,
        error: null
      })));
    } else {
      setSelectedFiles([]);
    }
    event.target.value = '';
  }

  function updateFile(localId, changes) {
    setSelectedFiles((current) => current.map((item) => (
      item.localId === localId ? { ...item, ...changes } : item
    )));
  }

  async function uploadFiles() {
    if (uploading || submitting || selectedFiles.length === 0) return;
    setUploading(true);
    setUploadError(null);
    setSubmitError(null);
    try {
      for (const item of selectedFiles) {
        if (item.status === 'uploaded') continue;
        updateFile(item.localId, { status: 'uploading', error: null });
        try {
          const uploaded = await reportService.uploadReportFile({
            campaignId: assignment.campaign.id,
            organizationId: assignment.organizationId,
            assignmentId: assignment.id,
            file: item.file
          });
          updateFile(item.localId, {
            status: 'uploaded',
            storagePath: uploaded.storagePath,
            originalName: uploaded.originalName
          });
        } catch (requestError) {
          updateFile(item.localId, { status: 'error', error: requestError });
        }
      }
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(item) {
    if (uploading || submitting) return;
    if (!item.storagePath) {
      setSelectedFiles((current) => current.filter(({ localId }) => localId !== item.localId));
      return;
    }

    try {
      await reportService.removeStagedReportFile(item.storagePath);
      setSelectedFiles((current) => current.filter(({ localId }) => localId !== item.localId));
      setUploadError(null);
    } catch (requestError) {
      setUploadError(requestError);
    }
  }

  async function clearFiles() {
    if (uploading || submitting) return;
    const remaining = [];
    for (const item of selectedFiles) {
      if (!item.storagePath) continue;
      try {
        await reportService.removeStagedReportFile(item.storagePath);
      } catch (requestError) {
        remaining.push({ ...item, error: requestError });
      }
    }
    setSelectedFiles(remaining);
    if (remaining.length > 0) setUploadError({ code: 'REQUEST_FAILED' });
    else setUploadError(null);
  }

  async function submitReport() {
    if (submitting || uploading || !selectedFiles.length || !selectedFiles.every(({ status }) => status === 'uploaded')) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await reportService.submitReport({
        assignmentId: assignment.id,
        summary: summary.trim() || undefined,
        submitNote: submitNote.trim() || undefined,
        files: selectedFiles.map(({ storagePath, originalName }) => ({ storagePath, originalName }))
      });
      setSubmitResult(result);
      setSelectedFiles([]);
      setSummary('');
      setSubmitNote('');
      setConfirming(false);
      await refreshAssignment();
    } catch (requestError) {
      setSubmitError(requestError);
      setConfirming(false);
      await refreshAssignment();
    } finally {
      setSubmitting(false);
    }
  }

  const campaign = assignment?.campaign;
  const canSubmit = canSubmitAssignment(assignment);
  const allFilesUploaded = selectedFiles.length > 0 && selectedFiles.every(({ status }) => status === 'uploaded');
  const acceptedExtensions = getReportFileAccept(campaign?.allowedExtensions);
  const formTitle = assignment?.status === 'NEEDS_SUPPLEMENT' ? 'Nộp bổ sung' : 'Nộp báo cáo';

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

          {submitResult && (
            <section className="content-card" role="status">
              <h3>Báo cáo đã được ghi nhận thành công.</h3>
              {submitResult.version_number && <p>Phiên bản {submitResult.version_number} đã được ghi nhận.</p>}
            </section>
          )}

          {submitError && (
            <section className="content-card" role="alert">
              <p>{getReportErrorMessage(submitError)}</p>
            </section>
          )}

          {canSubmit && (
            <section className="content-card">
              <h3>{formTitle}</h3>
              <p>Chọn tệp theo yêu cầu, tải lên staging rồi xác nhận trước khi gửi. Trạng thái cuối cùng do máy chủ quyết định.</p>
              <div className="form-field">
                <span>Chọn tệp</span>
                <label className="button button-secondary" htmlFor="report-files">Chọn tệp</label>
                <input
                  id="report-files"
                  type="file"
                  multiple
                  accept={acceptedExtensions}
                  onChange={selectFiles}
                  disabled={uploading || submitting}
                  style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
                />
                <small>Định dạng: {formatExtensions(campaign.allowedExtensions)} · Tối đa {campaign.maxFiles || 'theo quy định'} tệp</small>
              </div>

              {fileError && <p role="alert">{getReportErrorMessage({ code: fileError }, 'Tệp được chọn chưa hợp lệ.')}</p>}
              {uploadError && <p role="alert">Không thể dọn tệp staging. Tệp vẫn được giữ lại để tránh mất dữ liệu.</p>}
              {selectedFiles.length > 0 && (
                <div className="list card-list">
                  {selectedFiles.map((item) => (
                    <div className="file-row" key={item.localId}>
                      <span><Icon name="file" size={20} /></span>
                      <div>
                        <strong>{item.originalName}</strong>
                        <small>{formatFileSize(item.file.size)} · {statusLabel(item.status)}</small>
                      </div>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Loại bỏ ${item.originalName}`}
                        onClick={() => removeFile(item)}
                        disabled={uploading || submitting}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="form-field">
                <label htmlFor="report-summary">Tóm tắt (không bắt buộc)</label>
                <textarea id="report-summary" maxLength={5000} value={summary} onChange={(event) => setSummary(event.target.value)} disabled={uploading || submitting} />
              </div>
              <div className="form-field">
                <label htmlFor="report-submit-note">Ghi chú nộp (không bắt buộc)</label>
                <textarea id="report-submit-note" maxLength={2000} value={submitNote} onChange={(event) => setSubmitNote(event.target.value)} disabled={uploading || submitting} />
              </div>

              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                <button type="button" className="button button-secondary" onClick={uploadFiles} disabled={uploading || submitting || selectedFiles.length === 0 || selectedFiles.every(({ status }) => status === 'uploaded')}>
                  {uploading ? 'Đang tải lên...' : 'Tải tệp lên'}
                </button>
                <button type="button" className="button button-secondary" onClick={clearFiles} disabled={uploading || submitting || selectedFiles.length === 0}>
                  Xóa các tệp
                </button>
                <button type="button" className="button button-primary" onClick={() => setConfirming(true)} disabled={uploading || submitting || !allFilesUploaded}>
                  {formTitle}
                </button>
              </div>

              {confirming && (
                <div className="security-box" role="dialog" aria-labelledby="report-confirm-title">
                  <div>
                    <strong id="report-confirm-title">Xác nhận {formTitle.toLowerCase()}?</strong>
                    <p>{selectedFiles.length} tệp đã tải lên: {selectedFiles.map(({ originalName }) => originalName).join(', ')}</p>
                    <div style={{ display: 'flex', gap: 9, marginTop: 10 }}>
                      <button type="button" className="button button-primary" onClick={submitReport} disabled={submitting}>
                        {submitting ? 'Đang gửi...' : 'Xác nhận gửi'}
                      </button>
                      <button type="button" className="button button-secondary" onClick={() => setConfirming(false)} disabled={submitting}>Quay lại</button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {!canSubmit && !submitResult && assignment.status === 'SUBMITTED' && (
            <section className="content-card"><p>Báo cáo đã được gửi và đang chờ xử lý.</p></section>
          )}
        </>
      )}
    </div>
  );
}
