const EXAM_CLOCK_START_KEY_PREFIX = 'teachera_bursluluk_exam_clock_v1';

function buildExamClockStartKey(attemptId: string) {
  return `${EXAM_CLOCK_START_KEY_PREFIX}:${attemptId}`;
}

export function readExamClockStart(attemptId: string): string | null {
  if (typeof window === 'undefined' || !attemptId) return null;
  try {
    const raw = window.sessionStorage.getItem(buildExamClockStartKey(attemptId));
    if (!raw) return null;
    const parsedAt = Date.parse(raw);
    return Number.isFinite(parsedAt) ? new Date(parsedAt).toISOString() : null;
  } catch {
    return null;
  }
}

export function saveExamClockStart(attemptId: string, startedAt: string) {
  if (typeof window === 'undefined' || !attemptId) return;
  try {
    window.sessionStorage.setItem(buildExamClockStartKey(attemptId), startedAt);
  } catch {
    // Ignore storage failures to avoid blocking the exam.
  }
}

export function clearExamClockStart(attemptId: string) {
  if (typeof window === 'undefined' || !attemptId) return;
  try {
    window.sessionStorage.removeItem(buildExamClockStartKey(attemptId));
  } catch {
    // Ignore storage failures to avoid blocking the exam.
  }
}
