import { getPool, query, withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { clampInt, handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { decryptPii } from '../../_lib/piiCrypto.js';

const WORKER_ADVISORY_LOCK_CLASS_ID_DEFAULT = 20260320;
const WORKER_ADVISORY_LOCK_OBJECT_ID_DEFAULT = 1101;
const ACTIVE_CONVERSION_EVENTS = ['ENROLLMENT_CONVERTED', 'SALE_CONVERTED', 'ENROLLED'];

function extractBearer(req) {
  const header = safeTrim(req.headers?.authorization);
  if (!header) return '';
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

function assertWorkerSecret(req) {
  const expected = safeTrim(process.env.CRM_EXPORT_WORKER_SECRET || process.env.CRON_SECRET || process.env.NOTIFICATION_WORKER_SECRET);
  if (!expected) return;
  const provided = safeTrim(req.headers?.['x-worker-secret'] || req.query?.worker_secret || extractBearer(req));
  if (!provided || provided !== expected) {
    throw new HttpError(401, 'CRM worker secret is invalid.', 'invalid_worker_secret');
  }
}

function readBoundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function resolveAdvisoryLockIds() {
  return {
    classId: readBoundedInt(
      process.env.CRM_EXPORT_WORKER_LOCK_CLASS_ID,
      WORKER_ADVISORY_LOCK_CLASS_ID_DEFAULT,
      1,
      2147483647,
    ),
    objectId: readBoundedInt(
      process.env.CRM_EXPORT_WORKER_LOCK_OBJECT_ID,
      WORKER_ADVISORY_LOCK_OBJECT_ID_DEFAULT,
      1,
      2147483647,
    ),
  };
}

function resolveRuntimeConfig() {
  return {
    endpoint: safeTrim(process.env.CRM_PROVIDER_ENDPOINT),
    token: safeTrim(process.env.CRM_PROVIDER_TOKEN),
    requestTimeoutMs: readBoundedInt(process.env.CRM_EXPORT_REQUEST_TIMEOUT_MS, 15000, 1000, 120000),
    leaseSeconds: readBoundedInt(process.env.CRM_EXPORT_LEASE_SECONDS, 120, 10, 1800),
    retryDelaySeconds: readBoundedInt(process.env.CRM_EXPORT_RETRY_DELAY_SECONDS, 180, 5, 86400),
    maxRetry: readBoundedInt(process.env.CRM_EXPORT_MAX_RETRY, 4, 1, 20),
  };
}

async function acquireWorkerRunLock() {
  const { classId, objectId } = resolveAdvisoryLockIds();
  const pool = getPool();
  const client = await pool.connect();
  try {
    const lockResult = await client.query(
      'SELECT pg_try_advisory_lock($1::int, $2::int) AS locked',
      [classId, objectId],
    );
    const locked = Boolean(lockResult.rows[0]?.locked);
    if (!locked) {
      client.release();
      return {
        locked: false,
        release: async () => {},
      };
    }

    return {
      locked: true,
      release: async () => {
        try {
          await client.query(
            'SELECT pg_advisory_unlock($1::int, $2::int)',
            [classId, objectId],
          );
        } finally {
          client.release();
        }
      },
    };
  } catch (error) {
    client.release();
    throw error;
  }
}

async function lockPendingJobs(limit, leaseSeconds, campaignCode = '') {
  return withTransaction(async (client) => {
    const result = await client.query(
      `
        WITH pending AS (
          SELECT id
          FROM crm_export_jobs
          WHERE status IN ('QUEUED', 'RETRYING')
            AND (next_retry_at IS NULL OR next_retry_at <= NOW())
            AND ($3::text = '' OR campaign_code = $3)
          ORDER BY created_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE crm_export_jobs ce
        SET
          status = 'PROCESSING',
          next_retry_at = NOW() + make_interval(secs => $2::int),
          updated_at = NOW()
        FROM pending
        WHERE ce.id = pending.id
        RETURNING ce.id, ce.campaign_code, ce.candidate_id, ce.attempt_id, ce.result_id, ce.retry_count
      `,
      [limit, leaseSeconds, campaignCode],
    );
    return result.rows;
  });
}

async function loadCandidatePayload(candidateId) {
  const result = await query(
    `
      SELECT
        c.id AS candidate_id,
        c.campaign_code,
        c.full_name AS student_full_name_legacy,
        c.full_name_enc AS student_full_name_enc,
        c.grade,
        s.name AS school_name,
        g.full_name AS parent_full_name_legacy,
        g.full_name_enc AS parent_full_name_enc,
        g.phone_e164 AS parent_phone_e164_legacy,
        g.phone_e164_enc AS parent_phone_e164_enc,
        a.application_no,
        ea.id AS attempt_id,
        ea.status AS exam_status,
        ea.started_at,
        ea.submitted_at,
        r.id AS result_id,
        r.status AS result_status,
        r.score,
        r.percentage,
        r.correct_count,
        r.wrong_count,
        r.unanswered_count,
        r.placement_label,
        r.cefr_band,
        r.published_at,
        r.viewed_at,
        appt.appointment_status,
        appt.appointment_status_at,
        note.operator_note,
        note.operator_note_at,
        conversion.converted_to_enrollment,
        bot.last_bot_followup_at
      FROM candidates c
      LEFT JOIN schools s ON s.id = c.school_id
      LEFT JOIN guardians g ON g.id = c.guardian_id
      LEFT JOIN LATERAL (
        SELECT application_no
        FROM applications a2
        WHERE a2.candidate_id = c.id
        ORDER BY a2.created_at DESC
        LIMIT 1
      ) a ON TRUE
      LEFT JOIN LATERAL (
        SELECT *
        FROM exam_attempts ea2
        WHERE ea2.candidate_id = c.id
        ORDER BY ea2.created_at DESC
        LIMIT 1
      ) ea ON TRUE
      LEFT JOIN LATERAL (
        SELECT *
        FROM results r2
        WHERE r2.candidate_id = c.id
        ORDER BY r2.created_at DESC
        LIMIT 1
      ) r ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          CASE ev.event_type
            WHEN 'APPOINTMENT_BOOKED' THEN 'BOOKED'
            WHEN 'APPOINTMENT_ATTENDED' THEN 'ATTENDED'
            WHEN 'APPOINTMENT_NO_SHOW' THEN 'NO_SHOW'
            ELSE NULL
          END AS appointment_status,
          ev.occurred_at AS appointment_status_at
        FROM activity_events ev
        WHERE ev.candidate_id = c.id
          AND ev.event_type IN ('APPOINTMENT_BOOKED', 'APPOINTMENT_ATTENDED', 'APPOINTMENT_NO_SHOW')
        ORDER BY ev.occurred_at DESC
        LIMIT 1
      ) appt ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          ev.event_payload ->> 'note' AS operator_note,
          ev.occurred_at AS operator_note_at
        FROM activity_events ev
        WHERE ev.candidate_id = c.id
          AND ev.event_type = 'OPERATOR_NOTE'
        ORDER BY ev.occurred_at DESC
        LIMIT 1
      ) note ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          EXISTS (
            SELECT 1
            FROM activity_events ev
            WHERE ev.candidate_id = c.id
              AND ev.event_type = ANY($2::text[])
          ) AS converted_to_enrollment
      ) conversion ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          ev.occurred_at AS last_bot_followup_at
        FROM activity_events ev
        WHERE ev.candidate_id = c.id
          AND ev.event_type = 'BOT_FOLLOWUP_ENQUEUED'
        ORDER BY ev.occurred_at DESC
        LIMIT 1
      ) bot ON TRUE
      WHERE c.id = $1
      LIMIT 1
    `,
    [candidateId, ACTIVE_CONVERSION_EVENTS],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const [studentFullName, parentFullName, parentPhone] = await Promise.all([
    decryptPii(row.student_full_name_enc, row.student_full_name_legacy),
    decryptPii(row.parent_full_name_enc, row.parent_full_name_legacy),
    decryptPii(row.parent_phone_e164_enc, row.parent_phone_e164_legacy),
  ]);

  return {
    candidate_id: row.candidate_id,
    campaign_code: row.campaign_code,
    application_no: row.application_no,
    student_full_name: studentFullName,
    grade: row.grade,
    school_name: row.school_name,
    parent_full_name: parentFullName,
    parent_phone_e164: parentPhone,
    exam: {
      attempt_id: row.attempt_id,
      status: row.exam_status,
      started_at: row.started_at,
      submitted_at: row.submitted_at,
    },
    result: {
      result_id: row.result_id,
      status: row.result_status,
      score: row.score,
      percentage: row.percentage,
      correct_count: row.correct_count,
      wrong_count: row.wrong_count,
      unanswered_count: row.unanswered_count,
      placement_label: row.placement_label,
      cefr_band: row.cefr_band,
      published_at: row.published_at,
      viewed_at: row.viewed_at,
    },
    appointment: {
      status: row.appointment_status,
      status_at: row.appointment_status_at,
    },
    notes: {
      latest_operator_note: row.operator_note,
      latest_operator_note_at: row.operator_note_at,
    },
    conversion: {
      converted_to_enrollment: Boolean(row.converted_to_enrollment),
    },
    automation: {
      last_bot_followup_at: row.last_bot_followup_at,
    },
  };
}

function buildPayloadEnvelope(payload) {
  return {
    source: 'teachera_bursluluk_2026',
    generated_at: new Date().toISOString(),
    candidate: payload,
  };
}

async function sendToCrmProvider(payload, config) {
  if (!config.endpoint) {
    const error = new Error('missing_crm_provider_endpoint');
    error.code = 'missing_crm_provider_endpoint';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    let response;
    try {
      response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        },
        body: JSON.stringify(buildPayloadEnvelope(payload)),
        signal: controller.signal,
      });
    } catch (error) {
      const networkError = new Error(error?.name === 'AbortError' ? 'crm_provider_timeout' : 'crm_provider_unreachable');
      networkError.code = networkError.message;
      throw networkError;
    }

    const responsePayload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerError = new Error(response.status >= 500 ? 'crm_provider_unavailable' : 'crm_provider_rejected');
      providerError.code = providerError.message;
      providerError.httpStatus = response.status;
      providerError.responsePayload = responsePayload;
      throw providerError;
    }

    return {
      httpStatus: response.status,
      responsePayload,
      externalReference: safeTrim(
        responsePayload?.reference_id
          || responsePayload?.crm_id
          || responsePayload?.id
          || responsePayload?.external_id
          || '',
      ),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function truncate(value, maxLength) {
  const raw = String(value ?? '');
  return raw.length <= maxLength ? raw : raw.slice(0, maxLength);
}

async function markSuccess(jobId, providerResult) {
  await query(
    `
      UPDATE crm_export_jobs
      SET
        status = 'SUCCEEDED',
        next_retry_at = NULL,
        http_status = $2,
        response_payload = $3::jsonb,
        external_reference = NULLIF($4, ''),
        error_code = NULL,
        error_message = NULL,
        processed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `,
    [jobId, providerResult.httpStatus, JSON.stringify(providerResult.responsePayload || {}), providerResult.externalReference || ''],
  );
}

async function markFailure(jobId, failure, config) {
  const errorCode = safeTrim(failure?.code || failure?.message || 'crm_export_failed').slice(0, 120);
  const errorMessage = truncate(failure?.message || errorCode || 'crm_export_failed', 2000);
  const responsePayload = failure?.responsePayload && typeof failure.responsePayload === 'object'
    ? failure.responsePayload
    : {};
  const httpStatus = Number.isFinite(failure?.httpStatus) ? Number(failure.httpStatus) : null;

  const updateResult = await query(
    `
      UPDATE crm_export_jobs
      SET
        retry_count = retry_count + 1,
        status = CASE
          WHEN retry_count + 1 >= $2 THEN 'DLQ'::crm_export_status
          ELSE 'RETRYING'::crm_export_status
        END,
        next_retry_at = CASE
          WHEN retry_count + 1 >= $2 THEN NULL
          ELSE NOW() + make_interval(secs => $3::int)
        END,
        http_status = COALESCE($4::int, http_status),
        response_payload = CASE
          WHEN $5::jsonb = '{}'::jsonb THEN response_payload
          ELSE $5::jsonb
        END,
        error_code = NULLIF($6, ''),
        error_message = NULLIF($7, ''),
        processed_at = CASE WHEN retry_count + 1 >= $2 THEN NOW() ELSE processed_at END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING status, retry_count
    `,
    [jobId, config.maxRetry, config.retryDelaySeconds, httpStatus, JSON.stringify(responsePayload), errorCode, errorMessage],
  );
  return updateResult.rows[0] || null;
}

async function appendJobEvent(job, eventType, payload) {
  if (!job?.candidate_id) return;
  await query(
    `
      INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
      VALUES ($1, $2, $3, $4::jsonb)
    `,
    [
      job.candidate_id,
      job.attempt_id || null,
      eventType,
      JSON.stringify({
        ...payload,
        job_id: job.id,
        createdAt: new Date().toISOString(),
      }),
    ],
  );
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET', 'POST']);
    assertWorkerSecret(req);

    const body = req.method === 'POST' ? await parseBody(req) : null;
    const config = resolveRuntimeConfig();
    const limit = clampInt(body?.limit ?? req.query?.limit ?? 100, 1, 500, 100);
    const campaignCode = safeTrim(body?.campaign_code || body?.campaignCode || req.query?.campaign_code).slice(0, 120);

    const lock = await acquireWorkerRunLock();
    if (!lock.locked) {
      ok(res, {
        processed: 0,
        success: 0,
        failed: 0,
        retried: 0,
        dlq: 0,
        reason: 'worker_lock_held',
      });
      return;
    }

    try {
      const jobs = await lockPendingJobs(limit, config.leaseSeconds, campaignCode);
      if (jobs.length === 0) {
        ok(res, {
          processed: 0,
          success: 0,
          failed: 0,
          retried: 0,
          dlq: 0,
          queue_empty: true,
        });
        return;
      }

      let success = 0;
      let failed = 0;
      let retried = 0;
      let dlq = 0;

      for (const job of jobs) {
        try {
          const payload = await loadCandidatePayload(job.candidate_id);
          if (!payload) {
            const notFoundError = new Error('candidate_not_found');
            notFoundError.code = 'candidate_not_found';
            throw notFoundError;
          }

          const providerResult = await sendToCrmProvider(payload, config);
          await markSuccess(job.id, providerResult);
          await appendJobEvent(job, 'CRM_EXPORT_SUCCEEDED', {
            http_status: providerResult.httpStatus,
            external_reference: providerResult.externalReference || null,
          });
          success += 1;
        } catch (error) {
          const failureState = await markFailure(job.id, error, config);
          await appendJobEvent(job, 'CRM_EXPORT_FAILED', {
            error_code: safeTrim(error?.code || error?.message || 'crm_export_failed'),
            retry_count: failureState?.retry_count ?? null,
            status: failureState?.status || null,
          });
          failed += 1;
          if (failureState?.status === 'DLQ') {
            dlq += 1;
          } else {
            retried += 1;
          }
        }
      }

      ok(res, {
        processed: jobs.length,
        success,
        failed,
        retried,
        dlq,
      });
    } finally {
      await lock.release();
    }
  });
}
