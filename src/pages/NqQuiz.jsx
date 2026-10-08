import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, PageHeader } from '../components/common';
import { Icon } from '../components/Icon';
import Skeleton from '../components/Skeleton';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  createNqQuizService,
  secondsRemaining,
  formatQuizTime,
  validateParticipantInfo,
  formatCertificateDate,
  canViewNqCertificate
} from '../services/nqQuizService';
import { NqCertificate } from '../components/NqCertificate';

const service = createNqQuizService(supabase);

export function NqQuiz() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();

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

  // Participant Registration Modal
  const [showParticipantModal, setShowParticipantModal] = useState(false);
  const [participantName, setParticipantName] = useState(() => profile?.full_name || '');
  const [participantOrg, setParticipantOrg] = useState(() => profile?.organization_name || profile?.branch_name || '');
  const [participantConfirmed, setParticipantConfirmed] = useState(false);
  const [participantError, setParticipantError] = useState('');
  const [isResumingWithoutParticipant, setIsResumingWithoutParticipant] = useState(false);
  const [refreshingCertificate, setRefreshingCertificate] = useState(false);

  // Certificate Modal
  const [showCertModal, setShowCertModal] = useState(false);

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
      setShowParticipantModal(false);
      setIsResumingWithoutParticipant(false);
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
        if (searchParams.get('view') === 'lookup') {
          setView('lookup');
        } else if (next.status === 'IN_PROGRESS') {
          const missingParticipant = !next.participant?.full_name || !next.participant?.organization_name;
          if (missingParticipant) {
            setIsResumingWithoutParticipant(true);
            setShowParticipantModal(true);
          } else {
            setIsResumingWithoutParticipant(false);
          }
          setView('attempt');
          try { pending.current = JSON.parse(localStorage.getItem(cacheKey(next.attempt_id)) || '{}'); } catch { pending.current = {}; }
          if (!missingParticipant) await flush();
        } else {
          setView('result');
        }
      } else if (searchParams.get('view') === 'lookup') {
        setView('lookup');
      }
    } catch {
      if (mounted.current) setError('Không thể tải lượt thi. Vui lòng thử lại.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [apply, cacheKey, flush, searchParams]);

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
    } catch (err) {
      setError(err?.code === 'PARTICIPANT_REQUIRED'
        ? 'Vui lòng xác nhận thông tin người dự thi trước khi nộp bài.'
        : 'Chưa nộp được bài. Hệ thống sẽ thử lại khi có mạng; thời gian vẫn tính theo máy chủ.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
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
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', sync);
      window.removeEventListener('focus', sync);
    };
  }, [view, state?.status, submit, flush, apply]);

  function openStartModal() {
    setError('');
    setParticipantError('');
    setParticipantConfirmed(false);
    setIsResumingWithoutParticipant(false);
    if (profile?.full_name && !participantName) {
      setParticipantName(profile.full_name);
    }
    if ((profile?.organization_name || profile?.branch_name) && !participantOrg) {
      setParticipantOrg(profile.organization_name || profile.branch_name || '');
    }
    setShowParticipantModal(true);
  }

  async function handleConfirmParticipant(e) {
    if (e) e.preventDefault();
    const validation = validateParticipantInfo(participantName, participantOrg);
    if (!validation.valid) {
      setParticipantError(validation.errors.fullName || validation.errors.organizationName || 'Thông tin không hợp lệ.');
      return;
    }
    if (!participantConfirmed) {
      setParticipantError('Vui lòng xác nhận thông tin trên là chính xác.');
      return;
    }

    setBusy(true);
    setParticipantError('');

    try {
      if (isResumingWithoutParticipant && state?.attempt_id) {
        await service.saveParticipant(state.attempt_id, validation.data.fullName, validation.data.organizationName);
        const resumed = {
          ...active.current,
          participant: {
            full_name: validation.data.fullName,
            organization_name: validation.data.organizationName
          }
        };
        apply(resumed);
        setShowParticipantModal(false);
        setIsResumingWithoutParticipant(false);
      } else {
        const next = await service.attempt('start');
        await service.saveParticipant(next.attempt_id, validation.data.fullName, validation.data.organizationName);
        next.participant = {
          full_name: validation.data.fullName,
          organization_name: validation.data.organizationName
        };
        apply(next);
        setIndex(0);
        setShowParticipantModal(false);
        setView('attempt');
      }
    } catch (err) {
      setParticipantError(err.message || 'Không thể bắt đầu bài thi. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
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
    setLookupLoading(true);
    setError('');
    try {
      const term = nextOffset ? lookupSearch : search;
      const rows = await service.lookup(term, nextOffset);
      if (version !== lookupVersion.current) return;
      if (!nextOffset) setLookupSearch(term);
      setResults((previous) => nextOffset ? [...previous, ...rows] : rows);
      setOffset(nextOffset + rows.length);
    } catch {
      if (version === lookupVersion.current) setError('Không thể tra cứu câu hỏi. Vui lòng thử lại.');
    } finally {
      if (version === lookupVersion.current) setLookupLoading(false);
    }
  }

  async function reloadResult() {
    if (!state?.attempt_id || refreshingCertificate) return;
    setRefreshingCertificate(true);
    setError('');
    try {
      const latest = await service.attempt('read', state.attempt_id);
      apply(latest);
      setView('result');
    } catch {
      setError('Không thể tải lại kết quả. Vui lòng thử lại.');
    } finally {
      setRefreshingCertificate(false);
    }
  }

  const question = state?.questions?.[index];
  const certificateAvailable = canViewNqCertificate(state?.passed, state?.certificate);
  const answered = Object.values(state?.answers || {}).filter(Boolean).length;
  const showOptions = (q, isReview = false) => (
    <div className="quiz-options">
      {q.options.map((option, optionIndex) => {
        const selected = state.answers[q.id] === option.id;
        const correct = isReview && q.correct_option_id === option.id;
        return (
          <label
            className={`quiz-option${selected ? ' selected' : ''}${correct ? ' nq-correct' : ''}`}
            key={option.id}
          >
            {!isReview && (
              <input
                type="radio"
                name={q.id}
                checked={selected}
                disabled={busy || remaining === 0}
                onChange={() => answer(q.id, option.id)}
              />
            )}
            <span className="quiz-option-letter">{'ABCD'[optionIndex]}</span>
            <span>
              {option.text}
              {isReview && (
                <small className="nq-option-note">
                  {selected ? 'Bạn chọn' : ''}
                  {selected && correct ? ' · ' : ''}
                  {correct ? 'Đáp án đúng' : ''}
                </small>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );

  return (
    <div className="page page--appbar quiz-screen nq-screen">
      <PageHeader
        title={view === 'lookup' ? 'Tra cứu 300 câu hỏi' : 'Kiểm tra học tập Nghị quyết'}
        back="/tri-thuc"
        navigate={navigate}
        variant="brand"
      />

      {error && (
        <div className="form-error" role="alert">
          {error}
          <Button variant="secondary" onClick={load}>Thử lại</Button>
        </div>
      )}

      {loading ? (
        <Skeleton lines={6} />
      ) : view === 'intro' ? (
        <article className="content-card nq-intro">
          <div className="nq-intro-badge-row">
            <span className="home-campaign-kicker">KIỂM TRA HỌC TẬP</span>
          </div>
          <h2 className="nq-intro-title">NGHỊ QUYẾT ĐẠI HỘI ĐOÀN TOÀN QUỐC LẦN THỨ XIII</h2>
          <p className="nq-intro-lead">
            Đợt sinh hoạt chính trị sâu rộng trong tuổi trẻ Công an tỉnh Phú Thọ nhằm nâng cao nhận thức, bản lĩnh chính trị và tinh thần tiên phong, hành động cách mạng.
          </p>

          <div className="nq-intro-meta-chips">
            <span className="nq-intro-chip">
              <Icon name="file" size={16} /> 30 câu hỏi ngẫu nhiên từ ngân hàng 300 câu
            </span>
            <span className="nq-intro-chip">
              <Icon name="clock" size={16} /> 20 phút làm bài
            </span>
            <span className="nq-intro-chip">
              <Icon name="shield" size={16} /> Đạt từ 80% (tối thiểu 24/30 câu đúng)
            </span>
          </div>

          <div className="nq-intro-rules-card">
            <h3 className="nq-intro-rules-title">Quy chế kiểm tra & Đánh giá</h3>
            <ul className="nq-intro-rules-list">
              <li>Mỗi lượt thi gồm <strong>30 câu hỏi ngẫu nhiên</strong> không trùng lặp trích từ bộ ngân hàng 300 câu hỏi trắc nghiệm Nghị quyết.</li>
              <li>Thứ tự câu hỏi và vị trí các phương án A, B, C, D được xáo trộn tự động.</li>
              <li>Thời gian làm bài là <strong>20 phút</strong>; khi hết thời gian, hệ thống tự động khóa đề và nộp bài.</li>
              <li>Đoàn viên, thanh niên hoàn thành đạt từ <strong>80%</strong> (tối thiểu <strong>24/30 câu đúng</strong>) sẽ được hệ thống cấp <strong>Chứng nhận điện tử</strong> chính thức có mã định danh và QR xác thực.</li>
              <li>Miễn phí, không yêu cầu mật khẩu. Thông tin người học được lưu trữ bảo mật.</li>
            </ul>
          </div>

          <div className="nq-intro-actions">
            <Button onClick={openStartModal} disabled={busy} variant="primary" className="nq-intro-start-btn">
              <Icon name="school" size={18} />
              <span>BẮT ĐẦU THI</span>
            </Button>
            <Button variant="secondary" onClick={() => setView('lookup')} className="nq-intro-lookup-btn">
              <Icon name="search" size={17} />
              <span>TRA CỨU 300 CÂU HỎI</span>
            </Button>
          </div>
        </article>
      ) : view === 'attempt' && question ? (
        <>
          <div className="quiz-progress-head">
            <strong>Câu {index + 1} / 30</strong>
            <strong aria-label="Thời gian còn lại" className="quiz-timer">
              <Icon name="clock" size={16} /> {formatQuizTime(remaining)}
            </strong>
          </div>
          <p className="text-muted">Đã trả lời {answered} / 30</p>

          <article className="content-card quiz-question-card">
            <h2>{question.text}</h2>
            {showOptions(question)}
          </article>

          <div className="nq-question-nav" aria-label="Chuyển đến câu hỏi">
            {state.questions.map((q, i) => (
              <button
                type="button"
                key={q.id}
                aria-label={`Câu ${i + 1}${state.answers[q.id] ? ', đã trả lời' : ', chưa trả lời'}`}
                aria-current={i === index ? 'step' : undefined}
                className={state.answers[q.id] ? 'selected' : ''}
                onClick={() => setIndex(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <div className="nq-actions">
            <Button variant="secondary" onClick={() => setIndex(index - 1)} disabled={index === 0 || busy}>
              Câu trước
            </Button>
            <Button variant="secondary" onClick={() => setIndex(index + 1)} disabled={index === 29 || busy}>
              Câu tiếp
            </Button>
            <Button onClick={() => submit()} disabled={busy}>
              {busy ? 'Đang nộp…' : 'Nộp bài'}
            </Button>
          </div>
        </>
      ) : view === 'result' && state ? (
        <>
          {state.passed ? (
            <article className="content-card nq-result nq-result--pass">
              <div className="nq-result-header">
                <div className="nq-result-badge nq-result-badge--pass">
                  <Icon name="shield" size={24} />
                  <span>ĐẠT YÊU CẦU</span>
                </div>
                <h2 className="nq-result-title">HOÀN THÀNH ĐẠT YÊU CẦU</h2>
                <p className="nq-result-subtitle">
                  Chúc mừng bạn đã hoàn thành đạt yêu cầu bài kiểm tra học tập Nghị quyết Đại hội Đoàn toàn quốc lần thứ XIII!
                </p>
              </div>

              <div className="nq-result-score-banner">
                <span className="nq-result-score-main">{state.correct} / 30</span>
                <span className="nq-result-score-pct">{state.percentage}%</span>
              </div>

              <div className="nq-result-stats-grid">
                <div className="nq-stat-box">
                  <strong>{state.correct}</strong>
                  <small>Câu đúng</small>
                </div>
                <div className="nq-stat-box">
                  <strong>{state.wrong}</strong>
                  <small>Câu sai</small>
                </div>
                <div className="nq-stat-box">
                  <strong>{state.unanswered}</strong>
                  <small>Chưa làm</small>
                </div>
                <div className="nq-stat-box">
                  <strong>{Math.floor(state.elapsed_seconds / 60)}p {state.elapsed_seconds % 60}s</strong>
                  <small>Thời gian</small>
                </div>
              </div>

              <div className="nq-result-participant-info">
                <div className="nq-result-info-row">
                  <span>Họ và tên:</span>
                  <strong>{state.certificate?.full_name || state.participant?.full_name || 'Đồng chí dự thi'}</strong>
                </div>
                <div className="nq-result-info-row">
                  <span>Đơn vị:</span>
                  <strong>{state.certificate?.organization_name || state.participant?.organization_name || 'Công an tỉnh Phú Thọ'}</strong>
                </div>
                <div className="nq-result-info-row">
                  <span>Ngày hoàn thành:</span>
                  <strong>{formatCertificateDate(state.certificate?.issued_at || state.submitted_at)}</strong>
                </div>
                {certificateAvailable && (
                  <div className="nq-result-info-row">
                    <span>Mã chứng nhận:</span>
                    <code className="nq-cert-code-tag">{state.certificate.code}</code>
                  </div>
                )}
              </div>

              {!certificateAvailable && (
                <div className="nq-certificate-pending" role="status">
                  <p>Kết quả đã đạt yêu cầu nhưng chứng nhận chưa được cấp. Vui lòng tải lại hoặc liên hệ quản trị hệ thống.</p>
                  <Button variant="secondary" onClick={reloadResult} disabled={refreshingCertificate}>
                    {refreshingCertificate ? 'Đang tải lại…' : 'TẢI LẠI KẾT QUẢ'}
                  </Button>
                </div>
              )}

              {state.status === 'EXPIRED' && (
                <p className="nq-result-expired-notice">Bài thi đã được hệ thống tự động nộp khi hết 20 phút.</p>
              )}

              <div className="nq-result-actions">
                {certificateAvailable && (
                  <Button onClick={() => setShowCertModal(true)} variant="primary" className="nq-cert-btn">
                    <Icon name="school" size={18} />
                    <span>XEM CHỨNG NHẬN</span>
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setReview(!review)}>
                  <Icon name="file" size={16} />
                  <span>{review ? 'Ẩn đáp án' : 'Xem lại đáp án'}</span>
                </Button>
                <Button variant="outline" onClick={openStartModal} disabled={busy}>
                  <span>Làm đề khác</span>
                </Button>
                <Button variant="outline" onClick={() => setView('lookup')}>
                  <span>Tra cứu 300 câu hỏi</span>
                </Button>
              </div>
            </article>
          ) : (
            <article className="content-card nq-result nq-result--fail">
              <div className="nq-result-header">
                <div className="nq-result-badge nq-result-badge--fail">
                  <Icon name="alert" size={24} />
                  <span>CHƯA ĐẠT</span>
                </div>
                <h2 className="nq-result-title">CHƯA ĐẠT YÊU CẦU</h2>
                <p className="nq-result-subtitle">
                  Bạn cần thêm {Math.max(1, 24 - state.correct)} câu đúng để đạt yêu cầu (tối thiểu 24/30 câu đúng, tương đương từ 80%).
                </p>
              </div>

              <div className="nq-result-score-banner nq-score-banner--fail">
                <span className="nq-result-score-main">{state.correct} / 30</span>
                <span className="nq-result-score-pct">{state.percentage}%</span>
              </div>

              <div className="nq-result-stats-grid">
                <div className="nq-stat-box">
                  <strong>{state.correct}</strong>
                  <small>Câu đúng</small>
                </div>
                <div className="nq-stat-box">
                  <strong>{state.wrong}</strong>
                  <small>Câu sai</small>
                </div>
                <div className="nq-stat-box">
                  <strong>{state.unanswered}</strong>
                  <small>Chưa làm</small>
                </div>
                <div className="nq-stat-box">
                  <strong>{Math.floor(state.elapsed_seconds / 60)}p {state.elapsed_seconds % 60}s</strong>
                  <small>Thời gian</small>
                </div>
              </div>

              {state.status === 'EXPIRED' && (
                <p className="nq-result-expired-notice">Bài thi đã được hệ thống tự động nộp khi hết 20 phút.</p>
              )}

              <div className="nq-result-actions">
                <Button onClick={openStartModal} variant="primary" disabled={busy}>
                  <Icon name="arrow" size={18} />
                  <span>THI LẠI</span>
                </Button>
                <Button variant="secondary" onClick={() => setReview(!review)}>
                  <Icon name="file" size={16} />
                  <span>{review ? 'Ẩn đáp án' : 'Xem lại đáp án'}</span>
                </Button>
                <Button variant="outline" onClick={() => setView('lookup')}>
                  <span>Tra cứu 300 câu hỏi</span>
                </Button>
              </div>
            </article>
          )}

          {review && state.questions.map((q, i) => (
            <article className="content-card quiz-question-card" key={q.id}>
              <h3>Câu {i + 1} · Câu gốc {q.question_number}</h3>
              <h2>{q.text}</h2>
              {!state.answers[q.id] && <p className="text-warning">Chưa trả lời</p>}
              {showOptions(q, true)}
            </article>
          ))}
        </>
      ) : view === 'lookup' ? (
        <>
          <form className="nq-search" onSubmit={lookup}>
            <input
              aria-label="Số câu hoặc từ khóa"
              placeholder="Câu 125 hoặc từ khóa"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={200}
            />
            <Button type="submit" disabled={lookupLoading}>Tìm</Button>
          </form>
          {results.map((q) => (
            <article className="content-card quiz-question-card" key={q.question_number}>
              <h3>Câu {q.question_number}</h3>
              <h2>{q.text}</h2>
              <ol className="nq-lookup-options">
                {q.options.map((o) => (
                  <li key={o.label}><b>{o.label}.</b> {o.text}</li>
                ))}
              </ol>
              <p className="nq-key">Đáp án đúng: {q.correct_answer}</p>
            </article>
          ))}
          {!lookupLoading && results.length === 0 && <p>Nhập số câu hoặc từ khóa để tra cứu.</p>}
          {offset > 0 && offset % 20 === 0 && (
            <Button variant="secondary" disabled={lookupLoading || search !== lookupSearch} onClick={() => lookup(null, offset)}>
              Xem thêm
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => setView(state ? (state.status === 'IN_PROGRESS' ? 'attempt' : 'result') : 'intro')}
          >
            Quay lại bài thi
          </Button>
        </>
      ) : null}

      {/* Participant Registration Modal */}
      {showParticipantModal && (
        <div className="nq-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="participant-modal-title">
          <div className="nq-modal-card">
            <div className="nq-modal-header">
              <h3 id="participant-modal-title">Thông tin người dự thi</h3>
              {!isResumingWithoutParticipant && (
                <button
                  type="button"
                  className="nq-modal-close"
                  onClick={() => setShowParticipantModal(false)}
                  aria-label="Đóng"
                >
                  <Icon name="close" size={20} />
                </button>
              )}
            </div>

            <p className="nq-modal-notice">
              Họ tên, đơn vị và kết quả hoàn thành có thể hiển thị trên trang xác minh công khai khi người khác có mã chứng nhận hoặc QR.
            </p>

            <form onSubmit={handleConfirmParticipant} className="nq-participant-form">
              <div className="form-group">
                <label htmlFor="nq-full-name">
                  Họ và tên <span className="text-danger">*</span>
                </label>
                <input
                  id="nq-full-name"
                  type="text"
                  value={participantName}
                  onChange={(e) => setParticipantName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn An"
                  maxLength={120}
                  required
                  autoFocus
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="nq-org-name">
                  Đơn vị <span className="text-danger">*</span>
                </label>
                <input
                  id="nq-org-name"
                  type="text"
                  value={participantOrg}
                  onChange={(e) => setParticipantOrg(e.target.value)}
                  placeholder="Ví dụ: Chi đoàn Phòng An ninh mạng"
                  maxLength={180}
                  required
                  className="form-input"
                />
              </div>

              <div className="form-checkbox-row">
                <input
                  id="nq-confirm-checkbox"
                  type="checkbox"
                  checked={participantConfirmed}
                  onChange={(e) => setParticipantConfirmed(e.target.checked)}
                  required
                />
                <label htmlFor="nq-confirm-checkbox">
                  Tôi xác nhận thông tin chính xác và đồng ý hiển thị các nội dung trên khi tra cứu chứng nhận bằng mã hoặc QR.
                </label>
              </div>

              {participantError && (
                <div className="form-error" role="alert">
                  {participantError}
                </div>
              )}

              <div className="nq-modal-actions">
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy ? 'Đang xử lý…' : isResumingWithoutParticipant ? 'Xác nhận thông tin' : 'Xác nhận và Bắt đầu'}
                </Button>
                {!isResumingWithoutParticipant && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowParticipantModal(false)}
                    disabled={busy}
                  >
                    Hủy
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Certificate Viewer Modal */}
      {showCertModal && certificateAvailable && (
        <div
          className="nq-cert-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Chứng nhận hoàn thành bài kiểm tra"
          onClick={() => setShowCertModal(false)}
        >
          <div className="nq-cert-modal-content" onClick={(e) => e.stopPropagation()}>
            <NqCertificate
              certificate={certificateAvailable ? state.certificate : null}
              onClose={() => setShowCertModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
