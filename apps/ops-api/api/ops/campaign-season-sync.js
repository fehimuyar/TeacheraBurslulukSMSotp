import { readDefaultCampaignCode } from '../_lib/env.js';
import { HttpError } from '../_lib/errors.js';
import { query, withTransaction } from '../_lib/db.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../_lib/http.js';

const SETTINGS_KEYS = {
  enabled: 'bursluluk.season.automation.enabled',
  campaignCode: 'bursluluk.season.automation.campaign_code',
  openAt: 'bursluluk.season.automation.open_at',
  closeAt: 'bursluluk.season.automation.close_at',
  nextOpenAt: 'bursluluk.season.automation.next_open_at',
  forceOpenWithinWindow: 'bursluluk.season.automation.force_open_within_window',
  gateForceOpen: 'bursluluk.exam_force_open',
  gateOpenAt: 'bursluluk.exam_open_at',
};

function extractBearer(req) {
  const header = safeTrim(req.headers?.authorization);
  if (!header || !header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

function assertOpsSecret(req) {
  const expected = safeTrim(process.env.CRON_SECRET || process.env.NOTIFICATION_WORKER_SECRET);
  if (!expected) return;

  const provided = safeTrim(
    req.headers?.['x-worker-secret']
      || req.headers?.['x-ops-secret']
      || req.query?.worker_secret
      || extractBearer(req),
  );

  if (!provided || provided !== expected) {
    throw new HttpError(401, 'Ops secret is invalid.', 'invalid_ops_secret');
  }
}

function parseBooleanLike(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  const normalized = safeTrim(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseDateTimeLike(value) {
  const raw = safeTrim(value);
  if (!raw) return null;
  const ms = Number(new Date(raw));
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function readSettingValue(map, key) {
  return map.get(key);
}

function parseSettingDate(map, key) {
  const value = readSettingValue(map, key);
  return parseDateTimeLike(value);
}

function parseSettingBoolean(map, key, fallback = false) {
  const value = readSettingValue(map, key);
  return parseBooleanLike(value, fallback);
}

async function readSettingsMap(keys) {
  const result = await query(
    `
      SELECT key, value
      FROM app_settings
      WHERE key = ANY($1::text[])
    `,
    [keys],
  );

  const map = new Map();
  for (const row of result.rows) {
    map.set(String(row.key || ''), row.value ?? null);
  }
  return map;
}

function buildDecision({
  nowIso,
  openAtIso,
  closeAtIso,
  nextOpenAtIso,
  forceOpenWithinWindow,
}) {
  const nowMs = Number(new Date(nowIso));
  const openAtMs = Number(new Date(openAtIso));
  const closeAtMs = Number(new Date(closeAtIso));
  const nextOpenAtMs = nextOpenAtIso ? Number(new Date(nextOpenAtIso)) : NaN;

  const inWindow = nowMs >= openAtMs && nowMs < closeAtMs;
  const beforeWindow = nowMs < openAtMs;
  const afterWindow = nowMs >= closeAtMs;

  if (inWindow) {
    return {
      reason: 'within_window',
      in_window: true,
      desired_force_open: Boolean(forceOpenWithinWindow),
      desired_open_at: openAtIso,
    };
  }

  if (beforeWindow) {
    return {
      reason: 'before_window',
      in_window: false,
      desired_force_open: false,
      desired_open_at: openAtIso,
    };
  }

  if (afterWindow && Number.isFinite(nextOpenAtMs) && nextOpenAtMs > nowMs) {
    return {
      reason: 'after_window_next_open_at',
      in_window: false,
      desired_force_open: false,
      desired_open_at: new Date(nextOpenAtMs).toISOString(),
    };
  }

  const fallbackFutureOpenAt = new Date(closeAtMs + (1000 * 60 * 60 * 24 * 365)).toISOString();
  return {
    reason: 'after_window_fallback_future_open_at',
    in_window: false,
    desired_force_open: false,
    desired_open_at: fallbackFutureOpenAt,
  };
}

async function upsertSetting(client, key, value, updatedBy = 'ops_campaign_season_sync') {
  await client.query(
    `
      INSERT INTO app_settings (key, value, updated_by, updated_at)
      VALUES ($1, $2::jsonb, $3, NOW())
      ON CONFLICT (key)
      DO UPDATE
      SET
        value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
    `,
    [key, JSON.stringify(value), updatedBy],
  );
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET', 'POST']);
    assertOpsSecret(req);
    const body = req.method === 'POST' ? await parseBody(req) : null;

    const requestedCampaignCode = safeTrim(
      body?.campaign_code
        || body?.campaignCode
        || req.query?.campaign_code
        || req.query?.campaignCode,
    ).slice(0, 120);
    const dryRun = parseBooleanLike(body?.dry_run ?? body?.dryRun ?? req.query?.dry_run ?? req.query?.dryRun, false);
    const nowIso = new Date().toISOString();
    const settingsMap = await readSettingsMap(Object.values(SETTINGS_KEYS));

    const campaignCode = requestedCampaignCode
      || safeTrim(readSettingValue(settingsMap, SETTINGS_KEYS.campaignCode)).slice(0, 120)
      || safeTrim(readDefaultCampaignCode()).slice(0, 120);

    const enabled = parseSettingBoolean(settingsMap, SETTINGS_KEYS.enabled, false);
    if (!enabled) {
      ok(res, {
        campaign_code: campaignCode || null,
        dry_run: dryRun,
        automation_enabled: false,
        now_utc: nowIso,
        skipped: true,
        reason: 'automation_disabled',
      });
      return;
    }

    const openAtIso = parseSettingDate(settingsMap, SETTINGS_KEYS.openAt);
    const closeAtIso = parseSettingDate(settingsMap, SETTINGS_KEYS.closeAt);
    const nextOpenAtIso = parseSettingDate(settingsMap, SETTINGS_KEYS.nextOpenAt);
    const forceOpenWithinWindow = parseSettingBoolean(settingsMap, SETTINGS_KEYS.forceOpenWithinWindow, true);

    if (!openAtIso || !closeAtIso) {
      throw new HttpError(
        409,
        'Season automation requires valid open_at and close_at settings.',
        'season_automation_invalid_window',
        {
          open_at: openAtIso,
          close_at: closeAtIso,
        },
      );
    }

    if (Number(new Date(closeAtIso)) <= Number(new Date(openAtIso))) {
      throw new HttpError(
        409,
        'close_at must be greater than open_at.',
        'season_automation_invalid_window_order',
        {
          open_at: openAtIso,
          close_at: closeAtIso,
        },
      );
    }

    const decision = buildDecision({
      nowIso,
      openAtIso,
      closeAtIso,
      nextOpenAtIso,
      forceOpenWithinWindow,
    });

    const currentGateForceOpen = parseSettingBoolean(settingsMap, SETTINGS_KEYS.gateForceOpen, false);
    const currentGateOpenAt = parseSettingDate(settingsMap, SETTINGS_KEYS.gateOpenAt);
    const changed = (
      currentGateForceOpen !== decision.desired_force_open
      || String(currentGateOpenAt || '') !== String(decision.desired_open_at || '')
    );

    if (!dryRun && changed) {
      await withTransaction(async (client) => {
        await upsertSetting(client, SETTINGS_KEYS.gateForceOpen, decision.desired_force_open);
        await upsertSetting(client, SETTINGS_KEYS.gateOpenAt, decision.desired_open_at);
      });
    }

    ok(res, {
      campaign_code: campaignCode || null,
      dry_run: dryRun,
      automation_enabled: true,
      now_utc: nowIso,
      changed,
      applied: !dryRun && changed,
      decision,
      season_window: {
        open_at: openAtIso,
        close_at: closeAtIso,
        next_open_at: nextOpenAtIso,
        force_open_within_window: forceOpenWithinWindow,
      },
      current_gate: {
        exam_force_open: currentGateForceOpen,
        exam_open_at: currentGateOpenAt,
      },
      target_gate: {
        exam_force_open: decision.desired_force_open,
        exam_open_at: decision.desired_open_at,
      },
      updated_keys: changed ? [SETTINGS_KEYS.gateForceOpen, SETTINGS_KEYS.gateOpenAt] : [],
    });
  });
}
