export interface StartExamSessionPayload {
  studentFullName: string;
  parentFullName: string;
  identityNo?: string;
  birthYear?: number;
  parentPhoneE164: string;
  parentEmail?: string;
  schoolName?: string;
  section?: string;
  grade?: number;
  selectedExamAt?: string;
  ageRange: string;
  language: string;
  source?: string;
  bankKey?: string;
  questionCount?: number;
  campaignCode?: string;
  attribution?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
    gclid?: string;
    fbclid?: string;
    msclkid?: string;
    first_touch_utm_source?: string;
    first_touch_utm_medium?: string;
    first_touch_utm_campaign?: string;
    last_touch_utm_source?: string;
    last_touch_utm_medium?: string;
    last_touch_utm_campaign?: string;
    first_touch_captured_at?: string;
    last_touch_captured_at?: string;
    landing_path?: string;
    landing_url?: string;
    referrer?: string;
  };
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
    candidateCode?: string | null;
    applicationStatus: string;
    attemptId: string;
    sessionToken: string;
    expiresAt: string;
    startedAt: string;
    section?: string | null;
    scheduledExamAt?: string | null;
    examSlotLabel?: string | null;
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
    candidateCode?: string | null;
    attemptId: string;
    candidateId: string;
    sessionToken: string;
    expiresAt: string;
    examStatus: string;
    examLanguage?: string;
    examAgeRange?: string;
    questionCount?: number;
    section?: string | null;
    scheduledExamAt?: string | null;
    examSlotLabel?: string | null;
  };
  candidate: {
    studentFullName?: string | null;
    parentFullName?: string | null;
    grade?: number | null;
    section?: string | null;
  };
  gate: {
    exam_open: boolean;
    exam_open_at: string | null;
    exam_force_open?: boolean;
    candidate_exam_open?: boolean;
    candidate_exam_open_at?: string | null;
    candidate_remaining_seconds?: number;
    server_time_utc: string;
    remaining_seconds: number;
    source?: string;
  };
}

export interface CandidatePasswordResetPayload {
  identityNo: string;
  birthYear: number;
  campaignCode?: string;
  confirm?: boolean;
}

export interface CandidatePasswordResetResponse {
  reset: {
    confirm_required: boolean;
    masked_phone: string;
    candidate_code: string;
    sms_queued?: boolean;
    sms_job_id?: string;
  };
}

