import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const STATUS = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  WARN: 'WARN',
  SKIP: 'SKIP',
};

const NON_STRICT_SSL_MODES = new Set(['prefer', 'require', 'verify-ca']);

function trim(value) {
  return String(value ?? '').trim();
}

function readEnv(...names) {
  for (const name of names) {
    const value = trim(process.env[name]);
    if (value) return value;
  }
  return '';
}

function normalizeBase(raw, fallback) {
  const value = trim(raw || fallback);
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, '');
  return `https://${value.replace(/\/+$/, '')}`;
}

function parseArgs(argv) {
  const map = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const eqIndex = token.indexOf('=');
    if (eqIndex > -1) {
      map[token.slice(2, eqIndex)] = token.slice(eqIndex + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      map[key] = 'true';
      continue;
    }

    map[key] = next;
    i += 1;
  }
  return map;
}

function readInt(value, fallback, min, max) {
  const parsed = Number.parseInt(trim(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function readBool(value, fallback = false) {
  const raw = trim(value).toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function pushCheck(checks, id, status, detail, evidence = {}) {
  checks.push({ id, status, detail, evidence });
}

function summarize(checks) {
  const totals = { pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const check of checks) {
    if (check.status === STATUS.PASS) totals.pass += 1;
    if (check.status === STATUS.FAIL) totals.fail += 1;
    if (check.status === STATUS.WARN) totals.warn += 1;
    if (check.status === STATUS.SKIP) totals.skip += 1;
  }
  return totals;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function httpJson(url, options = {}) {
  const timeoutMs = readInt(options.timeoutMs, 15000, 500, 120000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latencyMs = Date.now() - startedAt;
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      latency_ms: latencyMs,
      text,
      json,
      error: null,
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      ok: false,
      status: 0,
      latency_ms: Date.now() - startedAt,
      text: '',
      json: null,
      error: error?.message || String(error),
    };
  }
}

function expectStatus(response, expected) {
  return expected.includes(response.status);
}

function sanitizeConnectionString(value) {
  const base = trim(value).replace(/\\n/g, '').replace(/[\r\n]/g, '');
  if (!base) return '';

  try {
    const url = new URL(base);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      return base;
    }

    const sslMode = trim(url.searchParams.get('sslmode')).toLowerCase();
    if (NON_STRICT_SSL_MODES.has(sslMode)) {
      url.searchParams.set('sslmode', 'verify-full');
    } else if (!sslMode) {
      url.searchParams.set('sslmode', 'verify-full');
    }

    return url.toString();
  } catch {
    return base;
  }
}

function resolveDbSslForScript() {
  const sslMode = trim(process.env.PG_SSL_MODE).toLowerCase();
  const isProduction = trim(process.env.NODE_ENV).toLowerCase() === 'production';

  if (sslMode === 'disable') {
    if (isProduction) {
      throw new Error('PG_SSL_MODE=disable is not allowed in production.');
    }
    return false;
  }

  if (sslMode === 'relaxed') {
    if (isProduction) {
      throw new Error('PG_SSL_MODE=relaxed is not allowed in production.');
    }
    return { rejectUnauthorized: false };
  }

  if (sslMode === 'strict') {
    return { rejectUnauthorized: true };
  }

  if (!sslMode) {
    return isProduction ? { rejectUnauthorized: true } : { rejectUnauthorized: false };
  }

  throw new Error('Invalid PG_SSL_MODE. Allowed values: strict, relaxed, disable.');
}

async function readLatestPanelOtpCode(client, { recipient, maxAgeSeconds = 300 }) {
  const result = await client.query(
    `
      SELECT payload
      FROM notification_jobs
      WHERE template_code = 'PANEL_LOGIN_SMS_OTP'
        AND channel = 'SMS'
        AND recipient = $1
        AND created_at >= NOW() - make_interval(secs => $2::int)
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [recipient, maxAgeSeconds],
  );
  const payload = result.rows[0]?.payload;
  const code = trim(payload?.otp_code || payload?.otpCode);
  return /^\d{6}$/.test(code) ? code : '';
}

async function waitForPanelOtpCode(pool, { recipient, maxAttempts = 8, delayMs = 900, maxAgeSeconds = 300 }) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = await pool.connect();
    try {
      const code = await readLatestPanelOtpCode(client, { recipient, maxAgeSeconds });
      if (code) return code;
    } finally {
      client.release();
    }
    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }
  return '';
}

async function readAdminUserColumnAvailability(client) {
  const result = await client.query(
    `
      SELECT
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'admin_users'
            AND column_name = 'password_reset_required'
        ) AS has_password_reset_required,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'admin_users'
            AND column_name = 'password_updated_at'
        ) AS has_password_updated_at
    `,
  );

  return {
    hasPasswordResetRequired: Boolean(result.rows[0]?.has_password_reset_required),
    hasPasswordUpdatedAt: Boolean(result.rows[0]?.has_password_updated_at),
  };
}

async function createTempPanelUser({ connectionString, runId }) {
  const pool = new pg.Pool({
    connectionString,
    ssl: resolveDbSslForScript(),
  });

  const email = `cutover.smoke.${Date.now()}@teachera.com.tr`;
  const password = `CutoverSm0ke!${Math.floor(Math.random() * 100000)}`;
  const fullName = `Cutover Smoke ${runId}`;
  const role = 'SUPER_ADMIN';
  const phoneE164 = `+90540${String(Date.now()).slice(-7)}`;

  const client = await pool.connect();
  let userId;

  try {
    await client.query('BEGIN');
    const availability = await readAdminUserColumnAvailability(client);

    await client.query(
      `
        INSERT INTO roles (code, name)
        VALUES ($1, $2)
        ON CONFLICT (code)
        DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
      `,
      [role, role.replace('_', ' ')],
    );

    const userResult = await client.query(
      `
        INSERT INTO admin_users (
          email,
          full_name,
          password_hash,
          ${availability.hasPasswordResetRequired ? 'password_reset_required,' : ''}
          ${availability.hasPasswordUpdatedAt ? 'password_updated_at,' : ''}
          phone_e164,
          status,
          mfa_enabled,
          mfa_totp_secret,
          updated_at
        )
        VALUES (
          lower($1),
          $2,
          crypt($3, gen_salt('bf', 12)),
          ${availability.hasPasswordResetRequired ? '$4,' : ''}
          ${availability.hasPasswordUpdatedAt ? 'NOW(),' : ''}
          $5,
          'ACTIVE',
          FALSE,
          NULL,
          NOW()
        )
        ON CONFLICT (email)
        DO UPDATE SET
          full_name = EXCLUDED.full_name,
          password_hash = EXCLUDED.password_hash,
          ${availability.hasPasswordResetRequired ? 'password_reset_required = EXCLUDED.password_reset_required,' : ''}
          ${availability.hasPasswordUpdatedAt ? 'password_updated_at = EXCLUDED.password_updated_at,' : ''}
          phone_e164 = EXCLUDED.phone_e164,
          status = 'ACTIVE',
          mfa_enabled = FALSE,
          mfa_totp_secret = NULL,
          updated_at = NOW()
        RETURNING id, email, phone_e164
      `,
      [email, fullName, password, false, phoneE164],
    );

    userId = userResult.rows[0]?.id || '';
    if (!userId) throw new Error('failed_to_create_temp_panel_user');

    await client.query(
      `
        DELETE FROM admin_user_roles
        WHERE admin_user_id = $1::uuid
      `,
      [userId],
    );

    await client.query(
      `
        INSERT INTO admin_user_roles (admin_user_id, role_id)
        SELECT $1::uuid, r.id
        FROM roles r
        WHERE r.code = $2
      `,
      [userId, role],
    );

    await client.query('COMMIT');

    return {
      email,
      password,
      phoneE164: trim(userResult.rows[0]?.phone_e164) || phoneE164,
      userId,
      role,
      pool,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    await pool.end();
    throw error;
  } finally {
    client.release();
  }
}

async function disableTempPanelUser({ pool, userId }) {
  if (!pool || !userId) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        UPDATE admin_users
        SET status = 'DISABLED',
            mfa_enabled = FALSE,
            mfa_totp_secret = NULL,
            phone_e164 = NULL,
            updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [userId],
    );
    await client.query(
      `
        DELETE FROM admin_user_roles
        WHERE admin_user_id = $1::uuid
      `,
      [userId],
    );
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

function buildExamStartPayload(runId) {
  return {
    campaignCode: `CUTOVER_${runId}`,
    studentFullName: `Cutover Student ${runId}`,
    parentFullName: `Cutover Parent ${runId}`,
    parentPhoneE164: `+9055512${String(Date.now()).slice(-5)}`,
    parentEmail: `cutover-${runId}@example.test`,
    schoolName: 'Cutover Smoke School',
    grade: 8,
    ageRange: '13-14',
    language: 'EN',
    source: 'cutover_hypercare_drill',
    bankKey: 'placement_en_default',
    questionCount: 60,
    consent: {
      kvkkApproved: true,
      contactConsent: true,
      consentVersion: 'KVKK_v1_2026-03-13',
      legalTextVersion: 'KVKK_v1_2026-03-13',
      source: 'cutover_hypercare_drill',
    },
    kvkkConsent: true,
    kvkkConsentVersion: 'KVKK_v1_2026-03-13',
    kvkkLegalTextVersion: 'KVKK_v1_2026-03-13',
    contactConsent: true,
  };
}

async function runCutoverChecks({ config, runId, checks, evidence }) {
  const targetChecks = [
    {
      id: 'cutover_www_route',
      url: `${config.wwwBase}/bursluluk-2026`,
      expected: [200],
    },
    {
      id: 'cutover_exam_health',
      url: `${config.examBase}/api/health`,
      expected: [200],
    },
    {
      id: 'cutover_panel_me_unauth',
      url: `${config.panelBase}/api/panel/auth/me`,
      expected: [401, 403],
    },
    {
      id: 'cutover_ops_health',
      url: `${config.opsBase}/api/health`,
      expected: [200],
    },
  ];

  for (const target of targetChecks) {
    const response = await httpJson(target.url, { timeoutMs: config.timeoutMs });
    const status = expectStatus(response, target.expected) ? STATUS.PASS : STATUS.FAIL;
    pushCheck(checks, target.id, status, `HTTP ${response.status}`, {
      url: target.url,
      status: response.status,
      expected: target.expected,
      latency_ms: response.latency_ms,
      error: response.error,
    });
  }

  const startHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (config.loadTestKey) {
    startHeaders['x-load-test-key'] = config.loadTestKey;
    startHeaders['x-load-test-mode'] = 'throughput';
    startHeaders['x-load-test-ip'] = '198.18.11.11';
    startHeaders['x-forwarded-for'] = '198.18.11.11';
  }

  const startResp = await httpJson(`${config.examBase}/api/exam/session/start`, {
    method: 'POST',
    headers: startHeaders,
    body: JSON.stringify(buildExamStartPayload(runId)),
    timeoutMs: config.timeoutMs,
  });

  let attemptId = '';
  let sessionToken = '';
  if (startResp.ok) {
    attemptId = trim(startResp.json?.session?.attemptId);
    sessionToken = trim(startResp.json?.session?.sessionToken);
  }

  const startOk = startResp.ok && attemptId && sessionToken;
  pushCheck(
    checks,
    'cutover_exam_start_flow',
    startOk ? STATUS.PASS : STATUS.FAIL,
    startOk ? 'exam session start succeeded.' : `start failed (HTTP ${startResp.status}).`,
    {
      http_status: startResp.status,
      error: startResp.error,
      code: trim(startResp.json?.error),
    },
  );

  if (startOk) {
    const authHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-exam-session-token': sessionToken,
    };
    if (config.loadTestKey) {
      authHeaders['x-load-test-key'] = config.loadTestKey;
      authHeaders['x-load-test-mode'] = 'throughput';
      authHeaders['x-load-test-ip'] = '198.18.11.12';
      authHeaders['x-forwarded-for'] = '198.18.11.12';
    }

    const answerResp = await httpJson(`${config.examBase}/api/exam/session/answer`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        attemptId,
        answers: [{
          questionId: 'cutover-q1',
          selectedOption: 'A',
          isCorrect: true,
          questionWeight: 1,
          scoreDelta: 1,
        }],
      }),
      timeoutMs: config.timeoutMs,
    });

    pushCheck(
      checks,
      'cutover_exam_answer_flow',
      answerResp.ok ? STATUS.PASS : STATUS.FAIL,
      answerResp.ok ? 'answer accepted.' : `answer failed (HTTP ${answerResp.status}).`,
      { http_status: answerResp.status, error: answerResp.error, code: trim(answerResp.json?.error) },
    );

    const submitResp = await httpJson(`${config.examBase}/api/exam/session/submit`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        attemptId,
        completionStatus: 'completed',
        durationSeconds: 120,
        answers: [{
          questionId: 'cutover-q1',
          selectedOption: 'A',
          isCorrect: true,
          questionWeight: 1,
          scoreDelta: 1,
        }],
        metrics: {
          answeredCount: 1,
          correctCount: 1,
          wrongCount: 0,
          unansweredCount: 59,
          score: 1,
          percentage: 1.67,
        },
      }),
      timeoutMs: config.timeoutMs,
    });

    pushCheck(
      checks,
      'cutover_exam_submit_flow',
      submitResp.ok ? STATUS.PASS : STATUS.FAIL,
      submitResp.ok ? 'submit accepted.' : `submit failed (HTTP ${submitResp.status}).`,
      { http_status: submitResp.status, error: submitResp.error, code: trim(submitResp.json?.error) },
    );

    const resultsResp = await httpJson(
      `${config.examBase}/api/exam/results/${encodeURIComponent(attemptId)}?include_pii=0`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-exam-session-token': sessionToken,
          ...(config.loadTestKey ? { 'x-load-test-key': config.loadTestKey } : {}),
        },
        timeoutMs: config.timeoutMs,
      },
    );

    const resultsOk = resultsResp.ok && trim(resultsResp.json?.result?.attempt_id) === attemptId;
    pushCheck(
      checks,
      'cutover_exam_results_flow',
      resultsOk ? STATUS.PASS : STATUS.FAIL,
      resultsOk ? 'results fetched successfully.' : `results failed (HTTP ${resultsResp.status}).`,
      { http_status: resultsResp.status, error: resultsResp.error, code: trim(resultsResp.json?.error) },
    );
  } else {
    pushCheck(checks, 'cutover_exam_answer_flow', STATUS.SKIP, 'Skipped because start flow failed.');
    pushCheck(checks, 'cutover_exam_submit_flow', STATUS.SKIP, 'Skipped because start flow failed.');
    pushCheck(checks, 'cutover_exam_results_flow', STATUS.SKIP, 'Skipped because start flow failed.');
  }

  const dbConnection = sanitizeConnectionString(readEnv('DATABASE_URL', 'POSTGRES_URL'));
  let tempUser = null;

  if (!dbConnection) {
    pushCheck(
      checks,
      'cutover_panel_login_dashboard',
      STATUS.WARN,
      'Panel login/dashboard smoke skipped (DATABASE_URL/POSTGRES_URL not set for temporary user creation).',
    );
  } else {
    try {
      tempUser = await createTempPanelUser({ connectionString: dbConnection, runId });
      const loginStartResp = await httpJson(`${config.panelBase}/api/panel/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          email: tempUser.email,
          password: tempUser.password,
        }),
        timeoutMs: config.timeoutMs,
      });

      const challengeId = trim(loginStartResp.json?.otp?.challenge_id || loginStartResp.json?.otp?.challengeId);
      const challengeToken = trim(loginStartResp.json?.otp?.challenge_token || loginStartResp.json?.otp?.challengeToken);
      const loginStartOk = loginStartResp.ok
        && loginStartResp.json?.otp_required === true
        && Boolean(challengeId)
        && Boolean(challengeToken);
      const otpCode = loginStartOk
        ? await waitForPanelOtpCode(tempUser.pool, { recipient: tempUser.phoneE164 })
        : '';

      const loginVerifyResp = loginStartOk && otpCode
        ? await httpJson(`${config.panelBase}/api/panel/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              email: tempUser.email,
              password: tempUser.password,
              otpCode,
              challengeId,
              challengeToken,
            }),
            timeoutMs: config.timeoutMs,
          })
        : null;

      const panelToken = trim(loginVerifyResp?.json?.session?.token);
      const loginOk = loginStartOk && Boolean(otpCode) && Boolean(loginVerifyResp?.ok) && Boolean(panelToken);

      const meResp = loginOk
        ? await httpJson(`${config.panelBase}/api/panel/auth/me`, {
            method: 'GET',
            headers: { Accept: 'application/json', Authorization: `Bearer ${panelToken}` },
            timeoutMs: config.timeoutMs,
          })
        : null;

      const dashboardResp = loginOk
        ? await httpJson(`${config.panelBase}/api/panel/dashboard`, {
            method: 'GET',
            headers: { Accept: 'application/json', Authorization: `Bearer ${panelToken}` },
            timeoutMs: config.timeoutMs,
          })
        : null;

      const logoutResp = loginOk
        ? await httpJson(`${config.panelBase}/api/panel/auth/logout`, {
            method: 'POST',
            headers: { Accept: 'application/json', Authorization: `Bearer ${panelToken}` },
            timeoutMs: config.timeoutMs,
          })
        : null;

      const panelFlowOk =
        loginOk
        && meResp?.status === 200
        && dashboardResp?.status === 200
        && logoutResp?.status === 200;

      pushCheck(
        checks,
        'cutover_panel_login_dashboard',
        panelFlowOk ? STATUS.PASS : STATUS.FAIL,
        panelFlowOk
          ? 'Panel login -> auth/me -> dashboard -> logout flow succeeded.'
          : 'Panel login/dashboard flow failed.',
        {
          login_start_status: loginStartResp.status,
          login_verify_status: loginVerifyResp?.status ?? null,
          otp_code_found: Boolean(otpCode),
          me_status: meResp?.status ?? null,
          dashboard_status: dashboardResp?.status ?? null,
          logout_status: logoutResp?.status ?? null,
        },
      );

      evidence.panel_smoke = {
        temp_user_email: tempUser.email,
        temp_user_phone: tempUser.phoneE164,
        login_start_status: loginStartResp.status,
        login_verify_status: loginVerifyResp?.status ?? null,
        otp_code_found: Boolean(otpCode),
        me_status: meResp?.status ?? null,
        dashboard_status: dashboardResp?.status ?? null,
        logout_status: logoutResp?.status ?? null,
      };
    } catch (error) {
      pushCheck(
        checks,
        'cutover_panel_login_dashboard',
        STATUS.FAIL,
        `Panel login/dashboard smoke failed: ${error?.message || String(error)}`,
      );
    } finally {
      if (tempUser?.pool && tempUser?.userId) {
        await disableTempPanelUser({ pool: tempUser.pool, userId: tempUser.userId });
      }
    }
  }

  const invalidWorkerResp = await httpJson(`${config.opsBase}/api/notifications/worker`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer invalid-secret',
    },
    body: JSON.stringify({}),
    timeoutMs: config.timeoutMs,
  });

  pushCheck(
    checks,
    'cutover_worker_auth_guard',
    invalidWorkerResp.status === 401 ? STATUS.PASS : STATUS.FAIL,
    invalidWorkerResp.status === 401
      ? 'Worker rejects invalid secret (401).'
      : `Unexpected worker invalid-secret status ${invalidWorkerResp.status}.`,
    {
      http_status: invalidWorkerResp.status,
      code: trim(invalidWorkerResp.json?.error),
    },
  );

  if (!config.workerSecret) {
    pushCheck(
      checks,
      'cutover_worker_valid_secret',
      STATUS.WARN,
      'Skipped: worker secret missing (NOTIFICATION_WORKER_SECRET/CRON_SECRET).',
    );
  } else {
    const validWorkerResp = await httpJson(`${config.opsBase}/api/notifications/worker?limit=5&reconcile_limit=5`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.workerSecret}`,
      },
      body: JSON.stringify({ limit: 5, reconcile_limit: 5 }),
      timeoutMs: config.timeoutMs,
    });

    pushCheck(
      checks,
      'cutover_worker_valid_secret',
      validWorkerResp.status === 200 ? STATUS.PASS : STATUS.FAIL,
      validWorkerResp.status === 200
        ? 'Worker accepts valid secret (200).'
        : `Worker valid-secret check failed with ${validWorkerResp.status}.`,
      {
        http_status: validWorkerResp.status,
        code: trim(validWorkerResp.json?.error),
      },
    );
  }

  const missingSigResp = await httpJson(`${config.opsBase}/api/notifications/provider-webhook`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'DELIVERED', provider_message_id: `cutover-missing-sig-${runId}` }),
    timeoutMs: config.timeoutMs,
  });

  pushCheck(
    checks,
    'cutover_webhook_signature_guard',
    missingSigResp.status === 401 ? STATUS.PASS : STATUS.FAIL,
    missingSigResp.status === 401
      ? 'Webhook rejects missing signature (401).'
      : `Unexpected webhook missing-signature status ${missingSigResp.status}.`,
    {
      http_status: missingSigResp.status,
      code: trim(missingSigResp.json?.error),
    },
  );

  if (!config.webhookSecret) {
    pushCheck(
      checks,
      'cutover_webhook_valid_signature',
      STATUS.WARN,
      'Skipped: webhook secret missing (NOTIFICATION_PROVIDER_WEBHOOK_SECRET).',
    );
  } else {
    const webhookBody = JSON.stringify({
      status: 'DELIVERED',
      provider_message_id: `cutover-valid-sig-${runId}`,
      event_payload: { source: 'cutover_hypercare_drill' },
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sigHex = createHmac('sha256', config.webhookSecret)
      .update(`${timestamp}.${webhookBody}`)
      .digest('hex');

    const validSigResp = await httpJson(`${config.opsBase}/api/notifications/provider-webhook`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': `sha256=${sigHex}`,
      },
      body: webhookBody,
      timeoutMs: config.timeoutMs,
    });

    pushCheck(
      checks,
      'cutover_webhook_valid_signature',
      [200, 202].includes(validSigResp.status) ? STATUS.PASS : STATUS.FAIL,
      [200, 202].includes(validSigResp.status)
        ? `Webhook accepted signed callback (${validSigResp.status}).`
        : `Webhook valid signature failed (${validSigResp.status}).`,
      {
        http_status: validSigResp.status,
        code: trim(validSigResp.json?.error),
      },
    );
  }
}

