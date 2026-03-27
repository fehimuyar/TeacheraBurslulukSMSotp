import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import startHandler from '../apps/exam-api/api/exam/session/start.js';
import answerHandler from '../apps/exam-api/api/exam/session/answer.js';
import submitHandler from '../apps/exam-api/api/exam/session/submit.js';
import resultStatusHandler from '../apps/exam-api/api/exam/session/result-status.js';
import speakingInitHandler from '../apps/exam-api/api/exam/session/speaking/init.js';
import speakingUploadHandler from '../apps/exam-api/api/exam/session/speaking/upload.js';
import speakingCompleteHandler from '../apps/exam-api/api/exam/session/speaking/complete.js';
import examResultHandler from '../apps/exam-api/api/exam/results/[attemptId].js';
import panelResultDetailHandler from '../apps/panel-api/api/panel/results/[resultId].js';
import panelSpeakingAudioHandler from '../apps/panel-api/api/panel/results/[resultId]/speaking/[responseId].js';
import panelResultActionsHandler from '../apps/panel-api/api/panel/results/actions.js';
import * as sharedDb from '../packages/shared/backend/db.js';
import * as examDb from '../apps/exam-api/api/_lib/db.js';
import * as panelDb from '../apps/panel-api/api/_lib/db.js';
import { createPanelSessionToken, hashPanelSessionToken } from '../packages/shared/backend/panelSession.js';
import { loadScholarshipExamFullContent } from '../packages/shared/backend/scholarshipExam.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const GUIDELINES_DIR = path.join(ROOT_DIR, 'guidelines');
const REPORT_JSON_PATH = path.join(GUIDELINES_DIR, 'scholarship-exam-e2e-smoke-latest.json');
const REPORT_MD_PATH = path.join(GUIDELINES_DIR, 'scholarship-exam-e2e-smoke-latest.md');

const REQUIRED_PANEL_PERMISSIONS = [
  'PANEL_RESULTS_REVIEW',
  'PANEL_RESULTS_OVERRIDE',
  'PANEL_RESULTS_PUBLISH',
];

const PANEL_ROLE_DEFAULTS = {
  SUPER_ADMIN: new Set([
    'PANEL_DASHBOARD_READ',
    'PANEL_CANDIDATES_READ',
    'PANEL_CANDIDATES_EXPORT',
    'PANEL_CANDIDATES_ACTION',
    'PANEL_NOTIFICATIONS_READ',
    'PANEL_NOTIFICATIONS_ACTION',
    'PANEL_UNVIEWED_READ',
    'PANEL_UNVIEWED_ACTION',
    'PANEL_DLQ_READ',
    'PANEL_DLQ_ACTION',
    'PANEL_SETTINGS_READ',
    'PANEL_SETTINGS_WRITE',
    'PANEL_AUDIT_READ',
    'PANEL_AUDIT_EXPORT',
    'PANEL_RESULTS_REVIEW',
    'PANEL_RESULTS_OVERRIDE',
    'PANEL_RESULTS_PUBLISH',
    'PANEL_CRM_PUSH',
    'PANEL_IP_POLICY_READ',
    'PANEL_IP_POLICY_WRITE',
  ]),
  OPERATIONS: new Set([
    'PANEL_DASHBOARD_READ',
    'PANEL_CANDIDATES_READ',
    'PANEL_CANDIDATES_EXPORT',
    'PANEL_CANDIDATES_ACTION',
    'PANEL_NOTIFICATIONS_READ',
    'PANEL_NOTIFICATIONS_ACTION',
    'PANEL_UNVIEWED_READ',
    'PANEL_UNVIEWED_ACTION',
    'PANEL_DLQ_READ',
    'PANEL_DLQ_ACTION',
    'PANEL_SETTINGS_READ',
    'PANEL_AUDIT_READ',
    'PANEL_AUDIT_EXPORT',
    'PANEL_RESULTS_REVIEW',
    'PANEL_CRM_PUSH',
    'PANEL_IP_POLICY_READ',
  ]),
};

function safeTrim(value) {
  return String(value ?? '').trim();
}

function assert(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    if (details) {
      error.details = details;
    }
    throw error;
  }
}

