import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { query } from '../../_lib/db.js';
import { readDefaultCampaignCode } from '../../_lib/env.js';
import { HttpError } from '../../_lib/errors.js';
import { clampInt, handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { enqueueNotification } from '../../_lib/notifications.js';
import { decryptPii } from '../../_lib/piiCrypto.js';

const FOLLOW_UP_MODES = ['all', 'result_unseen', 'viewed_no_appointment', 'appointment_no_show'];
const ACTIVE_JOB_STATUS = ['QUEUED', 'RETRYING', 'SENT', 'DELIVERED', 'READ'];

function normalizeCandidateIds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => safeTrim(item)).filter(Boolean).slice(0, 1000);
}

function normalizeFollowUpMode(value) {
  const mode = safeTrim(value).toLowerCase();
  return FOLLOW_UP_MODES.includes(mode) ? mode : '';
}

async function appendBotFollowupEvent({ candidateId, attemptId, mode, trigger, jobId }) {
  await query(
    `
      INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
      VALUES ($1, $2, 'BOT_FOLLOWUP_ENQUEUED', $3::jsonb)
    `,
    [
      candidateId,
      attemptId,
      JSON.stringify({
        mode,
        trigger,
        source: 'panel_manual_scan',
        job_id: jobId,
        createdAt: new Date().toISOString(),
      }),
    ],
  );
}

async function enqueueRows({ rows, trigger, mode, previewOnly = false }) {
  let enqueued = 0;
  let skippedNoPhone = 0;
  const jobIds = [];

  for (const row of rows) {
    const parentPhoneE164 = await decryptPii(row.parent_phone_e164_enc, row.parent_phone_e164_legacy);
    if (!parentPhoneE164) {
      skippedNoPhone += 1;
      continue;
    }
    if (previewOnly) {
      enqueued += 1;
      continue;
    }

    const created = await enqueueNotification({
      campaignCode: row.campaign_code,
      candidateId: row.candidate_id,
      attemptId: row.attempt_id,
      resultId: row.result_id,
      channel: 'WHATSAPP',
      templateCode: 'WA_RESULT',
      recipient: parentPhoneE164,
      payload: {
        trigger,
        mode,
        source: 'panel_manual_scan',
        score: Number(row.score || 0),
        percentage: Number(row.percentage || 0),
        placementLabel: row.placement_label || null,
      },
    });

    if (created?.jobId) {
      enqueued += 1;
      jobIds.push(created.jobId);
      await appendBotFollowupEvent({
        candidateId: row.candidate_id,
        attemptId: row.attempt_id,
        mode,
        trigger,
        jobId: created.jobId,
      });
    }
  }

  return {
    scanned: rows.length,
    enqueued,
    skipped_no_phone: skippedNoPhone,
    job_ids: jobIds,
  };
}

async function readViewedNoAppointmentRows({ campaignCode, delayMinutes, limit }) {
  const { rows } = await query(
    `
      SELECT
        c.id AS candidate_id,
        r.attempt_id,
        c.campaign_code,
        r.id AS result_id,
        r.score,
        r.percentage,
        r.placement_label,
        g.phone_e164 AS parent_phone_e164_legacy,
        g.phone_e164_enc AS parent_phone_e164_enc
      FROM candidates c
      LEFT JOIN guardians g ON g.id = c.guardian_id
      LEFT JOIN LATERAL (
        SELECT
          r.id,
          r.attempt_id,
          r.score,
          r.percentage,
          r.placement_label,
          r.viewed_at
        FROM results r
        WHERE r.candidate_id = c.id
        ORDER BY COALESCE(r.viewed_at, r.published_at, r.updated_at, r.created_at) DESC
        LIMIT 1
      ) r ON TRUE
      WHERE c.campaign_code = $1
        AND r.id IS NOT NULL
        AND r.viewed_at IS NOT NULL
        AND r.viewed_at <= NOW() - make_interval(mins => $2::int)
        AND NOT EXISTS (
          SELECT 1
          FROM activity_events ev
          WHERE ev.candidate_id = c.id
            AND ev.event_type = 'APPOINTMENT_BOOKED'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM notification_jobs nj
          WHERE nj.candidate_id = c.id
            AND nj.channel = 'WHATSAPP'
            AND nj.template_code = 'WA_RESULT'
            AND nj.status = ANY($4::notification_status[])
            AND COALESCE(nj.payload ->> 'trigger', '') = 'ops_viewed_no_appointment_auto_whatsapp'
        )
      ORDER BY r.viewed_at ASC
      LIMIT $3
    `,
    [campaignCode, delayMinutes, limit, ACTIVE_JOB_STATUS],
  );
  return rows;
}

