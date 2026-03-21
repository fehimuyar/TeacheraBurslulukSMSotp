import { randomInt } from 'node:crypto';
import { query, withTransaction } from '../../_lib/db.js';
import { readDefaultCampaignCode } from '../../_lib/env.js';
import { HttpError } from '../../_lib/errors.js';
import {
  buildSessionExpiry,
  createSessionToken,
  hashSessionToken,
  normalizeEmail,
  normalizeGrade,
  normalizePhoneE164,
  optionalString,
  requireString,
} from '../../_lib/exam.js';
import { handleRequest, methodGuard, ok, parseBody } from '../../_lib/http.js';
import { isAuthorizedLoadTestMode } from '../../_lib/loadTestMode.js';
import { enqueueNotification } from '../../_lib/notifications.js';
import { computePiiLookupHash, encryptPii } from '../../_lib/piiCrypto.js';
import { isRedisUnavailableError } from '../../_lib/redis.js';
import { writeExamSessionCache } from '../../_lib/redisExamSession.js';
import { enforceRateLimit, getRequestIp } from '../../_lib/redisRateLimit.js';

const REDACTED_NAME = '[ENCRYPTED_PII]';
const ensuredCampaignCodes = new Set();
const cachedSchoolIds = new Map();
const DEFAULT_KVKK_CONSENT_VERSION = optionalString(process.env.KVKK_CONSENT_VERSION, 120) || 'KVKK_v1_2026-03-13';
const DEFAULT_KVKK_LEGAL_TEXT_VERSION = optionalString(process.env.KVKK_LEGAL_TEXT_VERSION, 120) || DEFAULT_KVKK_CONSENT_VERSION;
const DEFAULT_EXAM_LOGIN_URL = 'https://teachera.com.tr/bursluluk/giris';
const CREDENTIAL_PASSWORD_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EXAM_SLOT_CATALOG = [
  {
    key: '2026-03-28T07:00:00.000Z',
    day: '2026-03-28',
    label: '28 Mart 2026 10:00-11:00',
    gradeMin: 1,
    gradeMax: 4,
  },
  {
    key: '2026-03-28T10:00:00.000Z',
    day: '2026-03-28',
    label: '28 Mart 2026 13:00-14:00',
    gradeMin: 5,
    gradeMax: 8,
  },
  {
    key: '2026-03-29T10:00:00.000Z',
    day: '2026-03-29',
    label: '29 Mart 2026 13:00-14:00',
    gradeMin: 9,
    gradeMax: 12,
  },
];

function buildRedactedPhoneToken(phoneHash) {
  return `pii:${String(phoneHash || '').slice(0, 28)}`;
}

function buildLoadTestGuardianPhoneToken(phoneE164) {
  const compact = String(phoneE164 || '').replace(/\D+/g, '');
  return `lt:${compact.slice(-14)}`;
}

function parseBoolean(value, fallback = null) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return fallback;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

const ATTRIBUTION_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  'first_touch_utm_source',
  'first_touch_utm_medium',
  'first_touch_utm_campaign',
  'last_touch_utm_source',
  'last_touch_utm_medium',
  'last_touch_utm_campaign',
  'first_touch_captured_at',
  'last_touch_captured_at',
  'landing_path',
  'landing_url',
  'referrer',
];

function normalizeAttributionValue(value, maxLength = 500) {
  if (typeof value === 'string') {
    return value.trim().slice(0, maxLength);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim().slice(0, maxLength);
  }
  return '';
}

function resolveAttributionPayload(body) {
  const nested = body?.attribution && typeof body.attribution === 'object' && !Array.isArray(body.attribution)
    ? body.attribution
    : {};
  const payload = {};

  for (const key of ATTRIBUTION_KEYS) {
    const raw = Object.prototype.hasOwnProperty.call(nested, key) ? nested[key] : body?.[key];
    const value = normalizeAttributionValue(raw, key === 'landing_url' || key === 'referrer' ? 500 : 240);
    if (value) payload[key] = value;
  }

  return Object.keys(payload).length > 0 ? payload : null;
}

