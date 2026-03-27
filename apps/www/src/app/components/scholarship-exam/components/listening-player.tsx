import { useEffect, useRef, useState } from 'react';

interface ListeningPlayerProps {
  src?: string;
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
      <button type="button" className="te-player__button" onClick={toggle} aria-label={isPlaying ? 'Dinlemeyi durdur' : 'Dinlemeyi baslat'}>
        {isPlaying ? 'Pause' : 'Listen'}
      </button>
      <div className="te-player__wave" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, index) => (
          <span
            key={index}
            className={`te-player__bar ${isPlaying ? 'is-active' : ''}`}
            style={{ animationDelay: `${index * 80}ms` }}
          />
        ))}
      </div>
      <span className="te-player__hint">{isPlaying ? 'Audio playing' : 'Tap to listen'}</span>
    </div>
  );
}
