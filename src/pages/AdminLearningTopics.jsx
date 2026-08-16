import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, PageHeader, StatusBadge, Toast } from '../components/common';
import Skeleton from '../components/Skeleton';
import { supabase } from '../services/supabaseClient';
import {
  LEARNING_VISIBILITY_LEVELS,
  createLearningAdminService,
  normalizeLearningAdminError
} from '../services/learningAdminService';

const service = createLearningAdminService(supabase);
const EMPTY_FORM = { title: '', description: '', objectives: '', visibilityLevel: 'INTERNAL_YOUTH', openAt: '', closeAt: '' };

function message(error) { return error?.code ? `Không thể thực hiện: ${error.code}` : 'Không thể tải dữ liệu.'; }

export function AdminLearningTopics() {
  const [topics, setTopics] = useState([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ search: '', status: '', visibilityLevel: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    service.listTopics(filters).then((result) => {
      setTopics(result.items);
      setTotal(result.total);
    }).catch((requestError) => setError(normalizeLearningAdminError(requestError)))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await service.createTopic(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      setToast('Đã tạo bản nháp chuyên đề.');
      load();
    } catch (requestError) { setError(requestError); } finally { setSaving(false); }
  };

  return (
    <div className="page admin-reports-page learning-admin-page">
      <PageHeader title="Quản trị chuyên đề" subtitle={`${total} chuyên đề trong phạm vi quản lý`} action={<Button icon="plus" onClick={() => setShowForm((value) => !value)}>Tạo chuyên đề</Button>} />
      <div className="admin-filter-grid">
        <label>Tìm kiếm<input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Tên chuyên đề" /></label>
        <label>Trạng thái<select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Tất cả</option><option>DRAFT</option><option>PUBLISHED</option><option>CLOSED</option><option>ARCHIVED</option></select></label>
        <label>Hiển thị<select value={filters.visibilityLevel} onChange={(e) => setFilters({ ...filters, visibilityLevel: e.target.value })}><option value="">Tất cả</option>{LEARNING_VISIBILITY_LEVELS.map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      {showForm && <form className="campaign-form learning-admin-form" onSubmit={submit}>
        <fieldset><legend>Chuyên đề mới</legend>
          <label>Tên chuyên đề<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>Mô tả<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>Mục tiêu<textarea value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} /></label>
          <div className="campaign-form-grid"><label>Mức hiển thị<select value={form.visibilityLevel} onChange={(e) => setForm({ ...form, visibilityLevel: e.target.value })}>{LEARNING_VISIBILITY_LEVELS.map((value) => <option key={value}>{value}</option>)}</select></label><label>Mở từ<input type="datetime-local" value={form.openAt} onChange={(e) => setForm({ ...form, openAt: e.target.value })} /></label><label>Đóng lúc<input type="datetime-local" value={form.closeAt} onChange={(e) => setForm({ ...form, closeAt: e.target.value })} /></label></div>
          <div className="campaign-form-actions"><Button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu bản nháp'}</Button><Button variant="secondary" onClick={() => setShowForm(false)}>Hủy</Button></div>
        </fieldset>
      </form>}
      {error && <p className="form-error" role="alert">{message(error)}</p>}
      {loading ? <Skeleton /> : topics.length === 0 ? <EmptyState icon="book" title="Chưa có chuyên đề" description="Tạo chuyên đề đầu tiên trong phạm vi quản lý." action="Tạo chuyên đề" onAction={() => setShowForm(true)} /> : <div className="campaign-list learning-admin-list">
        {topics.map((topic) => <Link className="campaign-list-item" to={`/admin/chuyen-de/${topic.id}`} key={topic.id}><div><h2>{topic.title}</h2><p>{topic.ownerOrganizationName || 'Chưa gắn đơn vị'} · {topic.resourceCount} học liệu · {topic.quizCount} bài trắc nghiệm</p></div><div className="campaign-list-meta"><StatusBadge status={topic.status} label={topic.status} tone={topic.status === 'PUBLISHED' ? 'success' : topic.status === 'DRAFT' ? 'warning' : 'neutral'} /><span>Mở cấu hình →</span></div></Link>)}
      </div>}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