function normalizeIdentityNo(value) {
  const digits = String(value ?? '').replace(/\D+/g, '');
  if (!digits) {
    throw new HttpError(400, 'identityNo is required.', 'missing_identity_no');
  }
  if (!/^\d{11}$/.test(digits)) {
    throw new HttpError(400, 'identityNo must be 11 digits.', 'invalid_identity_no');
  }
  return digits;
}

function normalizeBirthYear(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, 'birthYear is required.', 'missing_birth_year');
  }
  if (parsed < 1900 || parsed > currentYear) {
    throw new HttpError(400, 'birthYear is out of range.', 'invalid_birth_year');
  }
  return parsed;
}

function normalizeSection(value) {
  const normalized = optionalString(value, 60);
  if (!normalized) {
    throw new HttpError(400, 'section is required.', 'missing_section');
  }
  return normalized;
}

function readExamSlotsByGrade(grade) {
  return EXAM_SLOT_CATALOG.filter((slot) => grade >= slot.gradeMin && grade <= slot.gradeMax);
}

function resolveDefaultExamSlot(grade) {
  const slots = readExamSlotsByGrade(grade);
  return slots[0] || null;
}

function normalizeSelectedExamSlot(value, grade) {
  const raw = optionalString(value, 120);
  if (!raw) {
    throw new HttpError(400, 'selectedExamAt is required.', 'missing_selected_exam_at');
  }
  const selectedMs = Number(new Date(raw));
  if (!Number.isFinite(selectedMs)) {
    throw new HttpError(400, 'selectedExamAt must be a valid datetime.', 'invalid_selected_exam_at');
  }
  const normalizedIso = new Date(selectedMs).toISOString();
  const slots = readExamSlotsByGrade(grade);
  if (slots.length === 0) {
    throw new HttpError(400, 'No exam slots are configured for this grade.', 'missing_grade_exam_slot');
  }
  const matched = slots.find((slot) => slot.key === normalizedIso);
  if (!matched) {
    throw new HttpError(
      400,
      'Selected exam slot does not match the selected grade schedule.',
      'grade_exam_slot_mismatch',
      {
        grade,
        selected_exam_at: normalizedIso,
      },
    );
  }
  return {
    scheduledExamAt: matched.key,
    examSlotLabel: matched.label,
  };
}

function createCandidatePassword(length = 8) {
  let value = '';
  for (let i = 0; i < length; i += 1) {
    value += CREDENTIAL_PASSWORD_CHARSET[randomInt(0, CREDENTIAL_PASSWORD_CHARSET.length)];
  }
  return value;
}

async function hashCredentialPassword(client, plainPassword) {
  const hashed = await client.query(
    `
      SELECT crypt($1, gen_salt('bf', 8)) AS password_hash
    `,
    [plainPassword],
  );
  return hashed.rows[0]?.password_hash || null;
}

async function ensureApplicationCredential(
  client,
  {
    applicationId,
    credentialsSmsStatus,
    currentPasswordHash,
  },
) {
  const smsStatus = String(credentialsSmsStatus || 'NOT_QUEUED').toUpperCase();
  const shouldRotatePassword = !currentPasswordHash || smsStatus === 'NOT_QUEUED';
  if (!shouldRotatePassword) {
    const state = await client.query(
      `
        SELECT candidate_code
        FROM applications
        WHERE id = $1
        LIMIT 1
      `,
      [applicationId],
    );
    return {
      candidateCode: state.rows[0]?.candidate_code || null,
      credentialPasswordForSms: null,
    };
  }

  const credentialPasswordForSms = createCandidatePassword(8);
  const passwordHash = await hashCredentialPassword(client, credentialPasswordForSms);
  const updated = await client.query(
    `
      UPDATE applications
      SET
        credential_password_hash = $2,
        credential_password_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING candidate_code
    `,
    [applicationId, passwordHash],
  );

  return {
    candidateCode: updated.rows[0]?.candidate_code || null,
    credentialPasswordForSms,
  };
}

