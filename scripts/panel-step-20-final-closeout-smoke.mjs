import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function makeCheck(id, status, detail, evidence = {}) {
  return { id, status, detail, evidence };
}

function readBoundedIntEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(safeTrim(process.env[name] || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function computeArtifactFreshness(payload, maxAgeHours) {
  const timestamp = safeTrim(payload?.timestamp);
  if (!timestamp) {
    return {
      ok: false,
      detail: 'artifact timestamp missing.',
      evidence: {
        timestamp: null,
        max_age_hours: maxAgeHours,
      },
    };
  }

  const parsedMs = Number(new Date(timestamp));
  if (!Number.isFinite(parsedMs)) {
    return {
      ok: false,
      detail: 'artifact timestamp invalid.',
      evidence: {
        timestamp,
        max_age_hours: maxAgeHours,
      },
    };
  }

  const ageMinutes = Math.round((Date.now() - parsedMs) / 60000);
  if (ageMinutes < 0) {
    return {
      ok: false,
      detail: `artifact timestamp is in the future (${ageMinutes} min).`,
      evidence: {
        timestamp,
        age_minutes: ageMinutes,
        max_age_hours: maxAgeHours,
      },
    };
  }

  const maxAgeMinutes = maxAgeHours * 60;
  if (ageMinutes > maxAgeMinutes) {
    return {
      ok: false,
      detail: `artifact stale (${ageMinutes} min > ${maxAgeMinutes} min).`,
      evidence: {
        timestamp,
        age_minutes: ageMinutes,
        max_age_hours: maxAgeHours,
      },
    };
  }

  return {
    ok: true,
    detail: `artifact fresh (${ageMinutes} min <= ${maxAgeMinutes} min).`,
    evidence: {
      timestamp,
      age_minutes: ageMinutes,
      max_age_hours: maxAgeHours,
    },
  };
}

async function httpRequest({ method = 'GET', url, headers = {}, timeoutMs = 20000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json, text/plain;q=0.9, text/html;q=0.8, */*;q=0.7',
        ...headers,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      status: response.status,
      text,
    };
  } finally {
    clearTimeout(timer);
  }
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Panel Step-20 Final Closeout Smoke');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- overall_ready_for_step_20: **${report.overall_ready_for_step_20}**`);
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

function readJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function run() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const guidelinesDir = path.join(rootDir, 'guidelines');

  const cfg = {
    wwwBase: normalizeBase(process.env.WWW_BASE_URL, 'https://teachera.com.tr'),
    panelApiBase: normalizeBase(process.env.PANEL_API_BASE_URL, 'https://panel-api.teachera.com.tr'),
    artifactMaxAgeHours: readBoundedIntEnv('PANEL_STEP20_ARTIFACT_MAX_AGE_HOURS', 168, 1, 24 * 30),
    step21ArtifactMaxAgeHours: readBoundedIntEnv('PANEL_STEP20_STEP21_MAX_AGE_HOURS', 24, 1, 24 * 30),
  };

  const checks = [];

  const artifactChecks = [
    ['step14', 'panel-step-14-closeout-smoke-latest.json', 'overall_ready_for_step_14'],
    ['step16', 'panel-step-16-ops-grid-smoke-latest.json', 'overall_ready_for_step_16'],
    ['step17', 'panel-step-17-rbac-session-smoke-latest.json', 'overall_ready_for_step_17'],
    ['step18', 'panel-step-18-rbac-policy-smoke-latest.json', 'overall_ready_for_step_18'],
    ['step19', 'panel-step-19-data-contract-smoke-latest.json', 'overall_ready_for_step_19'],
    ['step21', 'panel-step-21-settings-release-gate-smoke-latest.json', 'overall_ready_for_step_21'],
    ['slot_visibility', 'p0-panel-prod-slot-visibility-smoke-latest.json', 'overall_pass'],
  ];

  for (const [id, fileName, readyKey] of artifactChecks) {
    const fullPath = path.join(guidelinesDir, fileName);
    let payload;
    try {
      payload = readJson(await fs.readFile(fullPath, 'utf8'));
    } catch {
      payload = null;
    }
    if (!payload) {
      checks.push(makeCheck(`artifact_${id}_exists`, 'FAIL', 'Artifact missing or invalid JSON.', { path: fullPath }));
      continue;
    }

    checks.push(
      makeCheck(`artifact_${id}_exists`, 'PASS', 'Artifact exists and JSON parsed.', { path: fullPath }),
    );

    const ready = payload?.[readyKey] === true;
    checks.push(
      makeCheck(
        `artifact_${id}_ready`,
        ready ? 'PASS' : 'FAIL',
        ready ? `${readyKey}=true` : `${readyKey}=false`,
        { path: fullPath, [readyKey]: payload?.[readyKey] },
      ),
    );

    const maxAgeHours = (id === 'step21' || id === 'slot_visibility')
      ? cfg.step21ArtifactMaxAgeHours
      : cfg.artifactMaxAgeHours;
    const freshness = computeArtifactFreshness(payload, maxAgeHours);
    checks.push(
      makeCheck(
        `artifact_${id}_freshness`,
        freshness.ok ? 'PASS' : 'FAIL',
        freshness.detail,
        {
          path: fullPath,
          ...freshness.evidence,
        },
      ),
    );
  }

  const liveChecks = [
    ['public_panel_dashboard', 'GET', `${cfg.wwwBase}/panel/dashboard?view=operations&focus=candidates`, 200],
    ['unauth_panel_dashboard_api', 'GET', `${cfg.panelApiBase}/api/panel/dashboard`, 401],
    ['unauth_panel_candidates_export_api', 'GET', `${cfg.panelApiBase}/api/panel/candidates/export?format=csv`, 401],
    ['unauth_panel_candidates_actions_api', 'POST', `${cfg.panelApiBase}/api/panel/candidates/actions`, 401],
  ];

  for (const [id, method, url, expected] of liveChecks) {
    const response = await httpRequest({
      method,
      url,
      headers: method === 'POST' ? { 'content-type': 'application/json' } : {},
    });
    checks.push(
      makeCheck(
        id,
        response.status === expected ? 'PASS' : 'FAIL',
        `HTTP ${response.status}`,
        { url, method, status: response.status, expected: [expected] },
      ),
    );
  }

  const totals = checks.reduce(
    (acc, item) => {
      const key = item.status.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(acc, key)) acc[key] += 1;
      return acc;
    },
    { pass: 0, fail: 0, warn: 0, skip: 0 },
  );

  const report = {
    timestamp: nowIso(),
    mode: { http: true, artifact: true },
    totals,
    overall_ready_for_step_20: totals.fail === 0,
    checks,
  };

  await fs.mkdir(guidelinesDir, { recursive: true });
  const outJson = path.join(guidelinesDir, 'panel-step-20-final-closeout-smoke-latest.json');
  const outMd = path.join(guidelinesDir, 'panel-step-20-final-closeout-smoke-latest.md');
  await fs.writeFile(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(outMd, renderMarkdown(report), 'utf8');

  console.log(JSON.stringify(report, null, 2));
  if (!report.overall_ready_for_step_20) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('[panel-step-20-final-closeout-smoke] failed:', error?.message || error);
  process.exitCode = 1;
});
