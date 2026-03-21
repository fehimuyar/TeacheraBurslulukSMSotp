import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GUIDELINES_DIR = join(ROOT, 'guidelines');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status} ${body?.error || body?.code || body?.message || 'request_failed'}`);
  }
  return body;
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
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function toMarkdown(summary) {
  return [
    '# P0 Candidate Credentials Smoke',
    '',
    `- Generated (UTC): ${summary.generated_at_utc}`,
    `- Status: ${summary.ok ? 'PASS' : 'FAIL'}`,
    `- Candidate ID: ${summary.candidate_id || '-'}`,
    `- Candidate Code: ${summary.candidate_code || '-'}`,
    `- Application No: ${summary.application_no || '-'}`,
    '',
    '## Checks',
    '',
    ...Object.entries(summary.checks || {}).map(([key, value]) => `- ${key}: ${value ? 'PASS' : 'FAIL'}`),
    '',
  ].join('\n');
}

async function writeArtifacts(summary) {
  await mkdir(GUIDELINES_DIR, { recursive: true });
  const jsonPath = join(GUIDELINES_DIR, 'p0-candidate-credentials-smoke-latest.json');
  const mdPath = join(GUIDELINES_DIR, 'p0-candidate-credentials-smoke-latest.md');
  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(mdPath, `${toMarkdown(summary)}\n`, 'utf8');
}

async function fetchCredentialFromQueue(client, candidateId, trigger) {
  const result = await client.query(
    `
      SELECT id, payload
      FROM notification_jobs
      WHERE candidate_id = $1
        AND channel = 'SMS'
        AND template_code = 'CREDENTIALS_SMS'
        AND ($2::text = '' OR (payload->>'trigger') = $2)
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [candidateId, trigger || ''],
  );

  const row = result.rows[0];
  if (!row) return null;
  const payload = row.payload || {};
  const credential = payload.credential || {};
  return {
    jobId: row.id,
    username: String(credential.username || '').trim(),
    password: String(credential.password || '').trim(),
    candidateCode: String(payload.candidateCode || credential.candidateCode || '').trim(),
    trigger: String(payload.trigger || '').trim(),
  };
}

