import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Layers3,
  Maximize,
  Moon,
  RotateCcw,
  Send,
  Settings2,
  Shuffle,
  Sun,
  Trophy,
  X,
} from 'lucide-react';
import type { ExamFile, PracticeSettings, Question, Session } from './types';

const SET_SIZE = 65;
const DATA_FILES = Array.from(
  { length: 11 },
  (_, i) => `/data/exam-${String(i + 1).padStart(2, '0')}.json`,
);
const SESSION_KEY = 'aws-saa-practice-session-v1';
const SETTINGS_KEY = 'aws-saa-practice-settings-v1';
const DEFAULT_SETTINGS: PracticeSettings = {
  shuffleQuestions: true,
  autoSubmit: true,
  examMode: false,
};

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${hours > 0 ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function sameAnswers(selected: string[], correct: string[]): boolean {
  return (
    selected.length > 0 &&
    correct.length > 0 &&
    selected.length === correct.length &&
    selected.every((answer) => correct.includes(answer))
  );
}

function App() {
  const [examFiles, setExamFiles] = useState<ExamFile[]>([]);
  const [loadError, setLoadError] = useState('');
  const [settings, setSettings] = useState<PracticeSettings>(() =>
    loadStored(SETTINGS_KEY, DEFAULT_SETTINGS),
  );
  const [session, setSession] = useState<Session | null>(null);
  const [savedSession, setSavedSession] = useState<Session | null>(() =>
    loadStored<Session | null>(SESSION_KEY, null),
  );
  const [selectedSet, setSelectedSet] = useState(1);
  const [remaining, setRemaining] = useState(0);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      DATA_FILES.map(async (path) => {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Không thể tải dữ liệu ${path}`);
        return (await response.json()) as ExamFile;
      }),
    )
      .then((files) => {
        if (!cancelled) setExamFiles(files);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setLoadError(error instanceof Error ? error.message : 'Không thể tải bộ câu hỏi.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);
  useEffect(() => {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setSavedSession(session);
    }
  }, [session]);

  const allQuestions = useMemo(() => examFiles.flatMap((file) => file.questions), [examFiles]);
  const totalQuestions = allQuestions.length;
  const setCount = Math.ceil(totalQuestions / SET_SIZE);
  const selectedStart = (selectedSet - 1) * SET_SIZE;
  const selectedEnd = Math.min(selectedStart + SET_SIZE, totalQuestions);

  const submitSession = useCallback((current: Session) => {
    setSession({ ...current, submitted: true });
    setShowSubmitDialog(false);
  }, []);

  useEffect(() => {
    if (!session || session.submitted) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
      const nextRemaining = Math.max(0, session.durationSeconds - elapsed);
      setRemaining(nextRemaining);
      if (nextRemaining === 0 && session.settings.autoSubmit) submitSession(session);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [session, submitSession]);

  const startSession = (setNumber: number, existing?: Session) => {
    if (existing) {
      setSelectedSet(existing.setNumber);
      setSession(existing);
      return;
    }
    const start = (setNumber - 1) * SET_SIZE;
    const end = Math.min(start + SET_SIZE, allQuestions.length);
    const questions = allQuestions.slice(start, end);
    const globalIndexes = questions.map((_, index) => start + index);
    const ordered = settings.shuffleQuestions
      ? shuffle(
          questions.map((question, index) => ({ question, globalIndex: globalIndexes[index] })),
        )
      : questions.map((question, index) => ({ question, globalIndex: globalIndexes[index] }));
    const durationSeconds = (examFiles[0]?.settings?.durationMinutes ?? 130) * 60;
    setSelectedSet(setNumber);
    setSession({
      setNumber,
      questions: ordered.map((item) => item.question),
      globalIndexes: ordered.map((item) => item.globalIndex),
      answers: {},
      optionOrders: Object.fromEntries(
        ordered.map(({ question }) => [
          question.id,
          settings.examMode
            ? shuffle(question.options).map((option) => option.id)
            : question.options.map((option) => option.id),
        ]),
      ),
      confirmed: [],
      currentIndex: 0,
      startedAt: Date.now(),
      durationSeconds,
      settings: { ...settings },
      submitted: false,
    });
  };

  const updateSession = (updater: (current: Session) => Session) => {
    setSession((current) => (current ? updater(current) : current));
  };

  const activeQuestion = session?.questions[session.currentIndex];
  const activeAnswer = activeQuestion ? (session?.answers[activeQuestion.id] ?? []) : [];
  const isConfirmed = Boolean(activeQuestion && session?.confirmed.includes(activeQuestion.id));
  const answeredCount = session
    ? Object.values(session.answers).filter((answers) => answers.length > 0).length
    : 0;
  const correctCount = session
    ? session.questions.filter((question) =>
        sameAnswers(session.answers[question.id] ?? [], question.correctAnswers),
      ).length
    : 0;
  const scorePercent = session?.questions.length
    ? Math.round((correctCount / session.questions.length) * 100)
    : 0;
  const isDark = darkMode;

  const chooseOption = (optionId: string) => {
    if (
      !activeQuestion ||
      !session ||
      session.submitted ||
      (session.settings.examMode && isConfirmed)
    )
      return;
    updateSession((current) => {
      const existing = current.answers[activeQuestion.id] ?? [];
      let next: string[];
      if (activeQuestion.type === 'multi-select') {
        next = existing.includes(optionId)
          ? existing.filter((id) => id !== optionId)
          : [...existing, optionId];
      } else {
        next = [optionId];
      }
      return { ...current, answers: { ...current.answers, [activeQuestion.id]: next } };
    });
  };

  const confirmAnswer = () => {
    if (!activeQuestion || !session || activeAnswer.length === 0) return;
    updateSession((current) => ({
      ...current,
      confirmed: current.confirmed.includes(activeQuestion.id)
        ? current.confirmed
        : [...current.confirmed, activeQuestion.id],
    }));
  };

  const goToQuestion = (index: number) =>
    updateSession((current) => ({
      ...current,
      currentIndex: Math.max(0, Math.min(index, current.questions.length - 1)),
    }));
  const nextQuestion = () => {
    if (!session) return;
    if (session.currentIndex < session.questions.length - 1) goToQuestion(session.currentIndex + 1);
    else setShowSubmitDialog(true);
  };

  const beginNewSet = (setNumber: number) => {
    const inProgress = (session && !session.submitted) || (savedSession && !savedSession.submitted);
    if (
      inProgress &&
      !window.confirm(
        'Bài thi hiện tại chưa nộp. Bắt đầu set mới sẽ thay thế tiến độ đang làm. Bạn có muốn tiếp tục?',
      )
    )
      return;
    localStorage.removeItem(SESSION_KEY);
    setSavedSession(null);
    setSession(null);
    setSelectedSet(setNumber);
    window.setTimeout(() => startSession(setNumber), 0);
  };

  const exitToHome = () => {
    if (
      session &&
      !session.submitted &&
      !window.confirm('Tiến độ sẽ được lưu để bạn có thể tiếp tục sau. Quay về trang chọn set?')
    )
      return;
    if (session?.submitted) {
      localStorage.removeItem(SESSION_KEY);
      setSavedSession(null);
    } else if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setSavedSession(session);
    }
    setSession(null);
  };

  if (loadError) {
    return (
      <main className="load-state">
        <div className="load-card">
          <CircleHelp size={34} />
          <h1>Không tải được bộ câu hỏi</h1>
          <p>{loadError}</p>
          <p>Hãy chạy ứng dụng qua Vite, không mở trực tiếp file HTML.</p>
        </div>
      </main>
    );
  }
  if (examFiles.length === 0) {
    return (
      <main className="load-state">
        <div className="load-card">
          <div className="loader" />
          <h1>Đang tải bộ câu hỏi...</h1>
          <p>Đang chuẩn bị {DATA_FILES.length} file JSON.</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className={`app-shell home-shell ${isDark ? 'dark' : ''}`}>
        <header className="home-header">
          <div className="eyebrow">
            <Layers3 size={15} /> PRACTICE SETS
          </div>
          <div className="header-row">
            <div>
              <h1>AWS Certified Solutions Architect – Associate</h1>
              <p className="subtitle">
                {totalQuestions} practice questions — pick a set or go random.
              </p>
            </div>
            <button
              className="icon-button theme-button"
              aria-label="Đổi giao diện"
              onClick={() => setDarkMode(!darkMode)}
            >
              {isDark ? <Sun /> : <Moon />}
            </button>
          </div>
        </header>

        {savedSession && !savedSession.submitted && (
          <section className="resume-banner">
            <div className="resume-icon">
              <CircleHelp size={22} />
            </div>
            <div className="resume-copy">
              <strong>You have an exam in progress — Set {savedSession.setNumber}</strong>
              <span>
                {Object.values(savedSession.answers).filter((a) => a.length > 0).length} /{' '}
                {savedSession.questions.length} questions answered
              </span>
            </div>
            <button
              className="primary-button"
              onClick={() => startSession(savedSession.setNumber, savedSession)}
            >
              <ArrowRight size={18} /> Continue
            </button>
          </section>
        )}

        <section className="panel">
          <div className="panel-heading">
            <div className="section-icon">
              <Layers3 size={21} />
            </div>
            <div>
              <h2>1. Chọn set luyện tập</h2>
              <p>{setCount} sets · 65 questions/set (last set may have fewer)</p>
            </div>
          </div>
          <div className="set-grid">
            {Array.from({ length: setCount }, (_, index) => {
              const number = index + 1;
              const start = index * SET_SIZE + 1;
              const end = Math.min((index + 1) * SET_SIZE, totalQuestions);
              return (
                <button
                  key={number}
                  className={`set-card ${selectedSet === number ? 'selected' : ''}`}
                  onClick={() => setSelectedSet(number)}
                >
                  <strong>Set {number}</strong>
                  <span>
                    Q{start}–{end}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="selected-set-footer">
            <span>
              Đã chọn <strong>Set {selectedSet}</strong> · {selectedEnd - selectedStart} câu hỏi
            </span>
            <button className="primary-button" onClick={() => beginNewSet(selectedSet)}>
              <ArrowRight size={18} /> Bắt đầu luyện tập
            </button>
            <button
              className="secondary-button"
              onClick={() => beginNewSet(Math.floor(Math.random() * setCount) + 1)}
            >
              <Shuffle size={17} /> Set ngẫu nhiên
            </button>
          </div>
        </section>

        <section className="panel settings-panel">
          <div className="panel-heading">
            <div className="section-icon">
              <Settings2 size={21} />
            </div>
            <div>
              <h2>2. Tùy chọn bài thi</h2>
              <p>Điều chỉnh cách luyện tập trước khi bắt đầu</p>
            </div>
          </div>
          <div className="settings-grid">
            <SettingCard
              icon={<Shuffle size={21} />}
              title="Shuffle Questions"
              description="Randomise question order every session"
              active={settings.shuffleQuestions}
              onToggle={() => setSettings((s) => ({ ...s, shuffleQuestions: !s.shuffleQuestions }))}
              color="blue"
            />
            <SettingCard
              icon={<Send size={21} />}
              title="Auto-Submit"
              description="Submit automatically when time runs out"
              active={settings.autoSubmit}
              onToggle={() => setSettings((s) => ({ ...s, autoSubmit: !s.autoSubmit }))}
              color="coral"
            />
            <SettingCard
              icon={<CircleHelp size={21} />}
              title="Exam Mode"
              description="Hide answers until you submit, and shuffle answer order"
              active={settings.examMode}
              onToggle={() => setSettings((s) => ({ ...s, examMode: !s.examMode }))}
              color="purple"
            />
          </div>
        </section>
        <footer className="home-footer">
          AWS SAA-C03 · Dữ liệu câu hỏi được lưu cục bộ trên trình duyệt của bạn.
        </footer>
      </main>
    );
  }

  if (session.submitted) {
    const reviewItems = session.questions.map((question, index) => ({
      question,
      index,
      selected: session.answers[question.id] ?? [],
      correct: sameAnswers(session.answers[question.id] ?? [], question.correctAnswers),
    }));
    return (
      <main className={`app-shell results-shell ${isDark ? 'dark' : ''}`}>
        <header className="results-header">
          <div className="brand-mark">
            CERT<span>LAB</span>
          </div>
          <button
            className="secondary-button"
            onClick={() => {
              setSession(null);
              setSavedSession(null);
              localStorage.removeItem(SESSION_KEY);
            }}
          >
            <ArrowLeft size={17} /> Về trang chủ
          </button>
        </header>
        <section className="results-card">
          <div className="trophy-icon">
            <Trophy size={32} />
          </div>
          <p className="result-kicker">SET {session.setNumber} COMPLETED</p>
          <h1>{scorePercent >= 72 ? 'Làm tốt lắm!' : 'Hãy tiếp tục luyện tập!'}</h1>
          <p className="result-subtitle">
            Kết quả luyện tập AWS Certified Solutions Architect – Associate
          </p>
          <div className="score-ring" style={{ '--score': `${scorePercent}%` } as CSSProperties}>
            <div>
              <strong>{scorePercent}%</strong>
              <span>Điểm số</span>
            </div>
          </div>
          <div className="result-stats">
            <div>
              <strong>{correctCount}</strong>
              <span>Đúng</span>
            </div>
            <div>
              <strong>{session.questions.length - correctCount}</strong>
              <span>Sai / bỏ trống</span>
            </div>
            <div>
              <strong>{answeredCount}</strong>
              <span>Đã trả lời</span>
            </div>
          </div>
          <div className="result-actions">
            <button className="primary-button" onClick={() => beginNewSet(session.setNumber)}>
              <RotateCcw size={17} /> Làm lại set này
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                setSession(null);
                setSavedSession(null);
                localStorage.removeItem(SESSION_KEY);
              }}
            >
              Chọn set khác
            </button>
          </div>
        </section>
        <section className="panel review-panel">
          <div className="panel-heading">
            <div className="section-icon">
              <CheckCircle2 size={21} />
            </div>
            <div>
              <h2>Review câu trả lời</h2>
              <p>Tổng hợp đáp án đã chọn và trạng thái đúng/sai của từng câu.</p>
            </div>
          </div>
          <div className="review-list">
            {reviewItems.map(({ question, index, selected, correct }) => (
              <div
                className={`review-row ${correct ? 'is-correct' : 'is-wrong'}`}
                key={question.id}
              >
                <span className="review-status">
                  {correct ? <Check size={16} /> : <X size={16} />}
                </span>
                <span className="review-text">
                  <strong>Câu {index + 1}</strong>
                  <span>{question.question}</span>
                </span>
                <span className="review-answer">
                  {selected.length ? selected.join(', ') : 'Chưa trả lời'}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (!activeQuestion) return null;
  const correct = sameAnswers(activeAnswer, activeQuestion.correctAnswers);
  const revealAnswer = !session.settings.examMode && isConfirmed;
  const questionStatus = (question: Question) => {
    if (session.confirmed.includes(question.id) && !session.settings.examMode)
      return sameAnswers(session.answers[question.id] ?? [], question.correctAnswers)
        ? 'correct'
        : 'wrong';
    return (session.answers[question.id] ?? []).length > 0 ? 'answered' : 'empty';
  };
  const optionOrder = session.optionOrders?.[activeQuestion.id];
  const visibleOptions = optionOrder
    ? [...activeQuestion.options].sort(
        (a, b) => optionOrder.indexOf(a.id) - optionOrder.indexOf(b.id),
      )
    : activeQuestion.options;

  return (
    <main className={`app-shell exam-shell ${isDark ? 'dark' : ''}`}>
      <header className="exam-topbar">
        <button className="brand-mark" onClick={exitToHome} aria-label="Về trang chủ">
          CERT<span>LAB</span>
        </button>
        <div className={`timer-pill ${remaining < 300 ? 'timer-warning' : ''}`}>
          <Clock3 size={18} /> {formatTime(remaining)}
        </div>
        <div className="top-actions">
          <button
            className="icon-button"
            aria-label="Đổi giao diện"
            onClick={() => setDarkMode(!darkMode)}
          >
            {isDark ? <Sun /> : <Moon />}
          </button>
          <button
            className="secondary-button fullscreen-button"
            onClick={() =>
              document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen?.()
            }
          >
            <Maximize size={16} /> Fullscreen
          </button>
        </div>
      </header>
      <div className={`exam-layout ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
        {sidebarOpen && (
          <aside className="question-sidebar">
            <div className="sidebar-heading">
              <span>▥ &nbsp; QUESTION MAP</span>
              <button onClick={() => setSidebarOpen(false)} aria-label="Thu gọn danh sách">
                <ArrowLeft size={17} />
              </button>
            </div>
            <div className="progress-area">
              <div>
                <span>PROGRESS</span>
                <strong>
                  {answeredCount}
                  <small>/{session.questions.length}</small>
                </strong>
              </div>
              <div className="progress-track">
                <span style={{ width: `${(answeredCount / session.questions.length) * 100}%` }} />
              </div>
            </div>
            <div className="question-map">
              {session.questions.map((question, index) => (
                <button
                  key={question.id}
                  onClick={() => goToQuestion(index)}
                  className={`map-number ${index === session.currentIndex ? 'current' : ''} ${questionStatus(question)}`}
                  title={`Câu ${index + 1}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
            <div className="map-legend">
              <span>
                <i className="legend-current" />
                Current
              </span>
              <span>
                <i className="legend-correct" />
                Correct
              </span>
              <span>
                <i className="legend-wrong" />
                Wrong
              </span>
              <span>
                <i className="legend-empty" />
                Not done
              </span>
            </div>
            <button className="submit-sidebar" onClick={() => setShowSubmitDialog(true)}>
              <Send size={16} /> SUBMIT
            </button>
          </aside>
        )}
        {!sidebarOpen && (
          <button className="reopen-sidebar" onClick={() => setSidebarOpen(true)}>
            <Layers3 size={17} /> Câu hỏi
          </button>
        )}
        <section className="question-card">
          <div className="question-card-header">
            <span className="certification-chip">
              <Layers3 size={14} /> AWS Certified Solutions Architect – Associate
            </span>
            <span className="answered-chip">
              <CheckCircle2 size={14} /> {answeredCount} answered
            </span>
            <strong>
              Q{session.currentIndex + 1} / {session.questions.length}
            </strong>
          </div>
          <div className="question-content">
            <div className="question-meta">
              <span>
                SET {session.setNumber} · CÂU {session.currentIndex + 1}/{session.questions.length}
              </span>
              {activeQuestion.type === 'multi-select' && (
                <span className="select-hint">
                  Choose {activeQuestion.selectCount ?? activeQuestion.correctAnswers.length}
                </span>
              )}
            </div>
            <h1>{activeQuestion.question}</h1>
            {activeQuestion.type === 'multi-select' && (
              <p className="multi-hint">
                Select {activeQuestion.selectCount ?? activeQuestion.correctAnswers.length} answers.
              </p>
            )}
            <div className="options-list">
              {visibleOptions.map((option) => {
                const selected = activeAnswer.includes(option.id);
                const isCorrectOption =
                  revealAnswer && activeQuestion.correctAnswers.includes(option.id);
                const isWrongOption =
                  revealAnswer && selected && !activeQuestion.correctAnswers.includes(option.id);
                return (
                  <button
                    key={option.id}
                    disabled={session.settings.examMode && isConfirmed}
                    className={`option-row ${selected ? 'selected' : ''} ${isCorrectOption ? 'option-correct' : ''} ${isWrongOption ? 'option-wrong' : ''}`}
                    onClick={() => chooseOption(option.id)}
                  >
                    <span className="option-letter">{option.id}</span>
                    <span className="option-text">{option.text}</span>
                    {selected && !revealAnswer && (
                      <span className="selected-check">
                        <Check size={16} />
                      </span>
                    )}
                    {isCorrectOption && <Check size={17} className="result-check" />}
                    {isWrongOption && <X size={17} className="result-x" />}
                  </button>
                );
              })}
            </div>
            {revealAnswer && (
              <div className={`answer-feedback ${correct ? 'feedback-correct' : 'feedback-wrong'}`}>
                <strong>
                  {correct ? (
                    <>
                      <CheckCircle2 size={17} /> Correct!
                    </>
                  ) : (
                    <>
                      <X size={17} /> Not quite
                    </>
                  )}
                </strong>
                {!correct && <span>Đáp án đúng: {activeQuestion.correctAnswers.join(', ')}</span>}
              </div>
            )}
            <div className="question-actions">
              <button
                className="secondary-button question-map-button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                <Layers3 size={17} /> Question map
              </button>
              <div className="center-actions">
                <button
                  className="round-button"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  aria-label="Question map"
                >
                  <span>▦</span>
                </button>
                <button
                  className="ask-ai-button"
                  onClick={() =>
                    window.alert(
                      'Tính năng Ask AI chưa được kết nối. Bạn có thể bổ sung API backend sau.',
                    )
                  }
                >
                  <span className="ai-mark">✳</span> Ask AI
                </button>
              </div>
              <div className="right-actions">
                {!session.settings.examMode && !isConfirmed ? (
                  <button
                    className="confirm-button"
                    disabled={activeAnswer.length === 0}
                    onClick={confirmAnswer}
                  >
                    <CheckCircle2 size={17} /> Confirm
                  </button>
                ) : (
                  <button className="next-button" onClick={nextQuestion}>
                    {session.currentIndex === session.questions.length - 1 ? 'Submit' : 'Next'}{' '}
                    <ArrowRight size={17} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
      {showSubmitDialog && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-title"
          >
            <button
              className="modal-close"
              onClick={() => setShowSubmitDialog(false)}
              aria-label="Đóng"
            >
              <X size={18} />
            </button>
            <div className="modal-icon">
              <Send size={22} />
            </div>
            <h2 id="submit-title">Nộp bài thi?</h2>
            <p>
              Bạn đã trả lời {answeredCount}/{session.questions.length} câu. Sau khi nộp, hệ thống
              sẽ hiển thị kết quả và cho phép xem lại đáp án.
            </p>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowSubmitDialog(false)}>
                Tiếp tục làm bài
              </button>
              <button className="primary-button" onClick={() => submitSession(session)}>
                Nộp bài
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SettingCard({
  icon,
  title,
  description,
  active,
  onToggle,
  color,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  active: boolean;
  onToggle: () => void;
  color: string;
}) {
  return (
    <button className={`setting-card ${active ? 'active' : ''}`} onClick={onToggle}>
      <span className={`setting-icon ${color}`}>{icon}</span>
      <span className="setting-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <span className={`toggle ${active ? 'on' : ''}`}>
        <i />
      </span>
    </button>
  );
}

export default App;
