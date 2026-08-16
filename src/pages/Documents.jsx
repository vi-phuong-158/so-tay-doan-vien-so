import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Button, EmptyState, PageHeader } from '../components/common';
import Skeleton from '../components/Skeleton';
import { createDocumentService, DOCUMENT_PAGE_SIZE } from '../services/documentService';
import { supabase } from '../services/supabaseClient';
import {
  documentErrorMessage,
  effectStatusTone,
  EFFECT_FILTER_LABELS,
  formatDocumentDate
} from '../lib/documentDisplay.mjs';

const documentService = createDocumentService(supabase);

export function DocumentCard({ item }) {
  return (
    <Link
      className="document-card"
      to={`/tri-thuc/van-ban/${item.id}`}
      aria-label={`Mở văn bản ${item.title}`}
    >
      <div className="doc-icon"><Icon name="file" /></div>
      <div>
        <div className="doc-tags">
          {item.documentType && <span>{item.documentType}</span>}
          {item.documentNumber && <b>{item.documentNumber}</b>}
        </div>
        <h3>{item.title}</h3>
        <p>{item.issuingAuthority || '—'} • {formatDocumentDate(item.issuedDate)}</p>
      </div>
      <span className={`status status-${effectStatusTone(item.effectStatus)}`}>
        {item.effectStatus}
      </span>
    </Link>
  );
}

export function Documents() {
  const [documents, setDocuments] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [year, setYear] = useState('');
  const [effect, setEffect] = useState('ALL');
  const [options, setOptions] = useState({ documentTypes: [], issuingAuthorities: [], years: [] });

  // Any filter change resets to the first page: keeping the old offset would silently skip rows.
  const loadPage = useCallback((targetPage) => {
    let mounted = true;
    if (targetPage === 0) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    documentService
      .listDocuments({
        page: targetPage,
        pageSize: DOCUMENT_PAGE_SIZE,
        search,
        documentType,
        issuingAuthority,
        year,
        effect
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
  }, [search, documentType, issuingAuthority, year, effect]);

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

  useEffect(() => {
    let mounted = true;
    documentService
      .getFilterOptions()
      .then((result) => {
        if (mounted) setOptions(result);
      })
      // Filter options are a convenience: if they fail the list must still work, so this
      // failure is intentionally not promoted into the page-level error state.
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const submitSearch = (event) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  return (
    <div className="page">
      <PageHeader title="Văn bản, biểu mẫu" subtitle={total ? `${total} văn bản` : undefined} />

      <div className="document-controls">
        <form className="dashboard-search" onSubmit={submitSearch} role="search">
          <label htmlFor="document-search">Tìm kiếm văn bản</label>
          <input
            id="document-search"
            type="search"
            placeholder="Tìm theo tên hoặc số ký hiệu"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <Button type="submit" icon="search" variant="secondary">Tìm</Button>
        </form>

        <div className="chip-row" role="group" aria-label="Lọc theo trạng thái hiệu lực">
          {Object.entries(EFFECT_FILTER_LABELS).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={effect === value ? 'active' : ''}
              aria-pressed={effect === value}
              onClick={() => setEffect(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="dashboard-filters">
          <label htmlFor="filter-type">
            Loại văn bản
            <select id="filter-type" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
              <option value="">Tất cả loại</option>
              {options.documentTypes.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label htmlFor="filter-authority">
            Cơ quan ban hành
            <select id="filter-authority" value={issuingAuthority} onChange={(e) => setIssuingAuthority(e.target.value)}>
              <option value="">Tất cả cơ quan</option>
              {options.issuingAuthorities.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label htmlFor="filter-year">
            Năm ban hành
            <select id="filter-year" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">Tất cả năm</option>
              {options.years.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="document-body">
        {loading && <Skeleton lines={6} />}

        {!loading && error && (
          <div className="form-error" role="alert">
            <p>{documentErrorMessage(error)}</p>
            <Button variant="secondary" onClick={() => loadPage(0)}>Thử lại</Button>
          </div>
        )}

        {!loading && !error && documents.length === 0 && (
          <EmptyState
            icon="file"
            title="Chưa có văn bản"
            description="Không tìm thấy văn bản phù hợp với bộ lọc hiện tại."
          />
        )}

        {!loading && !error && documents.length > 0 && (
          <>
            <div className="document-list">
              {documents.map((item) => <DocumentCard key={item.id} item={item} />)}
            </div>
            {hasMore && (
              <Button
                variant="secondary"
                className="document-load-more"
                disabled={loadingMore}
                onClick={() => loadPage(page + 1)}
              >
                {loadingMore ? 'Đang tải…' : 'Tải thêm'}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
