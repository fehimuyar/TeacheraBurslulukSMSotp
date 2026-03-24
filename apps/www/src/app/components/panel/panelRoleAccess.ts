export const PANEL_PERMISSION = {
  DASHBOARD_READ: 'PANEL_DASHBOARD_READ',
  CANDIDATES_READ: 'PANEL_CANDIDATES_READ',
  CANDIDATES_EXPORT: 'PANEL_CANDIDATES_EXPORT',
  CANDIDATES_ACTION: 'PANEL_CANDIDATES_ACTION',
  NOTIFICATIONS_READ: 'PANEL_NOTIFICATIONS_READ',
  NOTIFICATIONS_ACTION: 'PANEL_NOTIFICATIONS_ACTION',
  UNVIEWED_READ: 'PANEL_UNVIEWED_READ',
  UNVIEWED_ACTION: 'PANEL_UNVIEWED_ACTION',
  DLQ_READ: 'PANEL_DLQ_READ',
  DLQ_ACTION: 'PANEL_DLQ_ACTION',
  SETTINGS_READ: 'PANEL_SETTINGS_READ',
  SETTINGS_WRITE: 'PANEL_SETTINGS_WRITE',
  AUDIT_READ: 'PANEL_AUDIT_READ',
  AUDIT_EXPORT: 'PANEL_AUDIT_EXPORT',
  RESULTS_REVIEW: 'PANEL_RESULTS_REVIEW',
  RESULTS_OVERRIDE: 'PANEL_RESULTS_OVERRIDE',
  RESULTS_PUBLISH: 'PANEL_RESULTS_PUBLISH',
  CRM_PUSH: 'PANEL_CRM_PUSH',
  IP_POLICY_READ: 'PANEL_IP_POLICY_READ',
  IP_POLICY_WRITE: 'PANEL_IP_POLICY_WRITE',
} as const;

type PanelPermission = (typeof PANEL_PERMISSION)[keyof typeof PANEL_PERMISSION];

const ROLE_NORMALIZATION_MAP: Record<string, string> = {
  ADMIN: 'OPERATIONS',
  EDUCATION_ADVISOR: 'OPERATIONS',
  ADVISOR: 'OPERATIONS',
  TEACHER: 'OPERATIONS',
  DANISMAN: 'OPERATIONS',
  OGRETMEN: 'OPERATIONS',
  MANAGER: 'SUPER_ADMIN',
  UST_YONETICI: 'SUPER_ADMIN',
  OWNER: 'SUPER_ADMIN',
  USER: 'READ_ONLY',
  KULLANICI: 'READ_ONLY',
};

const ROLE_LABEL_MAP: Record<string, string> = {
  SUPER_ADMIN: 'Ust Yonetici',
  OPERATIONS: 'Danisman (Ogretmen)',
  READ_ONLY: 'Izleyici (Read-only)',
};

const ROLE_PERMISSION_FALLBACK: Record<string, PanelPermission[]> = {
  SUPER_ADMIN: Object.values(PANEL_PERMISSION),
  OPERATIONS: [
    PANEL_PERMISSION.DASHBOARD_READ,
    PANEL_PERMISSION.CANDIDATES_READ,
    PANEL_PERMISSION.CANDIDATES_EXPORT,
    PANEL_PERMISSION.CANDIDATES_ACTION,
    PANEL_PERMISSION.NOTIFICATIONS_READ,
    PANEL_PERMISSION.NOTIFICATIONS_ACTION,
    PANEL_PERMISSION.UNVIEWED_READ,
    PANEL_PERMISSION.UNVIEWED_ACTION,
    PANEL_PERMISSION.DLQ_READ,
    PANEL_PERMISSION.DLQ_ACTION,
    PANEL_PERMISSION.SETTINGS_READ,
    PANEL_PERMISSION.AUDIT_READ,
    PANEL_PERMISSION.AUDIT_EXPORT,
    PANEL_PERMISSION.RESULTS_REVIEW,
    PANEL_PERMISSION.CRM_PUSH,
    PANEL_PERMISSION.IP_POLICY_READ,
  ],
  READ_ONLY: [
    PANEL_PERMISSION.DASHBOARD_READ,
    PANEL_PERMISSION.CANDIDATES_READ,
    PANEL_PERMISSION.CANDIDATES_EXPORT,
    PANEL_PERMISSION.NOTIFICATIONS_READ,
    PANEL_PERMISSION.UNVIEWED_READ,
    PANEL_PERMISSION.DLQ_READ,
    PANEL_PERMISSION.SETTINGS_READ,
    PANEL_PERMISSION.AUDIT_READ,
    PANEL_PERMISSION.AUDIT_EXPORT,
    PANEL_PERMISSION.RESULTS_REVIEW,
    PANEL_PERMISSION.IP_POLICY_READ,
  ],
};

