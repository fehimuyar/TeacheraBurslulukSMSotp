"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  ScholarshipExamModule,
  type ExamAttemptState,
  type ExamContentPublic,
  type ExamDraftSnapshot,
  type ExamModuleAdapter,
  type SubmitExamResponse,
} from "../bursluluk-exam";
import { clearDraft, readDraft } from "../bursluluk-exam/utils";
import { clearExamClockStart, readExamClockStart, saveExamClockStart } from "./progress";
import { CompletionScreen } from "./completion-screen";
import { PrepScreen } from "./prep-screen";
import { useAudio } from "./use-audio";
import { WelcomeScreen } from "./welcome-screen";
import "./shell-theme.css";

type ShellScreen = "welcome" | "prep" | "exam" | "completion";

interface BurslulukExamShellProps {
  content: ExamContentPublic;
  attempt: ExamAttemptState;
  adapter: ExamModuleAdapter;
  assetBaseUrl?: string;
  initialScreen?: ShellScreen;
}

const AUDIO_TEST_SRC = "/shared-shell/husnu-ses-test.mp3";

function hasSavedProgress(draft: ExamDraftSnapshot | null): boolean {
  if (!draft) return false;
  if (draft.currentQuestionIndex > 0) return true;
  if (Object.values(draft.objectiveAnswers ?? {}).some(Boolean)) return true;
  return Object.values(draft.speakingResponses ?? {}).some(Boolean);
}

function getAnsweredCount(draft: ExamDraftSnapshot | null): number {
  if (!draft) return 0;
  const objectiveCount = Object.values(draft.objectiveAnswers ?? {}).filter(Boolean).length;
  const speakingCount = Object.values(draft.speakingResponses ?? {}).filter(Boolean).length;
  return objectiveCount + speakingCount;
}

