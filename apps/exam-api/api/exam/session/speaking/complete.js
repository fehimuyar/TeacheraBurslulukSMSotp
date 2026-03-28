import { query } from '../../../_lib/db.js';
import { HttpError } from '../../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../../_lib/http.js';
import { enforceRateLimit, getRequestIp } from '../../../_lib/redisRateLimit.js';
import { requireExamSession } from '../../../_lib/sessionAuth.js';

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);
    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const attemptId = safeTrim(body.attemptId);
    const questionId = safeTrim(body.questionId).slice(0, 120);
    const responseId = safeTrim(body.responseId);
    const mimeType = safeTrim(body.mimeType).slice(0, 180);
    const byteSize = clampInt(body.byteSize, 1, 50 * 1024 * 1024, 0);
    const durationSeconds = clampInt(body.durationSeconds, 1, 15 * 60, 0);

    if (!attemptId) throw new HttpError(400, 'attemptId is required.', 'missing_attempt_id');
    if (!questionId) throw new HttpError(400, 'questionId is required.', 'missing_question_id');
    if (!responseId) throw new HttpError(400, 'responseId is required.', 'missing_response_id');
    if (!mimeType) throw new HttpError(400, 'mimeType is required.', 'missing_mime_type');
    if (!byteSize) throw new HttpError(400, 'byteSize is required.', 'missing_byte_size');
    if (!durationSeconds) throw new HttpError(400, 'durationSeconds is required.', 'missing_duration_seconds');

    await requireExamSession(req, attemptId);
    await enforceRateLimit(req, res, {
      scope: 'exam_speaking_complete_ip',
      identity: getRequestIp(req),
      limitEnv: 'RL_EXAM_SPEAKING_COMPLETE_IP_LIMIT',
      windowSecondsEnv: 'RL_EXAM_SPEAKING_COMPLETE_IP_WINDOW_SECONDS',
      defaultLimit: 120,
      defaultWindowSeconds: 60,
      requireRedis: true,
      errorCode: 'exam_speaking_complete_rate_limited',
      errorMessage: 'Too many speaking completion requests. Please retry shortly.',
    });

    const updateResult = await query(
      `
        UPDATE speaking_responses
        SET
          mime_type = $4,
          byte_size = $5,
          duration_seconds = $6,
          upload_status = 'UPLOADED',
          updated_at = NOW()
        WHERE response_id = $1::uuid
          AND attempt_id = $2::uuid
          AND question_id = $3
        RETURNING response_id::text AS response_id, storage_key
      `,
      [responseId, attemptId, questionId, mimeType, byteSize, durationSeconds],
    );

    if (updateResult.rowCount === 0) {
      throw new HttpError(404, 'Speaking upload session was not found.', 'speaking_response_not_found');
    }

    ok(res, {
      responseId: updateResult.rows[0].response_id,
      storageKey: updateResult.rows[0].storage_key,
      status: 'uploaded',
    });
  });
}
