export interface StartExamSessionPayload {
  studentFullName: string;
  parentFullName: string;
  parentPhoneE164: string;
  parentEmail?: string;
  schoolName?: string;
  grade?: number;
  ageRange: string;
  language: string;
  source?: string;
  bankKey?: string;
  questionCount?: number;
  campaignCode?: string;
  consent?: {
    kvkkApproved: boolean;
    contactConsent?: boolean;
    consentVersion: string;
    legalTextVersion?: string;
    source?: string;
  };
  kvkkConsent?: boolean;
  kvkkConsentVersion?: string;
  kvkkLegalTextVersion?: string;
  contactConsent?: boolean;
}

export interface StartExamSessionResponse {
  session: {
    candidateId: string;
    applicationNo: string;
    applicationStatus: string;
    attemptId: string;
    sessionToken: string;
    expiresAt: string;
    startedAt: string;
    credentialsSmsStatus?: string;
    credentialsSmsJobId?: string;
    consentVersion?: string;
  };
}

export interface SchoolSearchItem {
  id: string | null;
  name: string;
  district: string | null;
  city: string | null;
  source: 'db' | 'fallback';
}

export interface SchoolSearchResponse {
  query: string;
  items: SchoolSearchItem[];
}

export interface CandidateLoginPayload {
  username: string;
  password: string;
  campaignCode?: string;
}

export interface CandidateLoginResponse {
  session: {
    applicationNo: string;
    attemptId: string;
    candidateId: string;
    sessionToken: string;
    expiresAt: string;
    examStatus: string;
    examLanguage?: string;
    examAgeRange?: string;
    questionCount?: number;
  };
  candidate: {
    studentFullName?: string | null;
    parentFullName?: string | null;
    grade?: number | null;
  };
  gate: {
    exam_open: boolean;
    exam_open_at: string | null;
    server_time_utc: string;
    remaining_seconds: number;
    source?: string;
  };
}

export interface ExamSessionStatusResponse {
  session: {
    attemptId: string;
    applicationNo: string;
    candidateId: string;
    campaignCode: string;
    examStatus: string;
    expiresAt: string;
  };
  gate: {
    exam_open: boolean;
    exam_open_at: string | null;
    server_time_utc: string;
    remaining_seconds: number;
    source?: string;
  };
}

export interface RenewCandidateCredentialsPayload {
  attemptId?: string;
  applicationNo?: string;
  parentPhoneE164?: string;
  campaignCode?: string;
}

export interface RenewCandidateCredentialsResponse {
  credentials: {
    applicationNo: string;
    sessionToken: string;
    expiresAt: string;
    phone: string;
    credentialsSmsStatus: string;
    jobId: string;
  };
}

export interface SubmitExamPayload {
  attemptId: string;
  completionStatus: 'completed' | 'time_limit_reached' | 'left_exam';
  durationSeconds: number;
  placementLabel?: string;
  cefrBand?: string;
  answers?: Array<{
    questionId: string;
    selectedOption: string | null;
    isCorrect: boolean | null;
    scoreDelta: number;
    questionWeight: number;
  }>;
  metrics: {
    score: number;
    percentage: number;
    answeredCount: number;
    correctCount: number;
    wrongCount: number;
    unansweredCount: number;
    placementLabel?: string;
  };
}

export interface SaveExamAnswersPayload {
  attemptId: string;
  answers: Array<{
    questionId: string;
    selectedOption: string | null;
    isCorrect: boolean | null;
    scoreDelta: number;
    questionWeight: number;
  }>;
}

export interface SaveExamAnswersResponse {
  attempt_id: string;
  answered_count: number;
}

export interface SubmitExamResponse {
  result: {
    attempt_id: string;
    result_id: string;
    status: string;
    score: number;
    percentage: number;
    placement_label: string | null;
    cefr_band: string | null;
    published_at: string | null;
    viewed_at: string | null;
  };
  notifications_enqueued: boolean;
}

