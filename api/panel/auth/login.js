// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { createHash, randomInt, randomUUID } from 'node:crypto';
import {
  assertNotBruteForceLocked,
  clearBruteForceState,
  registerBruteForceFailure,
} from '../../_lib/abuseProtection.js';
import { appendAuditLog, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { query, withTransaction } from '../../_lib/db.js';
import { normalizePhoneE164 } from '../../_lib/exam.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { enqueueNotification } from '../../_lib/notifications.js';
import {
  buildPanelSessionCookie,
  createPanelSessionToken,
  hashPanelSessionToken,
  readPanelMaxActiveSessions,
  readPanelSessionTtlMinutes,
} from '../../_lib/panelSession.js';
import { maskPiiPhone } from '../../_lib/piiCrypto.js';
import { enforceRateLimit, getRequestIp } from '../../_lib/redisRateLimit.js';

const ROLE_PRIORITY = [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY];
const LEGACY_ROLE_NORMALIZATION_MAP = {
  ADMIN: ROLES.OPERATIONS,
  EDUCATION_ADVISOR: ROLES.OPERATIONS,
};

const OTP_TEMPLATE_CODE = 'PANEL_LOGIN_SMS_OTP';

function normalizeEmail(value) {
  return safeTrim(value).toLowerCase();
}

function normalizeTckn(value) {
  return safeTrim(value).replace(/\D+/g, '').slice(0, 11);
}

function normalizeOtpCode(value) {
  return safeTrim(value).replace(/\D+/g, '').slice(0, 6);
}

function readBoundedIntEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(safeTrim(process.env[name] || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function readOtpTtlSeconds() {
  return readBoundedIntEnv('PANEL_LOGIN_OTP_TTL_SECONDS', 5 * 60, 60, 20 * 60);
}

function readOtpMaxAttempts() {
  return readBoundedIntEnv('PANEL_LOGIN_OTP_MAX_ATTEMPTS', 5, 1, 10);
}

function readPanelOtpCampaignCode() {
  return (
    safeTrim(process.env.PANEL_LOGIN_OTP_CAMPAIGN_CODE)
    || safeTrim(process.env.BURSLULUK_CAMPAIGN_CODE)
    || '2026_BURSLULUK'
  ).slice(0, 120);
}

function hashOpaqueToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeRoleCodes(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => safeTrim(item).toUpperCase())
    .map((item) => LEGACY_ROLE_NORMALIZATION_MAP[item] || item)
    .filter((item) => ROLE_PRIORITY.includes(item));
}

function pickPrimaryRole(roles) {
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  return null;
}

function readRequestIp(req) {
  const forwarded = safeTrim(req.headers?.['x-forwarded-for']);
  if (forwarded) {
    return safeTrim(forwarded.split(',')[0]);
  }
  return safeTrim(req.socket?.remoteAddress || '');
}

function readUserAgent(req) {
  return safeTrim(req.headers?.['user-agent']).slice(0, 512) || null;
}

async function verifyPassword(client, password, hash) {
  const result = await client.query('SELECT crypt($1, $2) = $2 AS ok', [password, hash]);
  return Boolean(result.rows[0]?.ok);
}

async function assertLoginNotLocked(ipAddress, identity) {
  await assertNotBruteForceLocked({
    scope: 'panel_login_ip',
    identity: ipAddress,
    errorCode: 'panel_login_ip_locked',
    errorMessage: 'Too many failed login attempts from this IP. Please retry later.',
  });

  await assertNotBruteForceLocked({
    scope: 'panel_login_identity',
    identity,
    errorCode: 'panel_login_identity_locked',
    errorMessage: 'Too many failed login attempts for this account. Please retry later.',
  });
}

async function registerLoginFailure(ipAddress, identity) {
  await registerBruteForceFailure({
    scope: 'panel_login_ip',
    identity: ipAddress,
    threshold: readBoundedIntEnv('BRUTE_PANEL_LOGIN_IP_THRESHOLD', 12, 3, 1000),
    failWindowSeconds: readBoundedIntEnv('BRUTE_PANEL_LOGIN_IP_WINDOW_SECONDS', 10 * 60, 30, 24 * 60 * 60),
    lockSeconds: readBoundedIntEnv('BRUTE_PANEL_LOGIN_IP_LOCK_SECONDS', 15 * 60, 30, 24 * 60 * 60),
  });

  await registerBruteForceFailure({
    scope: 'panel_login_identity',
    identity,
    threshold: readBoundedIntEnv('BRUTE_PANEL_LOGIN_IDENTITY_THRESHOLD', 8, 3, 1000),
    failWindowSeconds: readBoundedIntEnv('BRUTE_PANEL_LOGIN_IDENTITY_WINDOW_SECONDS', 15 * 60, 30, 24 * 60 * 60),
    lockSeconds: readBoundedIntEnv('BRUTE_PANEL_LOGIN_IDENTITY_LOCK_SECONDS', 30 * 60, 30, 24 * 60 * 60),
  });
}

async function clearLoginFailureState(ipAddress, identity) {
  await clearBruteForceState({
    scope: 'panel_login_ip',
    identity: ipAddress,
  });
  await clearBruteForceState({
    scope: 'panel_login_identity',
    identity,
  });
}

async function readPanelUserByIdentifier(client, { tckn, email }) {
  const result = await client.query(
    `
      SELECT
        u.id,
        u.tckn,
        u.email,
        u.full_name,
        u.password_hash,
        COALESCE((to_jsonb(u)->>'password_reset_required')::boolean, FALSE) AS password_reset_required,
        u.status,
        to_jsonb(u)->>'phone_e164' AS phone_e164,
        COALESCE(
          array_agg(r.code) FILTER (WHERE r.code IS NOT NULL),
          ARRAY[]::text[]
        ) AS role_codes
      FROM admin_users u
      LEFT JOIN admin_user_roles ur ON ur.admin_user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE (
        ($1 <> '' AND regexp_replace(COALESCE(u.tckn, ''), '\\D', '', 'g') = $1)
        OR ($2 <> '' AND lower(u.email) = lower($2))
      )
      GROUP BY u.id
      ORDER BY CASE WHEN $1 <> '' AND regexp_replace(COALESCE(u.tckn, ''), '\\D', '', 'g') = $1 THEN 0 ELSE 1 END
      LIMIT 1
    `,
    [tckn, email],
  );

  if (result.rowCount === 0) {
    throw new HttpError(401, 'Invalid credentials.', 'invalid_credentials');
  }

  return result.rows[0];
}

async function validateUserCredentials(client, user, password) {
  if (safeTrim(user.status).toUpperCase() !== 'ACTIVE') {
    throw new HttpError(403, 'Panel user is disabled.', 'panel_user_disabled');
  }

  const passwordOk = await verifyPassword(client, password, user.password_hash);
  if (!passwordOk) {
    throw new HttpError(401, 'Invalid credentials.', 'invalid_credentials');
  }
}

async function createSessionForUser(client, {
  user,
  role,
  ipAddress,
  userAgent,
  ttlMinutes,
  maxActiveSessions,
}) {
  const sessionId = randomUUID();
  const passwordResetRequired = Boolean(user.password_reset_required);
  const tokenPayload = createPanelSessionToken({
    userId: user.id,
    sessionId,
    role,
    email: user.email,
    mfaVerified: true,
    ttlMinutes,
  });
  const tokenHash = hashPanelSessionToken(tokenPayload.token);

  await client.query(
    `
      INSERT INTO admin_sessions (
        id,
        admin_user_id,
        role_code,
        token_hash,
        mfa_verified_at,
        issued_at,
        expires_at,
        ip_address,
        user_agent,
        last_seen_at,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3,
        $4,
        NOW(),
        NOW(),
        $5::timestamptz,
        $6,
        $7,
        NOW(),
        NOW()
      )
    `,
    [
      sessionId,
      user.id,
      role,
      tokenHash,
      tokenPayload.expiresAt,
      ipAddress,
      userAgent,
    ],
  );

  await client.query(
    `
      UPDATE admin_users
      SET last_login_at = NOW(), updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [user.id],
  );

  await client.query(
    `
      WITH ranked_sessions AS (
        SELECT
          id,
          ROW_NUMBER() OVER (ORDER BY issued_at DESC, created_at DESC, id DESC) AS rn
        FROM admin_sessions
        WHERE admin_user_id = $1::uuid
          AND revoked_at IS NULL
          AND expires_at > NOW()
      )
      UPDATE admin_sessions s
      SET revoked_at = NOW(), updated_at = NOW()
      FROM ranked_sessions r
      WHERE s.id = r.id
        AND r.rn > $2
        AND s.revoked_at IS NULL
    `,
    [user.id, maxActiveSessions],
  );

  return {
    token: tokenPayload.token,
    role,
    expiresAt: tokenPayload.expiresAt,
    sessionId,
    passwordResetRequired,
    user: {
      id: user.id,
      tckn: normalizeTckn(user.tckn),
      email: normalizeEmail(user.email),
      fullName: safeTrim(user.full_name),
    },
  };
}

function buildChallengeToken() {
  return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
}

function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

async function createOtpChallenge(client, {
  user,
  role,
  ipAddress,
  userAgent,
}) {
  let normalizedPhone = null;
  try {
    normalizedPhone = normalizePhoneE164(user.phone_e164);
  } catch {
    throw new HttpError(403, 'Panel kullanıcısı için geçerli SMS telefonu tanımlı değil.', 'panel_phone_missing');
  }

  if (!normalizedPhone) {
    throw new HttpError(403, 'Panel kullanıcısı için SMS telefonu tanımlı değil.', 'panel_phone_missing');
  }

  const challengeId = randomUUID();
  const challengeToken = buildChallengeToken();
  const challengeTokenHash = hashOpaqueToken(challengeToken);
  const otpCode = generateOtpCode();
  const ttlSeconds = readOtpTtlSeconds();
  const maxAttempts = readOtpMaxAttempts();

  await client.query(
    `
      DELETE FROM panel_login_otp_challenges
      WHERE admin_user_id = $1::uuid
        AND (
          consumed_at IS NOT NULL
          OR expires_at < NOW() - INTERVAL '1 day'
          OR failed_attempts >= max_attempts
        )
    `,
    [user.id],
  );

  await client.query(
    `
      INSERT INTO panel_login_otp_challenges (
        id,
        admin_user_id,
        challenge_token_hash,
        otp_code_hash,
        expires_at,
        max_attempts,
        ip_address,
        user_agent,
        metadata,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3,
        crypt($4, gen_salt('bf', 8)),
        NOW() + make_interval(secs => $5::int),
        $6::int,
        $7,
        $8,
        $9::jsonb,
        NOW()
      )
    `,
    [
      challengeId,
      user.id,
      challengeTokenHash,
      otpCode,
      ttlSeconds,
      maxAttempts,
      ipAddress,
      userAgent,
      JSON.stringify({
        tckn: normalizeTckn(user.tckn),
        email: normalizeEmail(user.email),
        role,
      }),
    ],
  );

  return {
    challengeId,
    challengeToken,
    otpCode,
    ttlSeconds,
    phoneE164: normalizedPhone,
    maskedPhone: maskPiiPhone(normalizedPhone),
  };
}

async function verifyOtpChallenge(client, {
  challengeId,
  challengeToken,
  otpCode,
  adminUserId,
}) {
  let challenge;
  try {
    const result = await client.query(
      `
        SELECT
          id,
          failed_attempts,
          max_attempts,
          expires_at,
          consumed_at,
          crypt($4, otp_code_hash) = otp_code_hash AS otp_ok
        FROM panel_login_otp_challenges
        WHERE id = $1::uuid
          AND admin_user_id = $2::uuid
          AND challenge_token_hash = $3
        LIMIT 1
        FOR UPDATE
      `,
      [challengeId, adminUserId, hashOpaqueToken(challengeToken), otpCode],
    );
    challenge = result.rows[0] || null;
  } catch (error) {
    if (safeTrim(error?.code) === '22P02') {
      throw new HttpError(400, 'OTP challenge is invalid.', 'invalid_otp_challenge');
    }
    throw error;
  }

  if (!challenge) {
    throw new HttpError(401, 'OTP challenge is invalid.', 'invalid_otp_challenge');
  }

  if (challenge.consumed_at) {
    throw new HttpError(401, 'OTP challenge is already consumed.', 'otp_challenge_consumed');
  }

  const now = Date.now();
  const expiresAt = new Date(challenge.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    await client.query(
      `
        UPDATE panel_login_otp_challenges
        SET consumed_at = NOW(), updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [challenge.id],
    );
    throw new HttpError(401, 'OTP challenge has expired.', 'otp_challenge_expired');
  }

  if (Number(challenge.failed_attempts) >= Number(challenge.max_attempts)) {
    await client.query(
      `
        UPDATE panel_login_otp_challenges
        SET consumed_at = NOW(), updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [challenge.id],
    );
    throw new HttpError(401, 'OTP challenge is locked.', 'otp_challenge_locked');
  }

  if (!challenge.otp_ok) {
    const nextFailedAttempts = Number(challenge.failed_attempts) + 1;
    const consumed = nextFailedAttempts >= Number(challenge.max_attempts);
    await client.query(
      `
        UPDATE panel_login_otp_challenges
        SET
          failed_attempts = $2::int,
          consumed_at = CASE WHEN $3::boolean THEN NOW() ELSE consumed_at END,
          updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [challenge.id, nextFailedAttempts, consumed],
    );
    throw new HttpError(401, 'Invalid OTP code.', 'invalid_otp_code');
  }

  await client.query(
    `
      UPDATE panel_login_otp_challenges
      SET consumed_at = NOW(), updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [challenge.id],
  );
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);
    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const tckn = normalizeTckn(body.tckn || body.username || body.tcKimlikNo);
    const email = normalizeEmail(body.email);
    const password = safeTrim(body.password);
    const mfaCode = normalizeOtpCode(body.mfaCode || body.totpCode);
    const otpCode = normalizeOtpCode(body.otpCode || body.otp_code);
    const challengeId = safeTrim(body.challengeId || body.challenge_id);
    const challengeToken = safeTrim(body.challengeToken || body.challenge_token);
    const usingOtpVerifyFlow = Boolean(otpCode && challengeId && challengeToken);

    if ((!tckn && !email) || !password) {
      throw new HttpError(400, 'tckn (or email) and password are required.', 'missing_login_fields');
    }
    if (mfaCode && !otpCode) {
      throw new HttpError(400, 'TOTP is removed. Please login with SMS OTP.', 'panel_totp_removed');
    }
    if (otpCode && (!challengeId || !challengeToken)) {
      throw new HttpError(400, 'challengeId and challengeToken are required for otpCode verification.', 'missing_otp_challenge_fields');
    }

    const ttlMinutes = readPanelSessionTtlMinutes();
    const maxActiveSessions = readPanelMaxActiveSessions();
    const ipAddress = getRequestIp(req) || readRequestIp(req) || 'unknown';
    const userAgent = readUserAgent(req);
    const requestContext = readRequestContext(req);
    const loginIdentity = tckn ? `tckn:${tckn}` : `email:${email}`;

    await assertLoginNotLocked(ipAddress, loginIdentity);

    await enforceRateLimit(req, res, {
      scope: 'panel_login_ip',
      identity: ipAddress,
      limitEnv: 'RL_PANEL_LOGIN_IP_LIMIT',
      windowSecondsEnv: 'RL_PANEL_LOGIN_IP_WINDOW_SECONDS',
      defaultLimit: 20,
      defaultWindowSeconds: 60,
      requireRedis: true,
      errorCode: 'panel_login_ip_rate_limited',
      errorMessage: 'Too many login requests from this IP. Please slow down.',
    });

    await enforceRateLimit(req, res, {
      scope: 'panel_login_identity',
      identity: loginIdentity,
      limitEnv: 'RL_PANEL_LOGIN_IDENTITY_LIMIT',
      windowSecondsEnv: 'RL_PANEL_LOGIN_IDENTITY_WINDOW_SECONDS',
      defaultLimit: 12,
      defaultWindowSeconds: 5 * 60,
      requireRedis: true,
      errorCode: 'panel_login_identity_rate_limited',
      errorMessage: 'Too many login requests for this account. Please retry later.',
    });

    if (usingOtpVerifyFlow) {
      await enforceRateLimit(req, res, {
        scope: 'panel_login_otp_verify_ip',
        identity: ipAddress,
        limitEnv: 'RL_PANEL_LOGIN_OTP_VERIFY_IP_LIMIT',
        windowSecondsEnv: 'RL_PANEL_LOGIN_OTP_VERIFY_IP_WINDOW_SECONDS',
        defaultLimit: 20,
        defaultWindowSeconds: 5 * 60,
        requireRedis: true,
        errorCode: 'panel_login_otp_verify_ip_rate_limited',
        errorMessage: 'Too many OTP verification attempts from this IP. Please retry later.',
      });
      await enforceRateLimit(req, res, {
        scope: 'panel_login_otp_verify_challenge',
        identity: challengeId,
        limitEnv: 'RL_PANEL_LOGIN_OTP_VERIFY_CHALLENGE_LIMIT',
        windowSecondsEnv: 'RL_PANEL_LOGIN_OTP_VERIFY_CHALLENGE_WINDOW_SECONDS',
        defaultLimit: 10,
        defaultWindowSeconds: 5 * 60,
        requireRedis: true,
        errorCode: 'panel_login_otp_verify_challenge_rate_limited',
        errorMessage: 'Too many OTP verification attempts for this challenge. Please request a new code.',
      });
    }

    try {
      const outcome = await withTransaction(async (client) => {
        const user = await readPanelUserByIdentifier(client, { tckn, email });
        await validateUserCredentials(client, user, password);

        const roleCodes = normalizeRoleCodes(user.role_codes);
        const role = pickPrimaryRole(roleCodes);
        if (!role) {
          throw new HttpError(403, 'Panel user does not have an assigned role.', 'panel_role_missing');
        }

        if (usingOtpVerifyFlow) {
          await verifyOtpChallenge(client, {
            challengeId,
            challengeToken,
            otpCode,
            adminUserId: user.id,
          });

          const session = await createSessionForUser(client, {
            user,
            role,
            ipAddress,
            userAgent,
            ttlMinutes,
            maxActiveSessions,
          });

          return {
            kind: 'session',
            authMethod: 'SMS_OTP',
            session,
          };
        }

        const challenge = await createOtpChallenge(client, {
          user,
          role,
          ipAddress,
          userAgent,
        });

        return {
          kind: 'otp_challenge',
          role,
          user: {
            id: user.id,
            tckn: normalizeTckn(user.tckn),
            email: normalizeEmail(user.email),
            fullName: safeTrim(user.full_name),
          },
          challenge,
        };
      });

      if (outcome.kind === 'otp_challenge') {
        try {
          await enqueueNotification({
            campaignCode: readPanelOtpCampaignCode(),
            candidateId: null,
            attemptId: null,
            resultId: null,
            channel: 'SMS',
            templateCode: OTP_TEMPLATE_CODE,
            recipient: outcome.challenge.phoneE164,
            payload: {
              purpose: 'panel_login',
              otp_code: outcome.challenge.otpCode,
              expires_in_seconds: outcome.challenge.ttlSeconds,
              tckn: outcome.user.tckn || null,
              email: outcome.user.email || null,
              full_name: outcome.user.fullName || null,
            },
          });
        } catch (dispatchError) {
          await query(
            `
              UPDATE panel_login_otp_challenges
              SET
                consumed_at = NOW(),
                updated_at = NOW(),
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('dispatch_error', $2::text)
              WHERE id = $1::uuid
            `,
            [outcome.challenge.challengeId, safeTrim(dispatchError?.message || dispatchError).slice(0, 180)],
          );
          throw new HttpError(503, 'SMS doğrulama kodu gönderilemedi. Lütfen tekrar deneyin.', 'panel_otp_dispatch_failed');
        }

        await clearLoginFailureState(ipAddress, loginIdentity);
        ok(res, {
          next_step: 'otp_verify',
          otp_required: true,
          otp: {
            challenge_id: outcome.challenge.challengeId,
            challenge_token: outcome.challenge.challengeToken,
            expires_in_seconds: outcome.challenge.ttlSeconds,
            masked_phone: outcome.challenge.maskedPhone,
          },
          user: {
            id: outcome.user.id,
            tckn: outcome.user.tckn,
            email: outcome.user.email,
            full_name: outcome.user.fullName,
            role: outcome.role,
            masked_phone: outcome.challenge.maskedPhone,
          },
        });

        try {
          await appendAuditLog({
            actorType: 'PANEL_USER',
            actorId: outcome.user.id,
            actorRole: outcome.role,
            action: 'PANEL_LOGIN_OTP_SENT',
            targetType: 'PANEL_LOGIN_OTP_CHALLENGE',
            targetId: outcome.challenge.challengeId,
            requestId: requestContext.requestId,
            ipAddress: requestContext.ipAddress || ipAddress,
            userAgent: requestContext.userAgent || userAgent,
            metadata: {
              authMethod: 'SMS_OTP',
              masked_phone: outcome.challenge.maskedPhone,
              expires_in_seconds: outcome.challenge.ttlSeconds,
              tckn: outcome.user.tckn || null,
              email: outcome.user.email || null,
            },
          });
        } catch (auditError) {
          console.error('[panel_login_otp_sent_audit_error]', auditError);
        }
        return;
      }

      const session = outcome.session;
      await clearLoginFailureState(ipAddress, loginIdentity);

      const ttlSeconds = ttlMinutes * 60;
      res.setHeader('Set-Cookie', buildPanelSessionCookie(session.token, req, ttlSeconds));
      ok(res, {
        next_step: session.passwordResetRequired ? 'password_reset' : null,
        session: {
          token: session.token,
          expires_at: session.expiresAt,
          session_id: session.sessionId,
          password_reset_required: session.passwordResetRequired,
        },
        user: {
          id: session.user.id,
          tckn: session.user.tckn,
          email: session.user.email,
          full_name: session.user.fullName,
          role: session.role,
          mfa_verified: true,
          otp_verified: true,
          auth_method: outcome.authMethod,
          password_reset_required: session.passwordResetRequired,
        },
      });

      try {
        await appendAuditLog({
          actorType: 'PANEL_USER',
          actorId: session.user.id,
          actorRole: session.role,
          action: 'PANEL_LOGIN_SUCCESS',
          targetType: 'ADMIN_SESSION',
          targetId: session.sessionId,
          requestId: requestContext.requestId,
          ipAddress: requestContext.ipAddress || ipAddress,
          userAgent: requestContext.userAgent || userAgent,
          metadata: {
            tckn: session.user.tckn || null,
            email: session.user.email || null,
            mfaVerified: true,
            authMethod: outcome.authMethod,
            expiresAt: session.expiresAt,
          },
        });
      } catch (auditError) {
        console.error('[panel_login_success_audit_error]', auditError);
      }
    } catch (rawError) {
      const error = rawError instanceof HttpError ? rawError : rawError;
      if (error instanceof HttpError) {
        const isBruteForceCandidate = [
          'invalid_credentials',
          'invalid_otp_code',
          'invalid_otp_challenge',
          'otp_challenge_expired',
          'otp_challenge_consumed',
          'otp_challenge_locked',
          'panel_user_disabled',
          'panel_role_missing',
          'panel_totp_removed',
        ].includes(error.code);
        if (isBruteForceCandidate) {
          await registerLoginFailure(ipAddress, loginIdentity);
        }
      }

      try {
        await appendAuditLog({
          actorType: 'PANEL_USER',
          actorId: loginIdentity || 'unknown',
          action: 'PANEL_LOGIN_FAILED',
          targetType: 'ADMIN_SESSION',
          requestId: requestContext.requestId,
          ipAddress: requestContext.ipAddress || ipAddress,
          userAgent: requestContext.userAgent || userAgent,
          metadata: {
            tckn: tckn || null,
            email: email || null,
            otpProvided: Boolean(otpCode),
            reason: error instanceof HttpError ? error.code : 'unexpected_error',
          },
        });
      } catch (auditError) {
        console.error('[panel_login_failed_audit_error]', auditError);
      }

      throw error;
    }
  });
}
