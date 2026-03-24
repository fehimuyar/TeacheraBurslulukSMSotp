import { safeLocalStorageGet, safeLocalStorageSet } from './storage';

export const COOKIE_CONSENT_KEY = 'teachera_cookie_consent';
export const CONSENT_UPDATED_EVENT = 'teachera:consent-updated';

const LAST_TOUCH_STORAGE_KEY = 'teachera_attribution_last_touch';
const FIRST_TOUCH_STORAGE_KEY = 'teachera_attribution_first_touch';
const FUNNEL_CONTEXT_STORAGE_KEY = 'teachera_funnel_context';
const SESSION_ID_STORAGE_KEY = 'teachera_session_id';
const VISIT_STATE_STORAGE_KEY = 'teachera_visit_state';
const LEAD_SCORE_STORAGE_KEY = 'teachera_lead_score';

const FIRST_TOUCH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const VISIT_TIMEOUT_MS = 30 * 60 * 1000;
const ENGAGED_TIME_MS = 30_000;

const SEO_FUNNEL_NAME = 'konya_turkiye_seo_funnel';
const SEO_LANDING_PATHS = new Set([
  '/konya-ingilizce-kursu',
  '/konya-speaking-club',
  '/konya-online-dil-kursu',
  '/turkiye-online-dil-kursu',
]);

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
] as const;

const EVENT_LEAD_POINTS: Partial<Record<EventName, number>> = {
  lead_form_submit_success: 40,
  whatsapp_click: 25,
  phone_click: 25,
  level_assessment_open: 20,
  free_trial_open: 15,
  pricing_view: 10,
  seo_landing_cta_click: 8,
  hero_language_cta_click: 5,
};

type ConsentRequirement = 'none' | 'analytics' | 'marketing';
type EventValue = string | number | boolean | null | undefined;
type AttributionKey = (typeof UTM_KEYS)[number];

export type LeadSegment = 'cold' | 'warm' | 'hot';
export type PageType =
  | 'home'
  | 'program'
  | 'pricing'
  | 'contact'
  | 'placement_exam'
  | 'seo_landing'
  | 'speakup'
  | 'other';

export type EventName =
  | 'page_view'
  | 'seo_landing_view'
  | 'seo_landing_cta_click'
  | 'free_trial_open'
  | 'level_assessment_open'
  | 'hero_language_cta_click'
  | 'whatsapp_click'
  | 'phone_click'
  | 'mailto_click'
  | 'lead_form_submit_attempt'
  | 'lead_form_submit_success'
  | 'lead_form_submit_failure'
  | 'cookie_consent_updated'
  | 'cta_click'
  | 'form_start'
  | 'form_step'
  | 'form_abandon'
  | 'scroll_depth_50'
  | 'scroll_depth_90'
  | 'engaged_30s'
  | 'placement_exam_start'
  | 'placement_exam_complete'
  | 'pricing_view'
  | 'contact_view';

interface CtaPayload {
  cta_id: string;
  cta_destination?: string;
  cta_position?: string;
  cta_text?: string;
  cta_location?: string;
  cta_tag?: string;
  cta_variant?: string;
  cta_type?: 'link' | 'button';
  source?: string;
}

interface LeadFormPayload {
  form_subject?: string;
  form_id?: string;
  field_count?: number;
  endpoint_domain?: string;
  delivery_method?: string;
  captcha_enabled?: boolean;
  fallback_reason?: string;
  error_message?: string;
}

interface PlacementExamStartPayload {
  exam_language?: string;
  age_range?: string;
  question_count?: number;
  exam_bank?: string;
}

interface PlacementExamCompletePayload {
  completion_status?: string;
  answered_count?: number;
  correct_count?: number;
  wrong_count?: number;
  unanswered_count?: number;
  score?: number;
  percentage?: number;
  question_count?: number;
  exam_language?: string;
  age_range?: string;
  duration_seconds?: number;
}

interface FormStartPayload {
  form_id: string;
  form_name?: string;
  form_method?: string;
  form_action?: string;
}

interface FormStepPayload {
  form_id: string;
  form_step_index: number;
  form_field?: string;
}

