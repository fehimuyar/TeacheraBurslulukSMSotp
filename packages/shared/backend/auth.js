import { query } from './db.js';
import { ROLES } from './constants.js';
import { HttpError } from './errors.js';
import { safeTrim } from './http.js';
import {
  extractPanelSessionToken,
  hashPanelSessionToken,
  readPanelSessionIdleTimeoutMinutes,
  verifyPanelSessionToken,
} from './panelSession.js';

function hasAllowedRole(role, allowed) {
  if (!role) return false;
  const normalizedRole = normalizeRoleCode(role);
  return allowed.map((item) => normalizeRoleCode(item)).includes(normalizedRole);
}

function isKnownRole(role) {
  return Object.values(ROLES).includes(normalizeRoleCode(role));
}

function normalizeRoleCode(role) {
  const normalized = safeTrim(role).toUpperCase();
  if (normalized === 'ADMIN' || normalized === 'EDUCATION_ADVISOR') {
    return ROLES.OPERATIONS;
  }
  return normalized;
}

function readRequireOtpFlag() {
  const value = safeTrim(process.env.PANEL_REQUIRE_OTP).toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function unauthenticatedIdentity() {
  return {
    authenticated: false,
    role: null,
    roles: [],
    keyId: null,
    userId: null,
    email: null,
    fullName: null,
    sessionId: null,
    mfaVerified: false,
    otpVerified: false,
    passwordResetRequired: false,
  };
}

async function readActiveSessionFromDb(claims, tokenHash) {
  const result = await query(
    `
      SELECT
        s.id AS session_id,
        s.admin_user_id,
        s.role_code,
        s.expires_at,
        s.issued_at,
        s.last_seen_at,
        s.revoked_at,
        s.mfa_verified_at,
        u.email,
        u.full_name,
        u.status AS user_status,
        COALESCE((to_jsonb(u)->>'password_reset_required')::boolean, FALSE) AS password_reset_required
      FROM admin_sessions s
      JOIN admin_users u ON u.id = s.admin_user_id
      WHERE s.id = $1::uuid
        AND s.admin_user_id = $2::uuid
        AND s.token_hash = $3
        AND EXISTS (
          SELECT 1
          FROM admin_user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.admin_user_id = s.admin_user_id
            AND r.code = s.role_code
        )
      LIMIT 1
    `,
    [claims.sessionId, claims.userId, tokenHash],
  );

  return result.rows[0] || null;
}

function isSessionValid(row, claims) {
  if (!row) return false;
  if (safeTrim(row.user_status).toUpperCase() !== 'ACTIVE') return false;
  if (row.revoked_at) return false;
  if (!isKnownRole(row.role_code)) return false;

  const rowRole = normalizeRoleCode(row.role_code);
  const claimsRole = normalizeRoleCode(claims.role);
  if (rowRole !== claimsRole) return false;
  if (safeTrim(row.admin_user_id) !== claims.userId) return false;
  if (safeTrim(row.session_id) !== claims.sessionId) return false;

  const expiresAtMs = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return false;

  const idleTimeoutMinutes = readPanelSessionIdleTimeoutMinutes();
  const lastSeenMs = new Date(row.last_seen_at || row.issued_at).getTime();
  if (!Number.isFinite(lastSeenMs)) return false;
  if (Date.now() - lastSeenMs > idleTimeoutMinutes * 60 * 1000) return false;

  return true;
}

async function touchSession(sessionId) {
  try {
    await query(
      `
        UPDATE admin_sessions
        SET last_seen_at = NOW(), updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [sessionId],
    );
  } catch {
    // Non-blocking touch.
  }
}

export async function getPanelIdentity(req) {
  const token = extractPanelSessionToken(req);
  if (!token) {
    return unauthenticatedIdentity();
  }

  let claims;
  try {
    claims = verifyPanelSessionToken(token);
  } catch {
    return unauthenticatedIdentity();
  }

  if (!claims.userId || !claims.sessionId || !isKnownRole(claims.role)) {
    return unauthenticatedIdentity();
  }

  const tokenHash = hashPanelSessionToken(token);
  let row;
  try {
    row = await readActiveSessionFromDb(claims, tokenHash);
  } catch {
    return unauthenticatedIdentity();
  }
  if (!isSessionValid(row, claims)) {
    return unauthenticatedIdentity();
  }

  await touchSession(claims.sessionId);

  const otpVerified = Boolean(claims.mfaVerified);

  return {
    authenticated: true,
    role: normalizeRoleCode(claims.role),
    roles: [normalizeRoleCode(claims.role)],
    keyId: `usr_${claims.userId.slice(0, 8)}`,
    userId: claims.userId,
    email: safeTrim(row.email).toLowerCase(),
    fullName: safeTrim(row.full_name),
    sessionId: claims.sessionId,
    mfaVerified: otpVerified,
    otpVerified,
    passwordResetRequired: Boolean(row.password_reset_required),
  };
}

export async function requireRole(req, allowedRoles) {
  const identity = await getPanelIdentity(req);
  if (!identity.authenticated) {
    throw new HttpError(401, 'Panel authentication is required.', 'panel_unauthorized');
  }
  if (readRequireOtpFlag() && !identity.mfaVerified) {
    throw new HttpError(403, 'OTP verification is required.', 'panel_otp_required');
  }
  if (identity.passwordResetRequired) {
    throw new HttpError(403, 'Password reset is required before accessing panel resources.', 'panel_password_reset_required');
  }
  if (!hasAllowedRole(identity.role, allowedRoles)) {
    throw new HttpError(403, 'You are not authorized for this action.', 'forbidden');
  }
  return identity;
}
