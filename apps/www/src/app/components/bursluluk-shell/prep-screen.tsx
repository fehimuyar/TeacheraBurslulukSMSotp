"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PrepScreenProps {
  onReady: () => void;
  audioTestPassed: boolean;
  onAudioTest: () => void;
  isAudioPlaying: boolean;
  enableMicWarning?: boolean;
  logoSrc?: string;
}

export function PrepScreen({
  onReady,
  audioTestPassed,
  onAudioTest,
  isAudioPlaying,
  enableMicWarning = false,
  logoSrc = "/shared-shell/teachera-logo-olive.svg",
}: PrepScreenProps) {
  const [micTestStatus, setMicTestStatus] = useState<"idle" | "testing" | "passed" | "failed">("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [showMicWarning, setShowMicWarning] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const isMicTesting = micTestStatus === "testing";
  const micTestPassed = micTestStatus === "passed";

  // Audio test is required; mic test is optional (some browsers block getUserMedia)
  const isReadyToAdvance = audioTestPassed;

  const stopMicResources = useCallback(() => {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => stopMicResources, [stopMicResources]);

  const handleMicTest = async () => {
    if (isMicTesting) return;
    stopMicResources();
    setMicLevel(0);
    setMicTestStatus("testing");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextCtor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextCtor) {
        throw new Error("unsupported_audio_context");
      }

      const audioContext = new AudioContextCtor();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      let detectedSignal = false;
      const buffer = new Uint8Array(analyser.fftSize);

      const readLevel = () => {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (const value of buffer) {
          const normalized = (value - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / buffer.length);
        const scaledLevel = Math.min(1, rms * 6);
        if (scaledLevel > 0.08) {
          detectedSignal = true;
        }
        setMicLevel(scaledLevel);
        animationFrameRef.current = window.requestAnimationFrame(readLevel);
      };

      readLevel();

      timeoutRef.current = window.setTimeout(() => {
        stopMicResources();
        setMicLevel(0);
        setMicTestStatus(detectedSignal ? "passed" : "failed");
        if (!detectedSignal && enableMicWarning) {
          setShowMicWarning(true);
        }
      }, 1800);
    } catch {
      stopMicResources();
      setMicLevel(0);
      setMicTestStatus("failed");
      if (enableMicWarning) {
        setShowMicWarning(true);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReadyToAdvance) {
      return;
    }
    if (enableMicWarning && !micTestPassed) {
      setShowMicWarning(true);
      return;
    }
    onReady();
  };

  const micStatusCopy =
    micTestStatus === "passed"
      ? "Tamam"
      : micTestStatus === "failed"
        ? "Ses algılanamadı"
        : micTestStatus === "testing"
          ? "Dinleniyor..."
          : "İsteğe bağlı";

  const micStatusTone =
    micTestStatus === "passed"
      ? "text-brand-olive"
      : micTestStatus === "failed"
        ? "text-brand-claret"
        : micTestStatus === "testing"
          ? "text-brand-red"
          : "text-text-muted";

  return (
    <div className="min-h-screen bg-bg-app flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg flex flex-col gap-7 rounded-[var(--radius-card)] bg-bg-surface border border-border-soft shadow-[var(--shadow-soft)] px-6 py-10 md:px-10 md:py-12 animate-fadeSlideIn bg-vintage-texture">
        {/* Logo + Title */}
        <div className="flex items-center gap-3">
          <img src={logoSrc} alt="Teachera" className="h-5 md:h-6 w-auto" />
          <span className="text-border-strong">|</span>
          <h1 className="font-[var(--font-display)] font-medium text-2xl md:text-3xl text-brand-olive leading-tight">
            Hazırlık
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Audio + Mic test pair — centered */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {/* Audio test */}
            <div className="flex-1 flex flex-col gap-2 p-4 rounded-[var(--radius-card)] bg-brand-olive/5 border-2 border-brand-olive/20">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-text-secondary tracking-wide">
                  Ses Testi
                </span>
                <span className="inline-flex items-center rounded-full bg-brand-red/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-red">
                  Zorunlu
                </span>
              </div>
              <p className="text-xs text-text-muted">
                Sınava başlamadan önce sesi mutlaka test et. Butona basınca örnek sesi duyuyor olmalısın.
              </p>
              <div className="flex items-center gap-3 mt-auto">
                <button
                  type="button"
                  onClick={onAudioTest}
                  aria-label={isAudioPlaying ? "Ses çalıyor" : "Sesi test et"}
                  className="flex items-center gap-2 min-h-[44px] px-4 rounded-[var(--radius-pill)] bg-brand-olive text-brand-cream font-semibold text-sm transition-all duration-200 hover:bg-brand-olive/90 active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  {/* Speaker icon */}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 18 18"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 6.5H6L10 3V15L6 11.5H3V6.5Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M13 6.5C14.1 7.2 14.8 8 14.8 9C14.8 10 14.1 10.8 13 11.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  {isAudioPlaying ? "Çalıyor..." : "Test Et"}
                </button>

                <div className={`flex items-center gap-1.5 font-semibold text-sm ${audioTestPassed ? "text-brand-olive" : "text-brand-claret"}`}>
                  {audioTestPassed ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle cx="9" cy="9" r="8" fill="#6F7146" />
                      <path
                        d="M5 9L8 12L13 6"
                        stroke="#F4EBD1"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <circle cx="9" cy="9" r="8" fill="#792636" fillOpacity="0.14" />
                      <path d="M9 5.2V9.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <circle cx="9" cy="12.6" r="1" fill="currentColor" />
                    </svg>
                  )}
                  {audioTestPassed ? "Tamam" : "Önce bunu tamamla"}
                </div>
              </div>
            </div>

            {/* Mic test */}
            <div className="flex-1 flex flex-col gap-2 p-4 rounded-[var(--radius-card)] bg-brand-olive/5 border-2 border-brand-olive/20">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-text-secondary tracking-wide">
                  Mikrofon Testi
                </span>
                <span className="inline-flex items-center rounded-full bg-brand-olive/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-olive">
                  Önerilir
                </span>
              </div>
              <p className="text-xs text-text-muted">
                Speaking istersen kullanılır. Sesini gerçekten algılıyor mu diye kontrol etmek için test et.
              </p>
              <div
                className="flex items-end gap-1 h-10 rounded-[var(--radius-card)] bg-bg-panel px-3 py-2"
                aria-hidden="true"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => {
                  const base = 8 + ((index % 3) * 4);
                  const extra = Math.round(micLevel * (18 + index * 2));
                  const height = isMicTesting ? Math.min(32, base + extra) : base;
                  return (
                    <span
                      key={index}
                      className={`w-1.5 rounded-full transition-all duration-150 ${
                        micTestPassed ? "bg-brand-olive" : micTestStatus === "failed" ? "bg-brand-sand" : "bg-brand-yellow"
                      }`}
                      style={{ height }}
                    />
                  );
                })}
              </div>
              <div className="flex items-center gap-3 mt-auto">
                <button
                  type="button"
                  onClick={handleMicTest}
                  disabled={isMicTesting}
                  aria-label={
                    isMicTesting
                      ? "Mikrofon test ediliyor"
                      : micTestPassed
                        ? "Mikrofon tamam"
                        : "Mikrofonu test et"
                  }
                  className="flex items-center gap-2 min-h-[44px] px-4 rounded-[var(--radius-pill)] bg-brand-olive text-brand-cream font-semibold text-sm transition-all duration-200 hover:bg-brand-olive/90 active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  {/* Mic icon */}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 18 18"
                    fill="none"
                    aria-hidden="true"
                  >
                    <rect
                      x="6"
                      y="1"
                      width="6"
                      height="9"
                      rx="3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M3 8.5C3 11.8 5.7 14.5 9 14.5C12.3 14.5 15 11.8 15 8.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <line
                      x1="9"
                      y1="14.5"
                      x2="9"
                      y2="17"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <line
                      x1="6.5"
                      y1="17"
                      x2="11.5"
                      y2="17"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  {isMicTesting ? "Dinleniyor..." : micTestPassed ? "Tekrar Test Et" : "Test Et"}
                </button>

                <div className={`flex items-center gap-1.5 font-semibold text-sm ${micStatusTone}`}>
                  {micTestPassed ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle cx="9" cy="9" r="8" fill="#6F7146" />
                      <path
                        d="M5 9L8 12L13 6"
                        stroke="#F4EBD1"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                  <span aria-live="polite">{micStatusCopy}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[var(--radius-card)] bg-bg-panel/70 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-brand-olive">
              Ses testi zorunlu. Mikrofon testi isteğe bağlı.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              Mikrofonun çalışmasa bile speaking sorularını boş bırakıp sınava devam edebilirsin.
            </p>
          </div>

          {/* Info cards — 60 Soru + 60 Dakika only */}
          <div className="grid grid-cols-2 gap-3" role="list">
            {/* 60 Soru */}
            <div
              role="listitem"
              className="flex flex-col items-center gap-2 p-3 rounded-[var(--radius-card)] bg-bg-panel border border-border-soft"
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 22 22"
                fill="none"
                aria-hidden="true"
                className="text-brand-olive shrink-0"
              >
                <circle cx="11" cy="11" r="9.5" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M8 9C8 7.3 9.3 6 11 6C12.7 6 14 7.3 14 9C14 10.5 12.5 11 11.5 12C11.2 12.3 11 12.8 11 13.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <circle cx="11" cy="16" r="1" fill="currentColor" />
              </svg>
              <span className="text-sm font-bold text-brand-olive leading-tight">
                60 Soru
              </span>
            </div>

            {/* 60 Dakika */}
            <div
              role="listitem"
              className="flex flex-col items-center gap-2 p-3 rounded-[var(--radius-card)] bg-bg-panel border border-border-soft"
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 22 22"
                fill="none"
                aria-hidden="true"
                className="text-brand-olive shrink-0"
              >
                <circle cx="11" cy="11" r="9.5" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M11 5.5V11L14.5 13.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-sm font-bold text-brand-olive leading-tight">
                60 Dakika
              </span>
            </div>
          </div>

          {/* CTA */}
          <button
            type="submit"
            disabled={!isReadyToAdvance}
            className="w-full min-h-[56px] rounded-[var(--radius-pill)] bg-brand-red text-brand-cream text-lg font-bold tracking-wide transition-all duration-200 hover:bg-brand-red/90 active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {audioTestPassed ? "Sınava Başla" : "Önce Ses Testini Yap"}
          </button>
        </form>
      </div>

      {showMicWarning && (
        <dialog
          open
          aria-modal="true"
          aria-label="Mikrofon uyarısı"
          className="fixed inset-0 z-50 m-auto w-[min(90vw,420px)] rounded-[var(--radius-card)] bg-bg-surface-strong border border-border-soft shadow-[var(--shadow-soft)] backdrop:bg-black/40 p-0"
        >
          <div className="flex flex-col items-center gap-5 p-6 md:p-8 text-center animate-scaleIn">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-brand-yellow/20 text-brand-olive">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="8" y="2" width="8" height="12" rx="4" stroke="currentColor" strokeWidth="1.8" />
                <path d="M5 11.5C5 15.1 7.9 18 11.5 18C15.1 18 18 15.1 18 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M12 18V21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>

            <h2 className="font-[var(--font-display)] font-bold text-xl text-brand-olive">
              Mikrofonunuz çalışmıyor, yine de devam etmek istiyor musunuz?
            </h2>

            <p className="text-sm text-text-muted leading-relaxed">
              Speaking bölümü opsiyonel. İstersen mikrofon olmadan devam edebilir ya da testi tekrar deneyebilirsin.
            </p>

            <div className="flex gap-3 w-full mt-2">
              <button
                type="button"
                onClick={() => {
                  setShowMicWarning(false);
                  void handleMicTest();
                }}
                className="flex-1 min-h-[48px] px-4 rounded-[var(--radius-pill)] bg-transparent border-2 border-brand-olive text-brand-olive font-semibold text-sm transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0.13,1.5)] hover:bg-brand-olive/8 active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                Tekrar Test Et
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMicWarning(false);
                  onReady();
                }}
                className="flex-1 min-h-[48px] px-4 rounded-[var(--radius-pill)] bg-brand-red text-brand-cream font-bold text-sm transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0.13,1.5)] hover:translate-x-[3px] hover:-translate-y-[3px] hover:shadow-[-3px_3px_0px_0px_#6F7146] active:translate-x-[1px] active:-translate-y-[1px] active:shadow-[-2px_2px_0px_0px_#6F7146] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                Yine de Devam Et
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
