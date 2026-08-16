import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, EmptyState, PageHeader, Toast } from '../components/common';
import Skeleton from '../components/Skeleton';
import { supabase } from '../services/supabaseClient';
import {
  ALLOWED_SOURCE_EXTENSIONS,
  DOCUMENT_ADMIN_PAGE_SIZE,
  DOCUMENT_STATUSES,
  DOCUMENT_VISIBILITY_LEVELS,
  createDocumentAdminService,
  validateDocumentForm
} from '../services/documentAdminService';
import {
  DOCUMENT_STATUS_LABELS,
  VISIBILITY_LABELS,
  adminErrorMessage,
  documentStatusTone
} from '../lib/documentAdminDisplay.mjs';
import { formatDocumentDate } from '../lib/documentDisplay.mjs';

const adminService = createDocumentAdminService(supabase);

const EMPTY_FORM = {
  title: '',
  documentNumber: '',
  documentType: '',
  issuingAuthority: '',
  issuedDate: '',
  effectiveDate: '',
  expiryDate: '',
  effectStatus: '',
  scope: '',
  summary: '',
  keywords: '',
  visibilityLevel: 'INTERNAL_YOUTH',
  sourceUrl: ''
};

function toForm(doc) {
  return {
    title: doc.title ?? '',
    documentNumber: doc.documentNumber ?? '',
    documentType: doc.documentType ?? '',
    issuingAuthority: doc.issuingAuthority ?? '',
    issuedDate: doc.issuedDate ?? '',
    effectiveDate: doc.effectiveDate ?? '',
    expiryDate: doc.expiryDate ?? '',
    effectStatus: doc.effectStatus ?? '',
    scope: doc.scope ?? '',
    summary: doc.summary ?? '',
    keywords: (doc.keywords ?? []).join(', '),
    visibilityLevel: doc.visibilityLevel ?? 'INTERNAL_YOUTH',
    sourceUrl: doc.sourceUrl ?? ''
  };
}

function ConfirmDialog({ title, description, confirmLabel, busy, onConfirm, onCancel }) {
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="confirm-dialog">
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="campaign-form-actions">
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? 'Đang xử lý…' : confirmLabel}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Hủy</Button>
        </div>
      </div>
    </div>
  );
}