interface FormAbandonPayload {
  form_id: string;
  completed_steps: number;
  abandon_reason?: string;
  elapsed_seconds?: number;
}

interface ScrollDepthPayload {
  scroll_depth: 50 | 90;
}

interface EventPayloadMap {
  page_view: Record<string, EventValue>;
  seo_landing_view: {
    funnel_name: string;
    funnel_step: 'landing_view';
    landing_path: string;
  };
  seo_landing_cta_click: CtaPayload & {
    funnel_name: string;
    funnel_step: 'cta_click';
    landing_path: string;
  };
  free_trial_open: { source?: string };
  level_assessment_open: { source?: string };
  hero_language_cta_click: {
    cta_label?: string;
    cta_destination?: string;
    cta_location?: string;
  };
  whatsapp_click: {
    source?: string;
    href?: string;
    phone_number?: string;
    link_text?: string;
  };
  phone_click: {
    phone_number?: string;
    link_text?: string;
  };
  mailto_click: {
    email?: string;
    link_text?: string;
  };
  lead_form_submit_attempt: LeadFormPayload;
  lead_form_submit_success: LeadFormPayload;
  lead_form_submit_failure: LeadFormPayload;
  cookie_consent_updated: {
    action?: 'accept_all' | 'accept_selected' | 'reject_optional';
    analytics?: boolean;
    marketing?: boolean;
    personalization?: boolean;
  };
  cta_click: CtaPayload;
  form_start: FormStartPayload;
  form_step: FormStepPayload;
  form_abandon: FormAbandonPayload;
  scroll_depth_50: ScrollDepthPayload;
  scroll_depth_90: ScrollDepthPayload;
  engaged_30s: { engagement_seconds: number };
  placement_exam_start: PlacementExamStartPayload;
  placement_exam_complete: PlacementExamCompletePayload;
  pricing_view: { source?: string };
  contact_view: { source?: string };
}

export interface CookiePreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  personalization: boolean;
}

export interface LeadScoreState {
  score: number;
  segment: LeadSegment;
  updated_at: string;
}

interface TrackEventOptions {
  requires?: ConsentRequirement;
}

interface FunnelContext {
  funnel_name?: string;
  funnel_landing_path?: string;
  funnel_last_cta_id?: string;
  funnel_last_destination?: string;
  funnel_updated_at?: string;
}

interface SeoLandingCtaOptions {
  ctaId: string;
  destination: string;
  position?: string;
}

export interface AttributionSubmissionPayload {
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
}

interface AttributionState {
  values: Partial<Record<AttributionKey, string>>;
  updatedAt: string;
}

interface FirstTouchState extends AttributionState {
  expiresAt: string;
}

interface VisitState {
  id: string;
  startedAt: string;
  lastActivityAt: string;
}

interface FormProgressState {
  started: boolean;
  submitted: boolean;
  startedAt: number;
  completedFields: Set<string>;
}

const fallbackPreferences: CookiePreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
  personalization: false,
};

let engagedTimerId: number | null = null;
let engagedTimerKey = '';
const engagedTrackedKeys = new Set<string>();

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
    __teacheraTrackingInitialized?: boolean;
  }
}

function toConsentState(value: boolean): 'granted' | 'denied' {
  return value ? 'granted' : 'denied';
}

function normalizeValue(value: EventValue): EventValue {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.trim();
  return value;
}

function ensureDataLayer() {
  window.dataLayer = window.dataLayer || [];
  return window.dataLayer;
}

function safeSessionStorageGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionStorageSet(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage quota/private mode issues.
  }
}

function safeLocalStorageRemove(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore private mode issues.
  }
}

function parseConsent(raw: string | null): CookiePreferences {
  if (!raw) return fallbackPreferences;
  try {
    const parsed = JSON.parse(raw) as Partial<CookiePreferences>;
    return {
      necessary: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      personalization: Boolean(parsed.personalization),
    };
  } catch {
    return fallbackPreferences;
  }
}

