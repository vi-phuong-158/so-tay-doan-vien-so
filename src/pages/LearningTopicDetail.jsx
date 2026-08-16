import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Button, PageHeader } from '../components/common';
import Skeleton from '../components/Skeleton';
import { createLearningService, topicAvailability } from '../services/learningService';
import { supabase } from '../services/supabaseClient';
import {
  AVAILABILITY_LABELS,
  availabilityTone,
  availabilityWindowLabel,
  learningErrorMessage,
  resourceActions,
  resourceTypeIcon,
  resourceTypeLabel
} from '../lib/learningDisplay.mjs';

const learningService = createLearningService(supabase);
const LIST_PATH = '/tri-thuc/chuyen-de';

function ResourceItem({ resource, onDownload, downloadingId }) {
  const actions = resourceActions(resource);
  const busy = downloadingId === resource.id;

  return (
    <article className="content-card">
      <div className="doc-tags">
        <span>{resourceTypeLabel(resource.resourceType)}</span>
      </div>
      <h3>
        <Icon name={resourceTypeIcon(resource.resourceType)} size={16} /> {resource.title}
      </h3>

      {actions.hasText && <p>{resource.content}</p>}

      <div className="campaign-form-actions">
        {actions.canOpenLink && (
          // externalUrl is null unless it passed the https-only check in the service, which is
          // itself backed by a database CHECK constraint.
          <a
            className="button button-secondary"
            href={resource.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Mở liên kết
          </a>
        )}
        {actions.canDownload && (
          <Button variant="secondary" onClick={() => onDownload(resource)} disabled={busy}>
            {busy ? 'Đang tạo liên kết…' : 'Tải tài liệu'}
          </Button>
        )}
      </div>
    </article>
  );
}

export function LearningTopicDetail() {
  const { topicId } = useParams();
  const navigate = useNavigate();

  const [topic, setTopic] = useState(null);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadError, setDownloadError] = useState(null);

  const loadTopic = useCallback(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    learningService
      .getTopic(topicId)
      .then((result) => {
        if (!mounted) return undefined;
        setTopic(result);
        // Resources are secondary: a failure here must not hide a topic the user may read.
        return learningService
          .listResources(topicId)
          .then((rows) => {
            if (mounted) setResources(rows);
          })
          .catch(() => {
            if (mounted) setResources([]);
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
  }, [topicId]);

  useEffect(() => {
    let cleanup;
    const timer = setTimeout(() => {
      cleanup = loadTopic();
    }, 0);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [loadTopic]);

  // Signed URLs are requested only here, from an explicit click — never during load — and are
  // neither persisted nor logged.
  const handleDownload = async (resource) => {
    if (!resource?.storagePath || downloadingId) return;
    setDownloadingId(resource.id);
    setDownloadError(null);
    try {
      const url = await learningService.getResourceDownloadUrl(resource.storagePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (requestError) {
      setDownloadError(requestError);
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <PageHeader title="Chuyên đề" back={LIST_PATH} navigate={navigate} />
        <Skeleton lines={8} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <PageHeader title="Chuyên đề" back={LIST_PATH} navigate={navigate} />
        <div className="form-error" role="alert">
          <p>{learningErrorMessage(error)}</p>
          <div className="campaign-form-actions">
            <Button variant="secondary" onClick={loadTopic}>Thử lại</Button>
            <Link className="button button-secondary" to={LIST_PATH}>Về danh sách</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!topic) return null;

  const availability = topicAvailability(topic);

  return (
    <div className="page">
      <PageHeader title="Chi tiết chuyên đề" back={LIST_PATH} navigate={navigate} />

      <div className="document-detail">
        <div className="document-cover">
          <Icon name="book" size={26} />
          <span>Chuyên đề</span>
        </div>
        <div>
          <div className="doc-tags">
            <span className={`status status-${availabilityTone(availability)}`}>
              {AVAILABILITY_LABELS[availability]}
            </span>
          </div>
          <h2>{topic.title}</h2>
          <p>{availabilityWindowLabel(topic)}</p>
        </div>
      </div>

      <div className="content-card">
        {topic.description && (
          <>
            <h3>Giới thiệu</h3>
            <p>{topic.description}</p>
          </>
        )}
        {topic.objectives && (
          <>
            <h3>Mục tiêu</h3>
            <p>{topic.objectives}</p>
          </>
        )}
      </div>

      <div className="section-header">
        <h2>Học liệu ({resources.length})</h2>
      </div>

      {resources.length === 0 ? (
        <div className="content-card">
          <p>Chuyên đề này chưa có học liệu.</p>
        </div>
      ) : (
        <div className="document-list">
          {resources.map((resource) => (
            <ResourceItem
              key={resource.id}
              resource={resource}
              onDownload={handleDownload}
              downloadingId={downloadingId}
            />
          ))}
        </div>
      )}

      {downloadError && (
        <p className="form-error" role="alert">{learningErrorMessage(downloadError)}</p>
      )}
    </div>
  );
}
