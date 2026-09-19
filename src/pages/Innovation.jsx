import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader, Button, Progress } from '../components/common';
import { useAuth } from '../contexts/AuthContext';
import { createInnovationService } from '../services/innovationService';
import { supabase } from '../services/supabaseClient';

const innovationService = createInnovationService(supabase);

function ProjectCard({ item }) {
  return (
    <div className="card innovation-project-card">
      <div className="card-header">
        <span className="status status-info">{item.status}</span>
      </div>
      <h3>{item.title}</h3>
      <p className="card-desc">{item.summary}</p>
      <Progress value={item.progress} />
      <div className="card-meta"><span><Icon name="users" size={15} />{item.team}</span></div>
    </div>
  );
}

export function Innovation() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    innovationService.listProjects()
      .then(setProjects)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const requestProblemSubmission = () => {
    if (!user) navigate('/login', { state: { from: location } });
  };

  return (
    <div className="page">
      <PageHeader
        title="Góc đổi mới sáng tạo"
        action={<Button icon="search" variant="secondary" onClick={requestProblemSubmission}>{user ? 'Gửi bài toán' : 'Đăng nhập để gửi bài toán'}</Button>}
      />
      <p className="page-subtitle">Các công trình đã được phê duyệt công bố.</p>
      <div style={{ padding: '16px' }}>
        {loading && <p>Đang tải công trình…</p>}
        {!loading && error && <p className="form-error" role="alert">Không thể tải công trình công bố.</p>}
        {!loading && !error && projects.length === 0 && <EmptyState icon="bulb" title="Chưa có công trình công bố" description="Các công trình được phê duyệt sẽ xuất hiện tại đây." />}
        {!loading && !error && projects.length > 0 && (
          <div className="list card-list">
            {projects.map(p => <ProjectCard key={p.id} item={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}