function hasConsent(requirement: ConsentRequirement): boolean {
  if (requirement === 'none') return true;
  const preferences = getConsentPreferences();
  return Boolean(preferences[requirement]);
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readFunnelContext(): FunnelContext {
  return parseJson<FunnelContext>(safeSessionStorageGet(FUNNEL_CONTEXT_STORAGE_KEY)) || {};
}

function saveFunnelContext(context: FunnelContext) {
  safeSessionStorageSet(FUNNEL_CONTEXT_STORAGE_KEY, JSON.stringify(context));
}

function resolveSeoLandingPath(pathname: string): string | null {
  return SEO_LANDING_PATHS.has(pathname) ? pathname : null;
}

function toPrefixedAttribution(prefix: string, values: Partial<Record<AttributionKey, string>>) {
  const result: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = values[key];
    if (!value) continue;
    result[`${prefix}${key}`] = value;
  }
  return result;
}

function readLastTouchAttribution(): AttributionState {
  return (
    parseJson<AttributionState>(safeSessionStorageGet(LAST_TOUCH_STORAGE_KEY)) || {
      values: {},
      updatedAt: new Date(0).toISOString(),
    }
  );
}

function saveLastTouchAttribution(state: AttributionState) {
  safeSessionStorageSet(LAST_TOUCH_STORAGE_KEY, JSON.stringify(state));
}

function readFirstTouchAttribution(nowMs = Date.now()): FirstTouchState | null {
  const parsed = parseJson<FirstTouchState>(safeLocalStorageGet(FIRST_TOUCH_STORAGE_KEY));
  if (!parsed?.expiresAt) return null;
  const expiresAtMs = new Date(parsed.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    safeLocalStorageRemove(FIRST_TOUCH_STORAGE_KEY);
    return null;
  }
  return parsed;
}

function saveFirstTouchAttribution(state: FirstTouchState) {
  safeLocalStorageSet(FIRST_TOUCH_STORAGE_KEY, JSON.stringify(state));
}

function captureAttributionFromUrlInternal(nowMs = Date.now()) {
  if (typeof window === 'undefined') {
    return {
      lastTouch: { values: {}, updatedAt: new Date(0).toISOString() } as AttributionState,
      firstTouch: null as FirstTouchState | null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const currentLastTouch = readLastTouchAttribution();
  const nextValues = { ...currentLastTouch.values };
  let hasChange = false;

  for (const key of UTM_KEYS) {
    const value = params.get(key)?.trim();
    if (!value) continue;
    if (nextValues[key] === value) continue;
    nextValues[key] = value;
    hasChange = true;
  }

  const updatedAt = hasChange ? new Date(nowMs).toISOString() : currentLastTouch.updatedAt;
  const lastTouch: AttributionState = { values: nextValues, updatedAt };
  if (hasChange) {
    saveLastTouchAttribution(lastTouch);
  }

  let firstTouch = readFirstTouchAttribution(nowMs);
  if (!firstTouch && Object.keys(nextValues).length > 0) {
    firstTouch = {
      values: nextValues,
      updatedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + FIRST_TOUCH_TTL_MS).toISOString(),
    };
    saveFirstTouchAttribution(firstTouch);
  }

  return { lastTouch, firstTouch };
}

export function captureAttributionFromUrl(): Record<string, string> {
  const { lastTouch } = captureAttributionFromUrlInternal();
  return { ...lastTouch.values } as Record<string, string>;
}

function getAttributionContext() {
  const { lastTouch, firstTouch } = captureAttributionFromUrlInternal();
  return {
    ...(lastTouch.values as Record<string, string>),
    ...toPrefixedAttribution('last_touch_', lastTouch.values),
    ...toPrefixedAttribution('first_touch_', firstTouch?.values || {}),
    first_touch_captured_at: firstTouch?.updatedAt,
    last_touch_captured_at: lastTouch.updatedAt,
  };
}

export function getAttributionSubmissionPayload(): AttributionSubmissionPayload {
  if (typeof window === 'undefined') return {};

  const { lastTouch, firstTouch } = captureAttributionFromUrlInternal();
  const hasTrackedValues = Object.keys(lastTouch.values).length > 0 || Object.keys(firstTouch?.values || {}).length > 0;
  const payload: AttributionSubmissionPayload = {
    ...(lastTouch.values as Partial<AttributionSubmissionPayload>),
    ...(toPrefixedAttribution('last_touch_', lastTouch.values) as Partial<AttributionSubmissionPayload>),
    ...(toPrefixedAttribution('first_touch_', firstTouch?.values || {}) as Partial<AttributionSubmissionPayload>),
    first_touch_captured_at: firstTouch?.updatedAt,
    last_touch_captured_at: hasTrackedValues ? lastTouch.updatedAt : undefined,
    landing_path: window.location.pathname,
    landing_url: window.location.href,
    referrer: document.referrer || undefined,
  };

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => typeof value === 'string' && value.trim().length > 0),
  ) as AttributionSubmissionPayload;
}

