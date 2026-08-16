import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Button, EmptyState, PageHeader } from '../components/common';
import Skeleton from '../components/Skeleton';
import { createLearningService, LEARNING_PAGE_SIZE, topicAvailability } from '../services/learningService';
import { supabase } from '../services/supabaseClient';
import {
  AVAILABILITY_LABELS,
  availabilityTone,
  availabilityWindowLabel,
  learningErrorMessage
} from '../lib/learningDisplay.mjs';

const learningService = createLearningService(supabase);

export function TopicCard({ topic }) {
  const availability = topicAvailability(topic);
  return (
    <Link
      className="document-card"
      to={`/tri-thuc/chuyen-de/${topic.id}`}
      aria-label={`Mở chuyên đề ${topic.title}`}
    >
      <div className="doc-icon"><Icon name="book" /></div>
      <div>
        <div className="doc-tags">
          <span>{availabilityWindowLabel(topic)}</span>
        </div>
        <h3>{topic.title}</h3>
        {topic.description && <p>{topic.description}</p>}
      </div>
      <span className={`status status-${availabilityTone(availability)}`}>
        {AVAILABILITY_LABELS[availability]}
      </span>
    </Link>
  );
}

export function LearningTopics() {
  const [topics, setTopics] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const loadPage = useCallback((targetPage) => {
    let mounted = true;
    if (targetPage === 0) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    learningService
      .listTopics({ page: targetPage, pageSize: LEARNING_PAGE_SIZE, search })
      .then((result) => {
        if (!mounted) return;
        setTopics((previous) => (targetPage === 0 ? result.items : [...previous, ...result.items]));
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
  }, [search]);

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

  const submitSearch = (event) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  return (
    <div className="page">
      <PageHeader
        title="Chuyên đề học tập"
        subtitle={total ? `${total} chuyên đề` : undefined}
      />

      <div className="document-controls">
        <form className="dashboard-search" onSubmit={submitSearch} role="search">
          <label htmlFor="topic-search">Tìm kiếm chuyên đề</label>
          <input
            id="topic-search"
            type="search"
            placeholder="Tìm theo tên chuyên đề"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <Button type="submit" icon="search" variant="secondary">Tìm</Button>
        </form>
      </div>

      <div className="document-body">
        {loading && <Skeleton lines={6} />}

        {!loading && error && (
          <div className="form-error" role="alert">
            <p>{learningErrorMessage(error)}</p>
            <Button variant="secondary" onClick={() => loadPage(0)}>Thử lại</Button>
          </div>
        )}

        {!loading && !error && topics.length === 0 && (
          <EmptyState
            icon="book"
            title="Chưa có chuyên đề"
            description="Chưa có chuyên đề học tập nào được công bố cho tài khoản của bạn."
          />
        )}

        {!loading && !error && topics.length > 0 && (
          <>
            <div className="document-list">
              {topics.map((topic) => <TopicCard key={topic.id} topic={topic} />)}
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