function isTruthyEnv(value: unknown) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function resolveExamApiBase() {
  const base = (import.meta.env.VITE_EXAM_API_BASE || '').trim();
  const directApiInDev = isTruthyEnv(import.meta.env.VITE_DEV_DIRECT_API);

  if (import.meta.env.DEV && !directApiInDev && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  if (base) return base;
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  throw new Error('missing_vite_exam_api_base');
}

export function resolveExamEndpoint(path: string) {
  const base = resolveExamApiBase();
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = typeof payload === 'object' && payload && 'message' in payload ? String(payload.message) : `HTTP ${response.status}`;
    throw new Error(reason);
  }
  return payload as T;
}

export async function startExamSession(payload: StartExamSessionPayload): Promise<StartExamSessionResponse> {
  const response = await fetch(resolveExamEndpoint('/api/exam/session/start'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseApiResponse<StartExamSessionResponse>(response);
}

export async function searchSchools(queryText: string, limit = 8): Promise<SchoolSearchResponse> {
  const endpoint = new URL(resolveExamEndpoint('/api/schools/search'));
  endpoint.searchParams.set('q', String(queryText || '').trim());
  endpoint.searchParams.set('limit', String(Math.max(1, Math.min(50, Math.trunc(limit)))));

  const response = await fetch(endpoint.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  return parseApiResponse<SchoolSearchResponse>(response);
}

export async function candidateLogin(payload: CandidateLoginPayload): Promise<CandidateLoginResponse> {
  const response = await fetch(resolveExamEndpoint('/api/exam/candidate/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseApiResponse<CandidateLoginResponse>(response);
}

export async function getExamSessionStatus(sessionToken: string, attemptId: string): Promise<ExamSessionStatusResponse> {
  const endpoint = new URL(resolveExamEndpoint('/api/exam/session/status'));
  endpoint.searchParams.set('attemptId', String(attemptId || '').trim());

  const response = await fetch(endpoint.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'x-exam-session-token': sessionToken,
    },
  });

  return parseApiResponse<ExamSessionStatusResponse>(response);
}

export async function renewCandidateCredentials(
  sessionToken: string | null | undefined,
  payload: RenewCandidateCredentialsPayload,
): Promise<RenewCandidateCredentialsResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (String(sessionToken || '').trim()) {
    headers['x-exam-session-token'] = String(sessionToken).trim();
  }

  const response = await fetch(resolveExamEndpoint('/api/exam/session/credentials'), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  return parseApiResponse<RenewCandidateCredentialsResponse>(response);
}

export async function submitExam(sessionToken: string, payload: SubmitExamPayload): Promise<SubmitExamResponse> {
  const response = await fetch(resolveExamEndpoint('/api/exam/session/submit'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-exam-session-token': sessionToken,
    },
    body: JSON.stringify(payload),
    keepalive: true,
  });

  return parseApiResponse<SubmitExamResponse>(response);
}

export async function saveExamAnswers(
  sessionToken: string,
  payload: SaveExamAnswersPayload,
): Promise<SaveExamAnswersResponse> {
  const response = await fetch(resolveExamEndpoint('/api/exam/session/answer'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-exam-session-token': sessionToken,
    },
    body: JSON.stringify(payload),
    keepalive: true,
  });

  return parseApiResponse<SaveExamAnswersResponse>(response);
}

export function saveExamAnswersOnUnload(sessionToken: string, payload: SaveExamAnswersPayload): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;

  const endpoint = resolveExamEndpoint('/api/exam/session/answer');
  const body = {
    ...payload,
    sessionToken,
  };

  try {
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    return navigator.sendBeacon(endpoint, blob);
  } catch {
    return false;
  }
}

export function submitExamOnUnload(sessionToken: string, payload: SubmitExamPayload): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;

  const endpoint = resolveExamEndpoint('/api/exam/session/submit');
  const body = {
    ...payload,
    sessionToken,
  };

  try {
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    return navigator.sendBeacon(endpoint, blob);
  } catch {
    return false;
  }
}
