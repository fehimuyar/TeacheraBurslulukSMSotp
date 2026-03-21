import {
  assertNotBruteForceLocked,
  clearBruteForceState,
  registerBruteForceFailure,
} from '../../_lib/abuseProtection.js';
import { query } from '../../_lib/db.js';
import { readDefaultCampaignCode } from '../../_lib/env.js';
import { HttpError } from '../../_lib/errors.js';
import { buildSessionExpiry, createSessionToken, hashSessionToken } from '../../_lib/exam.js';
import { resolveExamGateStatus } from '../../_lib/examGate.js';
import { enqueueExamOpenSmsIfNeeded } from '../../_lib/examOpenSms.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { decryptPii } from '../../_lib/piiCrypto.js';
import { enforceRateLimit, getRequestIp } from '../../_lib/redisRateLimit.js';

function normalizeUsername(value) {
  return safeTrim(value).toUpperCase().slice(0, 60);
}

function normalizePassword(value) {
  return safeTrim(value).slice(0, 180);
}

function readBoundedIntEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(safeTrim(process.env[name] || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function resolveCandidateGateStatus(gate, scheduledExamAtRaw) {
  const scheduledAt = scheduledExamAtRaw instanceof Date
    ? scheduledExamAtRaw.toISOString()
    : safeTrim(scheduledExamAtRaw);
  if (!scheduledAt) return gate;
  const scheduledMs = Number(new Date(scheduledAt));
  if (!Number.isFinite(scheduledMs)) return gate;

  const serverNowMs = Number(new Date(gate?.server_time_utc || new Date().toISOString()));
  const globalOpenAtMs = gate?.exam_open_at ? Number(new Date(gate.exam_open_at)) : NaN;
  const effectiveOpenAtMs = Number.isFinite(globalOpenAtMs) ? Math.max(globalOpenAtMs, scheduledMs) : scheduledMs;
  const candidateExamOpen = serverNowMs >= scheduledMs;
  const examOpen = gate?.exam_force_open === true ? true : serverNowMs >= effectiveOpenAtMs;

  return {
    ...gate,
    exam_open: examOpen,
    exam_open_at: new Date(effectiveOpenAtMs).toISOString(),
    remaining_seconds: examOpen ? 0 : Math.max(0, Math.ceil((effectiveOpenAtMs - serverNowMs) / 1000)),
    candidate_exam_open: candidateExamOpen,
    candidate_exam_open_at: new Date(scheduledMs).toISOString(),
    candidate_remaining_seconds: candidateExamOpen ? 0 : Math.max(0, Math.ceil((scheduledMs - serverNowMs) / 1000)),
  };
}

async function assertLoginNotLocked(ipAddress, username) {
  await assertNotBruteForceLocked({
    scope: 'candidate_login_ip',
    identity: ipAddress,
    errorCode: 'candidate_login_ip_locked',
    errorMessage: 'Too many failed candidate logins from this IP. Please retry later.',
  });

  await assertNotBruteForceLocked({
    scope: 'candidate_login_username',
    identity: username,
    errorCode: 'candidate_login_username_locked',
    errorMessage: 'Too many failed attempts for this candidate account. Please retry later.',
  });
}

async function registerLoginFailure(ipAddress, username) {
  await registerBruteForceFailure({
    scope: 'candidate_login_ip',
    identity: ipAddress,
    threshold: readBoundedIntEnv('BRUTE_CANDIDATE_LOGIN_IP_THRESHOLD', 20, 3, 1000),
    failWindowSeconds: readBoundedIntEnv('BRUTE_CANDIDATE_LOGIN_IP_WINDOW_SECONDS', 10 * 60, 30, 24 * 60 * 60),
    lockSeconds: readBoundedIntEnv('BRUTE_CANDIDATE_LOGIN_IP_LOCK_SECONDS', 15 * 60, 30, 24 * 60 * 60),
  });

  await registerBruteForceFailure({
    scope: 'candidate_login_username',
    identity: username,
    threshold: readBoundedIntEnv('BRUTE_CANDIDATE_LOGIN_USERNAME_THRESHOLD', 10, 3, 1000),
    failWindowSeconds: readBoundedIntEnv('BRUTE_CANDIDATE_LOGIN_USERNAME_WINDOW_SECONDS', 15 * 60, 30, 24 * 60 * 60),
    lockSeconds: readBoundedIntEnv('BRUTE_CANDIDATE_LOGIN_USERNAME_LOCK_SECONDS', 30 * 60, 30, 24 * 60 * 60),
  });
}

async function clearFailureState(ipAddress, username) {
  await clearBruteForceState({
    scope: 'candidate_login_ip',
    identity: ipAddress,
  });
  await clearBruteForceState({
    scope: 'candidate_login_username',
    identity: username,
  });
}

async function verifyCredentialPassword(password, passwordHash) {
  if (!passwordHash) return false;
  const result = await query('SELECT crypt($1, $2) = $2 AS ok', [password, passwordHash]);
  return Boolean(result.rows[0]?.ok);
}

async function issueExamSessionToken(attemptId) {
  const sessionToken = createSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const expiresAt = buildSessionExpiry();

  await query(
    `
      INSERT INTO exam_session_tokens (attempt_id, token_hash, expires_at)
      VALUES ($1, $2, $3::timestamptz)
    `,
    [attemptId, tokenHash, expiresAt],
  );

  return {
    sessionToken,
    expiresAt,
  };
}

/**
 * Contract v1 request:
 * {
 *   "username": "20260315-100001",        // required (application_no)
 *   "password": "session_token_from_sms", // required
 *   "campaignCode": "2026_BURSLULUK"      // optional
 * }
 *
 * Contract v1 response:
 * {
 *   "ok": true,
 *   "session": {
 *     "applicationNo": "...",
 *     "attemptId": "...",
 *     "candidateId": "...",
 *     "sessionToken": "...",
 *     "expiresAt": "...",
 *     "examStatus": "...",
 *     "examLanguage": "...",
 *     "examAgeRange": "...",
 *     "questionCount": 40
 *   },
 *   "candidate": {
 *     "studentFullName": "...",
 *     "parentFullName": "...",
 *     "grade": 8
 *   },
 *   "gate": {
 *     "exam_open": false,
 *     "exam_open_at": "...",
 *     "server_time_utc": "...",
 *     "remaining_seconds": 123
 *   }
 * }
 */
export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);
    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const username = normalizeUsername(body.username || body.applicationNo || body.application_no);
    const password = normalizePassword(body.password || body.sessionPassword || body.session_token);
    const campaignCode = safeTrim(body.campaignCode || body.campaign_code || readDefaultCampaignCode()).slice(0, 120);
    if (!username || !password) {
      throw new HttpError(400, 'username and password are required.', 'missing_login_fields');
    }

    const requestIp = getRequestIp(req);
    await assertLoginNotLocked(requestIp, username);

    await enforceRateLimit(req, res, {
      scope: 'candidate_login_ip',
      identity: requestIp,
      limitEnv: 'RL_CANDIDATE_LOGIN_IP_LIMIT',
      windowSecondsEnv: 'RL_CANDIDATE_LOGIN_IP_WINDOW_SECONDS',
      defaultLimit: 40,
      defaultWindowSeconds: 60,
      requireRedis: true,
      errorCode: 'candidate_login_ip_rate_limited',
      errorMessage: 'Too many candidate login attempts from this IP. Please retry shortly.',
    });

    await enforceRateLimit(req, res, {
      scope: 'candidate_login_username',
      identity: username,
      limitEnv: 'RL_CANDIDATE_LOGIN_USERNAME_LIMIT',
      windowSecondsEnv: 'RL_CANDIDATE_LOGIN_USERNAME_WINDOW_SECONDS',
      defaultLimit: 16,
      defaultWindowSeconds: 5 * 60,
      requireRedis: true,
      errorCode: 'candidate_login_username_rate_limited',
      errorMessage: 'Too many candidate login attempts for this account. Please retry later.',
    });

    const tokenHash = hashSessionToken(password);
    const state = await query(
      `
        SELECT
          a.id AS application_id,
          a.application_no,
          a.candidate_code,
          a.campaign_code,
          a.credential_password_hash,
          c.id AS candidate_id,
          c.section,
          c.full_name AS student_full_name_legacy,
          c.full_name_enc AS student_full_name_enc,
          c.grade,
          g.full_name AS parent_full_name_legacy,
          g.full_name_enc AS parent_full_name_enc,
          g.phone_e164 AS parent_phone_e164_legacy,
          g.phone_e164_enc AS parent_phone_e164_enc,
          ea.id AS attempt_id,
          ea.status AS exam_status,
          ea.exam_language,
          ea.exam_age_range,
          ea.question_count,
          ea.scheduled_exam_at,
          ea.exam_slot_label,
          st.token_hash,
          st.expires_at,
          st.revoked_at
        FROM applications a
        JOIN candidates c ON c.id = a.candidate_id
        LEFT JOIN guardians g ON g.id = c.guardian_id
        LEFT JOIN LATERAL (
          SELECT id, status, exam_language, exam_age_range, question_count, scheduled_exam_at, exam_slot_label, created_at
          FROM exam_attempts
          WHERE application_id = a.id
          ORDER BY created_at DESC
          LIMIT 1
        ) ea ON TRUE
        LEFT JOIN LATERAL (
          SELECT token_hash, expires_at, revoked_at, created_at
          FROM exam_session_tokens
          WHERE attempt_id = ea.id
          ORDER BY created_at DESC
          LIMIT 1
        ) st ON TRUE
        WHERE (a.candidate_code = $1 OR a.application_no = $1)
          AND ($2::text = '' OR a.campaign_code = $2)
        LIMIT 1
      `,
      [username, campaignCode],
    );

    const row = state.rows[0];
    const credentialLoginOk = row
      && row.attempt_id
      && await verifyCredentialPassword(password, row.credential_password_hash);
    const legacyLoginOk = Boolean(
      row
      && row.attempt_id
      && row.expires_at
      && !row.revoked_at
      && row.application_no === username
      && tokenHash === row.token_hash
      && Number(new Date(row.expires_at)) >= Date.now(),
    );

    if (!credentialLoginOk && !legacyLoginOk) {
      await registerLoginFailure(requestIp, username);
      throw new HttpError(401, 'Invalid candidate credentials.', 'invalid_candidate_credentials');
    }

    await clearFailureState(requestIp, username);

    const activeSession = credentialLoginOk
      ? await issueExamSessionToken(row.attempt_id)
      : {
          sessionToken: password,
          expiresAt: row.expires_at,
        };

    const baseGate = await resolveExamGateStatus(row.campaign_code);
    const gate = resolveCandidateGateStatus(baseGate, row.scheduled_exam_at);
    const parentPhoneE164 = await decryptPii(row.parent_phone_e164_enc, row.parent_phone_e164_legacy);

    if (gate.exam_open) {
      try {
        await enqueueExamOpenSmsIfNeeded({
          campaignCode: row.campaign_code,
          candidateId: row.candidate_id,
          attemptId: row.attempt_id,
          parentPhoneE164,
          applicationNo: row.application_no,
          trigger: 'candidate_login_exam_open',
        });
      } catch (error) {
        console.error('[candidate_login_exam_open_sms_enqueue_failed]', error);
      }
    }

    ok(res, {
      session: {
        applicationNo: row.application_no,
        candidateCode: row.candidate_code || null,
        attemptId: row.attempt_id,
        candidateId: row.candidate_id,
        sessionToken: activeSession.sessionToken,
        expiresAt: activeSession.expiresAt,
        examStatus: row.exam_status,
        examLanguage: row.exam_language,
        examAgeRange: row.exam_age_range,
        questionCount: Number(row.question_count || 0),
        scheduledExamAt: row.scheduled_exam_at || null,
        examSlotLabel: row.exam_slot_label || null,
        section: row.section || null,
      },
      candidate: {
        studentFullName: safeTrim(row.student_full_name_legacy) || null,
        parentFullName: safeTrim(row.parent_full_name_legacy) || null,
        grade: row.grade,
        section: row.section || null,
      },
      gate,
    });
  });
}
