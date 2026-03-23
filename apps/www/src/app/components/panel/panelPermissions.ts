/* ── Panel Permission System ── */

const ROLE_NORMALIZATION_MAP: Record<string, string> = {
  ADMIN: 'OPERATIONS',
  EDUCATION_ADVISOR: 'OPERATIONS',
};

const OPERATE_ROLES = new Set(['SUPER_ADMIN', 'OPERATIONS']);
const EXPORT_ROLES = new Set(['SUPER_ADMIN', 'OPERATIONS', 'READ_ONLY']);
const SUPER_ADMIN_ROLES = new Set(['SUPER_ADMIN']);

export function normalizePanelRole(role?: string) {
  const normalized = String(role || '').trim().toUpperCase();
  if (!normalized) return '';
  return ROLE_NORMALIZATION_MAP[normalized] || normalized;
}

export function canOperatePanelActions(role?: string) {
  return OPERATE_ROLES.has(normalizePanelRole(role));
}

export function canExportPanelData(role?: string) {
  return EXPORT_ROLES.has(normalizePanelRole(role));
}

export function isReadOnlyPanelRole(role?: string) {
  return normalizePanelRole(role) === 'READ_ONLY';
}

export function isSuperAdmin(role?: string) {
  return SUPER_ADMIN_ROLES.has(normalizePanelRole(role));
}

export function canEditResults(role?: string) {
  return isSuperAdmin(role);
}

export function canManageUsers(role?: string) {
  return isSuperAdmin(role);
}

export function canManageSettings(role?: string) {
  return isSuperAdmin(role);
}

export type ModulePermission = {
  moduleId: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type PanelRole = {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: ModulePermission[];
  createdAt: string;
};

export const PANEL_MODULES = [
  { id: 'home', label: 'Anasayfa' },
  { id: 'applications', label: 'Başvurular' },
  { id: 'scholarship', label: 'Bursluluk Adayları' },
  { id: 'results', label: 'Sonuç & Burs' },
  { id: 'operations', label: 'Operasyon Merkezi' },
  { id: 'reports', label: 'Raporlar' },
  { id: 'exam-builder', label: 'Sınav Oluşturma' },
  { id: 'system-status', label: 'Sistem Durumu' },
  { id: 'users', label: 'Kullanıcı & Yetki' },
  { id: 'appointments', label: 'Randevu & Danışman' },
] as const;

export function canManageAppointments(role?: string) {
  return canOperatePanelActions(role);
}

export function canViewModule(role: string | undefined, moduleId: string): boolean {
  const normalized = normalizePanelRole(role);
  if (normalized === 'SUPER_ADMIN') return true;
  if (moduleId === 'users') return isSuperAdmin(role);
  if (moduleId === 'results') return isSuperAdmin(role) || normalized === 'OPERATIONS';
  return true;
}
