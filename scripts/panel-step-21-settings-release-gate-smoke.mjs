import fs from 'node:fs/promises';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function safeTrim(value) {
  return String(value ?? '').trim();
}

function normalizeBase(value, fallback) {
  const raw = safeTrim(value || fallback);
  if (!raw) throw new Error('missing_base_url');
  return raw.replace(/\/+$/, '');
}

function nowIso() {
  return new Date().toISOString();
}

function parseBoolean(value, fallback = false) {
  const normalized = safeTrim(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function makeCheck(id, status, detail, evidence = {}) {
  return { id, status, detail, evidence };
}

function readJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function httpRequest({ method = 'GET', url, headers = {}, body, timeoutMs = 20000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const payload = typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined;
    const response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json, text/plain;q=0.9, text/html;q=0.8, */*;q=0.7',
        ...headers,
      },
      body: payload,
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      status: response.status,
      text,
      json: readJson(text),
    };
  } finally {
    clearTimeout(timer);
  }
}

function decodeBase32(rawSecret) {
  const normalized = safeTrim(rawSecret)
    .replace(/[\s-]/g, '')
    .toUpperCase();
  if (!normalized) return Buffer.alloc(0);

  let bits = '';
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) return Buffer.alloc(0);
    bits += index.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secretBuffer, counter, digits = 6) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(code % (10 ** digits)).padStart(digits, '0');
}

function generateTotpCode(secret) {
  const secretBuffer = decodeBase32(secret);
  if (!secretBuffer.length) return '';
  const step = Math.floor(Date.now() / 1000 / 30);
  return hotp(secretBuffer, step, 6);
}

function parseDateLike(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  if (typeof value === 'string') {
    const normalized = safeTrim(value);
    if (!normalized) return null;
    const date = new Date(normalized);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = parseDateLike(item);
      if (parsed) return parsed;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    const source = value;
    const candidates = [source.open_at, source.openAt, source.value, source.at, source.datetime];
    for (const item of candidates) {
      const parsed = parseDateLike(item);
      if (parsed) return parsed;
    }
  }
  return null;
}

function findOpenAtBaseline(items) {
  const map = new Map((Array.isArray(items) ? items : []).map((item) => [item?.key, item?.value]));
  const candidates = [
    map.get('bursluluk.exam_open_at'),
    map.get('bursluluk.campaign.exam_open_at'),
    map.get('exam.open_at'),
  ];
  for (const candidate of candidates) {
    const parsed = parseDateLike(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Panel Step-21 Settings + Release Gate Smoke');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- overall_ready_for_step_21: **${report.overall_ready_for_step_21}**`);
  lines.push(`- pass: ${report.totals.pass}, fail: ${report.totals.fail}, warn: ${report.totals.warn}, skip: ${report.totals.skip}`);
  lines.push('');
  lines.push('## Checks');
  lines.push('');
  lines.push('| id | status | detail |');
  lines.push('| --- | --- | --- |');
  for (const check of report.checks) {
    lines.push(`| ${check.id} | ${check.status} | ${String(check.detail || '').replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function run() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const guidelinesDir = path.join(rootDir, 'guidelines');
  const cfg = {
    panelApiBase: normalizeBase(process.env.PANEL_API_BASE_URL, 'https://panel-api.teachera.com.tr'),
    campaignCode: safeTrim(process.env.PANEL_STEP21_CAMPAIGN_CODE || '2026_BURSLULUK'),
    panelEmail: safeTrim(process.env.PANEL_EMAIL),
    panelPassword: safeTrim(process.env.PANEL_PASSWORD),
    panelMfaCode: safeTrim(process.env.PANEL_MFA_CODE),
    panelTotpSecret: safeTrim(process.env.PANEL_SMOKE_TOTP_SECRET || process.env.PANEL_TOTP_SECRET),
    requireAuth: parseBoolean(process.env.PANEL_STEP21_REQUIRE_AUTH, false),
  };
  const checks = [];

  const settingsSource = await fs.readFile(path.join(rootDir, 'apps/panel-api/api/panel/settings/index.js'), 'utf8');
  const releaseGateSource = await fs.readFile(path.join(rootDir, 'apps/panel-api/api/panel/settings/release-gate.js'), 'utf8');

  checks.push(
    makeCheck(
      'static_settings_legacy_key_rejection_marker',
      settingsSource.includes('legacy_gate_keys_not_supported') ? 'PASS' : 'FAIL',
      settingsSource.includes('legacy_gate_keys_not_supported') ? 'Marker found.' : 'Marker missing.',
      { file: 'apps/panel-api/api/panel/settings/index.js', marker: 'legacy_gate_keys_not_supported' },
    ),
  );

  checks.push(
    makeCheck(
      'static_settings_canonical_key_marker',
      settingsSource.includes('bursluluk.exam_force_open') && settingsSource.includes('bursluluk.exam_open_at') ? 'PASS' : 'FAIL',
      settingsSource.includes('bursluluk.exam_force_open') && settingsSource.includes('bursluluk.exam_open_at')
        ? 'Canonical gate markers found.'
        : 'Canonical gate markers missing.',
      {
        file: 'apps/panel-api/api/panel/settings/index.js',
        markers: ['bursluluk.exam_force_open', 'bursluluk.exam_open_at'],
      },
    ),
  );

  checks.push(
    makeCheck(
      'static_release_gate_endpoint_marker',
      releaseGateSource.includes("methodGuard(req, ['GET'])") && releaseGateSource.includes('evaluateCampaignReleaseGate')
        ? 'PASS'
        : 'FAIL',
      releaseGateSource.includes("methodGuard(req, ['GET'])") && releaseGateSource.includes('evaluateCampaignReleaseGate')
        ? 'Release-gate endpoint markers found.'
        : 'Release-gate endpoint markers missing.',
      {
        file: 'apps/panel-api/api/panel/settings/release-gate.js',
        markers: ["methodGuard(req, ['GET'])", 'evaluateCampaignReleaseGate'],
      },
    ),
  );

  const unauthReleaseGate = await httpRequest({
    method: 'GET',
    url: `${cfg.panelApiBase}/api/panel/settings/release-gate`,
  });
  checks.push(
    makeCheck(
      'unauth_release_gate_read',
      unauthReleaseGate.status === 401 ? 'PASS' : 'FAIL',
      `HTTP ${unauthReleaseGate.status}`,
      { status: unauthReleaseGate.status, expected: [401] },
    ),
  );

  const unauthSettingsWrite = await httpRequest({
    method: 'PUT',
    url: `${cfg.panelApiBase}/api/panel/settings`,
    headers: { 'content-type': 'application/json' },
    body: {
      items: [{ key: 'exam.force_open', value: true }],
    },
  });
  checks.push(
    makeCheck(
      'unauth_settings_write',
      unauthSettingsWrite.status === 401 ? 'PASS' : 'FAIL',
      `HTTP ${unauthSettingsWrite.status}`,
      { status: unauthSettingsWrite.status, expected: [401] },
    ),
  );

  const derivedMfaCode = cfg.panelMfaCode || generateTotpCode(cfg.panelTotpSecret);
  const missingAuth = [];
  if (!cfg.panelEmail) missingAuth.push('PANEL_EMAIL');
  if (!cfg.panelPassword) missingAuth.push('PANEL_PASSWORD');
  if (!derivedMfaCode) missingAuth.push('PANEL_MFA_CODE|PANEL_SMOKE_TOTP_SECRET');

  let panelToken = '';
  let panelRole = '';

  if (missingAuth.length > 0) {
    const missingStatus = cfg.requireAuth ? 'FAIL' : 'WARN';
    checks.push(
      makeCheck(
        'auth_prerequisites',
        missingStatus,
        `Missing auth env: ${missingAuth.join(', ')}`,
        { missing: missingAuth, require_auth: cfg.requireAuth },
      ),
    );
  } else {
    const loginResp = await httpRequest({
      method: 'POST',
      url: `${cfg.panelApiBase}/api/panel/auth/login`,
      headers: { 'content-type': 'application/json' },
      body: {
        email: cfg.panelEmail,
        password: cfg.panelPassword,
        mfaCode: derivedMfaCode,
      },
    });
    panelToken = safeTrim(loginResp.json?.session?.token);
    checks.push(
      makeCheck(
        'auth_login',
        loginResp.status === 200 && panelToken ? 'PASS' : 'FAIL',
        `HTTP ${loginResp.status}`,
        {
          status: loginResp.status,
          has_token: Boolean(panelToken),
          error: loginResp.json?.error || null,
        },
      ),
    );

    if (panelToken) {
      const meResp = await httpRequest({
        method: 'GET',
        url: `${cfg.panelApiBase}/api/panel/auth/me`,
        headers: { authorization: `Bearer ${panelToken}` },
      });
      panelRole = safeTrim(meResp.json?.identity?.role).toUpperCase();
      checks.push(
        makeCheck(
          'auth_me',
          meResp.status === 200 ? 'PASS' : 'FAIL',
          `HTTP ${meResp.status}`,
          {
            status: meResp.status,
            role: panelRole || null,
          },
        ),
      );
    }
  }

  const canRunWriteChecks = Boolean(panelToken) && panelRole === 'SUPER_ADMIN';
  if (!canRunWriteChecks) {
    const status = cfg.requireAuth ? 'FAIL' : 'SKIP';
    const reason = panelToken
      ? `Role ${panelRole || 'UNKNOWN'} cannot write settings.`
      : 'Missing authenticated panel token.';
    checks.push(
      makeCheck(
        'role_super_admin_for_settings_write',
        status,
        reason,
        { role: panelRole || null, require_auth: cfg.requireAuth },
      ),
    );
    checks.push(makeCheck('release_gate_read_authenticated', status, `Skipped: ${reason}`));
    checks.push(makeCheck('settings_baseline_open_at', status, `Skipped: ${reason}`));
    checks.push(makeCheck('canonical_activation_attempt', status, `Skipped: ${reason}`));
    checks.push(makeCheck('legacy_key_rejection_authenticated', status, `Skipped: ${reason}`));
  } else {
    const releaseGateResp = await httpRequest({
      method: 'GET',
      url: `${cfg.panelApiBase}/api/panel/settings/release-gate?campaign_code=${encodeURIComponent(cfg.campaignCode)}`,
      headers: { authorization: `Bearer ${panelToken}` },
    });
    const releaseGateOk =
      releaseGateResp.status === 200
      && releaseGateResp.json?.ok === true
      && releaseGateResp.json?.release_gate
      && typeof releaseGateResp.json.release_gate === 'object';
    const releaseGatePassed = releaseGateOk ? releaseGateResp.json?.release_gate?.passed === true : null;
    checks.push(
      makeCheck(
        'release_gate_read_authenticated',
        releaseGateOk ? 'PASS' : 'FAIL',
        `HTTP ${releaseGateResp.status}`,
        {
          status: releaseGateResp.status,
          campaign_code: releaseGateResp.json?.campaign_code || null,
          release_gate_keys: releaseGateResp.json?.release_gate ? Object.keys(releaseGateResp.json.release_gate) : [],
        },
      ),
    );

    const settingsReadResp = await httpRequest({
      method: 'GET',
      url: `${cfg.panelApiBase}/api/panel/settings?keys=${encodeURIComponent('bursluluk.exam_open_at,bursluluk.campaign.exam_open_at,exam.open_at')}`,
      headers: { authorization: `Bearer ${panelToken}` },
    });
    const settingsItems = Array.isArray(settingsReadResp.json?.items) ? settingsReadResp.json.items : [];
    const baselineOpenAt = findOpenAtBaseline(settingsItems);
    let candidateOpenAt = baselineOpenAt;
    let usedProbeOpenAt = false;
    if (!candidateOpenAt && releaseGatePassed === false) {
      candidateOpenAt = new Date(Date.now() + (15 * 60 * 1000)).toISOString();
      usedProbeOpenAt = true;
    }
    checks.push(
      makeCheck(
        'settings_baseline_open_at',
        settingsReadResp.status === 200 && candidateOpenAt ? 'PASS' : 'FAIL',
        settingsReadResp.status !== 200
          ? `HTTP ${settingsReadResp.status}`
          : baselineOpenAt
            ? 'Baseline exam_open_at found for idempotent activation attempt.'
            : usedProbeOpenAt
              ? 'No baseline found; generated probe exam_open_at because release-gate is currently BLOCKED.'
              : 'No valid baseline exam_open_at found.',
        {
          status: settingsReadResp.status,
          baseline_open_at: baselineOpenAt,
          candidate_open_at: candidateOpenAt,
          probe_generated: usedProbeOpenAt,
          release_gate_passed: releaseGatePassed,
          keys_seen: settingsItems.map((item) => item.key),
        },
      ),
    );

    if (candidateOpenAt) {
      const canonicalAttemptResp = await httpRequest({
        method: 'PUT',
        url: `${cfg.panelApiBase}/api/panel/settings`,
        headers: {
          authorization: `Bearer ${panelToken}`,
          'content-type': 'application/json',
        },
        body: {
          items: [
            { key: 'bursluluk.exam_open_at', value: candidateOpenAt },
          ],
        },
      });

      const canonicalAttemptPass =
        (canonicalAttemptResp.status === 200
          && canonicalAttemptResp.json?.ok === true
          && Array.isArray(canonicalAttemptResp.json?.keys)
          && canonicalAttemptResp.json.keys.includes('bursluluk.exam_open_at'))
        || (canonicalAttemptResp.status === 409
          && canonicalAttemptResp.json?.error === 'release_gate_blocked');
      checks.push(
        makeCheck(
          'canonical_activation_attempt',
          canonicalAttemptPass ? 'PASS' : 'FAIL',
          `HTTP ${canonicalAttemptResp.status}`,
          {
            status: canonicalAttemptResp.status,
            error: canonicalAttemptResp.json?.error || null,
            updated_keys: canonicalAttemptResp.json?.keys || [],
            used_probe_open_at: usedProbeOpenAt,
          },
        ),
      );
    } else {
      checks.push(
        makeCheck(
          'canonical_activation_attempt',
          'FAIL',
          'Cannot run canonical activation attempt safely without baseline exam_open_at.',
          {},
        ),
      );
    }

    const legacyAttemptResp = await httpRequest({
      method: 'PUT',
      url: `${cfg.panelApiBase}/api/panel/settings`,
      headers: {
        authorization: `Bearer ${panelToken}`,
        'content-type': 'application/json',
      },
      body: {
        items: [
          { key: 'exam.force_open', value: true },
        ],
      },
    });

    checks.push(
      makeCheck(
        'legacy_key_rejection_authenticated',
        legacyAttemptResp.status === 400 && legacyAttemptResp.json?.error === 'legacy_gate_keys_not_supported'
          ? 'PASS'
          : 'FAIL',
        `HTTP ${legacyAttemptResp.status}`,
        {
          status: legacyAttemptResp.status,
          error: legacyAttemptResp.json?.error || null,
          expected_error: 'legacy_gate_keys_not_supported',
        },
      ),
    );
  }

  const totals = checks.reduce(
    (acc, item) => {
      const key = String(item.status || '').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(acc, key)) acc[key] += 1;
      return acc;
    },
    { pass: 0, fail: 0, warn: 0, skip: 0 },
  );

  const report = {
    timestamp: nowIso(),
    mode: { http: true, static: true, auth: true },
    config: {
      panel_api_base: cfg.panelApiBase,
      campaign_code: cfg.campaignCode || null,
      require_auth: cfg.requireAuth,
      auth_inputs_present: {
        panel_email: Boolean(cfg.panelEmail),
        panel_password: Boolean(cfg.panelPassword),
        panel_mfa_code: Boolean(derivedMfaCode),
      },
    },
    totals,
    overall_ready_for_step_21: totals.fail === 0,
    checks,
  };

  await fs.mkdir(guidelinesDir, { recursive: true });
  const outJson = path.join(guidelinesDir, 'panel-step-21-settings-release-gate-smoke-latest.json');
  const outMd = path.join(guidelinesDir, 'panel-step-21-settings-release-gate-smoke-latest.md');
  await fs.writeFile(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(outMd, renderMarkdown(report), 'utf8');

  console.log(JSON.stringify(report, null, 2));
  if (!report.overall_ready_for_step_21) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('[panel-step-21-settings-release-gate-smoke] failed:', error?.message || error);
  process.exitCode = 1;
});
