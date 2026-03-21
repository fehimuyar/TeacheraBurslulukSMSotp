import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { getPlacementBandForScore, getPlacementBank, type PlacementExamBank } from './exam/placementExamData';
import {
  getExamSessionStatus,
  saveExamAnswers,
  saveExamAnswersOnUnload,
  submitExam,
  trackExamRuntimeEvent,
} from '../api/examApi';
import { clearExamDraft, readCandidateSession, readExamDraft, saveExamDraft } from './bursluluk/burslulukFlowSession';

type SubmissionStatus = 'completed' | 'time_limit_reached';

interface RenderQuestion {
  id: string;
  prompt: string;
  answer: string;
  options: string[];
  wrongPenalty: number;
}

interface ScoreMetrics {
  score: number;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  percentage: number;
}

const DEFAULT_DURATION_SECONDS = Number(import.meta.env.VITE_BURSLULUK_EXAM_DURATION_SECONDS || 2400) || 2400;
const DEFAULT_AUTOSAVE_INTERVAL_SECONDS = Number(import.meta.env.VITE_BURSLULUK_AUTOSAVE_SECONDS || 25) || 25;
const STATUS_POLL_INTERVAL_SECONDS = 12;

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(values: T[], seedKey: string) {
  const clone = [...values];
  const random = createSeededRandom(hashSeed(seedKey));
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [clone[index], clone[randomIndex]] = [clone[randomIndex], clone[index]];
  }
  return clone;
}

function buildQuestions(bank: PlacementExamBank, questionCount: number, attemptSeed: string): RenderQuestion[] {
  const orderedQuestions = seededShuffle(bank.questions, `${attemptSeed}:question_order`);
  const seeds = orderedQuestions.slice(0, questionCount);
  const answerPool = Array.from(new Set(seeds.map((item) => item.answer.trim()).filter(Boolean)));

  return seeds.map((seed, questionIndex) => {
    const questionSeed = `${attemptSeed}:${seed.id}:${questionIndex}`;
    const seedOptions = seed.options?.filter(Boolean) ?? [];
    if (seedOptions.length >= 2) {
      return {
        id: seed.id,
        prompt: seed.prompt,
        answer: seed.answer,
        wrongPenalty: typeof seed.wrongPenalty === 'number' ? seed.wrongPenalty : 0,
        options: seededShuffle(seedOptions, `${questionSeed}:options`),
      };
    }

    const isBoolean = /^(true|false)$/i.test(seed.answer);
    if (isBoolean) {
      return {
        id: seed.id,
        prompt: seed.prompt,
        answer: seed.answer,
        wrongPenalty: typeof seed.wrongPenalty === 'number' ? seed.wrongPenalty : 0,
        options: seededShuffle(['True', 'False'], `${questionSeed}:boolean_options`),
      };
    }

    const distractors = seededShuffle(
      answerPool.filter((answer) => answer !== seed.answer),
      `${questionSeed}:distractors`,
    ).slice(0, 3);
    const options = Array.from(new Set([seed.answer, ...distractors]));
    return {
      id: seed.id,
      prompt: seed.prompt,
      answer: seed.answer,
      wrongPenalty: typeof seed.wrongPenalty === 'number' ? seed.wrongPenalty : 0,
      options: seededShuffle(options, `${questionSeed}:final_options`),
    };
  });
}

function calculateMetrics(questions: RenderQuestion[], answers: Record<string, string>): ScoreMetrics {
  let score = 0;
  let answeredCount = 0;
  let correctCount = 0;
  let wrongCount = 0;

  questions.forEach((question) => {
    const selected = answers[question.id];
    if (!selected) return;
    answeredCount += 1;
    if (selected === question.answer) {
      correctCount += 1;
      score += 1;
      return;
    }
    wrongCount += 1;
    score += question.wrongPenalty;
  });

  const unansweredCount = Math.max(0, questions.length - answeredCount);
  const boundedScore = Math.max(0, score);
  const percentage = questions.length > 0 ? Math.round((boundedScore / questions.length) * 100) : 0;

  return {
    score,
    answeredCount,
    correctCount,
    wrongCount,
    unansweredCount,
    percentage,
  };
}

