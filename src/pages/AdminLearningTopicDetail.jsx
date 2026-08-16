import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, PageHeader, Toast } from '../components/common';
import Skeleton from '../components/Skeleton';
import { supabase } from '../services/supabaseClient';
import { createLearningAdminService } from '../services/learningAdminService';
import { createQuizAdminService } from '../services/quizAdminService';

const learningService = createLearningAdminService(supabase);
const quizService = createQuizAdminService(supabase);

function dateInput(value) { return value ? String(value).slice(0, 16) : ''; }
function formFromTopic(topic) { return { title: topic.title || '', description: topic.description || '', objectives: topic.objectives || '', visibilityLevel: topic.visibilityLevel || 'INTERNAL_YOUTH', openAt: dateInput(topic.openAt), closeAt: dateInput(topic.closeAt) }; }
function errorMessage(error) { return error?.code ? `Không thể thực hiện: ${error.code}` : 'Không thể tải dữ liệu.'; }

export function AdminLearningTopicDetail() {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [topic, setTopic] = useState(null);
  const [form, setForm] = useState(null);
  const [resources, setResources] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [resourceForm, setResourceForm] = useState({ resourceType: 'TEXT', title: '', content: '', externalUrl: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resourceBusy, setResourceBusy] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    Promise.all([learningService.getTopic(topicId), learningService.listResources(topicId), quizService.listQuizzes(topicId)])
      .then(([nextTopic, nextResources, nextQuizzes]) => { setTopic(nextTopic); setForm(formFromTopic(nextTopic)); setResources(nextResources); setQuizzes(nextQuizzes); })
      .catch(setError).finally(() => setLoading(false));
  }, [topicId]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  const saveTopic = async (event) => { event.preventDefault(); if (saving) return; setSaving(true); setError(null); try { await learningService.updateTopic(topicId, form); setToast('Đã lưu thông tin chuyên đề.'); load(); } catch (requestError) { setError(requestError); } finally { setSaving(false); } };
  const setStatus = async (status) => { if (saving || !window.confirm(`Xác nhận chuyển chuyên đề sang ${status}?`)) return; setSaving(true); try { await learningService.setTopicStatus(topicId, status); setToast('Đã cập nhật trạng thái.'); load(); } catch (requestError) { setError(requestError); } finally { setSaving(false); } };
  const saveResource = async (event) => { event.preventDefault(); if (resourceBusy) return; setResourceBusy(true); setError(null); try { await learningService.upsertResource(topicId, { ...resourceForm, sortOrder: resources.length }); setResourceForm({ resourceType: 'TEXT', title: '', content: '', externalUrl: '' }); setToast('Đã thêm học liệu.'); load(); } catch (requestError) { setError(requestError); } finally { setResourceBusy(false); } };
  const upload = async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file || resourceBusy) return; setResourceBusy(true); try { await learningService.uploadResourceFile(topicId, file, { title: resourceForm.title || file.name, sortOrder: resources.length }); setResourceForm({ resourceType: 'TEXT', title: '', content: '', externalUrl: '' }); setToast('Đã tải lên học liệu.'); load(); } catch (requestError) { setError(requestError); } finally { setResourceBusy(false); } };
  const removeResource = async (resource) => { if (!window.confirm(`Xóa học liệu “${resource.title}”?`)) return; setResourceBusy(true); try { const path = await learningService.deleteResource(resource.id); if (path) await supabase.storage.from('learning-resources-private').remove([path]); setToast('Đã xóa học liệu.'); load(); } catch (requestError) { setError(requestError); } finally { setResourceBusy(false); } };
  const moveResource = async (index, direction) => { const next = [...resources]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setResourceBusy(true); try { await learningService.reorderResources(topicId, next.map((item) => item.id)); setResources(next); } catch (requestError) { setError(requestError); } finally { setResourceBusy(false); } };

  if (loading) return <div className="page admin-reports-page"><Skeleton /></div>;
  if (!topic || !form) return <div className="page admin-reports-page"><EmptyState icon="alert" title="Không tìm thấy chuyên đề" description={errorMessage(error)} action="Quay lại" onAction={() => navigate('/admin/chuyen-de')} /></div>;
  return <div className="page admin-reports-page learning-admin-page">
    <PageHeader title={topic.title} subtitle={`Trạng thái: ${topic.status}`} back="/admin/chuyen-de" navigate={navigate} />
    {error && <p className="form-error" role="alert">{errorMessage(error)}</p>}
    <form className="campaign-form" onSubmit={saveTopic}><fieldset><legend>Thông tin chuyên đề</legend><label>Tên chuyên đề<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label>Mô tả<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><label>Mục tiêu<textarea value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} /></label><div className="campaign-form-grid"><label>Mức hiển thị<select value={form.visibilityLevel} onChange={(e) => setForm({ ...form, visibilityLevel: e.target.value })}><option>PUBLIC</option><option>INTERNAL_YOUTH</option><option>ORGANIZATION_ONLY</option><option>RESTRICTED</option></select></label><label>Mở từ<input type="datetime-local" value={form.openAt} onChange={(e) => setForm({ ...form, openAt: e.target.value })} /></label><label>Đóng lúc<input type="datetime-local" value={form.closeAt} onChange={(e) => setForm({ ...form, closeAt: e.target.value })} /></label></div><div className="campaign-form-actions"><Button type="submit" disabled={saving}>Lưu thông tin</Button>{topic.status === 'DRAFT' && <Button type="button" variant="secondary" onClick={() => setStatus('PUBLISHED')}>Phát hành</Button>}{topic.status === 'PUBLISHED' && <Button type="button" variant="secondary" onClick={() => setStatus('CLOSED')}>Đóng chuyên đề</Button>}</div></fieldset></form>
    <section className="admin-section"><div className="section-header"><h2>Học liệu ({resources.length})</h2></div><form className="campaign-form resource-form" onSubmit={saveResource}><fieldset><legend>Thêm học liệu</legend><div className="campaign-form-grid"><label>Loại<select value={resourceForm.resourceType} onChange={(e) => setResourceForm({ ...resourceForm, resourceType: e.target.value })}><option>TEXT</option><option>LINK</option><option>VIDEO</option><option>IMAGE</option></select></label><label>Tiêu đề<input required value={resourceForm.title} onChange={(e) => setResourceForm({ ...resourceForm, title: e.target.value })} /></label></div>{resourceForm.resourceType === 'TEXT' ? <label>Nội dung<textarea required value={resourceForm.content} onChange={(e) => setResourceForm({ ...resourceForm, content: e.target.value })} /></label> : resourceForm.resourceType === 'LINK' || resourceForm.resourceType === 'VIDEO' ? <label>Liên kết https://<input type="url" required value={resourceForm.externalUrl} onChange={(e) => setResourceForm({ ...resourceForm, externalUrl: e.target.value })} /></label> : null}<div className="campaign-form-actions"><Button type="submit" disabled={resourceBusy}>Thêm học liệu</Button><Button type="button" variant="secondary" disabled={resourceBusy} onClick={() => fileRef.current?.click()}>Tải tệp riêng tư</Button><input ref={fileRef} type="file" hidden onChange={upload} /></div></fieldset></form>{resources.length === 0 ? <EmptyState icon="file" title="Chưa có học liệu" description="Thêm nội dung, liên kết hoặc tệp riêng tư." /> : <div className="admin-item-list">{resources.map((resource, index) => <div className="admin-item" key={resource.id}><div><strong>{resource.title}</strong><small>{resource.resourceType}{resource.storagePath ? ' · tệp riêng tư' : ''}</small></div><div className="campaign-form-actions"><Button variant="secondary" disabled={resourceBusy || index === 0} onClick={() => moveResource(index, -1)}>↑</Button><Button variant="secondary" disabled={resourceBusy || index === resources.length - 1} onClick={() => moveResource(index, 1)}>↓</Button><Button variant="secondary" disabled={resourceBusy} onClick={() => removeResource(resource)}>Xóa</Button></div></div>)}</div>}</section>
    <section className="admin-section"><div className="section-header"><h2>Trắc nghiệm ({quizzes.length})</h2><Button onClick={() => navigate(`/admin/chuyen-de/${topicId}/trac-nghiem/new`)}>Tạo bài trắc nghiệm</Button></div>{quizzes.length === 0 ? <EmptyState icon="check" title="Chưa có bài trắc nghiệm" description="Tạo bản nháp để bắt đầu soạn câu hỏi." /> : <div className="admin-item-list">{quizzes.map((quiz) => <Link className="admin-item" to={`/admin/chuyen-de/${topicId}/trac-nghiem/${quiz.id}`} key={quiz.id}><div><strong>{quiz.title}</strong><small>{quiz.status} · {quiz.questionCount} câu · {quiz.submittedAttemptCount} lượt đã nộp</small></div><span>Chỉnh sửa →</span></Link>)}</div>}</section>
    {toast && <Toast message={toast} onClose={() => setToast(null)} />}
  </div>;
}
