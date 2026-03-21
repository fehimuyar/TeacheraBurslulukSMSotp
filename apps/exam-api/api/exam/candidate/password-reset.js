import { randomInt } from 'node:crypto';
import {
  assertNotBruteForceLocked,
  clearBruteForceState,
  registerBruteForceFailure,
} from '../../_lib/abuseProtection.js';
import { query } from '../../_lib/db.js';
import { readDefaultCampaignCode } from '../../_lib/env.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { enqueueNotification } from '../../_lib/notifications.js';
import { computePiiLookupHash, decryptPii } from '../../_lib/piiCrypto.js';
import { enforceRateLimit, getRequestIp } from '../../_lib/redisRateLimit.js';

const DEFAULT_EXAM_LOGIN_URL = 'https://teachera.com.tr/bursluluk/giris';
const CREDENTIAL_PASSWORD_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

function readBoundedIntEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(safeTrim(process.env[name] || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function createCandidatePassword(length = 8) {
  let value = '';
  for (let i = 0; i < length; i += 1) {
    value += CREDENTIAL_PASSWORD_CHARSET[randomInt(0, CREDENTIAL_PASSWORD_CHARSET.length)];
  }
  return value;
}

function maskPhone(value) {
  const raw = safeTrim(value);
  if (!raw) return '***';
  const digits = raw.replace(/\D+/g, '');
  if (digits.length < 4) return '***';
  const first = raw.startsWith('+') ? `+${digits.slice(0, Math.min(3, digits.length - 2))}` : digits.slice(0, 3);
  const last = digits.slice(-2);
  return `${first}******${last}`;
}

async function assertResetNotLocked(ipAddress, identityKey) {
  await assertNotBruteForceLocked({
    scope: 'candidate_password_reset_ip',
    identity: ipAddress,
    errorCode: 'candidate_password_reset_ip_locked',
    errorMessage: 'Too many reset attempts from this IP. Please retry later.',
  });
  await assertNotBruteForceLocked({
    scope: 'candidate_password_reset_identity',
    identity: identityKey,
    errorCode: 'candidate_password_reset_identity_locked',
    errorMessage: 'Too many reset attempts for this identity. Please retry later.',
  });
}

async function registerResetFailure(ipAddress, identityKey) {
  await registerBruteForceFailure({
    scope: 'candidate_password_reset_ip',
    identity: ipAddress,
    threshold: readBoundedIntEnv('BRUTE_CANDIDATE_RESET_IP_THRESHOLD', 10, 3, 1000),
    failWindowSeconds: readBoundedIntEnv('BRUTE_CANDIDATE_RESET_IP_WINDOW_SECONDS', 10 * 60, 30, 24 * 60 * 60),
    lockSeconds: readBoundedIntEnv('BRUTE_CANDIDATE_RESET_IP_LOCK_SECONDS', 20 * 60, 30, 24 * 60 * 60),
  });
  await registerBruteForceFailure({
    scope: 'candidate_password_reset_identity',
    identity: identityKey,
    threshold: readBoundedIntEnv('BRUTE_CANDIDATE_RESET_IDENTITY_THRESHOLD', 6, 3, 1000),
    failWindowSeconds: readBoundedIntEnv('BRUTE_CANDIDATE_RESET_IDENTITY_WINDOW_SECONDS', 20 * 60, 30, 24 * 60 * 60),
    lockSeconds: readBoundedIntEnv('BRUTE_CANDIDATE_RESET_IDENTITY_LOCK_SECONDS', 30 * 60, 30, 24 * 60 * 60),
  });
}

async function clearResetFailures(ipAddress, identityKey) {
  await clearBruteForceState({
    scope: 'candidate_password_reset_ip',
    identity: ipAddress,
  });
  await clearBruteForceState({
    scope: 'candidate_password_reset_identity',
    identity: identityKey,
  });
}

async function hashCredentialPassword(plainPassword) {
  const hashed = await query(
    `
      SELECT crypt($1, gen_salt('bf', 8)) AS password_hash
    `,
    [plainPassword],
  );
  return hashed.rows[0]?.password_hash || null;
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);
    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const identityNo = normalizeIdentityNo(body.identityNo ?? body.tcKimlikNo ?? body.tcIdentityNo);
    const birthYear = normalizeBirthYear(body.birthYear ?? body.dogumYili ?? body.birth_year);
    const campaignCode = safeTrim(body.campaignCode || body.campaign_code || readDefaultCampaignCode()).slice(0, 120);
    const confirmReset = body.confirm === true;
    const requestIp = getRequestIp(req);
    const identityHash = computePiiLookupHash(identityNo);
    if (!identityHash) {
      throw new HttpError(503, 'PII hashing is not configured.', 'pii_hash_not_configured');
    }

    await assertResetNotLocked(requestIp, identityHash);
    await enforceRateLimit(req, res, {
      scope: 'candidate_password_reset_ip',
      identity: requestIp,
      limitEnv: 'RL_CANDIDATE_RESET_IP_LIMIT',
      windowSecondsEnv: 'RL_CANDIDATE_RESET_IP_WINDOW_SECONDS',
      defaultLimit: 20,
      defaultWindowSeconds: 10 * 60,
      requireRedis: true,
      errorCode: 'candidate_password_reset_ip_rate_limited',
      errorMessage: 'Too many reset attempts from this IP. Please retry later.',
    });
    await enforceRateLimit(req, res, {
      scope: 'candidate_password_reset_identity',
      identity: identityHash,
      limitEnv: 'RL_CANDIDATE_RESET_IDENTITY_LIMIT',
      windowSecondsEnv: 'RL_CANDIDATE_RESET_IDENTITY_WINDOW_SECONDS',
      defaultLimit: 8,
      defaultWindowSeconds: 20 * 60,
      requireRedis: true,
      errorCode: 'candidate_password_reset_identity_rate_limited',
      errorMessage: 'Too many reset attempts for this identity. Please retry later.',
    });

    const match = await query(
      `
        SELECT
          c.id AS candidate_id,
          c.campaign_code,
          a.id AS application_id,
          a.application_no,
          a.candidate_code,
          g.phone_e164 AS parent_phone_e164_legacy,
          g.phone_e164_enc AS parent_phone_e164_enc
        FROM candidates c
        JOIN applications a ON a.candidate_id = c.id
        LEFT JOIN guardians g ON g.id = c.guardian_id
        WHERE c.identity_no_hash = $1
          AND c.birth_year = $2
          AND ($3::text = '' OR c.campaign_code = $3)
        ORDER BY a.created_at DESC
        LIMIT 1
      `,
      [identityHash, birthYear, campaignCode],
    );

    const row = match.rows[0];
    if (!row) {
      await registerResetFailure(requestIp, identityHash);
      throw new HttpError(404, 'Candidate was not found for the provided identity info.', 'candidate_not_found');
    }

    await clearResetFailures(requestIp, identityHash);
    const parentPhoneE164 = await decryptPii(row.parent_phone_e164_enc, row.parent_phone_e164_legacy);
    const maskedPhone = maskPhone(parentPhoneE164);
    const candidateCode = safeTrim(row.candidate_code) || safeTrim(row.application_no);

    if (!confirmReset) {
      ok(res, {
        reset: {
          confirm_required: true,
          masked_phone: maskedPhone,
          candidate_code: candidateCode,
        },
      });
      return;
    }

    if (!parentPhoneE164) {
      throw new HttpError(409, 'Reset SMS cannot be sent because parent phone is unavailable.', 'parent_phone_unavailable');
    }

    const newPassword = createCandidatePassword(8);
    const passwordHash = await hashCredentialPassword(newPassword);
    await query(
      `
        UPDATE applications
        SET
          credential_password_hash = $2,
          credential_password_updated_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
      [row.application_id, passwordHash],
    );

    const loginUrl = safeTrim(process.env.EXAM_LOGIN_URL) || DEFAULT_EXAM_LOGIN_URL;
    const enqueued = await enqueueNotification({
      campaignCode: row.campaign_code,
      candidateId: row.candidate_id,
      attemptId: null,
      channel: 'SMS',
      templateCode: 'CREDENTIALS_SMS',
      recipient: parentPhoneE164,
      payload: {
        applicationNo: row.application_no,
        candidateCode,
        loginUrl,
        credential: {
          username: candidateCode,
          candidateCode,
          password: newPassword,
        },
        trigger: 'candidate_password_reset_identity_confirmed',
      },
    });

    ok(res, {
      reset: {
        confirm_required: false,
        sms_queued: true,
        sms_job_id: enqueued.jobId,
        masked_phone: maskedPhone,
        candidate_code: candidateCode,
      },
    });
  });
}