function runAwsJson(region, argsList) {
  const output = execFileSync('aws', [...argsList, '--region', region, '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

async function runHypercareChecks({ config, checks, evidence }) {
  const sampleCount = Math.max(1, Math.floor((config.hypercareMinutes * 60) / config.sampleEverySeconds));
  const incidents = [];
  const samples = [];

  for (let i = 0; i < sampleCount; i += 1) {
    const sample = {
      sample_index: i + 1,
      sampled_at_utc: new Date().toISOString(),
      endpoints: {},
    };

    const targets = [
      { key: 'www', url: `${config.wwwBase}/`, expected: [200, 301, 302, 308] },
      { key: 'exam_health', url: `${config.examBase}/api/health`, expected: [200] },
      { key: 'panel_me_unauth', url: `${config.panelBase}/api/panel/auth/me`, expected: [401, 403] },
      { key: 'ops_health', url: `${config.opsBase}/api/health`, expected: [200] },
    ];

    for (const target of targets) {
      const response = await httpJson(target.url, { timeoutMs: config.timeoutMs });
      sample.endpoints[target.key] = {
        url: target.url,
        status: response.status,
        latency_ms: response.latency_ms,
        expected: target.expected,
        error: response.error,
      };

      const expectedOk = expectStatus(response, target.expected);
      const critical = !expectedOk || response.status >= 500 || response.status === 0;
      if (critical) {
        incidents.push({
          type: 'http',
          target: target.key,
          sample_index: i + 1,
          status: response.status,
          error: response.error,
        });
      }
    }

    samples.push(sample);

    if (i + 1 < sampleCount) {
      await sleep(config.sampleEverySeconds * 1000);
    }
  }

  evidence.hypercare_samples = samples;

  pushCheck(
    checks,
    'hypercare_http_window',
    incidents.length === 0 ? STATUS.PASS : STATUS.FAIL,
    incidents.length === 0
      ? `Hypercare drill window clean (${sampleCount} samples, ${config.hypercareMinutes}m).`
      : `Hypercare drill detected ${incidents.length} critical HTTP incident(s).`,
    {
      sample_count: sampleCount,
      window_minutes: config.hypercareMinutes,
      incidents: incidents.slice(0, 20),
    },
  );

  if (!config.enableAwsChecks) {
    pushCheck(
      checks,
      'hypercare_alarm_state',
      STATUS.SKIP,
      'AWS alarm checks skipped (run with --aws).',
    );
    return;
  }

  try {
    runAwsJson(config.awsRegion, ['sts', 'get-caller-identity']);

    const alarms = runAwsJson(config.awsRegion, [
      'cloudwatch',
      'describe-alarms',
      '--alarm-name-prefix',
      config.alarmPrefix,
      '--max-records',
      '100',
    ]);

    const metricAlarms = Array.isArray(alarms?.MetricAlarms) ? alarms.MetricAlarms : [];
    const currentlyAlarm = metricAlarms.filter((item) => trim(item?.StateValue).toUpperCase() === 'ALARM');
    const missingDataAlarms = currentlyAlarm.filter((item) =>
      trim(item?.StateReason).toLowerCase().includes('missing datapoints were treated as [breaching]'));
    const criticalAlarms = currentlyAlarm.filter((item) => !missingDataAlarms.includes(item));

    const status = criticalAlarms.length === 0 ? STATUS.PASS : STATUS.FAIL;
    const detail = criticalAlarms.length === 0
      ? `No critical alarms in ALARM state for prefix ${config.alarmPrefix} (missing-data alarms: ${missingDataAlarms.length}).`
      : `${criticalAlarms.length} critical alarm(s) currently in ALARM state.`;

    pushCheck(
      checks,
      'hypercare_alarm_state',
      status,
      detail,
      {
        region: config.awsRegion,
        alarm_prefix: config.alarmPrefix,
        alarm_total: metricAlarms.length,
        alarm_state_alarm_count: currentlyAlarm.length,
        alarm_state_alarm_names: currentlyAlarm.map((item) => item.AlarmName).slice(0, 20),
        missing_data_alarm_count: missingDataAlarms.length,
        critical_alarm_count: criticalAlarms.length,
        critical_alarm_names: criticalAlarms.map((item) => item.AlarmName).slice(0, 20),
      },
    );
  } catch (error) {
    pushCheck(
      checks,
      'hypercare_alarm_state',
      STATUS.FAIL,
      `AWS alarm state check failed: ${error?.message || String(error)}`,
      {
        region: config.awsRegion,
        alarm_prefix: config.alarmPrefix,
      },
    );
  }
}

function parseVercelDeployments(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const urls = [];
  for (const line of lines) {
    if (/^https:\/\/[^\s]+\.vercel\.app$/i.test(line)) {
      urls.push(line);
    }
  }
  return Array.from(new Set(urls));
}

function listProjectDeployments(cwdPath) {
  const output = execFileSync('npx', ['--yes', 'vercel', 'ls', '--cwd', cwdPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return parseVercelDeployments(output);
}

async function runRollbackDryRun({ config, checks, evidence }) {
  const services = [
    {
      id: 'www',
      cwd: resolve(ROOT, 'apps/www'),
      domain: 'teachera.com.tr',
      healthPath: '/',
      expected: [200, 301, 302, 308, 401, 403],
    },
    {
      id: 'exam-api',
      cwd: resolve(ROOT, 'apps/exam-api'),
      domain: 'exam-api.teachera.com.tr',
      healthPath: '/api/health',
      expected: [200, 401, 403],
    },
    {
      id: 'panel-api',
      cwd: resolve(ROOT, 'apps/panel-api'),
      domain: 'panel-api.teachera.com.tr',
      healthPath: '/api/panel/auth/me',
      expected: [200, 401, 403],
    },
    {
      id: 'ops-api',
      cwd: resolve(ROOT, 'apps/ops-api'),
      domain: 'ops-api.teachera.com.tr',
      healthPath: '/api/health',
      expected: [200, 401, 403],
    },
  ];

  const dryRun = {
    candidates: {},
    simulated_commands: [],
    candidate_health: {},
  };

  let candidateFailures = 0;
  for (const service of services) {
    try {
      const urls = listProjectDeployments(service.cwd);
      dryRun.candidates[service.id] = {
        current_candidate: urls[0] || null,
        rollback_candidate: urls[1] || null,
        candidate_count: urls.length,
      };

      if (!urls[1]) {
        candidateFailures += 1;
      } else {
        dryRun.simulated_commands.push(`vercel alias set ${urls[1]} ${service.domain}`);
      }
    } catch (error) {
      candidateFailures += 1;
      dryRun.candidates[service.id] = {
        current_candidate: null,
        rollback_candidate: null,
        candidate_count: 0,
        error: error?.message || String(error),
      };
    }
  }

  pushCheck(
    checks,
    'rollback_candidate_selection',
    candidateFailures === 0 ? STATUS.PASS : STATUS.FAIL,
    candidateFailures === 0
      ? 'Rollback candidates found for all services (dry-run only).'
      : `Rollback candidate missing for ${candidateFailures} service(s).`,
    dryRun.candidates,
  );

  let candidateHealthFailures = 0;
  for (const service of services) {
    const rollbackCandidate = dryRun.candidates[service.id]?.rollback_candidate;
    if (!rollbackCandidate) {
      dryRun.candidate_health[service.id] = { skipped: true, reason: 'missing_rollback_candidate' };
      continue;
    }

    const response = await httpJson(`${rollbackCandidate}${service.healthPath}`, { timeoutMs: config.timeoutMs });
    const ok = expectStatus(response, service.expected);
    if (!ok) candidateHealthFailures += 1;

    dryRun.candidate_health[service.id] = {
      url: `${rollbackCandidate}${service.healthPath}`,
      status: response.status,
      expected: service.expected,
      latency_ms: response.latency_ms,
      error: response.error,
    };
  }

  pushCheck(
    checks,
    'rollback_candidate_health',
    candidateHealthFailures === 0 ? STATUS.PASS : STATUS.FAIL,
    candidateHealthFailures === 0
      ? 'Rollback candidate health checks are acceptable (dry-run).'
      : `${candidateHealthFailures} rollback candidate health check(s) failed.`,
    dryRun.candidate_health,
  );

  const postTargets = [
    { id: 'www_after_dry_run', url: `${config.wwwBase}/`, expected: [200, 301, 302, 308] },
    { id: 'exam_after_dry_run', url: `${config.examBase}/api/health`, expected: [200] },
    { id: 'ops_after_dry_run', url: `${config.opsBase}/api/health`, expected: [200] },
  ];

  let postFailures = 0;
  const postEvidence = {};
  for (const target of postTargets) {
    const response = await httpJson(target.url, { timeoutMs: config.timeoutMs });
    const ok = expectStatus(response, target.expected);
    if (!ok) postFailures += 1;

    postEvidence[target.id] = {
      status: response.status,
      expected: target.expected,
      latency_ms: response.latency_ms,
      error: response.error,
    };
  }

  pushCheck(
    checks,
    'rollback_post_dry_run_stability',
    postFailures === 0 ? STATUS.PASS : STATUS.FAIL,
    postFailures === 0
      ? 'Primary domains remained stable after rollback dry-run simulation.'
      : `${postFailures} post dry-run stability check(s) failed.`,
    postEvidence,
  );

  evidence.rollback_dry_run = dryRun;
}

function buildMarkdownReport(output) {
  const lines = [
    '# P0-12 Cutover + Hypercare + Rollback Drill Report',
    '',
    `- Generated (UTC): \`${output.generated_at_utc}\``,
    `- Run ID: \`${output.run_id}\``,
    `- Overall Ready: \`${output.overall_ready_for_p0_12_cutover_hypercare_rollback}\``,
    `- Hypercare Window (drill): **${output.config.hypercare_minutes} minute(s)**`,
    '',
    '## Check Summary',
    `- PASS: **${output.totals.pass}**`,
    `- FAIL: **${output.totals.fail}**`,
    `- WARN: **${output.totals.warn}**`,
    `- SKIP: **${output.totals.skip}**`,
    '',
    '## Checks',
    '| Check | Status | Detail |',
    '|---|---|---|',
  ];

  for (const check of output.checks) {
    lines.push(`| ${check.id} | ${check.status} | ${String(check.detail).replace(/\|/g, '/')} |`);
  }

  lines.push('');
  return lines.join('\n');
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const runId = new Date().toISOString().replace(/[:.]/g, '-');

  const config = {
    runId,
    wwwBase: normalizeBase(cli.www_base_url || readEnv('WWW_BASE_URL'), 'https://teachera.com.tr'),
    examBase: normalizeBase(cli.exam_api_base_url || readEnv('EXAM_API_BASE_URL'), 'https://exam-api.teachera.com.tr'),
    panelBase: normalizeBase(cli.panel_api_base_url || readEnv('PANEL_API_BASE_URL'), 'https://panel-api.teachera.com.tr'),
    opsBase: normalizeBase(cli.ops_api_base_url || readEnv('OPS_API_BASE_URL'), 'https://ops-api.teachera.com.tr'),
    loadTestKey: trim(cli.load_test_key || readEnv('P0_11_LOAD_TEST_KEY', 'LOAD_TEST_BYPASS_KEY', 'CRON_SECRET')),
    workerSecret: trim(cli.worker_secret || readEnv('NOTIFICATION_WORKER_SECRET', 'CRON_SECRET')),
    webhookSecret: trim(cli.webhook_secret || readEnv('NOTIFICATION_PROVIDER_WEBHOOK_SECRET')),
    hypercareMinutes: readInt(cli.hypercare_minutes || readEnv('P0_12_HYPERCARE_MINUTES'), 8, 1, 48 * 60),
    sampleEverySeconds: readInt(cli.sample_every_seconds || readEnv('P0_12_HYPERCARE_SAMPLE_SECONDS'), 30, 10, 300),
    timeoutMs: readInt(cli.timeout_ms || readEnv('P0_12_TIMEOUT_MS'), 15000, 2000, 120000),
    enableAwsChecks: readBool(cli.aws, false),
    awsRegion: trim(cli.aws_region || readEnv('AWS_REGION', 'AWS_DEFAULT_REGION', 'OBSERVABILITY_AWS_REGION') || 'eu-north-1'),
    alarmPrefix: trim(cli.alarm_prefix || readEnv('OBSERVABILITY_ALARM_PREFIX') || 'teachera-p0-10'),
  };

  const checks = [];
  const evidence = {};

  const existingP012AuditPath = resolve(ROOT, 'guidelines/p0-12-go-live-package-audit-latest.json');
  if (existsSync(existingP012AuditPath)) {
    try {
      const audit = JSON.parse(readFileSync(existingP012AuditPath, 'utf8'));
      const ready = Boolean(audit?.overall_ready_for_p0_12);
      pushCheck(
        checks,
        'cutover_package_audit_latest',
        ready ? STATUS.PASS : STATUS.FAIL,
        ready ? 'Latest P0-12 package audit is ready.' : 'Latest P0-12 package audit is not ready.',
        {
          path: existingP012AuditPath,
          timestamp: audit?.timestamp || null,
          totals: audit?.totals || null,
        },
      );
    } catch (error) {
      pushCheck(
        checks,
        'cutover_package_audit_latest',
        STATUS.FAIL,
        `Could not read latest P0-12 audit artifact: ${error?.message || String(error)}`,
      );
    }
  } else {
    pushCheck(
      checks,
      'cutover_package_audit_latest',
      STATUS.FAIL,
      'Missing guidelines/p0-12-go-live-package-audit-latest.json',
    );
  }

  await runCutoverChecks({ config, runId, checks, evidence });
  await runHypercareChecks({ config, checks, evidence });
  await runRollbackDryRun({ config, checks, evidence });

  const totals = summarize(checks);
  const output = {
    generated_at_utc: new Date().toISOString(),
    run_id: runId,
    doD_target: 'Cutover + Hypercare + Rollback Drill',
    config: {
      www_base_url: config.wwwBase,
      exam_api_base_url: config.examBase,
      panel_api_base_url: config.panelBase,
      ops_api_base_url: config.opsBase,
      hypercare_minutes: config.hypercareMinutes,
      sample_every_seconds: config.sampleEverySeconds,
      timeout_ms: config.timeoutMs,
      aws_enabled: config.enableAwsChecks,
      aws_region: config.awsRegion,
      alarm_prefix: config.alarmPrefix,
    },
    checks,
    evidence,
    totals,
    overall_ready_for_p0_12_cutover_hypercare_rollback: totals.fail === 0,
  };

  const outJson = resolve(ROOT, 'guidelines/p0-12-cutover-hypercare-rollback-latest.json');
  const outMd = resolve(ROOT, 'guidelines/p0-12-cutover-hypercare-rollback-latest.md');

  writeFileSync(outJson, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  writeFileSync(outMd, `${buildMarkdownReport(output)}\n`, 'utf8');

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error('[p0-12-cutover-hypercare-rollback-drill] failed:', error?.message || String(error));
  process.exit(1);
});