function buildSubmissionAnswers(questions: RenderQuestion[], answers: Record<string, string>) {
  return questions.map((question) => {
    const selectedOption = answers[question.id] ?? null;
    const isCorrect = selectedOption ? selectedOption === question.answer : null;
    const scoreDelta = selectedOption ? (selectedOption === question.answer ? 1 : question.wrongPenalty) : 0;
    return {
      questionId: question.id,
      selectedOption,
      isCorrect,
      scoreDelta,
      questionWeight: 1,
    };
  });
}

function resolvePlacementLabel(bank: PlacementExamBank, score: number, percentage: number) {
  const band = getPlacementBandForScore(bank, score);
  if (!band) return percentage >= 75 ? 'Upper' : percentage >= 50 ? 'Mid' : 'Starter';
  return band.cefr ? `${band.label} (${band.cefr})` : band.label;
}

export default function BurslulukSinavPage() {
  const navigate = useNavigate();
  const session = readCandidateSession();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(DEFAULT_DURATION_SECONDS);
  const [runtimeDurationSeconds, setRuntimeDurationSeconds] = useState(DEFAULT_DURATION_SECONDS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isGateLoading, setIsGateLoading] = useState(true);
  const [isGateOpen, setIsGateOpen] = useState(false);

  const didRestoreDraftRef = useRef(false);
  const isAnswerSyncingRef = useRef(false);
  const lastSyncedAnswersSignatureRef = useRef('');
  const runtimeEventLastSentAtRef = useRef<Record<string, number>>({});
  const reconnectTrackedRef = useRef(false);

  const bankResult = useMemo(() => {
    if (!session) return null;
    return getPlacementBank(session.ageRange || '13–17', session.language || 'en');
  }, [session]);

  const questions = useMemo(() => {
    if (!session || !bankResult || !bankResult.available) return [];
    return buildQuestions(bankResult.bank, session.questionCount || 40, session.attemptId || 'attempt');
  }, [bankResult, session]);

  const metrics = useMemo(() => calculateMetrics(questions, answers), [questions, answers]);

  const trackRuntimeEvent = useCallback(
    async (
      eventType: string,
      meta: Record<string, string | number | boolean | null | undefined> = {},
      throttleMs = 3000,
    ) => {
      if (!session?.sessionToken || !session?.attemptId) return;
      const eventKey = String(eventType || '').trim().toUpperCase();
      if (!eventKey) return;

      const nowMs = Date.now();
      const lastSentAt = runtimeEventLastSentAtRef.current[eventKey] || 0;
      if (throttleMs > 0 && nowMs - lastSentAt < throttleMs) return;
      runtimeEventLastSentAtRef.current[eventKey] = nowMs;

      try {
        await trackExamRuntimeEvent(session.sessionToken, {
          attemptId: session.attemptId,
          eventType: eventKey,
          clientOccurredAt: new Date(nowMs).toISOString(),
          source: 'bursluluk_exam_page',
          meta,
        });
      } catch {
        // Event telemetry failures should never block the exam flow.
      }
    },
    [session?.attemptId, session?.sessionToken],
  );

  useEffect(() => {
    if (!session || !questions.length || didRestoreDraftRef.current) return;
    const draft = readExamDraft(session.attemptId);
    if (!draft) {
      didRestoreDraftRef.current = true;
      return;
    }
    setAnswers(draft.answers || {});
    if (Number.isFinite(draft.remainingSeconds)) {
      setRemainingSeconds(Math.max(0, Math.trunc(draft.remainingSeconds)));
    }
    if (!reconnectTrackedRef.current) {
      reconnectTrackedRef.current = true;
      void trackRuntimeEvent('RECONNECT_SYNC', { reason: 'draft_restore' }, 0);
    }
    didRestoreDraftRef.current = true;
  }, [questions.length, session, trackRuntimeEvent]);

  useEffect(() => {
    if (!session || !questions.length || isSubmitting) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((previous) => Math.max(0, previous - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isSubmitting, questions.length, session]);

  useEffect(() => {
    if (!session || !questions.length) return;
    saveExamDraft({
      attemptId: session.attemptId,
      answers,
      remainingSeconds,
      updatedAt: new Date().toISOString(),
    });
  }, [answers, questions.length, remainingSeconds, session]);

  useEffect(() => {
    if (!session?.attemptId || !session?.sessionToken) {
      setIsGateLoading(false);
      setIsGateOpen(false);
      return;
    }
    let isCancelled = false;
    const run = async () => {
      try {
        const response = await getExamSessionStatus(session.sessionToken, session.attemptId);
        if (isCancelled) return;
        setIsGateOpen(Boolean(response.gate.exam_open));

        const runtime = response.runtime;
        if (runtime && Number.isFinite(runtime.duration_seconds)) {
          setRuntimeDurationSeconds(Math.max(1, Math.trunc(runtime.duration_seconds)));
        }
        if (runtime && Number.isFinite(runtime.remaining_seconds)) {
          const normalized = Math.max(0, Math.trunc(runtime.remaining_seconds));
          setRemainingSeconds((previous) => Math.min(previous, normalized));
        }
        if (runtime?.timed_out) {
          setRemainingSeconds(0);
        }
      } catch {
        if (isCancelled) return;
        setIsGateOpen(false);
      } finally {
        if (!isCancelled) {
          setIsGateLoading(false);
        }
      }
    };
    void run();
    return () => {
      isCancelled = true;
    };
  }, [session?.attemptId, session?.sessionToken]);

  useEffect(() => {
    if (!session?.attemptId || !session?.sessionToken || questions.length === 0 || isSubmitting) return;
    const intervalMs = STATUS_POLL_INTERVAL_SECONDS * 1000;
    const timer = window.setInterval(() => {
      void getExamSessionStatus(session.sessionToken, session.attemptId)
        .then((response) => {
          setIsGateOpen(Boolean(response.gate.exam_open));
          const runtime = response.runtime;
          if (runtime && Number.isFinite(runtime.duration_seconds)) {
            setRuntimeDurationSeconds(Math.max(1, Math.trunc(runtime.duration_seconds)));
          }
          if (runtime && Number.isFinite(runtime.remaining_seconds)) {
            const normalized = Math.max(0, Math.trunc(runtime.remaining_seconds));
            setRemainingSeconds((previous) => Math.min(previous, normalized));
          }
          if (runtime?.timed_out) {
            setRemainingSeconds(0);
          }
        })
        .catch(() => {
          // Keep local countdown and autosave behavior when status poll fails.
        });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isSubmitting, questions.length, session?.attemptId, session?.sessionToken]);

  const submit = async (status: SubmissionStatus) => {
    if (!session || !questions.length || !bankResult || !bankResult.available || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await flushAnswersToBackend({ force: true });
      const payload = {
        attemptId: session.attemptId,
        completionStatus: status,
        durationSeconds: Math.max(1, runtimeDurationSeconds - remainingSeconds),
        placementLabel: resolvePlacementLabel(bankResult.bank, metrics.score, metrics.percentage),
        answers: buildSubmissionAnswers(questions, answers),
        metrics: {
          ...metrics,
          placementLabel: resolvePlacementLabel(bankResult.bank, metrics.score, metrics.percentage),
        },
      } as const;

      await submitExam(session.sessionToken, payload);
      clearExamDraft(session.attemptId);
      navigate(`/bursluluk/sonuç?attemptId=${encodeURIComponent(session.attemptId)}`);
    } catch (error) {
      const message = error instanceof Error && error.message.trim() ? error.message : 'Sinav gonderimi basarisiz oldu.';
      setErrorMessage(message);
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!session || !questions.length || remainingSeconds > 0 || isSubmitting) return;
    void submit('time_limit_reached');
  }, [isSubmitting, questions.length, remainingSeconds, session]);

  const buildAutosavePayload = useCallback(() => {
    if (!session?.attemptId || questions.length === 0) return null;
    return {
      attemptId: session.attemptId,
      answers: buildSubmissionAnswers(questions, answers),
    };
  }, [answers, questions, session?.attemptId]);

  const flushAnswersToBackend = useCallback(
    async ({ force = false, unload = false }: { force?: boolean; unload?: boolean } = {}) => {
      if (!session?.sessionToken || !session?.attemptId || isSubmitting) return;

      const payload = buildAutosavePayload();
      if (!payload || payload.answers.length === 0) return;

      const signature = JSON.stringify(
        payload.answers.map((answer) => [answer.questionId, answer.selectedOption ?? null]),
      );

      if (!force && signature === lastSyncedAnswersSignatureRef.current) return;

      if (unload) {
        const sent = saveExamAnswersOnUnload(session.sessionToken, payload);
        if (sent) {
          lastSyncedAnswersSignatureRef.current = signature;
        }
        return;
      }

      if (isAnswerSyncingRef.current) return;
      isAnswerSyncingRef.current = true;
      try {
        await saveExamAnswers(session.sessionToken, payload);
        lastSyncedAnswersSignatureRef.current = signature;
      } catch {
        void trackRuntimeEvent('AUTOSAVE_FAILED', { mode: 'fetch' }, 15000);
      } finally {
        isAnswerSyncingRef.current = false;
      }
    },
    [buildAutosavePayload, isSubmitting, session?.attemptId, session?.sessionToken, trackRuntimeEvent],
  );

  useEffect(() => {
    if (!session?.attemptId || !session?.sessionToken || questions.length === 0 || isSubmitting) return;
    const intervalMs = Math.max(20, Math.min(30, DEFAULT_AUTOSAVE_INTERVAL_SECONDS)) * 1000;
    const timer = window.setInterval(() => {
      void flushAnswersToBackend();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [flushAnswersToBackend, isSubmitting, questions.length, session?.attemptId, session?.sessionToken]);

  useEffect(() => {
    if (!session?.attemptId || !session?.sessionToken) return;
    const handlePageExit = () => {
      void flushAnswersToBackend({ force: true, unload: true });
    };

    window.addEventListener('pagehide', handlePageExit);
    window.addEventListener('beforeunload', handlePageExit);
    return () => {
      window.removeEventListener('pagehide', handlePageExit);
      window.removeEventListener('beforeunload', handlePageExit);
    };
  }, [flushAnswersToBackend, session?.attemptId, session?.sessionToken]);

  useEffect(() => {
    if (!session?.attemptId || !session?.sessionToken || isSubmitting) return;

    const handleOnline = () => {
      void trackRuntimeEvent('NETWORK_ONLINE', { online: true }, 0);
      void flushAnswersToBackend({ force: true });
      void trackRuntimeEvent('RECONNECT_SYNC', { reason: 'browser_online' }, 4000);
      void trackRuntimeEvent('AUTOSAVE_RESTORED', { reason: 'online' }, 4000);
    };
    const handleOffline = () => {
      void trackRuntimeEvent('NETWORK_OFFLINE', { online: false }, 0);
    };
    const handleVisibility = () => {
      const type = document.visibilityState === 'hidden' ? 'VISIBILITY_HIDDEN' : 'VISIBILITY_VISIBLE';
      void trackRuntimeEvent(type, { visibility: document.visibilityState }, 1000);
    };
    const handleBlur = () => {
      void trackRuntimeEvent('WINDOW_BLUR', {}, 1000);
    };
    const handleFocus = () => {
      void trackRuntimeEvent('WINDOW_FOCUS', {}, 1000);
    };
    const handleCopy = () => {
      void trackRuntimeEvent('COPY_ATTEMPT', {}, 2000);
    };
    const handlePaste = () => {
      void trackRuntimeEvent('PASTE_ATTEMPT', {}, 2000);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
    };
  }, [flushAnswersToBackend, isSubmitting, session?.attemptId, session?.sessionToken, trackRuntimeEvent]);

  if (!session) {
    return (
      <section className="mx-auto min-h-[65vh] max-w-[840px] px-4 pb-16 pt-[132px] text-white sm:px-6">
        <div className="rounded-2xl border border-white/12 bg-[#091427]/85 p-8">
          <h1 className="text-[28px] font-semibold">Sinav oturumu bulunamadi</h1>
          <p className="mt-3 text-white/70">Lutfen once giris adimindan aday oturumunu baslatin.</p>
          <Link to="/bursluluk/giris" className="mt-6 inline-flex rounded-full bg-[#D92E27] px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.15em]">
            Giris Sayfasina Don
          </Link>
        </div>
      </section>
    );
  }

  if (isGateLoading) {
    return (
      <section className="mx-auto min-h-[65vh] max-w-[840px] px-4 pb-16 pt-[132px] text-white sm:px-6">
        <div className="rounded-2xl border border-white/12 bg-[#091427]/85 p-8">
          <h1 className="text-[28px] font-semibold">Sinav durumu kontrol ediliyor</h1>
          <p className="mt-3 text-white/70">Lutfen bekleyin...</p>
        </div>
      </section>
    );
  }

  if (!isGateOpen) {
    return (
      <section className="mx-auto min-h-[65vh] max-w-[840px] px-4 pb-16 pt-[132px] text-white sm:px-6">
        <div className="rounded-2xl border border-white/12 bg-[#091427]/85 p-8">
          <h1 className="text-[28px] font-semibold">Sinav henuz acik degil</h1>
          <p className="mt-3 text-white/70">Bekleme ekranina donup acilis sayacini takip edin.</p>
          <Link to="/bursluluk/bekleme" className="mt-6 inline-flex rounded-full bg-[#D92E27] px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.15em]">
            Bekleme Ekranina Don
          </Link>
        </div>
      </section>
    );
  }

  if (!bankResult || bankResult.available === false) {
    return (
      <section className="mx-auto min-h-[65vh] max-w-[840px] px-4 pb-16 pt-[132px] text-white sm:px-6">
        <div className="rounded-2xl border border-white/12 bg-[#091427]/85 p-8">
          <h1 className="text-[28px] font-semibold">Bu profil icin online sinav yok</h1>
          <p className="mt-3 text-white/70">{bankResult?.note || 'Dil/yas profili icin uygun sinav bankasi bulunamadi.'}</p>
          <Link to="/bursluluk/giris" className="mt-6 inline-flex rounded-full bg-[#D92E27] px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.15em]">
            Giris Sayfasina Don
          </Link>
        </div>
      </section>
    );
  }

  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  return (
    <section className="relative min-h-screen overflow-hidden px-4 pb-16 pt-[118px] sm:px-6 lg:px-12 lg:pt-[142px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_22%,rgba(146,11,35,0.32),transparent_42%),radial-gradient(circle_at_86%_12%,rgba(18,86,94,0.22),transparent_34%),linear-gradient(138deg,#05050D_0%,#0A0C16_52%,#05070F_100%)]" />
      <div className="relative mx-auto w-full max-w-[980px]">
        <div className="mb-4 rounded-2xl border border-white/12 bg-[#091427]/86 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[12px] uppercase tracking-[0.18em] text-white/55">Bursluluk Sinavi</p>
              <p className="mt-1 text-[16px] font-semibold text-white">{session.studentFullName} · {session.candidateCode || session.applicationNo}</p>
            </div>
            <p className="rounded-full border border-white/12 px-4 py-2 text-[15px] font-semibold text-white">
              Kalan Sure: {formatDuration(remainingSeconds)}
            </p>
          </div>
          <div className="mt-4 h-2 rounded-full bg-white/10">
            <div className="h-2 rounded-full bg-[#D92E27]" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {currentQuestion ? (
          <article className="rounded-[24px] border border-white/12 bg-[#091427]/86 p-6 sm:p-8">
            <p className="text-[12px] uppercase tracking-[0.16em] text-white/54">
              Soru {currentIndex + 1} / {questions.length}
            </p>
            <h2 className="mt-3 text-[26px] leading-[1.45] text-white sm:text-[30px]">{currentQuestion.prompt}</h2>

            <div className="mt-6 grid gap-3">
              {currentQuestion.options.map((option) => {
                const isSelected = answers[currentQuestion.id] === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAnswers((previous) => ({ ...previous, [currentQuestion.id]: option }))}
                    className={`rounded-xl border px-4 py-3 text-left text-[15px] transition ${isSelected ? 'border-[#D92E27] bg-[#D92E27]/22 text-white' : 'border-white/14 bg-[#061021]/88 text-white/82 hover:border-white/28'}`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
                disabled={currentIndex === 0}
                className="rounded-full border border-white/16 px-5 py-2 text-[12px] uppercase tracking-[0.15em] text-white/70 disabled:opacity-45"
              >
                Geri
              </button>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (currentIndex < questions.length - 1) {
                      setCurrentIndex((value) => value + 1);
                    } else {
                      void submit('completed');
                    }
                  }}
                  className="rounded-full bg-[#D92E27] px-6 py-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-white hover:bg-[#bf251f]"
                >
                  {currentIndex < questions.length - 1 ? 'Ileri' : 'Sinavi Bitir'}
                </button>
              </div>
            </div>
          </article>
        ) : null}

        <div className="mt-4 rounded-2xl border border-white/12 bg-[#091427]/86 p-4 text-[13px] text-white/70">
          Cevaplanan: {metrics.answeredCount} · Dogru: {metrics.correctCount} · Yanlis: {metrics.wrongCount} · Bos: {metrics.unansweredCount}
        </div>

        {errorMessage ? (
          <p className="mt-4 rounded-xl border border-[#6F2824] bg-[#2B1214]/80 px-4 py-3 text-[14px] text-[#FFB8B1]">{errorMessage}</p>
        ) : null}
      </div>
    </section>
  );
}
