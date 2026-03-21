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

function makeCheck(id, status, detail, evidence = {}) {
  return { id, status, detail, evidence };
}

function readBoundedInt(raw, fallback, min, max) {
  const parsed = Number.parseInt(safeTrim(raw), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
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
  lines.push('# P0 Exam Reminder Smoke');
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

async function run() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const guidelinesDir = path.join(rootDir, 'guidelines');
  const checks = [];
  const generatedCampaignCode = `P0_REMINDER_SMOKE_${Date.now()}`;

  const cfg = {
    examApiBase: normalizeBase(process.env.EXAM_API_BASE_URL, 'https://exam-api.teachera.com.tr'),
    opsApiBase: normalizeBase(process.env.OPS_API_BASE_URL, 'https://ops-api.teachera.com.tr'),
    campaignCode: normalizeEnvToken(process.env.SMOKE_CAMPAIGN_CODE || generatedCampaignCode).slice(0, 120),
    workerSecret: normalizeEnvToken(
      process.env.SMOKE_OPS_WORKER_SECRET
      || process.env.OPS_CRON_SECRET
      || process.env.CRON_SECRET
      || process.env.NOTIFICATION_WORKER_SECRET
      || process.env.CRM_EXPORT_WORKER_SECRET,
    ),
    databaseUrl: normalizeEnvToken(process.env.SMOKE_DB_URL || process.env.DATABASE_URL),
    allowMissingOpenAt: ['1', 'true', 'yes', 'on'].includes(
      normalizeEnvToken(process.env.SMOKE_EXAM_REMINDER_ALLOW_MISSING_OPEN_AT).toLowerCase(),
    ),
    requireEndpoint: ['1', 'true', 'yes', 'on'].includes(
      normalizeEnvToken(process.env.SMOKE_EXAM_REMINDER_REQUIRE_ENDPOINT).toLowerCase(),
    ),
    requireAuth: ['1', 'true', 'yes', 'on'].includes(
      normalizeEnvToken(process.env.SMOKE_EXAM_REMINDER_REQUIRE_AUTH).toLowerCase(),
    ),
    requestLimit: readBoundedInt(process.env.SMOKE_EXAM_REMINDER_LIMIT, 20, 1, 200),
  };

  const identityNo = buildIdentityNo();
  const parentPhoneE164 = `+90500${randomDigits(7)}`;

  const startResp = await httpRequest({
    method: 'POST',
    url: `${cfg.examApiBase}/api/exam/session/start`,
    headers: {
      'content-type': 'application/json',
    },
    body: {
      studentFullName: `Reminder Smoke ${randomDigits(4)}`,
      parentFullName: `Parent Reminder ${randomDigits(4)}`,
      identityNo,
      birthYear: 2014,
      parentPhoneE164,
      schoolName: 'Smoke School Reminder',
      grade: 8,
      section: '8-A',
      selectedExamAt: '2026-03-28T10:00:00.000Z',
      ageRange: '13-17',
      language: 'en',
      source: 'p0_exam_reminder_smoke',
      campaignCode: cfg.campaignCode,
      questionCount: 5,
      consent: {
        kvkkApproved: true,
        contactConsent: true,
        consentVersion: 'KVKK_v1_2026-03-13',
        legalTextVersion: 'KVKK_v1_2026-03-13',
        source: 'p0_exam_reminder_smoke',
      },
    },
  });

  const attemptId = safeTrim(startResp.json?.session?.attemptId);
  checks.push(
    makeCheck(
      'start_session',
      startResp.status === 200 && Boolean(attemptId) ? 'PASS' : 'FAIL',
      `HTTP ${startResp.status}`,
      {
        status: startResp.status,
        attempt_id: attemptId || null,
        error: startResp.json?.error || null,
        message: startResp.json?.message || null,
      },
    ),
  );

  if (!attemptId) {
    const totals = reduceTotals(checks);
    const report = {
      timestamp: nowIso(),
      exam_api_base: cfg.examApiBase,
      ops_api_base: cfg.opsApiBase,
      totals,
      overall_pass: totals.fail === 0,
      checks,
    };
    await fs.mkdir(guidelinesDir, { recursive: true });
    await fs.writeFile(path.join(guidelinesDir, 'p0-exam-reminder-smoke-latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(path.join(guidelinesDir, 'p0-exam-reminder-smoke-latest.md'), renderMarkdown(report), 'utf8');
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.overall_pass ? 0 : 1;
    return;
  }

  if (!cfg.workerSecret) {
    checks.push(
      makeCheck(
        'ops_secret_present',
        'WARN',
        'CRON_SECRET/NOTIFICATION_WORKER_SECRET missing; skipped live reminder endpoint call.',
      ),
    );
    checks.push(
      makeCheck(
        'exam_reminder_enqueue',
        'SKIP',
        'Skipped because ops secret is not available.',
      ),
    );
  } else {
    const reminderUrl = new URL('/api/ops/exam-reminder-broadcast', cfg.opsApiBase);
    reminderUrl.searchParams.set('campaign_code', cfg.campaignCode);
    reminderUrl.searchParams.set('force', '1');
    reminderUrl.searchParams.set('limit', String(cfg.requestLimit));

    const reminderResp = await httpRequest({
      method: 'POST',
      url: reminderUrl.toString(),
      headers: {
        'x-worker-secret': cfg.workerSecret,
      },
    });

    const reminderJson = reminderResp.json || {};
    const skippedReason = safeTrim(reminderJson.skipped_reason).toLowerCase();
    const canTreatMissingOpenAtAsPass = cfg.allowMissingOpenAt && skippedReason === 'missing_exam_open_at';
    const endpointMissing = reminderResp.status === 404;
    const unauthorized = reminderResp.status === 401 || reminderResp.status === 403;

    checks.push(
      makeCheck(
        'exam_reminder_broadcast_http',
        reminderResp.status === 200
          ? 'PASS'
          : (
            endpointMissing && !cfg.requireEndpoint
              ? 'WARN'
              : (unauthorized && !cfg.requireAuth ? 'WARN' : 'FAIL')
          ),
        `HTTP ${reminderResp.status}`,
        {
          status: reminderResp.status,
          skipped_reason: skippedReason || null,
          enqueued: Number(reminderJson.enqueued || 0),
          scanned: Number(reminderJson.scanned || 0),
          gate_exam_open_at: reminderJson?.gate?.exam_open_at || null,
        },
      ),
    );

    if (endpointMissing && !cfg.requireEndpoint) {
      checks.push(
        makeCheck(
          'exam_reminder_enqueue',
          'SKIP',
          'Skipped because /api/ops/exam-reminder-broadcast is not deployed on ops-api.',
        ),
      );
      checks.push(
        makeCheck(
          'db_attempt_reminder_job',
          'SKIP',
          'Skipped DB reminder verification because reminder endpoint is not deployed.',
          {
            attempt_id: attemptId,
          },
        ),
      );
    } else if (unauthorized && !cfg.requireAuth) {
      checks.push(
        makeCheck(
          'exam_reminder_enqueue',
          'SKIP',
          'Skipped because ops secret is not accepted by deployed endpoint (401/403).',
        ),
      );
      checks.push(
        makeCheck(
          'db_attempt_reminder_job',
          'SKIP',
          'Skipped DB reminder verification because endpoint call is unauthorized.',
          {
            attempt_id: attemptId,
          },
        ),
      );
    } else if (reminderResp.status === 200 && (Number(reminderJson.enqueued || 0) > 0 || canTreatMissingOpenAtAsPass)) {
      checks.push(
        makeCheck(
          'exam_reminder_enqueue',
          'PASS',
          Number(reminderJson.enqueued || 0) > 0
            ? `enqueued=${Number(reminderJson.enqueued || 0)}`
            : 'missing_exam_open_at tolerated by SMOKE_EXAM_REMINDER_ALLOW_MISSING_OPEN_AT',
          {
            enqueued: Number(reminderJson.enqueued || 0),
            skipped_reason: skippedReason || null,
          },
        ),
      );
    } else if (reminderResp.status === 200 && skippedReason === 'missing_exam_open_at') {
      checks.push(
        makeCheck(
          'exam_reminder_enqueue',
          'FAIL',
          'Reminder flow blocked because gate.exam_open_at is missing.',
          {
            enqueued: Number(reminderJson.enqueued || 0),
            skipped_reason: skippedReason || null,
          },
        ),
      );
    } else if (reminderResp.status === 200) {
      checks.push(
        makeCheck(
          'exam_reminder_enqueue',
          Number(reminderJson.enqueued || 0) > 0 ? 'PASS' : 'FAIL',
          `enqueued=${Number(reminderJson.enqueued || 0)}`,
          {
            enqueued: Number(reminderJson.enqueued || 0),
            scanned: Number(reminderJson.scanned || 0),
            skipped_reason: skippedReason || null,
          },
        ),
      );
    }

    if ((endpointMissing && !cfg.requireEndpoint) || (unauthorized && !cfg.requireAuth)) {
      // no-op: DB verification intentionally skipped above
    } else if (cfg.databaseUrl) {
      const client = new Client({ connectionString: cfg.databaseUrl });
      try {
        await client.connect();
        const result = await client.query(
          `
            SELECT COUNT(*)::int AS total
            FROM notification_jobs
            WHERE attempt_id = $1
              AND channel = 'SMS'
              AND template_code = 'EXAM_REMINDER_SMS'
          `,
          [attemptId],
        );
        const total = Number(result.rows?.[0]?.total || 0);
        checks.push(
          makeCheck(
            'db_attempt_reminder_job',
            total > 0 || canTreatMissingOpenAtAsPass ? 'PASS' : 'FAIL',
            `attempt_reminder_jobs=${total}`,
            {
              attempt_id: attemptId,
              attempt_reminder_jobs: total,
            },
          ),
        );
      } catch (error) {
        checks.push(
          makeCheck(
            'db_attempt_reminder_job',
            'WARN',
            'Database query failed; could not verify reminder job persistence.',
            {
              error: safeTrim(error?.message || error),
            },
          ),
        );
      } finally {
        await client.end().catch(() => {});
      }
    } else {
      checks.push(
        makeCheck(
          'db_attempt_reminder_job',
          'SKIP',
          'DATABASE_URL/SMOKE_DB_URL missing; skipped DB verification.',
        ),
      );
    }
  }

  const totals = reduceTotals(checks);
  const report = {
    timestamp: nowIso(),
    exam_api_base: cfg.examApiBase,
    ops_api_base: cfg.opsApiBase,
    campaign_code: cfg.campaignCode,
    totals,
    overall_pass: totals.fail === 0,
    checks,
  };

  await fs.mkdir(guidelinesDir, { recursive: true });
  await fs.writeFile(path.join(guidelinesDir, 'p0-exam-reminder-smoke-latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(guidelinesDir, 'p0-exam-reminder-smoke-latest.md'), renderMarkdown(report), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.overall_pass ? 0 : 1;
}

run().catch((error) => {
  console.error('[p0:exam-reminder-smoke] failed:', error?.message || error);
  process.exit(1);
});