function normalizeEnvToken(value) {
  return safeTrim(value)
    .replace(/\\r/g, '')
    .replace(/\\n/g, '')
    .replace(/\r/g, '')
    .replace(/\n/g, '')
    .trim();
}

function nowIso() {
  return new Date().toISOString();
}

function randomDigits(length) {
  let output = '';
  for (let index = 0; index < length; index += 1) {
    output += String(Math.floor(Math.random() * 10));
  }
  return output;
}

function makeCheck(id, status, detail, evidence = {}) {
  return {
    id,
    status,
    detail,
    evidence,
  };
}

function reduceTotals(checks) {
  return checks.reduce(
    (accumulator, item) => {
      const key = safeTrim(item.status).toLowerCase();
      if (Object.prototype.hasOwnProperty.call(accumulator, key)) {
        accumulator[key] += 1;
      }
      return accumulator;
    },
    { pass: 0, fail: 0, warn: 0, skip: 0 },
  );
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Scholarship Exam E2E Smoke');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- Overall pass: **${report.overall_pass}**`);
  lines.push(`- Attempt ID: ${report.attempt_id || '-'}`);
  lines.push(`- Result ID: ${report.result_id || '-'}`);
  lines.push(`- Grade: ${report.grade || '-'}`);
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

async function writeArtifacts(report) {
  await fs.mkdir(GUIDELINES_DIR, { recursive: true });
  await fs.writeFile(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_MD_PATH, renderMarkdown(report), 'utf8');
}

function configureLocalSmokeEnv() {
  process.env.SERVICE_HOST_GUARD_MODE = 'off';
  process.env.SERVICE_ROUTE_GUARD_MODE = 'off';
  process.env.CORS_GUARD_MODE = 'off';
  process.env.SCHOLARSHIP_EXAM_S3_BUCKET = '';
}

function lowerCaseHeaderMap(headers = {}) {
  return Object.entries(headers || {}).reduce((accumulator, [key, value]) => {
    accumulator[String(key).toLowerCase()] = value;
    return accumulator;
  }, {});
}

class MockResponse {
  constructor() {
    this.statusCode = 200;
    this.headers = new Map();
    this.bodyBuffer = Buffer.alloc(0);
    this.finished = false;
  }

  status(code) {
    this.statusCode = Number(code);
    return this;
  }

  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), value);
    return this;
  }

  getHeader(name) {
    return this.headers.get(String(name).toLowerCase());
  }

  end(payload = '') {
    if (Buffer.isBuffer(payload)) {
      this.bodyBuffer = payload;
    } else if (payload === undefined || payload === null) {
      this.bodyBuffer = Buffer.alloc(0);
    } else {
      this.bodyBuffer = Buffer.from(String(payload), 'utf8');
    }
    this.finished = true;
    return this;
  }

  send(payload = '') {
    return this.end(payload);
  }
}

async function invokeHandler(handler, {
  method = 'GET',
  url = '/',
  headers = {},
  query = {},
  body = null,
  ipAddress = '127.0.0.1',
} = {}) {
  const req = {
    method,
    url,
    headers: lowerCaseHeaderMap(headers),
    query,
    body,
    socket: {
      remoteAddress: ipAddress,
    },
  };
  const res = new MockResponse();
  await handler(req, res);

  const text = res.bodyBuffer.toString('utf8');
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status: res.statusCode,
    headers: Object.fromEntries(res.headers.entries()),
    buffer: res.bodyBuffer,
    text,
    json,
  };
}

function assertJsonOk(response, label) {
  assert(
    response.status >= 200 && response.status < 300,
    `${label} -> HTTP ${response.status}`,
    response.json || response.text,
  );
  if (response.json && typeof response.json === 'object' && Object.prototype.hasOwnProperty.call(response.json, 'ok')) {
    assert(response.json.ok === true, `${label} -> API returned ok=false`, response.json);
  }
}