function resolveVersionedKvkkConsent(body, loadTestMode) {
  const consentObject = body?.consent && typeof body.consent === 'object' ? body.consent : {};
  const kvkkApproved = parseBoolean(
    consentObject.kvkkApproved
      ?? consentObject.kvkkConsent
      ?? body.kvkkApproved
      ?? body.kvkkConsent,
    null,
  );
  const contactConsent = parseBoolean(consentObject.contactConsent ?? body.contactConsent, false) === true;
  const consentVersion = optionalString(
    consentObject.consentVersion
      ?? consentObject.kvkkConsentVersion
      ?? body.consentVersion
      ?? body.kvkkConsentVersion,
    120,
  ) || DEFAULT_KVKK_CONSENT_VERSION;
  const legalTextVersion = optionalString(
    consentObject.legalTextVersion
      ?? consentObject.kvkkLegalTextVersion
      ?? body.legalTextVersion
      ?? body.kvkkLegalTextVersion,
    120,
  ) || DEFAULT_KVKK_LEGAL_TEXT_VERSION;
  const consentSource = optionalString(consentObject.source ?? body.consentSource, 160) || 'exam_session_start';

  if (!loadTestMode && kvkkApproved !== true) {
    throw new HttpError(400, 'KVKK consent must be explicitly granted.', 'kvkk_consent_required');
  }

  return {
    kvkkApproved: loadTestMode ? kvkkApproved !== false : true,
    contactConsent,
    consentVersion,
    legalTextVersion,
    consentSource,
  };
}

function resolveUserAgent(req) {
  return optionalString(req?.headers?.['user-agent'], 512) || null;
}

async function writeVersionedKvkkConsent(
  client,
  {
    campaignCode,
    candidateId,
    applicationId,
    attemptId,
    requestIp,
    userAgent,
    consent,
  },
) {
  await client.query(
    `
      INSERT INTO consent_records (
        campaign_code,
        candidate_id,
        application_id,
        attempt_id,
        consent_scope,
        consent_granted,
        consent_version,
        legal_text_version,
        contact_consent,
        consent_source,
        ip_address,
        user_agent,
        metadata,
        consented_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'KVKK',
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (attempt_id, consent_scope)
      DO UPDATE SET
        consent_granted = EXCLUDED.consent_granted,
        consent_version = EXCLUDED.consent_version,
        legal_text_version = EXCLUDED.legal_text_version,
        contact_consent = EXCLUDED.contact_consent,
        consent_source = EXCLUDED.consent_source,
        ip_address = EXCLUDED.ip_address,
        user_agent = EXCLUDED.user_agent,
        metadata = consent_records.metadata || EXCLUDED.metadata,
        consented_at = NOW(),
        updated_at = NOW()
    `,
    [
      campaignCode,
      candidateId,
      applicationId || null,
      attemptId,
      consent.kvkkApproved === true,
      consent.consentVersion,
      consent.legalTextVersion,
      consent.contactConsent === true,
      consent.consentSource,
      optionalString(requestIp, 120) || null,
      userAgent,
      JSON.stringify({
        channel: 'exam_session_start',
      }),
    ],
  );
}

function rememberSchoolId(cacheKey, schoolId) {
  if (!cacheKey || !schoolId) return;
  cachedSchoolIds.set(cacheKey, schoolId);
  if (cachedSchoolIds.size > 2000) {
    cachedSchoolIds.clear();
    cachedSchoolIds.set(cacheKey, schoolId);
  }
}

async function resolveSchoolId(client, schoolName) {
  if (!schoolName) return null;
  const cacheKey = schoolName.toLowerCase();
  const cached = cachedSchoolIds.get(cacheKey);
  if (cached) return cached;

  const inserted = await client.query(
    `
      INSERT INTO schools (name)
      VALUES ($1)
      ON CONFLICT (name) DO NOTHING
      RETURNING id
    `,
    [schoolName],
  );

  if (inserted.rowCount > 0) {
    const schoolId = inserted.rows[0]?.id || null;
    rememberSchoolId(cacheKey, schoolId);
    return schoolId;
  }

  const existing = await client.query(
    `
      SELECT id
      FROM schools
      WHERE name = $1
      LIMIT 1
    `,
    [schoolName],
  );
  const schoolId = existing.rows[0]?.id || null;
  rememberSchoolId(cacheKey, schoolId);
  return schoolId;
}

