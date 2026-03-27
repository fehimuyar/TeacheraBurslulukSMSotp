import { randomUUID } from 'node:crypto';
import { withTransaction } from '../../../_lib/db.js';
import { HttpError } from '../../../_lib/errors.js';
import { resolveExamRuntimeWindow } from '../../../_lib/examRuntime.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../../_lib/http.js';
import { requireExamSession } from '../../../_lib/sessionAuth.js';
import {
  assertScholarshipExamVersion,
  createScholarshipSpeakingUploadToken,
  findScholarshipQuestion,
  hashScholarshipSpeakingUploadToken,
  loadScholarshipExamFullContent,
  resolveScholarshipExamContext,
  resolveScholarshipSpeakingStorageKey,
} from '../../../_lib/scholarshipExam.js';
import {
  createScholarshipSpeakingUploadTarget,
  isScholarshipObjectStorageEnabled,
} from '../../../_lib/scholarshipObjectStorage.js';

function readBoundedIntEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(safeTrim(process.env[name] || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

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
    const examVersionKey = safeTrim(body.examVersionKey);
    const questionId = safeTrim(body.questionId).slice(0, 160);
    const mimeType = safeTrim(body.mimeType).slice(0, 120);
    const maxUploadBytes = readBoundedIntEnv('EXAM_SPEAKING_UPLOAD_MAX_BYTES', 20 * 1024 * 1024, 1024, 100 * 1024 * 1024);
    const byteSize = clampInt(body.byteSize, 1, maxUploadBytes, 0);

    if (!attemptId) {
      throw new HttpError(400, 'attemptId is required.', 'missing_attempt_id');
    }
    if (!examVersionKey) {
      throw new HttpError(400, 'examVersionKey is required.', 'missing_exam_version_key');
    }
    if (!questionId) {
      throw new HttpError(400, 'questionId is required.', 'missing_question_id');
    }
    if (!mimeType) {
      throw new HttpError(400, 'mimeType is required.', 'missing_mime_type');
    }
    if (!byteSize) {
      throw new HttpError(400, 'byteSize must be a positive integer.', 'invalid_byte_size');
    }

    if (!req.headers?.['x-exam-session-token'] && body.sessionToken) {
      req.headers = {
        ...req.headers,
        'x-exam-session-token': safeTrim(body.sessionToken),
      };
    }

    await requireExamSession(req, attemptId);

    const responsePayload = await withTransaction(async (client) => {
      const attemptLookup = await client.query(
        `
          SELECT
            ea.id,
            ea.status,
            ea.started_at,
            ea.candidate_id,
            ea.campaign_code,
            ea.bank_key,
            ea.source,
            c.grade
          FROM exam_attempts ea
          JOIN candidates c ON c.id = ea.candidate_id
          WHERE ea.id = $1
          LIMIT 1
        `,
        [attemptId],
      );

      if (attemptLookup.rowCount === 0) {
        throw new HttpError(404, 'Exam attempt was not found.', 'attempt_not_found');
      }

      const attempt = attemptLookup.rows[0];
      const runtime = resolveExamRuntimeWindow(attempt.started_at);
      if (runtime.timed_out) {
        if (['STARTED', 'OPEN'].includes(attempt.status)) {
          await client.query(
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
            `,
            [attemptId, runtime.duration_seconds],
          );
        }
        throw new HttpError(409, 'Exam time limit has been reached.', 'attempt_time_limit_reached');
      }
      if (!['STARTED', 'OPEN'].includes(safeTrim(attempt.status).toUpperCase())) {
        throw new HttpError(409, 'Attempt no longer accepts speaking uploads.', 'attempt_not_open', {
          status: attempt.status,
        });
      }

      const scholarshipExam = resolveScholarshipExamContext({
        grade: attempt.grade,
        bankKey: attempt.bank_key,
        source: attempt.source,
        examVersionKey,
      });
      if (!scholarshipExam) {
        throw new HttpError(
          409,
          'This attempt is not configured for the scholarship exam speaking contract.',
          'scholarship_exam_context_missing',
        );
      }

      assertScholarshipExamVersion(examVersionKey, scholarshipExam);

      const content = loadScholarshipExamFullContent({
        bankKey: scholarshipExam.bankKey,
        examVersionKey: scholarshipExam.examVersionKey,
      });
      if (!content) {
        throw new HttpError(503, 'Scholarship exam content is not available on the server.', 'scholarship_exam_content_missing');
      }

      const question = findScholarshipQuestion(content, questionId);
      if (!question || question.type !== 'speaking') {
        throw new HttpError(400, 'questionId must point to a speaking prompt.', 'invalid_speaking_question');
      }

      const responseId = randomUUID();
      const uploadToken = createScholarshipSpeakingUploadToken();
      const uploadTtlSeconds = readBoundedIntEnv('EXAM_SPEAKING_UPLOAD_TTL_SECONDS', 15 * 60, 60, 24 * 60 * 60);
      const expiresAt = new Date(Date.now() + uploadTtlSeconds * 1000).toISOString();
      const uploadTarget = isScholarshipObjectStorageEnabled()
        ? await createScholarshipSpeakingUploadTarget({
            attemptId,
            questionId,
            responseId,
            mimeType,
            byteSize,
            expiresInSeconds: uploadTtlSeconds,
          })
        : {
            storageKey: resolveScholarshipSpeakingStorageKey({
              attemptId,
              questionId,
              responseId,
            }),
            uploadUrl: `/api/exam/session/speaking/upload?attemptId=${encodeURIComponent(attemptId)}&responseId=${encodeURIComponent(responseId)}&token=${encodeURIComponent(uploadToken)}`,
            uploadMethod: 'PUT',
            uploadHeaders: {
              'Content-Type': mimeType,
            },
          };

      await client.query(
        `
          INSERT INTO exam_speaking_responses (
            response_id,
            attempt_id,
            candidate_id,
            campaign_code,
            exam_version_key,
            question_id,
            storage_key,
            mime_type,
            byte_size,
            status,
            upload_token_hash,
            upload_expires_at
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, 'INITIATED', $10, $11::timestamptz)
        `,
        [
          responseId,
          attemptId,
          attempt.candidate_id,
          attempt.campaign_code,
          scholarshipExam.examVersionKey,
          questionId,
          uploadTarget.storageKey,
          mimeType,
          byteSize,
          hashScholarshipSpeakingUploadToken(uploadToken),
          expiresAt,
        ],
      );

      return {
        responseId,
        uploadUrl: uploadTarget.uploadUrl,
        uploadMethod: uploadTarget.uploadMethod,
        uploadHeaders: uploadTarget.uploadHeaders,
        expiresAt,
      };
    });

    ok(res, responsePayload);
  });
}
