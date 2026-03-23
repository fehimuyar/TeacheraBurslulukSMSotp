// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { randomUUID } from 'node:crypto';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { getPanelIdentity } from '../../_lib/auth.js';
import { withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import {
  buildPanelSessionCookie,
  createPanelSessionToken,
  hashPanelSessionToken,
  readPanelSessionTtlMinutes,
} from '../../_lib/panelSession.js';
import { enforceRateLimit, getRequestIp } from '../../_lib/redisRateLimit.js';

function readBoundedIntEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(safeTrim(process.env[name] || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function readPasswordPolicy() {
  return {
    minLength: readBoundedIntEnv('PANEL_PASSWORD_MIN_LENGTH', 10, 8, 256),
  };
}

function assertPasswordStrongEnough(value) {
  const password = safeTrim(value);
  const { minLength } = readPasswordPolicy();
  if (!password) {
    throw new HttpError(400, 'newPassword is required.', 'missing_new_password');
  }
  if (password.length < minLength) {
    throw new HttpError(
      400,
      `New password must be at least ${minLength} characters.`,
      'weak_new_password',
    );
  }
  return password;
}

function readUserAgent(req) {
  return safeTrim(req.headers?.['user-agent']).slice(0, 512) || null;
}

async function readPasswordResetColumnAvailability(client) {
  const result = await client.query(
    `
      SELECT
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'admin_users'
            AND column_name = 'password_reset_required'
        ) AS has_password_reset_required,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'admin_users'
            AND column_name = 'password_updated_at'
        ) AS has_password_updated_at
    `,
  );
  return {
    hasPasswordResetRequired: Boolean(result.rows[0]?.has_password_reset_required),
    hasPasswordUpdatedAt: Boolean(result.rows[0]?.has_password_updated_at),
  };
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);

    const identity = await getPanelIdentity(req);
    if (!identity.authenticated) {
      throw new HttpError(401, 'Panel authentication is required.', 'panel_unauthorized');
    }

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const newPassword = assertPasswordStrongEnough(body.newPassword);
    const ttlMinutes = readPanelSessionTtlMinutes();
    const ipAddress = getRequestIp(req) || 'unknown';
    const userAgent = readUserAgent(req);
    const requestContext = readRequestContext(req);

    await enforceRateLimit(req, res, {
      scope: 'panel_password_reset_user',
      identity: identity.userId || 'unknown',
      limitEnv: 'RL_PANEL_PASSWORD_RESET_USER_LIMIT',
      windowSecondsEnv: 'RL_PANEL_PASSWORD_RESET_USER_WINDOW_SECONDS',
      defaultLimit: 6,
      defaultWindowSeconds: 15 * 60,
      requireRedis: true,
      errorCode: 'panel_password_reset_rate_limited',
      errorMessage: 'Too many password reset attempts. Please retry later.',
    });

    const resetResult = await withTransaction(async (client) => {
      const currentUserResult = await client.query(
        `
          SELECT id, password_hash
          FROM admin_users
          WHERE id = $1::uuid
          LIMIT 1
        `,
        [identity.userId],
      );

      if (currentUserResult.rowCount === 0) {
        throw new HttpError(404, 'Panel user not found.', 'panel_user_not_found');
      }

      const currentHash = safeTrim(currentUserResult.rows[0]?.password_hash);
      if (currentHash) {
        const samePasswordResult = await client.query(
          'SELECT crypt($1, $2) = $2 AS same_password',
          [newPassword, currentHash],
        );
        if (samePasswordResult.rows[0]?.same_password) {
          throw new HttpError(
            400,
            'New password must be different from current password.',
            'password_reuse_not_allowed',
          );
        }
      }

      const availability = await readPasswordResetColumnAvailability(client);

      const updateSetClauses = [
        "password_hash = crypt($1, gen_salt('bf', 12))",
        'updated_at = NOW()',
      ];

      if (availability.hasPasswordResetRequired) {
        updateSetClauses.push('password_reset_required = FALSE');
      }
      if (availability.hasPasswordUpdatedAt) {
        updateSetClauses.push('password_updated_at = NOW()');
      }

      await client.query(
        `
          UPDATE admin_users
          SET ${updateSetClauses.join(',\n            ')}
          WHERE id = $2::uuid
        `,
        [newPassword, identity.userId],
      );

      await client.query(
        `
          UPDATE admin_sessions
          SET revoked_at = NOW(), updated_at = NOW()
          WHERE admin_user_id = $1::uuid
            AND revoked_at IS NULL
        `,
        [identity.userId],
      );

      const sessionId = randomUUID();
      const tokenPayload = createPanelSessionToken({
        userId: identity.userId,
        sessionId,
        role: identity.role,
        email: identity.email,
        mfaVerified: Boolean(identity.mfaVerified),
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
          identity.userId,
          identity.role,
          tokenHash,
          tokenPayload.expiresAt,
          ipAddress,
          userAgent,
        ],
      );

      return {
        userId: identity.userId,
        session: {
          id: sessionId,
          token: tokenPayload.token,
          expiresAt: tokenPayload.expiresAt,
        },
      };
    });

    const ttlSeconds = ttlMinutes * 60;
    res.setHeader('Set-Cookie', buildPanelSessionCookie(resetResult.session.token, req, ttlSeconds));

    ok(res, {
      password_reset: true,
      user_id: resetResult.userId,
      session: {
        session_id: resetResult.session.id,
        expires_at: resetResult.session.expiresAt,
      },
    });

    try {
      await appendAuditLog({
        ...buildPanelActor(identity),
        action: 'PANEL_PASSWORD_RESET',
        targetType: 'ADMIN_USER',
        targetId: identity.userId,
        requestId: requestContext.requestId,
        ipAddress: requestContext.ipAddress || ipAddress,
        userAgent: requestContext.userAgent || userAgent,
        metadata: {
          sessionId: identity.sessionId || null,
          selfService: true,
          sessionRotated: true,
        },
      });
    } catch (auditError) {
      console.error('[panel_password_reset_audit_error]', auditError);
    }
  });
}
