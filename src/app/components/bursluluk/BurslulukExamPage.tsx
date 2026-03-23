import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { getExamSessionStatus, saveExamAnswers, submitExam } from '../../api/examApi';
import {
  BURSLULUK_EXAM_DURATION_SECONDS,
  getBurslulukQuestions,
  type BurslulukQuestion,
} from './burslulukExamData';
import { readBurslulukCandidateSession } from './burslulukFlowSession';

type CompletionStatus = 'completed' | 'time_limit_reached' | 'left_exam';

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function buildMetrics(questions: BurslulukQuestion[], answers: Record<string, string>) {
  let correct = 0;
  let wrong = 0;
  let answered = 0;

  questions.forEach((question) => {
    const selected = answers[question.id];
    if (!selected) return;
    answered += 1;
    if (selected === question.answer) correct += 1;
    else wrong += 1;
  });

  const unanswered = Math.max(0, questions.length - answered);
  const score = correct;
  const percentage = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

  return {
    score,
    percentage,
    answeredCount: answered,
    correctCount: correct,
    wrongCount: wrong,
    unansweredCount: unanswered,
  };
}

function answerRows(questions: BurslulukQuestion[], answers: Record<string, string>) {
  return questions.map((question) => {
    const selectedOption = answers[question.id] ?? null;
    const isCorrect = selectedOption ? selectedOption === question.answer : null;
    return {
      questionId: question.id,
      selectedOption,
      isCorrect,
      scoreDelta: selectedOption ? (isCorrect ? 1 : 0) : 0,
      questionWeight: 1,
    };
  });
}