function readSessionId(): string {
  if (typeof window === 'undefined') return 'server_runtime';
  const existing = safeSessionStorageGet(SESSION_ID_STORAGE_KEY)?.trim();
  if (existing) return existing;
  const sessionId = createId('sess');
  safeSessionStorageSet(SESSION_ID_STORAGE_KEY, sessionId);
  return sessionId;
}

function readVisitState(nowMs = Date.now()): VisitState {
  if (typeof window === 'undefined') {
    const iso = new Date(nowMs).toISOString();
    return { id: 'visit_server_runtime', startedAt: iso, lastActivityAt: iso };
  }

  const current = parseJson<VisitState>(safeSessionStorageGet(VISIT_STATE_STORAGE_KEY));
  const nowIso = new Date(nowMs).toISOString();
  const lastActivityMs = current ? new Date(current.lastActivityAt).getTime() : Number.NaN;
  const isExpired = !current || !Number.isFinite(lastActivityMs) || nowMs - lastActivityMs > VISIT_TIMEOUT_MS;

  const nextState: VisitState = isExpired
    ? {
        id: createId('visit'),
        startedAt: nowIso,
        lastActivityAt: nowIso,
      }
    : {
        ...current,
        lastActivityAt: nowIso,
      };

  safeSessionStorageSet(VISIT_STATE_STORAGE_KEY, JSON.stringify(nextState));
  return nextState;
}

export function derivePageType(pathname: string): PageType {
  if (pathname === '/') return 'home';
  if (pathname === '/fiyatlar') return 'pricing';
  if (pathname === '/iletisim') return 'contact';
  if (pathname === '/seviye-tespit-sinavi') return 'placement_exam';
  if (pathname === '/speakup') return 'speakup';
  if (pathname.startsWith('/egitimlerimiz')) return 'program';
  if (SEO_LANDING_PATHS.has(pathname)) return 'seo_landing';
  return 'other';
}

function deriveLanguageInterest(pathname: string, searchParams: URLSearchParams): string | undefined {
  const urlLanguage = searchParams.get('lang') || searchParams.get('language');
  if (urlLanguage) return urlLanguage.trim().toLowerCase();

  const programMatch = pathname.match(/^\/egitimlerimiz\/([^/]+)\/[^/]+$/);
  if (programMatch?.[1]) return programMatch[1].trim().toLowerCase();

  if (pathname.includes('ingilizce') || pathname.includes('speaking-club')) return 'ingilizce';
  if (pathname.includes('almanca')) return 'almanca';
  if (pathname.includes('ispanyolca')) return 'ispanyolca';
  if (pathname.includes('fransizca')) return 'fransizca';
  if (pathname.includes('italyanca')) return 'italyanca';
  if (pathname.includes('rusca')) return 'rusca';
  if (pathname.includes('arapca')) return 'arapca';

  return undefined;
}

function deriveProgramInterest(pathname: string, searchParams: URLSearchParams): string | undefined {
  const urlProgram = searchParams.get('program');
  if (urlProgram) return urlProgram.trim().toLowerCase();

  const programMatch = pathname.match(/^\/egitimlerimiz\/[^/]+\/([^/]+)$/);
  if (programMatch?.[1]) return programMatch[1].trim().toLowerCase();

  if (pathname.includes('speaking-club')) return 'speaking_club';
  if (pathname.includes('seviye-tespit')) return 'placement_exam';
  if (pathname.includes('online-dil-kursu')) return 'online_program';

  return undefined;
}