async function readResultUnseenRows({ campaignCode, delayMinutes, limit }) {
  const { rows } = await query(
    `
      SELECT
        c.id AS candidate_id,
        ea.id AS attempt_id,
        ea.campaign_code,
        r.id AS result_id,
        r.score,
        r.percentage,
        r.placement_label,
        g.phone_e164 AS parent_phone_e164_legacy,
        g.phone_e164_enc AS parent_phone_e164_enc
      FROM results r
      JOIN exam_attempts ea ON ea.id = r.attempt_id
      JOIN candidates c ON c.id = ea.candidate_id
      LEFT JOIN guardians g ON g.id = c.guardian_id
      WHERE ea.campaign_code = $1
        AND r.published_at IS NOT NULL
        AND r.viewed_at IS NULL
        AND r.published_at <= NOW() - make_interval(mins => $2::int)
        AND NOT EXISTS (
          SELECT 1
          FROM notification_jobs nj
          WHERE nj.result_id = r.id
            AND nj.channel = 'WHATSAPP'
            AND nj.template_code = 'WA_RESULT'
            AND nj.status = ANY($4::notification_status[])
            AND COALESCE(nj.payload ->> 'trigger', '') = 'ops_unviewed_results_auto_whatsapp'
        )
      ORDER BY r.published_at ASC
      LIMIT $3
    `,
    [campaignCode, delayMinutes, limit, ACTIVE_JOB_STATUS],
  );
  return rows;
}

