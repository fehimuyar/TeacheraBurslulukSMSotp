import { query } from './db.js';
import { safeTrim } from './http.js';

const CAMPAIGN_CODE_SETTING_KEY = 'bursluluk.campaign.code';
const GATE_FORCE_OPEN_KEY = 'bursluluk.exam_force_open';
const GATE_OPEN_AT_KEY = 'bursluluk.exam_open_at';
const CREDENTIALS_SMS_TEMPLATE_CODES = ['CREDENTIALS_SMS', 'LOGIN_CREDENTIALS'];

const RELEASE_GATE_CONFIG_KEYS = {
  enabled: 'bursluluk.release_gate.enabled',
  smsLookbackHours: 'bursluluk.release_gate.sms.lookback_hours',
  smsMinJobs: 'bursluluk.release_gate.sms.min_jobs',
  smsMinSuccessRate: 'bursluluk.release_gate.sms.min_success_rate',
  smsMaxFailedRate: 'bursluluk.release_gate.sms.max_failed_rate',
  smsMaxStuckJobs: 'bursluluk.release_gate.sms.max_stuck_jobs',
  smsStuckMinutes: 'bursluluk.release_gate.sms.stuck_minutes',
  panelLookbackHours: 'bursluluk.release_gate.panel.lookback_hours',
  panelMinWriteActions: 'bursluluk.release_gate.panel.min_write_actions',
  panelMinDomains: 'bursluluk.release_gate.panel.min_domains',
  panelRequireSettingsUpdate: 'bursluluk.release_gate.panel.require_settings_update',
};

function parseBooleanLike(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = safeTrim(value).toLowerCase();
    if (!normalized) return fallback;
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const nested = [value.enabled, value.value, value.active, value.open, value.force_open, value.forceOpen];
    for (const item of nested) {
      const parsed = parseBooleanLike(item, null);
      if (parsed !== null) return parsed;
    }
  }
  return fallback;
}

function parseNumberLike(value, fallback, { min, max } = {}) {
  let candidate = null;
  if (typeof value === 'number') {
    candidate = value;
  } else if (typeof value === 'string') {
    const normalized = safeTrim(value);
    if (normalized) candidate = Number(normalized);
  } else if (value && typeof value === 'object' && !Array.isArray(value)) {
    candidate = parseNumberLike(value.value, null, {});
  }

  if (!Number.isFinite(candidate)) return fallback;
  let bounded = Number(candidate);
  if (Number.isFinite(min)) bounded = Math.max(min, bounded);
  if (Number.isFinite(max)) bounded = Math.min(max, bounded);
  return bounded;
}

function parseDateLike(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value === 'number') {
    const candidate = new Date(value);
    return Number.isFinite(candidate.getTime()) ? candidate.toISOString() : null;
  }
  if (typeof value === 'string') {
    const normalized = safeTrim(value);
    if (!normalized) return null;
    const candidate = new Date(normalized);
    return Number.isFinite(candidate.getTime()) ? candidate.toISOString() : null;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const nested = [value.open_at, value.openAt, value.value, value.at, value.datetime];
    for (const item of nested) {
      const parsed = parseDateLike(item);
      if (parsed) return parsed;
    }
  }
  return null;
}

function readStringLike(value) {
  if (typeof value === 'string') return safeTrim(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const nested = [value.value, value.code, value.campaign_code, value.campaignCode];
    for (const item of nested) {
      const candidate = readStringLike(item);
      if (candidate) return candidate;
    }
  }
  return '';
}

function normalizeCampaignCode(value) {
  return safeTrim(value).slice(0, 120);
}

function normalizeActivationKey(key) {
  return safeTrim(key).toLowerCase();
}

function isExamForceOpenKey(key) {
  return key === GATE_FORCE_OPEN_KEY;
}

function isExamOpenAtKey(key) {
  return key === GATE_OPEN_AT_KEY;
}

function rate(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.min(1, normalized));
}

function toFixedPercent(value) {
  return Number((rate(value) * 100).toFixed(2));
}

function readConfigValue(settingsMap, key) {
  return settingsMap[key];
}

