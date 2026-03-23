// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import {
  assertNotBruteForceLocked,
  clearBruteForceState,
  registerBruteForceFailure,
} from './_lib/abuseProtection.js';
import { query } from './_lib/db.js';
import { HttpError, isHttpError } from './_lib/errors.js';
import { applyCorsPolicy, enforceServiceBoundary } from './_lib/http.js';
import { enforceRateLimit, getRequestIp } from './_lib/redisRateLimit.js';

const DEFAULT_UPSTREAM_TEMPLATE = 'https://formsubmit.co/ajax/{to}';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const LEAD_FORM_TYPE_BY_SUBJECT = {
  'Teachera Geri Arama Talebi': 'CALLBACK',
  'Ucretsiz Deneme Seansi Talebi': 'FREE_TRIAL',
  'Seviye Tespit Talebi': 'LEVEL_ASSESSMENT',
  'Egitim Formati Danismanlik Talebi': 'FORMAT_CONSULTATION',
  'Kurumsal Egitim Teklif Talebi': 'CORPORATE_OFFER',
};

function sendJson(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseAllowedOrigins() {
  const raw = process.env.FORMS_ALLOWED_ORIGINS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveUpstreamEndpoint(to) {
  const template = safeTrim(process.env.FORMS_UPSTREAM_TEMPLATE || process.env.FORMS_UPSTREAM) || DEFAULT_UPSTREAM_TEMPLATE;

  if (template.includes('{{to}}')) {
    return template.replaceAll('{{to}}', encodeURIComponent(to));
  }
  if (template.includes('{to}')) {
    return template.replaceAll('{to}', encodeURIComponent(to));
  }
  if (template.includes(':to')) {
    return template.replaceAll(':to', encodeURIComponent(to));
  }

  return template;
}

function sanitizeFields(rawFields) {
  if (!rawFields || typeof rawFields !== 'object' || Array.isArray(rawFields)) return {};
  const entries = Object.entries(rawFields);
  const sanitized = {};

  for (const [key, value] of entries) {
    const normalizedKey = safeTrim(key).slice(0, 80);
    if (!normalizedKey) continue;
    const normalizedValue = typeof value === 'string' ? value.trim().slice(0, 1200) : String(value ?? '').slice(0, 1200);
    sanitized[normalizedKey] = normalizedValue;
  }

  return sanitized;
}

function getLeadFormType(subject) {
  return LEAD_FORM_TYPE_BY_SUBJECT[safeTrim(subject)] || '';
}

function normalizeLookupKey(value) {
  return safeTrim(value)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]/g, '');
}

function buildFieldEntries(fields) {
  return Object.entries(fields)
    .map(([label, value]) => ({
      label: safeTrim(label).slice(0, 120),
      value: safeTrim(value).slice(0, 1200),
    }))
    .filter((item) => item.label);
}

function findFieldValue(fields, candidates) {
  const candidateSet = new Set(candidates.map((item) => normalizeLookupKey(item)));

  for (const [key, value] of Object.entries(fields)) {
    if (!candidateSet.has(normalizeLookupKey(key))) continue;
    const normalizedValue = safeTrim(value);
    if (normalizedValue && normalizedValue !== '-') {
      return normalizedValue;
    }
  }

  return '';
}

function findFieldValueByPattern(fields, pattern) {
  for (const value of Object.values(fields)) {
    const normalizedValue = safeTrim(value);
    if (normalizedValue && pattern.test(normalizedValue)) {
      return normalizedValue;
    }
  }
  return '';
}

function extractLeadFullName(fields) {
  return findFieldValue(fields, ['Ad Soyad', 'Ad Soyadiniz', 'Yetkili Ad Soyad', 'Adı Soyadı', 'Ad Soyadınız']);
}

function extractLeadPhone(fields) {
  return (
    findFieldValue(fields, ['Telefon', 'Cep Telefonu', 'Telefon Numarasi', 'Telefon Numarası', 'GSM']) ||
    findFieldValueByPattern(fields, /(?:\+?\d[\d\s()-]{8,})/)
  );
}

