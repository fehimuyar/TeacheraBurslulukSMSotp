import { withTransaction } from '../../../_lib/db.js';
import { buildSpeakingUploadInitResponse } from '../../../_lib/burslulukExam.js';
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
    const mimeType = safeTrim(body.mimeType).slice(0, 180);
    const byteSize = clampInt(body.byteSize, 1, 50 * 1024 * 1024, 0);

    if (!attemptId) throw new HttpError(400, 'attemptId is required.', 'missing_attempt_id');
    if (!questionId) throw new HttpError(400, 'questionId is required.', 'missing_question_id');
    if (!mimeType) throw new HttpError(400, 'mimeType is required.', 'missing_mime_type');
    if (!byteSize) throw new HttpError(400, 'byteSize is required.', 'missing_byte_size');

    await requireExamSession(req, attemptId);
    await enforceRateLimit(req, res, {
      scope: 'exam_speaking_init_ip',
      identity: getRequestIp(req),
      limitEnv: 'RL_EXAM_SPEAKING_INIT_IP_LIMIT',
      windowSecondsEnv: 'RL_EXAM_SPEAKING_INIT_IP_WINDOW_SECONDS',
      defaultLimit: 120,
      defaultWindowSeconds: 60,
      requireRedis: true,
      errorCode: 'exam_speaking_init_rate_limited',
      errorMessage: 'Too many speaking upload requests. Please retry shortly.',
    });

    const result = await withTransaction(async (client) => {
      const attemptLookup = await client.query(
        `
          SELECT id, campaign_code, status
          FROM exam_attempts
          WHERE id = $1
          LIMIT 1
        `,
        [attemptId],
      );

      if (attemptLookup.rowCount === 0) {
        throw new HttpError(404, 'Exam attempt was not found.', 'attempt_not_found');
      }

      const attempt = attemptLookup.rows[0];
      if (!['STARTED', 'OPEN', 'WAITING'].includes(attempt.status)) {
        throw new HttpError(409, 'Attempt no longer accepts speaking uploads.', 'attempt_not_open', {
          status: attempt.status,
        });
      }

      const initResponse = buildSpeakingUploadInitResponse({
        campaignCode: attempt.campaign_code,
        attemptId,
        questionId,
        mimeType,
      });

      await client.query(
        `
          INSERT INTO speaking_responses (
            response_id,
            attempt_id,
            question_id,
            storage_key,
            mime_type,
            byte_size,
            upload_status,
            created_at,
            updated_at
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 'INITIATED', NOW(), NOW())
          ON CONFLICT (response_id)
          DO UPDATE
          SET
            storage_key = EXCLUDED.storage_key,
            mime_type = EXCLUDED.mime_type,
            byte_size = EXCLUDED.byte_size,
            upload_status = 'INITIATED',
            updated_at = NOW()
        `,
        [
          initResponse.responseId,
          attemptId,
          questionId,
          initResponse.storageKey,
          mimeType,
          byteSize,
        ],
      );

      return initResponse;
    });

    ok(res, {
      responseId: result.responseId,
      uploadUrl: result.uploadUrl,
      uploadMethod: result.uploadMethod,
      uploadHeaders: result.uploadHeaders,
      expiresAt: result.expiresAt,
    });
  });
}
