import { useEffect, useRef, useState } from "react";

interface ListeningPlayerProps {
  src?: string;
}

function PlayIcon() {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" fill="none" aria-hidden="true">
      <path d="M3 2.8L15 10L3 17.2V2.8Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" fill="none" aria-hidden="true">
      <rect x="3" y="2" width="4" height="16" rx="1.2" fill="currentColor" />
      <rect x="11" y="2" width="4" height="16" rx="1.2" fill="currentColor" />
    </svg>
  );
}

export function ListeningPlayer({ src }: ListeningPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const toggle = async () => {
    if (!src) return;
    if (!audioRef.current) {
      const audio = new Audio(src);
      audio.onplay = () => setIsPlaying(true);
      audio.onpause = () => setIsPlaying(false);
      audio.onended = () => setIsPlaying(false);
      audioRef.current = audio;
    }

    if (isPlaying) {
      audioRef.current.pause();
      return;
    }

    await audioRef.current.play().catch(() => {
      setIsPlaying(false);
    });
  };

  return (
    <div className="te-player">
      <button
        type="button"
        className="te-player__button"
        onClick={toggle}
        aria-label={isPlaying ? "Pause audio" : "Listen"}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="te-player__body">
        <div className="te-player__row">
          <div className="te-player__wave" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, index) => (
              <span
                key={index}
                className={`te-player__bar ${isPlaying ? "is-active" : ""}`}
                style={{ animationDelay: `${index * 80}ms` }}
              />
            ))}
          </div>
          <span className="te-player__label">Listen</span>
        </div>
        <span className="te-player__hint">Can you hear the sound?</span>
      </div>
    </div>
  );
}
