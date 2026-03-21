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

function readJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function makeCheck(id, status, detail, evidence = {}) {
  return { id, status, detail, evidence };
}

function readOtpChallenge(payload) {
  const otp = payload && typeof payload === 'object' ? payload.otp : null;
  return {
    challengeId: safeTrim(otp?.challenge_id || otp?.challengeId),
    challengeToken: safeTrim(otp?.challenge_token || otp?.challengeToken),
  };
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

function renderMarkdown(report) {
  const lines = [];
  lines.push('# P0 Panel Prod Slot Visibility Smoke');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- overall_pass: **${report.overall_pass}**`);
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
    wwwBase: normalizeBase(process.env.WWW_BASE_URL, 'https://teachera.com.tr'),
    panelEmail: safeTrim(process.env.PANEL_EMAIL),
    panelPassword: safeTrim(process.env.PANEL_PASSWORD),
    panelOtpCode: safeTrim(process.env.PANEL_OTP_CODE),
  };
  const checks = [];

  const missingAuth = [];
  if (!cfg.panelEmail) missingAuth.push('PANEL_EMAIL');
  if (!cfg.panelPassword) missingAuth.push('PANEL_PASSWORD');
  if (!cfg.panelOtpCode) missingAuth.push('PANEL_OTP_CODE');

  let panelToken = '';

  if (missingAuth.length > 0) {
    checks.push(
      makeCheck(
        'auth_prerequisites',
        'FAIL',
        `Missing auth env: ${missingAuth.join(', ')}`,
        { missing: missingAuth },
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
      },
    });
    const challenge = readOtpChallenge(loginResp.json);
    const hasChallenge = loginResp.status === 200
      && loginResp.json?.otp_required === true
      && challenge.challengeId
      && challenge.challengeToken;

    let verifyResp = { status: 0, json: null };
    if (hasChallenge) {
      verifyResp = await httpRequest({
        method: 'POST',
        url: `${cfg.panelApiBase}/api/panel/auth/login`,
        headers: { 'content-type': 'application/json' },
        body: {
          email: cfg.panelEmail,
          password: cfg.panelPassword,
          otpCode: cfg.panelOtpCode,
          challengeId: challenge.challengeId,
          challengeToken: challenge.challengeToken,
        },
      });
    }
    panelToken = safeTrim(verifyResp.json?.session?.token);
    checks.push(
      makeCheck(
        'auth_login',
        hasChallenge && verifyResp.status === 200 && panelToken ? 'PASS' : 'FAIL',
        `start:${loginResp.status} verify:${verifyResp.status || 'NA'}`,
        {
          start_status: loginResp.status,
          verify_status: verifyResp.status || null,
          otp_required: loginResp.json?.otp_required === true,
          has_token: Boolean(panelToken),
          start_error: loginResp.json?.error || null,
          verify_error: verifyResp.json?.error || null,
        },
      ),
    );
  }

  if (panelToken) {
    const candidatesResp = await httpRequest({
      method: 'GET',
      url: `${cfg.panelApiBase}/api/panel/candidates?page=1&per_page=5&sort_by=updated_at&sort_order=desc`,
      headers: { authorization: `Bearer ${panelToken}` },
    });
    checks.push(
      makeCheck(
        'api_candidates_200',
        candidatesResp.status === 200 ? 'PASS' : 'FAIL',
        `HTTP ${candidatesResp.status}`,
        {
          status: candidatesResp.status,
          error: candidatesResp.json?.error || null,
        },
      ),
    );

    const items = Array.isArray(candidatesResp.json?.items) ? candidatesResp.json.items : [];
    const first = items[0] || {};
    const hasSection = Object.prototype.hasOwnProperty.call(first, 'section') || candidatesResp.text.includes('"section"');
    const hasExamScheduledAt =
      Object.prototype.hasOwnProperty.call(first, 'exam_scheduled_at') || candidatesResp.text.includes('"exam_scheduled_at"');
    const hasExamSlotLabel =
      Object.prototype.hasOwnProperty.call(first, 'exam_slot_label') || candidatesResp.text.includes('"exam_slot_label"');
    checks.push(
      makeCheck(
        'api_fields_section_slot',
        hasSection && hasExamScheduledAt && hasExamSlotLabel ? 'PASS' : 'FAIL',
        `sample_count=${items.length}`,
        {
          sample_count: items.length,
          has_section: hasSection,
          has_exam_scheduled_at: hasExamScheduledAt,
          has_exam_slot_label: hasExamSlotLabel,
        },
      ),
    );

    const exportResp = await httpRequest({
      method: 'GET',
      url: `${cfg.panelApiBase}/api/panel/candidates/export?format=csv`,
      headers: { authorization: `Bearer ${panelToken}` },
    });
    checks.push(
      makeCheck(
        'api_export_200',
        exportResp.status === 200 ? 'PASS' : 'FAIL',
        `HTTP ${exportResp.status}`,
        {
          status: exportResp.status,
        },
      ),
    );

    const csvHeader = safeTrim((exportResp.text || '').split(/\r?\n/)[0] || '');
    const csvHeaders = csvHeader.split(',').map((item) => safeTrim(item));
    const hasCsvSection = csvHeaders.includes('section');
    const hasCsvExamScheduledAt = csvHeaders.includes('exam_scheduled_at');
    const hasCsvExamSlotLabel = csvHeaders.includes('exam_slot_label');
    checks.push(
      makeCheck(
        'api_export_headers_section_slot',
        hasCsvSection && hasCsvExamScheduledAt && hasCsvExamSlotLabel ? 'PASS' : 'FAIL',
        'CSV header check',
        {
          has_section: hasCsvSection,
          has_exam_scheduled_at: hasCsvExamScheduledAt,
          has_exam_slot_label: hasCsvExamSlotLabel,
        },
      ),
    );
  } else {
    checks.push(makeCheck('api_candidates_200', 'SKIP', 'Skipped: no panel token.'));
    checks.push(makeCheck('api_fields_section_slot', 'SKIP', 'Skipped: no panel token.'));
    checks.push(makeCheck('api_export_200', 'SKIP', 'Skipped: no panel token.'));
    checks.push(makeCheck('api_export_headers_section_slot', 'SKIP', 'Skipped: no panel token.'));
  }

  const wwwCandidatesResp = await httpRequest({
    method: 'GET',
    url: `${cfg.wwwBase}/panel/candidates`,
  });
  checks.push(
    makeCheck(
      'www_candidates_200',
      wwwCandidatesResp.status === 200 ? 'PASS' : 'FAIL',
      `HTTP ${wwwCandidatesResp.status}`,
      {
        status: wwwCandidatesResp.status,
      },
    ),
  );

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
    panel_api_base: cfg.panelApiBase,
    www_base: cfg.wwwBase,
    totals,
    overall_pass: totals.fail === 0,
    checks,
  };

  await fs.mkdir(guidelinesDir, { recursive: true });
  const outJson = path.join(guidelinesDir, 'p0-panel-prod-slot-visibility-smoke-latest.json');
  const outMd = path.join(guidelinesDir, 'p0-panel-prod-slot-visibility-smoke-latest.md');
  await fs.writeFile(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(outMd, renderMarkdown(report), 'utf8');

  console.log(JSON.stringify(report, null, 2));
  if (!report.overall_pass) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('[p0-panel-prod-slot-visibility-smoke] failed:', error?.message || error);
  process.exitCode = 1;
});