function normalizePermission(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

export function normalizePanelPermissions(permissions?: string[]) {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const entry of Array.isArray(permissions) ? permissions : []) {
    const normalized = normalizePermission(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
  }
  return values;
}

export function normalizePanelRole(role?: string) {
  const normalized = String(role || '')
    .trim()
    .toUpperCase();
  if (!normalized) return '';
  return ROLE_NORMALIZATION_MAP[normalized] || normalized;
}

export function resolvePanelRoleLabel(role?: string) {
  const normalized = normalizePanelRole(role);
  return ROLE_LABEL_MAP[normalized] || normalized || '-';
}

function roleFallbackPermissionSet(role?: string) {
  return new Set(normalizePanelPermissions(ROLE_PERMISSION_FALLBACK[normalizePanelRole(role)] || []));
}

function permissionSet(role?: string, permissions?: string[]) {
  const normalizedPermissions = normalizePanelPermissions(permissions);
  if (normalizedPermissions.length > 0) {
    return new Set(normalizedPermissions);
  }
  return roleFallbackPermissionSet(role);
}

export function hasPanelPermission(permission: PanelPermission, role?: string, permissions?: string[]) {
  return permissionSet(role, permissions).has(permission);
}

export function hasAnyPanelPermission(required: PanelPermission[], role?: string, permissions?: string[]) {
  const set = permissionSet(role, permissions);
  return required.some((item) => set.has(item));
}

export function canReadDashboard(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.DASHBOARD_READ, role, permissions);
}

export function canReadCandidates(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.CANDIDATES_READ, role, permissions);
}

export function canOperatePanelActions(role?: string, permissions?: string[]) {
  return hasAnyPanelPermission(
    [
      PANEL_PERMISSION.CANDIDATES_ACTION,
      PANEL_PERMISSION.NOTIFICATIONS_ACTION,
      PANEL_PERMISSION.UNVIEWED_ACTION,
      PANEL_PERMISSION.DLQ_ACTION,
    ],
    role,
    permissions,
  );
}

export function canExportPanelData(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.CANDIDATES_EXPORT, role, permissions);
}

export function canReadNotifications(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.NOTIFICATIONS_READ, role, permissions);
}

export function canOperateNotifications(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.NOTIFICATIONS_ACTION, role, permissions);
}

export function canReadUnviewed(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.UNVIEWED_READ, role, permissions);
}

export function canOperateUnviewed(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.UNVIEWED_ACTION, role, permissions);
}

export function canReadDlq(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.DLQ_READ, role, permissions);
}

export function canOperateDlq(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.DLQ_ACTION, role, permissions);
}

export function canReadSettings(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.SETTINGS_READ, role, permissions);
}

export function canWriteSettings(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.SETTINGS_WRITE, role, permissions);
}

export function canReadAudit(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.AUDIT_READ, role, permissions);
}

export function canExportAudit(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.AUDIT_EXPORT, role, permissions);
}

export function canReadIpPolicy(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.IP_POLICY_READ, role, permissions);
}

export function canWriteIpPolicy(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.IP_POLICY_WRITE, role, permissions);
}

export function canReviewResults(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.RESULTS_REVIEW, role, permissions);
}

export function canOverrideResults(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.RESULTS_OVERRIDE, role, permissions);
}

export function canPublishResults(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.RESULTS_PUBLISH, role, permissions);
}

export function canPushCrm(role?: string, permissions?: string[]) {
  return hasPanelPermission(PANEL_PERMISSION.CRM_PUSH, role, permissions);
}

export function isReadOnlyPanelRole(role?: string) {
  return normalizePanelRole(role) === 'READ_ONLY';
}
