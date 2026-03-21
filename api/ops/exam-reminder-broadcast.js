// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { readDefaultCampaignCode } from '../_lib/env.js';
import { HttpError } from '../_lib/errors.js';
import { resolveExamGateStatus } from '../_lib/examGate.js';
import { enqueueExamReminderSmsIfNeeded } from '../_lib/examReminderSms.js';
import { clampInt, handleRequest, methodGuard, ok, parseBody, safeTrim } from '../_lib/http.js';
import { decryptPii } from '../_lib/piiCrypto.js';
import { query } from '../_lib/db.js';

function extractBearer(req) {
  const header = safeTrim(req.headers?.authorization);
  if (!header || !header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

function assertOpsSecret(req) {
  const expected = safeTrim(process.env.CRON_SECRET || process.env.NOTIFICATION_WORKER_SECRET);
  if (!expected) return;

  const provided = safeTrim(
    req.headers?.['x-worker-secret']
      || req.headers?.['x-ops-secret']
      || req.query?.worker_secret
      || extractBearer(req),
  );

  if (!provided || provided !== expected) {
    throw new HttpError(401, 'Ops secret is invalid.', 'invalid_ops_secret');
  }
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
    methodGuard(req, ['GET', 'POST']);
    assertOpsSecret(req);

    const body = req.method === 'POST' ? await parseBody(req) : null;
    const campaignCode = safeTrim(
      body?.campaign_code
        || body?.campaignCode
        || req.query?.campaign_code
        || readDefaultCampaignCode(),
    ).slice(0, 120);
    const limit = clampInt(body?.limit ?? req.query?.limit ?? 250, 1, 2000);
    const reminderLeadMinutes = clampInt(
      body?.reminder_lead_minutes
        ?? body?.reminderLeadMinutes
        ?? req.query?.reminder_lead_minutes
        ?? process.env.EXAM_REMINDER_LEAD_MINUTES
        ?? 30,
      1,
      24 * 60,
    );
    const reminderWindowMinutes = clampInt(
      body?.reminder_window_minutes
        ?? body?.reminderWindowMinutes
        ?? req.query?.reminder_window_minutes
        ?? process.env.EXAM_REMINDER_WINDOW_MINUTES
        ?? 2,
      1,
      60,
    );
    const force = parseBooleanLike(
      body?.force
      ?? req.query?.force
      ?? process.env.EXAM_REMINDER_FORCE_SEND,
    );

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
        console.error('[ops_exam_reminder_broadcast_decrypt_failed]', error);
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

      try {
        const job = await enqueueExamReminderSmsIfNeeded({
          campaignCode: row.campaign_code,
          candidateId: row.candidate_id,
          attemptId: row.attempt_id,
          parentPhoneE164,
          applicationNo: row.application_no,
          candidateCode: row.candidate_code,
          examOpenAt: effectiveExamOpenAt,
          reminderLeadMinutes,
          trigger: 'ops_exam_reminder_broadcast',
        });
        if (job?.jobId) {
          enqueued += 1;
          enqueuedJobIds.push(job.jobId);
        }
      } catch (error) {
        skippedErrors += 1;
        console.error('[ops_exam_reminder_broadcast_enqueue_failed]', error);
      }
    }

    ok(res, {
      campaign_code: campaignCode,
      force,
      reminder_lead_minutes: reminderLeadMinutes,
      reminder_window_minutes: reminderWindowMinutes,
      gate,
      reminder_window: gateReminderWindow,
      scanned: rows.length,
      enqueued,
      skipped_no_phone: skippedNoPhone,
      skipped_no_exam_open_at: skippedNoExamOpenAt,
      skipped_outside_window: skippedOutsideWindow,
      skipped_errors: skippedErrors,
      skipped_reason: enqueued > 0
        ? null
        : (skippedNoExamOpenAt > 0
          ? 'missing_exam_open_at'
          : (skippedOutsideWindow > 0 ? 'outside_window' : null)),
      job_ids: enqueuedJobIds,
    });
  });
}
