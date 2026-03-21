// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { getPanelIdentity } from '../../_lib/auth.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok } from '../../_lib/http.js';
import { enforceRateLimit, getRequestIp } from '../../_lib/redisRateLimit.js';

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    const ipAddress = getRequestIp(req) || 'unknown';

    await enforceRateLimit(req, res, {
      scope: 'panel_auth_me_ip',
      identity: ipAddress,
      limitEnv: 'RL_PANEL_AUTH_ME_IP_LIMIT',
      windowSecondsEnv: 'RL_PANEL_AUTH_ME_IP_WINDOW_SECONDS',
      defaultLimit: 180,
      defaultWindowSeconds: 60,
      requireRedis: true,
      errorCode: 'panel_auth_me_rate_limited',
      errorMessage: 'Too many panel identity requests from this IP. Please retry shortly.',
    });

    const identity = await getPanelIdentity(req);
    if (!identity.authenticated) {
      throw new HttpError(401, 'Panel authentication is required.', 'panel_unauthorized');
    }

    if (!identity.mfaVerified) {
      throw new HttpError(403, 'MFA verification is required.', 'panel_mfa_required');
    }

    ok(res, {
      identity: {
        user_id: identity.userId,
        email: identity.email,
        full_name: identity.fullName,
        role: identity.role,
        permissions: identity.permissions || [],
        mfa_verified: identity.mfaVerified,
        session_id: identity.sessionId,
        password_reset_required: Boolean(identity.passwordResetRequired),
      },
    });
  });
}
