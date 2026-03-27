import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  completeScholarshipSpeakingUpload,
  getExamSessionStatus,
  initScholarshipSpeakingUpload,
  saveScholarshipExamAnswers,
  submitScholarshipExam,
  uploadScholarshipSpeakingBlob,
} from '../api/examApi';
import {
  clearExamDraft,
  readCandidateSession,
  readExamDraft,
  saveExamDraft,
} from './bursluluk/burslulukFlowSession';
import { ScholarshipExamModule } from './scholarship-exam/scholarship-exam-module';
import type {
  ExamModuleAdapter,
  ExamAttemptState,
  ExamContentPublic,
  ExamDraftSnapshot,
  PersistedSpeakingResponse,
  SaveObjectiveAnswersPayload,
  SpeakingUploadCompletePayload,
  SpeakingUploadInitPayload,
  SubmitExamPayload,
} from './scholarship-exam/types';

const DEFAULT_DURATION_SECONDS = Number(import.meta.env.VITE_BURSLULUK_EXAM_DURATION_SECONDS || 2400) || 2400;

async function readScholarshipContent(publicContentPath: string) {
  const response = await fetch(publicContentPath, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Exam content could not be loaded (HTTP ${response.status}).`);
  }
  return (await response.json()) as ExamContentPublic;
}

function normalizeDraft(attemptId: string) {
  const rawDraft = readExamDraft(attemptId);
  if (!rawDraft) return null;

  const objectiveAnswers =
    rawDraft.objectiveAnswers && typeof rawDraft.objectiveAnswers === 'object'
      ? rawDraft.objectiveAnswers
      : Object.fromEntries(
          Object.entries(rawDraft.answers || {}).map(([questionId, selectedOptionId]) => [questionId, selectedOptionId || null]),
        );

  const speakingResponses =
    rawDraft.speakingResponses && typeof rawDraft.speakingResponses === 'object'
      ? (rawDraft.speakingResponses as Record<string, PersistedSpeakingResponse>)
      : {};

  const currentQuestionIndex = Number.isFinite(Number(rawDraft.currentQuestionIndex))
    ? Math.max(0, Math.trunc(Number(rawDraft.currentQuestionIndex)))
    : 0;

  return {
    attemptId,
    currentQuestionIndex,
    objectiveAnswers,
    speakingResponses,
    updatedAt: rawDraft.updatedAt || new Date().toISOString(),
  } satisfies ExamDraftSnapshot;
}

function resolveDeadlineAt(startedAt: string | undefined, deadlineAt: string | null | undefined, durationSeconds: number) {
  if (deadlineAt) return deadlineAt;

  const startedAtMs = Number(new Date(startedAt || ''));
  if (Number.isFinite(startedAtMs)) {
    return new Date(startedAtMs + durationSeconds * 1000).toISOString();
  }
  return new Date(Date.now() + durationSeconds * 1000).toISOString();
}

export default function BurslulukSinavPage() {
  const navigate = useNavigate();
  const [session] = useState(() => readCandidateSession());
  const [content, setContent] = useState<ExamContentPublic | null>(null);
  const [runtimeDeadlineAt, setRuntimeDeadlineAt] = useState('');
  const [runtimeDurationSeconds, setRuntimeDurationSeconds] = useState(DEFAULT_DURATION_SECONDS);
  const [runtimeStartedAt, setRuntimeStartedAt] = useState('');
  const [scholarshipExam, setScholarshipExam] = useState(session?.scholarshipExam || null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGateOpen, setIsGateOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!session?.attemptId || !session?.sessionToken) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const status = await getExamSessionStatus(session.sessionToken, session.attemptId);
        if (cancelled) return;

        const nextScholarshipExam = status.session.scholarshipExam || session.scholarshipExam;
        if (!nextScholarshipExam) {
          throw new Error('Bu oturum bursluluk sinav icerigi ile eslesmedi.');
        }

        const durationSeconds = Number(status.runtime?.duration_seconds || runtimeDurationSeconds || DEFAULT_DURATION_SECONDS);
        const startedAt = status.runtime?.started_at || status.session.startedAt || session.startedAt || new Date().toISOString();
        const deadlineAt = resolveDeadlineAt(startedAt, status.runtime?.deadline_at, durationSeconds);
        const nextContent = await readScholarshipContent(nextScholarshipExam.publicContentPath);
        if (cancelled) return;

        setScholarshipExam(nextScholarshipExam);
        setContent(nextContent);
        setRuntimeDurationSeconds(durationSeconds);
        setRuntimeStartedAt(startedAt);
        setRuntimeDeadlineAt(deadlineAt);
        setIsGateOpen(Boolean(status.gate.exam_open));
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error && error.message ? error.message : 'Sinav oturumu hazirlanamadi.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [session?.attemptId, session?.scholarshipExam, session?.sessionToken, session?.startedAt]);

  const initialDraft = useMemo(
    () => (session?.attemptId ? normalizeDraft(session.attemptId) : null),
    [session?.attemptId],
  );

  const attempt = useMemo(() => {
    if (!session?.attemptId || !scholarshipExam || !runtimeDeadlineAt) return null;

    return {
      attemptId: session.attemptId,
      examVersionKey: scholarshipExam.examVersionKey,
      grade: scholarshipExam.contentGrade,
      studentLabel: session.studentFullName,
      startedAt: runtimeStartedAt || session.startedAt || new Date().toISOString(),
      deadlineAt: runtimeDeadlineAt,
      durationSeconds: runtimeDurationSeconds,
      status: 'started',
    } satisfies ExamAttemptState;
  }, [
    runtimeDeadlineAt,
    runtimeDurationSeconds,
    runtimeStartedAt,
    scholarshipExam,
    session?.attemptId,
    session?.startedAt,
    session?.studentFullName,
  ]);

  const adapter = useMemo<ExamModuleAdapter | null>(() => {
    if (!session?.sessionToken) return null;

    return {
      saveObjectiveAnswers: async (payload: SaveObjectiveAnswersPayload) => {
        await saveScholarshipExamAnswers(session.sessionToken, payload);
      },
      initSpeakingUpload: async (payload: SpeakingUploadInitPayload) =>
        initScholarshipSpeakingUpload(session.sessionToken, payload),
      uploadSpeakingBlob,
      completeSpeakingUpload: async (payload: SpeakingUploadCompletePayload) =>
        completeScholarshipSpeakingUpload(session.sessionToken, payload),
      submitExam: async (payload: SubmitExamPayload) =>
        submitScholarshipExam(session.sessionToken, payload),
    };
  }, [session?.sessionToken]);

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

  if (isLoading) {
    return (
      <section className="mx-auto min-h-[65vh] max-w-[840px] px-4 pb-16 pt-[132px] text-white sm:px-6">
        <div className="rounded-2xl border border-white/12 bg-[#091427]/85 p-8">
          <h1 className="text-[28px] font-semibold">Sinav icerigi yukleniyor</h1>
          <p className="mt-3 text-white/70">Oturumunuz kontrol ediliyor, lutfen bekleyin.</p>
        </div>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="mx-auto min-h-[65vh] max-w-[840px] px-4 pb-16 pt-[132px] text-white sm:px-6">
        <div className="rounded-2xl border border-[#6F2824] bg-[#2B1214]/80 p-8">
          <h1 className="text-[28px] font-semibold">Sinav hazirlanamadi</h1>
          <p className="mt-3 text-[#FFB8B1]">{errorMessage}</p>
          <Link to="/bursluluk/giris" className="mt-6 inline-flex rounded-full bg-[#D92E27] px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.15em] text-white">
            Giris Sayfasina Don
          </Link>
        </div>
      </section>
    );
  }

  if (!isGateOpen) {
    return (
      <section className="mx-auto min-h-[65vh] max-w-[840px] px-4 pb-16 pt-[132px] text-white sm:px-6">
        <div className="rounded-2xl border border-white/12 bg-[#091427]/85 p-8">
          <h1 className="text-[28px] font-semibold">Sinav henuz acik degil</h1>
          <p className="mt-3 text-white/70">Bekleme ekranina donup acilis zamanini takip edin.</p>
          <Link to="/bursluluk/bekleme" className="mt-6 inline-flex rounded-full bg-[#D92E27] px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.15em] text-white">
            Bekleme Ekranina Don
          </Link>
        </div>
      </section>
    );
  }

  if (!content || !attempt || !adapter || !scholarshipExam) {
    return (
      <section className="mx-auto min-h-[65vh] max-w-[840px] px-4 pb-16 pt-[132px] text-white sm:px-6">
        <div className="rounded-2xl border border-white/12 bg-[#091427]/85 p-8">
          <h1 className="text-[28px] font-semibold">Sinav oturumu eksik</h1>
          <p className="mt-3 text-white/70">Icerik ve sure bilgileri tam gelmeden sinav baslatilamaz.</p>
          <Link to="/bursluluk/giris" className="mt-6 inline-flex rounded-full bg-[#D92E27] px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.15em] text-white">
            Giris Sayfasina Don
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#f5efe7] px-4 pb-16 pt-[110px] sm:px-6 lg:px-12 lg:pt-[138px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,235,209,0.8),transparent_34%),linear-gradient(180deg,#fbf8f3_0%,#f5efe7_30%,#efe6da_100%)]" />
      <div className="relative mx-auto max-w-[1080px]">
        <div className="mb-4 rounded-[24px] border border-[#ddd3c7] bg-white/86 px-5 py-4 shadow-[0_16px_34px_rgba(25,20,15,0.06)]">
          <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.18em] text-[#4a7067]">
            Bursluluk Sinavi
          </p>
          <p className="mt-2 text-[14px] text-[#5b4f45]">
            {session.studentFullName} · {session.candidateCode || session.applicationNo} · {scholarshipExam.contentGrade.toUpperCase()}
          </p>
        </div>

        <ScholarshipExamModule
          content={content}
          attempt={attempt}
          adapter={adapter}
          assetBaseUrl={scholarshipExam.assetBaseUrl}
          initialDraft={initialDraft}
          onDraftChange={(draft) => {
            saveExamDraft({
              attemptId: draft.attemptId,
              answers: Object.fromEntries(
                Object.entries(draft.objectiveAnswers).flatMap(([questionId, selectedOptionId]) =>
                  selectedOptionId ? [[questionId, selectedOptionId]] : [],
                ),
              ),
              objectiveAnswers: draft.objectiveAnswers,
              speakingResponses: draft.speakingResponses,
              currentQuestionIndex: draft.currentQuestionIndex,
              remainingSeconds: Math.max(0, Math.floor((new Date(attempt.deadlineAt).getTime() - Date.now()) / 1000)),
              updatedAt: draft.updatedAt,
            });
          }}
          onSubmitted={() => {
            clearExamDraft(session.attemptId);
            navigate(`/bursluluk/sonuç?attemptId=${encodeURIComponent(session.attemptId)}`);
          }}
          loadingSlot={
            <div className="rounded-[24px] border border-[#ddd3c7] bg-white/86 p-6 text-[#5b4f45]">
              Soru akisiniz hazirlaniyor...
            </div>
          }
        />
      </div>
    </section>
  );
}
