import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHeader, EmptyState } from '../components/common';
import Skeleton from '../components/Skeleton';
import { DocumentCard } from './Documents';
import { TopicCard } from './LearningTopics';
import { createDocumentService } from '../services/documentService';
import { createLearningService } from '../services/learningService';
import { createQuizService } from '../services/quizService';
import { supabase } from '../services/supabaseClient';
import { documentErrorMessage, formatDocumentDate } from '../lib/documentDisplay.mjs';
import { learningErrorMessage } from '../lib/learningDisplay.mjs';

const documentService = createDocumentService(supabase);
const learningService = createLearningService(supabase);
const quizService = createQuizService(supabase);
const PREVIEW_SIZE = 5;

export function Knowledge() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('docs');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [topics, setTopics] = useState([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [topicsError, setTopicsError] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [quizzesLoading, setQuizzesLoading] = useState(false);
  const [quizzesError, setQuizzesError] = useState(null);

  // Văn bản, chuyên đề và quiz preview đều dùng service read-only hiện có.
  // AI và đổi mới tiếp tục dùng các route/service hiện hữu.
  const loadPreview = useCallback(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    documentService
      .listDocuments({ page: 0, pageSize: PREVIEW_SIZE, search })
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
  }, [search]);

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

  const loadQuizPreview = useCallback(() => {
    let mounted = true;
    setQuizzesLoading(true);
    setQuizzesError(null);

    Promise.all(topics.map(async (topic) => (
      await quizService.listQuizzes(topic.id)
    ).map((quiz) => ({ ...quiz, topicTitle: topic.title }))))
      .then((results) => {
        if (mounted) setQuizzes(results.flat());
      })
      .catch(() => {
        if (mounted) setQuizzesError(true);
      })
      .finally(() => {
        if (mounted) setQuizzesLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [topics]);

  useEffect(() => {
    if (activeTab !== 'quizzes') return undefined;
    let cleanup;
    const timer = setTimeout(() => {
      cleanup = loadQuizPreview();
    }, 0);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [activeTab, loadQuizPreview]);

  function submitSearch(event) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setActiveTab('docs');
  }

  return (
    <div className="page page--appbar knowledge-page">
      <PageHeader title="Tri thức & Văn bản" variant="brand" />
      <div className="knowledge-search-row">
        <form className="knowledge-search" onSubmit={submitSearch} role="search">
          <Icon name="search" size={18} />
          <input
            aria-label="Tìm văn bản hoặc chuyên đề"
            type="search"
            placeholder="Tìm văn bản, chuyên đề..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button type="submit" aria-label="Tìm kiếm"><Icon name="arrow" size={18} /></button>
        </form>
        <button type="button" className="knowledge-filter" aria-label="Mở bộ lọc văn bản" onClick={() => navigate('/tri-thuc/van-ban')}>
          <Icon name="filter" size={19} />
        </button>
      </div>
      <div className="tabs knowledge-tabs" role="tablist" aria-label="Khu vực tri thức">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'docs'}
          className={`tab ${activeTab === 'docs' ? 'active' : ''}`}
          onClick={() => setActiveTab('docs')}
        >
          Văn bản
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'topics'}
          className={`tab ${activeTab === 'topics' ? 'active' : ''}`}
          onClick={() => setActiveTab('topics')}
        >
          Chuyên đề
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'quizzes'}
          className={`tab ${activeTab === 'quizzes' ? 'active' : ''}`}
          onClick={() => setActiveTab('quizzes')}
        >
          Trắc nghiệm
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

            {!loading && !error && documents.length > 0 && (
              <div className="featured-document">
                <div className="featured-document-head">
                  <span className="featured-document-code">
                    {documents[0].documentNumber || documents[0].documentType} · {formatDocumentDate(documents[0].issuedDate)}
                  </span>
                  <span className="featured-document-badge">MỚI BAN HÀNH</span>
                </div>
                <h3>{documents[0].title}</h3>
                <p>{documents[0].issuingAuthority || '—'}</p>
                <div className="featured-document-actions">
                  <Link className="primary" to="/tri-thuc/hoi-ai"><Icon name="sparkles" size={15} />Hỏi AI về văn bản</Link>
                  <Link className="secondary" to={`/tri-thuc/van-ban/${documents[0].id}`}>Xem văn bản</Link>
                </div>
              </div>
            )}

            {!loading && !error && documents.length > 1 && (
              <div className="document-list">
                {documents.slice(1).map((item) => (
                  <DocumentCard key={item.id} item={item} />
                ))}
              </div>
            )}

            {!loading && !error && documents.length > 0 && (
              <Link className="button button-secondary" to="/tri-thuc/van-ban">
                Xem tất cả văn bản
              </Link>
            )}
          </div>
        ) : activeTab === 'topics' ? (
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
        ) : (
          <div className="knowledge-quiz-list">
            {quizzesLoading && <Skeleton lines={3} />}
            {!quizzesLoading && quizzesError && (
              <EmptyState icon="alert" title="Không thể tải trắc nghiệm" description="Vui lòng thử lại sau." action="Thử lại" onAction={loadQuizPreview} />
            )}
            {!quizzesLoading && !quizzesError && quizzes.length === 0 && (
              <EmptyState icon="check" title="Chưa có bài trắc nghiệm" description="Các bài kiểm tra sẽ xuất hiện khi có chuyên đề được mở." />
            )}
            {!quizzesLoading && !quizzesError && quizzes.map((quiz) => (
              <Link className="knowledge-quiz-row" key={quiz.id} to={`/tri-thuc/trac-nghiem/${quiz.id}`}>
                <span><Icon name="check" size={19} /></span>
                <div><strong>{quiz.title}</strong><small>{quiz.topicTitle}{quiz.timeLimitMinutes ? ` · ${quiz.timeLimitMinutes} phút` : ''}</small></div>
                <Icon name="chevron-right" size={18} />
              </Link>
            ))}
          </div>
        )}
      </div>
      <Link className="fab" aria-label="Hỏi AI" to="/tri-thuc/hoi-ai"><Icon name="sparkles" size={20} /><span>Hỏi AI</span></Link>
    </div>
  );
}
