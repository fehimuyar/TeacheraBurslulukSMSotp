"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseAudioReturn {
  play: (src?: string) => void;
  pause: () => void;
  isPlaying: boolean;
  audioTestPassed: boolean;
  markAudioTestPassed: () => void;
}

export function useAudio(): UseAudioReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioTestPassed, setAudioTestPassed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const play = useCallback((src?: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }

    if (src) {
      const resolvedSrc =
        src.startsWith("/") || src.startsWith("http://") || src.startsWith("https://")
          ? src
          : `/assets/${src}`;
      audioRef.current = new Audio(resolvedSrc);
    }

    if (!audioRef.current) return;

    const audio = audioRef.current;

    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => setIsPlaying(false);
    audio.onpause = () => setIsPlaying(false);
    audio.onplay = () => setIsPlaying(true);

    audio.play().catch(() => setIsPlaying(false));
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const markAudioTestPassed = useCallback(() => {
    setAudioTestPassed(true);
  }, []);

  return { play, pause, isPlaying, audioTestPassed, markAudioTestPassed };
}
