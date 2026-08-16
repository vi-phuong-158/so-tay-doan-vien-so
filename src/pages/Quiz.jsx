import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Button, EmptyState, PageHeader } from '../components/common';
import Skeleton from '../components/Skeleton';
import { createQuizService } from '../services/quizService';
import { supabase } from '../services/supabaseClient';

const quizService = createQuizService(supabase);
const LIST_PATH = '/tri-thuc/chuyen-de';

const ERROR_MESSAGES = {
  ACCOUNT_NOT_ACTIVE: 'Tài khoản của bạn chưa được phép làm bài.',
  AUTHENTICATION_REQUIRED: 'Bạn cần đăng nhập để làm bài.',
  QUIZ_NOT_ACCESSIBLE: 'Bài trắc nghiệm không tồn tại hoặc bạn không có quyền truy cập.',
  MAX_ATTEMPTS_REACHED: 'Bạn đã dùng hết số lần làm bài cho phép.',
  TOPIC_CLOSED: 'Chuyên đề đã đóng, không thể bắt đầu lượt làm mới.',
  QUIZ_HAS_NO_QUESTIONS: 'Bài trắc nghiệm chưa có câu hỏi để làm.',
  ATTEMPT_EXPIRED: 'Lượt làm bài đã hết thời gian. Kết quả chưa được ghi nhận.',
  ATTEMPT_ALREADY_SUBMITTED: 'Lượt làm bài này đã được nộp trước đó.',
  REQUEST_FAILED: 'Không thể tải bài trắc nghiệm. Vui lòng thử lại.'
};

function errorMessage(error) {
  return ERROR_MESSAGES[error?.code] || 'Không thể hoàn tất thao tác. Vui lòng thử lại.';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN');
}

