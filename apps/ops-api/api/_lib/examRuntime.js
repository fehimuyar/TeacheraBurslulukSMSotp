// AUTO-GENERATED FROM packages/shared/backend. DO NOT EDIT DIRECTLY.
import { safeTrim } from './http.js';

function readBoundedIntEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(safeTrim(process.env[name] || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function readExamRuntimeDurationSeconds() {
  const fallback = readBoundedIntEnv('BURSLULUK_EXAM_DURATION_SECONDS', 2400, 5 * 60, 8 * 60 * 60);
  return readBoundedIntEnv('EXAM_RUNTIME_DURATION_SECONDS', fallback, 5 * 60, 8 * 60 * 60);
}

function normalizeDateTimeLike(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : '';
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
  }
  if (typeof value === 'string') {
    const trimmed = safeTrim(value);
    if (!trimmed) return '';
    const parsed = new Date(trimmed);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : trimmed;
  }
  return '';
}

export function resolveExamRuntimeWindow(startedAt, now = new Date()) {
  const durationSeconds = readExamRuntimeDurationSeconds();
  const serverNow = now instanceof Date ? now : new Date(now);
  const serverNowIso = Number.isFinite(serverNow.getTime()) ? serverNow.toISOString() : new Date().toISOString();

  const startedAtIso = normalizeDateTimeLike(startedAt);
  const startedMs = startedAtIso ? Number(new Date(startedAtIso)) : NaN;
  if (!Number.isFinite(startedMs)) {
    return {
      duration_seconds: durationSeconds,
      started_at: null,
      deadline_at: null,
      server_time_utc: serverNowIso,
      elapsed_seconds: 0,
      remaining_seconds: durationSeconds,
      timed_out: false,
      source: 'missing_started_at',
    };
  }

  const deadlineMs = startedMs + (durationSeconds * 1000);
  const nowMs = Number(serverNow);
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
  const remainingSeconds = Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
  const timedOut = nowMs >= deadlineMs;

  return {
    duration_seconds: durationSeconds,
    started_at: new Date(startedMs).toISOString(),
    deadline_at: new Date(deadlineMs).toISOString(),
    server_time_utc: serverNowIso,
    elapsed_seconds: elapsedSeconds,
    remaining_seconds: remainingSeconds,
    timed_out: timedOut,
    source: 'started_at_plus_duration',
  };
}