function buildReleaseGateConfig(settingsMap = {}) {
  return {
    enabled: parseBooleanLike(readConfigValue(settingsMap, RELEASE_GATE_CONFIG_KEYS.enabled), true),
    smsLookbackHours: parseNumberLike(readConfigValue(settingsMap, RELEASE_GATE_CONFIG_KEYS.smsLookbackHours), 24, { min: 1, max: 720 }),
    smsMinJobs: parseNumberLike(readConfigValue(settingsMap, RELEASE_GATE_CONFIG_KEYS.smsMinJobs), 5, { min: 0, max: 50000 }),
    smsMinSuccessRate: rate(parseNumberLike(readConfigValue(settingsMap, RELEASE_GATE_CONFIG_KEYS.smsMinSuccessRate), 0.7, { min: 0, max: 1 })),
    smsMaxFailedRate: rate(parseNumberLike(readConfigValue(settingsMap, RELEASE_GATE_CONFIG_KEYS.smsMaxFailedRate), 0.2, { min: 0, max: 1 })),
    smsMaxStuckJobs: parseNumberLike(readConfigValue(settingsMap, RELEASE_GATE_CONFIG_KEYS.smsMaxStuckJobs), 0, { min: 0, max: 50000 }),
    smsStuckMinutes: parseNumberLike(readConfigValue(settingsMap, RELEASE_GATE_CONFIG_KEYS.smsStuckMinutes), 30, { min: 1, max: 1440 }),
    panelLookbackHours: parseNumberLike(readConfigValue(settingsMap, RELEASE_GATE_CONFIG_KEYS.panelLookbackHours), 24, { min: 1, max: 720 }),
    panelMinWriteActions: parseNumberLike(readConfigValue(settingsMap, RELEASE_GATE_CONFIG_KEYS.panelMinWriteActions), 3, {
      min: 0,
      max: 50000,
    }),
    panelMinDomains: parseNumberLike(readConfigValue(settingsMap, RELEASE_GATE_CONFIG_KEYS.panelMinDomains), 2, { min: 1, max: 10 }),
    panelRequireSettingsUpdate: parseBooleanLike(
      readConfigValue(settingsMap, RELEASE_GATE_CONFIG_KEYS.panelRequireSettingsUpdate),
      true,
    ),
  };
}

async function readReleaseGateSettingsMap() {
  const keys = [CAMPAIGN_CODE_SETTING_KEY, ...Object.values(RELEASE_GATE_CONFIG_KEYS)];
  const { rows } = await query(
    `
      SELECT key, value
      FROM app_settings
      WHERE key = ANY($1::text[])
    `,
    [keys],
  );

  const result = {};
  for (const row of rows) {
    if (!row?.key) continue;
    result[row.key] = row.value;
  }
  return result;
}

export function resolveReleaseGateActivationIntent(items) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const activatedKeys = [];
  const issues = [];
  let activationRequested = false;
  let campaignCode = '';

  for (const item of normalizedItems) {
    const key = normalizeActivationKey(item?.key);
    if (!key) continue;

    if (!campaignCode && key === CAMPAIGN_CODE_SETTING_KEY) {
      campaignCode = normalizeCampaignCode(readStringLike(item?.value));
    }

    if (isExamForceOpenKey(key)) {
      const forceOpen = parseBooleanLike(item?.value, null);
      if (forceOpen === true) {
        activationRequested = true;
        activatedKeys.push(key);
      }
      continue;
    }

    if (isExamOpenAtKey(key)) {
      const openAt = parseDateLike(item?.value);
      if (!openAt) {
        issues.push({
          key,
          issue: 'invalid_datetime',
        });
        continue;
      }
      activationRequested = true;
      activatedKeys.push(key);
    }
  }

  return {
    activationRequested,
    campaignCode,
    activatedKeys: Array.from(new Set(activatedKeys)),
    issues,
  };
}

export async function resolveReleaseGateCampaignCode(preferred = '') {
  const direct = normalizeCampaignCode(preferred);
  if (direct) return direct;

  const { rows } = await query(
    `
      SELECT value
      FROM app_settings
      WHERE key = $1
      LIMIT 1
    `,
    [CAMPAIGN_CODE_SETTING_KEY],
  );

  const fromSettings = normalizeCampaignCode(readStringLike(rows[0]?.value));
  return fromSettings;
}

