// AUTO-GENERATED FROM packages/shared/backend. DO NOT EDIT DIRECTLY.
import { query } from './db.js';
import { PANEL_PERMISSIONS, ROLES } from './constants.js';
import { HttpError } from './errors.js';
import { safeTrim } from './http.js';
import {
  extractPanelSessionToken,
  hashPanelSessionToken,
  readPanelSessionIdleTimeoutMinutes,
  verifyPanelSessionToken,
} from './panelSession.js';

const ROLE_PERMISSION_DEFAULTS = {
  [ROLES.SUPER_ADMIN]: PANEL_PERMISSIONS,
  [ROLES.OPERATIONS]: [
    'PANEL_DASHBOARD_READ',
    'PANEL_CANDIDATES_READ',
    'PANEL_CANDIDATES_EXPORT',
    'PANEL_CANDIDATES_ACTION',
    'PANEL_NOTIFICATIONS_READ',
    'PANEL_NOTIFICATIONS_ACTION',
    'PANEL_UNVIEWED_READ',
    'PANEL_UNVIEWED_ACTION',
    'PANEL_DLQ_READ',
    'PANEL_DLQ_ACTION',
    'PANEL_SETTINGS_READ',
    'PANEL_AUDIT_READ',
    'PANEL_AUDIT_EXPORT',
    'PANEL_RESULTS_REVIEW',
    'PANEL_CRM_PUSH',
    'PANEL_IP_POLICY_READ',
  ],
  [ROLES.READ_ONLY]: [
    'PANEL_DASHBOARD_READ',
    'PANEL_CANDIDATES_READ',
    'PANEL_CANDIDATES_EXPORT',
    'PANEL_NOTIFICATIONS_READ',
    'PANEL_UNVIEWED_READ',
    'PANEL_DLQ_READ',
    'PANEL_SETTINGS_READ',
    'PANEL_AUDIT_READ',
    'PANEL_AUDIT_EXPORT',
    'PANEL_RESULTS_REVIEW',
    'PANEL_IP_POLICY_READ',
  ],
};

function hasAllowedRole(role, allowed) {
  if (!role) return false;
  const normalizedRole = normalizeRoleCode(role);
  return allowed.map((item) => normalizeRoleCode(item)).includes(normalizedRole);
}

function normalizePermissionCode(permission) {
  return safeTrim(permission).toUpperCase();
}

function normalizePermissionCodes(permissions) {
  if (!Array.isArray(permissions)) return [];
  const seen = new Set();
  const normalized = [];
  for (const permission of permissions) {
    const code = normalizePermissionCode(permission);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    normalized.push(code);
  }
  return normalized;
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

function defaultPermissionsForRole(role) {
  const normalizedRole = normalizeRoleCode(role);
  return normalizePermissionCodes(ROLE_PERMISSION_DEFAULTS[normalizedRole] || []);
}

function isMissingRelationError(error) {
  const code = safeTrim(error?.code);
  return code === '42P01' || code === '42703';
}

async function readRolePermissions(role) {
  const normalizedRole = normalizeRoleCode(role);
  if (!normalizedRole) return [];

  try {
    const result = await query(
      `
        SELECT p.code
        FROM role_permissions rp
        JOIN roles r ON r.id = rp.role_id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE r.code = $1
        ORDER BY p.code ASC
      `,
      [normalizedRole],
    );

    if (!Array.isArray(result.rows) || result.rows.length === 0) {
      return defaultPermissionsForRole(normalizedRole);
    }

    return normalizePermissionCodes(result.rows.map((row) => row.code));
  } catch (error) {
    if (isMissingRelationError(error)) {
      return defaultPermissionsForRole(normalizedRole);
    }
    throw error;
  }
}

function normalizeIpLiteral(ip) {
  const raw = safeTrim(ip).toLowerCase();
  if (!raw) return '';

  if (raw.startsWith('::ffff:')) {
    return raw.slice(7);
  }

  if (raw.startsWith('[') && raw.includes(']')) {
    return raw.slice(1, raw.indexOf(']'));
  }

  const ipv4WithPort = raw.match(/^(\d+\.\d+\.\d+\.\d+):(\d+)$/);
  if (ipv4WithPort) {
    return ipv4WithPort[1];
  }

  return raw;
}

function extractRequestIp(req) {
  const forwarded = safeTrim(req?.headers?.['x-forwarded-for']);
  if (forwarded) {
    return normalizeIpLiteral(forwarded.split(',')[0]);
  }
  return normalizeIpLiteral(req?.socket?.remoteAddress || '');
}

function normalizeIpAllowlist(allowedIps) {
  if (!Array.isArray(allowedIps)) return [];
  const seen = new Set();
  const values = [];
  for (const entry of allowedIps) {
    const normalized = normalizeIpLiteral(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
  }
  return values;
}

async function readRoleIpPolicy(role) {
  const normalizedRole = normalizeRoleCode(role);
  if (!normalizedRole) return null;

  try {
    const result = await query(
      `
        SELECT
          role_code,
          is_enabled,
          allowed_ips
        FROM admin_ip_policies
        WHERE role_code = $1
        LIMIT 1
      `,
      [normalizedRole],
    );
    return result.rows[0] || null;
  } catch (error) {
    if (isMissingRelationError(error)) {
      return null;
    }
    throw error;
  }
}

async function enforceRoleIpPolicy(req, role) {
  const policy = await readRoleIpPolicy(role);
  if (!policy || !policy.is_enabled) {
    return;
  }

  const requestIp = extractRequestIp(req);
  const allowedIps = normalizeIpAllowlist(policy.allowed_ips);
  if (!requestIp || allowedIps.length === 0) {
    throw new HttpError(403, 'This role requires an allowed IP address.', 'panel_ip_restricted');
  }

  if (!allowedIps.includes(requestIp)) {
    throw new HttpError(403, 'Your IP is not allowed for this role.', 'panel_ip_restricted');
  }
}

function hasRequiredPermissions(identityPermissions, requiredPermissions) {
  const normalizedRequired = normalizePermissionCodes(requiredPermissions);
  if (normalizedRequired.length === 0) return true;

  const permissionSet = new Set(normalizePermissionCodes(identityPermissions));
  return normalizedRequired.every((permission) => permissionSet.has(permission));
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
    permissions: [],
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

  const normalizedRole = normalizeRoleCode(claims.role);
  let permissions;
  try {
    permissions = await readRolePermissions(normalizedRole);
  } catch {
    permissions = defaultPermissionsForRole(normalizedRole);
  }

  const otpVerified = Boolean(claims.mfaVerified);

  return {
    authenticated: true,
    role: normalizedRole,
    roles: [normalizedRole],
    permissions,
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

export function identityHasPermissions(identity, requiredPermissions) {
  return hasRequiredPermissions(identity?.permissions || [], requiredPermissions);
}

export async function requireRole(req, allowedRoles, requiredPermissions = []) {
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

  await enforceRoleIpPolicy(req, identity.role);

  if (!hasRequiredPermissions(identity.permissions, requiredPermissions)) {
    throw new HttpError(403, 'You do not have the required permission for this action.', 'forbidden_permission');
  }

  return identity;
}

export async function requirePermission(req, allowedRoles, requiredPermissions) {
  return requireRole(req, allowedRoles, requiredPermissions);
}