function createSilentWavBuffer(durationSeconds = 1, sampleRate = 8000) {
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const dataSize = sampleCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

function buildObjectiveAnswers(content) {
  return (Array.isArray(content?.questions) ? content.questions : [])
    .filter((question) => question?.type !== 'speaking')
    .map((question) => ({
      questionId: question.id,
      selectedOptionId: question.correctOptionId,
    }));
}

function buildSpeakingRubric(content) {
  return (Array.isArray(content?.questions) ? content.questions : [])
    .filter((question) => question?.type === 'speaking')
    .map((question) => ({
      questionId: question.id,
      score: Number(question.rubricMaxScore || 0),
    }));
}

function buildQueryString(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

function isMissingRelationError(error) {
  const code = safeTrim(error?.code).toUpperCase();
  return code === '42P01' || code === '42703';
}

async function readAdminUserColumnAvailability(client) {
  try {
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
  } catch (error) {
    if (isMissingRelationError(error)) {
      return {
        hasPasswordResetRequired: false,
        hasPasswordUpdatedAt: false,
      };
    }
    throw error;
  }
}

async function ensureSmokePanelUser(client, { email, fullName, role }) {
  const availability = await readAdminUserColumnAvailability(client);
  await client.query(
    `
      INSERT INTO roles (code, name)
      VALUES ($1, $2)
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
    `,
    [role, role.replace(/_/g, ' ')],
  );

  const existing = await client.query(
    `
      SELECT id
      FROM admin_users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [email],
  );

  let userId = existing.rows[0]?.id || null;
  if (userId) {
    const updateClauses = [
      'full_name = $2',
      "password_hash = crypt($3, gen_salt('bf', 12))",
      "status = 'ACTIVE'",
      'mfa_enabled = FALSE',
      'mfa_totp_secret = NULL',
      'updated_at = NOW()',
    ];
    if (availability.hasPasswordResetRequired) {
      updateClauses.push('password_reset_required = FALSE');
    }
    if (availability.hasPasswordUpdatedAt) {
      updateClauses.push('password_updated_at = NOW()');
    }

    const updated = await client.query(
      `
        UPDATE admin_users
        SET
          ${updateClauses.join(',\n          ')}
        WHERE id = $1::uuid
        RETURNING id
      `,
      [userId, fullName, `smoke-${randomUUID()}`],
    );
    userId = updated.rows[0]?.id || userId;
  } else {
    const columns = [
      'email',
      'full_name',
      'password_hash',
      'status',
      'mfa_enabled',
      'mfa_totp_secret',
      'updated_at',
    ];
    const values = [
      'lower($1)',
      '$2',
      "crypt($3, gen_salt('bf', 12))",
      "'ACTIVE'",
      'FALSE',
      'NULL',
      'NOW()',
    ];
    if (availability.hasPasswordResetRequired) {
      columns.splice(columns.length - 1, 0, 'password_reset_required');
      values.splice(values.length - 1, 0, 'FALSE');
    }
    if (availability.hasPasswordUpdatedAt) {
      columns.splice(columns.length - 1, 0, 'password_updated_at');
      values.splice(values.length - 1, 0, 'NOW()');
    }

    const inserted = await client.query(
      `
        INSERT INTO admin_users (
          ${columns.join(',\n          ')}
        )
        VALUES (
          ${values.join(',\n          ')}
        )
        RETURNING id
      `,
      [email, fullName, `smoke-${randomUUID()}`],
    );
    userId = inserted.rows[0]?.id || null;
  }

  assert(userId, 'panel smoke user could not be created');

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

  return {
    userId,
    email,
    fullName,
    role,
  };
}

async function readRolePermissions(client, role) {
  let result;
  try {
    result = await client.query(
      `
        SELECT p.code
        FROM role_permissions rp
        JOIN roles r ON r.id = rp.role_id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE r.code = $1
        ORDER BY p.code ASC
      `,
      [role],
    );
  } catch (error) {
    if (isMissingRelationError(error)) {
      return new Set(PANEL_ROLE_DEFAULTS[role] || []);
    }
    throw error;
  }

  if (result.rows.length === 0) {
    return new Set(PANEL_ROLE_DEFAULTS[role] || []);
  }

  return new Set(result.rows.map((row) => safeTrim(row.code).toUpperCase()).filter(Boolean));
}

async function readRoleIpPolicy(client, role) {
  let result;
  try {
    result = await client.query(
      `
        SELECT is_enabled, allowed_ips
        FROM admin_ip_policies
        WHERE role_code = $1
        LIMIT 1
      `,
      [role],
    );
  } catch (error) {
    if (isMissingRelationError(error)) {
      return {
        enabled: false,
        allowedIps: [],
      };
    }
    throw error;
  }

  const row = result.rows[0];
  return {
    enabled: Boolean(row?.is_enabled),
    allowedIps: Array.isArray(row?.allowed_ips) ? row.allowed_ips.map((item) => safeTrim(item)).filter(Boolean) : [],
  };
}

async function choosePanelRole(client) {
  for (const role of ['SUPER_ADMIN', 'OPERATIONS']) {
    const permissions = await readRolePermissions(client, role);
    const hasPermissions = REQUIRED_PANEL_PERMISSIONS.every((permission) => permissions.has(permission));
    if (!hasPermissions) continue;

    const ipPolicy = await readRoleIpPolicy(client, role);
    if (ipPolicy.enabled && ipPolicy.allowedIps.length === 0) {
      continue;
    }

    return {
      role,
      requestIp: ipPolicy.allowedIps[0] || '127.0.0.1',
    };
  }

  throw new Error('No usable panel role found for finalize/publish smoke.');
}

async function createPanelSession(client, { userId, email, role, ipAddress, userAgent }) {
  const sessionId = randomUUID();
  const tokenPayload = createPanelSessionToken({
    userId,
    sessionId,
    role,
    email,
    mfaVerified: true,
  });
  const tokenHash = hashPanelSessionToken(tokenPayload.token);

  await client.query(
    `
      INSERT INTO admin_sessions (
        id,
        admin_user_id,
        role_code,
        token_hash,
        mfa_verified_at,
        issued_at,
        expires_at,
        ip_address,
        user_agent,
        last_seen_at,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3,
        $4,
        NOW(),
        NOW(),
        $5::timestamptz,
        $6,
        $7,
        NOW(),
        NOW()
      )
    `,
    [sessionId, userId, role, tokenHash, tokenPayload.expiresAt, ipAddress, userAgent],
  );

  await client.query(
    `
      UPDATE admin_users
      SET last_login_at = NOW(), updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [userId],
  );

  return {
    sessionId,
    token: tokenPayload.token,
    expiresAt: tokenPayload.expiresAt,
  };
}

async function revokePanelSession(client, sessionId) {
  if (!sessionId) return;
  await client.query(
    `
      UPDATE admin_sessions
      SET revoked_at = NOW(), updated_at = NOW()
      WHERE id = $1::uuid
        AND revoked_at IS NULL
    `,
    [sessionId],
  );
}

async function main() {
  configureLocalSmokeEnv();

  const loadTestKey = normalizeEnvToken(
    process.env.LOAD_TEST_BYPASS_KEY
    || process.env.P0_11_LOAD_TEST_KEY
    || process.env.CRON_SECRET
    || process.env.NOTIFICATION_WORKER_SECRET,
  );
  assert(loadTestKey, 'LOAD_TEST_BYPASS_KEY / CRON_SECRET is required.');
  assert(normalizeEnvToken(process.env.DATABASE_URL || process.env.POSTGRES_URL), 'DATABASE_URL/POSTGRES_URL is required.');
  assert(normalizeEnvToken(process.env.PANEL_SESSION_SECRET), 'PANEL_SESSION_SECRET is required.');

  const checks = [];
  const fullContent = loadScholarshipExamFullContent({
    examVersionKey: 'bursluluk-2026-v1',
    grade: 'grade-08',
  });
  assert(fullContent, 'grade-08 scholarship full content is missing.');

  const objectiveAnswers = buildObjectiveAnswers(fullContent);
  const speakingRubric = buildSpeakingRubric(fullContent);
  const speakingQuestions = speakingRubric.map((item) => ({
    questionId: item.questionId,
    maxScore: item.score,
  }));
  const wavBuffer = createSilentWavBuffer(1);

  let attemptId = '';
  let resultId = '';
  let panelSessionId = '';
  let panelRole = '';
  let panelRequestIp = '';

  try {
    const startResponse = await invokeHandler(startHandler, {
      method: 'POST',
      url: '/api/exam/session/start',
      headers: {
        'content-type': 'application/json',
        'x-load-test-mode': 'cert',
        'x-load-test-key': loadTestKey,
      },
      body: {
        studentFullName: `Scholarship Smoke ${randomDigits(4)}`,
        parentFullName: `Smoke Parent ${randomDigits(4)}`,
        parentPhoneE164: '+905000000000',
        schoolName: 'Scholarship Smoke School',
        grade: 8,
        ageRange: '13-17',
        language: 'en',
        source: 'bursluluk_e2e_smoke',
        campaignCode: '2026_BURSLULUK',
        consent: {
          kvkkApproved: true,
          contactConsent: false,
          consentVersion: 'KVKK_v1_2026-03-13',
          legalTextVersion: 'KVKK_v1_2026-03-13',
          source: 'scholarship_e2e_smoke',
        },
      },
    });
    assertJsonOk(startResponse, 'exam_start');

    attemptId = safeTrim(startResponse.json?.session?.attemptId);
    const sessionToken = safeTrim(startResponse.json?.session?.sessionToken);
    const scholarshipExam = startResponse.json?.session?.scholarshipExam || null;

    assert(attemptId, 'exam_start did not return attemptId', startResponse.json);
    assert(sessionToken, 'exam_start did not return sessionToken', startResponse.json);
    assert(scholarshipExam?.examVersionKey === 'bursluluk-2026-v1', 'unexpected scholarship exam version', scholarshipExam);
    checks.push(makeCheck('exam_start', 'PASS', `attempt=${attemptId}`));

    const resultStatusBeforeSubmit = await invokeHandler(resultStatusHandler, {
      method: 'GET',
      url: `/api/exam/session/result-status${buildQueryString({ attemptId })}`,
      headers: {
        'x-exam-session-token': sessionToken,
      },
      query: { attemptId },
    });
    assertJsonOk(resultStatusBeforeSubmit, 'result_status_before_submit');
    assert(resultStatusBeforeSubmit.json?.status === 'started', 'initial result-status should be started', resultStatusBeforeSubmit.json);
    checks.push(makeCheck('result_status_before_submit', 'PASS', 'started'));

    const answerResponse = await invokeHandler(answerHandler, {
      method: 'POST',
      url: '/api/exam/session/answer',
      headers: {
        'content-type': 'application/json',
        'x-exam-session-token': sessionToken,
        'x-load-test-mode': 'cert',
        'x-load-test-key': loadTestKey,
      },
      body: {
        attemptId,
        examVersionKey: 'bursluluk-2026-v1',
        answers: objectiveAnswers,
      },
    });
    assertJsonOk(answerResponse, 'objective_answer_save');
    checks.push(makeCheck('objective_answer_save', 'PASS', `${objectiveAnswers.length} answers saved`));

    const speakingResponses = [];
    for (const question of speakingQuestions) {
      const initResponse = await invokeHandler(speakingInitHandler, {
        method: 'POST',
        url: '/api/exam/session/speaking/init',
        headers: {
          'content-type': 'application/json',
          'x-exam-session-token': sessionToken,
        },
        body: {
          attemptId,
          examVersionKey: 'bursluluk-2026-v1',
          questionId: question.questionId,
          mimeType: 'audio/wav',
          byteSize: wavBuffer.length,
        },
      });
      assertJsonOk(initResponse, `speaking_init_${question.questionId}`);

      const responseId = safeTrim(initResponse.json?.responseId);
      const uploadUrl = safeTrim(initResponse.json?.uploadUrl);
      assert(responseId, `speaking init missing responseId for ${question.questionId}`, initResponse.json);
      assert(uploadUrl, `speaking init missing uploadUrl for ${question.questionId}`, initResponse.json);

      const parsedUploadUrl = new URL(uploadUrl, 'http://localhost');
      const uploadQuery = Object.fromEntries(parsedUploadUrl.searchParams.entries());
      const uploadResponse = await invokeHandler(speakingUploadHandler, {
        method: initResponse.json?.uploadMethod || 'PUT',
        url: `${parsedUploadUrl.pathname}${parsedUploadUrl.search}`,
        headers: {
          'content-type': 'audio/wav',
        },
        query: uploadQuery,
        body: wavBuffer,
      });
      assert(
        uploadResponse.status === 204,
        `speaking upload failed for ${question.questionId}`,
        uploadResponse.text,
      );

      const completeResponse = await invokeHandler(speakingCompleteHandler, {
        method: 'POST',
        url: '/api/exam/session/speaking/complete',
        headers: {
          'content-type': 'application/json',
          'x-exam-session-token': sessionToken,
        },
        body: {
          attemptId,
          examVersionKey: 'bursluluk-2026-v1',
          questionId: question.questionId,
          responseId,
          mimeType: 'audio/wav',
          byteSize: wavBuffer.length,
          durationSeconds: 12,
        },
      });
      assertJsonOk(completeResponse, `speaking_complete_${question.questionId}`);
      assert(completeResponse.json?.status === 'uploaded', `speaking complete did not return uploaded for ${question.questionId}`, completeResponse.json);

      speakingResponses.push({
        questionId: question.questionId,
        responseId,
      });
    }
    checks.push(makeCheck('speaking_upload_flow', 'PASS', `${speakingResponses.length} speaking prompts uploaded`));

    const submitResponse = await invokeHandler(submitHandler, {
      method: 'POST',
      url: '/api/exam/session/submit',
      headers: {
        'content-type': 'application/json',
        'x-exam-session-token': sessionToken,
        'x-load-test-mode': 'cert',
        'x-load-test-key': loadTestKey,
      },
      body: {
        attemptId,
        examVersionKey: 'bursluluk-2026-v1',
        completionStatus: 'completed',
        durationSeconds: 900,
        objectiveAnswers,
        speakingResponses,
      },
    });
    assertJsonOk(submitResponse, 'scholarship_submit');
    assert(submitResponse.json?.status === 'evaluation_pending', 'submit should return evaluation_pending', submitResponse.json);
    checks.push(makeCheck('scholarship_submit', 'PASS', 'evaluation_pending'));

    const resultStatusAfterSubmit = await invokeHandler(resultStatusHandler, {
      method: 'GET',
      url: `/api/exam/session/result-status${buildQueryString({ attemptId })}`,
      headers: {
        'x-exam-session-token': sessionToken,
      },
      query: { attemptId },
    });
    assertJsonOk(resultStatusAfterSubmit, 'result_status_after_submit');
    assert(resultStatusAfterSubmit.json?.status === 'evaluation_pending', 'result-status after submit should be evaluation_pending', resultStatusAfterSubmit.json);
    checks.push(makeCheck('result_status_after_submit', 'PASS', 'evaluation_pending'));

    const sharedPool = sharedDb.getPool();
    const dbClient = await sharedPool.connect();
    try {
      const resultLookup = await dbClient.query(
        `
          SELECT
            r.id::text AS result_id,
            r.status AS result_status,
            ses.status AS submission_status
          FROM results r
          LEFT JOIN scholarship_exam_submissions ses ON ses.attempt_id = r.attempt_id
          WHERE r.attempt_id = $1::uuid
          LIMIT 1
        `,
        [attemptId],
      );
      resultId = safeTrim(resultLookup.rows[0]?.result_id);
      assert(resultId, 'result row was not created for scholarship submit');
      assert(safeTrim(resultLookup.rows[0]?.result_status).toUpperCase() === 'NOT_READY', 'result should be NOT_READY after scholarship submit', resultLookup.rows[0]);
      assert(safeTrim(resultLookup.rows[0]?.submission_status).toUpperCase() === 'EVALUATION_PENDING', 'submission should be EVALUATION_PENDING after submit', resultLookup.rows[0]);
      checks.push(makeCheck('db_result_row_after_submit', 'PASS', `result=${resultId}`));

      const chosenPanelRole = await choosePanelRole(dbClient);
      panelRole = chosenPanelRole.role;
      panelRequestIp = chosenPanelRole.requestIp;
      const smokePanelUser = await ensureSmokePanelUser(dbClient, {
        email: 'scholarship-e2e-smoke@teachera.local',
        fullName: 'Scholarship E2E Smoke',
        role: panelRole,
      });
      const panelSession = await createPanelSession(dbClient, {
        userId: smokePanelUser.userId,
        email: smokePanelUser.email,
        role: smokePanelUser.role,
        ipAddress: panelRequestIp,
        userAgent: 'codex-scholarship-e2e-smoke',
      });
      panelSessionId = panelSession.sessionId;
      checks.push(makeCheck('panel_session_ready', 'PASS', `${panelRole} via ${panelRequestIp}`));

      const panelAuthHeaders = {
        authorization: `Bearer ${panelSession.token}`,
        'x-forwarded-for': panelRequestIp,
      };

      const detailResponse = await invokeHandler(panelResultDetailHandler, {
        method: 'GET',
        url: `/api/panel/results/${resultId}`,
        headers: panelAuthHeaders,
        query: { resultId },
        ipAddress: panelRequestIp,
      });
      assertJsonOk(detailResponse, 'panel_result_detail');
      assert(safeTrim(detailResponse.json?.scholarship?.submission_status).toUpperCase() === 'EVALUATION_PENDING', 'panel detail should show evaluation_pending before finalize', detailResponse.json);
      assert(Number(detailResponse.json?.scholarship?.speaking_uploaded_count || 0) === speakingResponses.length, 'panel detail speaking_uploaded_count mismatch', detailResponse.json);
      assert(Array.isArray(detailResponse.json?.speaking_questions) && detailResponse.json.speaking_questions.length === speakingResponses.length, 'panel detail missing speaking questions', detailResponse.json);
      checks.push(makeCheck('panel_result_detail', 'PASS', `${detailResponse.json?.speaking_questions?.length || 0} speaking questions`));

      const firstSpeakingResponseId = safeTrim(detailResponse.json?.speaking_questions?.[0]?.response?.response_id);
      assert(firstSpeakingResponseId, 'panel detail did not expose speaking response id', detailResponse.json);

      const audioResponse = await invokeHandler(panelSpeakingAudioHandler, {
        method: 'GET',
        url: `/api/panel/results/${resultId}/speaking/${firstSpeakingResponseId}`,
        headers: panelAuthHeaders,
        query: { resultId, responseId: firstSpeakingResponseId },
        ipAddress: panelRequestIp,
      });
      assert(audioResponse.status === 200, `panel speaking audio -> HTTP ${audioResponse.status}`, audioResponse.text);
      assert(audioResponse.buffer.length === wavBuffer.length, 'downloaded speaking audio length mismatch', {
        expected: wavBuffer.length,
        actual: audioResponse.buffer.length,
      });
      const expectedHash = createHash('sha256').update(wavBuffer).digest('hex');
      const actualHash = createHash('sha256').update(audioResponse.buffer).digest('hex');
      assert(expectedHash === actualHash, 'downloaded speaking audio hash mismatch');
      checks.push(makeCheck('panel_speaking_audio', 'PASS', `${audioResponse.buffer.length} bytes`));

      const finalizeResponse = await invokeHandler(panelResultActionsHandler, {
        method: 'POST',
        url: '/api/panel/results/actions',
        headers: {
          ...panelAuthHeaders,
          'content-type': 'application/json',
        },
        body: {
          action: 'finalize',
          resultIds: [resultId],
          rubric: speakingRubric,
        },
        ipAddress: panelRequestIp,
      });
      assertJsonOk(finalizeResponse, 'panel_finalize');
      assert(Number(finalizeResponse.json?.item?.result_score || 0) === 100, 'finalize should compute full score 100', finalizeResponse.json);
      assert(safeTrim(finalizeResponse.json?.item?.scholarship_submission_status).toUpperCase() === 'FINALIZED', 'finalize should mark submission FINALIZED', finalizeResponse.json);
      checks.push(makeCheck('panel_finalize', 'PASS', `score=${finalizeResponse.json?.item?.result_score}`));

      const resultStatusAfterFinalize = await invokeHandler(resultStatusHandler, {
        method: 'GET',
        url: `/api/exam/session/result-status${buildQueryString({ attemptId })}`,
        headers: {
          'x-exam-session-token': sessionToken,
        },
        query: { attemptId },
      });
      assertJsonOk(resultStatusAfterFinalize, 'result_status_after_finalize');
      assert(resultStatusAfterFinalize.json?.status === 'evaluation_pending', 'result-status should stay evaluation_pending until publish', resultStatusAfterFinalize.json);
      checks.push(makeCheck('result_status_after_finalize', 'PASS', 'evaluation_pending'));

      const publishResponse = await invokeHandler(panelResultActionsHandler, {
        method: 'POST',
        url: '/api/panel/results/actions',
        headers: {
          ...panelAuthHeaders,
          'content-type': 'application/json',
        },
        body: {
          action: 'publish',
          resultIds: [resultId],
          enqueue_whatsapp: false,
        },
        ipAddress: panelRequestIp,
      });
      assertJsonOk(publishResponse, 'panel_publish');
      assert(Number(publishResponse.json?.published || 0) === 1, 'publish should affect exactly one result', publishResponse.json);
      checks.push(makeCheck('panel_publish', 'PASS', `notifications=${publishResponse.json?.sms_notifications_enqueued ?? 0}`));

      const notificationLookup = await dbClient.query(
        `
          SELECT template_code, recipient
          FROM notification_jobs
          WHERE result_id = $1::uuid
            AND channel = 'SMS'
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [resultId],
      );
      const notificationRow = notificationLookup.rows[0] || null;
      assert(notificationRow, 'publish did not enqueue SMS notification job');
      assert(safeTrim(notificationRow.recipient).startsWith('lt:'), 'publish SMS recipient should stay in load-test token format', notificationRow);
      checks.push(makeCheck('publish_notification_safe_recipient', 'PASS', safeTrim(notificationRow.recipient)));

      const resultStatusAfterPublish = await invokeHandler(resultStatusHandler, {
        method: 'GET',
        url: `/api/exam/session/result-status${buildQueryString({ attemptId })}`,
        headers: {
          'x-exam-session-token': sessionToken,
        },
        query: { attemptId },
      });
      assertJsonOk(resultStatusAfterPublish, 'result_status_after_publish');
      assert(resultStatusAfterPublish.json?.status === 'finalized', 'result-status after publish should be finalized', resultStatusAfterPublish.json);
      assert(Number(resultStatusAfterPublish.json?.finalScore || 0) === 100, 'result-status after publish should expose finalScore=100', resultStatusAfterPublish.json);
      checks.push(makeCheck('result_status_after_publish', 'PASS', `finalScore=${resultStatusAfterPublish.json?.finalScore}`));

      const candidateResultResponse = await invokeHandler(examResultHandler, {
        method: 'GET',
        url: `/api/exam/results/${attemptId}`,
        headers: {
          'x-exam-session-token': sessionToken,
          'x-load-test-mode': 'cert',
          'x-load-test-key': loadTestKey,
        },
        query: { attemptId },
      });
      assertJsonOk(candidateResultResponse, 'candidate_result_fetch');
      assert(Number(candidateResultResponse.json?.result?.score || 0) === 100, 'candidate result score should be 100 after publish', candidateResultResponse.json);
      assert(safeTrim(candidateResultResponse.json?.result?.status).toUpperCase() === 'PUBLISHED', 'candidate result status should be PUBLISHED in load-test fetch', candidateResultResponse.json);
      checks.push(makeCheck('candidate_result_fetch', 'PASS', `score=${candidateResultResponse.json?.result?.score}`));
    } finally {
      try {
        await revokePanelSession(dbClient, panelSessionId);
      } finally {
        dbClient.release();
      }
    }

    const report = {
      ok: true,
      overall_pass: true,
      timestamp: nowIso(),
      grade: 'grade-08',
      attempt_id: attemptId,
      result_id: resultId,
      panel_role: panelRole || null,
      panel_request_ip: panelRequestIp || null,
      checks,
      totals: reduceTotals(checks),
    };
    await writeArtifacts(report);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const report = {
      ok: false,
      overall_pass: false,
      timestamp: nowIso(),
      grade: 'grade-08',
      attempt_id: attemptId || null,
      result_id: resultId || null,
      panel_role: panelRole || null,
      panel_request_ip: panelRequestIp || null,
      checks: [
        ...checks,
        makeCheck(
          'fatal',
          'FAIL',
          error?.message || String(error),
          error?.details || null,
        ),
      ],
      totals: reduceTotals([
        ...checks,
        makeCheck(
          'fatal',
          'FAIL',
          error?.message || String(error),
          error?.details || null,
        ),
      ]),
    };
    await writeArtifacts(report);
    console.error('[scholarship-exam-e2e-smoke] failed', error?.message || String(error));
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([
      sharedDb.getPool().end(),
      examDb.getPool().end(),
      panelDb.getPool().end(),
    ]);
    process.exit(process.exitCode || 0);
  }
}

main();
