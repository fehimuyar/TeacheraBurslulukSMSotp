import { useEffect, useMemo, useRef, useState } from 'react';
import { AUTOSAVE_DELAY_MS, SECTION_LABELS } from './constants';
import { buildAttemptQuestionOrder } from './shuffle';
import type {
  ExamDraftSnapshot,
  ObjectiveQuestion,
  PersistedSpeakingResponse,
  PublicExamQuestion,
  ScholarshipExamModuleProps,
  SpeakingQuestion,
  SubmitExamResponse,
} from './types';
import { clamp, formatDuration, resolveAssetUrl } from './utils';
import { ListeningPlayer } from './components/listening-player';
import { OptionButton } from './components/option-button';
import { SpeakingRecorder } from './components/speaking-recorder';

function isObjectiveQuestion(question: PublicExamQuestion): question is ObjectiveQuestion {
  return question.type !== 'speaking';
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
  const orderedQuestions = useMemo(
    () => buildAttemptQuestionOrder(content, attempt.attemptId),
    [attempt.attemptId, content],
  );

  const [currentIndex, setCurrentIndex] = useState(initialDraft?.currentQuestionIndex ?? 0);
  const [objectiveAnswers, setObjectiveAnswers] = useState<Record<string, string | null>>(initialDraft?.objectiveAnswers ?? {});
  const [speakingResponses, setSpeakingResponses] = useState<Record<string, PersistedSpeakingResponse>>(
    initialDraft?.speakingResponses ?? {},
  );
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.floor((new Date(attempt.deadlineAt).getTime() - Date.now()) / 1000)),
  );
  const [submitState, setSubmitState] = useState<SubmitExamResponse | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastSavedSignatureRef = useRef('');
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
        lastSavedSignatureRef.current = '';
      });
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [adapter, attempt.attemptId, attempt.examVersionKey, objectiveAnswers]);

  const submitExam = async () => {
    if (isSubmitting || submitState) return;
    setSubmitError('');

    const uploadedSpeaking = orderedQuestions
      .filter((candidate): candidate is SpeakingQuestion => candidate.type === 'speaking')
      .map((candidate) => ({
        questionId: candidate.id,
        response: speakingResponses[candidate.id],
      }))
      .filter((item) => item.response?.status === 'uploaded' && item.response.responseId);

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
      setSubmitState(response);
      onSubmitted?.(response);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Sinav gonderilemedi.');
    } finally {
      setIsSubmitting(false);
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

  if (submitState) {
    return (
      <div className="te-exam te-exam--completion">
        <div className="te-shell">
          <div className="te-card te-card--completion">
            <span className="te-pill">Status</span>
            <h1 className="te-title">Degerlendirme bekleniyor</h1>
            <p className="te-copy">
              Objective bolumler kaydedildi. Speaking degerlendirmesi tamamlandiktan sonra final 100 puan aciklanacak.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const sectionProgress = `${currentIndex + 1} / ${totalQuestions}`;
  const selectedOptionId = isObjectiveQuestion(question) ? objectiveAnswers[question.id] ?? null : null;
  const visualSrc = resolveAssetUrl(assetBaseUrl, question.visualAsset);
  const listeningSrc = isObjectiveQuestion(question) ? resolveAssetUrl(assetBaseUrl, question.listeningAsset) : undefined;

  return (
    <div className="te-exam">
      <div className="te-shell">
        <header className="te-header">
          <div className="te-header__meta">
            <span className="te-timer">{formatDuration(remainingSeconds)}</span>
            <span className="te-progress">{sectionProgress}</span>
          </div>
        </header>

        <main className="te-card">
          <div className="te-card__meta">
            <span className="te-pill">{SECTION_LABELS[question.section]}</span>
          </div>

          {visualSrc ? (
            <div className="te-visual">
              <img src={visualSrc} alt={`Question ${question.questionNo} visual`} />
            </div>
          ) : null}

          {'readingPassage' in question && question.readingPassage ? (
            <article className="te-passage">
              <h2>Reading Text</h2>
              <p>{question.readingPassage}</p>
            </article>
          ) : null}

          {question.type === 'listening' ? <ListeningPlayer src={listeningSrc} /> : null}

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
              assetBaseUrl={assetBaseUrl}
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
            className="te-button"
            onClick={() => setCurrentIndex((previous) => clamp(previous - 1, 0, totalQuestions - 1))}
            disabled={currentIndex === 0}
          >
            Back
          </button>
          <div className="te-footer__spacer" />
          {currentIndex < totalQuestions - 1 ? (
            <button
              type="button"
              className="te-button"
              onClick={() => setCurrentIndex((previous) => clamp(previous + 1, 0, totalQuestions - 1))}
            >
              Skip
            </button>
          ) : null}
          {currentIndex < totalQuestions - 1 ? (
            <button
              type="button"
              className="te-button te-button--primary"
              onClick={() => setCurrentIndex((previous) => clamp(previous + 1, 0, totalQuestions - 1))}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="te-button te-button--primary"
              onClick={() => void submitExam()}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Exam'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