function deriveGeoIntent(pathname: string, attributionValues: Partial<Record<AttributionKey, string>>): string {
  if (pathname.includes('/konya')) return 'konya';
  if (pathname.includes('/turkiye')) return 'turkiye';

  const campaign = attributionValues.utm_campaign?.toLowerCase() || '';
  const source = attributionValues.utm_source?.toLowerCase() || '';
  if (campaign.includes('konya') || source.includes('konya')) return 'konya';
  if (campaign.includes('turkiye') || source.includes('turkiye')) return 'turkiye';

  return 'global';
}

export function getLeadSegment(score: number): LeadSegment {
  if (score >= 60) return 'hot';
  if (score >= 30) return 'warm';
  return 'cold';
}

function readLeadScoreState(): LeadScoreState {
  const parsed = parseJson<LeadScoreState>(safeSessionStorageGet(LEAD_SCORE_STORAGE_KEY));
  if (!parsed || typeof parsed.score !== 'number') {
    return {
      score: 0,
      segment: 'cold',
      updated_at: new Date(0).toISOString(),
    };
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(parsed.score)));
  return {
    score: boundedScore,
    segment: getLeadSegment(boundedScore),
    updated_at: parsed.updated_at || new Date(0).toISOString(),
  };
}

function saveLeadScoreState(state: LeadScoreState) {
  safeSessionStorageSet(LEAD_SCORE_STORAGE_KEY, JSON.stringify(state));
}

function applyLeadScore(eventName: EventName): LeadScoreState {
  const current = readLeadScoreState();
  const points = EVENT_LEAD_POINTS[eventName];
  if (!points) return current;

  const nextScore = Math.min(100, current.score + points);
  const nextState: LeadScoreState = {
    score: nextScore,
    segment: getLeadSegment(nextScore),
    updated_at: new Date().toISOString(),
  };
  saveLeadScoreState(nextState);
  return nextState;
}

export function getLeadScoreState() {
  return readLeadScoreState();
}

function getLinkText(element: Element) {
  const text = element.textContent?.replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, 120);
  return (element.getAttribute('aria-label') || 'link').slice(0, 120);
}

function slugify(value: string, fallback = 'cta') {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[\s/]+/g, '_')
    .replace(/[^\w.-]/g, '')
    .replace(/_+/g, '_')
    .slice(0, 80);
  return normalized || fallback;
}

function getCtaIdentifier(element: Element, destination?: string) {
  const explicit = element.getAttribute('data-cta-id') || element.getAttribute('data-analytics-id');
  if (explicit) return slugify(explicit, 'cta');
  const text = getLinkText(element);
  if (text && text !== 'link') return slugify(text, 'cta_text');
  if (destination) return slugify(destination, 'cta_destination');
  return `cta_${element.tagName.toLowerCase()}`;
}

function resolveCtaLocation(element: Element) {
  const explicit = element.getAttribute('data-cta-location');
  if (explicit) return explicit.trim().slice(0, 80);
  const section = element.closest('[id]');
  if (section?.id) return section.id.slice(0, 80);
  return 'unknown';
}

function getAttributionValues() {
  return readLastTouchAttribution().values;
}

function getDefaultContext(eventName: EventName) {
  const visitState = readVisitState();
  const sessionId = readSessionId();
  const attribution = getAttributionContext();
  const searchParams = typeof window === 'undefined' ? new URLSearchParams('') : new URLSearchParams(window.location.search);
  const leadScore = applyLeadScore(eventName);

  return {
    page_path: window.location.pathname,
    page_location: window.location.href,
    page_title: document.title,
    page_type: derivePageType(window.location.pathname),
    language_interest: deriveLanguageInterest(window.location.pathname, searchParams),
    program_interest: deriveProgramInterest(window.location.pathname, searchParams),
    geo_intent: deriveGeoIntent(window.location.pathname, getAttributionValues()),
    session_id: sessionId,
    visit_id: visitState.id,
    event_id: createId('evt'),
    event_timestamp: new Date().toISOString(),
    lead_score: leadScore.score,
    lead_segment: leadScore.segment,
    ...attribution,
    ...readFunnelContext(),
  };
}

