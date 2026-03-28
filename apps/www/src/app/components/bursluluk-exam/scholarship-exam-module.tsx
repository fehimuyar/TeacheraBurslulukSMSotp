"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AUTOSAVE_DELAY_MS } from "./constants";
import { buildAttemptQuestionOrder } from "./shuffle";
import type {
  ExamDraftSnapshot,
  ObjectiveQuestion,
  PersistedSpeakingResponse,
  PublicExamQuestion,
  ScholarshipExamModuleProps,
  SpeakingQuestion,
} from "./types";
import { clamp, formatDuration, readDraft, resolveAssetUrl, writeDraft } from "./utils";
import { ListeningPlayer } from "./components/listening-player";
import { OptionButton } from "./components/option-button";
import { SpeakingRecorder } from "./components/speaking-recorder";

function isObjectiveQuestion(question: PublicExamQuestion): question is ObjectiveQuestion {
  return question.type !== "speaking";
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 5.4V9L11.8 10.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReadingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 5.2H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5 8H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5 10.8H8.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M9.8 3.5L5.3 8L9.8 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6.2 3.5L10.7 8L6.2 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function QuestionMarkIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <circle cx="22" cy="22" r="22" fill="rgba(111,113,70,0.08)" />
      <path
        d="M17.8 16.9C18.8 15.4 20.6 14.5 22.6 14.5C25.7 14.5 28 16.4 28 19.2C28 21.4 26.7 22.6 24.7 24.1C23.2 25.2 22.7 26 22.7 27.4"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22.7" cy="31.6" r="1.5" fill="currentColor" />
    </svg>
  );
}

function countAnsweredQuestions(
  orderedQuestions: PublicExamQuestion[],
  objectiveAnswers: Record<string, string | null>,
  speakingResponses: Record<string, PersistedSpeakingResponse>,
): number {
  return orderedQuestions.reduce((count, currentQuestion) => {
    if (currentQuestion.type === "speaking") {
      return speakingResponses[currentQuestion.id] ? count + 1 : count;
    }
    return objectiveAnswers[currentQuestion.id] ? count + 1 : count;
  }, 0);
}