async function upsertGuardian(
  client,
  {
    fullNameEnc,
    phoneEnc,
    emailEnc,
    phoneHash,
    phoneE164,
  },
) {
  const redactedPhone = buildRedactedPhoneToken(phoneHash);
  const existingGuardian = await client.query(
    `
      SELECT id
      FROM guardians
      WHERE phone_e164_hash = $1
        OR phone_e164 = $2
        OR phone_e164 = $3
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [phoneHash, redactedPhone, phoneE164],
  );

  if (existingGuardian.rowCount > 0) {
    const guardianId = existingGuardian.rows[0].id;
    await client.query(
      `
        UPDATE guardians
        SET
          full_name = $2,
          phone_e164 = $3,
          email = NULL,
          full_name_enc = COALESCE($4, full_name_enc),
          phone_e164_enc = COALESCE($5, phone_e164_enc),
          email_enc = COALESCE($6, email_enc),
          phone_e164_hash = $7,
          updated_at = NOW()
        WHERE id = $1
      `,
      [guardianId, REDACTED_NAME, redactedPhone, fullNameEnc, phoneEnc, emailEnc, phoneHash],
    );
    return guardianId;
  }

  const inserted = await client.query(
    `
      INSERT INTO guardians (
        full_name,
        phone_e164,
        email,
        full_name_enc,
        phone_e164_enc,
        email_enc,
        phone_e164_hash
      )
      VALUES ($1, $2, NULL, $3, $4, $5, $6)
      RETURNING id
    `,
    [REDACTED_NAME, redactedPhone, fullNameEnc, phoneEnc, emailEnc, phoneHash],
  );

  return inserted.rows[0]?.id || null;
}

async function resolveCandidate(client, payload) {
  const {
    campaignCode,
    studentFullNameHash,
    studentFullNameEnc,
    identityNoHash,
    birthYear,
    grade,
    schoolId,
    guardianId,
    section,
    ageRange,
    language,
    source,
  } = payload;

  const duplicate = await client.query(
    `
      SELECT id
      FROM candidates
      WHERE campaign_code = $1
        AND guardian_id = $2
        AND grade = $3
        AND full_name_hash = $4
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [campaignCode, guardianId, grade, studentFullNameHash],
  );

  if (duplicate.rowCount > 0) {
    const candidateId = duplicate.rows[0].id;
    await client.query(
      `
        UPDATE candidates
        SET
          school_id = COALESCE($2, school_id),
          age_range = COALESCE($3, age_range),
          preferred_language = COALESCE($4, preferred_language),
          source = COALESCE($5, source),
          full_name = $6,
          full_name_enc = COALESCE($7, full_name_enc),
          full_name_hash = COALESCE($8, full_name_hash),
          identity_no_hash = COALESCE($9, identity_no_hash),
          birth_year = COALESCE($10, birth_year),
          section = COALESCE($11, section),
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        candidateId,
        schoolId,
        ageRange,
        language,
        source,
        REDACTED_NAME,
        studentFullNameEnc,
        studentFullNameHash,
        identityNoHash,
        birthYear,
        section,
      ],
    );
    return { candidateId, isDuplicate: true };
  }

  const inserted = await client.query(
    `
      INSERT INTO candidates (
        campaign_code,
        full_name,
        full_name_enc,
        full_name_hash,
        identity_no_hash,
        birth_year,
        grade,
        section,
        school_id,
        guardian_id,
        age_range,
        preferred_language,
        source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `,
    [
      campaignCode,
      REDACTED_NAME,
      studentFullNameEnc,
      studentFullNameHash,
      identityNoHash,
      birthYear,
      grade,
      section,
      schoolId,
      guardianId,
      ageRange,
      language,
      source,
    ],
  );

  return { candidateId: inserted.rows[0].id, isDuplicate: false };
}

async function resolveApplication(client, candidateId, campaignCode, isDuplicate) {
  const existing = await client.query(
    `
      SELECT
        id,
        application_no,
        candidate_code,
        status,
        credentials_sms_status,
        credential_password_hash
      FROM applications
      WHERE candidate_id = $1
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [candidateId],
  );

  if (existing.rowCount > 0) {
    const application = existing.rows[0];
    if (isDuplicate && application.status !== 'DUPLICATE_REVIEW') {
      await client.query(
        `
          UPDATE applications
          SET status = 'DUPLICATE_REVIEW', updated_at = NOW()
          WHERE id = $1
        `,
        [application.id],
      );
      application.status = 'DUPLICATE_REVIEW';
    }
    return application;
  }

  const inserted = await client.query(
    `
      INSERT INTO applications (candidate_id, campaign_code, status)
      VALUES ($1, $2, $3::application_status)
      RETURNING id, application_no, candidate_code, status, credentials_sms_status, credential_password_hash
    `,
    [candidateId, campaignCode, isDuplicate ? 'DUPLICATE_REVIEW' : 'APPLIED'],
  );

  return inserted.rows[0];
}

async function ensureCampaign(campaignCode) {
  if (ensuredCampaignCodes.has(campaignCode)) return;

  await query(
    `
      INSERT INTO campaigns (code, name, is_active)
      VALUES ($1, $2, TRUE)
      ON CONFLICT (code) DO NOTHING
    `,
    [campaignCode, campaignCode],
  );

  ensuredCampaignCodes.add(campaignCode);
  if (ensuredCampaignCodes.size > 2000) {
    ensuredCampaignCodes.clear();
    ensuredCampaignCodes.add(campaignCode);
  }
}

async function createSession(client, attemptId) {
  const sessionToken = createSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const expiresAt = buildSessionExpiry();

  const sessionInserted = await client.query(
    `
      INSERT INTO exam_session_tokens (attempt_id, token_hash, expires_at)
      VALUES ($1, $2, $3::timestamptz)
      RETURNING id
    `,
    [attemptId, tokenHash, expiresAt],
  );

  try {
    await writeExamSessionCache(tokenHash, {
      id: sessionInserted.rows[0]?.id || null,
      attempt_id: attemptId,
      expires_at: expiresAt,
      revoked_at: null,
    });
  } catch (error) {
    if (isRedisUnavailableError(error)) {
      throw new HttpError(503, 'Session cache is temporarily unavailable.', 'session_cache_unavailable');
    }
    throw error;
  }

  return {
    sessionToken,
    expiresAt,
  };
}

async function startLoadTestSession(client, payload) {
  const {
    campaignCode,
    grade,
    schoolName,
    ageRange,
    language,
    source,
    bankKey,
    questionCount,
    section,
    scheduledExamAt,
    examSlotLabel,
    parentPhoneE164,
    requestIp,
    userAgent,
    consent,
    attribution,
  } = payload;
  const schoolId = await resolveSchoolId(client, schoolName);
  const guardianPhone = buildLoadTestGuardianPhoneToken(parentPhoneE164);

  const guardianInserted = await client.query(
    `
      INSERT INTO guardians (
        full_name,
        phone_e164,
        email,
        full_name_enc,
        phone_e164_enc,
        email_enc,
        phone_e164_hash
      )
      VALUES ($1, $2, NULL, NULL, NULL, NULL, NULL)
      RETURNING id
    `,
    [REDACTED_NAME, guardianPhone],
  );
  const guardianId = guardianInserted.rows[0]?.id;

  const candidateInserted = await client.query(
    `
      INSERT INTO candidates (
        campaign_code,
        full_name,
        full_name_enc,
        full_name_hash,
        grade,
        section,
        school_id,
        guardian_id,
        age_range,
        preferred_language,
        source
      )
      VALUES ($1, $2, NULL, NULL, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `,
    [campaignCode, REDACTED_NAME, grade, section, schoolId, guardianId, ageRange, language, source],
  );
  const candidateId = candidateInserted.rows[0]?.id;

  const applicationInserted = await client.query(
    `
      INSERT INTO applications (candidate_id, campaign_code, status)
      VALUES ($1, $2, 'APPLIED'::application_status)
      RETURNING id, application_no, candidate_code, status, credentials_sms_status, credential_password_hash
    `,
    [candidateId, campaignCode],
  );
  const application = applicationInserted.rows[0];

  const attemptInserted = await client.query(
    `
      INSERT INTO exam_attempts (
        candidate_id,
        application_id,
        campaign_code,
        exam_language,
        exam_age_range,
        bank_key,
        question_count,
        scheduled_exam_at,
        exam_slot_label,
        status,
        started_at,
        source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, 'STARTED', NOW(), $10)
      RETURNING id, started_at
    `,
    [candidateId, application.id, campaignCode, language, ageRange, bankKey, questionCount, scheduledExamAt, examSlotLabel, source],
  );
  const attempt = attemptInserted.rows[0];
  const session = await createSession(client, attempt.id);
  const credentials = await ensureApplicationCredential(client, {
    applicationId: application.id,
    credentialsSmsStatus: application.credentials_sms_status,
    currentPasswordHash: application.credential_password_hash,
  });
  await writeVersionedKvkkConsent(client, {
    campaignCode,
    candidateId,
    applicationId: application.id,
    attemptId: attempt.id,
    requestIp,
    userAgent,
    consent,
  });

  if (attribution) {
    await client.query(
      `
        INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
        VALUES ($1, $2, 'ATTRIBUTION_CAPTURED', $3::jsonb)
      `,
      [
        candidateId,
        attempt.id,
        JSON.stringify({
          ...attribution,
          capture_source: 'exam_session_start_load_test',
        }),
      ],
    );
  }

  return {
    candidateId,
    applicationId: application.id,
    applicationNo: application.application_no,
    candidateCode: credentials.candidateCode || application.candidate_code || null,
    applicationStatus: application.status,
    attemptId: attempt.id,
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt,
    startedAt: attempt.started_at,
    credentialsSmsStatus: application.credentials_sms_status || 'NOT_QUEUED',
    credentialPasswordForSms: credentials.credentialPasswordForSms,
    hasCredentialsSmsJob: false,
    parentPhoneE164,
    consentVersion: consent.consentVersion,
    section,
    scheduledExamAt,
    examSlotLabel,
  };
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);
    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const campaignCode = optionalString(body.campaignCode, 120) || readDefaultCampaignCode();
    const loadTestMode = isAuthorizedLoadTestMode(req);
    const studentFullName = requireString(body.studentFullName || body.fullName, 'studentFullName', 200);
    const parentFullName = requireString(body.parentFullName || body.fullName, 'parentFullName', 200);
    const identityNo = loadTestMode
      ? '00000000000'
      : normalizeIdentityNo(body.identityNo ?? body.tcKimlikNo ?? body.tcIdentityNo);
    const birthYear = loadTestMode
      ? 2000
      : normalizeBirthYear(body.birthYear ?? body.dogumYili ?? body.birth_year);
    const parentPhoneE164 = normalizePhoneE164(requireString(body.parentPhoneE164 || body.phone, 'parentPhoneE164', 30));
    const parentEmail = normalizeEmail(optionalString(body.parentEmail || body.email, 250));
    const schoolName = optionalString(body.schoolName, 200) || 'Belirtilmedi';
    const grade = normalizeGrade(body.grade ?? 8);
    const section = loadTestMode
      ? 'LOADTEST'
      : normalizeSection(body.section ?? body.sube ?? body.sectionName);
    const selectedExamSlot = loadTestMode
      ? resolveDefaultExamSlot(grade)
      : normalizeSelectedExamSlot(
          body.selectedExamAt
            ?? body.scheduledExamAt
            ?? body.examDateTime
            ?? body.examOpenAt
            ?? body.examSlot,
          grade,
        );
    const scheduledExamAt = selectedExamSlot?.scheduledExamAt || new Date().toISOString();
    const examSlotLabel = selectedExamSlot?.examSlotLabel || 'Exam Slot';
    const ageRange = requireString(body.ageRange || body.age, 'ageRange', 30);
    const language = requireString(body.language, 'language', 80);
    const source = optionalString(body.source || body.formSource || 'placement_exam', 160);
    const attribution = resolveAttributionPayload(body);
    const bankKey = optionalString(body.bankKey, 120);
    const questionCountRaw = Number.parseInt(String(body.questionCount ?? 0), 10);
    const questionCount = Number.isFinite(questionCountRaw) ? Math.max(0, Math.min(questionCountRaw, 500)) : 0;
    const consent = resolveVersionedKvkkConsent(body, loadTestMode);
    const requestIp = getRequestIp(req);
    const userAgent = resolveUserAgent(req);
    const studentFullNameHash = loadTestMode ? null : computePiiLookupHash(studentFullName);
    if (!loadTestMode && !studentFullNameHash) {
      throw new HttpError(503, 'PII hashing is not configured.', 'pii_hash_not_configured');
    }
    const parentPhoneHash = loadTestMode ? null : computePiiLookupHash(parentPhoneE164);
    if (!loadTestMode && !parentPhoneHash) {
      throw new HttpError(503, 'PII hashing is not configured.', 'pii_hash_not_configured');
    }
    const identityNoHash = loadTestMode ? null : computePiiLookupHash(identityNo);
    if (!loadTestMode && !identityNoHash) {
      throw new HttpError(503, 'PII hashing is not configured.', 'pii_hash_not_configured');
    }

    const [studentFullNameEnc, parentFullNameEnc, parentPhoneEnc, parentEmailEnc] = loadTestMode
      ? [null, null, null, null]
      : await Promise.all([
          encryptPii(studentFullName, 240),
          encryptPii(parentFullName, 240),
          encryptPii(parentPhoneE164, 60),
          encryptPii(parentEmail, 320),
        ]);

    if (!loadTestMode) {
      await enforceRateLimit(req, res, {
        scope: 'exam_start_ip',
        identity: requestIp,
        limitEnv: 'RL_EXAM_START_IP_LIMIT',
        windowSecondsEnv: 'RL_EXAM_START_IP_WINDOW_SECONDS',
        defaultLimit: 25,
        defaultWindowSeconds: 60,
        requireRedis: true,
        errorCode: 'exam_start_rate_limited',
        errorMessage: 'Too many exam start requests. Please retry shortly.',
      });

      await enforceRateLimit(req, res, {
        scope: 'exam_start_phone',
        identity: parentPhoneE164,
        limitEnv: 'RL_EXAM_START_PHONE_LIMIT',
        windowSecondsEnv: 'RL_EXAM_START_PHONE_WINDOW_SECONDS',
        defaultLimit: 6,
        defaultWindowSeconds: 10 * 60,
        requireRedis: true,
        errorCode: 'exam_start_phone_rate_limited',
        errorMessage: 'Too many attempts for this phone number. Please retry later.',
      });
    }

    await ensureCampaign(campaignCode);

    const started = await withTransaction(async (client) => {
      if (loadTestMode) {
        return startLoadTestSession(client, {
          campaignCode,
          grade,
          schoolName,
          section,
          scheduledExamAt,
          examSlotLabel,
          ageRange,
          language,
          source,
          bankKey,
          questionCount,
          parentPhoneE164,
          requestIp,
          userAgent,
          consent,
          attribution,
        });
      }

      const schoolId = await resolveSchoolId(client, schoolName);
      const guardianId = await upsertGuardian(client, {
        fullNameEnc: parentFullNameEnc,
        phoneEnc: parentPhoneEnc,
        emailEnc: parentEmailEnc,
        phoneHash: parentPhoneHash,
        phoneE164: parentPhoneE164,
      });
      const { candidateId, isDuplicate } = await resolveCandidate(client, {
        campaignCode,
        studentFullNameHash,
        studentFullNameEnc,
        identityNoHash,
        birthYear,
        grade,
        schoolId,
        guardianId,
        section,
        ageRange,
        language,
        source,
      });
      const application = await resolveApplication(client, candidateId, campaignCode, isDuplicate);
      const credentials = await ensureApplicationCredential(client, {
        applicationId: application.id,
        credentialsSmsStatus: application.credentials_sms_status,
        currentPasswordHash: application.credential_password_hash,
      });

      const attemptInserted = await client.query(
        `
          INSERT INTO exam_attempts (
            candidate_id,
            application_id,
            campaign_code,
            exam_language,
            exam_age_range,
            bank_key,
            question_count,
            scheduled_exam_at,
            exam_slot_label,
            status,
            started_at,
            source
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, 'STARTED', NOW(), $10)
          RETURNING id, started_at
        `,
        [candidateId, application.id, campaignCode, language, ageRange, bankKey, questionCount, scheduledExamAt, examSlotLabel, source],
      );

      const attempt = attemptInserted.rows[0];
      const session = await createSession(client, attempt.id);

      if (!loadTestMode) {
        await client.query(
          `
            INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
            VALUES ($1, $2, 'LOGIN', $3::jsonb)
          `,
          [candidateId, attempt.id, JSON.stringify({ source: 'exam_session_start' })],
        );

        await client.query(
          `
            INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
            SELECT $1, $2, 'FIRST_LOGIN', $3::jsonb
            WHERE NOT EXISTS (
              SELECT 1
              FROM activity_events
              WHERE candidate_id = $1
                AND event_type = 'FIRST_LOGIN'
            )
          `,
          [candidateId, attempt.id, JSON.stringify({ source: 'exam_session_start' })],
        );
      }

      if (attribution) {
        await client.query(
          `
            INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
            VALUES ($1, $2, 'ATTRIBUTION_CAPTURED', $3::jsonb)
          `,
          [
            candidateId,
            attempt.id,
            JSON.stringify({
              ...attribution,
              capture_source: 'exam_session_start',
            }),
          ],
        );
      }

      await writeVersionedKvkkConsent(client, {
        campaignCode,
        candidateId,
        applicationId: application.id,
        attemptId: attempt.id,
        requestIp,
        userAgent,
        consent,
      });

      return {
        candidateId,
        applicationId: application.id,
        applicationNo: application.application_no,
        candidateCode: credentials.candidateCode || application.candidate_code || null,
        applicationStatus: application.status,
        attemptId: attempt.id,
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt,
        startedAt: attempt.started_at,
        credentialsSmsStatus: application.credentials_sms_status || 'NOT_QUEUED',
        credentialPasswordForSms: credentials.credentialPasswordForSms,
        hasCredentialsSmsJob: String(application.credentials_sms_status || 'NOT_QUEUED').toUpperCase() !== 'NOT_QUEUED',
        parentPhoneE164,
        consentVersion: consent.consentVersion,
        section,
        scheduledExamAt,
        examSlotLabel,
      };
    });

    if (!loadTestMode && !started.hasCredentialsSmsJob && started.parentPhoneE164) {
      try {
        const loginUrl = optionalString(process.env.EXAM_LOGIN_URL, 500) || DEFAULT_EXAM_LOGIN_URL;
        const credentialUsername = started.candidateCode || started.applicationNo;
        const credentialPassword = started.credentialPasswordForSms || started.sessionToken;
        const enqueued = await enqueueNotification({
          campaignCode,
          candidateId: started.candidateId,
          attemptId: started.attemptId,
          channel: 'SMS',
          templateCode: 'CREDENTIALS_SMS',
          recipient: started.parentPhoneE164,
          payload: {
            applicationNo: started.applicationNo,
            candidateCode: started.candidateCode || null,
            loginUrl,
            credential: {
              username: credentialUsername,
              candidateCode: started.candidateCode || null,
              password: credentialPassword,
              expiresAt: started.expiresAt,
            },
            exam_schedule: {
              scheduled_exam_at: started.scheduledExamAt || null,
              exam_slot_label: started.examSlotLabel || null,
            },
            trigger: 'session_start_auto_credentials',
          },
        });
        started.credentialsSmsStatus = 'QUEUED';
        started.credentialsSmsJobId = enqueued.jobId;
      } catch (error) {
        console.error('[exam_session_start_sms_enqueue_failed]', error);
      }
    }

    const {
      parentPhoneE164: _parentPhoneE164,
      credentialPasswordForSms: _credentialPasswordForSms,
      hasCredentialsSmsJob: _hasCredentialsSmsJob,
      applicationId: _applicationId,
      ...sessionPayload
    } = started;
    ok(res, {
      session: sessionPayload,
    });
  });
}
