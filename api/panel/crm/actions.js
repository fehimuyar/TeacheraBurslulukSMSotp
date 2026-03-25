// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';

function isMissingCrmSchema(error) {
  const code = safeTrim(error?.code);
  const message = safeTrim(error?.message).toLowerCase();
  return code === '42P01' && message.includes('crm_export_jobs');
}

function normalizeIds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => safeTrim(item)).filter(Boolean).slice(0, 1000);
}

async function enqueueCandidateJobs(client, candidateIds, identity) {
  const candidatesResult = await client.query(
    `
      SELECT
        c.id AS candidate_id,
        c.campaign_code,
        ea.id AS attempt_id,
        r.id AS result_id
      FROM candidates c
      LEFT JOIN LATERAL (
        SELECT id
        FROM exam_attempts
        WHERE candidate_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
      ) ea ON TRUE
      LEFT JOIN LATERAL (
        SELECT id
        FROM results
        WHERE candidate_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
      ) r ON TRUE
      WHERE c.id = ANY($1::uuid[])
    `,
    [candidateIds],
  );

  if (candidatesResult.rows.length === 0) {
    throw new HttpError(404, 'No matching candidates found.', 'candidates_not_found');
  }

  const createdAt = new Date().toISOString();
  const inserted = [];
  for (const candidate of candidatesResult.rows) {
    const insertResult = await client.query(
      `
        INSERT INTO crm_export_jobs (
          campaign_code,
          candidate_id,
          attempt_id,
          result_id,
          destination,
          request_payload,
          status,
          retry_count,
          next_retry_at,
          enqueued_by,
          enqueued_role,
          enqueued_at,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          'EXTERNAL_CRM',
          $5::jsonb,
          'QUEUED',
          0,
          NOW(),
          $6,
          $7,
          NOW(),
          NOW(),
          NOW()
        )
        ON CONFLICT (campaign_code, candidate_id)
          WHERE status IN ('QUEUED', 'PROCESSING', 'RETRYING')
        DO NOTHING
        RETURNING id
      `,
      [
        candidate.campaign_code,
        candidate.candidate_id,
        candidate.attempt_id,
        candidate.result_id,
        JSON.stringify({
          trigger: 'panel_manual_enqueue',
          requested_at: createdAt,
        }),
        identity.keyId || identity.userId || identity.email || null,
        identity.role || null,
      ],
    );

    const createdJob = insertResult.rows[0];
    if (!createdJob?.id) {
      continue;
    }

    inserted.push({
      job_id: createdJob.id,
      candidate_id: candidate.candidate_id,
      attempt_id: candidate.attempt_id,
    });

    await client.query(
      `
        INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
        VALUES ($1, $2, 'CRM_EXPORT_ENQUEUED', $3::jsonb)
      `,
      [
        candidate.candidate_id,
        candidate.attempt_id,
        JSON.stringify({
          job_id: createdJob.id,
          source: 'panel_crm_actions',
          createdAt,
        }),
      ],
    );
  }

  return {
    matched: candidatesResult.rows.length,
    inserted,
  };
}

async function runJobAction(client, action, jobIds) {
  if (action === 'retry') {
    const result = await client.query(
      `
        UPDATE crm_export_jobs
        SET
          status = 'QUEUED',
          retry_count = CASE WHEN status = 'CANCELLED' THEN 0 ELSE retry_count END,
          next_retry_at = NOW(),
          error_code = NULL,
          error_message = NULL,
          updated_at = NOW()
        WHERE id = ANY($1::uuid[])
          AND status IN ('FAILED', 'DLQ', 'CANCELLED')
        RETURNING id
      `,
      [jobIds],
    );
    return result.rows.map((row) => row.id);
  }

  if (action === 'cancel') {
    const result = await client.query(
      `
        UPDATE crm_export_jobs
        SET
          status = 'CANCELLED',
          next_retry_at = NULL,
          updated_at = NOW()
        WHERE id = ANY($1::uuid[])
          AND status IN ('QUEUED', 'PROCESSING', 'RETRYING', 'FAILED', 'DLQ')
        RETURNING id
      `,
      [jobIds],
    );
    return result.rows.map((row) => row.id);
  }

  throw new HttpError(400, 'Unsupported action.', 'invalid_action');
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);
    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS],
      ['PANEL_CRM_PUSH'],
    );

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const action = safeTrim(body.action).toLowerCase();
    if (!['enqueue', 'retry', 'cancel'].includes(action)) {
      throw new HttpError(400, 'Unsupported action.', 'invalid_action');
    }

    if (action === 'enqueue') {
      const candidateIds = normalizeIds(body.candidate_ids || body.candidateIds);
      if (candidateIds.length === 0) {
        throw new HttpError(400, 'candidateIds is required for enqueue action.', 'missing_candidate_ids');
      }

      let enqueueResult;
      try {
        enqueueResult = await withTransaction((client) => enqueueCandidateJobs(client, candidateIds, identity));
      } catch (error) {
        if (isMissingCrmSchema(error)) {
          throw new HttpError(503, 'CRM export schema is missing. Run DB migration 20260320_0011 first.', 'crm_schema_missing');
        }
        throw error;
      }
      const enqueuedJobIds = enqueueResult.inserted.map((item) => item.job_id);
      const ctx = readRequestContext(req);
      const auditEntry = await appendAuditLog({
        ...buildPanelActor(identity),
        action: 'PANEL_CRM_EXPORT_ENQUEUE',
        targetType: 'CANDIDATE_BATCH',
        targetId: String(candidateIds.length),
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: {
          candidateIds,
          enqueuedJobIds,
        },
      });

      ok(res, {
        action,
        requested: candidateIds.length,
        matched: enqueueResult.matched,
        enqueued: enqueuedJobIds.length,
        skipped: enqueueResult.matched - enqueuedJobIds.length,
        job_ids: enqueuedJobIds,
        audit_log_id: auditEntry?.id || null,
        audit_log_seq: auditEntry?.seq || null,
      });
      return;
    }

    const jobIds = normalizeIds(body.job_ids || body.jobIds);
    if (jobIds.length === 0) {
      throw new HttpError(400, 'jobIds is required.', 'missing_job_ids');
    }

    let updatedJobIds;
    try {
      updatedJobIds = await withTransaction((client) => runJobAction(client, action, jobIds));
    } catch (error) {
      if (isMissingCrmSchema(error)) {
        throw new HttpError(503, 'CRM export schema is missing. Run DB migration 20260320_0011 first.', 'crm_schema_missing');
      }
      throw error;
    }
    const ctx = readRequestContext(req);
    const auditEntry = await appendAuditLog({
      ...buildPanelActor(identity),
      action: action === 'retry' ? 'PANEL_CRM_EXPORT_RETRY' : 'PANEL_CRM_EXPORT_CANCEL',
      targetType: 'CRM_JOB_BATCH',
      targetId: String(jobIds.length),
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        requestedJobIds: jobIds,
        updatedJobIds,
      },
    });

    ok(res, {
      action,
      requested: jobIds.length,
      updated: updatedJobIds.length,
      job_ids: updatedJobIds,
      audit_log_id: auditEntry?.id || null,
      audit_log_seq: auditEntry?.seq || null,
    });
  });
}
