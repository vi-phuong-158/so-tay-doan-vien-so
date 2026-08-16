import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHeader, EmptyState } from '../components/common';
import Skeleton from '../components/Skeleton';
import { DocumentCard } from './Documents';
import { TopicCard } from './LearningTopics';
import { createDocumentService } from '../services/documentService';
import { createLearningService } from '../services/learningService';
import { supabase } from '../services/supabaseClient';
import { documentErrorMessage } from '../lib/documentDisplay.mjs';
import { learningErrorMessage } from '../lib/learningDisplay.mjs';

const documentService = createDocumentService(supabase);
const learningService = createLearningService(supabase);
const PREVIEW_SIZE = 5;

export function Knowledge() {
  const [activeTab, setActiveTab] = useState('docs');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [topics, setTopics] = useState([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [topicsError, setTopicsError] = useState(null);

  // P4-01 wired the Văn bản tab to real data; P4-03 does the same for Chuyên đề học tập.
  // Quiz/AI/Innovation mocks elsewhere are deliberately untouched.
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

  const loadTopicsPreview = useCallback(() => {
    let mounted = true;
    setTopicsLoading(true);
    setTopicsError(null);

    learningService
      .listTopics({ page: 0, pageSize: PREVIEW_SIZE })
      .then((result) => {
        if (mounted) setTopics(result.items);
      })
      .catch((requestError) => {
        if (mounted) setTopicsError(requestError);
      })
      .finally(() => {
        if (mounted) setTopicsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cleanup;
    const timer = setTimeout(() => {
      cleanup = loadTopicsPreview();
    }, 0);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [loadTopicsPreview]);

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
            {topicsLoading && <Skeleton lines={5} />}

            {!topicsLoading && topicsError && (
              <div className="form-error" role="alert">
                <p>{learningErrorMessage(topicsError)}</p>
                <Link className="button button-secondary" to="/tri-thuc/chuyen-de">
                  Mở danh sách chuyên đề
                </Link>
              </div>
            )}

            {!topicsLoading && !topicsError && topics.length === 0 && (
              <EmptyState
                icon="book"
                title="Chưa có chuyên đề"
                description="Chưa có chuyên đề học tập nào được công bố cho tài khoản của bạn."
              />
            )}

            {!topicsLoading && !topicsError && topics.map((topic) => (
              <TopicCard key={topic.id} topic={topic} />
            ))}

            {!topicsLoading && !topicsError && topics.length > 0 && (
              <Link className="button button-secondary" to="/tri-thuc/chuyen-de">
                Xem tất cả chuyên đề
              </Link>
            )}
          </div>
        )}
      </div>
      <button className="fab" aria-label="Hỏi AI"><Icon name="sparkles" size={24} /></button>
    </div>
  );
}
