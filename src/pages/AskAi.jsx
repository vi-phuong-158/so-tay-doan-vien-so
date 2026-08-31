import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader } from '../components/common';
import { createAskAiService } from '../services/aiService';
import { supabase } from '../services/supabaseClient';

const askAiService = createAskAiService(supabase);

export function AskAi() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await askAiService.ask({ question, conversationId: result?.conversationId }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page ask-ai-page">
      <PageHeader title="Hỏi AI có dẫn nguồn" back="/tri-thuc" navigate={navigate} />
      <p className="ask-ai-intro">Câu trả lời chỉ dựa trên tri thức đã được duyệt và bạn được phép xem.</p>
      <form className="ask-ai-form" onSubmit={submit}>
        <label htmlFor="ai-question">Câu hỏi</label>
        <textarea
          id="ai-question"
          value={question}
          onChange={event => setQuestion(event.target.value)}
          maxLength={2000}
          placeholder="Ví dụ: Thời hạn thực hiện theo văn bản là bao lâu?"
          disabled={loading}
        />
        <button className="button button-primary" type="submit" disabled={loading}>
          <Icon name="sparkles" size={18} />
          {loading ? 'Đang đối chiếu nguồn…' : 'Hỏi AI'}
        </button>
      </form>

      {error && <p className="form-error" role="alert">{error}</p>}

      {!loading && !result && !error && (
        <EmptyState icon="sparkles" title="Sẵn sàng tra cứu" description="Nhập câu hỏi để AI đối chiếu kho tri thức đã duyệt." />
      )}

      {result && (
        <section className="ask-ai-result" aria-live="polite">
          <h2>Trả lời</h2>
          <p>{result.answer}</p>
          {result.citations.length > 0 && (
            <div className="ask-ai-citations">
              <h3>Nguồn đã đối chiếu</h3>
              {result.citations.map(item => (
                <Link key={item.evidenceId} to={item.citationPath} className="ask-ai-citation">
                  <span>[{item.rank}]</span>
                  <strong>{item.title}</strong>
                  {item.locator?.page ? <small>Trang {item.locator.page}</small> : <small>Mở văn bản nguồn</small>}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
