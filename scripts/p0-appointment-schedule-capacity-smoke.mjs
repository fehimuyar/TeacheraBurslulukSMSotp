import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function safeTrim(value) {
  return String(value ?? '').trim();
}

function normalizeBase(raw, fallback) {
  const value = safeTrim(raw || fallback);
  if (!value) throw new Error('missing_base_url');
  return value.replace(/\/+$/, '');
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

function readBooleanFlag(name, fallback = false) {
  const value = safeTrim(process.env[name]).toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
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

function renderMarkdown(report) {
  const lines = [];
  lines.push('# P0 Appointment Schedule Capacity Smoke');
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

async function run() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const guidelinesDir = path.join(rootDir, 'guidelines');
  const checks = [];

  const cfg = {
    examApiBase: normalizeBase(process.env.EXAM_API_BASE_URL, 'https://exam-api.teachera.com.tr'),
    loadTestBypassKey: safeTrim(
      process.env.LOAD_TEST_BYPASS_KEY
      || process.env.CRON_SECRET
      || process.env.NOTIFICATION_WORKER_SECRET,
    ),
    expectConsultantSchedule: readBooleanFlag('SMOKE_EXPECT_CONSULTANT_SCHEDULE', true),
  };

  const identityNo = buildIdentityNo();
  const parentPhoneE164 = `+90500${randomDigits(7)}`;
  const selectedExamAt = '2026-03-28T10:00:00.000Z';
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
      studentFullName: `Appointment Smoke ${randomDigits(4)}`,
      parentFullName: `Parent Smoke ${randomDigits(4)}`,
      identityNo,
      birthYear: 2014,
      parentPhoneE164,
      schoolName: 'Smoke School Konya',
      grade: 8,
      section: '8-A',
      selectedExamAt,
      ageRange: '13-17',
      language: 'en',
      source: 'p0_appointment_schedule_capacity_smoke',
      campaignCode: '2026_BURSLULUK',
      questionCount: 5,
      consent: {
        kvkkApproved: true,
        contactConsent: true,
        consentVersion: 'KVKK_v1_2026-03-13',
        legalTextVersion: 'KVKK_v1_2026-03-13',
        source: 'p0_appointment_schedule_capacity_smoke',
      },
    },
  });

  const attemptId = safeTrim(startResp.json?.session?.attemptId);
  const sessionToken = safeTrim(startResp.json?.session?.sessionToken);
  const applicationNo = safeTrim(startResp.json?.session?.applicationNo);
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

  if (!attemptId || !sessionToken || !applicationNo) {
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
      path.join(guidelinesDir, 'p0-appointment-schedule-capacity-smoke-latest.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(guidelinesDir, 'p0-appointment-schedule-capacity-smoke-latest.md'),
      renderMarkdown(report),
      'utf8',
    );
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.overall_pass ? 0 : 1;
    return;
  }

  const sessionHeaders = {
    'content-type': 'application/json',
    'x-exam-session-token': sessionToken,
  };
  if (cfg.loadTestBypassKey) {
    sessionHeaders['x-load-test-mode'] = 'cert';
    sessionHeaders['x-load-test-key'] = cfg.loadTestBypassKey;
  }

  const loginResp = await httpRequest({
    method: 'POST',
    url: `${cfg.examApiBase}/api/exam/candidate/login`,
    headers: { 'content-type': 'application/json', ...(cfg.loadTestBypassKey ? { 'x-load-test-mode': 'cert', 'x-load-test-key': cfg.loadTestBypassKey } : {}) },
    body: {
      username: applicationNo,
      password: sessionToken,
    },
  });
  checks.push(makeCheck('candidate_login', loginResp.status === 200 ? 'PASS' : 'FAIL', `HTTP ${loginResp.status}`, { status: loginResp.status }));

  const answerResp = await httpRequest({
    method: 'POST',
    url: `${cfg.examApiBase}/api/exam/session/answer`,
    headers: sessionHeaders,
    body: {
      attemptId,
      answers: [
        { questionId: 'q-1', selectedOption: 'A', isCorrect: true, questionWeight: 1, scoreDelta: 1 },
        { questionId: 'q-2', selectedOption: 'B', isCorrect: false, questionWeight: 1, scoreDelta: 0 },
      ],
    },
  });
  checks.push(makeCheck('answer_autosave', answerResp.status === 200 ? 'PASS' : 'FAIL', `HTTP ${answerResp.status}`, { status: answerResp.status }));

  const submitResp = await httpRequest({
    method: 'POST',
    url: `${cfg.examApiBase}/api/exam/session/submit`,
    headers: sessionHeaders,
    body: {
      attemptId,
      completionStatus: 'completed',
      durationSeconds: 90,
      answers: [
        { questionId: 'q-1', selectedOption: 'A', isCorrect: true, questionWeight: 1, scoreDelta: 1 },
        { questionId: 'q-2', selectedOption: 'B', isCorrect: false, questionWeight: 1, scoreDelta: 0 },
      ],
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
  checks.push(makeCheck('submit_exam', submitResp.status === 200 ? 'PASS' : 'FAIL', `HTTP ${submitResp.status}`, { status: submitResp.status }));

  const slotsResp = await httpRequest({
    method: 'GET',
    url: `${cfg.examApiBase}/api/exam/appointments/slots?attemptId=${encodeURIComponent(attemptId)}&limit=12`,
    headers: {
      'x-exam-session-token': sessionToken,
      ...(cfg.loadTestBypassKey ? { 'x-load-test-mode': 'cert', 'x-load-test-key': cfg.loadTestBypassKey } : {}),
    },
  });

  const slotItems = Array.isArray(slotsResp.json?.slots) ? slotsResp.json.slots : [];
  const slotSource = safeTrim(slotsResp.json?.slot_capacity_source || slotsResp.json?.capacity_source);
  const slotSourceOk = ['consultant_schedule', 'env_fallback'].includes(slotSource);
  checks.push(
    makeCheck(
      'slots_fetch',
      slotsResp.status === 200 && slotItems.length > 0 ? 'PASS' : 'FAIL',
      `HTTP ${slotsResp.status}`,
      {
        status: slotsResp.status,
        slot_count: slotItems.length,
        slot_capacity_source: slotSource || null,
      },
    ),
  );
  checks.push(
    makeCheck(
      'slots_capacity_source_valid',
      slotsResp.status === 200 && slotSourceOk ? 'PASS' : 'FAIL',
      slotSource ? `source=${slotSource}` : 'missing_capacity_source',
      {
        slot_capacity_source: slotSource || null,
      },
    ),
  );

  const scheduleSourcePass = !cfg.expectConsultantSchedule || slotSource === 'consultant_schedule';
  checks.push(
    makeCheck(
      'slots_expect_consultant_schedule',
      scheduleSourcePass ? 'PASS' : 'FAIL',
      cfg.expectConsultantSchedule
        ? `expected=consultant_schedule actual=${slotSource || 'missing'}`
        : 'consultant_schedule expectation disabled',
      {
        expect_consultant_schedule: cfg.expectConsultantSchedule,
        slot_capacity_source: slotSource || null,
        schedule_active_consultants: Number(slotsResp.json?.schedule_active_consultants || 0),
        schedule_active_availability_rules: Number(slotsResp.json?.schedule_active_availability_rules || 0),
      },
    ),
  );

  const firstAvailable = slotItems.find((item) => Boolean(item?.is_available) && safeTrim(item?.appointment_at));
  if (!firstAvailable) {
    checks.push(makeCheck('book_slot', 'FAIL', 'No available slot to book.'));
  } else {
    const bookResp = await httpRequest({
      method: 'POST',
      url: `${cfg.examApiBase}/api/exam/appointments/book`,
      headers: sessionHeaders,
      body: {
        attemptId,
        appointmentAt: firstAvailable.appointment_at,
        source: 'p0_appointment_schedule_capacity_smoke',
      },
    });

    const booking = bookResp.json?.appointment_booking || {};
    const bookingSource = safeTrim(booking.consultant_capacity_source);
    const bookingSourceOk = ['consultant_schedule', 'env_fallback'].includes(bookingSource);
    const bookingSchedulePass = !cfg.expectConsultantSchedule || bookingSource === 'consultant_schedule';

    checks.push(
      makeCheck(
        'book_slot',
        bookResp.status === 200 ? 'PASS' : 'FAIL',
        `HTTP ${bookResp.status}`,
        {
          status: bookResp.status,
          appointment_at: booking.appointment_at || null,
          consultant_count: Number(booking.consultant_count || 0),
          consultant_capacity_source: bookingSource || null,
        },
      ),
    );
    checks.push(
      makeCheck(
        'book_capacity_source_valid',
        bookResp.status === 200 && bookingSourceOk ? 'PASS' : 'FAIL',
        bookingSource ? `source=${bookingSource}` : 'missing_consultant_capacity_source',
        {
          consultant_capacity_source: bookingSource || null,
        },
      ),
    );
    checks.push(
      makeCheck(
        'book_expect_consultant_schedule',
        bookingSchedulePass ? 'PASS' : 'FAIL',
        cfg.expectConsultantSchedule
          ? `expected=consultant_schedule actual=${bookingSource || 'missing'}`
          : 'consultant_schedule expectation disabled',
        {
          expect_consultant_schedule: cfg.expectConsultantSchedule,
          consultant_capacity_source: bookingSource || null,
        },
      ),
    );
  }

  const totals = reduceTotals(checks);
  const report = {
    timestamp: nowIso(),
    exam_api_base: cfg.examApiBase,
    expect_consultant_schedule: cfg.expectConsultantSchedule,
    totals,
    overall_pass: totals.fail === 0,
    checks,
  };

  await fs.mkdir(guidelinesDir, { recursive: true });
  const outJson = path.join(guidelinesDir, 'p0-appointment-schedule-capacity-smoke-latest.json');
  const outMd = path.join(guidelinesDir, 'p0-appointment-schedule-capacity-smoke-latest.md');
  await fs.writeFile(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(outMd, renderMarkdown(report), 'utf8');

  console.log(JSON.stringify(report, null, 2));
  if (!report.overall_pass) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('[p0-appointment-schedule-capacity-smoke] failed:', error?.message || error);
  process.exitCode = 1;
});