export function ScholarshipExamModule({
  content,
  attempt,
  adapter,
  assetBaseUrl,
  initialDraft,
  onDraftChange,
  onSubmitted,
  loadingSlot,
}: ScholarshipExamModuleProps) {
  const initialSnapshot = useMemo(() => initialDraft ?? readDraft(attempt.attemptId), [attempt.attemptId, initialDraft]);
  const orderedQuestions = useMemo(
    () => buildAttemptQuestionOrder(content, attempt.attemptId),
    [attempt.attemptId, content],
  );

  const [currentIndex, setCurrentIndex] = useState(initialSnapshot?.currentQuestionIndex ?? 0);
  const [objectiveAnswers, setObjectiveAnswers] = useState<Record<string, string | null>>(initialSnapshot?.objectiveAnswers ?? {});
  const [speakingResponses, setSpeakingResponses] = useState<Record<string, PersistedSpeakingResponse>>(
    initialSnapshot?.speakingResponses ?? {},
  );
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.floor((new Date(attempt.deadlineAt).getTime() - Date.now()) / 1000)),
  );
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinishDialogOpen, setIsFinishDialogOpen] = useState(false);
  const lastSavedSignatureRef = useRef("");
  const timeoutSubmittedRef = useRef(false);

  const question = orderedQuestions[currentIndex];
  const totalQuestions = orderedQuestions.length;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemainingSeconds(Math.max(0, Math.floor((new Date(attempt.deadlineAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [attempt.deadlineAt]);

  useEffect(() => {
    const snapshot: ExamDraftSnapshot = {
      attemptId: attempt.attemptId,
      currentQuestionIndex: currentIndex,
      objectiveAnswers,
      speakingResponses,
      updatedAt: new Date().toISOString(),
    };
    writeDraft(snapshot);
    onDraftChange?.(snapshot);
  }, [attempt.attemptId, currentIndex, objectiveAnswers, onDraftChange, speakingResponses]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const payload = {
        attemptId: attempt.attemptId,
        examVersionKey: attempt.examVersionKey,
        answers: Object.entries(objectiveAnswers).map(([questionId, selectedOptionId]) => ({
          questionId,
          selectedOptionId,
          savedAt: new Date().toISOString(),
        })),
      };
      const signature = JSON.stringify(payload.answers);
      if (signature === lastSavedSignatureRef.current) {
        return;
      }
      lastSavedSignatureRef.current = signature;
      void adapter.saveObjectiveAnswers(payload).catch(() => {
        lastSavedSignatureRef.current = "";
      });
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [adapter, attempt.attemptId, attempt.examVersionKey, objectiveAnswers]);

  const submitExam = async () => {
    if (isSubmitting) return;
    setSubmitError("");

    const uploadedSpeaking = orderedQuestions
      .filter((candidate): candidate is SpeakingQuestion => candidate.type === "speaking")
      .map((candidate) => ({
        questionId: candidate.id,
        response: speakingResponses[candidate.id],
      }))
      .filter((item) => item.response?.status === "uploaded" && item.response.responseId);

    setIsSubmitting(true);
    try {
      const response = await adapter.submitExam({
        attemptId: attempt.attemptId,
        examVersionKey: attempt.examVersionKey,
        objectiveAnswers: Object.entries(objectiveAnswers).map(([questionId, selectedOptionId]) => ({
          questionId,
          selectedOptionId,
        })),
        speakingResponses: uploadedSpeaking.map((item) => ({
          questionId: item.questionId,
          responseId: item.response?.responseId as string,
        })),
      });
      onSubmitted?.(response);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Sınav gönderilemedi.");
    } finally {
      setIsSubmitting(false);
      setIsFinishDialogOpen(false);
    }
  };

  useEffect(() => {
    if (remainingSeconds > 0 || timeoutSubmittedRef.current) return;
    timeoutSubmittedRef.current = true;
    void submitExam();
  }, [remainingSeconds]);

  if (!question) {
    return loadingSlot ?? null;
  }

  const questionProgress = `${currentIndex + 1}/${totalQuestions}`;
  const progressPercent = totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0;
  const selectedOptionId = isObjectiveQuestion(question) ? objectiveAnswers[question.id] ?? null : null;
  const visualSrc = resolveAssetUrl(assetBaseUrl, question.visualAsset);
  const listeningSrc = isObjectiveQuestion(question) ? resolveAssetUrl(assetBaseUrl, question.listeningAsset) : undefined;
  const answeredCount = countAnsweredQuestions(orderedQuestions, objectiveAnswers, speakingResponses);
  const unansweredCount = Math.max(0, totalQuestions - answeredCount);

  const handleNavigate = (nextIndex: number) => {
    setIsFinishDialogOpen(false);
    setCurrentIndex(clamp(nextIndex, 0, totalQuestions - 1));
  };

  return (
    <div className="te-exam">
      <div className="te-shell">
        <header className="te-header">
          <div className="te-header__top">
            <img src="/shared-shell/teachera-logo-olive.svg" alt="Teachera" className="te-header__logo" />
            <span className="te-timer">
              <ClockIcon />
              {formatDuration(remainingSeconds)}
            </span>
          </div>
          <div className="te-header__bottom">
            <div className="te-progressbar" aria-hidden="true">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="te-progress-label">{questionProgress}</span>
          </div>
        </header>

        <main className="te-card">
          <div className="te-card__meta">
            <span className="te-pill">{`Q${question.questionNo}`}</span>
          </div>

          {visualSrc ? (
            <div className="te-visual">
              <img src={visualSrc} alt={`Question ${question.questionNo} visual`} />
            </div>
          ) : null}

          {"readingPassage" in question && question.readingPassage ? (
            <article className="te-passage">
              <h2>
                <ReadingIcon />
                READING PASSAGE
              </h2>
              <div className="te-passage__body">
                <p>{question.readingPassage}</p>
              </div>
            </article>
          ) : null}

          {question.type === "listening" ? <ListeningPlayer src={listeningSrc} /> : null}

          <div className="te-stem">{question.prompt}</div>

          {isObjectiveQuestion(question) ? (
            <div className="te-options" role="radiogroup" aria-label={`Question ${question.questionNo}`}>
              {question.options.map((option, index) => (
                <OptionButton
                  key={option.optionId}
                  index={index}
                  label={option.label}
                  selected={selectedOptionId === option.optionId}
                  onSelect={() =>
                    setObjectiveAnswers((previous) => ({
                      ...previous,
                      [question.id]: option.optionId,
                    }))
                  }
                />
              ))}
            </div>
          ) : (
            <SpeakingRecorder
              question={question}
              attempt={attempt}
              adapter={adapter}
              persisted={speakingResponses[question.id]}
              onPersisted={(response) =>
                setSpeakingResponses((previous) => ({
                  ...previous,
                  [response.questionId]: response,
                }))
              }
            />
          )}

          {submitError ? <p className="te-error te-error--block">{submitError}</p> : null}
        </main>

        <footer className="te-footer">
          <button
            type="button"
            className="te-button te-button--back"
            onClick={() => handleNavigate(currentIndex - 1)}
            disabled={currentIndex === 0}
          >
            <ChevronLeftIcon />
            <span>Back</span>
          </button>
          <div className="te-footer__spacer" />
          {currentIndex < totalQuestions - 1 ? (
            <button
              type="button"
              className="te-button te-button--primary"
              onClick={() => handleNavigate(currentIndex + 1)}
            >
              <span>Next</span>
              <ChevronRightIcon />
            </button>
          ) : (
            <button
              type="button"
              className="te-button te-button--primary"
              onClick={() => setIsFinishDialogOpen(true)}
              disabled={isSubmitting}
            >
              Bitir
            </button>
          )}
        </footer>

        {isFinishDialogOpen ? (
          <div className="te-finish-overlay" role="presentation">
            <div className="te-finish-modal" role="dialog" aria-modal="true" aria-labelledby="te-finish-title">
              <div className="te-finish-icon">
                <QuestionMarkIcon />
              </div>
              <h2 id="te-finish-title" className="te-finish-title">Sınavı bitirmek istiyor musun?</h2>
              <p className="te-finish-copy">
                <strong>{answeredCount}</strong>/<strong>{totalQuestions}</strong> soru cevaplandı
              </p>
              <div className="te-finish-summary">
                <span className="te-finish-badge">{unansweredCount}</span>
                <span className="te-finish-summary__label">soru boş kaldı</span>
              </div>
              <p className="te-finish-note">Boş kalan sorulara dönebilirsin.</p>
              <div className="te-finish-actions">
                <button type="button" className="te-button te-button--finish-back" onClick={() => setIsFinishDialogOpen(false)}>
                  Geri Dön
                </button>
                <button
                  type="button"
                  className="te-button te-button--primary te-button--finish"
                  onClick={() => void submitExam()}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Bitir"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
