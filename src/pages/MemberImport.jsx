import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, PageHeader, Toast } from '../components/common';
import { supabase } from '../services/supabaseClient';
import { createMemberService } from '../services/memberService';
import {
  IMPORT_JOB_STATUS_LABELS,
  IMPORT_ROW_STATUS_LABELS,
  importJobStatusTone,
  importRowStatusTone,
  memberErrorMessage,
} from '../lib/memberDisplay.mjs';

const memberService = createMemberService(supabase, { baseUrl: import.meta.env.VITE_MEMBER_API_URL });
const LIST_PATH = '/quan-ly-doan-vien';

const ROW_TABS = ['ALL', 'INVALID', 'POSSIBLE_DUPLICATE', 'WARNING'];
const ROW_TAB_LABELS = {
  ALL: 'Tất cả',
  INVALID: 'Lỗi',
  POSSIBLE_DUPLICATE: 'Nghi trùng',
  WARNING: 'Cảnh báo',
};

export function MemberImport() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [job, setJob] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [rows, setRows] = useState([]);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [rowsOffset, setRowsOffset] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('ALL');

  const [overrides, setOverrides] = useState({}); // { [rowNumber]: 'CREATE_NEW' }
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [toast, setToast] = useState(null);

  const loadRows = useCallback((jobId, { tab = activeTab, offset = 0 } = {}) => {
    setRowsLoading(true);
    memberService
      .listImportJobRows(jobId, { limit: 50, offset, rowStatus: tab === 'ALL' ? '' : tab })
      .then((result) => {
        setRows(result.rows);
        setRowsTotal(result.total);
        setRowsOffset(result.offset);
      })
      .catch(() => {
        setRows([]);
      })
      .finally(() => setRowsLoading(false));
  }, [activeTab]);

  const chooseFile = () => fileInputRef.current?.click();

  const onFileSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || uploading) return;

    setUploading(true);
    setUploadError(null);
    setJob(null);
    setRows([]);
    setOverrides({});
    try {
      const result = await memberService.uploadImport(file);
      setJob(result);
      if (result.status === 'READY_FOR_CONFIRM') {
        loadRows(result.id, { tab: 'ALL', offset: 0 });
        setActiveTab('ALL');
      }
    } catch (requestError) {
      setUploadError(requestError);
      // A malformed workbook still creates a traceable FAILED job — surface it if present.
      if (requestError.cause?.import_job_id) {
        setJob({ id: requestError.cause.import_job_id, status: 'FAILED', failureReason: requestError.code });
      }
    } finally {
      setUploading(false);
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    if (job) loadRows(job.id, { tab, offset: 0 });
  };

  const toggleOverride = (rowNumber) => {
    setOverrides((current) => {
      const next = { ...current };
      if (next[rowNumber]) delete next[rowNumber];
      else next[rowNumber] = 'CREATE_NEW';
      return next;
    });
  };

  const rowOverrides = useMemo(
    () => Object.entries(overrides).map(([rowNumber, action]) => ({ row_number: Number(rowNumber), action })),
    [overrides]
  );

  const submitConfirm = async () => {
    if (!job || confirming) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const result = await memberService.confirmImport(job.id, rowOverrides);
      setJob(result);
      setToast(`Đã import xong: ${result.committedCount ?? result.committed_count ?? 0} đoàn viên mới.`);
    } catch (requestError) {
      setConfirmError(requestError);
    } finally {
      setConfirming(false);
    }
  };

  const cancelJob = async () => {
    if (!job || confirming) return;
    setConfirming(true);
    try {
      const result = await memberService.cancelImport(job.id);
      setJob(result);
      setToast('Đã hủy đợt import.');
    } catch (requestError) {
      setConfirmError(requestError);
    } finally {
      setConfirming(false);
    }
  };

  const canConfirm = job?.status === 'READY_FOR_CONFIRM';
  const isDone = job?.status === 'COMMITTED' || job?.status === 'CANCELLED';

  return (
    <div className="page">
      <PageHeader title="Import đoàn viên từ Excel" back={LIST_PATH} navigate={navigate} />

      {!job && (
        <div className="content-card">
          <p>
            Chọn file Excel (.xlsx) có cột tiêu đề <code>full_name</code>, <code>work_unit_code</code> (bắt buộc) và
            các cột tùy chọn: <code>date_of_birth</code>, <code>gender</code>, <code>job_title</code>,{' '}
            <code>member_status</code>, <code>political_theory_level</code>, <code>youth_position</code>,{' '}
            <code>youth_board_position</code>, <code>external_ref_note</code>.
          </p>
          <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={onFileSelected} aria-hidden="true" tabIndex={-1} />
          <Button icon="upload" onClick={chooseFile} disabled={uploading}>
            {uploading ? 'Đang tải lên và kiểm tra…' : 'Chọn file Excel'}
          </Button>
          {uploadError && (
            <p className="form-error" role="alert">{memberErrorMessage(uploadError)}</p>
          )}
        </div>
      )}

      {job && job.status === 'FAILED' && (
        <div className="content-card">
          <div className="doc-tags"><span className={`status status-${importJobStatusTone(job.status)}`}>{IMPORT_JOB_STATUS_LABELS[job.status]}</span></div>
          <p className="form-error" role="alert">{memberErrorMessage({ code: job.failureReason })}</p>
          <Button variant="secondary" onClick={() => { setJob(null); setUploadError(null); }}>Thử lại với file khác</Button>
        </div>
      )}

      {job && job.status !== 'FAILED' && (
        <>
          <div className="content-card">
            <div className="doc-tags">
              <span className={`status status-${importJobStatusTone(job.status)}`}>{IMPORT_JOB_STATUS_LABELS[job.status] ?? job.status}</span>
              {job.sourceFilename && <span>{job.sourceFilename}</span>}
            </div>
            <div className="info-grid">
              <div><span>Tổng số dòng</span><strong>{job.totalRows}</strong></div>
              <div><span>Hợp lệ</span><strong>{job.validRows}</strong></div>
              <div><span>Lỗi</span><strong>{job.invalidRows}</strong></div>
              <div><span>Nghi trùng</span><strong>{job.possibleDuplicateRows}</strong></div>
              <div><span>Cảnh báo</span><strong>{job.warningRows}</strong></div>
              {job.status === 'COMMITTED' && <div><span>Đã tạo mới</span><strong>{job.committedCount}</strong></div>}
            </div>
          </div>

          {!isDone && (
            <>
              <div className="dashboard-filters" style={{ marginTop: 16 }}>
                {ROW_TABS.map((tab) => (
                  <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => switchTab(tab)}>
                    {ROW_TAB_LABELS[tab]}
                  </Button>
                ))}
              </div>

              {rowsLoading && <p>Đang tải…</p>}

              {!rowsLoading && (
                <div className="campaign-list">
                  {rows.map((row) => (
                    <article key={row.rowNumber} className="campaign-list-item">
                      <div>
                        <div className="doc-tags">
                          <span>Dòng #{row.rowNumber}</span>
                          <span className={`status status-${importRowStatusTone(row.rowStatus)}`}>
                            {IMPORT_ROW_STATUS_LABELS[row.rowStatus] ?? row.rowStatus}
                          </span>
                        </div>
                        <h2>{row.normalizedData?.full_name || '(thiếu họ tên)'}</h2>
                        <p>{row.normalizedData?.work_unit_code || '—'}</p>
                        {row.errors.length > 0 && (
                          <p className="form-error">{row.errors.map((e) => e.message).join('; ')}</p>
                        )}
                        {row.duplicateReason && <p>{row.duplicateReason}</p>}
                      </div>
                      {(row.rowStatus === 'POSSIBLE_DUPLICATE' || row.rowStatus === 'WARNING') && (
                        <div className="campaign-list-actions">
                          <label className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={Boolean(overrides[row.rowNumber])}
                              onChange={() => toggleOverride(row.rowNumber)}
                            />
                            Vẫn tạo mới (không gộp vào bản ghi đã có)
                          </label>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}

              {!rowsLoading && rowsOffset + rows.length < rowsTotal && (
                <Button variant="secondary" className="document-load-more" onClick={() => loadRows(job.id, { tab: activeTab, offset: rowsOffset + rows.length })}>
                  Tải thêm
                </Button>
              )}
            </>
          )}

          {confirmError && <p className="form-error" role="alert">{memberErrorMessage(confirmError)}</p>}

          <div className="campaign-form-actions" style={{ marginTop: 20 }}>
            {canConfirm && (
              <>
                <Button onClick={submitConfirm} disabled={confirming}>
                  {confirming ? 'Đang xử lý…' : `Xác nhận import (${job.validRows + rowOverrides.length} dòng)`}
                </Button>
                <Button variant="secondary" onClick={cancelJob} disabled={confirming}>Hủy đợt import</Button>
              </>
            )}
            {isDone && (
              <Button onClick={() => navigate(LIST_PATH)}>Về danh sách đoàn viên</Button>
            )}
          </div>
        </>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
