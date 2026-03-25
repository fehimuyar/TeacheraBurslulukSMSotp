type PreviewPanelIdentity = {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  mfa_verified: boolean;
  session_id: string;
  password_reset_required?: boolean;
};

const PANEL_PREVIEW_STORAGE_KEY = 'teachera.panel.preview.identity';

function isPreviewHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
}

export function isPanelPreviewRuntimeEnabled() {
  const envEnabled =
    typeof import.meta.env.VITE_PANEL_PREVIEW_MODE === 'string' &&
    ['1', 'true', 'yes', 'on'].includes(import.meta.env.VITE_PANEL_PREVIEW_MODE.trim().toLowerCase());

  if (envEnabled) return true;
  if (typeof window === 'undefined') return false;
  if (isPreviewHost(window.location.hostname)) return true;

  return false;
}

export function createPanelPreviewIdentity(tckn?: string): PreviewPanelIdentity {
  const normalizedTckn = String(tckn || '').replace(/\D+/g, '').slice(0, 11);
  const suffix = normalizedTckn || 'preview';

  return {
    user_id: `preview-${suffix}`,
    email: `panel-preview+${suffix}@teachera.local`,
    full_name: 'Panel Preview',
    role: 'SUPER_ADMIN',
    mfa_verified: false,
    session_id: `preview-session-${suffix}`,
    password_reset_required: false,
  };
}

export function readPanelPreviewIdentity(): PreviewPanelIdentity | null {
  if (!isPanelPreviewRuntimeEnabled() || typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(PANEL_PREVIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PreviewPanelIdentity | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.user_id || !parsed.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePanelPreviewIdentity(identity: PreviewPanelIdentity) {
  if (!isPanelPreviewRuntimeEnabled() || typeof window === 'undefined') return;
  window.sessionStorage.setItem(PANEL_PREVIEW_STORAGE_KEY, JSON.stringify(identity));
}

export function clearPanelPreviewIdentity() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(PANEL_PREVIEW_STORAGE_KEY);
}