async function evaluateSmsCredentialsFlow(config, campaignCode) {
  const { rows } = await query(
    `
      WITH sms_jobs AS (
        SELECT
          status,
          created_at
        FROM notification_jobs
        WHERE channel = 'SMS'
          AND UPPER(COALESCE(template_code, '')) = ANY($1::text[])
          AND created_at >= NOW() - make_interval(hours => $2::int)
          AND ($3::text = '' OR campaign_code = $3)
      )
      SELECT
        COUNT(*)::int AS total_jobs,
        COUNT(*) FILTER (WHERE status IN ('SENT', 'DELIVERED', 'READ'))::int AS success_jobs,
        COUNT(*) FILTER (WHERE status IN ('FAILED', 'DLQ', 'CANCELLED'))::int AS failed_jobs,
        COUNT(*) FILTER (
          WHERE status IN ('QUEUED', 'RETRYING')
            AND created_at <= NOW() - make_interval(mins => $4::int)
        )::int AS stuck_jobs,
        MAX(created_at) AS last_job_at
      FROM sms_jobs
    `,
    [CREDENTIALS_SMS_TEMPLATE_CODES, config.smsLookbackHours, campaignCode, config.smsStuckMinutes],
  );

  const row = rows[0] || {};
  const totalJobs = Number(row.total_jobs || 0);
  const successJobs = Number(row.success_jobs || 0);
  const failedJobs = Number(row.failed_jobs || 0);
  const stuckJobs = Number(row.stuck_jobs || 0);
  const successRate = totalJobs > 0 ? successJobs / totalJobs : 1;
  const failedRate = totalJobs > 0 ? failedJobs / totalJobs : 0;
  const hasSample = totalJobs >= config.smsMinJobs;
  const successRateOk = successRate >= config.smsMinSuccessRate;
  const failedRateOk = failedRate <= config.smsMaxFailedRate;
  const stuckOk = stuckJobs <= config.smsMaxStuckJobs;
  const passed = hasSample && successRateOk && failedRateOk && stuckOk;

  return {
    code: 'sms_credentials_flow',
    passed,
    metrics: {
      total_jobs: totalJobs,
      success_jobs: successJobs,
      failed_jobs: failedJobs,
      stuck_jobs: stuckJobs,
      success_rate_pct: toFixedPercent(successRate),
      failed_rate_pct: toFixedPercent(failedRate),
      last_job_at: row.last_job_at || null,
    },
    thresholds: {
      lookback_hours: config.smsLookbackHours,
      min_jobs: config.smsMinJobs,
      min_success_rate_pct: toFixedPercent(config.smsMinSuccessRate),
      max_failed_rate_pct: toFixedPercent(config.smsMaxFailedRate),
      max_stuck_jobs: config.smsMaxStuckJobs,
      stuck_minutes: config.smsStuckMinutes,
    },
    reasons: {
      has_sample: hasSample,
      success_rate_ok: successRateOk,
      failed_rate_ok: failedRateOk,
      stuck_ok: stuckOk,
    },
  };
}