export function getConsentPreferences(): CookiePreferences {
  if (typeof window === 'undefined') return fallbackPreferences;
  return parseConsent(safeLocalStorageGet(COOKIE_CONSENT_KEY));
}

export function applyConsentMode(preferences: CookiePreferences = getConsentPreferences()) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('consent', 'update', {
    ad_storage: toConsentState(preferences.marketing),
    ad_user_data: toConsentState(preferences.marketing),
    ad_personalization: toConsentState(preferences.personalization),
    analytics_storage: toConsentState(preferences.analytics),
    personalization_storage: toConsentState(preferences.personalization),
    functionality_storage: 'granted',
    security_storage: 'granted',
  });
}

export function notifyConsentUpdated(preferences: CookiePreferences) {
  if (typeof window === 'undefined') return;
  applyConsentMode(preferences);
  window.dispatchEvent(new CustomEvent(CONSENT_UPDATED_EVENT, { detail: preferences }));
}

export function setFunnelContext(patch: Partial<FunnelContext>) {
  if (typeof window === 'undefined') return;
  const current = readFunnelContext();
  const next: FunnelContext = {
    ...current,
    ...patch,
    funnel_updated_at: new Date().toISOString(),
  };
  saveFunnelContext(next);
}

export function trackSeoLandingCta({ ctaId, destination, position = 'unknown' }: SeoLandingCtaOptions) {
  if (typeof window === 'undefined') return false;
  const landingPath = resolveSeoLandingPath(window.location.pathname);

  if (landingPath) {
    setFunnelContext({
      funnel_name: SEO_FUNNEL_NAME,
      funnel_landing_path: landingPath,
      funnel_last_cta_id: ctaId,
      funnel_last_destination: destination,
    });
  }

  return trackEvent('seo_landing_cta_click', {
    funnel_name: SEO_FUNNEL_NAME,
    funnel_step: 'cta_click',
    landing_path: landingPath || window.location.pathname,
    cta_id: ctaId,
    cta_destination: destination,
    cta_position: position,
  });
}

export function trackEvent<K extends EventName>(
  eventName: K,
  params: EventPayloadMap[K] = {} as EventPayloadMap[K],
  options: TrackEventOptions = {},
) {
  if (typeof window === 'undefined') return false;

  const requires = options.requires ?? 'analytics';
  if (!hasConsent(requires)) return false;

  const context = getDefaultContext(eventName);
  const normalizedParams: Record<string, EventValue> = {};
  for (const [key, value] of Object.entries(params || {})) {
    normalizedParams[key] = normalizeValue(value as EventValue);
  }

  const payload = {
    ...context,
    ...normalizedParams,
  };

  ensureDataLayer().push({
    event: eventName,
    ...payload,
  });

  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, payload);
  }

  return true;
}

function scheduleEngagedTimer() {
  if (typeof window === 'undefined') return;

  const currentPath = window.location.pathname;
  const visitId = readVisitState().id;
  const timerKey = `${visitId}:${currentPath}`;

  if (engagedTimerId) {
    window.clearTimeout(engagedTimerId);
    engagedTimerId = null;
  }
  engagedTimerKey = timerKey;

  if (engagedTrackedKeys.has(timerKey)) return;

  engagedTimerId = window.setTimeout(() => {
    if (engagedTimerKey !== timerKey) return;
    const tracked = trackEvent('engaged_30s', { engagement_seconds: 30 });
    if (tracked) {
      engagedTrackedKeys.add(timerKey);
    }
  }, ENGAGED_TIME_MS);
}

