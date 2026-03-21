// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { query } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { resolveExamGateStatus } from '../../_lib/examGate.js';
import { resolveExamRuntimeWindow } from '../../_lib/examRuntime.js';
import { enqueueExamOpenSmsIfNeeded } from '../../_lib/examOpenSms.js';
import { handleRequest, methodGuard, ok, safeTrim } from '../../_lib/http.js';
import { decryptPii } from '../../_lib/piiCrypto.js';
import { requireExamSession } from '../../_lib/sessionAuth.js';

function resolveCandidateGateStatus(gate, scheduledExamAtRaw) {
  const scheduledAt = scheduledExamAtRaw instanceof Date
    ? scheduledExamAtRaw.toISOString()
    : safeTrim(scheduledExamAtRaw);
  if (!scheduledAt) return gate;
  const scheduledMs = Number(new Date(scheduledAt));
  if (!Number.isFinite(scheduledMs)) return gate;

  const serverNowMs = Number(new Date(gate?.server_time_utc || new Date().toISOString()));
  const globalOpenAtMs = gate?.exam_open_at ? Number(new Date(gate.exam_open_at)) : NaN;
  const effectiveOpenAtMs = Number.isFinite(globalOpenAtMs) ? Math.max(globalOpenAtMs, scheduledMs) : scheduledMs;
  const candidateExamOpen = serverNowMs >= scheduledMs;
  const examOpen = gate?.exam_force_open === true ? true : serverNowMs >= effectiveOpenAtMs;

  return {
    ...gate,
    exam_open: examOpen,
    exam_open_at: new Date(effectiveOpenAtMs).toISOString(),
    remaining_seconds: examOpen ? 0 : Math.max(0, Math.ceil((effectiveOpenAtMs - serverNowMs) / 1000)),
    candidate_exam_open: candidateExamOpen,
    candidate_exam_open_at: new Date(scheduledMs).toISOString(),
    candidate_remaining_seconds: candidateExamOpen ? 0 : Math.max(0, Math.ceil((scheduledMs - serverNowMs) / 1000)),
  };
}

/**
 * Contract v1 request:
 * GET /api/exam/session/status?attemptId=<uuid>
 * headers: x-exam-session-token: <token>
 *
 * Contract v1 response:
 * {
 *   "ok": true,
 *   "session": {
 *     "attemptId": "...",
 *     "applicationNo": "...",
 *     "candidateId": "...",
 *     "campaignCode": "...",
 *     "examStatus": "...",
 *     "expiresAt": "..."
 *   },
 *   "gate": {
 *     "exam_open": false,
 *     "exam_open_at": "...",
 *     "server_time_utc": "...",
 *     "remaining_seconds": 321
 *   }
 * }
 */
export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    const attemptId = safeTrim(
      Array.isArray(req.query?.attemptId) ? req.query.attemptId[0] : req.query?.attemptId,
    );
    if (!attemptId) {
      throw new HttpError(400, 'attemptId is required.', 'missing_attempt_id');
    }

    const session = await requireExamSession(req, attemptId);
    const state = await query(
      `
        SELECT
          ea.id AS attempt_id,
          ea.status AS exam_status,
          ea.started_at,
          ea.scheduled_exam_at,
          ea.exam_slot_label,
          ea.campaign_code,
          ea.candidate_id,
          a.application_no,
          g.phone_e164 AS parent_phone_e164_legacy,
          g.phone_e164_enc AS parent_phone_e164_enc
        FROM exam_attempts ea
        JOIN applications a ON a.id = ea.application_id
        JOIN candidates c ON c.id = ea.candidate_id
        LEFT JOIN guardians g ON g.id = c.guardian_id
        WHERE ea.id = $1
        LIMIT 1
      `,
      [attemptId],
    );

    if (state.rowCount === 0) {
      throw new HttpError(404, 'Exam attempt was not found.', 'attempt_not_found');
    }

    const row = state.rows[0];
    const baseGate = await resolveExamGateStatus(row.campaign_code);
    const gate = resolveCandidateGateStatus(baseGate, row.scheduled_exam_at);
    const runtime = resolveExamRuntimeWindow(row.started_at);
    const parentPhoneE164 = await decryptPii(row.parent_phone_e164_enc, row.parent_phone_e164_legacy);

    let examStatus = row.exam_status;
    if (runtime.timed_out && ['STARTED', 'OPEN'].includes(examStatus)) {
      const timeoutUpdate = await query(
        `
          UPDATE exam_attempts
          SET
            status = 'TIMEOUT',
            submitted_at = COALESCE(submitted_at, NOW()),
            completion_status = COALESCE(completion_status, 'time_limit_reached'),
            duration_seconds = COALESCE(duration_seconds, $2),
            updated_at = NOW()
          WHERE id = $1
            AND status IN ('STARTED', 'OPEN')
          RETURNING status
        `,
        [attemptId, runtime.duration_seconds],
      );
      if (timeoutUpdate.rowCount > 0) {
        examStatus = timeoutUpdate.rows[0].status;
      }
    }

    if (gate.exam_open) {
      try {
        await enqueueExamOpenSmsIfNeeded({
          campaignCode: row.campaign_code,
          candidateId: row.candidate_id,
          attemptId: row.attempt_id,
          parentPhoneE164,
          applicationNo: row.application_no,
          trigger: 'session_status_exam_open',
        });
      } catch (error) {
        console.error('[session_status_exam_open_sms_enqueue_failed]', error);
      }
    }

    ok(res, {
      session: {
        attemptId: row.attempt_id,
        applicationNo: row.application_no,
        candidateId: row.candidate_id,
        campaignCode: row.campaign_code,
        examStatus,
        startedAt: row.started_at || null,
        scheduledExamAt: row.scheduled_exam_at || null,
        examSlotLabel: row.exam_slot_label || null,
        expiresAt: session.expires_at,
      },
      gate,
      runtime,
    });
  });
}