async function evaluatePanelWriteFlow(config) {
  const { rows } = await query(
    `
      SELECT
        COUNT(*)::int AS total_writes,
        COUNT(*) FILTER (WHERE action = 'PANEL_SETTINGS_UPDATE')::int AS settings_updates,
        COUNT(*) FILTER (WHERE action LIKE 'PANEL_CANDIDATE_%')::int AS candidate_writes,
        COUNT(*) FILTER (WHERE action LIKE 'PANEL_NOTIFICATIONS_%' AND action <> 'PANEL_NOTIFICATIONS_READ')::int AS notification_writes,
        COUNT(*) FILTER (WHERE action LIKE 'PANEL_DLQ_%' AND action <> 'PANEL_DLQ_READ')::int AS dlq_writes,
        COUNT(*) FILTER (WHERE action = 'PANEL_UNVIEWED_RESULTS_WA_SEND')::int AS unviewed_writes,
        COUNT(*) FILTER (WHERE action IN ('PANEL_RESULTS_OVERRIDE', 'PANEL_RESULTS_PUBLISH'))::int AS result_writes,
        COUNT(*) FILTER (WHERE action LIKE 'PANEL_CRM_EXPORT_%' AND action <> 'PANEL_CRM_EXPORT_READ')::int AS crm_writes,
        MAX(created_at) AS last_write_at
      FROM audit_log_entries
      WHERE actor_type = 'PANEL_USER'
        AND created_at >= NOW() - make_interval(hours => $1::int)
        AND (
          action = 'PANEL_SETTINGS_UPDATE'
          OR action LIKE 'PANEL_CANDIDATE_%'
          OR (action LIKE 'PANEL_NOTIFICATIONS_%' AND action <> 'PANEL_NOTIFICATIONS_READ')
          OR (action LIKE 'PANEL_DLQ_%' AND action <> 'PANEL_DLQ_READ')
          OR action = 'PANEL_UNVIEWED_RESULTS_WA_SEND'
          OR action IN ('PANEL_RESULTS_OVERRIDE', 'PANEL_RESULTS_PUBLISH')
          OR (action LIKE 'PANEL_CRM_EXPORT_%' AND action <> 'PANEL_CRM_EXPORT_READ')
        )
    `,
    [config.panelLookbackHours],
  );

  const row = rows[0] || {};
  const writeByDomain = {
    settings: Number(row.settings_updates || 0),
    candidates: Number(row.candidate_writes || 0),
    notifications: Number(row.notification_writes || 0),
    dlq: Number(row.dlq_writes || 0),
    unviewed: Number(row.unviewed_writes || 0),
    results: Number(row.result_writes || 0),
    crm: Number(row.crm_writes || 0),
  };
  const totalWrites = Number(row.total_writes || 0);
  const domainCount = Object.values(writeByDomain).filter((count) => count > 0).length;
  const minWritesOk = totalWrites >= config.panelMinWriteActions;
  const settingsUpdateOk = !config.panelRequireSettingsUpdate || writeByDomain.settings > 0;
  const domainCountOk = domainCount >= config.panelMinDomains;
  const passed = minWritesOk && settingsUpdateOk && domainCountOk;

  return {
    code: 'panel_write_update_flow',
    passed,
    metrics: {
      total_writes: totalWrites,
      domain_count: domainCount,
      writes_by_domain: writeByDomain,
      last_write_at: row.last_write_at || null,
    },
    thresholds: {
      lookback_hours: config.panelLookbackHours,
      min_write_actions: config.panelMinWriteActions,
      min_domains: config.panelMinDomains,
      require_settings_update: config.panelRequireSettingsUpdate,
    },
    reasons: {
      min_writes_ok: minWritesOk,
      settings_update_ok: settingsUpdateOk,
      domain_count_ok: domainCountOk,
    },
  };
}

export async function evaluateCampaignReleaseGate({ campaignCode = '' } = {}) {
  const normalizedCampaignCode = normalizeCampaignCode(campaignCode);
  const settingsMap = await readReleaseGateSettingsMap();
  const config = buildReleaseGateConfig(settingsMap);
  const effectiveCampaignCode = normalizedCampaignCode || normalizeCampaignCode(readStringLike(settingsMap[CAMPAIGN_CODE_SETTING_KEY]));
  const checkedAt = new Date().toISOString();

  if (!config.enabled) {
    return {
      passed: true,
      enabled: false,
      campaign_code: effectiveCampaignCode || null,
      checked_at: checkedAt,
      checks: [],
      config,
    };
  }

  const [smsCheck, panelCheck] = await Promise.all([
    evaluateSmsCredentialsFlow(config, effectiveCampaignCode),
    evaluatePanelWriteFlow(config),
  ]);

  const checks = [smsCheck, panelCheck];
  const failedChecks = checks.filter((item) => !item.passed).map((item) => item.code);

  return {
    passed: failedChecks.length === 0,
    enabled: true,
    campaign_code: effectiveCampaignCode || null,
    checked_at: checkedAt,
    checks,
    failed_checks: failedChecks,
    config,
  };
}
