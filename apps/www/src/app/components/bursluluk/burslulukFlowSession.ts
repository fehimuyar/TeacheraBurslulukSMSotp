export interface BurslulukCandidateSession {
  applicationNo: string;
  candidateCode?: string;
  attemptId: string;
  sessionToken: string;
  candidateId?: string;
  expiresAt?: string;
  startedAt?: string;
  credentialsSmsStatus?: string;
  consentVersion?: string;
  studentFullName: string;
  parentFullName: string;
  parentPhoneE164: string;
  parentEmail?: string;
  schoolName: string;
  schoolDistrict?: string;
  schoolType?: string;
  grade: number;
  tckn?: string;
  birthYear?: string;
  branch?: string;
  selectedSessionId?: string;
  selectedSessionLabel?: string;
  ageRange: string;
  language: string;
  questionCount: number;
  campaignCode: string;
  examOpenAt: string;
  examSlotLabel?: string;
  createdAt: string;
}

export interface BurslulukExamDraft {
  attemptId: string;
  answers: Record<string, string>;
  remainingSeconds: number;
  updatedAt: string;
}

const SESSION_KEY = 'teachera_bursluluk_candidate_session_v1';
const DRAFT_KEY_PREFIX = 'teachera_bursluluk_exam_draft_v1';
const MAX_SESSION_AGE_MS = 1000 * 60 * 60 * 24 * 7;

function readStorage(key: string) {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(key);
}

function writeStorage(key: string, value: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(key, value);
}

function removeStorage(key: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(key);
}

function draftKey(attemptId: string) {
  return `${DRAFT_KEY_PREFIX}:${attemptId}`;
}

export function normalizeGrade(raw: unknown) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 8;
  return Math.max(1, Math.min(12, Math.trunc(value)));
}

export function deriveAgeRangeFromGrade(grade: number) {
  if (grade <= 6) return '7–12';
  return '13–17';
}

export function resolveDefaultExamOpenAt() {
  const envValue = String(import.meta.env.VITE_BURSLULUK_EXAM_OPEN_AT || '').trim();
  if (envValue) return envValue;
  const fallback = new Date(Date.now() + 1000 * 60 * 5);
  return fallback.toISOString();
}

export function saveCandidateSession(payload: Omit<BurslulukCandidateSession, 'createdAt'>) {
  const normalized: BurslulukCandidateSession = {
    ...payload,
    grade: normalizeGrade(payload.grade),
    createdAt: new Date().toISOString(),
  };
  writeStorage(SESSION_KEY, JSON.stringify(normalized));
  return normalized;
}

export function readCandidateSession() {
  const raw = readStorage(SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as BurslulukCandidateSession;
    const createdAtMs = Number(new Date(parsed.createdAt));
    if (!Number.isFinite(createdAtMs)) {
      removeStorage(SESSION_KEY);
      return null;
    }
    if (Date.now() - createdAtMs > MAX_SESSION_AGE_MS) {
      removeStorage(SESSION_KEY);
      return null;
    }
    const expiresAtMs = Number(new Date(parsed.expiresAt || ''));
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      removeStorage(SESSION_KEY);
      return null;
    }
    return {
      ...parsed,
      grade: normalizeGrade(parsed.grade),
      ageRange: parsed.ageRange || deriveAgeRangeFromGrade(normalizeGrade(parsed.grade)),
      questionCount: Number(parsed.questionCount || 40),
      examOpenAt: parsed.examOpenAt || resolveDefaultExamOpenAt(),
    } as BurslulukCandidateSession;
  } catch {
    removeStorage(SESSION_KEY);
    return null;
  }
}

export function clearCandidateSession() {
  removeStorage(SESSION_KEY);
}

export function saveExamDraft(payload: BurslulukExamDraft) {
  if (!payload.attemptId) return;
  writeStorage(draftKey(payload.attemptId), JSON.stringify(payload));
}

export function readExamDraft(attemptId: string) {
  const raw = readStorage(draftKey(attemptId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BurslulukExamDraft;
  } catch {
    removeStorage(draftKey(attemptId));
    return null;
  }
}

export function clearExamDraft(attemptId: string) {
  if (!attemptId) return;
  removeStorage(draftKey(attemptId));
}
