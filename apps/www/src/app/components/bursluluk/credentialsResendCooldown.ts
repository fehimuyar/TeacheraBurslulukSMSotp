const STORAGE_KEY_PREFIX = 'teachera_bursluluk_credentials_resend_cooldown_v1';

export const CREDENTIALS_RESEND_COOLDOWN_SECONDS = 60;

function buildStorageKey(applicationNo: string) {
  return `${STORAGE_KEY_PREFIX}:${String(applicationNo || '').trim().toUpperCase()}`;
}

function readStorageValue(key: string) {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeStorageValue(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function removeStorageValue(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

export function getCredentialsResendCooldownUntil(applicationNo: string) {
  const key = buildStorageKey(applicationNo);
  const raw = readStorageValue(key);
  if (!raw) return 0;

  const timestamp = Number(raw);
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
    removeStorageValue(key);
    return 0;
  }

  return timestamp;
}

export function getCredentialsResendRemainingSeconds(applicationNo: string) {
  const until = getCredentialsResendCooldownUntil(applicationNo);
  if (!until) return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

export function startCredentialsResendCooldown(
  applicationNo: string,
  seconds = CREDENTIALS_RESEND_COOLDOWN_SECONDS,
) {
  const safeSeconds = Math.max(1, Math.trunc(seconds || CREDENTIALS_RESEND_COOLDOWN_SECONDS));
  const until = Date.now() + safeSeconds * 1000;
  writeStorageValue(buildStorageKey(applicationNo), String(until));
  return until;
}
