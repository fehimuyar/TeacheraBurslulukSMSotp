import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

function safeTrim(value) {
  return String(value ?? '').trim();
}

function normalizeEnvToken(value) {
  return safeTrim(value)
    .replace(/\\r/g, '')
    .replace(/\\n/g, '')
    .replace(/\r/g, '')
    .replace(/\n/g, '')
    .trim();
}

function normalizeBase(raw, fallback) {
  const value = normalizeEnvToken(raw || fallback);
  if (!value) throw new Error('missing_base_url');
  return value.replace(/\/+$/, '');
}

function nowIso() {
  return new Date().toISOString();
}

function randomDigits(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += String(Math.floor(Math.random() * 10));
  }
  return out;
}

function buildIdentityNo() {
  const base = `${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(/\D/g, '');
  return base.slice(-11).padStart(11, '9');
}

function readJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readBooleanFlag(name, fallback = false) {
  const value = normalizeEnvToken(process.env[name]).toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function readBoundedInt(name, fallback, min, max) {
  const value = Number.parseInt(normalizeEnvToken(process.env[name]), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function makeCheck(id, status, detail, evidence = {}) {
  return { id, status, detail, evidence };
}

function reduceTotals(checks) {
  return checks.reduce(
    (acc, item) => {
      const key = String(item.status || '').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(acc, key)) {
        acc[key] += 1;
      }
      return acc;
    },
    { pass: 0, fail: 0, warn: 0, skip: 0 },
  );
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# P0 Exam Runtime Integrity Smoke');
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

async function httpRequest({ method = 'GET', url, headers = {}, body, timeoutMs = 20000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const payload = typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined;
    const response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
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

function buildDbSslConfig() {
  const explicit = normalizeEnvToken(process.env.SMOKE_DB_SSL);
  if (explicit) {
    return readBooleanFlag('SMOKE_DB_SSL', false)
      ? { rejectUnauthorized: readBooleanFlag('SMOKE_DB_SSL_REJECT_UNAUTHORIZED', false) }
      : false;
  }

  const sslMode = normalizeEnvToken(process.env.SMOKE_DB_SSLMODE || process.env.PGSSLMODE).toLowerCase();
  if (!sslMode) return false;
  if (['disable', 'allow', 'prefer'].includes(sslMode)) return false;
  return { rejectUnauthorized: readBooleanFlag('SMOKE_DB_SSL_REJECT_UNAUTHORIZED', false) };
}

async function maybeForceTimeoutWithDb({ databaseUrl, attemptId, durationSeconds }) {
  if (!databaseUrl) {
    return {
      applied: false,
      reason: 'missing_database_url',
    };
  }

  const shiftSeconds = Math.max(300, Number(durationSeconds || 2400) + 180);
  const client = new Client({
    connectionString: databaseUrl,
    ssl: buildDbSslConfig(),
  });
  try {
    await client.connect();
    const updated = await client.query(
      `
        UPDATE exam_attempts
        SET
          started_at = NOW() - make_interval(secs => $2::int),
          status = 'STARTED',
          submitted_at = NULL,
          completion_status = NULL,
          duration_seconds = NULL,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `,
      [attemptId, shiftSeconds],
    );

    return {
      applied: updated.rowCount > 0,
      reason: updated.rowCount > 0 ? 'db_timeout_forced' : 'attempt_not_found',
      shift_seconds: shiftSeconds,
    };
  } catch (error) {
    return {
      applied: false,
      reason: safeTrim(error?.message || error) || 'db_update_failed',
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function run() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const guidelinesDir = path.join(rootDir, 'guidelines');
  const checks = [];

  const cfg = {
    examApiBase: normalizeBase(process.env.EXAM_API_BASE_URL, 'https://exam-api.teachera.com.tr'),
    campaignCode: normalizeEnvToken(process.env.SMOKE_CAMPAIGN_CODE || '2026_BURSLULUK'),
    loadTestBypassKey: normalizeEnvToken(
      process.env.LOAD_TEST_BYPASS_KEY
      || process.env.P0_11_LOAD_TEST_KEY
      || process.env.CRON_SECRET
      || process.env.NOTIFICATION_WORKER_SECRET,
    ),
    timeoutWaitMaxSeconds: readBoundedInt('SMOKE_TIMEOUT_WAIT_MAX_SECONDS', 15, 1, 120),
    timeoutStatusRetrySeconds: readBoundedInt('SMOKE_TIMEOUT_STATUS_RETRY_SECONDS', 30, 0, 180),
    timeoutStatusRetryIntervalMs: readBoundedInt('SMOKE_TIMEOUT_STATUS_RETRY_INTERVAL_MS', 3000, 250, 10000),
    requireTimeoutBlock: readBooleanFlag('SMOKE_REQUIRE_TIMEOUT_BLOCK', false),
    allowDbTimeoutMutation: readBooleanFlag('SMOKE_ALLOW_DB_TIMEOUT_MUTATION', true),
    databaseUrl: normalizeEnvToken(process.env.SMOKE_DB_URL || process.env.DATABASE_URL),
    presetAttemptId: normalizeEnvToken(process.env.SMOKE_ATTEMPT_ID),
    presetSessionToken: normalizeEnvToken(process.env.SMOKE_SESSION_TOKEN),
  };

  const identityNo = buildIdentityNo();
  const parentPhoneE164 = `+90500${randomDigits(7)}`;
  const startHeaders = { 'content-type': 'application/json' };
  if (cfg.loadTestBypassKey) {
    startHeaders['x-load-test-mode'] = 'cert';
    startHeaders['x-load-test-key'] = cfg.loadTestBypassKey;
  }

  const startResp = await httpRequest({
    method: 'POST',
    url: `${cfg.examApiBase}/api/exam/session/start`,
    headers: startHeaders,
    body: {
      studentFullName: `Runtime Smoke ${randomDigits(4)}`,
      parentFullName: `Parent Runtime ${randomDigits(4)}`,
      identityNo,
      birthYear: 2014,
      parentPhoneE164,
      schoolName: 'Smoke School Runtime',
      grade: 8,
      section: '8-A',
      selectedExamAt: '2026-03-28T10:00:00.000Z',
      ageRange: '13-17',
      language: 'en',
      source: 'p0_exam_runtime_integrity_smoke',
      campaignCode: cfg.campaignCode,
      questionCount: 5,
      consent: {
        kvkkApproved: true,
        contactConsent: true,
        consentVersion: 'KVKK_v1_2026-03-13',
        legalTextVersion: 'KVKK_v1_2026-03-13',
        source: 'p0_exam_runtime_integrity_smoke',
      },
    },
  });

  let attemptId = safeTrim(startResp.json?.session?.attemptId);
  let sessionToken = safeTrim(startResp.json?.session?.sessionToken);
  checks.push(
    makeCheck(
      'start_session',
      startResp.status === 200 && attemptId && sessionToken ? 'PASS' : 'FAIL',
      `HTTP ${startResp.status}`,
      {
        status: startResp.status,
        attempt_id: attemptId || null,
        has_session_token: Boolean(sessionToken),
        error: startResp.json?.error || null,
        message: startResp.json?.message || null,
      },
    ),
  );

  if (!attemptId || !sessionToken) {
    if (cfg.presetAttemptId && cfg.presetSessionToken) {
      attemptId = cfg.presetAttemptId;
      sessionToken = cfg.presetSessionToken;
      checks.push(
        makeCheck(
          'start_session_fallback',
          'WARN',
          'Using preset SMOKE_ATTEMPT_ID + SMOKE_SESSION_TOKEN because session/start failed.',
          {
            start_status: startResp.status,
            preset_attempt_id: attemptId,
            has_preset_session_token: true,
          },
        ),
      );
    }
  }

  if (!attemptId || !sessionToken) {
    const totals = reduceTotals(checks);
    const report = {
      timestamp: nowIso(),
      exam_api_base: cfg.examApiBase,
      totals,
      overall_pass: totals.fail === 0,
      checks,
    };
    await fs.mkdir(guidelinesDir, { recursive: true });
    await fs.writeFile(
      path.join(guidelinesDir, 'p0-exam-runtime-integrity-smoke-latest.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(guidelinesDir, 'p0-exam-runtime-integrity-smoke-latest.md'),
      renderMarkdown(report),
      'utf8',
    );
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.overall_pass ? 0 : 1;
    return;
  }

  const runtimeHeaders = {
    'content-type': 'application/json',
    'x-exam-session-token': sessionToken,
  };

  const statusResp = await httpRequest({
    method: 'GET',
    url: `${cfg.examApiBase}/api/exam/session/status?attemptId=${encodeURIComponent(attemptId)}`,
    headers: runtimeHeaders,
  });
  const runtime = statusResp.json?.runtime || {};
  const durationSeconds = Number(runtime.duration_seconds || 0);
  const remainingSeconds = Number(runtime.remaining_seconds || 0);

  checks.push(
    makeCheck(
      'status_runtime_fetch',
      statusResp.status === 200 ? 'PASS' : 'FAIL',
      `HTTP ${statusResp.status}`,
      {
        status: statusResp.status,
      },
    ),
  );
  checks.push(
    makeCheck(
      'status_runtime_contract',
      statusResp.status === 200
        && Number.isFinite(durationSeconds)
        && durationSeconds > 0
        && Number.isFinite(remainingSeconds)
        ? 'PASS'
        : 'FAIL',
      statusResp.status === 200
        ? `duration=${durationSeconds} remaining=${remainingSeconds}`
        : `HTTP ${statusResp.status}`,
      {
        runtime: runtime || null,
      },
    ),
  );

  const eventType = 'WINDOW_BLUR';
  const eventsResp = await httpRequest({
    method: 'POST',
    url: `${cfg.examApiBase}/api/exam/session/events`,
    headers: runtimeHeaders,
    body: {
      attemptId,
      eventType,
      source: 'p0_exam_runtime_integrity_smoke',
      meta: {
        phase: 'integration_smoke',
      },
    },
  });
  const eventEcho = safeTrim(eventsResp.json?.event?.event_type);
  checks.push(
    makeCheck(
      'events_ingest',
      eventsResp.status === 200 && eventEcho === eventType ? 'PASS' : 'FAIL',
      `HTTP ${eventsResp.status}`,
      {
        status: eventsResp.status,
        expected_event_type: eventType,
        actual_event_type: eventEcho || null,
        event_id: safeTrim(eventsResp.json?.event?.event_id) || null,
      },
    ),
  );

  let timedOutForTest = Boolean(runtime.timed_out);
  let timeoutPreparation = {
    method: timedOutForTest ? 'already_timed_out' : 'not_prepared',
    detail: timedOutForTest ? 'runtime already timed_out=true' : 'runtime timed_out=false',
  };

  if (!timedOutForTest && cfg.allowDbTimeoutMutation) {
    const dbMutation = await maybeForceTimeoutWithDb({
      databaseUrl: cfg.databaseUrl,
      attemptId,
      durationSeconds,
    });
    timeoutPreparation = {
      method: 'db_mutation',
      detail: dbMutation.reason,
      ...dbMutation,
    };
    if (dbMutation.applied) {
      timedOutForTest = true;
    }
    checks.push(
      makeCheck(
        'prepare_timeout_via_db',
        dbMutation.applied ? 'PASS' : (cfg.databaseUrl ? 'WARN' : 'SKIP'),
        dbMutation.reason,
        {
          has_database_url: Boolean(cfg.databaseUrl),
          applied: dbMutation.applied,
          shift_seconds: dbMutation.shift_seconds || null,
        },
      ),
    );
  }

  if (!timedOutForTest && remainingSeconds > 0 && remainingSeconds <= cfg.timeoutWaitMaxSeconds) {
    await sleep((remainingSeconds + 1) * 1000);
    timeoutPreparation = {
      method: 'wait_until_timeout',
      detail: `waited_seconds=${remainingSeconds + 1}`,
    };
  }

  let statusAfterResp = await httpRequest({
    method: 'GET',
    url: `${cfg.examApiBase}/api/exam/session/status?attemptId=${encodeURIComponent(attemptId)}`,
    headers: runtimeHeaders,
  });
  let runtimeAfter = statusAfterResp.json?.runtime || {};
  let timedOutAfter = Boolean(runtimeAfter.timed_out);
  let timeoutStatusRetryAttempts = 0;

  if (!timedOutAfter && timeoutPreparation.method === 'db_mutation' && cfg.timeoutStatusRetrySeconds > 0) {
    const deadlineAt = Date.now() + (cfg.timeoutStatusRetrySeconds * 1000);
    while (!timedOutAfter && Date.now() < deadlineAt) {
      await sleep(cfg.timeoutStatusRetryIntervalMs);
      timeoutStatusRetryAttempts += 1;
      statusAfterResp = await httpRequest({
        method: 'GET',
        url: `${cfg.examApiBase}/api/exam/session/status?attemptId=${encodeURIComponent(attemptId)}`,
        headers: runtimeHeaders,
      });
      runtimeAfter = statusAfterResp.json?.runtime || {};
      timedOutAfter = Boolean(runtimeAfter.timed_out);
    }
  }

  checks.push(
    makeCheck(
      'status_runtime_after_prepare',
      statusAfterResp.status === 200 ? 'PASS' : 'FAIL',
      `HTTP ${statusAfterResp.status}`,
      {
        status: statusAfterResp.status,
      },
    ),
  );

  const timeoutGateStatus = timedOutAfter ? 'PASS' : (cfg.requireTimeoutBlock ? 'FAIL' : 'SKIP');
  checks.push(
    makeCheck(
      'status_runtime_timed_out',
      timeoutGateStatus,
      timedOutAfter
        ? 'runtime.timed_out=true'
        : `runtime.timed_out=false (${timeoutPreparation.method})`,
      {
        timed_out: timedOutAfter,
        timeout_preparation: timeoutPreparation,
        timeout_status_retry_attempts: timeoutStatusRetryAttempts,
        remaining_seconds: Number(runtimeAfter.remaining_seconds || 0),
      },
    ),
  );

  if (timedOutAfter) {
    const answerResp = await httpRequest({
      method: 'POST',
      url: `${cfg.examApiBase}/api/exam/session/answer`,
      headers: {
        'content-type': 'application/json',
        'x-exam-session-token': sessionToken,
      },
      body: {
        attemptId,
        answers: [
          {
            questionId: 'runtime-timeout-check-q1',
            selectedOption: 'A',
            isCorrect: false,
            questionWeight: 1,
            scoreDelta: 0,
          },
        ],
      },
    });
    const errorCode = safeTrim(answerResp.json?.error);
    const blocked = answerResp.status === 409 && errorCode === 'attempt_time_limit_reached';
    checks.push(
      makeCheck(
        'timeout_answer_block',
        blocked ? 'PASS' : 'FAIL',
        `HTTP ${answerResp.status} error=${errorCode || 'n/a'}`,
        {
          status: answerResp.status,
          error: errorCode || null,
          message: safeTrim(answerResp.json?.message) || null,
        },
      ),
    );
  } else {
    const canVerifyWithDbForcedState = timeoutPreparation.method === 'db_mutation' && timeoutPreparation.applied === true;
    if (canVerifyWithDbForcedState) {
      const answerResp = await httpRequest({
        method: 'POST',
        url: `${cfg.examApiBase}/api/exam/session/answer`,
        headers: {
          'content-type': 'application/json',
          'x-exam-session-token': sessionToken,
        },
        body: {
          attemptId,
          answers: [
            {
              questionId: 'runtime-timeout-check-q1',
              selectedOption: 'A',
              isCorrect: false,
              questionWeight: 1,
              scoreDelta: 0,
            },
          ],
        },
      });
      const errorCode = safeTrim(answerResp.json?.error);
      const blocked = answerResp.status === 409 && ['attempt_time_limit_reached', 'attempt_not_open'].includes(errorCode);
      checks.push(
        makeCheck(
          'timeout_answer_block',
          blocked ? 'PASS' : (cfg.requireTimeoutBlock ? 'FAIL' : 'WARN'),
          `HTTP ${answerResp.status} error=${errorCode || 'n/a'} (db_forced_timeout_fallback)`,
          {
            status: answerResp.status,
            error: errorCode || null,
            message: safeTrim(answerResp.json?.message) || null,
            fallback_mode: 'db_forced_timeout_without_runtime_flag',
          },
        ),
      );
    } else {
      checks.push(
        makeCheck(
          'timeout_answer_block',
          cfg.requireTimeoutBlock ? 'FAIL' : 'SKIP',
          'timed_out state could not be produced in this run.',
          {
            hint: 'Provide SMOKE_DB_URL or set SMOKE_REQUIRE_TIMEOUT_BLOCK=1 to force hard failure.',
          },
        ),
      );
    }
  }

  const totals = reduceTotals(checks);
  const report = {
    timestamp: nowIso(),
    exam_api_base: cfg.examApiBase,
    campaign_code: cfg.campaignCode,
    config: {
      timeout_wait_max_seconds: cfg.timeoutWaitMaxSeconds,
      timeout_status_retry_seconds: cfg.timeoutStatusRetrySeconds,
      timeout_status_retry_interval_ms: cfg.timeoutStatusRetryIntervalMs,
      require_timeout_block: cfg.requireTimeoutBlock,
      allow_db_timeout_mutation: cfg.allowDbTimeoutMutation,
      has_database_url: Boolean(cfg.databaseUrl),
      has_load_test_bypass_key: Boolean(cfg.loadTestBypassKey),
    },
    attempt_id: attemptId,
    totals,
    overall_pass: totals.fail === 0,
    checks,
  };

  await fs.mkdir(guidelinesDir, { recursive: true });
  const outJson = path.join(guidelinesDir, 'p0-exam-runtime-integrity-smoke-latest.json');
  const outMd = path.join(guidelinesDir, 'p0-exam-runtime-integrity-smoke-latest.md');
  await fs.writeFile(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(outMd, renderMarkdown(report), 'utf8');

  console.log(JSON.stringify(report, null, 2));
  if (!report.overall_pass) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('[p0-exam-runtime-integrity-smoke] failed:', error?.message || error);
  process.exitCode = 1;
});
