"use client";

interface CompletionScreenProps {
  studentName: string;
  answeredCount: number;
  totalQuestions: number;
  onGoHome?: () => void;
  logoSrc?: string;
  heartSrc?: string;
}

export function CompletionScreen({
  studentName,
  answeredCount,
  totalQuestions,
  onGoHome,
  logoSrc = "/shared-shell/teachera-logo-red.svg",
  heartSrc = "/heart.webp",
}: CompletionScreenProps) {
  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome();
      return;
    }
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-bg-app flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md flex flex-col items-center gap-12 text-center">

        {/* Logo */}
        <img
          src={logoSrc}
          alt="Teachera"
          className="w-[160px] md:w-[200px] h-auto opacity-70 animate-staggerFadeUp"
          style={{ animationDelay: "0ms" }}
        />

        {/* "Well Done!" */}
        <h1
          className="font-[var(--font-display)] font-bold text-5xl md:text-6xl text-brand-olive tracking-tight leading-none animate-staggerFadeUp"
          style={{ animationDelay: "120ms" }}
        >
          Well Done!
        </h1>

        {/* Message */}
        <p
          className="text-lg md:text-xl text-brand-olive/80 leading-relaxed max-w-sm animate-staggerFadeUp"
          style={{ animationDelay: "240ms" }}
        >
          İlk bakışta fena geçmemiş gibi duruyor sınavın. Nihai incelemeyi yaptıktan sonra, sonuçları seninle paylaşacağız.
        </p>

        {/* "See you soon" with hand-drawn heart */}
        <div
          className="flex items-center justify-center gap-2 animate-staggerFadeUp"
          style={{ animationDelay: "360ms" }}
        >
          <p className="text-base text-brand-sand font-semibold italic tracking-wide">
            See you soon
          </p>
          <img
            src={heartSrc}
            alt=""
            width={32}
            height={30}
            className="animate-heartBeatSmall"
            aria-hidden="true"
          />
        </div>

        {/* Ana Sayfa button */}
        <button
          onClick={handleGoHome}
          className="w-full max-w-[240px] min-h-[52px] rounded-[var(--radius-pill)] bg-brand-red text-brand-cream text-base font-bold tracking-wide transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0.13,1.5)] hover:translate-x-[3px] hover:-translate-y-[3px] hover:shadow-[-3px_3px_0px_0px_#C8A96E] active:translate-x-[1px] active:-translate-y-[1px] active:shadow-[-2px_2px_0px_0px_#C8A96E] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] animate-staggerFadeUp"
          style={{ animationDelay: "480ms" }}
        >
          Ana Sayfa
        </button>

      </div>
    </div>
  );
}
