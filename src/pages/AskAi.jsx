import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/common';
import { createAskAiService } from '../services/aiService';
import { supabase } from '../services/supabaseClient';

const askAiService = createAskAiService(supabase);

export function AskAi() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const askedQuestion = question.trim();
    if (loading || !askedQuestion) return;
    setLoading(true);
    setError(null);
    try {
      const nextResult = await askAiService.ask({ question: askedQuestion, conversationId: result?.conversationId });
      setResult(nextResult);
      setMessages((current) => [...current, {
        question: askedQuestion,
        answer: nextResult.answer,
        citations: nextResult.citations
      }]);
      setQuestion('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page page--appbar ask-ai-page">
      <PageHeader title="Trợ lý AI" subtitle="Tra cứu tri thức có dẫn nguồn" back="/tri-thuc" navigate={navigate} variant="brand" />
      <div className="ask-ai-chat" aria-live="polite">
        {messages.length === 0 && !loading && (
          <section className="ask-ai-welcome">
            <span className="ask-ai-welcome-icon"><Icon name="sparkles" size={25} /></span>
            <h2>Xin chào, tôi có thể giúp gì?</h2>
            <p>Câu trả lời được đối chiếu với tri thức đã duyệt và hiển thị nguồn tham khảo.</p>
            <div className="ask-ai-suggestions" aria-label="Câu hỏi gợi ý">
              {[
                'Thời hạn thực hiện theo văn bản là bao lâu?',
                'Đoàn viên cần làm gì khi phát hiện tin giả?',
                'Tóm tắt nội dung văn bản mới nhất'
              ].map((suggestion) => (
                <button type="button" key={suggestion} onClick={() => setQuestion(suggestion)}>{suggestion}</button>
              ))}
            </div>
          </section>
        )}
        {messages.map((message, index) => (
          <div className="ask-ai-turn" key={`${index}-${message.question}`}>
            <p className="ask-ai-user-bubble">{message.question}</p>
            <article className="ask-ai-answer">
              <div className="ask-ai-answer-label"><span><Icon name="sparkles" size={16} /></span><strong>Trợ lý AI</strong></div>
              <p>{message.answer}</p>
              {message.citations.length > 0 && (
                <div className="ask-ai-citations">
                  <h3>Nguồn tham khảo</h3>
                  {message.citations.map((item) => (
                    <Link key={item.evidenceId} to={item.citationPath} className="ask-ai-citation">
                      <span>[{item.rank}]</span>
                      <strong>{item.title}</strong>
                      {item.locator?.page ? <small>Trang {item.locator.page}</small> : <small>Mở văn bản nguồn</small>}
                    </Link>
                  ))}
                </div>
              )}
            </article>
          </div>
        ))}
        {loading && <p className="ask-ai-thinking"><Icon name="sparkles" size={16} /> Đang đối chiếu nguồn…</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <form className="ask-ai-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="ai-question">Nhập câu hỏi</label>
        <textarea
          id="ai-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={2000}
          placeholder="Nhập câu hỏi…"
          disabled={loading}
          rows={1}
        />
        <button type="submit" aria-label="Gửi câu hỏi" disabled={loading || !question.trim()}>
          <Icon name="send" size={19} />
        </button>
      </form>
    </div>
  );
}
