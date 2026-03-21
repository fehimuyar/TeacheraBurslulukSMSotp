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

async function httpRequest({ method = 'GET', url, headers = {}, body, timeoutMs = 20000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json, text/plain;q=0.9, text/html;q=0.8, */*;q=0.7',
        ...headers,
      },
      body,
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
  lines.push('# Panel Step-18 RBAC Policy Smoke');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- overall_ready_for_step_18: **${report.overall_ready_for_step_18}**`);
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
  };

  const checks = [];

  const policyChecks = [
    {
      id: 'rbac_dashboard_read',
      file: 'apps/panel-api/api/panel/dashboard.js',
      marker: "['PANEL_DASHBOARD_READ']",
    },
    {
      id: 'rbac_candidates_read',
      file: 'apps/panel-api/api/panel/candidates/index.js',
      marker: "['PANEL_CANDIDATES_READ']",
    },
    {
      id: 'rbac_candidates_export_read',
      file: 'apps/panel-api/api/panel/candidates/export.js',
      marker: "['PANEL_CANDIDATES_EXPORT']",
    },
    {
      id: 'rbac_notifications_read',
      file: 'apps/panel-api/api/panel/notifications/index.js',
      marker: "['PANEL_NOTIFICATIONS_READ']",
    },
    {
      id: 'rbac_dlq_read',
      file: 'apps/panel-api/api/panel/dlq/index.js',
      marker: "['PANEL_DLQ_READ']",
    },
    {
      id: 'rbac_unviewed_read',
      file: 'apps/panel-api/api/panel/unviewed-results/index.js',
      marker: "['PANEL_UNVIEWED_READ']",
    },
    {
      id: 'rbac_audit_read',
      file: 'apps/panel-api/api/panel/audit/index.js',
      marker: "['PANEL_AUDIT_READ']",
    },
    {
      id: 'rbac_audit_export_read',
      file: 'apps/panel-api/api/panel/audit/export.js',
      marker: "['PANEL_AUDIT_EXPORT']",
    },
    {
      id: 'rbac_candidates_actions_write',
      file: 'apps/panel-api/api/panel/candidates/actions.js',
      marker: "['PANEL_CANDIDATES_ACTION']",
    },
    {
      id: 'rbac_notifications_actions_write',
      file: 'apps/panel-api/api/panel/notifications/actions.js',
      marker: "['PANEL_NOTIFICATIONS_ACTION']",
    },
    {
      id: 'rbac_dlq_actions_write',
      file: 'apps/panel-api/api/panel/dlq/actions.js',
      marker: "['PANEL_DLQ_ACTION']",
    },
    {
      id: 'rbac_unviewed_actions_write',
      file: 'apps/panel-api/api/panel/unviewed-results/actions.js',
      marker: "['PANEL_UNVIEWED_ACTION']",
    },
    {
      id: 'rbac_settings_write_super_admin',
      file: 'apps/panel-api/api/panel/settings/index.js',
      marker: "['PANEL_SETTINGS_WRITE']",
    },
    {
      id: 'rbac_ip_policy_read',
      file: 'apps/panel-api/api/panel/security/ip-policy.js',
      marker: "['PANEL_IP_POLICY_READ']",
    },
    {
      id: 'rbac_ip_policy_write',
      file: 'apps/panel-api/api/panel/security/ip-policy.js',
      marker: "['PANEL_IP_POLICY_WRITE']",
    },
  ];

  for (const policy of policyChecks) {
    const filePath = path.join(rootDir, policy.file);
    const source = await fs.readFile(filePath, 'utf8');
    const ok = source.includes(policy.marker);
    checks.push(
      makeCheck(
        policy.id,
        ok ? 'PASS' : 'FAIL',
        ok ? 'RBAC marker found.' : 'RBAC marker missing.',
        { file: policy.file, marker: policy.marker },
      ),
    );
  }

  const contractChecks = [
    {
      id: 'contract_unviewed_followup_result_unseen_mode',
      file: 'apps/panel-api/api/panel/unviewed-results/actions.js',
      marker: 'all/result_unseen/viewed_no_appointment/appointment_no_show',
    },
    {
      id: 'contract_unviewed_followup_result_unseen_trigger',
      file: 'apps/panel-api/api/panel/unviewed-results/actions.js',
      marker: 'ops_unviewed_results_auto_whatsapp',
    },
    {
      id: 'contract_unviewed_followup_result_unseen_delay',
      file: 'apps/panel-api/api/panel/unviewed-results/actions.js',
      marker: 'FOLLOWUP_RESULT_UNSEEN_DELAY_MINUTES',
    },
  ];

  for (const contract of contractChecks) {
    const filePath = path.join(rootDir, contract.file);
    const source = await fs.readFile(filePath, 'utf8');
    const ok = source.includes(contract.marker);
    checks.push(
      makeCheck(
        contract.id,
        ok ? 'PASS' : 'FAIL',
        ok ? 'Contract marker found.' : 'Contract marker missing.',
        { file: contract.file, marker: contract.marker },
      ),
    );
  }

  const unauthChecks = [
    ['GET', '/api/panel/candidates'],
    ['GET', '/api/panel/notifications'],
    ['GET', '/api/panel/dlq'],
    ['GET', '/api/panel/unviewed-results'],
    ['GET', '/api/panel/security/ip-policy'],
    ['POST', '/api/panel/candidates/actions'],
    ['POST', '/api/panel/notifications/actions'],
    ['POST', '/api/panel/dlq/actions'],
    ['POST', '/api/panel/unviewed-results/actions'],
  ];

  for (const [method, endpoint] of unauthChecks) {
    const response = await httpRequest({
      method,
      url: `${cfg.panelApiBase}${endpoint}`,
      headers: method === 'POST' ? { 'content-type': 'application/json' } : {},
      body: method === 'POST' ? JSON.stringify({ action: 'noop', candidate_ids: [] }) : undefined,
    });
    checks.push(
      makeCheck(
        `unauth_${method}_${endpoint}`,
        response.status === 401 ? 'PASS' : 'FAIL',
        `HTTP ${response.status}`,
        { url: `${cfg.panelApiBase}${endpoint}`, method, status: response.status, expected: [401] },
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
    mode: { http: true, static: true },
    totals,
    overall_ready_for_step_18: totals.fail === 0,
    checks,
  };

  await fs.mkdir(guidelinesDir, { recursive: true });
  const outJson = path.join(guidelinesDir, 'panel-step-18-rbac-policy-smoke-latest.json');
  const outMd = path.join(guidelinesDir, 'panel-step-18-rbac-policy-smoke-latest.md');
  await fs.writeFile(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(outMd, renderMarkdown(report), 'utf8');

  console.log(JSON.stringify(report, null, 2));
  if (!report.overall_ready_for_step_18) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('[panel-step-18-rbac-policy-smoke] failed:', error?.message || error);
  process.exitCode = 1;
});
