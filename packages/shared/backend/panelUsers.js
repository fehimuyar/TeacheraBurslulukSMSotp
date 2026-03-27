import { PANEL_PERMISSIONS, ROLES } from './constants.js';
import { safeTrim } from './http.js';

const ROLE_NORMALIZATION_MAP = {
  ADMIN: ROLES.OPERATIONS,
  EDUCATION_ADVISOR: ROLES.OPERATIONS,
  ADVISOR: ROLES.OPERATIONS,
  TEACHER: ROLES.OPERATIONS,
  DANISMAN: ROLES.OPERATIONS,
  OGRETMEN: ROLES.OPERATIONS,
  MANAGER: ROLES.SUPER_ADMIN,
  UST_YONETICI: ROLES.SUPER_ADMIN,
  OWNER: ROLES.SUPER_ADMIN,
  USER: ROLES.READ_ONLY,
  KULLANICI: ROLES.READ_ONLY,
};

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

export const SYSTEM_ROLE_CODES = [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY];
const KNOWN_PANEL_PERMISSION_SET = new Set(PANEL_PERMISSIONS.map((code) => safeTrim(code).toUpperCase()));

export function normalizeRoleCode(role) {
  const normalized = safeTrim(role).toUpperCase();
  if (!normalized) return '';
  return ROLE_NORMALIZATION_MAP[normalized] || normalized;
}

export function normalizeRoleCodes(values) {
  const seen = new Set();
  const result = [];
  for (const entry of Array.isArray(values) ? values : []) {
    const normalized = normalizeRoleCode(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function normalizeEmail(value) {
  return safeTrim(value).toLowerCase();
}

export function normalizeTckn(value) {
  return String(value || '').replace(/\D+/g, '').slice(0, 11);
}

export function normalizePhoneE164(value) {
  const raw = safeTrim(value);
  if (!raw) return '';
  const compact = raw.replace(/[\s\-().]/g, '');
  let normalized = compact;
  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  } else if (normalized.startsWith('0') && normalized.length === 11) {
    normalized = `+90${normalized.slice(1)}`;
  } else if (!normalized.startsWith('+') && normalized.length === 10) {
    normalized = `+90${normalized}`;
  } else if (!normalized.startsWith('+')) {
    normalized = `+${normalized}`;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    return '';
  }
  return normalized;
}

export function fallbackRoleName(roleCode) {
  const normalized = normalizeRoleCode(roleCode);
  if (normalized === ROLES.SUPER_ADMIN) return 'Super Admin';
  if (normalized === ROLES.OPERATIONS) return 'Operations';
  if (normalized === ROLES.READ_ONLY) return 'Read Only';
  return normalized || 'Tanimsiz';
}

export function roleSortValue(roleCode) {
  const normalized = normalizeRoleCode(roleCode);
  if (normalized === ROLES.SUPER_ADMIN) return 0;
  if (normalized === ROLES.OPERATIONS) return 1;
  if (normalized === ROLES.READ_ONLY) return 2;
  return 10;
}

export function isSystemRoleCode(roleCode) {
  return SYSTEM_ROLE_CODES.includes(normalizeRoleCode(roleCode));
}

export function buildDefaultPermissionCodes(roleCode) {
  const normalized = normalizeRoleCode(roleCode);
  const values = Array.isArray(ROLE_PERMISSION_DEFAULTS[normalized]) ? ROLE_PERMISSION_DEFAULTS[normalized] : [];
  return Array.from(new Set(values.map((item) => safeTrim(item).toUpperCase()).filter(Boolean)));
}

export function normalizePermissionCodes(values) {
  const seen = new Set();
  const result = [];
  for (const entry of Array.isArray(values) ? values : []) {
    const normalized = safeTrim(entry).toUpperCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function normalizeKnownPermissionCodes(values) {
  return normalizePermissionCodes(values).filter((code) => KNOWN_PANEL_PERMISSION_SET.has(code));
}

export function buildRoleCodeSeed(value) {
  const transliterated = safeTrim(value)
    .replace(/[ıİ]/g, 'I')
    .replace(/[ğĞ]/g, 'G')
    .replace(/[üÜ]/g, 'U')
    .replace(/[şŞ]/g, 'S')
    .replace(/[öÖ]/g, 'O')
    .replace(/[çÇ]/g, 'C');

  return transliterated
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 48);
}

export function isMissingRelationError(error) {
  const code = safeTrim(error?.code);
  return code === '42P01' || code === '42703';
}

export async function readAdminUserColumnAvailability(client) {
  const result = await client.query(
    `
      SELECT
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'admin_users'
            AND column_name = 'tckn'
        ) AS has_tckn,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'admin_users'
            AND column_name = 'phone_e164'
        ) AS has_phone_e164,
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
        ) AS has_password_updated_at,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'admin_users'
            AND column_name = 'mfa_enabled'
        ) AS has_mfa_enabled,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'admin_users'
            AND column_name = 'mfa_totp_secret'
        ) AS has_mfa_totp_secret
    `,
  );

  return {
    hasTckn: Boolean(result.rows[0]?.has_tckn),
    hasPhoneE164: Boolean(result.rows[0]?.has_phone_e164),
    hasPasswordResetRequired: Boolean(result.rows[0]?.has_password_reset_required),
    hasPasswordUpdatedAt: Boolean(result.rows[0]?.has_password_updated_at),
    hasMfaEnabled: Boolean(result.rows[0]?.has_mfa_enabled),
    hasMfaTotpSecret: Boolean(result.rows[0]?.has_mfa_totp_secret),
  };
}

export async function readRoleColumnAvailability(client) {
  const result = await client.query(
    `
      SELECT
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'roles'
            AND column_name = 'description'
        ) AS has_description
    `,
  );

  return {
    hasDescription: Boolean(result.rows[0]?.has_description),
  };
}
