import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, EmptyState, Modal, PageHeader, Progress, StatusBadge } from '../components/common';
import Skeleton from '../components/Skeleton';
import { useAuth } from '../contexts/AuthContext';
import { createInnovationService } from '../services/innovationService';
import { supabase } from '../services/supabaseClient';

const innovationService = createInnovationService(supabase);

function ProjectCard({ item, featured, onOpen }) {
  return (
    <article className={`card innovation-project-card${featured ? ' is-featured' : ''}`}>
      <div className="innovation-project-heading">
        <StatusBadge label={item.status} tone="info" />
        {item.category && <span className="innovation-project-category">{item.category}</span>}
      </div>
      <h2>{item.title}</h2>
      {item.summary && <p className="card-desc">{item.summary}</p>}
      <div className="innovation-progress-label"><span>Tiến độ</span><strong>{item.progress}%</strong></div>
      <Progress value={item.progress} />
      {item.team && <p className="innovation-project-unit">Đơn vị thực hiện: {item.team}</p>}
      <Button variant="secondary" icon="arrow" onClick={() => onOpen(item)}>Xem chi tiết</Button>
    </article>
  );
}

export function Innovation() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedProject, setSelectedProject] = useState(null);

  useEffect(() => {
    let mounted = true;
    innovationService.listProjects()
      .then((rows) => { if (mounted) setProjects(rows); })
      .catch(() => { if (mounted) setError(true); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [refreshKey]);

  const retryProjects = () => {
    setLoading(true);
    setError(null);
    setRefreshKey((value) => value + 1);
  };

  const requestProblemSubmission = () => {
    if (!user) navigate('/login', { state: { from: location } });
  };

  return (
    <div className="page innovation-page">
      <PageHeader
        title="Góc đổi mới sáng tạo"
        action={(
          <Button icon="plus" variant="secondary" onClick={requestProblemSubmission}>
            {user ? 'Gửi bài toán' : 'Đăng nhập để gửi bài toán'}
          </Button>
        )}
      />
      <p className="page-subtitle">Các công trình đã được phê duyệt công bố.</p>

      <section className="innovation-projects" aria-label="Công trình đã công bố">
        {loading && <Skeleton lines={6} />}
        {!loading && error && (
          <div className="form-error" role="alert">
            <p>Không tải được công trình công bố. Vui lòng thử lại.</p>
            <Button variant="secondary" onClick={retryProjects}>Thử lại</Button>
          </div>
        )}
        {!loading && !error && projects.length === 0 && (
          <EmptyState icon="bulb" title="Chưa có công trình công bố" description="Các công trình được phê duyệt sẽ xuất hiện tại đây." />
        )}
        {!loading && !error && projects.length > 0 && (
          <div className="list card-list innovation-project-list">
            {projects.map((project, index) => (
              <ProjectCard key={project.id} item={project} featured={index === 0} onOpen={setSelectedProject} />
            ))}
          </div>
        )}
      </section>

      <Modal
        open={Boolean(selectedProject)}
        title={selectedProject?.title || 'Chi tiết công trình'}
        className="innovation-project-modal"
        onClose={() => setSelectedProject(null)}
        footer={<Button variant="secondary" onClick={() => setSelectedProject(null)}>Đóng</Button>}
      >
        {selectedProject && (
          <div className="innovation-project-detail">
            <StatusBadge label={selectedProject.status} tone="info" />
            {selectedProject.category && <p><strong>Lĩnh vực:</strong> {selectedProject.category}</p>}
            {selectedProject.team && <p><strong>Đơn vị thực hiện:</strong> {selectedProject.team}</p>}
            {selectedProject.summary && <p>{selectedProject.summary}</p>}
            <div className="innovation-progress-label"><span>Tiến độ</span><strong>{selectedProject.progress}%</strong></div>
            <Progress value={selectedProject.progress} />
          </div>
        )}
      </Modal>
    </div>
  );
}
