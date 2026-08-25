import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, PageHeader, Toast } from '../components/common';
import Skeleton from '../components/Skeleton';
import { createKnowledgeAdminService } from '../services/knowledgeAdminService';
import { supabase } from '../services/supabaseClient';

const service = createKnowledgeAdminService(supabase);
const STATUS_LABELS = { DRAFT: 'Bản nháp', PENDING_REVIEW: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', SUPERSEDED: 'Đã thay thế' };

export function AdminKnowledgeArticle() {
  const { documentId } = useParams();
  const [document, setDocument] = useState(null);
  const [articles, setArticles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [reviewNote, setReviewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const selected = useMemo(() => articles.find(article => article.id === selectedId) ?? articles[0] ?? null, [articles, selectedId]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [doc, rows] = await Promise.all([service.getDocument(documentId), service.listArticles(documentId)]);
      setDocument(doc); setArticles(rows); setEvidence(current => rows.length ? current : []); setSelectedId(current => current ?? rows[0]?.id ?? null);
    } catch (cause) { setError(cause); }
    finally { setLoading(false); }
  }, [documentId]);

  useEffect(() => { Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    if (!selected) return undefined;
    let mounted = true;
    Promise.resolve().then(() => service.getEvidence(selected.id)).then(rows => { if (mounted) setEvidence(rows); }).catch(cause => { if (mounted) setError(cause); });
    return () => { mounted = false; };
  }, [selected]);

  async function generate(regenerate = false) {
    setBusy(true); setError(null);
    try {
      await service.generate(documentId, regenerate ? { regenerationKey: crypto.randomUUID().replaceAll('-', '') } : {});
      setToast(regenerate ? 'Đã tạo yêu cầu sinh bản nháp mới.' : 'Đã tạo bản nháp tri thức, đang chờ duyệt.');
      await load();
    } catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  async function toggleAiPolicy() {
    setBusy(true); setError(null);
    try {
      await service.setAiProcessingAllowed(documentId, !document.ai_processing_allowed);
      setToast(document.ai_processing_allowed ? 'Đã khóa xử lý external AI.' : 'Đã cho phép xử lý external AI cho văn bản này.');
      await load();
    } catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  async function review(action) {
    if (!selected) return;
    setBusy(true); setError(null);
    try {
      await service.review(selected.id, action, reviewNote);
      setReviewNote(''); setToast(action === 'APPROVE' ? 'Đã duyệt bài tri thức.' : 'Đã ghi nhận kết quả review.');
      await load();
    } catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="page"><PageHeader title="Review tri thức" /><Skeleton count={4} /></div>;
  if (error && !document) return <div className="page"><PageHeader title="Review tri thức" /><EmptyState icon="alert" title="Không tải được dữ liệu" description={error.code || 'Có lỗi xảy ra.'} /></div>;
  if (!document) return <div className="page"><EmptyState title="Không tìm thấy văn bản" description="Văn bản không tồn tại hoặc bạn không có quyền truy cập." /></div>;

  return <div className="page admin-knowledge-page">
    <PageHeader title="Review tri thức" subtitle={document.title} action={<Link className="button button-secondary" to={`/tri-thuc/van-ban/${document.id}`}>Xem văn bản</Link>} />
    <div className="knowledge-review-layout">
      <section className="knowledge-review-panel">
        <div className="knowledge-source-summary"><strong>{document.title}</strong><span>{document.document_number || 'Chưa có số văn bản'} · {document.status}</span><span>AI external: {document.ai_processing_allowed ? 'Được phép' : 'Đang khóa fail-closed'}</span><Button variant="secondary" onClick={toggleAiPolicy} disabled={busy}>{document.ai_processing_allowed ? 'Khóa external AI' : 'Cho phép external AI'}</Button></div>
        <div className="campaign-form-actions"><Button onClick={() => generate(false)} disabled={busy || !document.ai_processing_allowed}>Sinh bản nháp</Button>{selected?.reviewStatus === 'REJECTED' && <Button variant="secondary" onClick={() => generate(true)} disabled={busy}>Sinh lại</Button>}</div>
        {articles.length === 0 ? <EmptyState icon="book" title="Chưa có bản nháp" description="Sinh bản nháp từ source version hiện tại để bắt đầu review." /> : <div className="knowledge-article-list">{articles.map(article => <button className={`knowledge-article-list-item ${selected?.id === article.id ? 'is-selected' : ''}`} key={article.id} onClick={() => setSelectedId(article.id)}><strong>{article.title}</strong><span>{article.articleKey} · rev {article.revisionNumber} · {STATUS_LABELS[article.reviewStatus] ?? article.reviewStatus}</span></button>)}</div>}
      </section>
      {selected && <section className="knowledge-review-panel knowledge-article-preview">
        <div className="knowledge-review-heading"><div><span className="status status-info">{STATUS_LABELS[selected.reviewStatus] ?? selected.reviewStatus}</span><h2>{selected.title}</h2></div><span>rev {selected.revisionNumber}</span></div>
        <p>{selected.summary}</p>
        {selected.warnings.length > 0 && <div className="knowledge-warning"><strong>Cần kiểm tra:</strong> {selected.warnings.join(' · ')}</div>}
        <h3>Ý chính</h3><ul>{(selected.content.key_points ?? []).map((point, index) => <li key={`${selected.id}-${index}`}>{point}</li>)}</ul>
        <h3>Evidence đối chiếu</h3>
        {evidence.length === 0 ? <p>Chưa có evidence.</p> : <div className="knowledge-evidence-list">{evidence.map(item => <div className="knowledge-evidence" key={item.id}><span>Trang {item.locator.page ?? '?'} · {item.evidenceKind}</span><p>{item.content}</p><small>{item.reviewStatus === 'APPROVED' ? 'Đã duyệt' : 'Chờ duyệt'} · {item.contentHash}</small></div>)}</div>}
        {selected.reviewStatus !== 'APPROVED' && selected.reviewStatus !== 'SUPERSEDED' && <><label className="knowledge-review-note">Ghi chú review<textarea value={reviewNote} onChange={event => setReviewNote(event.target.value)} maxLength={2000} /></label><div className="campaign-form-actions"><Button onClick={() => review('APPROVE')} disabled={busy || evidence.length === 0}>Duyệt bài</Button><Button variant="secondary" onClick={() => review('REJECT')} disabled={busy}>Từ chối</Button><Button variant="secondary" onClick={() => review('REQUEST_REGENERATION')} disabled={busy}>Yêu cầu sinh lại</Button></div></>}
      </section>}
    </div>
    {error && <p className="form-error">{error.code || 'Có lỗi xảy ra.'}</p>}{toast && <Toast message={toast} onClose={() => setToast(null)} />}
  </div>;
}
