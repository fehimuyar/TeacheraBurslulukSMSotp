"use client";

interface WelcomeScreenProps {
  onStart: () => void;
  hasExistingSession: boolean;
  onResume: () => void;
  logoSrc?: string;
  videoSrc?: string;
  videoPosterSrc?: string;
}

export function WelcomeScreen({
  onStart,
  hasExistingSession,
  onResume,
  logoSrc = "/shared-shell/teachera-logo-red.svg",
  videoSrc = "/shared-shell/sinav-tanitim.mp4",
  videoPosterSrc = "/shared-shell/husnu-karsilama.webp",
}: WelcomeScreenProps) {
  return (
    <div className="min-h-screen bg-bg-app flex items-center justify-center px-4 py-8 [background-image:radial-gradient(ellipse_at_center,transparent_40%,rgba(111,113,70,0.07)_100%)]">
      {/* Outer card with double-border depth effect */}
      <div className="w-full max-w-lg rounded-[var(--radius-card)] p-[3px] bg-gradient-to-b from-brand-sand/30 to-brand-olive/15 shadow-[var(--shadow-card)]">
        <div className="w-full rounded-[calc(var(--radius-card)-3px)] bg-bg-surface bg-vintage-texture border border-border-soft shadow-[inset_0_1px_3px_rgba(111,113,70,0.08)] px-8 py-12 md:px-14 md:py-16 flex flex-col items-center gap-7">

          {/* Logo */}
          <div
            className="animate-staggerFadeUp"
            style={{ animationDelay: "0ms" }}
          >
            <img
              src={logoSrc}
              alt="Teachera"
              className="w-full max-w-[220px] md:max-w-[260px] h-auto"
            />
          </div>

          {/* "Dil Okulu" label */}
          <p
            className="text-sm tracking-[0.3em] uppercase text-brand-olive/70 font-[var(--font-body)] -mt-3 animate-staggerFadeUp"
            style={{ animationDelay: "80ms" }}
          >
            Dil Okulu
          </p>

          {/* Hero title block */}
          <div
            className="flex flex-col items-center gap-3 text-center animate-staggerFadeUp"
            style={{ animationDelay: "160ms" }}
          >
            <h1 className="font-[var(--font-display)] font-bold text-3xl md:text-5xl text-brand-olive leading-tight tracking-tight">
              Bursluluk Sınavı
            </h1>
            <p className="font-[var(--font-body)] text-lg text-brand-sand italic">
              Haydi başlayalım!
            </p>
            {/* Decorative gradient rule */}
            <div className="w-16 h-[3px] bg-gradient-to-r from-brand-yellow to-brand-sand rounded-full mt-1" aria-hidden="true" />
          </div>

          {/* Video section */}
          <div
            className="w-full animate-staggerFadeUp"
            style={{ animationDelay: "280ms" }}
          >
            <div className="w-full rounded-[var(--radius-card)] overflow-hidden border border-brand-olive/20 shadow-[var(--shadow-card)]">
              <video
                className="w-full"
                controls
                playsInline
                preload="metadata"
                poster={videoPosterSrc}
              >
                <source src={videoSrc} type="video/mp4" />
              </video>
            </div>
            <p className="mt-3 text-center text-sm font-bold tracking-wide text-brand-red animate-pulse">
              Başlamadan önce videoyu izle!
            </p>
          </div>

          {/* CTA section */}
          <div
            className="flex flex-col items-center gap-3 w-full animate-staggerFadeUp"
            style={{ animationDelay: "400ms" }}
          >
            <button
              onClick={onStart}
              className="w-full md:max-w-[280px] min-h-[56px] rounded-[var(--radius-pill)] bg-brand-red border border-brand-olive/30 text-brand-cream text-lg font-bold tracking-wide transition-[transform,box-shadow,border-color] duration-150 ease-[cubic-bezier(0.2,0,0.13,1.5)] hover:border-brand-olive hover:translate-x-[3px] hover:-translate-y-[3px] hover:shadow-[-3px_3px_0px_0px_#6F7146] active:translate-x-[1px] active:-translate-y-[1px] active:shadow-[-2px_2px_0px_0px_#6F7146] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] animate-ctaPulseOnce"
              style={{ animationDelay: "600ms" }}
            >
              Başla
            </button>

            {/* Confidence text */}
            <p className="text-xs text-text-muted font-[var(--font-body)] tracking-wide">
              60 soru · 60 dakika
            </p>

            {hasExistingSession && (
              <button
                onClick={onResume}
                className="w-full md:max-w-[280px] min-h-[48px] rounded-[var(--radius-pill)] bg-transparent border border-brand-olive/50 text-brand-olive text-sm font-semibold tracking-wide hover:bg-brand-olive/8 active:scale-[0.98] transition-[background-color,transform] duration-150 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                Kaldığın yerden devam et
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