function extractLeadEmail(fields) {
  return (
    findFieldValue(fields, ['E-posta', 'Eposta', 'Email', 'Mail']) ||
    findFieldValueByPattern(fields, /^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  );
}

async function persistLeadSubmission({ subject, formSource, fields }) {
  const formType = getLeadFormType(subject);
  if (!formType) {
    return { leadInbox: 'not_applicable' };
  }

  const fullName = extractLeadFullName(fields);
  const phone = extractLeadPhone(fields);
  const email = extractLeadEmail(fields);
  const fieldEntries = buildFieldEntries(fields);

  await query(
    `
      INSERT INTO lead_form_submissions (
        form_type,
        form_subject,
        full_name,
        phone,
        email,
        fields,
        field_entries,
        form_source
      )
      VALUES (
        $1,
        $2,
        NULLIF($3, ''),
        NULLIF($4, ''),
        NULLIF($5, ''),
        $6::jsonb,
        $7::jsonb,
        NULLIF($8, '')
      )
    `,
    [
      formType,
      subject,
      fullName,
      phone,
      email,
      JSON.stringify(fields),
      JSON.stringify(fieldEntries),
      formSource,
    ],
  );

  return { leadInbox: 'stored', formType };
}

function readCaptchaToken(body, req) {
  const candidates = [
    body?.captchaToken,
    body?.turnstileToken,
    body?.captcha_token,
    body?.turnstile_token,
    body?.['cf-turnstile-response'],
    req?.headers?.['cf-turnstile-response'],
  ];

  for (const value of candidates) {
    const token = safeTrim(value);
    if (!token) continue;
    const lowered = token.toLowerCase();
    if (lowered === 'undefined' || lowered === 'null') continue;
    return token;
  }

  return '';
}

function readBoundedInt(raw, fallback, min, max) {
  const parsed = Number.parseInt(safeTrim(raw || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function readBruteConfig(name, fallback) {
  return readBoundedInt(process.env[name], fallback, 1, 24 * 60 * 60);
}

function resolveContactIdentity(fields, to, fallbackIp) {
  const candidates = [
    fields.parent_phone_e164,
    fields.phone,
    fields.telefon,
    fields.mobile,
    fields.email,
    to,
    fallbackIp,
  ];

  return candidates.map((value) => safeTrim(value)).find(Boolean) || fallbackIp || 'unknown';
}

function normalizeAbsoluteUrl(value) {
  const raw = safeTrim(value);
  if (!raw) return null;

  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function resolveUpstreamHeaders(req, formSource) {
  const siteUrl = normalizeAbsoluteUrl(process.env.VITE_SITE_URL || 'https://teachera.com.tr');
  const sourceUrl = normalizeAbsoluteUrl(formSource);
  const requestOrigin = safeTrim(req.headers?.origin);
  const requestReferer = safeTrim(req.headers?.referer);
  const fallbackOrigin = siteUrl?.origin || '';
  const origin = requestOrigin || sourceUrl?.origin || fallbackOrigin;
  const referer = requestReferer || sourceUrl?.toString() || (origin ? `${origin}/` : '');
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
    'User-Agent': 'Mozilla/5.0 (compatible; TeacheraFormsProxy/1.0; +https://teachera.com.tr)',
  };

  if (origin) {
    headers.Origin = origin;
  }
  if (referer) {
    headers.Referer = referer;
  }

  return headers;
}

async function verifyTurnstileToken(token, remoteIp) {
  const secret = safeTrim(process.env.TURNSTILE_SECRET_KEY);
  if (!secret) {
    throw new HttpError(
      503,
      'Turnstile server validation is not configured.',
      'turnstile_not_configured',
    );
  }

  const responseToken = safeTrim(token);
  if (!responseToken) return { enabled: true, ok: false, reason: 'missing_token' };

  const body = new URLSearchParams({
    secret,
    response: responseToken,
  });

  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      return { enabled: true, ok: false, reason: `turnstile_status_${response.status}` };
    }

    const data = await response.json();
    if (!data || data.success !== true) {
      const firstCode = Array.isArray(data?.['error-codes']) ? data['error-codes'][0] : 'validation_failed';
      return { enabled: true, ok: false, reason: String(firstCode) };
    }

    return { enabled: true, ok: true };
  } catch {
    return { enabled: true, ok: false, reason: 'turnstile_network_error' };
  }
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

export default async function handler(req, res) {
  try {
    enforceServiceBoundary(req);
    const cors = applyCorsPolicy(req, res, {
      allowOrigins: parseAllowedOrigins(),
      allowCredentials: false,
    });
    if (cors.preflight) {
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      return;
    }

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, { ok: false, error: 'invalid_json' });
      return;
    }

    const requestIp = getRequestIp(req);
    const to = safeTrim(body.to || 'data@teachera.com.tr').slice(0, 200);
    const subject = safeTrim(body.subject).slice(0, 200);
    const formSource = safeTrim(body.formSource).slice(0, 500);
    const fields = sanitizeFields(body.fields);
    const captchaToken = readCaptchaToken(body, req);
    const contactIdentity = resolveContactIdentity(fields, to, requestIp);

    await assertNotBruteForceLocked({
      scope: 'forms_submit_ip',
      identity: requestIp,
      errorCode: 'forms_submit_ip_locked',
      errorMessage: 'Too many failed form submissions from this IP. Please retry later.',
    });
    await assertNotBruteForceLocked({
      scope: 'forms_submit_contact',
      identity: contactIdentity,
      errorCode: 'forms_submit_contact_locked',
      errorMessage: 'Too many failed form submissions for this contact. Please retry later.',
    });

    await enforceRateLimit(req, res, {
      scope: 'forms_submit_ip',
      identity: requestIp,
      limitEnv: 'RL_FORMS_IP_LIMIT',
      windowSecondsEnv: 'RL_FORMS_IP_WINDOW_SECONDS',
      defaultLimit: 20,
      defaultWindowSeconds: 60,
      requireRedis: true,
      errorCode: 'forms_submit_ip_rate_limited',
      errorMessage: 'Too many form requests from this IP. Please retry shortly.',
    });

    await enforceRateLimit(req, res, {
      scope: 'forms_submit_contact',
      identity: contactIdentity,
      limitEnv: 'RL_FORMS_CONTACT_LIMIT',
      windowSecondsEnv: 'RL_FORMS_CONTACT_WINDOW_SECONDS',
      defaultLimit: 10,
      defaultWindowSeconds: 10 * 60,
      requireRedis: true,
      errorCode: 'forms_submit_contact_rate_limited',
      errorMessage: 'Too many form requests for this contact. Please retry later.',
    });

    if (!subject) {
      sendJson(res, 400, { ok: false, error: 'missing_subject' });
      return;
    }

    const turnstile = await verifyTurnstileToken(captchaToken, requestIp);
    if (!turnstile.ok) {
      await registerBruteForceFailure({
        scope: 'forms_submit_ip',
        identity: requestIp,
        threshold: readBruteConfig('BRUTE_FORMS_IP_THRESHOLD', 10),
        failWindowSeconds: readBruteConfig('BRUTE_FORMS_IP_WINDOW_SECONDS', 10 * 60),
        lockSeconds: readBruteConfig('BRUTE_FORMS_IP_LOCK_SECONDS', 15 * 60),
      });
      await registerBruteForceFailure({
        scope: 'forms_submit_contact',
        identity: contactIdentity,
        threshold: readBruteConfig('BRUTE_FORMS_CONTACT_THRESHOLD', 6),
        failWindowSeconds: readBruteConfig('BRUTE_FORMS_CONTACT_WINDOW_SECONDS', 15 * 60),
        lockSeconds: readBruteConfig('BRUTE_FORMS_CONTACT_LOCK_SECONDS', 30 * 60),
      });

      sendJson(res, 403, { ok: false, error: 'captcha_failed', reason: turnstile.reason || 'unknown' });
      return;
    }

    // Defensive fail-closed guard: never forward form payload upstream without a validated captcha token.
    if (!captchaToken) {
      sendJson(res, 403, { ok: false, error: 'captcha_failed', reason: 'missing_token' });
      return;
    }

    let leadInbox = 'not_applicable';
    try {
      const persistResult = await persistLeadSubmission({
        subject,
        formSource,
        fields,
      });
      leadInbox = persistResult.leadInbox;
    } catch (persistError) {
      leadInbox = 'store_failed';
      console.error('[forms_lead_inbox_persist_failed]', {
        subject,
        formSource,
        error: persistError instanceof Error ? persistError.message : String(persistError),
      });
    }

    const upstreamEndpoint = resolveUpstreamEndpoint(to);
    const upstreamPayload = {
      _subject: subject,
      _captcha: 'false',
      _template: 'table',
      form_source: formSource || 'server_proxy',
      ...fields,
    };

    const upstreamResponse = await fetch(upstreamEndpoint, {
      method: 'POST',
      headers: resolveUpstreamHeaders(req, formSource),
      body: JSON.stringify(upstreamPayload),
    });

    if (!upstreamResponse.ok) {
      sendJson(res, 502, { ok: false, error: 'upstream_failed', status: upstreamResponse.status, lead_inbox: leadInbox });
      return;
    }

    await clearBruteForceState({
      scope: 'forms_submit_ip',
      identity: requestIp,
    });
    await clearBruteForceState({
      scope: 'forms_submit_contact',
      identity: contactIdentity,
    });

    sendJson(res, 200, { ok: true, captcha: 'verified', lead_inbox: leadInbox });
  } catch (error) {
    if (isHttpError(error)) {
      sendJson(res, error.status, {
        ok: false,
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }
    sendJson(res, 502, { ok: false, error: 'upstream_network_error' });
  }
}