async function main() {
  const examBase = String(process.env.EXAM_API_BASE_URL || 'https://exam-api.teachera.com.tr').replace(/\/$/, '');
  const databaseUrl = String(process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
  const expectScheduleFields = readBooleanFlag('SMOKE_EXPECT_SCHEDULE_FIELDS', false);
  assert(databaseUrl, 'DATABASE_URL/POSTGRES_URL missing');

  const identityNo = buildIdentityNo();
  const birthYear = 2014;
  const parentPhoneE164 = `+90500${randomDigits(7)}`;

  const startPayload = {
    studentFullName: `Smoke Student ${randomDigits(4)}`,
    parentFullName: `Smoke Parent ${randomDigits(4)}`,
    identityNo,
    birthYear,
    parentPhoneE164,
    schoolName: 'Smoke School Konya',
    grade: 8,
    section: '8-A',
    selectedExamAt: '2026-03-28T10:00:00.000Z',
    ageRange: '13-17',
    language: 'en',
    source: 'p0_candidate_credentials_smoke',
    campaignCode: '2026_BURSLULUK',
    questionCount: 40,
    consent: {
      kvkkApproved: true,
      contactConsent: true,
      consentVersion: 'KVKK_v1_2026-03-13',
      legalTextVersion: 'KVKK_v1_2026-03-13',
      source: 'p0_candidate_credentials_smoke',
    },
  };

  const startResp = await postJson(`${examBase}/api/exam/session/start`, startPayload);
  const session = startResp?.session || {};
  const candidateId = String(session.candidateId || '').trim();
  const candidateCode = String(session.candidateCode || '').trim();
  const applicationNo = String(session.applicationNo || '').trim();
  assert(candidateId, 'start: candidateId missing');
  assert(candidateCode, 'start: candidateCode missing');
  if (expectScheduleFields) {
    assert(String(session.section || '').trim() === '8-A', 'start: section mismatch');
    assert(String(session.scheduledExamAt || '').trim() === startPayload.selectedExamAt, 'start: scheduledExamAt mismatch');
    assert(String(session.examSlotLabel || '').trim().length > 0, 'start: examSlotLabel missing');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await sleep(600);
    const startCredential = await fetchCredentialFromQueue(client, candidateId, 'session_start_auto_credentials');
    assert(startCredential?.username, 'start credential username missing in queue');
    assert(startCredential?.password, 'start credential password missing in queue');

    const loginResp1 = await postJson(`${examBase}/api/exam/candidate/login`, {
      username: startCredential.username,
      password: startCredential.password,
      campaignCode: '2026_BURSLULUK',
    });
    assert(loginResp1?.session?.attemptId, 'login1: attemptId missing');
    if (expectScheduleFields) {
      assert(String(loginResp1?.session?.scheduledExamAt || '') === startPayload.selectedExamAt, 'login1: scheduledExamAt mismatch');
      assert(String(loginResp1?.session?.section || '') === '8-A', 'login1: section mismatch');
      assert(String(loginResp1?.gate?.candidate_exam_open_at || '').length > 0, 'login1: candidate gate missing');
    }

    const resetLookup = await postJson(`${examBase}/api/exam/candidate/password-reset`, {
      identityNo,
      birthYear,
      campaignCode: '2026_BURSLULUK',
      confirm: false,
    });
    assert(resetLookup?.reset?.confirm_required === true, 'reset lookup: confirm_required expected true');

    const resetConfirm = await postJson(`${examBase}/api/exam/candidate/password-reset`, {
      identityNo,
      birthYear,
      campaignCode: '2026_BURSLULUK',
      confirm: true,
    });
    assert(resetConfirm?.reset?.sms_queued === true, 'reset confirm: sms_queued expected true');

    await sleep(600);
    const resetCredential = await fetchCredentialFromQueue(client, candidateId, 'candidate_password_reset_identity_confirmed');
    assert(resetCredential?.username, 'reset credential username missing in queue');
    assert(resetCredential?.password, 'reset credential password missing in queue');

    const loginResp2 = await postJson(`${examBase}/api/exam/candidate/login`, {
      username: resetCredential.username,
      password: resetCredential.password,
      campaignCode: '2026_BURSLULUK',
    });
    assert(loginResp2?.session?.attemptId, 'login2: attemptId missing');
    if (expectScheduleFields) {
      assert(String(loginResp2?.session?.scheduledExamAt || '') === startPayload.selectedExamAt, 'login2: scheduledExamAt mismatch');
    }

    const summary = {
      ok: true,
      exam_base: examBase,
      candidate_id: candidateId,
      candidate_code: candidateCode,
      application_no: applicationNo,
      checks: {
        start_session_created: true,
        start_candidate_code_present: true,
        start_credentials_sms_queued_payload_verified: true,
        login_with_candidate_code_success: true,
        reset_lookup_success: true,
        reset_confirm_sms_queued: true,
        reset_credentials_sms_queued_payload_verified: true,
        login_with_reset_password_success: true,
        schedule_fields_verified: expectScheduleFields,
      },
      generated_at_utc: new Date().toISOString(),
    };

    await writeArtifacts(summary);

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await client.end();
  }
}

main().catch(async (error) => {
  const failSummary = {
    ok: false,
    generated_at_utc: new Date().toISOString(),
    error: error?.message || String(error),
    checks: {},
  };
  try {
    await writeArtifacts(failSummary);
  } catch (artifactError) {
    console.error('[p0-candidate-credentials-smoke] artifact_write_failed', artifactError?.message || String(artifactError));
  }
  console.error('[p0-candidate-credentials-smoke] failed', failSummary.error);
  process.exit(1);
});