async function readAppointmentNoShowRows({ campaignCode, delayMinutes, limit }) {
  const { rows } = await query(
    `
      WITH latest_appointment AS (
        SELECT
          ev.candidate_id,
          ev.event_type,
          ev.occurred_at,
          ROW_NUMBER() OVER (PARTITION BY ev.candidate_id ORDER BY ev.occurred_at DESC) AS rn
        FROM activity_events ev
        JOIN candidates c ON c.id = ev.candidate_id
        WHERE c.campaign_code = $1
          AND ev.event_type IN ('APPOINTMENT_BOOKED', 'APPOINTMENT_ATTENDED', 'APPOINTMENT_NO_SHOW')
      )
      SELECT
        c.id AS candidate_id,
        r.attempt_id,
        c.campaign_code,
        r.id AS result_id,
        r.score,
        r.percentage,
        r.placement_label,
        g.phone_e164 AS parent_phone_e164_legacy,
        g.phone_e164_enc AS parent_phone_e164_enc
      FROM latest_appointment la
      JOIN candidates c ON c.id = la.candidate_id
      LEFT JOIN guardians g ON g.id = c.guardian_id
      LEFT JOIN LATERAL (
        SELECT
          r.id,
          r.attempt_id,
          r.score,
          r.percentage,
          r.placement_label
        FROM results r
        WHERE r.candidate_id = c.id
        ORDER BY COALESCE(r.published_at, r.updated_at, r.created_at) DESC
        LIMIT 1
      ) r ON TRUE
      WHERE la.rn = 1
        AND la.event_type = 'APPOINTMENT_NO_SHOW'
        AND la.occurred_at <= NOW() - make_interval(mins => $2::int)
        AND NOT EXISTS (
          SELECT 1
          FROM notification_jobs nj
          WHERE nj.candidate_id = c.id
            AND nj.channel = 'WHATSAPP'
            AND nj.template_code = 'WA_RESULT'
            AND nj.status = ANY($4::notification_status[])
            AND COALESCE(nj.payload ->> 'trigger', '') = 'ops_appointment_no_show_auto_whatsapp'
        )
      ORDER BY la.occurred_at ASC
      LIMIT $3
    `,
    [campaignCode, delayMinutes, limit, ACTIVE_JOB_STATUS],
  );
  return rows;
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);
    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS],
      ['PANEL_UNVIEWED_ACTION'],
    );

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const action = safeTrim(body.action).toLowerCase();
    const previewOnly = Boolean(body.preview ?? body.dry_run ?? body.dryRun);
    if (!['send_whatsapp', 'run_followup_auto_whatsapp'].includes(action)) {
      throw new HttpError(400, 'Unsupported action.', 'invalid_action');
    }

    if (action === 'send_whatsapp') {
      const candidateIds = normalizeCandidateIds(body.candidate_ids || body.candidateIds);
      if (candidateIds.length === 0) {
        throw new HttpError(400, 'candidateIds is required.', 'missing_candidate_ids');
      }

      const templateCode = safeTrim(body.template_code || body.templateCode || 'WA_RESULT');
      const { rows } = await query(
        `
          SELECT
            c.id AS candidate_id,
            c.campaign_code,
            g.phone_e164 AS parent_phone_e164_legacy,
            g.phone_e164_enc AS parent_phone_e164_enc,
            ea.id AS attempt_id,
            r.id AS result_id
          FROM candidates c
          LEFT JOIN guardians g ON g.id = c.guardian_id
          LEFT JOIN LATERAL (
            SELECT id
            FROM exam_attempts
            WHERE candidate_id = c.id
            ORDER BY created_at DESC
            LIMIT 1
          ) ea ON TRUE
          LEFT JOIN results r ON r.attempt_id = ea.id
          WHERE c.id = ANY($1::uuid[])
            AND r.published_at IS NOT NULL
            AND r.viewed_at IS NULL
        `,
        [candidateIds],
      );
      const rowsWithPhone = await Promise.all(
        rows.map(async (row) => ({
          ...row,
          parent_phone_e164: await decryptPii(row.parent_phone_e164_enc, row.parent_phone_e164_legacy),
        })),
      );

      const deliverableRows = rowsWithPhone.filter((row) => row.parent_phone_e164);

      if (previewOnly) {
        ok(res, {
          action,
          preview: true,
          requested: candidateIds.length,
          matched: rows.length,
          enqueueable: deliverableRows.length,
          skipped: candidateIds.length - deliverableRows.length,
          skipped_no_phone: rows.length - deliverableRows.length,
        });
        return;
      }

      const jobs = deliverableRows.map((row) =>
        enqueueNotification({
          campaignCode: row.campaign_code,
          candidateId: row.candidate_id,
          attemptId: row.attempt_id,
          resultId: row.result_id,
          channel: 'WHATSAPP',
          templateCode,
          recipient: row.parent_phone_e164,
          payload: {
            trigger: 'panel_unviewed_results',
            templateCode,
          },
        }),
      );

      const created = await Promise.all(jobs);
      const ctx = readRequestContext(req);
      const auditEntry = await appendAuditLog({
        ...buildPanelActor(identity),
        action: 'PANEL_UNVIEWED_RESULTS_WA_SEND',
        targetType: 'CANDIDATE_BATCH',
        targetId: String(candidateIds.length),
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: {
          candidateIds,
          deliverableCandidateIds: deliverableRows.map((row) => row.candidate_id),
          templateCode,
          enqueuedJobIds: created.map((item) => item.jobId),
        },
      });

      ok(res, {
        action,
        requested: candidateIds.length,
        matched: rows.length,
        enqueued: created.length,
        skipped: candidateIds.length - created.length,
        skipped_no_phone: rows.length - deliverableRows.length,
        job_ids: created.map((item) => item.jobId),
        audit_log_id: auditEntry?.id || null,
        audit_log_seq: auditEntry?.seq || null,
      });
      return;
    }

    const campaignCode = safeTrim(
      body.campaign_code
      || body.campaignCode
      || readDefaultCampaignCode(),
    ).slice(0, 120);
    const mode = normalizeFollowUpMode(body.mode || 'all');
    if (!campaignCode) {
      throw new HttpError(400, 'campaignCode is required.', 'missing_campaign_code');
    }
    if (!mode) {
      throw new HttpError(400, 'mode must be one of all/result_unseen/viewed_no_appointment/appointment_no_show.', 'invalid_mode');
    }

    const limit = clampInt(body.limit ?? 250, 1, 2000, 250);
    const resultUnseenDelayMinutes = clampInt(
      body.result_unseen_delay_minutes
      ?? body.resultUnseenDelayMinutes
      ?? process.env.FOLLOWUP_RESULT_UNSEEN_DELAY_MINUTES
      ?? process.env.UNVIEWED_RESULTS_WA_DELAY_MINUTES
      ?? 30,
      0,
      24 * 60,
      30,
    );
    const viewedNoAppointmentDelayMinutes = clampInt(
      body.viewed_no_appointment_delay_minutes ?? body.viewedNoAppointmentDelayMinutes ?? process.env.FOLLOWUP_VIEWED_NO_APPOINTMENT_DELAY_MINUTES ?? 180,
      0,
      24 * 60,
      180,
    );
    const appointmentNoShowDelayMinutes = clampInt(
      body.appointment_no_show_delay_minutes ?? body.appointmentNoShowDelayMinutes ?? process.env.FOLLOWUP_APPOINTMENT_NO_SHOW_DELAY_MINUTES ?? 30,
      0,
      24 * 60,
      30,
    );

    let resultUnseen = { scanned: 0, enqueued: 0, skipped_no_phone: 0, job_ids: [] };
    let viewedNoAppointment = { scanned: 0, enqueued: 0, skipped_no_phone: 0, job_ids: [] };
    let appointmentNoShow = { scanned: 0, enqueued: 0, skipped_no_phone: 0, job_ids: [] };

    if (mode === 'all' || mode === 'result_unseen') {
      const rows = await readResultUnseenRows({
        campaignCode,
        delayMinutes: resultUnseenDelayMinutes,
        limit,
      });
      resultUnseen = await enqueueRows({
        rows,
        trigger: 'ops_unviewed_results_auto_whatsapp',
        mode: 'result_unseen',
        previewOnly,
      });
    }

    if (mode === 'all' || mode === 'viewed_no_appointment') {
      const rows = await readViewedNoAppointmentRows({
        campaignCode,
        delayMinutes: viewedNoAppointmentDelayMinutes,
        limit,
      });
      viewedNoAppointment = await enqueueRows({
        rows,
        trigger: 'ops_viewed_no_appointment_auto_whatsapp',
        mode: 'viewed_no_appointment',
        previewOnly,
      });
    }

    if (mode === 'all' || mode === 'appointment_no_show') {
      const rows = await readAppointmentNoShowRows({
        campaignCode,
        delayMinutes: appointmentNoShowDelayMinutes,
        limit,
      });
      appointmentNoShow = await enqueueRows({
        rows,
        trigger: 'ops_appointment_no_show_auto_whatsapp',
        mode: 'appointment_no_show',
        previewOnly,
      });
    }
    const responsePayload = {
      action,
      campaign_code: campaignCode,
      mode,
      result_unseen_delay_minutes: resultUnseenDelayMinutes,
      viewed_no_appointment_delay_minutes: viewedNoAppointmentDelayMinutes,
      appointment_no_show_delay_minutes: appointmentNoShowDelayMinutes,
      result_unseen: resultUnseen,
      viewed_no_appointment: viewedNoAppointment,
      appointment_no_show: appointmentNoShow,
      totals: {
        scanned: resultUnseen.scanned + viewedNoAppointment.scanned + appointmentNoShow.scanned,
        enqueued: resultUnseen.enqueued + viewedNoAppointment.enqueued + appointmentNoShow.enqueued,
        skipped_no_phone: resultUnseen.skipped_no_phone + viewedNoAppointment.skipped_no_phone + appointmentNoShow.skipped_no_phone,
      },
    };

    if (previewOnly) {
      ok(res, {
        ...responsePayload,
        preview: true,
      });
      return;
    }

    const ctx = readRequestContext(req);
    const auditEntry = await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_BOT_FOLLOWUP_SCAN',
      targetType: 'BOT_FOLLOWUP',
      targetId: campaignCode + ':' + mode,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        campaignCode,
        mode,
        limit,
        resultUnseenDelayMinutes,
        viewedNoAppointmentDelayMinutes,
        appointmentNoShowDelayMinutes,
        resultUnseen,
        viewedNoAppointment,
        appointmentNoShow,
      },
    });

    ok(res, {
      ...responsePayload,
      audit_log_id: auditEntry?.id || null,
      audit_log_seq: auditEntry?.seq || null,
    });
  });
}
