import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Button, PageHeader } from '../components/common';
import Skeleton from '../components/Skeleton';
import { createDocumentService } from '../services/documentService';
import { supabase } from '../services/supabaseClient';
import {
  canDownloadSource,
  documentErrorMessage,
  effectStatusTone,
  formatDocumentDate,
  relationLabel
} from '../lib/documentDisplay.mjs';

const documentService = createDocumentService(supabase);
const LIST_PATH = '/tri-thuc/van-ban';

function MetaRow({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function DocumentDetail() {
  const { documentId } = useParams();
  const navigate = useNavigate();

  const [document, setDocument] = useState(null);
  const [relations, setRelations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  const loadDocument = useCallback(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    documentService
      .getDocument(documentId)
      .then((result) => {
        if (!mounted) return undefined;
        setDocument(result);
        // Relations are secondary: a failure here must not hide the document itself.
        return documentService
          .getDocumentRelations(documentId)
          .then((rows) => {
            if (mounted) setRelations(rows);
          })
          .catch(() => {
            if (mounted) setRelations([]);
          });
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
  }, [documentId]);

  useEffect(() => {
    let cleanup;
    const timer = setTimeout(() => {
      cleanup = loadDocument();
    }, 0);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [loadDocument]);

  // The signed URL is requested only here, in response to an explicit click — never during
  // load — and it is neither persisted nor logged.
  const handleDownload = async () => {
    if (!canDownloadSource(document) || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const url = await documentService.getDocumentDownloadUrl(document.storagePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (requestError) {
      setDownloadError(requestError);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <PageHeader title="Văn bản" back={LIST_PATH} navigate={navigate} />
        <Skeleton lines={8} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <PageHeader title="Văn bản" back={LIST_PATH} navigate={navigate} />
        <div className="form-error" role="alert">
          <p>{documentErrorMessage(error)}</p>
          <div className="campaign-form-actions">
            <Button variant="secondary" onClick={loadDocument}>Thử lại</Button>
            <Link className="button button-secondary" to={LIST_PATH}>Về danh sách</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!document) return null;

  return (
    <div className="page">
      <PageHeader title="Chi tiết văn bản" back={LIST_PATH} navigate={navigate} />

      <div className="document-detail">
        <div className="document-cover">
          <Icon name="file" size={26} />
          <span>{document.documentType || 'Văn bản'}</span>
        </div>
        <div>
          <div className="doc-tags">
            {document.documentNumber && <span>{document.documentNumber}</span>}
            <span className={`status status-${effectStatusTone(document.effectStatus)}`}>
              {document.effectStatus}
            </span>
          </div>
          <h2>{document.title}</h2>
          <p>{document.issuingAuthority || '—'}</p>
        </div>
      </div>

      <div className="content-card">
        <div className="info-grid">
          <MetaRow label="Ngày ban hành" value={formatDocumentDate(document.issuedDate)} />
          <MetaRow label="Ngày hiệu lực" value={formatDocumentDate(document.effectiveDate)} />
          {document.expiryDate && (
            <MetaRow label="Hết hiệu lực" value={formatDocumentDate(document.expiryDate)} />
          )}
          <MetaRow label="Phạm vi" value={document.scope} />
        </div>

        {document.summary && (
          <>
            <h3>Tóm tắt</h3>
            <p>{document.summary}</p>
          </>
        )}

        {document.keywords.length > 0 && (
          <div className="chip-row" aria-label="Từ khóa">
            {document.keywords.map((keyword) => (
              <button key={keyword} type="button" disabled>{keyword}</button>
            ))}
          </div>
        )}

        <div className="campaign-form-actions">
          {canDownloadSource(document) && (
            <Button icon="file" onClick={handleDownload} disabled={downloading}>
              {downloading ? 'Đang tạo liên kết…' : 'Tải văn bản gốc'}
            </Button>
          )}
          {document.sourceUrl && (
            <a
              className="button button-secondary"
              href={document.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Nguồn công bố
            </a>
          )}
        </div>

        {downloadError && (
          <p className="form-error" role="alert">{documentErrorMessage(downloadError)}</p>
        )}
      </div>

      {relations.length > 0 && (
        <>
          <div className="section-header"><h2>Văn bản liên quan</h2></div>
          <div className="document-list">
            {relations.map(({ relationType, document: related }) => (
              <Link
                key={`${relationType}-${related.id}`}
                className="document-card"
                to={`${LIST_PATH}/${related.id}`}
              >
                <div className="doc-icon"><Icon name="file" /></div>
                <div>
                  <div className="doc-tags"><span>{relationLabel(relationType)}</span></div>
                  <h3>{related.title}</h3>
                  <p>{related.documentNumber || '—'} • {formatDocumentDate(related.issuedDate)}</p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
