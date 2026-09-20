import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
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
  const { user, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedProject, setSelectedProject] = useState(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [problemTitle, setProblemTitle] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

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

  const organizationName = profile?.organization?.short_name || profile?.organization?.name || 'Đơn vị theo hồ sơ tài khoản';
  const canSubmit = Boolean(user && profile?.account_status === 'ACTIVE');

  const requestProblemSubmission = () => {
    if (!canSubmit) {
      navigate('/login', { state: { from: location } });
      return;
    }
    setProblemTitle('');
    setProblemDescription('');
    setSubmitError('');
    setSubmitSuccess(false);
    setSubmitOpen(true);
  };

  const submitProblem = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await innovationService.submitProblem({ title: problemTitle, description: problemDescription });
      setSubmitOpen(false);
      setProblemTitle('');
      setProblemDescription('');
      setSubmitSuccess(true);
    } catch (requestError) {
      setSubmitError(requestError.message || 'Chưa gửi được bài toán. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page innovation-page">
      <PageHeader
        title="Góc đổi mới sáng tạo"
        action={(
          <Button icon="plus" variant="secondary" onClick={requestProblemSubmission}>
            {canSubmit ? 'Gửi bài toán' : 'Đăng nhập để gửi bài toán'}
          </Button>
        )}
      />
      <p className="page-subtitle">Các công trình đã được phê duyệt công bố.</p>

      {submitSuccess && (
        <p className="innovation-submit-success" role="status">
          <Icon name="check" size={18} /> Bài toán đã được gửi để đơn vị phụ trách xem xét.
        </p>
      )}

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
        open={submitOpen}
        title="Gửi bài toán, điểm nghẽn"
        className="innovation-submit-modal"
        onClose={() => setSubmitOpen(false)}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setSubmitOpen(false)} disabled={submitting}>Hủy</Button>
            <Button type="submit" form="innovation-problem-form" disabled={submitting}>
              {submitting ? 'Đang gửi…' : 'Gửi hỗ trợ'}
            </Button>
          </>
        )}
      >
        <form id="innovation-problem-form" className="innovation-problem-form" onSubmit={submitProblem}>
          <label className="form-field" htmlFor="problem-title">
            <span>Tên vấn đề <b aria-hidden="true">*</b></span>
            <input
              id="problem-title"
              autoFocus
              required
              maxLength={200}
              value={problemTitle}
              onChange={(event) => setProblemTitle(event.target.value)}
              placeholder="Ví dụ: Rút ngắn thời gian tổng hợp báo cáo"
            />
          </label>
          <label className="form-field" htmlFor="problem-organization">
            <span>Đơn vị</span>
            <input id="problem-organization" value={organizationName} readOnly aria-describedby="problem-organization-note" />
            <small id="problem-organization-note">Đơn vị được lấy từ hồ sơ tài khoản.</small>
          </label>
          <label className="form-field" htmlFor="problem-description">
            <span>Mô tả ngắn <b aria-hidden="true">*</b></span>
            <textarea
              id="problem-description"
              required
              rows={5}
              maxLength={6000}
              value={problemDescription}
              onChange={(event) => setProblemDescription(event.target.value)}
              placeholder="Mô tả tình huống, khó khăn đang gặp và kết quả mong muốn."
            />
            <small>{problemDescription.length}/6.000 ký tự</small>
          </label>
          <p className="innovation-security-note">
            Không gửi thông tin mật hoặc dữ liệu nhạy cảm. Tệp đính kèm chưa được hỗ trợ trong luồng gửi hiện có.
          </p>
          {submitError && <p className="form-error" role="alert">{submitError}</p>}
        </form>
      </Modal>

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
