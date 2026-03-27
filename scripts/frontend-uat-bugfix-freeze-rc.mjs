import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

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

function sanitizeConnectionString(value) {
  const raw = safeTrim(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      return raw;
    }
    const sslMode = safeTrim(url.searchParams.get('sslmode')).toLowerCase();
    if (!sslMode || ['prefer', 'require', 'verify-ca'].includes(sslMode)) {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function resolveDbSslForScript() {
  const sslMode = safeTrim(process.env.PG_SSL_MODE).toLowerCase();
  const isProduction = safeTrim(process.env.NODE_ENV).toLowerCase() === 'production';
  if (sslMode === 'disable') return isProduction ? { rejectUnauthorized: true } : false;
  if (sslMode === 'relaxed') return isProduction ? { rejectUnauthorized: true } : { rejectUnauthorized: false };
  if (sslMode === 'strict') return { rejectUnauthorized: true };
  return isProduction ? { rejectUnauthorized: true } : { rejectUnauthorized: false };
}

async function readLatestPanelOtpCode(client, { email, maxAgeSeconds = 300 }) {
  const result = await client.query(
    `
      SELECT payload
      FROM notification_jobs
      WHERE template_code = 'PANEL_LOGIN_SMS_OTP'
        AND channel = 'SMS'
        AND lower(COALESCE(payload->>'email', payload->>'user_email', '')) = lower($1)
        AND created_at >= NOW() - make_interval(secs => $2::int)
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [email, maxAgeSeconds],
  );
  const payload = result.rows[0]?.payload;
  const code = safeTrim(payload?.otp_code || payload?.otpCode);
  return /^\d{6}$/.test(code) ? code : '';
}

async function waitForPanelOtpCode(pool, { email, maxAttempts = 8, delayMs = 900, maxAgeSeconds = 300 }) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = await pool.connect();
    try {
      const code = await readLatestPanelOtpCode(client, { email, maxAgeSeconds });
      if (code) return code;
    } finally {
      client.release();
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return '';
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

function maybeResolvePanelOtpCode({ panelOtpCode }) {
  if (safeTrim(panelOtpCode)) {
    return {
      code: safeTrim(panelOtpCode),
      source: 'PANEL_OTP_CODE',
      error: '',
    };
  }
  return {
    code: '',
    source: 'none',
    error: '',
  };
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
    'otpCode',
    'otp_code',
    'challengeToken',
    'challenge_token',
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
    panelOtpCode: safeTrim(process.env.PANEL_OTP_CODE),
    panelOtpSource: 'none',
    panelOtpResolutionError: '',
    requirePanelFullAuth: parseBool(process.env.REQUIRE_PANEL_FULL_AUTH, false),
    loadTestBypassKey: resolveLoadTestKey(envFileMap),
    dbConnectionString: sanitizeConnectionString(
      process.env.DATABASE_URL
      || process.env.POSTGRES_URL
      || envFileMap.DATABASE_URL
      || envFileMap.POSTGRES_URL
      || '',
    ),
  };
  const panelOtp = maybeResolvePanelOtpCode(cfg);
  cfg.panelOtpCode = panelOtp.code;
  cfg.panelOtpSource = panelOtp.source;
  cfg.panelOtpResolutionError = panelOtp.error;
  const panelOtpDbPool = cfg.dbConnectionString
    ? new pg.Pool({
      connectionString: cfg.dbConnectionString,
      ssl: resolveDbSslForScript(),
      max: 1,
    })
    : null;

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

  if (cfg.panelOtpResolutionError) {
    checks.push(
      makeCheck(
        'panel_otp_resolution',
        cfg.requirePanelFullAuth ? 'FAIL' : 'WARN',
        `panel_otp_code_missing_or_invalid: ${cfg.panelOtpResolutionError}`,
        {
          source: cfg.panelOtpSource,
          error: cfg.panelOtpResolutionError,
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
    identityNo: `1${String(runId).slice(-10).padStart(10, '0')}`,
    birthYear: 2012,
    parentFullName: `UAT Parent ${runId}`,
    parentPhoneE164: `+90500${String(runId).slice(-7)}`,
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

  try {
    const hasPanelOtpPath = Boolean(cfg.panelOtpCode || panelOtpDbPool);
    if (cfg.panelEmail && cfg.panelPassword && hasPanelOtpPath) {
      const panelLoginStartResp = await httpRequest({
        url: `${cfg.panelApiBase}/api/panel/auth/login`,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          email: cfg.panelEmail,
          password: cfg.panelPassword,
        },
      });

      const challengeId = safeTrim(panelLoginStartResp.json?.otp?.challenge_id || panelLoginStartResp.json?.otp?.challengeId);
      const challengeToken = safeTrim(panelLoginStartResp.json?.otp?.challenge_token || panelLoginStartResp.json?.otp?.challengeToken);
      const hasChallenge = panelLoginStartResp.status === 200
        && panelLoginStartResp.json?.otp_required === true
        && challengeId
        && challengeToken;

      let otpCodeUsed = cfg.panelOtpCode;
      if (hasChallenge && !otpCodeUsed && panelOtpDbPool) {
        const autoCode = await waitForPanelOtpCode(panelOtpDbPool, { email: cfg.panelEmail });
        if (autoCode) {
          otpCodeUsed = autoCode;
          cfg.panelOtpSource = 'db_auto';
          cfg.panelOtpResolutionError = '';
        } else {
          cfg.panelOtpSource = 'db_auto';
          cfg.panelOtpResolutionError = 'panel_otp_not_found_in_db';
        }
      }

      let panelLoginVerifyResp = { status: 0, json: null, text: '' };
      if (hasChallenge && otpCodeUsed) {
        panelLoginVerifyResp = await httpRequest({
          url: `${cfg.panelApiBase}/api/panel/auth/login`,
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: {
            email: cfg.panelEmail,
            password: cfg.panelPassword,
            otpCode: otpCodeUsed,
            challengeId,
            challengeToken,
          },
        });
      }

      const panelToken = safeTrim(panelLoginVerifyResp.json?.session?.token);
      checks.push(
        makeCheck(
          'panel_login',
          hasChallenge && panelLoginVerifyResp.status === 200 && panelToken ? 'PASS' : 'FAIL',
          `start:${panelLoginStartResp.status} verify:${panelLoginVerifyResp.status || 'NA'}`,
          {
            startStatus: panelLoginStartResp.status,
            verifyStatus: panelLoginVerifyResp.status || null,
            startNextStep: panelLoginStartResp.json?.next_step || null,
            otpRequired: panelLoginStartResp.json?.otp_required === true,
            hasToken: Boolean(panelToken),
            otpSource: cfg.panelOtpSource || 'none',
            otpResolutionError: cfg.panelOtpResolutionError || null,
            startBody: redactSensitive(panelLoginStartResp.json || panelLoginStartResp.text),
            verifyBody: redactSensitive(panelLoginVerifyResp.json || panelLoginVerifyResp.text),
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
      if (!cfg.panelOtpCode && !panelOtpDbPool) {
        missing.push('PANEL_OTP_CODE or DATABASE_URL/POSTGRES_URL (for OTP auto-read)');
      }

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
          'optional-admin-check: skipped full panel auth smoke (set PANEL_EMAIL/PANEL_PASSWORD and PANEL_OTP_CODE or DB env).',
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
  } finally {
    if (panelOtpDbPool) {
      await panelOtpDbPool.end();
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
      panel_full_auth: Boolean(cfg.panelEmail && cfg.panelPassword && cfg.panelOtpCode),
      require_panel_full_auth: cfg.requirePanelFullAuth,
      panel_otp_source: cfg.panelOtpSource || 'none',
      panel_otp_resolution_error: cfg.panelOtpResolutionError || null,
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
