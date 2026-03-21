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
    panelMfaCode: safeTrim(process.env.PANEL_MFA_CODE),
    panelTotpSecret: safeTrim(process.env.PANEL_SMOKE_TOTP_SECRET || process.env.PANEL_TOTP_SECRET),
  };
  const checks = [];

  const mfaCode = cfg.panelMfaCode || generateTotpCode(cfg.panelTotpSecret);
  const missingAuth = [];
  if (!cfg.panelEmail) missingAuth.push('PANEL_EMAIL');
  if (!cfg.panelPassword) missingAuth.push('PANEL_PASSWORD');
  if (!mfaCode) missingAuth.push('PANEL_MFA_CODE|PANEL_SMOKE_TOTP_SECRET');

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
        mfaCode,
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
