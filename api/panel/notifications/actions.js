// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { query, withTransaction } from '../../_lib/db.js';
import { readDefaultCampaignCode } from '../../_lib/env.js';
import { HttpError } from '../../_lib/errors.js';
import { resolveExamGateStatus } from '../../_lib/examGate.js';
import { enqueueExamReminderSmsIfNeeded } from '../../_lib/examReminderSms.js';
import { clampInt, handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { decryptPii } from '../../_lib/piiCrypto.js';

function normalizeIds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => safeTrim(item)).filter(Boolean).slice(0, 1000);
}

function parseBooleanLike(value) {
  const normalized = safeTrim(value).toLowerCase();
  if (!normalized) return false;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function normalizeDateTimeLike(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : '';
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return '';
    const parsed = new Date(normalized);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : normalized;
  }
  return '';
}

function resolveReminderWindow({ examOpenAt, leadMinutes, windowMinutes }) {
  const openAtMs = Number(new Date(examOpenAt));
  if (!Number.isFinite(openAtMs)) {
    return {
      in_window: false,
      reason: 'invalid_exam_open_at',
      exam_open_at: examOpenAt || null,
    };
  }

  const nowMs = Date.now();
  const reminderAtMs = openAtMs - (leadMinutes * 60 * 1000);
  const windowStartMs = reminderAtMs;
  const windowEndMs = reminderAtMs + (windowMinutes * 60 * 1000);

  return {
    in_window: nowMs >= windowStartMs && nowMs < windowEndMs,
    reason: nowMs < windowStartMs ? 'too_early' : (nowMs >= windowEndMs ? 'too_late' : 'in_window'),
    now_utc: new Date(nowMs).toISOString(),
    exam_open_at: new Date(openAtMs).toISOString(),
    reminder_at_utc: new Date(reminderAtMs).toISOString(),
    window_start_utc: new Date(windowStartMs).toISOString(),
    window_end_utc: new Date(windowEndMs).toISOString(),
    seconds_until_reminder: Math.ceil((reminderAtMs - nowMs) / 1000),
    seconds_until_exam_open: Math.ceil((openAtMs - nowMs) / 1000),
  };
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);
    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS],
      ['PANEL_NOTIFICATIONS_ACTION'],
    );

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const action = safeTrim(body.action).toLowerCase();
    const previewOnly = parseBooleanLike(body.preview ?? body.dry_run ?? body.dryRun);
    if (action === 'run_exam_reminder_broadcast') {
      const campaignCode = safeTrim(body.campaign_code || body.campaignCode || readDefaultCampaignCode()).slice(0, 120);
      const limit = clampInt(body.limit ?? 250, 1, 2000, 250);
      const reminderLeadMinutes = clampInt(
        body.reminder_lead_minutes ?? body.reminderLeadMinutes ?? process.env.EXAM_REMINDER_LEAD_MINUTES ?? 30,
        1,
        24 * 60,
        30,
      );
      const reminderWindowMinutes = clampInt(
        body.reminder_window_minutes ?? body.reminderWindowMinutes ?? process.env.EXAM_REMINDER_WINDOW_MINUTES ?? 2,
        1,
        60,
        2,
      );
      const force = parseBooleanLike(body.force ?? process.env.EXAM_REMINDER_FORCE_SEND);

      if (!campaignCode) {
        throw new HttpError(400, 'campaignCode is required.', 'missing_campaign_code');
      }

      const gate = await resolveExamGateStatus(campaignCode);
      const gateReminderWindow = gate.exam_open_at
        ? resolveReminderWindow({
          examOpenAt: gate.exam_open_at,
          leadMinutes: reminderLeadMinutes,
          windowMinutes: reminderWindowMinutes,
        })
        : null;

      const { rows } = await query(
        `
          SELECT
            ea.id AS attempt_id,
            ea.candidate_id,
            ea.campaign_code,
            ea.scheduled_exam_at,
            a.application_no,
            a.candidate_code,
            g.phone_e164 AS parent_phone_e164_legacy,
            g.phone_e164_enc AS parent_phone_e164_enc
          FROM exam_attempts ea
          JOIN applications a ON a.id = ea.application_id
          JOIN candidates c ON c.id = ea.candidate_id
          LEFT JOIN guardians g ON g.id = c.guardian_id
          WHERE ea.campaign_code = $1
            AND ea.status IN ('WAITING', 'OPEN', 'STARTED')
            AND NOT EXISTS (
              SELECT 1
              FROM notification_jobs nj
              WHERE nj.attempt_id = ea.id
                AND nj.channel = 'SMS'
                AND nj.template_code = 'EXAM_REMINDER_SMS'
                AND nj.status IN ('QUEUED', 'RETRYING', 'SENT', 'DELIVERED', 'READ')
            )
          ORDER BY
            (ea.scheduled_exam_at IS NULL) ASC,
            COALESCE(ea.scheduled_exam_at, ea.created_at) ASC,
            ea.created_at ASC
          LIMIT $2
        `,
        [campaignCode, limit],
      );

      let enqueueable = 0;
      let enqueued = 0;
      let skippedNoPhone = 0;
      let skippedNoExamOpenAt = 0;
      let skippedOutsideWindow = 0;
      let skippedErrors = 0;
      const enqueuedJobIds = [];

      for (const row of rows) {
        let parentPhoneE164;
        try {
          parentPhoneE164 = await decryptPii(row.parent_phone_e164_enc, row.parent_phone_e164_legacy);
        } catch (error) {
          skippedErrors += 1;
          console.error('[panel_exam_reminder_broadcast_decrypt_failed]', error);
          continue;
        }
        if (!parentPhoneE164) {
          skippedNoPhone += 1;
          continue;
        }

        const effectiveExamOpenAt = normalizeDateTimeLike(gate.exam_open_at) || normalizeDateTimeLike(row.scheduled_exam_at);
        if (!effectiveExamOpenAt) {
          skippedNoExamOpenAt += 1;
          continue;
        }

        if (!force) {
          const rowReminderWindow = resolveReminderWindow({
            examOpenAt: effectiveExamOpenAt,
            leadMinutes: reminderLeadMinutes,
            windowMinutes: reminderWindowMinutes,
          });
          if (!rowReminderWindow.in_window) {
            skippedOutsideWindow += 1;
            continue;
          }
        }

        enqueueable += 1;
        if (previewOnly) {
          continue;
        }

        try {
          const created = await enqueueExamReminderSmsIfNeeded({
            campaignCode: row.campaign_code,
            candidateId: row.candidate_id,
            attemptId: row.attempt_id,
            parentPhoneE164,
            applicationNo: row.application_no,
            candidateCode: row.candidate_code,
            examOpenAt: effectiveExamOpenAt,
            reminderLeadMinutes,
            trigger: 'panel_exam_reminder_broadcast',
          });
          if (created?.jobId) {
            enqueued += 1;
            enqueuedJobIds.push(created.jobId);
          }
        } catch (error) {
          skippedErrors += 1;
          console.error('[panel_exam_reminder_broadcast_enqueue_failed]', error);
        }
      }

      ok(res, {
        action,
        preview: previewOnly,
        campaign_code: campaignCode,
        force,
        reminder_lead_minutes: reminderLeadMinutes,
        reminder_window_minutes: reminderWindowMinutes,
        gate,
        reminder_window: gateReminderWindow,
        scanned: rows.length,
        enqueueable,
        enqueued,
        skipped_no_phone: skippedNoPhone,
        skipped_no_exam_open_at: skippedNoExamOpenAt,
        skipped_outside_window: skippedOutsideWindow,
        skipped_errors: skippedErrors,
        skipped_reason: (previewOnly ? enqueueable : enqueued) > 0
          ? null
          : (skippedNoExamOpenAt > 0
            ? 'missing_exam_open_at'
            : (skippedOutsideWindow > 0 ? 'outside_window' : null)),
        job_ids: enqueuedJobIds,
      });

      if (previewOnly) {
        return;
      }

      const ctx = readRequestContext(req);
      await appendAuditLog({
        ...buildPanelActor(identity),
        action: 'PANEL_EXAM_REMINDER_BROADCAST_RUN',
        targetType: 'EXAM_REMINDER',
        targetId: campaignCode,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: {
          campaignCode,
          force,
          limit,
          reminderLeadMinutes,
          reminderWindowMinutes,
          scanned: rows.length,
          enqueued,
          skippedNoPhone,
          skippedNoExamOpenAt,
          skippedOutsideWindow,
          skippedErrors,
          skippedReason: enqueued > 0
            ? null
            : (skippedNoExamOpenAt > 0
              ? 'missing_exam_open_at'
              : (skippedOutsideWindow > 0 ? 'outside_window' : null)),
          enqueuedJobIds,
        },
      });
      return;
    }

    const jobIds = normalizeIds(body.job_ids || body.jobIds);
    if (jobIds.length === 0) {
      throw new HttpError(400, 'jobIds is required.', 'missing_job_ids');
    }
    if (!['retry', 'cancel', 'requeue_dlq'].includes(action)) {
      throw new HttpError(400, 'Unsupported action.', 'invalid_action');
    }

    const updated = await withTransaction(async (client) => {
      if (action === 'cancel') {
        const { rowCount } = await client.query(
          `
            UPDATE notification_jobs
            SET
              status = 'CANCELLED',
              next_retry_at = NULL,
              updated_at = NOW()
            WHERE id = ANY($1::uuid[])
          `,
          [jobIds],
        );
        return rowCount;
      }

      if (action === 'retry') {
        const { rowCount } = await client.query(
          `
            UPDATE notification_jobs
            SET
              status = 'QUEUED',
              next_retry_at = NOW(),
              updated_at = NOW()
            WHERE id = ANY($1::uuid[])
          `,
          [jobIds],
        );
        return rowCount;
      }

      const { rowCount } = await client.query(
        `
          UPDATE notification_jobs
          SET
            status = 'QUEUED',
            next_retry_at = NOW(),
            updated_at = NOW()
          WHERE id = ANY($1::uuid[])
            AND status = 'DLQ'
        `,
        [jobIds],
      );

      await client.query(
        `
          UPDATE dlq_jobs
          SET
            status = 'REQUEUED',
            updated_at = NOW()
          WHERE source_job_id = ANY($1::uuid[])
            AND status <> 'CLOSED'
        `,
        [jobIds],
      );

      return rowCount;
    });

    ok(res, {
      action,
      requested: jobIds.length,
      updated,
    });

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: `PANEL_NOTIFICATIONS_${action.toUpperCase()}`,
      targetType: 'NOTIFICATION_JOB_BATCH',
      targetId: String(jobIds.length),
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        jobIds,
        updated,
      },
    });
  });
}
