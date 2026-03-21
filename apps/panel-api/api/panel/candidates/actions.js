import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { query, withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { enqueueNotification } from '../../_lib/notifications.js';
import { decryptPii } from '../../_lib/piiCrypto.js';

function normalizeCandidateIds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => safeTrim(item)).filter(Boolean).slice(0, 1000);
}

function readOptionalTimestamp(rawValue, fieldName) {
  const value = safeTrim(rawValue);
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new HttpError(400, `${fieldName} must be a valid datetime.`, 'invalid_datetime');
  }
  return date.toISOString();
}

async function getCandidatesByIds(candidateIds) {
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
    `,
    [candidateIds],
  );
  return rows;
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS],
      ['PANEL_CANDIDATES_ACTION'],
    );
    methodGuard(req, ['POST']);

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const action = safeTrim(body.action).toLowerCase();
    const candidateIds = normalizeCandidateIds(body.candidate_ids || body.candidateIds);
    if (candidateIds.length === 0) {
      throw new HttpError(400, 'candidateIds is required.', 'missing_candidate_ids');
    }

    if (!['sms_retry', 'wa_send', 'add_note', 'appointment_booked', 'appointment_attended', 'appointment_no_show'].includes(action)) {
      throw new HttpError(400, 'Unsupported action.', 'invalid_action');
    }

    const candidateRows = await getCandidatesByIds(candidateIds);
    const candidates = await Promise.all(
      candidateRows.map(async (row) => ({
        ...row,
        parent_phone_e164: await decryptPii(row.parent_phone_e164_enc, row.parent_phone_e164_legacy),
      })),
    );
    if (candidates.length === 0) {
      throw new HttpError(404, 'No matching candidates found.', 'candidates_not_found');
    }

    if (action === 'add_note' || action === 'appointment_booked' || action === 'appointment_attended' || action === 'appointment_no_show') {
      const note = safeTrim(body.note).slice(0, 2000);
      const appointmentAt = readOptionalTimestamp(body.appointment_at ?? body.appointmentAt, 'appointment_at');
      const eventType = action === 'add_note'
        ? 'OPERATOR_NOTE'
        : action === 'appointment_booked'
          ? 'APPOINTMENT_BOOKED'
          : action === 'appointment_attended'
            ? 'APPOINTMENT_ATTENDED'
            : 'APPOINTMENT_NO_SHOW';
      const auditAction = action === 'add_note'
        ? 'PANEL_CANDIDATE_NOTE_ADD'
        : action === 'appointment_booked'
          ? 'PANEL_CANDIDATE_APPOINTMENT_BOOKED'
          : action === 'appointment_attended'
            ? 'PANEL_CANDIDATE_APPOINTMENT_ATTENDED'
            : 'PANEL_CANDIDATE_APPOINTMENT_NO_SHOW';

      if (action === 'add_note' && !note) {
        throw new HttpError(400, 'note is required for add_note action.', 'missing_note');
      }

      await withTransaction(async (client) => {
        const createdAt = new Date().toISOString();
        for (const candidate of candidates) {
          const payload =
            action === 'add_note'
              ? {
                  note,
                  createdAt,
                }
              : {
                  action,
                  note: note || null,
                  appointment_at: action === 'appointment_booked' ? appointmentAt || createdAt : appointmentAt || null,
                  createdAt,
                };
          await client.query(
            `
              INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
              VALUES ($1, $2, $3, $4::jsonb)
            `,
            [
              candidate.candidate_id,
              candidate.attempt_id,
              eventType,
              JSON.stringify(payload),
            ],
          );
        }
      });

      ok(res, {
        action,
        processed: candidates.length,
      });

      const ctx = readRequestContext(req);
      await appendAuditLog({
        ...buildPanelActor(identity),
        action: auditAction,
        targetType: 'CANDIDATE_BATCH',
        targetId: String(candidates.length),
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: {
          candidateIds: candidates.map((item) => item.candidate_id),
          noteLength: note.length,
          appointmentAt,
          eventType,
        },
      });
      return;
    }

    const jobs = [];
    for (const candidate of candidates) {
      if (!candidate.parent_phone_e164) continue;
      jobs.push(
        enqueueNotification({
          campaignCode: candidate.campaign_code,
          candidateId: candidate.candidate_id,
          attemptId: candidate.attempt_id,
          resultId: candidate.result_id,
          channel: action === 'sms_retry' ? 'SMS' : 'WHATSAPP',
          templateCode: action === 'sms_retry' ? 'CREDENTIALS_SMS' : 'WA_RESULT',
          recipient: candidate.parent_phone_e164,
          payload: {
            trigger: 'manual_panel_action',
            action,
          },
        }),
      );
    }

    const enqueued = await Promise.all(jobs);

    ok(res, {
      action,
      requested: candidateIds.length,
      enqueued: enqueued.length,
      skipped: candidateIds.length - enqueued.length,
      job_ids: enqueued.map((item) => item.jobId),
    });

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: action === 'sms_retry' ? 'PANEL_CANDIDATE_SMS_RETRY' : 'PANEL_CANDIDATE_WA_SEND',
      targetType: 'CANDIDATE_BATCH',
      targetId: String(candidateIds.length),
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        candidateIds,
        enqueuedJobIds: enqueued.map((item) => item.jobId),
      },
    });
  });
}
