import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHeader, EmptyState } from '../components/common';
import Skeleton from '../components/Skeleton';
import { DocumentCard } from './Documents';
import { createDocumentService } from '../services/documentService';
import { supabase } from '../services/supabaseClient';
import { documentErrorMessage } from '../lib/documentDisplay.mjs';
import { topics } from '../data/mock';

const documentService = createDocumentService(supabase);
const PREVIEW_SIZE = 5;

export function Knowledge() {
  const [activeTab, setActiveTab] = useState('docs');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // P4-01: the Văn bản tab reads real data. Chuyên đề học tập (topics) is still demo data —
  // Learning Topics is Phase 4's next slice and deliberately out of scope here.
  const loadPreview = useCallback(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    documentService
      .listDocuments({ page: 0, pageSize: PREVIEW_SIZE })
      .then((result) => {
        if (mounted) setDocuments(result.items);
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

  // Deferred so the effect body performs no synchronous setState (project lint rule).
  useEffect(() => {
    let cleanup;
    const timer = setTimeout(() => {
      cleanup = loadPreview();
    }, 0);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [loadPreview]);

  return (
    <div className="page">
      <PageHeader title="Tri thức & Văn bản" />
      <div className="tabs" role="tablist" aria-label="Khu vực tri thức">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'docs'}
          className={`tab ${activeTab === 'docs' ? 'active' : ''}`}
          onClick={() => setActiveTab('docs')}
        >
          Văn bản, biểu mẫu
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'topics'}
          className={`tab ${activeTab === 'topics' ? 'active' : ''}`}
          onClick={() => setActiveTab('topics')}
        >
          Chuyên đề học tập
        </button>
      </div>

      <div className="document-body">
        {activeTab === 'docs' ? (
          <div className="document-list">
            {loading && <Skeleton lines={5} />}

            {!loading && error && (
              <div className="form-error" role="alert">
                <p>{documentErrorMessage(error)}</p>
                <Link className="button button-secondary" to="/tri-thuc/van-ban">
                  Mở danh sách văn bản
                </Link>
              </div>
            )}

            {!loading && !error && documents.length === 0 && (
              <EmptyState
                icon="file"
                title="Chưa có văn bản"
                description="Chưa có văn bản nào được công bố cho tài khoản của bạn."
              />
            )}

            {!loading && !error && documents.map((item) => (
              <DocumentCard key={item.id} item={item} />
            ))}

            {!loading && !error && documents.length > 0 && (
              <Link className="button button-secondary" to="/tri-thuc/van-ban">
                Xem tất cả văn bản
              </Link>
            )}
          </div>
        ) : (
          <div className="document-list">
            {topics.map(t => (
              <div key={t.id} className="content-card">
                <div className="card-header">
                  <h3>{t.title}</h3>
                  <span className={`status ${t.status === 'Hoàn thành' ? 'status-success' : t.status === 'Đang học' ? 'status-info' : 'status-neutral'}`}>{t.status}</span>
                </div>
                <div className="card-meta"><span><Icon name="clock" size={15}/>{t.duration}</span><span><Icon name="file" size={15}/>{t.resources} tài liệu</span></div>
                <div className="progress"><span style={{width: `${t.progress}%`}}></span></div>
              </div>
            ))}
          </div>
        )}
      </div>
      <button className="fab" aria-label="Hỏi AI"><Icon name="sparkles" size={24} /></button>
    </div>
  );
}
