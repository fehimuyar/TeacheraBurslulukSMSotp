import { randomUUID } from 'node:crypto';
import {
  assertNotBruteForceLocked,
  clearBruteForceState,
  registerBruteForceFailure,
} from '../../_lib/abuseProtection.js';
import { appendAuditLog, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { verifyTotpCode } from '../../_lib/panelMfa.js';
import {
  buildPanelSessionCookie,
  createPanelSessionToken,
  hashPanelSessionToken,
  readPanelMaxActiveSessions,
  readPanelSessionTtlMinutes,
} from '../../_lib/panelSession.js';
import { enforceRateLimit, getRequestIp } from '../../_lib/redisRateLimit.js';

const ROLE_PRIORITY = [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY];
const LEGACY_ROLE_NORMALIZATION_MAP = {
  ADMIN: ROLES.OPERATIONS,
  EDUCATION_ADVISOR: ROLES.OPERATIONS,
};

function normalizeEmail(value) {
  return safeTrim(value).toLowerCase();
}

function normalizeTckn(value) {
  return safeTrim(value).replace(/\D+/g, '').slice(0, 11);
}

function readBoundedIntEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(safeTrim(process.env[name] || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
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
    const otpCode = safeTrim(body.otpCode || body.mfaCode || body.totpCode)
      .replace(/\D+/g, '')
      .slice(0, 6);

    if ((!tckn && !email) || !password) {
      throw new HttpError(400, 'tckn (or email) and password are required.', 'missing_login_fields');
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

    let session;
    try {
      session = await withTransaction(async (client) => {
        const userResult = await client.query(
          `
          SELECT
            u.id,
            u.tckn,
            u.email,
            u.full_name,
            u.password_hash,
            COALESCE((to_jsonb(u)->>'password_reset_required')::boolean, FALSE) AS password_reset_required,
            u.status,
            u.mfa_enabled,
            u.mfa_totp_secret,
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

        if (userResult.rowCount === 0) {
          throw new HttpError(401, 'Invalid credentials.', 'invalid_credentials');
        }

        const user = userResult.rows[0];
        if (safeTrim(user.status).toUpperCase() !== 'ACTIVE') {
          throw new HttpError(403, 'Panel user is disabled.', 'panel_user_disabled');
        }

        const passwordOk = await verifyPassword(client, password, user.password_hash);
        if (!passwordOk) {
          throw new HttpError(401, 'Invalid credentials.', 'invalid_credentials');
        }

        let otpVerified = false;
        if (otpCode) {
          if (!user.mfa_enabled) {
            throw new HttpError(403, 'OTP is not enabled for this panel user.', 'panel_mfa_not_enabled');
          }

          const otpSecret = safeTrim(user.mfa_totp_secret);
          if (!otpSecret || !verifyTotpCode(otpSecret, otpCode)) {
            throw new HttpError(401, 'Invalid OTP code.', 'invalid_otp_code');
          }
          otpVerified = true;
        }

        const roleCodes = normalizeRoleCodes(user.role_codes);
        const role = pickPrimaryRole(roleCodes);
        if (!role) {
          throw new HttpError(403, 'Panel user does not have an assigned role.', 'panel_role_missing');
        }

        const passwordResetRequired = Boolean(user.password_reset_required);

        const sessionId = randomUUID();
        const tokenPayload = createPanelSessionToken({
          userId: user.id,
          sessionId,
          role,
          email: user.email,
          mfaVerified: otpVerified,
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
          otpVerified,
          user: {
            id: user.id,
            tckn: normalizeTckn(user.tckn),
            email: normalizeEmail(user.email),
            fullName: safeTrim(user.full_name),
          },
        };
      });
    } catch (error) {
      if (error instanceof HttpError) {
        const isBruteForceCandidate = [
          'invalid_credentials',
          'invalid_otp_code',
          'panel_user_disabled',
          'panel_role_missing',
          'panel_mfa_not_enabled',
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
        mfa_verified: session.otpVerified,
        otp_verified: session.otpVerified,
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
          email: session.user.email,
          otpVerified: session.otpVerified,
          expiresAt: session.expiresAt,
        },
      });
    } catch (auditError) {
      console.error('[panel_login_success_audit_error]', auditError);
    }
  });
}
