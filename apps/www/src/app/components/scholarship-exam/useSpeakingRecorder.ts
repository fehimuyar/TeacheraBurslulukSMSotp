import { useCallback, useEffect, useRef, useState } from 'react';
import { RECORDER_MIME_PRIORITY } from './constants';
import { clamp } from './utils';

type RecorderStatus = 'idle' | 'recording' | 'ready' | 'error';

interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
}

interface UseSpeakingRecorderOptions {
  maxDurationSeconds: number;
}

interface UseSpeakingRecorderReturn {
  status: RecorderStatus;
  errorMessage: string;
  durationSeconds: number;
  audioUrl: string | null;
  result: RecordingResult | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<RecordingResult | null>;
  clearRecording: () => void;
}

function resolveSupportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return null;
  }
  for (const mimeType of RECORDER_MIME_PRIORITY) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return null;
}

function mergeAudioBuffers(buffers: Float32Array[]): Float32Array {
  const length = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
  const result = new Float32Array(length);
  let offset = 0;
  for (const buffer of buffers) {
    result.set(buffer, offset);
    offset += buffer.length;
  }
  return result;
}

function encodeWav(channelData: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + channelData.length * 2);
  const view = new DataView(buffer);

  function writeString(offset: number, value: string): void {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + channelData.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, channelData.length * 2, true);

  let offset = 44;
  for (let index = 0; index < channelData.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, channelData[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function useSpeakingRecorder({
  maxDurationSeconds,
}: UseSpeakingRecorderOptions): UseSpeakingRecorderReturn {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<RecordingResult | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const rawBuffersRef = useRef<Float32Array[]>([]);
  const fallbackSampleRateRef = useRef(44_100);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const pendingStopRef = useRef<Promise<RecordingResult | null> | null>(null);
  const stopResolverRef = useRef<((value: RecordingResult | null) => void) | null>(null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    mediaChunksRef.current = [];
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current.onaudioprocess = null;
      processorNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    rawBuffersRef.current = [];
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, []);

  const updateDuration = useCallback(() => {
    if (!startedAtRef.current) return;
    const seconds = clamp(Math.floor((Date.now() - startedAtRef.current) / 1000), 0, maxDurationSeconds);
    setDurationSeconds(seconds);
  }, [maxDurationSeconds]);

  const createObjectUrl = useCallback((blob: Blob) => {
    setAudioUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return URL.createObjectURL(blob);
    });
  }, []);

  const finalizeRecording = useCallback(
    (blob: Blob, mimeType: string) => {
      const safeDuration = clamp(
        startedAtRef.current ? Math.ceil((Date.now() - startedAtRef.current) / 1000) : durationSeconds,
        0,
        maxDurationSeconds,
      );
      const nextResult = {
        blob,
        mimeType,
        durationSeconds: safeDuration,
      };
      createObjectUrl(blob);
      setResult(nextResult);
      setDurationSeconds(safeDuration);
      setStatus('ready');
      setErrorMessage('');
      clearTimers();
      cleanupStream();
      stopResolverRef.current?.(nextResult);
      stopResolverRef.current = null;
      pendingStopRef.current = null;
      return nextResult;
    },
    [cleanupStream, clearTimers, createObjectUrl, durationSeconds, maxDurationSeconds],
  );

  const stopFallbackCapture = useCallback(() => {
    const merged = mergeAudioBuffers(rawBuffersRef.current);
    const wavBlob = encodeWav(merged, fallbackSampleRateRef.current);
    return finalizeRecording(wavBlob, 'audio/wav');
  }, [finalizeRecording]);

  const startFallbackCapture = useCallback(async (stream: MediaStream) => {
    const AudioContextCtor =
      window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error('unsupported_audio_context');
    }

    const audioContext = new AudioContextCtor();
    const sourceNode = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    rawBuffersRef.current = [];
    fallbackSampleRateRef.current = audioContext.sampleRate;

    processor.onaudioprocess = (event) => {
      const channel = event.inputBuffer.getChannelData(0);
      rawBuffersRef.current.push(new Float32Array(channel));
    };

    sourceNode.connect(processor);
    processor.connect(audioContext.destination);

    audioContextRef.current = audioContext;
    sourceNodeRef.current = sourceNode;
    processorNodeRef.current = processor;
  }, []);

  const stopRecording = useCallback(async (): Promise<RecordingResult | null> => {
    if (pendingStopRef.current) {
      return pendingStopRef.current;
    }
    if (status !== 'recording') {
      return result;
    }

    pendingStopRef.current = new Promise<RecordingResult | null>((resolve) => {
      stopResolverRef.current = resolve;
      clearTimers();
      updateDuration();

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        return;
      }

      resolve(stopFallbackCapture());
      stopResolverRef.current = null;
      pendingStopRef.current = null;
    });

    return pendingStopRef.current;
  }, [clearTimers, result, status, stopFallbackCapture, updateDuration]);

  const startRecording = useCallback(async () => {
    if (status === 'recording') return;

    setErrorMessage('');
    setResult(null);
    setDurationSeconds(0);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      mediaChunksRef.current = [];
      startedAtRef.current = Date.now();
      setStatus('recording');
      setDurationSeconds(0);

      const preferredMimeType = resolveSupportedMimeType();
      if (preferredMimeType && typeof MediaRecorder !== 'undefined') {
        const mediaRecorder = new MediaRecorder(stream, { mimeType: preferredMimeType });
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            mediaChunksRef.current.push(event.data);
          }
        };
        mediaRecorder.onerror = () => {
          setStatus('error');
          setErrorMessage('Kayit sirasinda bir hata olustu.');
          clearTimers();
          cleanupStream();
        };
        mediaRecorder.onstop = () => {
          const blob = new Blob(mediaChunksRef.current, { type: preferredMimeType });
          finalizeRecording(blob, preferredMimeType);
        };
        mediaRecorder.start();
      } else {
        await startFallbackCapture(stream);
      }

      timerRef.current = window.setInterval(() => {
        updateDuration();
      }, 250);
      autoStopRef.current = window.setTimeout(() => {
        void stopRecording();
      }, maxDurationSeconds * 1000);
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error && error.message ? error.message : 'Mikrofon izni alinamadi.');
      clearTimers();
      cleanupStream();
    }
  }, [
    audioUrl,
    cleanupStream,
    clearTimers,
    finalizeRecording,
    maxDurationSeconds,
    startFallbackCapture,
    status,
    stopRecording,
    updateDuration,
  ]);

  const clearRecording = useCallback(() => {
    clearTimers();
    cleanupStream();
    startedAtRef.current = null;
    setStatus('idle');
    setErrorMessage('');
    setResult(null);
    setDurationSeconds(0);
    setAudioUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return null;
    });
  }, [cleanupStream, clearTimers]);

  useEffect(() => {
    return () => {
      clearRecording();
    };
  }, [clearRecording]);

  return {
    status,
    errorMessage,
    durationSeconds,
    audioUrl,
    result,
    startRecording,
    stopRecording,
    clearRecording,
  };
}