export function BurslulukExamShell({
  content,
  attempt,
  adapter,
  assetBaseUrl,
  initialScreen = "welcome",
}: BurslulukExamShellProps) {
  const navigate = useNavigate();
  const initialDraft = useMemo(() => readDraft(attempt.attemptId), [attempt.attemptId]);
  const [screen, setScreen] = useState<ShellScreen>(initialScreen);
  const [lastDraft, setLastDraft] = useState<ExamDraftSnapshot | null>(initialDraft);
  const [examClockStartedAt, setExamClockStartedAt] = useState<string | null>(() => readExamClockStart(attempt.attemptId));
  const { play, pause, isPlaying, audioTestPassed, markAudioTestPassed } = useAudio();
  const [antiCheatWarningCount, setAntiCheatWarningCount] = useState(0);
  const [showAntiCheatWarning, setShowAntiCheatWarning] = useState(false);
  const wasHiddenRef = useRef(false);
  const warningTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setLastDraft(readDraft(attempt.attemptId));
    setExamClockStartedAt(readExamClockStart(attempt.attemptId));
    setScreen(initialScreen);
  }, [attempt.attemptId, initialScreen]);

  useEffect(() => {
    if (initialScreen !== "exam") return;
    const existing = readExamClockStart(attempt.attemptId);
    if (existing) {
      setExamClockStartedAt(existing);
      return;
    }
    const nextStartedAt = new Date().toISOString();
    saveExamClockStart(attempt.attemptId, nextStartedAt);
    setExamClockStartedAt(nextStartedAt);
  }, [attempt.attemptId, initialScreen]);

  useEffect(() => pause, [pause]);

  const hasExistingSession = useMemo(() => hasSavedProgress(lastDraft), [lastDraft]);

  const effectiveAttempt = useMemo<ExamAttemptState>(() => {
    if (!examClockStartedAt) {
      return attempt;
    }

    const startedAtMs = Date.parse(examClockStartedAt);
    if (!Number.isFinite(startedAtMs)) {
      return attempt;
    }

    return {
      ...attempt,
      startedAt: new Date(startedAtMs).toISOString(),
      deadlineAt: new Date(startedAtMs + attempt.durationSeconds * 1000).toISOString(),
    };
  }, [attempt, examClockStartedAt]);

  const ensureExamClockStarted = () => {
    const existing = readExamClockStart(attempt.attemptId);
    if (existing) {
      setExamClockStartedAt(existing);
      return existing;
    }

    const nextStartedAt = new Date().toISOString();
    saveExamClockStart(attempt.attemptId, nextStartedAt);
    setExamClockStartedAt(nextStartedAt);
    return nextStartedAt;
  };

  useEffect(() => {
    if (screen !== "exam" || typeof document === "undefined") {
      wasHiddenRef.current = false;
      setShowAntiCheatWarning(false);
      if (warningTimerRef.current) {
        window.clearTimeout(warningTimerRef.current);
        warningTimerRef.current = null;
      }
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wasHiddenRef.current = true;
        return;
      }

      if (document.visibilityState === "visible" && wasHiddenRef.current) {
        wasHiddenRef.current = false;
        setAntiCheatWarningCount((previous) => previous + 1);
        setShowAntiCheatWarning(true);

        if (warningTimerRef.current) {
          window.clearTimeout(warningTimerRef.current);
        }
        warningTimerRef.current = window.setTimeout(() => {
          setShowAntiCheatWarning(false);
          warningTimerRef.current = null;
        }, 4500);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (warningTimerRef.current) {
        window.clearTimeout(warningTimerRef.current);
        warningTimerRef.current = null;
      }
    };
  }, [screen]);

  const handleAudioTest = () => {
    play(AUDIO_TEST_SRC);
    markAudioTestPassed();
  };

  const handleGoHome = () => {
    clearDraft(attempt.attemptId);
    clearExamClockStart(attempt.attemptId);
    setLastDraft(null);
    navigate("/bursluluk/giris");
  };

  const handleSubmitted = (response: SubmitExamResponse) => {
    clearDraft(attempt.attemptId);
    clearExamClockStart(attempt.attemptId);
    setLastDraft(null);
    setExamClockStartedAt(null);
    setScreen("completion");
  };

  if (screen === "welcome") {
    return (
      <div className="bursluluk-shell">
        <WelcomeScreen
          onStart={() => setScreen("prep")}
          hasExistingSession={hasExistingSession}
          onResume={() => {
            ensureExamClockStarted();
            setScreen("exam");
          }}
        />
      </div>
    );
  }

  if (screen === "prep") {
    return (
      <div className="bursluluk-shell">
        <PrepScreen
          onReady={() => {
            pause();
            ensureExamClockStarted();
            setScreen("exam");
          }}
          audioTestPassed={audioTestPassed}
          onAudioTest={handleAudioTest}
          isAudioPlaying={isPlaying}
        />
      </div>
    );
  }

  if (screen === "completion") {
    return (
      <div className="bursluluk-shell">
        <CompletionScreen
          studentName={attempt.studentLabel ?? ""}
          answeredCount={getAnsweredCount(lastDraft)}
          totalQuestions={content.questions.length}
          onGoHome={handleGoHome}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      {showAntiCheatWarning ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[80] flex justify-center px-4">
          <div className="pointer-events-auto flex w-full max-w-[720px] items-start gap-3 rounded-[22px] border border-[#E7C78F] bg-[#FFF6E7] px-4 py-3 text-[#5C4630] shadow-[0_18px_42px_rgba(92,70,48,0.18)]">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E73D24] text-[14px] font-bold text-white">
              !
            </div>
            <div className="min-w-0">
              <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] uppercase tracking-[0.14em] text-[#8E5B1E]">
                Sınav Uyarısı {antiCheatWarningCount > 0 ? `· ${antiCheatWarningCount}` : ""}
              </p>
              <p className="mt-1 text-[14px] leading-[1.6] text-[#5C4630]">
                Sınav sırasında sekme veya uygulama değiştirmeyin. Lütfen sınav ekranında kalarak devam edin.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAntiCheatWarning(false)}
              className="ml-auto inline-flex min-h-[44px] items-center justify-center rounded-full border border-[#DCC39E] bg-white px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7A5A34] transition-colors hover:bg-[#FFF9EF]"
            >
              Tamam
            </button>
          </div>
        </div>
      ) : null}

      <ScholarshipExamModule
        content={content}
        attempt={effectiveAttempt}
        adapter={adapter}
        assetBaseUrl={assetBaseUrl}
        initialDraft={lastDraft ?? undefined}
        onDraftChange={setLastDraft}
        onSubmitted={handleSubmitted}
      />
    </div>
  );
}
