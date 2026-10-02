import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, PageHeader } from '../components/common';
import { Icon } from '../components/Icon';
import Skeleton from '../components/Skeleton';
import { supabase } from '../services/supabaseClient';
import { createNqQuizService, secondsRemaining, formatQuizTime } from '../services/nqQuizService';

const service = createNqQuizService(supabase);

export function NqQuiz() {
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('intro');
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(1200);
  const [review, setReview] = useState(false);
  const [search, setSearch] = useState('');
  const [lookupSearch, setLookupSearch] = useState('');
  const [results, setResults] = useState([]);
  const [offset, setOffset] = useState(0);
  const [lookupLoading, setLookupLoading] = useState(false);
  const active = useRef(null);
  const anchor = useRef(0);
  const queue = useRef(Promise.resolve());
  const submitting = useRef(false);
  const pending = useRef({});
  const lookupVersion = useRef(0);
  const mounted = useRef(true);
  const actorId = useRef(null);
  const cacheKey = useCallback((id) => `nq-draft:${actorId.current}:${id}`, []);

  const apply = useCallback((next) => {
    if (!mounted.current) return;
    active.current = next;
    anchor.current = performance.now();
    setState(next?.status === 'IN_PROGRESS' ? { ...next, answers: { ...next.answers, ...pending.current } } : next);
    setRemaining(secondsRemaining(next, 0));
    if (next?.status !== 'IN_PROGRESS') {
      if (next) localStorage.removeItem(cacheKey(next.attempt_id));
      pending.current = {};
      if (next) setView('result');
    }
  }, [cacheKey]);

  const flush = useCallback(async () => {
    for (const [questionId, optionId] of Object.entries(pending.current)) {
      const next = await service.attempt('answer', active.current.attempt_id, questionId, optionId);
      if (pending.current[questionId] === optionId) delete pending.current[questionId];
      localStorage.setItem(cacheKey(next.attempt_id), JSON.stringify(pending.current));
      apply(next);
      if (next.status !== 'IN_PROGRESS') break;
    }
  }, [apply, cacheKey]);

  const load = useCallback(async () => {
    try {
      const next = await service.attempt('resume');
      if (!mounted.current) return;
      apply(next);
      if (next) {
        setView(next.status === 'IN_PROGRESS' ? 'attempt' : 'result');
        if (next.status === 'IN_PROGRESS') {
          try { pending.current = JSON.parse(localStorage.getItem(cacheKey(next.attempt_id)) || '{}'); } catch { pending.current = {}; }
          await flush();
        }
      }
    } catch { if (mounted.current) setError('Không thể tải lượt thi. Vui lòng thử lại.'); }
    finally { if (mounted.current) setLoading(false); }
  }, [apply, cacheKey, flush]);

  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(async () => {
      try {
        const actor = await service.ensureActor();
        if (!mounted.current) return;
        actorId.current = actor.id;
        await load();
      } catch {
        if (mounted.current) {
          setError('Chưa tạo được phiên làm bài miễn phí. Vui lòng thử lại.');
          setLoading(false);
        }
      }
    }, 0);
    return () => { mounted.current = false; clearTimeout(timer); };
  }, [load]);

  const submit = useCallback(async (automatic = false) => {
    if (submitting.current || !active.current || active.current.status !== 'IN_PROGRESS') return;
    if (!automatic && !window.confirm('Nộp bài và xem kết quả?')) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await queue.current;
      await flush();
      const next = await service.attempt('submit', active.current.attempt_id);
      apply(next);
      setView('result');
    } catch { setError('Chưa nộp được bài. Hệ thống sẽ thử lại khi có mạng; thời gian vẫn tính theo máy chủ.'); }
    finally { submitting.current = false; setBusy(false); }
  }, [apply, flush]);

  useEffect(() => {
    if (view !== 'attempt' || state?.status !== 'IN_PROGRESS') return undefined;
    const tick = () => {
      const seconds = secondsRemaining(active.current, performance.now() - anchor.current);
      setRemaining(seconds);
      if (seconds === 0) submit(true);
    };
    const timer = setInterval(tick, 1000);
    const sync = () => {
      queue.current = queue.current.catch(() => {}).then(async () => {
        await flush();
        const next = await service.attempt('read', active.current.attempt_id);
        apply(next);
        if (next.status !== 'IN_PROGRESS') setView('result');
      }).catch(() => setError('Đang mất kết nối. Câu trả lời chưa đồng bộ được giữ trên thiết bị này.'));
    };
    window.addEventListener('online', sync);
    window.addEventListener('focus', sync);
    return () => { clearInterval(timer); window.removeEventListener('online', sync); window.removeEventListener('focus', sync); };
  }, [view, state?.status, submit, flush, apply]);

  async function start() {
    setBusy(true); setError(''); setReview(false);
    try {
      const next = await service.attempt('start');
      apply(next); setIndex(0); setView(next.status === 'IN_PROGRESS' ? 'attempt' : 'result');
    } catch { setError('Không thể bắt đầu bài thi. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  }

  function answer(questionId, optionId) {
    if (busy || remaining === 0) return;
    pending.current[questionId] = optionId;
    localStorage.setItem(cacheKey(state.attempt_id), JSON.stringify(pending.current));
    setState((previous) => ({ ...previous, answers: { ...previous.answers, [questionId]: optionId } }));
    queue.current = queue.current.catch(() => {}).then(flush)
      .catch(() => setError('Chưa đồng bộ được câu trả lời. Sẽ thử lại khi có mạng.'));
  }

  async function lookup(event, nextOffset = 0) {
    event?.preventDefault();
    const version = ++lookupVersion.current;
    setLookupLoading(true); setError('');
    try {
      const term = nextOffset ? lookupSearch : search;
      const rows = await service.lookup(term, nextOffset);
      if (version !== lookupVersion.current) return;
      if (!nextOffset) setLookupSearch(term);
      setResults((previous) => nextOffset ? [...previous, ...rows] : rows);
      setOffset(nextOffset + rows.length);
    } catch { if (version === lookupVersion.current) setError('Không thể tra cứu câu hỏi. Vui lòng thử lại.'); }
    finally { if (version === lookupVersion.current) setLookupLoading(false); }
  }

  const question = state?.questions[index];
  const answered = Object.values(state?.answers || {}).filter(Boolean).length;
  const showOptions = (q, isReview = false) => (
    <div className="quiz-options">
      {q.options.map((option, optionIndex) => {
        const selected = state.answers[q.id] === option.id;
        const correct = isReview && q.correct_option_id === option.id;
        return <label className={`quiz-option${selected ? ' selected' : ''}${correct ? ' nq-correct' : ''}`} key={option.id}>
          {!isReview && <input type="radio" name={q.id} checked={selected} disabled={busy || remaining === 0} onChange={() => answer(q.id, option.id)} />}
          <span className="quiz-option-letter">{'ABCD'[optionIndex]}</span>
          <span>{option.text}{isReview && <small className="nq-option-note">{selected ? 'Bạn chọn' : ''}{selected && correct ? ' · ' : ''}{correct ? 'Đáp án đúng' : ''}</small>}</span>
        </label>;
      })}
    </div>
  );

  return <div className="page page--appbar quiz-screen nq-screen">
    <PageHeader title={view === 'lookup' ? 'Tra cứu câu hỏi' : 'Trắc nghiệm Nghị quyết'} back="/tri-thuc" navigate={navigate} variant="brand" />
    {error && <div className="form-error" role="alert">{error}<Button variant="secondary" onClick={load}>Thử lại</Button></div>}
    {loading ? <Skeleton lines={6} /> : view === 'intro' ? <article className="content-card nq-intro">
      <h2>Trắc nghiệm Nghị quyết</h2><p>30 câu hỏi · 20 phút</p>
      <p className="text-muted">Miễn phí, không cần đăng nhập. Kết quả được lưu trên thiết bị này.</p>
      <Button onClick={start} disabled={busy}>Bắt đầu thi</Button>
      <Button variant="secondary" onClick={() => setView('lookup')}>Tra cứu câu hỏi</Button>
    </article> : view === 'attempt' && question ? <>
      <div className="quiz-progress-head"><strong>Câu {index + 1} / 30</strong><strong aria-label="Thời gian còn lại"><Icon name="clock" size={16} /> {formatQuizTime(remaining)}</strong></div>
      <p className="text-muted">Đã trả lời {answered} / 30</p>
      <article className="content-card quiz-question-card"><h2>{question.text}</h2>{showOptions(question)}</article>
      <div className="nq-question-nav" aria-label="Chuyển đến câu hỏi">{state.questions.map((q, i) => <button type="button" key={q.id} aria-label={`Câu ${i + 1}${state.answers[q.id] ? ', đã trả lời' : ', chưa trả lời'}`} aria-current={i === index ? 'step' : undefined} className={state.answers[q.id] ? 'selected' : ''} onClick={() => setIndex(i)}>{i + 1}</button>)}</div>
      <div className="nq-actions"><Button variant="secondary" onClick={() => setIndex(index - 1)} disabled={index === 0 || busy}>Câu trước</Button><Button variant="secondary" onClick={() => setIndex(index + 1)} disabled={index === 29 || busy}>Câu tiếp</Button><Button onClick={() => submit()} disabled={busy}>{busy ? 'Đang nộp…' : 'Nộp bài'}</Button></div>
    </> : view === 'result' && state ? <>
      <article className="content-card nq-result"><h2>{state.correct} / 30</h2><strong>{state.percentage}%</strong>
        <p>{state.correct} câu đúng · {state.wrong} câu sai · {state.unanswered} câu chưa trả lời</p>
        <p>Thời gian: {Math.floor(state.elapsed_seconds / 60)} phút {state.elapsed_seconds % 60} giây</p>
        {state.status === 'EXPIRED' && <p>Đã tự nộp khi hết 20 phút.</p>}
        <Button variant="secondary" onClick={() => setReview(!review)}>Xem lại đáp án</Button><Button onClick={start} disabled={busy}>Làm đề khác</Button>
      </article>
      {review && state.questions.map((q, i) => <article className="content-card quiz-question-card" key={q.id}><h3>Câu {i + 1} · Câu gốc {q.question_number}</h3><h2>{q.text}</h2>{!state.answers[q.id] && <p>Chưa trả lời</p>}{showOptions(q, true)}</article>)}
      <Button variant="secondary" onClick={() => setView('lookup')}>Tra cứu câu hỏi</Button>
    </> : view === 'lookup' ? <>
      <form className="nq-search" onSubmit={lookup}><input aria-label="Số câu hoặc từ khóa" placeholder="Câu 125 hoặc từ khóa" type="search" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={200} /><Button type="submit" disabled={lookupLoading}>Tìm</Button></form>
      {results.map((q) => <article className="content-card quiz-question-card" key={q.question_number}><h3>Câu {q.question_number}</h3><h2>{q.text}</h2><ol className="nq-lookup-options">{q.options.map((o) => <li key={o.label}><b>{o.label}.</b> {o.text}</li>)}</ol><p className="nq-key">Đáp án đúng: {q.correct_answer}</p></article>)}
      {!lookupLoading && results.length === 0 && <p>Nhập số câu hoặc từ khóa để tra cứu.</p>}
      {offset > 0 && offset % 20 === 0 && <Button variant="secondary" disabled={lookupLoading || search !== lookupSearch} onClick={() => lookup(null, offset)}>Xem thêm</Button>}
      <Button variant="secondary" onClick={() => setView(state ? state.status === 'IN_PROGRESS' ? 'attempt' : 'result' : 'intro')}>Quay lại trắc nghiệm</Button>
    </> : null}
  </div>;
}
