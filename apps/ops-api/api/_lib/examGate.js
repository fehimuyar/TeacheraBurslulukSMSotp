// AUTO-GENERATED FROM packages/shared/backend. DO NOT EDIT DIRECTLY.
import { query } from './db.js';
import { safeTrim } from './http.js';

const GATE_FORCE_OPEN_KEY = 'bursluluk.exam_force_open';
const GATE_OPEN_AT_KEY = 'bursluluk.exam_open_at';

function parseBooleanLike(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return null;
  const normalized = safeTrim(value).toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function parseDateLike(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value === 'number') {
    const candidate = new Date(value);
    return Number.isFinite(candidate.getTime()) ? candidate.toISOString() : null;
  }
  if (typeof value !== 'string') return null;
  const normalized = safeTrim(value);
  if (!normalized) return null;
  const candidate = new Date(normalized);
  return Number.isFinite(candidate.getTime()) ? candidate.toISOString() : null;
}

function readStringFromValue(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  for (const key of keys) {
    const candidate = safeTrim(value[key]);
    if (candidate) return candidate;
  }
  return '';
}

function extractForceOpen(raw) {
  if (raw === null || raw === undefined) return null;
  const direct = parseBooleanLike(raw);
  if (direct !== null) return direct;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const nested = [
      raw.enabled,
      raw.force_open,
      raw.forceOpen,
      raw.value,
    ];
    for (const value of nested) {
      const parsed = parseBooleanLike(value);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function extractOpenAt(raw) {
  if (raw === null || raw === undefined) return null;
  const direct = parseDateLike(raw);
  if (direct) return direct;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const nestedValue = readStringFromValue(raw, ['open_at', 'openAt', 'value', 'at', 'datetime']);
    const nested = parseDateLike(nestedValue);
    if (nested) return nested;
  }
  return null;
}

function readEnvOpenAt() {
  const candidates = [
    safeTrim(process.env.BURSLULUK_EXAM_OPEN_AT),
    safeTrim(process.env.EXAM_OPEN_AT),
  ].filter(Boolean);

  for (const value of candidates) {
    const parsed = parseDateLike(value);
    if (parsed) return parsed;
  }
  return null;
}

function readEnvForceOpen() {
  const candidates = [
    process.env.BURSLULUK_EXAM_FORCE_OPEN,
    process.env.EXAM_FORCE_OPEN,
  ];
  for (const value of candidates) {
    const parsed = parseBooleanLike(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function buildSettingKeys() {
  return [GATE_FORCE_OPEN_KEY, GATE_OPEN_AT_KEY];
}

function readSettingValue(rows, key) {
  const match = rows.find((row) => row.key === key);
  return match ? match.value : null;
}

function resolveGateFromSettings(rows) {
  const forceCandidates = [GATE_FORCE_OPEN_KEY];
  const openAtCandidates = [GATE_OPEN_AT_KEY];

  let forceOpen = null;
  let forceOpenSource = '';
  for (const key of forceCandidates) {
    const parsed = extractForceOpen(readSettingValue(rows, key));
    if (parsed === null) continue;
    forceOpen = parsed;
    forceOpenSource = `app_settings:${key}`;
    break;
  }

  let openAt = null;
  let openAtSource = '';
  for (const key of openAtCandidates) {
    const parsed = extractOpenAt(readSettingValue(rows, key));
    if (!parsed) continue;
    openAt = parsed;
    openAtSource = `app_settings:${key}`;
    break;
  }

  return {
    forceOpen,
    forceOpenSource,
    openAt,
    openAtSource,
  };
}

export async function resolveExamGateStatus(campaignCode = '') {
  const settingKeys = buildSettingKeys();
  const { rows } = await query(
    `
      SELECT key, value
      FROM app_settings
      WHERE key = ANY($1::text[])
    `,
    [settingKeys],
  );

  const fromSettings = resolveGateFromSettings(rows);
  const envForceOpen = readEnvForceOpen();
  const envOpenAt = readEnvOpenAt();

  const forceOpen = fromSettings.forceOpen ?? envForceOpen ?? false;
  const openAt = fromSettings.openAt || envOpenAt || null;
  const now = new Date();
  const openAtMs = openAt ? Number(new Date(openAt)) : NaN;

  const examOpen = forceOpen || !openAt || (Number.isFinite(openAtMs) ? now.getTime() >= openAtMs : true);
  const remainingSeconds = !examOpen && Number.isFinite(openAtMs)
    ? Math.max(0, Math.ceil((openAtMs - now.getTime()) / 1000))
    : 0;

  const source = forceOpen
    ? (fromSettings.forceOpenSource || (envForceOpen !== null ? 'env:EXAM_FORCE_OPEN' : 'default:force'))
    : (fromSettings.openAtSource || (envOpenAt ? 'env:EXAM_OPEN_AT' : 'default:open'));

  return {
    exam_open: examOpen,
    exam_open_at: openAt,
    exam_force_open: forceOpen,
    server_time_utc: now.toISOString(),
    remaining_seconds: remainingSeconds,
    source,
  };
}
