// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { randomInt, randomUUID } from 'node:crypto';
import { query, withTransaction } from '../../_lib/db.js';
import { readDefaultCampaignCode } from '../../_lib/env.js';
import { HttpError } from '../../_lib/errors.js';
import {
  buildSessionExpiry,
  createSessionToken,
  hashSessionToken,
  normalizePhoneE164,
  optionalString,
} from '../../_lib/exam.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { decryptPii } from '../../_lib/piiCrypto.js';
import { enforceRateLimit, getRequestIp } from '../../_lib/redisRateLimit.js';
import { writeExamSessionCache } from '../../_lib/redisExamSession.js';
import { requireExamSession } from '../../_lib/sessionAuth.js';

const DEFAULT_EXAM_LOGIN_URL = 'https://teachera.com.tr/bursluluk/giris';
const CREDENTIAL_PASSWORD_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function readSessionTokenFromRequest(req) {
  const fromHeader = safeTrim(req.headers?.['x-exam-session-token']);
  if (fromHeader) return fromHeader;

  const authHeader = safeTrim(req.headers?.authorization);
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return safeTrim(req.query?.session_token);
}

function normalizeApplicationNo(value) {
  return safeTrim(value).toUpperCase().slice(0, 60);
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

function readOpsNotificationWorkerBaseUrl() {
  return String(process.env.OPS_API_BASE_URL || 'https://ops-api.teachera.com.tr')
    .trim()
    .replace(/\/$/, '');
}

function readOpsNotificationWorkerSecret() {
  return safeTrim(process.env.NOTIFICATION_WORKER_SECRET || process.env.CRON_SECRET);
}

async function nudgeCredentialsSmsWorkerBestEffort(campaignCode) {
  const workerBaseUrl = readOpsNotificationWorkerBaseUrl();
  const workerSecret = readOpsNotificationWorkerSecret();
  if (!workerBaseUrl || !workerSecret) {
    return;
  }

  const endpoint = new URL('/api/notifications/worker', workerBaseUrl + '/');
  endpoint.searchParams.set('limit', '10');
  endpoint.searchParams.set('reconcile_limit', '10');
  if (safeTrim(campaignCode)) {
    endpoint.searchParams.set('campaign_code', safeTrim(campaignCode).slice(0, 120));
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(endpoint.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${workerSecret}`,
      },
      body: '{}',
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error('[credentials_sms_worker_nudge_failed]', response.status, response.statusText);
    }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error('[credentials_sms_worker_nudge_failed]', error);
    }
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function enqueueCredentialsSmsInTransaction(client, payload) {
  const {
    campaignCode,
    candidateId,
    attemptId,
    recipient,
    applicationNo,
    candidateCode,
    credentialUsername,
    credentialPassword,
    expiresAt,
    trigger,
  } = payload;

  const jobId = randomUUID();
  const loginUrl = optionalString(process.env.EXAM_LOGIN_URL, 500) || DEFAULT_EXAM_LOGIN_URL;

  await client.query(
    `
      INSERT INTO notification_jobs (
        id,
        campaign_code,
        candidate_id,
        attempt_id,
        result_id,
        channel,
        template_code,
        recipient,
        payload,
        status,
        retry_count
      )
      VALUES ($1, $2, $3, $4, NULL, 'SMS', 'CREDENTIALS_SMS', $5, $6::jsonb, 'QUEUED', 0)
    `,
    [
      jobId,
      campaignCode,
      candidateId,
      attemptId,
      recipient,
      JSON.stringify({
        applicationNo,
        candidateCode: candidateCode || null,
        loginUrl,
        credential: {
          username: credentialUsername || candidateCode || applicationNo,
          candidateCode: candidateCode || null,
          password: credentialPassword,
          expiresAt,
        },
        trigger,
      }),
    ],
  );

  await client.query(
    `
      INSERT INTO notification_events (
        id,
        job_id,
        event_type,
        payload
      )
      VALUES (gen_random_uuid(), $1, 'QUEUED', $2::jsonb)
    `,
    [
      jobId,
      JSON.stringify({
        source: trigger,
        channel: 'SMS',
        template_code: 'CREDENTIALS_SMS',
      }),
    ],
  );

  await client.query(
    `
      UPDATE applications
      SET
        credentials_sms_status = 'QUEUED',
        updated_at = NOW()
      WHERE id = (
        SELECT id
        FROM applications
        WHERE candidate_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      )
    `,
    [candidateId],
  );

  return { jobId };
}

async function loadAttemptStateByAttemptId(attemptId) {
  return query(
    `
      SELECT
        a.id AS application_id,
        a.application_no,
        a.candidate_code,
        a.campaign_code,
        c.id AS candidate_id,
        ea.id AS attempt_id,
        g.phone_e164 AS parent_phone_e164_legacy,
        g.phone_e164_enc AS parent_phone_e164_enc
      FROM exam_attempts ea
      JOIN applications a ON a.id = ea.application_id
      JOIN candidates c ON c.id = ea.candidate_id
      LEFT JOIN guardians g ON g.id = c.guardian_id
      WHERE ea.id = $1
      LIMIT 1
    `,
    [attemptId],
  );
}

async function loadAttemptStateByApplicationNo(applicationNo, campaignCode) {
  return query(
    `
      SELECT
        a.id AS application_id,
        a.application_no,
        a.candidate_code,
        a.campaign_code,
        c.id AS candidate_id,
        ea.id AS attempt_id,
        g.phone_e164 AS parent_phone_e164_legacy,
        g.phone_e164_enc AS parent_phone_e164_enc
      FROM applications a
      JOIN candidates c ON c.id = a.candidate_id
      LEFT JOIN guardians g ON g.id = c.guardian_id
      LEFT JOIN LATERAL (
        SELECT id, created_at
        FROM exam_attempts
        WHERE application_id = a.id
        ORDER BY created_at DESC
        LIMIT 1
      ) ea ON TRUE
      WHERE (a.application_no = $1 OR a.candidate_code = $1)
        AND ($2::text = '' OR a.campaign_code = $2)
      LIMIT 1
    `,
    [applicationNo, campaignCode],
  );
}

async function rotateCredentials({
  attemptId,
  row,
  currentToken,
  authenticatedSession,
  trigger,
}) {
  const parentPhoneE164 = await decryptPii(row.parent_phone_e164_enc, row.parent_phone_e164_legacy);
  if (!parentPhoneE164) {
    throw new HttpError(409, 'Parent phone number is unavailable.', 'candidate_phone_missing');
  }

  const nextSessionToken = createSessionToken();
  const nextTokenHash = hashSessionToken(nextSessionToken);
  const nextExpiresAt = buildSessionExpiry();
  const revokedAt = new Date().toISOString();
  const credentialPasswordForSms = createCandidatePassword(8);

  const { sessionId, jobId } = await withTransaction(async (client) => {
    const credentialPasswordHash = await hashCredentialPassword(client, credentialPasswordForSms);
    const inserted = await client.query(
      `
        INSERT INTO exam_session_tokens (attempt_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      [attemptId, nextTokenHash, nextExpiresAt],
    );

    await client.query(
      `
        UPDATE exam_session_tokens
        SET revoked_at = NOW()
        WHERE attempt_id = $1
          AND token_hash <> $2
          AND revoked_at IS NULL
      `,
      [attemptId, nextTokenHash],
    );

    await client.query(
      `
        UPDATE applications
        SET
          credential_password_hash = $2,
          credential_password_updated_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
      [row.application_id, credentialPasswordHash],
    );

    const smsJob = await enqueueCredentialsSmsInTransaction(client, {
      campaignCode: row.campaign_code,
      candidateId: row.candidate_id,
      attemptId: row.attempt_id,
      recipient: parentPhoneE164,
      applicationNo: row.application_no,
      candidateCode: row.candidate_code || null,
      credentialUsername: row.candidate_code || row.application_no,
      credentialPassword: credentialPasswordForSms,
      expiresAt: nextExpiresAt,
      trigger,
    });

    return {
      sessionId: inserted.rows[0]?.id || null,
      jobId: smsJob.jobId,
    };
  });

  const sideEffects = [
    writeExamSessionCache(nextTokenHash, {
      id: sessionId,
      attempt_id: attemptId,
      expires_at: nextExpiresAt,
      revoked_at: null,
    }),
    nudgeCredentialsSmsWorkerBestEffort(row.campaign_code),
  ];
  if (currentToken && authenticatedSession) {
    const currentTokenHash = hashSessionToken(currentToken);
    sideEffects.push(
      writeExamSessionCache(currentTokenHash, {
        ...authenticatedSession,
        revoked_at: revokedAt,
      }),
    );
  }

  await Promise.allSettled(sideEffects);

  return {
    applicationNo: row.application_no,
    sessionToken: nextSessionToken,
    expiresAt: nextExpiresAt,
    phone: parentPhoneE164,
    credentialsSmsStatus: 'QUEUED',
    jobId,
  };
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);
    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const attemptId = safeTrim(body.attemptId || body.attempt_id);
    const applicationNo = normalizeApplicationNo(body.applicationNo || body.application_no || body.username);
    const parentPhoneE164 = body.parentPhoneE164 || body.parent_phone_e164 || body.phone;
    const campaignCode = safeTrim(body.campaignCode || body.campaign_code || readDefaultCampaignCode()).slice(0, 120);
    const requestIp = getRequestIp(req);
    const currentToken = readSessionTokenFromRequest(req);

    await enforceRateLimit(req, res, {
      scope: 'candidate_credentials_renew_ip',
      identity: requestIp,
      limitEnv: 'RL_CANDIDATE_CREDENTIALS_RENEW_IP_LIMIT',
      windowSecondsEnv: 'RL_CANDIDATE_CREDENTIALS_RENEW_IP_WINDOW_SECONDS',
      defaultLimit: 8,
      defaultWindowSeconds: 10 * 60,
      requireRedis: true,
      errorCode: 'candidate_credentials_renew_ip_rate_limited',
      errorMessage: 'Too many credential resend requests from this IP. Please retry later.',
    });

    if (attemptId) {
      if (!currentToken) {
        throw new HttpError(401, 'Exam session token is required.', 'missing_exam_session_token');
      }

      await enforceRateLimit(req, res, {
        scope: 'candidate_credentials_renew_attempt',
        identity: attemptId,
        limitEnv: 'RL_CANDIDATE_CREDENTIALS_RENEW_ATTEMPT_LIMIT',
        windowSecondsEnv: 'RL_CANDIDATE_CREDENTIALS_RENEW_ATTEMPT_WINDOW_SECONDS',
        defaultLimit: 4,
        defaultWindowSeconds: 10 * 60,
        requireRedis: true,
        errorCode: 'candidate_credentials_renew_attempt_rate_limited',
        errorMessage: 'Too many credential resend requests for this application. Please retry later.',
      });

      const authenticatedSession = await requireExamSession(req, attemptId);
      const state = await loadAttemptStateByAttemptId(attemptId);
      if (state.rowCount === 0) {
        throw new HttpError(404, 'Exam attempt was not found.', 'attempt_not_found');
      }

      const credentials = await rotateCredentials({
        attemptId,
        row: state.rows[0],
        currentToken,
        authenticatedSession,
        trigger: 'candidate_credentials_resend_authenticated',
      });

      ok(res, { credentials });
      return;
    }

    if (!applicationNo || !parentPhoneE164) {
      throw new HttpError(400, 'applicationNo and parentPhoneE164 are required.', 'missing_recovery_fields');
    }

    const normalizedPhone = normalizePhoneE164(parentPhoneE164);

    await enforceRateLimit(req, res, {
      scope: 'candidate_credentials_renew_application',
      identity: applicationNo,
      limitEnv: 'RL_CANDIDATE_CREDENTIALS_RENEW_APPLICATION_LIMIT',
      windowSecondsEnv: 'RL_CANDIDATE_CREDENTIALS_RENEW_APPLICATION_WINDOW_SECONDS',
      defaultLimit: 4,
      defaultWindowSeconds: 10 * 60,
      requireRedis: true,
      errorCode: 'candidate_credentials_renew_application_rate_limited',
      errorMessage: 'Too many credential resend requests for this application. Please retry later.',
    });

    const state = await loadAttemptStateByApplicationNo(applicationNo, campaignCode);
    if (state.rowCount === 0) {
      throw new HttpError(401, 'Application details could not be verified.', 'invalid_candidate_recovery');
    }

    const row = state.rows[0];
    if (!row.attempt_id) {
      throw new HttpError(409, 'Application does not have an exam attempt yet.', 'attempt_not_ready');
    }

    const storedPhone = await decryptPii(row.parent_phone_e164_enc, row.parent_phone_e164_legacy);
    if (!storedPhone || storedPhone !== normalizedPhone) {
      throw new HttpError(401, 'Application details could not be verified.', 'invalid_candidate_recovery');
    }

    const credentials = await rotateCredentials({
      attemptId: row.attempt_id,
      row,
      currentToken: null,
      authenticatedSession: null,
      trigger: 'candidate_credentials_resend_recovery',
    });

    ok(res, { credentials });
  });
}