export function AdminDocuments() {
  const [documents, setDocuments] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');

  const [editing, setEditing] = useState(null); // null | 'new' | document id
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [confirm, setConfirm] = useState(null); // {kind, document}
  const [actionBusy, setActionBusy] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const fileInputRef = useRef(null);
  const uploadTargetRef = useRef(null);

  const loadPage = useCallback((targetPage) => {
    let mounted = true;
    if (targetPage === 0) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    adminService
      .listDocuments({
        page: targetPage,
        pageSize: DOCUMENT_ADMIN_PAGE_SIZE,
        search,
        status: statusFilter,
        visibilityLevel: visibilityFilter,
        year: yearFilter
      })
      .then((result) => {
        if (!mounted) return;
        setDocuments((previous) => (targetPage === 0 ? result.items : [...previous, ...result.items]));
        setTotal(result.total);
        setHasMore(result.hasMore);
        setPage(targetPage);
      })
      .catch((requestError) => {
        if (mounted) setError(requestError);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
        setLoadingMore(false);
      });

    return () => {
      mounted = false;
    };
  }, [search, statusFilter, visibilityFilter, yearFilter]);

  // Deferred so the effect body performs no synchronous setState (project lint rule).
  useEffect(() => {
    let cleanup;
    const timer = setTimeout(() => {
      cleanup = loadPage(0);
    }, 0);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [loadPage]);

  const openCreate = () => {
    setEditing('new');
    setForm(EMPTY_FORM);
    setFormErrors({});
    setFormError(null);
  };

  const openEdit = (doc) => {
    setEditing(doc.id);
    setForm(toForm(doc));
    setFormErrors({});
    setFormError(null);
  };

  const closeForm = () => {
    setEditing(null);
    setFormErrors({});
    setFormError(null);
  };

  const submitForm = async (event) => {
    event.preventDefault();
    if (saving) return; // duplicate-submit guard

    const errors = validateDocumentForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setFormError(null);
    try {
      if (editing === 'new') {
        await adminService.createDraft(form);
        setToast('Đã tạo bản nháp văn bản.');
      } else {
        await adminService.updateMetadata(editing, form);
        setToast('Đã cập nhật thông tin văn bản.');
      }
      closeForm();
      loadPage(0);
    } catch (requestError) {
      setFormError(requestError);
    } finally {
      setSaving(false);
    }
  };

  const chooseFile = (doc) => {
    uploadTargetRef.current = doc;
    fileInputRef.current?.click();
  };

  const onFileSelected = async (event) => {
    const file = event.target.files?.[0];
    const doc = uploadTargetRef.current;
    event.target.value = ''; // allow re-choosing the same file after an error
    if (!file || !doc || uploadingId) return;

    setUploadingId(doc.id);
    setError(null);
    try {
      await adminService.uploadSourceFile(doc.id, file);
      setToast('Đã đính kèm tệp gốc.');
      loadPage(0);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setUploadingId(null);
      uploadTargetRef.current = null;
    }
  };

  const runConfirmedAction = async () => {
    if (!confirm || actionBusy) return;
    setActionBusy(true);
    setError(null);
    try {
      if (confirm.kind === 'publish') {
        await adminService.publish(confirm.document.id);
        setToast('Đã phát hành văn bản.');
      } else if (confirm.kind === 'withdraw') {
        await adminService.withdraw(confirm.document.id, 'Thu hồi từ trang quản trị');
        setToast('Đã thu hồi văn bản.');
      }
      setConfirm(null);
      loadPage(0);
    } catch (requestError) {
      setConfirm(null);
      setError(requestError);
    } finally {
      setActionBusy(false);
    }
  };

  const submitSearch = (event) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  return (
    <div className="page admin-reports-page">
      <PageHeader
        title="Quản trị văn bản"
        subtitle={total ? `${total} văn bản trong phạm vi quản lý` : undefined}
        action={<Button icon="file" onClick={openCreate}>Tạo văn bản</Button>}
      />

      <div className="document-controls">
        <form className="dashboard-search" onSubmit={submitSearch} role="search">
          <label htmlFor="admin-doc-search">Tìm kiếm</label>
          <input
            id="admin-doc-search"
            type="search"
            placeholder="Tên hoặc số ký hiệu"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Button type="submit" icon="search" variant="secondary">Tìm</Button>
        </form>

        <div className="dashboard-filters">
          <label htmlFor="admin-doc-status">
            Trạng thái
            <select id="admin-doc-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Tất cả trạng thái</option>
              {DOCUMENT_STATUSES.map((value) => (
                <option key={value} value={value}>{DOCUMENT_STATUS_LABELS[value] ?? value}</option>
              ))}
            </select>
          </label>
          <label htmlFor="admin-doc-visibility">
            Mức hiển thị
            <select id="admin-doc-visibility" value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value)}>
              <option value="">Tất cả mức</option>
              {DOCUMENT_VISIBILITY_LEVELS.map((value) => (
                <option key={value} value={value}>{VISIBILITY_LABELS[value] ?? value}</option>
              ))}
            </select>
          </label>
          <label htmlFor="admin-doc-year">
            Năm ban hành
            <input
              id="admin-doc-year"
              type="number"
              min="1900"
              max="2200"
              placeholder="VD: 2026"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            />
          </label>
        </div>
      </div>

      {editing && (
        <form className="campaign-form" onSubmit={submitForm} noValidate>
          <fieldset>
            <legend>{editing === 'new' ? 'Tạo văn bản mới' : 'Cập nhật thông tin văn bản'}</legend>

            <label htmlFor="doc-title">
              Tên văn bản *
              <input
                id="doc-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                aria-invalid={Boolean(formErrors.title)}
              />
            </label>
            {formErrors.title && <p className="form-error">{formErrors.title}</p>}

            <div className="campaign-form-grid">
              <label htmlFor="doc-number">
                Số ký hiệu
                <input id="doc-number" value={form.documentNumber}
                  onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} />
              </label>
              <label htmlFor="doc-type">
                Loại văn bản
                <input id="doc-type" value={form.documentType}
                  onChange={(e) => setForm({ ...form, documentType: e.target.value })} />
              </label>
              <label htmlFor="doc-authority">
                Cơ quan ban hành
                <input id="doc-authority" value={form.issuingAuthority}
                  onChange={(e) => setForm({ ...form, issuingAuthority: e.target.value })} />
              </label>
            </div>

            <div className="campaign-form-grid">
              <label htmlFor="doc-issued">
                Ngày ban hành
                <input id="doc-issued" type="date" value={form.issuedDate}
                  onChange={(e) => setForm({ ...form, issuedDate: e.target.value })} />
              </label>
              <label htmlFor="doc-effective">
                Ngày hiệu lực
                <input id="doc-effective" type="date" value={form.effectiveDate}
                  onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
              </label>
              <label htmlFor="doc-expiry">
                Ngày hết hiệu lực
                <input id="doc-expiry" type="date" value={form.expiryDate}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                  aria-invalid={Boolean(formErrors.expiryDate)} />
              </label>
            </div>
            {formErrors.expiryDate && <p className="form-error">{formErrors.expiryDate}</p>}

            <div className="campaign-form-grid">
              <label htmlFor="doc-visibility">
                Mức hiển thị
                <select id="doc-visibility" value={form.visibilityLevel}
                  onChange={(e) => setForm({ ...form, visibilityLevel: e.target.value })}>
                  {DOCUMENT_VISIBILITY_LEVELS.map((value) => (
                    <option key={value} value={value}>{VISIBILITY_LABELS[value] ?? value}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="doc-effect-status">
                Tình trạng hiệu lực
                <input id="doc-effect-status" value={form.effectStatus}
                  onChange={(e) => setForm({ ...form, effectStatus: e.target.value })} />
              </label>
              <label htmlFor="doc-scope">
                Phạm vi
                <input id="doc-scope" value={form.scope}
                  onChange={(e) => setForm({ ...form, scope: e.target.value })} />
              </label>
            </div>

            <label htmlFor="doc-keywords">
              Từ khóa (phân tách bằng dấu phẩy)
              <input id="doc-keywords" value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
            </label>

            <label htmlFor="doc-source-url">
              Liên kết nguồn công bố
              <input id="doc-source-url" value={form.sourceUrl}
                onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
                aria-invalid={Boolean(formErrors.sourceUrl)} />
            </label>
            {formErrors.sourceUrl && <p className="form-error">{formErrors.sourceUrl}</p>}

            <label htmlFor="doc-summary">
              Tóm tắt
              <textarea id="doc-summary" value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </label>

            {formError && <p className="form-error" role="alert">{adminErrorMessage(formError)}</p>}

            <div className="campaign-form-actions">
              <Button type="submit" disabled={saving}>
                {saving ? 'Đang lưu…' : editing === 'new' ? 'Tạo bản nháp' : 'Lưu thay đổi'}
              </Button>
              <Button variant="secondary" onClick={closeForm} disabled={saving}>Hủy</Button>
            </div>
          </fieldset>
        </form>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_SOURCE_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
        style={{ display: 'none' }}
        onChange={onFileSelected}
        aria-hidden="true"
        tabIndex={-1}
      />

      {loading && <Skeleton lines={6} />}

      {!loading && error && (
        <div className="form-error" role="alert">
          <p>{adminErrorMessage(error)}</p>
          <Button variant="secondary" onClick={() => loadPage(0)}>Thử lại</Button>
        </div>
      )}

      {!loading && !error && documents.length === 0 && (
        <EmptyState
          icon="file"
          title="Chưa có văn bản"
          description="Chưa có văn bản nào trong phạm vi quản lý của bạn."
          action="Tạo văn bản"
          onAction={openCreate}
        />
      )}

      {!loading && !error && documents.length > 0 && (
        <div className="campaign-list">
          {documents.map((doc) => (
            <article key={doc.id} className="campaign-list-item">
              <div>
                <div className="doc-tags">
                  {doc.documentNumber && <span>{doc.documentNumber}</span>}
                  <span className={`status status-${documentStatusTone(doc.status)}`}>
                    {DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status}
                  </span>
                  <span className="status status-neutral">
                    {VISIBILITY_LABELS[doc.visibilityLevel] ?? doc.visibilityLevel}
                  </span>
                </div>
                <h2>{doc.title}</h2>
                <p>
                  {doc.issuingAuthority || '—'} • {formatDocumentDate(doc.issuedDate)}
                  {doc.hasSourceFile ? ' • Đã có tệp gốc' : ' • Chưa có tệp gốc'}
                </p>
              </div>
              <div className="campaign-list-actions">
                <Button variant="secondary" onClick={() => openEdit(doc)}>Sửa</Button>
                <Button
                  variant="secondary"
                  onClick={() => chooseFile(doc)}
                  disabled={uploadingId === doc.id}
                >
                  {uploadingId === doc.id
                    ? 'Đang tải lên…'
                    : doc.hasSourceFile ? 'Thay tệp gốc' : 'Tải tệp gốc'}
                </Button>
                {doc.status !== 'PUBLISHED' && (
                  <Button onClick={() => setConfirm({ kind: 'publish', document: doc })}>
                    Phát hành
                  </Button>
                )}
                {doc.status === 'PUBLISHED' && (
                  <Button variant="secondary" onClick={() => setConfirm({ kind: 'withdraw', document: doc })}>
                    Thu hồi
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && !error && hasMore && (
        <Button variant="secondary" className="document-load-more" disabled={loadingMore}
          onClick={() => loadPage(page + 1)}>
          {loadingMore ? 'Đang tải…' : 'Tải thêm'}
        </Button>
      )}

      {confirm?.kind === 'publish' && (
        <ConfirmDialog
          title="Phát hành văn bản"
          description={`Phát hành “${confirm.document.title}”? Sau khi phát hành, người dùng trong phạm vi hiển thị sẽ đọc được văn bản này.`}
          confirmLabel="Phát hành"
          busy={actionBusy}
          onConfirm={runConfirmedAction}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'withdraw' && (
        <ConfirmDialog
          title="Thu hồi văn bản"
          description={`Thu hồi “${confirm.document.title}”? Người dùng sẽ không còn đọc được văn bản này.`}
          confirmLabel="Thu hồi"
          busy={actionBusy}
          onConfirm={runConfirmedAction}
          onCancel={() => setConfirm(null)}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