export interface ExamSessionStatusResponse {
  session: {
    attemptId: string;
    applicationNo: string;
    candidateId: string;
    campaignCode: string;
    examStatus: string;
    startedAt?: string | null;
    scheduledExamAt?: string | null;
    examSlotLabel?: string | null;
    expiresAt: string;
  };
  gate: {
    exam_open: boolean;
    exam_open_at: string | null;
    exam_force_open?: boolean;
    candidate_exam_open?: boolean;
    candidate_exam_open_at?: string | null;
    candidate_remaining_seconds?: number;
    server_time_utc: string;
    remaining_seconds: number;
    source?: string;
  };
  runtime?: {
    duration_seconds: number;
    started_at: string | null;
    deadline_at: string | null;
    server_time_utc: string;
    elapsed_seconds: number;
    remaining_seconds: number;
    timed_out: boolean;
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

export interface TrackExamRuntimeEventPayload {
  attemptId: string;
  eventType: string;
  clientOccurredAt?: string;
  source?: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
}

export interface TrackExamRuntimeEventResponse {
  event: {
    recorded: boolean;
    event_id: string;
    attempt_id: string;
    event_type: string;
    occurred_at: string;
    attempt_status: string;
  };
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

export interface ResultAppointmentIntentPayload {
  attemptId: string;
  source?: string;
  destinationUrl?: string;
}

export interface ResultAppointmentIntentResponse {
  appointment_intent: {
    recorded: boolean;
    event_id: string;
    occurred_at: string;
    result_id: string;
    candidate_id: string;
    attempt_id: string;
  };
  dedupe_window_minutes: number;
}

export interface AppointmentSlotItem {
  appointment_at: string;
  capacity: number;
  booked: number;
  available: number;
  is_available: boolean;
  school_friendly?: boolean | null;
  recommended?: boolean;
}

export interface AppointmentSlotsResponse {
  attempt_id: string;
  timezone: string;
  slot_duration_minutes: number;
  consultant_count: number;
  min_lead_minutes: number;
  slots: AppointmentSlotItem[];
  candidate_school_schedule?: {
    school_name: string | null;
    school_shift_type: string | null;
    class_start_local: string | null;
    class_end_local: string | null;
  } | null;
  candidate_latest_appointment?: {
    event_type: string;
    occurred_at: string | null;
    appointment_at: string | null;
  } | null;
}

export interface AppointmentBookingPayload {
  attemptId: string;
  appointmentAt: string;
  source?: string;
}

export interface AppointmentBookingResponse {
  appointment_booking: {
    recorded: boolean;
    reason: string;
    event_id: string;
    occurred_at?: string | null;
    candidate_id: string;
    attempt_id: string;
    appointment_at: string;
    consultant_slot_index: number | null;
    consultant_count: number;
  };
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

function readExamRequestTimeoutMs() {
  const parsed = Number.parseInt(String(import.meta.env.VITE_EXAM_REQUEST_TIMEOUT_MS || ''), 10);
  if (!Number.isFinite(parsed)) return 12000;
  return Math.max(3000, Math.min(parsed, 30000));
}

async function withTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = readExamRequestTimeoutMs()) {
  const controller = new AbortController();
  const timeoutHandle = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('İstek zaman aşımına uğradı. Lütfen tekrar deneyin.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutHandle);
  }
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

export async function candidatePasswordReset(payload: CandidatePasswordResetPayload): Promise<CandidatePasswordResetResponse> {
  const response = await fetch(resolveExamEndpoint('/api/exam/candidate/password-reset'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseApiResponse<CandidatePasswordResetResponse>(response);
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

  const response = await withTimeout(resolveExamEndpoint('/api/exam/session/credentials'), {
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

export async function trackExamRuntimeEvent(
  sessionToken: string,
  payload: TrackExamRuntimeEventPayload,
): Promise<TrackExamRuntimeEventResponse> {
  const attemptId = String(payload.attemptId || '').trim();
  const eventType = String(payload.eventType || '').trim();
  if (!attemptId) {
    throw new Error('missing_attempt_id');
  }
  if (!eventType) {
    throw new Error('missing_event_type');
  }

  const response = await fetch(resolveExamEndpoint('/api/exam/session/events'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-exam-session-token': sessionToken,
    },
    body: JSON.stringify({
      attemptId,
      eventType,
      clientOccurredAt: payload.clientOccurredAt,
      source: payload.source,
      meta: payload.meta,
    }),
    keepalive: true,
  });

  return parseApiResponse<TrackExamRuntimeEventResponse>(response);
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

export async function trackResultAppointmentIntent(
  sessionToken: string,
  payload: ResultAppointmentIntentPayload,
): Promise<ResultAppointmentIntentResponse> {
  const attemptId = String(payload.attemptId || '').trim();
  if (!attemptId) {
    throw new Error('missing_attempt_id');
  }

  const response = await fetch(resolveExamEndpoint(`/api/exam/results/${encodeURIComponent(attemptId)}/appointment`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-exam-session-token': sessionToken,
    },
    body: JSON.stringify({
      source: payload.source,
      destinationUrl: payload.destinationUrl,
    }),
    keepalive: true,
  });

  return parseApiResponse<ResultAppointmentIntentResponse>(response);
}

export async function getAppointmentSlots(
  sessionToken: string,
  attemptId: string,
  limit = 24,
): Promise<AppointmentSlotsResponse> {
  const normalizedAttemptId = String(attemptId || '').trim();
  if (!normalizedAttemptId) {
    throw new Error('missing_attempt_id');
  }

  const endpoint = new URL(resolveExamEndpoint('/api/exam/appointments/slots'));
  endpoint.searchParams.set('attemptId', normalizedAttemptId);
  endpoint.searchParams.set('limit', String(Math.max(1, Math.min(120, Math.trunc(limit)))));

  const response = await fetch(endpoint.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'x-exam-session-token': sessionToken,
    },
  });

  return parseApiResponse<AppointmentSlotsResponse>(response);
}

export async function bookAppointmentSlot(
  sessionToken: string,
  payload: AppointmentBookingPayload,
): Promise<AppointmentBookingResponse> {
  const attemptId = String(payload.attemptId || '').trim();
  const appointmentAt = String(payload.appointmentAt || '').trim();
  if (!attemptId) {
    throw new Error('missing_attempt_id');
  }
  if (!appointmentAt) {
    throw new Error('missing_appointment_at');
  }

  const response = await fetch(resolveExamEndpoint('/api/exam/appointments/book'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-exam-session-token': sessionToken,
    },
    body: JSON.stringify({
      attemptId,
      appointmentAt,
      source: payload.source,
    }),
  });

  return parseApiResponse<AppointmentBookingResponse>(response);
}
