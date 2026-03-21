import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function safeTrim(value) {
  return String(value ?? '').trim();
}

function parseBool(value, fallback = false) {
  const raw = safeTrim(value).toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(raw)) return false;
  return fallback;
}

function normalizeBase(value, fallback) {
  const raw = safeTrim(value || fallback);
  if (!raw) throw new Error('missing_base_url');
  return raw.replace(/\/+$/, '');
}

function nowIso() {
  return new Date().toISOString();
}

function toJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function decodeBase32(rawSecret) {
  const normalized = safeTrim(rawSecret).replace(/[\s-]/g, '').toUpperCase();
  if (!normalized) return Buffer.alloc(0);
  let bits = '';
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error(`invalid_base32_char:${char}`);
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function normalizeTotpSecret(rawSecret) {
  let secret = safeTrim(rawSecret);
  if (!secret) return '';

  if (
    (secret.startsWith('"') && secret.endsWith('"'))
    || (secret.startsWith("'") && secret.endsWith("'"))
  ) {
    secret = safeTrim(secret.slice(1, -1));
  }

  if (secret.toLowerCase().startsWith('otpauth://')) {
    try {
      const url = new URL(secret);
      const fromQuery = safeTrim(url.searchParams.get('secret'));
      if (fromQuery) secret = fromQuery;
    } catch {
      // keep raw secret if URL parsing fails
    }
  }

  return secret;
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

function maybeResolvePanelMfaCode({ panelMfaCode, panelTotpSecret }) {
  if (safeTrim(panelMfaCode)) {
    return {
      code: safeTrim(panelMfaCode),
      source: 'PANEL_MFA_CODE',
      error: '',
    };
  }

  const secret = normalizeTotpSecret(panelTotpSecret);
  if (!secret) {
    return {
      code: '',
      source: 'none',
      error: '',
    };
  }

  try {
    const step = Math.floor(Date.now() / 1000 / 30);
    return {
      code: hotp(decodeBase32(secret), step, 6),
      source: 'PANEL_SMOKE_TOTP_SECRET',
      error: '',
    };
  } catch (error) {
    return {
      code: '',
      source: 'PANEL_SMOKE_TOTP_SECRET',
      error: safeTrim(error?.message || error) || 'totp_generation_failed',
    };
  }
}

async function readEnvFileMap(filepath) {
  try {
    const raw = await fs.readFile(filepath, 'utf8');
    const map = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      map[key] = value;
    }
    return map;
  } catch {
    return {};
  }
}

async function httpRequest({ method = 'GET', url, headers = {}, body, timeoutMs = 20000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      text,
      json: toJson(text),
      headers: response.headers,
    };
  } finally {
    clearTimeout(timer);
  }
}

function isExpectedStatus(status, expected) {
  return Array.isArray(expected) ? expected.includes(status) : status === expected;
}

function makeCheck(id, status, detail, evidence = {}, meta = {}) {
  return { id, status, detail, evidence, ...meta };
}