export default function BurslulukExamPage() {
  const navigate = useNavigate();
  const [session] = useState(() => readBurslulukCandidateSession());

  const [questions] = useState(() => getBurslulukQuestions());
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(BURSLULUK_EXAM_DURATION_SECONDS);
  const [loadingGate, setLoadingGate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitGuardRef = useRef(false);
  const startedAtRef = useRef<number>(Date.now());

  const metrics = useMemo(() => buildMetrics(questions, answers), [questions, answers]);
  const progress = questions.length > 0 ? Math.round(((index + 1) / questions.length) * 100) : 0;
  const current = questions[index];

  useEffect(() => {
    if (!session) {
      navigate('/bursluluk/giris', { replace: true });
      return;
    }

    let active = true;
    (async () => {
      try {
        const status = await getExamSessionStatus(session.sessionToken, session.attemptId);
        if (!active) return;
        if (!status.gate.exam_open) {
          navigate('/bursluluk/bekleme', { replace: true });
          return;
        }
      } catch {
        if (!active) return;
        setError('Sınav oturumu doğrulanamadı. Lütfen tekrar giriş yapın.');
      } finally {
        if (active) setLoadingGate(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [navigate, session]);

  useEffect(() => {
    if (loadingGate || submitting) return;

    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [loadingGate, submitting]);

  useEffect(() => {
    if (!session || loadingGate || submitting) return;

    const autosaveTimer = window.setTimeout(async () => {
      const rows = answerRows(questions, answers).filter((item) => item.selectedOption !== null);
      if (rows.length === 0) return;
      setSaving(true);
      try {
        await saveExamAnswers(session.sessionToken, {
          attemptId: session.attemptId,
          answers: rows,
        });
      } catch {
        // Autosave hatasını kullanıcıyı bloklamadan sessiz bırakıyoruz.
      } finally {
        setSaving(false);
      }
    }, 650);

    return () => window.clearTimeout(autosaveTimer);
  }, [answers, loadingGate, questions, session, submitting]);

  useEffect(() => {
    if (remainingSeconds > 0 || submitGuardRef.current || loadingGate) return;
    void handleSubmit('time_limit_reached');
  }, [loadingGate, remainingSeconds]);

  if (!session) return null;

  const handleAnswer = (value: string) => {
    if (!current || submitting) return;
    setAnswers((prev) => ({ ...prev, [current.id]: value }));
  };

  const handleSubmit = async (completionStatus: CompletionStatus = 'completed') => {
    if (!session || submitGuardRef.current) return;
    submitGuardRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const elapsed = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      await submitExam(session.sessionToken, {
        attemptId: session.attemptId,
        completionStatus,
        durationSeconds: elapsed,
        placementLabel: metrics.percentage >= 85 ? 'Advanced' : metrics.percentage >= 60 ? 'Intermediate' : 'Elementary',
        cefrBand: metrics.percentage >= 85 ? 'B2' : metrics.percentage >= 60 ? 'B1' : 'A2',
        answers: answerRows(questions, answers),
        metrics,
      });
      navigate('/bursluluk/sonuc', { replace: true });
    } catch (submitError) {
      submitGuardRef.current = false;
      setError(submitError instanceof Error ? submitError.message : 'Sınav gönderilemedi. Lütfen tekrar deneyin.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="relative min-h-screen overflow-hidden px-4 pb-16 pt-[105px] sm:px-6 lg:px-12 lg:pt-[118px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_14%,rgba(14,165,233,0.14),transparent_44%),radial-gradient(circle_at_84%_14%,rgba(217,46,39,0.18),transparent_36%),linear-gradient(138deg,#05070F_0%,#070E1A_50%,#05070F_100%)]" />

      <div className="relative mx-auto w-full max-w-[1100px]">
        <header className="mb-5 rounded-2xl border border-white/14 bg-white/[0.06] p-4 shadow-[0_16px_60px_rgba(0,0,0,0.35)] backdrop-blur-md sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[#E35347]">Bursluluk Sınavı</p>
              <h1 className="mt-1 text-[24px] font-semibold text-white">Aday No: {session.applicationNo}</h1>
            </div>
            <div className="rounded-xl border border-white/20 bg-[#081326]/85 px-4 py-2 text-right">
              <p className="text-[12px] text-white/55">Kalan Süre</p>
              <p className="text-[26px] font-semibold tracking-wide text-white">{formatClock(remainingSeconds)}</p>
            </div>
          </div>

          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[#E35347] to-[#22d3ee]" style={{ width: `${progress}%` }} />
          </div>
        </header>

        {loadingGate ? (
          <div className="rounded-2xl border border-white/12 bg-white/[0.05] p-6 text-white/70">Sınav erişim kontrolü yapılıyor...</div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
            <article className="rounded-2xl border border-white/14 bg-white/[0.06] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.35)] backdrop-blur-md sm:p-6">
              {current ? (
                <>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#22d3ee]">
                    {current.section} • Soru {index + 1}/{questions.length}
                  </p>
                  <h2 className="mt-3 text-[24px] font-semibold leading-tight text-white">{current.prompt}</h2>

                  {current.media ? (
                    <figure className="mt-4 overflow-hidden rounded-xl border border-white/12 bg-[#0a1425]">
                      {current.media.type === 'image' ? (
                        <img src={current.media.src} alt={current.media.caption} className="h-[220px] w-full object-cover" />
                      ) : (
                        <audio controls className="w-full" src={current.media.src} />
                      )}
                      <figcaption className="border-t border-white/10 px-3 py-2 text-[12px] text-white/58">{current.media.caption}</figcaption>
                    </figure>
                  ) : null}

                  <div className="mt-5 grid gap-3">
                    {current.options.map((option) => {
                      const active = answers[current.id] === option;
                      return (
                        <button
                          key={`${current.id}-${option}`}
                          type="button"
                          onClick={() => handleAnswer(option)}
                          className={`rounded-xl border px-4 py-3 text-left text-[14px] transition ${
                            active
                              ? 'border-[#22d3ee] bg-[#22d3ee]/20 text-white'
                              : 'border-white/16 bg-[#0b1527]/70 text-white/86 hover:bg-white/12'
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
                      disabled={index === 0}
                      className="rounded-xl border border-white/16 px-4 py-2 text-[13px] font-semibold text-white/82 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Önceki
                    </button>
                    <button
                      type="button"
                      onClick={() => setIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                      disabled={index === questions.length - 1}
                      className="rounded-xl border border-white/16 px-4 py-2 text-[13px] font-semibold text-white/82 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Sonraki
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSubmit('completed')}
                      disabled={submitting}
                      className="rounded-xl bg-[#D92E27] px-5 py-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#bf251f] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? 'Gönderiliyor...' : 'Sınavı Bitir'}
                    </button>
                  </div>
                </>
              ) : null}

              {error ? <p className="mt-4 rounded-lg border border-[#f87171]/35 bg-[#7f1d1d]/30 px-3 py-2 text-[13px] text-[#fecaca]">{error}</p> : null}
            </article>

            <aside className="rounded-2xl border border-white/14 bg-white/[0.06] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
              <h3 className="text-[15px] font-semibold text-white">Durum</h3>
              <ul className="mt-3 space-y-2 text-[13px] text-white/75">
                <li>Yanıtlanan: <span className="font-semibold text-white">{metrics.answeredCount}</span></li>
                <li>Boş: <span className="font-semibold text-white">{metrics.unansweredCount}</span></li>
                <li>Doğru: <span className="font-semibold text-white">{metrics.correctCount}</span></li>
                <li>Yanlış: <span className="font-semibold text-white">{metrics.wrongCount}</span></li>
                <li>Autosave: <span className="font-semibold text-white">{saving ? 'Kaydediliyor...' : 'Aktif'}</span></li>
              </ul>
              <p className="mt-4 text-[12px] leading-6 text-white/58">
                Cevaplarınız düzenli aralıklarla otomatik kaydedilir. Süre bitiminde sınav otomatik gönderilir.
              </p>
              <Link to="/bursluluk/giris" className="mt-5 inline-flex text-[12px] text-white/60 hover:text-white">Oturumu sonlandır</Link>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