export function trackPageView() {
  if (typeof window === 'undefined') return false;
  const landingPath = resolveSeoLandingPath(window.location.pathname);
  const pageType = derivePageType(window.location.pathname);

  if (landingPath) {
    setFunnelContext({
      funnel_name: SEO_FUNNEL_NAME,
      funnel_landing_path: landingPath,
    });
    trackEvent('seo_landing_view', {
      funnel_name: SEO_FUNNEL_NAME,
      funnel_step: 'landing_view',
      landing_path: landingPath,
    });
  }

  const pageViewTracked = trackEvent('page_view', {});
  if (pageType === 'pricing') {
    trackEvent('pricing_view', { source: 'route_view' });
  }
  if (pageType === 'contact') {
    trackEvent('contact_view', { source: 'route_view' });
  }

  scheduleEngagedTimer();
  return pageViewTracked;
}

function resolveFormId(form: HTMLFormElement) {
  const explicit = form.getAttribute('data-form-id') || form.getAttribute('data-analytics-id');
  if (explicit) return slugify(explicit, 'form');
  if (form.id) return slugify(form.id, 'form');
  if (form.name) return slugify(form.name, 'form');
  return `form_${Math.max(1, Array.from(document.forms).indexOf(form) + 1)}`;
}

function resolveFormFieldName(field: HTMLElement) {
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
    if (field.name) return slugify(field.name, 'field');
    if (field.id) return slugify(field.id, 'field');
    if (field.getAttribute('aria-label')) return slugify(field.getAttribute('aria-label') || '', 'field');
  }
  return 'field';
}

function resolveElementDestination(element: Element) {
  if (element instanceof HTMLAnchorElement) {
    return element.getAttribute('href')?.trim() || '';
  }
  return element.getAttribute('data-cta-destination')?.trim() || '';
}

function trackClickCta(element: Element) {
  const destination = resolveElementDestination(element);
  const ctaTag = element.tagName.toLowerCase();
  const ctaType = element instanceof HTMLAnchorElement ? 'link' : 'button';

  trackEvent('cta_click', {
    cta_id: getCtaIdentifier(element, destination),
    cta_destination: destination || window.location.pathname,
    cta_text: getLinkText(element),
    cta_location: resolveCtaLocation(element),
    cta_tag: ctaTag,
    cta_variant: element.getAttribute('data-cta-variant') || undefined,
    cta_type: ctaType,
    source: element.getAttribute('data-source') || undefined,
  });
}