function IntroView({ quiz, onStart, starting }) {
  const limited = quiz.attemptsRemaining !== null && quiz.attemptsRemaining <= 0;
  const blocked = !quiz.topicOpen || limited;
  return (
    <>
      <div className="detail-hero">
        <span className="status status-info">TRẮC NGHIỆM</span>
        <h2>{quiz.title}</h2>
        {quiz.description && <p>{quiz.description}</p>}
        <div className="info-grid">
          <div><span>Điểm đạt</span><strong>{quiz.passScore}%</strong></div>
          <div><span>Số câu hỏi</span><strong>{quiz.questionCount}</strong></div>
          <div><span>Thời gian</span><strong>{quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} phút` : 'Không giới hạn'}</strong></div>
          <div><span>Lượt còn lại</span><strong>{quiz.attemptsRemaining ?? 'Không giới hạn'}</strong></div>
        </div>
      </div>
      {quiz.hasActiveAttempt && (
        <div className="form-error" role="status">Bạn có một lượt làm bài chưa hoàn tất. Nút bên dưới sẽ tiếp tục lượt đó.</div>
      )}
      {!quiz.topicOpen && <div className="form-error" role="alert">Chuyên đề đã đóng.</div>}
      {limited && !quiz.hasActiveAttempt && <div className="form-error" role="alert">Bạn đã hết lượt làm bài.</div>}
      <div className="sticky-action">
        <Button onClick={onStart} disabled={starting || blocked}>
          {starting ? 'Đang mở bài…' : quiz.hasActiveAttempt ? 'Tiếp tục làm bài' : 'Bắt đầu làm bài'}
        </Button>
      </div>
    </>
  );
}

function AttemptView({ questions, answers, currentIndex, onAnswer, onPrevious, onNext, onSubmit, submitting, expiresAt }) {
  const question = questions[currentIndex];
  const selected = answers[question.id] || [];
  const progress = Math.round(((currentIndex + 1) / questions.length) * 100);
  const last = currentIndex === questions.length - 1;
  return (
    <div className="quiz-page">
      <div className="quiz-progress-head"><span>Câu {currentIndex + 1}/{questions.length}</span><span>{progress}%</span></div>
      <div className="progress" aria-label={`Tiến độ ${progress}%`}><span style={{ width: `${progress}%` }} /></div>
      {expiresAt && <p className="quiz-time-limit"><Icon name="clock" size={15} /> Hạn nộp server: {formatDate(expiresAt)}</p>}
      <article className="content-card quiz-question-card">
        <span className="status status-info">{question.type === 'MULTIPLE' ? 'Chọn nhiều đáp án' : 'Chọn một đáp án'}</span>
        <h2>{question.text}</h2>
        <div className="quiz-options">
          {question.options.map((option) => {
            const checked = selected.includes(option.id);
            return (
              <label className={`quiz-option${checked ? ' selected' : ''}`} key={option.id}>
                <input
                  type={question.type === 'MULTIPLE' ? 'checkbox' : 'radio'}
                  name={question.id}
                  checked={checked}
                  onChange={() => onAnswer(question, option.id)}
                />
                <span>{option.text}</span>
              </label>
            );
          })}
        </div>
      </article>
      <div className="quiz-nav">
        <Button variant="secondary" onClick={onPrevious} disabled={currentIndex === 0 || submitting}>Quay lại</Button>
        {last ? (
          <Button onClick={onSubmit} disabled={submitting}>{submitting ? 'Đang nộp…' : 'Nộp bài'}</Button>
        ) : (
          <Button onClick={onNext} disabled={submitting}>Câu tiếp theo</Button>
        )}
      </div>
    </div>
  );
}

function ResultView({ result, details, onBack }) {
  return (
    <>
      <div className="detail-hero">
        <span className={`status status-${result.passed ? 'success' : 'danger'}`}>{result.passed ? 'ĐẠT' : 'CHƯA ĐẠT'}</span>
        <h2>{result.score}%</h2>
        <p>Lượt {result.attemptNumber} · Nộp lúc {formatDate(result.submittedAt)}</p>
      </div>
      {details.length > 0 && (
        <div className="result-list">
          {details.map((item) => (
            <article key={item.questionId}>
              <span className={item.isCorrect ? 'done' : ''}><Icon name={item.isCorrect ? 'check' : 'alert'} size={16} /></span>
              <div><h3>{item.questionText}</h3><p>{item.isCorrect ? 'Đúng' : 'Chưa chính xác'} · {item.awardedPoints}/{item.points} điểm</p></div>
            </article>
          ))}
        </div>
      )}
      <div className="sticky-action">
        <Button variant="secondary" onClick={onBack}>Về chuyên đề</Button>
      </div>
    </>
  );
}

export function Quiz() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState('loading');
  const [quiz, setQuiz] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [details, setDetails] = useState([]);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadIntro = useCallback(() => {
    let mounted = true;
    setView('loading');
    setError(null);
    quizService.getQuiz(quizId)
      .then((data) => { if (mounted) { setQuiz(data); setView('intro'); } })
      .catch((requestError) => { if (mounted) { setError(requestError); setView('error'); } });
    return () => { mounted = false; };
  }, [quizId]);

  useEffect(() => {
    let cleanup;
    const timer = setTimeout(() => { cleanup = loadIntro(); }, 0);
    return () => { clearTimeout(timer); cleanup?.(); };
  }, [loadIntro]);

  const start = async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const nextAttempt = await quizService.startAttempt(quizId);
      const nextQuestions = await quizService.getAttemptQuestions(nextAttempt.attemptId);
      setAttempt(nextAttempt);
      setQuestions(nextQuestions);
      setAnswers({});
      setCurrentIndex(0);
      setView('attempt');
    } catch (requestError) {
      setError(requestError);
      if (requestError.code === 'MAX_ATTEMPTS_REACHED' || requestError.code === 'TOPIC_CLOSED') setView('intro');
    } finally {
      setStarting(false);
    }
  };

  const onAnswer = (question, optionId) => {
    setAnswers((previous) => {
      const selected = previous[question.id] || [];
      const next = question.type === 'MULTIPLE'
        ? (selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId])
        : [optionId];
      return { ...previous, [question.id]: next };
    });
  };

  const submit = async () => {
    if (submitting || !attempt) return;
    if (!window.confirm('Bạn chắc chắn muốn nộp bài? Sau khi nộp, câu trả lời không thể sửa.')) return;
    setSubmitting(true);
    setError(null);
    const payload = questions.map((question) => ({
      question_id: question.id,
      selected_option_ids: answers[question.id] || []
    }));
    try {
      const submitted = await quizService.submitAttempt(attempt.attemptId, payload);
      setResult(submitted);
      try { setDetails(await quizService.getMyAttemptResult(attempt.attemptId)); } catch { setDetails([]); }
      setView('result');
    } catch (requestError) {
      setError(requestError);
      if (requestError.code === 'ATTEMPT_EXPIRED' || requestError.code === 'ATTEMPT_ALREADY_SUBMITTED') setView('error');
    } finally {
      setSubmitting(false);
    }
  };

  const errorTitle = useMemo(() => error?.code === 'AUTHENTICATION_REQUIRED' ? 'Cần đăng nhập' : 'Không thể mở bài', [error]);

  if (view === 'loading') return <div className="page"><PageHeader title="Trắc nghiệm" back={LIST_PATH} navigate={navigate} /><Skeleton lines={8} /></div>;
  if (view === 'error') return <div className="page"><PageHeader title="Trắc nghiệm" back={LIST_PATH} navigate={navigate} /><EmptyState icon="alert" title={errorTitle} description={errorMessage(error)} action="Thử lại" onAction={loadIntro} /></div>;

  return (
    <div className="page">
      <PageHeader title={view === 'result' ? 'Kết quả trắc nghiệm' : quiz?.title || 'Trắc nghiệm'} back={LIST_PATH} navigate={navigate} />
      {error && <div className="form-error" role="alert">{errorMessage(error)}</div>}
      {view === 'intro' && quiz && <IntroView quiz={quiz} onStart={start} starting={starting} />}
      {view === 'attempt' && questions.length > 0 && (
        <AttemptView
          questions={questions}
          answers={answers}
          currentIndex={currentIndex}
          onAnswer={onAnswer}
          onPrevious={() => setCurrentIndex((index) => Math.max(0, index - 1))}
          onNext={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))}
          onSubmit={submit}
          submitting={submitting}
          expiresAt={attempt?.expiresAt}
        />
      )}
      {view === 'result' && result && <ResultView result={result} details={details} onBack={() => navigate(LIST_PATH)} />}
      {view === 'attempt' && questions.length === 0 && <EmptyState icon="alert" title="Bài chưa sẵn sàng" description="Bài trắc nghiệm chưa có câu hỏi." />}
      <Link className="quiz-back-link" to={LIST_PATH}>Quay lại kho tri thức</Link>
    </div>
  );
}