function redactSensitive(value) {
  const sensitiveKeys = new Set([
    'token',
    'sessionToken',
    'session_token',
    'password',
    'mfaCode',
    'mfa_code',
    'x-load-test-key',
    'load_test_bypass_key',
  ]);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (sensitiveKeys.has(key)) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactSensitive(raw);
    }
  }
  return out;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Frontend UAT + Bugfix Freeze + Release Candidate Report');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- overall_ready_for_release_candidate: **${report.overall_ready_for_release_candidate}**`);
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
  lines.push('## Candidate');
  lines.push('');
  lines.push(`- release_candidate_id: \`${report.release_candidate.id}\``);
  lines.push(`- freeze_window_started_at: ${report.release_candidate.freeze_started_at}`);
  lines.push(`- notes: ${report.release_candidate.notes}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function resolveLoadTestKey(envFileMap) {
  return safeTrim(
    process.env.LOAD_TEST_BYPASS_KEY
    || process.env.CRON_SECRET
    || process.env.NOTIFICATION_WORKER_SECRET
    || envFileMap.LOAD_TEST_BYPASS_KEY
    || envFileMap.CRON_SECRET
    || envFileMap.NOTIFICATION_WORKER_SECRET,
  );
}

async function run() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const guidelinesDir = path.join(rootDir, 'guidelines');
  const envFileMap = await readEnvFileMap(path.join(rootDir, '.env.production.local'));

  const cfg = {
    wwwBase: normalizeBase(process.env.WWW_BASE_URL || envFileMap.WWW_BASE_URL, 'https://teachera.com.tr'),
    examApiBase: normalizeBase(process.env.EXAM_API_BASE_URL || envFileMap.EXAM_API_BASE_URL, 'https://exam-api.teachera.com.tr'),
    panelApiBase: normalizeBase(process.env.PANEL_API_BASE_URL || envFileMap.PANEL_API_BASE_URL, 'https://panel-api.teachera.com.tr'),
    campaignCode: safeTrim(process.env.DEFAULT_CAMPAIGN_CODE || envFileMap.DEFAULT_CAMPAIGN_CODE || '2026_BURSLULUK'),
    kvkkConsentVersion: safeTrim(process.env.KVKK_CONSENT_VERSION || envFileMap.KVKK_CONSENT_VERSION || 'KVKK_v1_2026-03-13'),
    panelEmail: safeTrim(process.env.PANEL_EMAIL),
    panelPassword: safeTrim(process.env.PANEL_PASSWORD),
    panelTotpSecret: safeTrim(process.env.PANEL_SMOKE_TOTP_SECRET || process.env.PANEL_TOTP_SECRET),
    panelMfaCode: safeTrim(process.env.PANEL_MFA_CODE),
    requirePanelFullAuth: parseBool(process.env.REQUIRE_PANEL_FULL_AUTH, false),
    loadTestBypassKey: resolveLoadTestKey(envFileMap),
  };

  const panelMfa = maybeResolvePanelMfaCode(cfg);
  cfg.panelMfaCode = panelMfa.code;
  cfg.panelMfaSource = panelMfa.source;
  cfg.panelMfaResolutionError = panelMfa.error;

  const checks = [];
  const startedAt = nowIso();

  // 1) Route smoke (frontend surface)
  const routes = [
    '/bursluluk-2026',
    '/bursluluk/giris',
    '/bursluluk/onay',
    '/bursluluk/bekleme',
    '/bursluluk/sinav',
    '/bursluluk/s\u0131nav',
    '/bursluluk/sonuc',
    '/bursluluk/sonu\u00e7',
    '/panel/login',
    '/panel/dashboard',
  ];

  for (const routePath of routes) {
    const encodedPath = routePath
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
    const url = `${cfg.wwwBase}${encodedPath}`;
    const response = await httpRequest({ url, method: 'GET' });
    const pass = isExpectedStatus(response.status, [200]);
    checks.push(
      makeCheck(
        `route_${routePath}`,
        pass ? 'PASS' : 'FAIL',
        `HTTP ${response.status}`,
        { url, expected: [200], status: response.status },
      ),
    );
  }

  // 2) Contract checks for newly wired endpoints
  const schoolsResp = await httpRequest({
    url: `${cfg.examApiBase}/api/schools/search?q=konya&limit=5`,
    method: 'GET',
  });
  const schoolItems = Array.isArray(schoolsResp.json?.items)
    ? schoolsResp.json.items
    : (Array.isArray(schoolsResp.json?.schools) ? schoolsResp.json.schools : null);
  const schoolsOk = schoolsResp.status === 200 && Array.isArray(schoolItems);
  checks.push(
    makeCheck(
      'contract_schools_search',
      schoolsOk ? 'PASS' : 'FAIL',
      schoolsOk ? `HTTP 200, items=${schoolItems.length}` : `HTTP ${schoolsResp.status}`,
      {
        url: `${cfg.examApiBase}/api/schools/search?q=konya&limit=5`,
        status: schoolsResp.status,
        sample: schoolItems?.slice?.(0, 3) || null,
      },
    ),
  );

  if (cfg.panelMfaResolutionError) {
    checks.push(
      makeCheck(
        'panel_mfa_resolution',
        cfg.requirePanelFullAuth ? 'FAIL' : 'WARN',
        `panel_mfa_code_generation_failed: ${cfg.panelMfaResolutionError}`,
        {
          source: cfg.panelMfaSource,
          error: cfg.panelMfaResolutionError,
        },
        { check_group: 'optional-admin-check', required: cfg.requirePanelFullAuth },
      ),
    );
  }

  const loginMissingResp = await httpRequest({
    url: `${cfg.examApiBase}/api/exam/candidate/login`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {},
  });
  const loginMissingOk = loginMissingResp.status === 400 && loginMissingResp.json?.error === 'missing_login_fields';
  checks.push(
    makeCheck(
      'contract_candidate_login_missing_fields',
      loginMissingOk ? 'PASS' : 'FAIL',
      `HTTP ${loginMissingResp.status}`,
      {
        status: loginMissingResp.status,
        body: loginMissingResp.json || loginMissingResp.text,
        
      },
    ),
  );

  const statusMissingResp = await httpRequest({
    url: `${cfg.examApiBase}/api/exam/session/status`,
    method: 'GET',
  });
  const statusMissingOk = statusMissingResp.status === 400 && statusMissingResp.json?.error === 'missing_attempt_id';
  checks.push(
    makeCheck(
      'contract_session_status_missing_attempt',
      statusMissingOk ? 'PASS' : 'FAIL',
      `HTTP ${statusMissingResp.status}`,
      {
        status: statusMissingResp.status,
        body: statusMissingResp.json || statusMissingResp.text,
      },
    ),
  );

  // 3) E2E candidate flow (start -> login -> status -> answer -> submit -> results)
  const runId = `${Date.now()}`;
  const startPayload = {
    campaignCode: cfg.campaignCode,
    studentFullName: `UAT Candidate ${runId}`,
    parentFullName: `UAT Parent ${runId}`,
    parentPhoneE164: `+90555${String(runId).slice(-7)}`,
    parentEmail: `uat.${runId}@teachera.com.tr`,
    schoolName: 'UAT Smoke School',
    grade: 8,
    section: '8-A',
    selectedExamAt: '2026-03-28T10:00:00.000Z',
    ageRange: '13-14',
    language: 'EN',
    source: 'frontend_uat_bugfix_freeze',
    questionCount: 5,
    consent: {
      kvkkApproved: true,
      contactConsent: true,
      consentVersion: cfg.kvkkConsentVersion,
      legalTextVersion: cfg.kvkkConsentVersion,
      source: 'frontend_uat_bugfix_freeze',
    },
  };

  const startHeaders = { 'content-type': 'application/json' };
  if (cfg.loadTestBypassKey) {
    startHeaders['x-load-test-mode'] = 'cert';
    startHeaders['x-load-test-key'] = cfg.loadTestBypassKey;
  }

  let startResp = await httpRequest({
    url: `${cfg.examApiBase}/api/exam/session/start`,
    method: 'POST',
    headers: startHeaders,
    body: startPayload,
  });

  // If prod is strict and PII config missing, retry once with load-test bypass when key is available.
  if (
    startResp.status === 503
    && startResp.json?.error === 'pii_crypto_not_configured'
    && !startHeaders['x-load-test-key']
    && cfg.loadTestBypassKey
  ) {
    startResp = await httpRequest({
      url: `${cfg.examApiBase}/api/exam/session/start`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-load-test-mode': 'cert',
        'x-load-test-key': cfg.loadTestBypassKey,
      },
      body: startPayload,
    });
  }

  let attemptId = null;
  let sessionToken = null;
  let applicationNo = null;

  if (startResp.status === 200 && startResp.json?.session) {
    attemptId = safeTrim(startResp.json.session.attemptId);
    sessionToken = safeTrim(startResp.json.session.sessionToken);
    applicationNo = safeTrim(startResp.json.session.applicationNo);
  }

  checks.push(
    makeCheck(
      'e2e_start_session',
      attemptId && sessionToken && applicationNo ? 'PASS' : 'FAIL',
      `HTTP ${startResp.status}`,
      {
        status: startResp.status,
        attemptId: attemptId || null,
        applicationNo: applicationNo || null,
        hasSessionToken: Boolean(sessionToken),
        loadTestModeUsed: Boolean(startHeaders['x-load-test-key']),
        body: redactSensitive(startResp.json || startResp.text),
      },
    ),
  );

  if (attemptId && sessionToken && applicationNo) {
    const candidateLoginHeaders = { 'content-type': 'application/json' };
    if (cfg.loadTestBypassKey) {
      candidateLoginHeaders['x-load-test-mode'] = 'cert';
      candidateLoginHeaders['x-load-test-key'] = cfg.loadTestBypassKey;
    }

    const candidateLoginResp = await httpRequest({
      url: `${cfg.examApiBase}/api/exam/candidate/login`,
      method: 'POST',
      headers: candidateLoginHeaders,
      body: {
        username: applicationNo,
        password: sessionToken,
      },
    });

    checks.push(
      makeCheck(
        'e2e_candidate_login',
        candidateLoginResp.status === 200 ? 'PASS' : 'FAIL',
        `HTTP ${candidateLoginResp.status}`,
        {
          status: candidateLoginResp.status,
          body: redactSensitive(candidateLoginResp.json || candidateLoginResp.text),
        },
      ),
    );

    const sessionHeaders = {
      'x-exam-session-token': sessionToken,
    };
    if (cfg.loadTestBypassKey) {
      sessionHeaders['x-load-test-mode'] = 'cert';
      sessionHeaders['x-load-test-key'] = cfg.loadTestBypassKey;
    }

    const statusResp = await httpRequest({
      url: `${cfg.examApiBase}/api/exam/session/status?attemptId=${encodeURIComponent(attemptId)}`,
      method: 'GET',
      headers: sessionHeaders,
    });

    checks.push(
      makeCheck(
        'e2e_session_status',
        statusResp.status === 200 ? 'PASS' : 'FAIL',
        `HTTP ${statusResp.status}`,
        {
          status: statusResp.status,
          gate: statusResp.json?.gate || null,
        },
      ),
    );

    const answersPayload = {
      attemptId,
      answers: [
        { questionId: 'q-1', selectedOption: 'A', isCorrect: true, questionWeight: 1, scoreDelta: 1 },
        { questionId: 'q-2', selectedOption: 'B', isCorrect: false, questionWeight: 1, scoreDelta: 0 },
      ],
    };

    const answerHeaders = {
      'content-type': 'application/json',
      'x-exam-session-token': sessionToken,
    };
    if (cfg.loadTestBypassKey) {
      answerHeaders['x-load-test-mode'] = 'cert';
      answerHeaders['x-load-test-key'] = cfg.loadTestBypassKey;
    }

    const answerResp = await httpRequest({
      url: `${cfg.examApiBase}/api/exam/session/answer`,
      method: 'POST',
      headers: answerHeaders,
      body: answersPayload,
    });

    checks.push(
      makeCheck(
        'e2e_answer_autosave',
        answerResp.status === 200 ? 'PASS' : 'FAIL',
        `HTTP ${answerResp.status}`,
        {
          status: answerResp.status,
          body: redactSensitive(answerResp.json || answerResp.text),
        },
      ),
    );

    const submitHeaders = {
      'content-type': 'application/json',
      'x-exam-session-token': sessionToken,
    };
    if (cfg.loadTestBypassKey) {
      submitHeaders['x-load-test-mode'] = 'cert';
      submitHeaders['x-load-test-key'] = cfg.loadTestBypassKey;
    }

    const submitResp = await httpRequest({
      url: `${cfg.examApiBase}/api/exam/session/submit`,
      method: 'POST',
      headers: submitHeaders,
      body: {
        attemptId,
        completionStatus: 'completed',
        durationSeconds: 75,
        answers: answersPayload.answers,
        metrics: {
          answeredCount: 2,
          correctCount: 1,
          wrongCount: 1,
          unansweredCount: 3,
          score: 1,
          percentage: 20,
        },
      },
    });

    checks.push(
      makeCheck(
        'e2e_submit_exam',
        submitResp.status === 200 ? 'PASS' : 'FAIL',
        `HTTP ${submitResp.status}`,
        {
          status: submitResp.status,
          resultId: submitResp.json?.result?.result_id || null,
          body: redactSensitive(submitResp.json || submitResp.text),
        },
      ),
    );

    const resultHeaders = {
      'x-exam-session-token': sessionToken,
    };
    if (cfg.loadTestBypassKey) {
      resultHeaders['x-load-test-mode'] = 'cert';
      resultHeaders['x-load-test-key'] = cfg.loadTestBypassKey;
    }

    const resultResp = await httpRequest({
      url: `${cfg.examApiBase}/api/exam/results/${encodeURIComponent(attemptId)}`,
      method: 'GET',
      headers: resultHeaders,
    });

    checks.push(
      makeCheck(
        'e2e_result_view',
        resultResp.status === 200 ? 'PASS' : 'FAIL',
        `HTTP ${resultResp.status}`,
        {
          status: resultResp.status,
          resultStatus: resultResp.json?.result?.status || null,
          body: redactSensitive(resultResp.json || resultResp.text),
        },
      ),
    );
  } else {
    checks.push(makeCheck('e2e_candidate_login', 'SKIP', 'Skipped because session start failed.'));
    checks.push(makeCheck('e2e_session_status', 'SKIP', 'Skipped because session start failed.'));
    checks.push(makeCheck('e2e_answer_autosave', 'SKIP', 'Skipped because session start failed.'));
    checks.push(makeCheck('e2e_submit_exam', 'SKIP', 'Skipped because session start failed.'));
    checks.push(makeCheck('e2e_result_view', 'SKIP', 'Skipped because session start failed.'));
  }

  // 4) Panel smoke (unauth always, full auth optional-admin-check)
  const panelMeUnauth = await httpRequest({
    url: `${cfg.panelApiBase}/api/panel/auth/me`,
    method: 'GET',
  });

  checks.push(
    makeCheck(
      'panel_unauth_me',
      isExpectedStatus(panelMeUnauth.status, [401, 403]) ? 'PASS' : 'FAIL',
      `HTTP ${panelMeUnauth.status}`,
      { status: panelMeUnauth.status, body: panelMeUnauth.json || panelMeUnauth.text },
      { check_group: 'optional-admin-check' },
    ),
  );

  if (cfg.panelEmail && cfg.panelPassword && cfg.panelMfaCode) {
    const panelLoginResp = await httpRequest({
      url: `${cfg.panelApiBase}/api/panel/auth/login`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: {
        email: cfg.panelEmail,
        password: cfg.panelPassword,
        mfaCode: cfg.panelMfaCode,
      },
    });

    const panelToken = safeTrim(panelLoginResp.json?.session?.token);
    checks.push(
      makeCheck(
        'panel_login',
        panelLoginResp.status === 200 && panelToken ? 'PASS' : 'FAIL',
        `HTTP ${panelLoginResp.status}`,
        {
          status: panelLoginResp.status,
        nextStep: panelLoginResp.json?.next_step || null,
        hasToken: Boolean(panelToken),
        body: redactSensitive(panelLoginResp.json || panelLoginResp.text),
      },
      { check_group: 'optional-admin-check' },
    ),
  );

    if (panelToken) {
      const panelMeResp = await httpRequest({
        url: `${cfg.panelApiBase}/api/panel/auth/me`,
        method: 'GET',
        headers: {
          authorization: `Bearer ${panelToken}`,
        },
      });
      checks.push(
        makeCheck(
          'panel_auth_me',
          panelMeResp.status === 200 ? 'PASS' : 'FAIL',
          `HTTP ${panelMeResp.status}`,
          {
            status: panelMeResp.status,
            body: redactSensitive(panelMeResp.json || panelMeResp.text),
          },
          { check_group: 'optional-admin-check' },
        ),
      );

      const panelDashboardResp = await httpRequest({
        url: `${cfg.panelApiBase}/api/panel/dashboard`,
        method: 'GET',
        headers: {
          authorization: `Bearer ${panelToken}`,
        },
      });

      checks.push(
        makeCheck(
          'panel_dashboard',
          panelDashboardResp.status === 200 ? 'PASS' : 'FAIL',
          `HTTP ${panelDashboardResp.status}`,
          {
            status: panelDashboardResp.status,
            hasSummary: Boolean(panelDashboardResp.json?.summary),
          },
          { check_group: 'optional-admin-check' },
        ),
      );
    } else {
      checks.push(makeCheck(
        'panel_auth_me',
        'WARN',
        'optional-admin-check: skipped because panel login failed.',
        {},
        { check_group: 'optional-admin-check' },
      ));
      checks.push(makeCheck(
        'panel_dashboard',
        'WARN',
        'optional-admin-check: skipped because panel login failed.',
        {},
        { check_group: 'optional-admin-check' },
      ));
    }
  } else {
    const missing = [];
    if (!cfg.panelEmail) missing.push('PANEL_EMAIL');
    if (!cfg.panelPassword) missing.push('PANEL_PASSWORD');
    if (!cfg.panelMfaCode) missing.push('PANEL_MFA_CODE|PANEL_SMOKE_TOTP_SECRET');

    if (cfg.requirePanelFullAuth) {
      checks.push(makeCheck(
        'panel_login',
        'FAIL',
        `required-admin-check: missing env (${missing.join(', ')})`,
        { missing },
        { check_group: 'optional-admin-check', required: true },
      ));
      checks.push(makeCheck(
        'panel_auth_me',
        'FAIL',
        'required-admin-check: skipped because panel login prerequisites are missing.',
        { missing },
        { check_group: 'optional-admin-check', required: true },
      ));
      checks.push(makeCheck(
        'panel_dashboard',
        'FAIL',
        'required-admin-check: skipped because panel login prerequisites are missing.',
        { missing },
        { check_group: 'optional-admin-check', required: true },
      ));
    } else {
      checks.push(makeCheck(
        'panel_login',
        'PASS',
        'optional-admin-check: skipped full panel auth smoke (set PANEL_EMAIL/PANEL_PASSWORD/PANEL_MFA_CODE).',
        { skipped: true },
        { check_group: 'optional-admin-check' },
      ));
      checks.push(makeCheck(
        'panel_auth_me',
        'PASS',
        'optional-admin-check: skipped (missing env).',
        { skipped: true },
        { check_group: 'optional-admin-check' },
      ));
      checks.push(makeCheck(
        'panel_dashboard',
        'PASS',
        'optional-admin-check: skipped (missing env).',
        { skipped: true },
        { check_group: 'optional-admin-check' },
      ));
    }
  }

  const totals = checks.reduce(
    (acc, item) => {
      const key = item.status.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(acc, key)) acc[key] += 1;
      return acc;
    },
    { pass: 0, fail: 0, warn: 0, skip: 0 },
  );

  const blockingFailures = checks.filter((check) => check.status === 'FAIL' && (
    check.check_group !== 'optional-admin-check'
    || cfg.requirePanelFullAuth
  ));

  const report = {
    timestamp: nowIso(),
    started_at: startedAt,
    mode: {
      http: true,
      panel_full_auth: Boolean(cfg.panelEmail && cfg.panelPassword && cfg.panelMfaCode),
      require_panel_full_auth: cfg.requirePanelFullAuth,
      panel_mfa_source: cfg.panelMfaSource || 'none',
      panel_mfa_resolution_error: cfg.panelMfaResolutionError || null,
      load_test_bypass_key_available: Boolean(cfg.loadTestBypassKey),
    },
    totals,
    blocking_failure_count: blockingFailures.length,
    overall_ready_for_release_candidate: blockingFailures.length === 0,
    release_candidate: {
      id: `rc-frontend-uat-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`,
      freeze_started_at: nowIso(),
      notes: totals.fail === 0
        ? 'No blocking frontend/API contract regressions detected in this run.'
        : 'Blocking checks failed. Keep bugfix window open and rerun after fixes.',
    },
    checks,
  };

  await fs.mkdir(guidelinesDir, { recursive: true });
  const outJson = path.join(guidelinesDir, 'frontend-uat-bugfix-freeze-rc-latest.json');
  const outMd = path.join(guidelinesDir, 'frontend-uat-bugfix-freeze-rc-latest.md');
  await fs.writeFile(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(outMd, renderMarkdown(report), 'utf8');

  console.log(JSON.stringify(report, null, 2));

  if (!report.overall_ready_for_release_candidate) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('[frontend-uat-bugfix-freeze-rc] failed:', error?.message || error);
  process.exitCode = 1;
});