export function initTracking() {
  if (typeof window === 'undefined' || window.__teacheraTrackingInitialized) {
    return () => {};
  }

  window.__teacheraTrackingInitialized = true;
  captureAttributionFromUrl();
  applyConsentMode();
  readSessionId();
  readVisitState();

  const scrollDepthByPath = new Map<string, { d50: boolean; d90: boolean }>();
  const formProgress = new Map<HTMLFormElement, FormProgressState>();

  const markFormAbandonments = (reason: string) => {
    for (const [form, state] of formProgress.entries()) {
      if (!state.started || state.submitted || state.completedFields.size === 0) continue;
      state.submitted = true;
      trackEvent('form_abandon', {
        form_id: resolveFormId(form),
        completed_steps: state.completedFields.size,
        abandon_reason: reason,
        elapsed_seconds: Math.max(1, Math.round((Date.now() - state.startedAt) / 1000)),
      });
    }
  };

  const onConsentUpdated = () => {
    applyConsentMode();
  };

  const onDocumentClick = (event: MouseEvent) => {
    const target = event.target as Element | null;
    const clickable = target?.closest('a,button');
    if (!clickable) return;

    const href = clickable instanceof HTMLAnchorElement ? clickable.getAttribute('href')?.trim() || '' : '';

    if (href.startsWith('tel:')) {
      trackEvent('phone_click', {
        phone_number: href.replace(/^tel:/, ''),
        link_text: getLinkText(clickable),
      });
    } else if (href.startsWith('mailto:')) {
      trackEvent('mailto_click', {
        email: href.replace(/^mailto:/, ''),
        link_text: getLinkText(clickable),
      });
    } else if (/wa\.me|whatsapp\.com/i.test(href)) {
      trackEvent('whatsapp_click', {
        source: 'anchor',
        href,
        link_text: getLinkText(clickable),
      });
    }

    trackClickCta(clickable);
  };

  const onDocumentScroll = () => {
    const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollableHeight <= 0) return;

    const ratio = Math.max(0, Math.min(1, window.scrollY / scrollableHeight));
    const depth = Math.round(ratio * 100);
    const currentPath = window.location.pathname;

    const currentState = scrollDepthByPath.get(currentPath) || { d50: false, d90: false };

    if (!currentState.d50 && depth >= 50) {
      currentState.d50 = true;
      trackEvent('scroll_depth_50', { scroll_depth: 50 });
    }
    if (!currentState.d90 && depth >= 90) {
      currentState.d90 = true;
      trackEvent('scroll_depth_90', { scroll_depth: 90 });
    }

    scrollDepthByPath.set(currentPath, currentState);
  };

  const onFormFocusIn = (event: FocusEvent) => {
    const target = event.target as HTMLElement | null;
    const field = target?.closest('input,select,textarea');
    const form = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement
      ? field.form
      : null;
    if (!form) return;

    const state =
      formProgress.get(form) || {
        started: false,
        submitted: false,
        startedAt: Date.now(),
        completedFields: new Set<string>(),
      };

    if (!state.started) {
      state.started = true;
      state.startedAt = Date.now();
      trackEvent('form_start', {
        form_id: resolveFormId(form),
        form_name: form.getAttribute('name') || form.getAttribute('aria-label') || undefined,
        form_method: (form.getAttribute('method') || 'client').toLowerCase(),
        form_action: form.getAttribute('action') || window.location.pathname,
      });
    }

    formProgress.set(form, state);
  };

  const onFormFieldChange = (event: Event) => {
    const target = event.target as HTMLElement | null;
    const field = target?.closest('input,select,textarea');
    const control = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement
      ? field
      : null;
    const form = control?.form;
    if (!form || !control) return;

    const value = control.value?.trim();
    if (!value) return;

    const state =
      formProgress.get(form) || {
        started: true,
        submitted: false,
        startedAt: Date.now(),
        completedFields: new Set<string>(),
      };

    const fieldName = resolveFormFieldName(control);
    if (state.completedFields.has(fieldName)) return;

    state.completedFields.add(fieldName);
    formProgress.set(form, state);

    trackEvent('form_step', {
      form_id: resolveFormId(form),
      form_step_index: state.completedFields.size,
      form_field: fieldName,
    });
  };

  const onFormSubmit = (event: SubmitEvent) => {
    const form = event.target as HTMLFormElement | null;
    if (!form) return;
    const state =
      formProgress.get(form) || {
        started: true,
        submitted: false,
        startedAt: Date.now(),
        completedFields: new Set<string>(),
      };
    state.submitted = true;
    formProgress.set(form, state);
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      markFormAbandonments('visibility_hidden');
    }
  };

  const onPageExit = () => {
    markFormAbandonments('page_exit');
  };

  window.addEventListener(CONSENT_UPDATED_EVENT, onConsentUpdated as EventListener);
  document.addEventListener('click', onDocumentClick, true);
  document.addEventListener('scroll', onDocumentScroll, { passive: true, capture: true });
  document.addEventListener('focusin', onFormFocusIn, true);
  document.addEventListener('change', onFormFieldChange, true);
  document.addEventListener('submit', onFormSubmit, true);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageExit);
  window.addEventListener('beforeunload', onPageExit);

  return () => {
    if (engagedTimerId) {
      window.clearTimeout(engagedTimerId);
      engagedTimerId = null;
      engagedTimerKey = '';
    }
    markFormAbandonments('tracking_cleanup');
    document.removeEventListener('click', onDocumentClick, true);
    document.removeEventListener('scroll', onDocumentScroll, true);
    document.removeEventListener('focusin', onFormFocusIn, true);
    document.removeEventListener('change', onFormFieldChange, true);
    document.removeEventListener('submit', onFormSubmit, true);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageExit);
    window.removeEventListener('beforeunload', onPageExit);
    window.removeEventListener(CONSENT_UPDATED_EVENT, onConsentUpdated as EventListener);
    window.__teacheraTrackingInitialized = false;
  };
}
