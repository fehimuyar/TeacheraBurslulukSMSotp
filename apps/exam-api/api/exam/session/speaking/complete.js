import { withTransaction } from '../../../_lib/db.js';
import { HttpError } from '../../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../../_lib/http.js';
import { requireExamSession } from '../../../_lib/sessionAuth.js';
import { assertScholarshipSpeakingObjectUploaded } from '../../../_lib/scholarshipObjectStorage.js';
import {
  assertScholarshipExamVersion,
  findScholarshipQuestion,
  loadScholarshipExamFullContent,
  resolveScholarshipExamContext,
} from '../../../_lib/scholarshipExam.js';

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
    const responseId = safeTrim(body.responseId);
    const mimeType = safeTrim(body.mimeType).slice(0, 120);
    const byteSize = clampInt(body.byteSize, 1, 100 * 1024 * 1024, 0);

    if (!attemptId) {
      throw new HttpError(400, 'attemptId is required.', 'missing_attempt_id');
    }
    if (!examVersionKey) {
      throw new HttpError(400, 'examVersionKey is required.', 'missing_exam_version_key');
    }
    if (!questionId) {
      throw new HttpError(400, 'questionId is required.', 'missing_question_id');
    }
    if (!responseId) {
      throw new HttpError(400, 'responseId is required.', 'missing_response_id');
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

      const maxDurationSeconds = clampInt(content?.scoring?.speaking?.maxDurationSeconds, 1, 1800, 180);
      const durationSeconds = clampInt(body.durationSeconds, 1, maxDurationSeconds, 0);
      if (!durationSeconds) {
        throw new HttpError(400, 'durationSeconds must be within the speaking prompt limit.', 'invalid_duration_seconds', {
          max_duration_seconds: maxDurationSeconds,
        });
      }

      const responseLookup = await client.query(
        `
          SELECT
            response_id::text AS response_id,
            question_id,
            storage_key,
            status,
            byte_size
          FROM exam_speaking_responses
          WHERE attempt_id = $1
            AND response_id = $2::uuid
          LIMIT 1
        `,
        [attemptId, responseId],
      );

      if (responseLookup.rowCount === 0) {
        throw new HttpError(404, 'Speaking response was not found.', 'speaking_response_not_found');
      }

      const row = responseLookup.rows[0];
      if (row.question_id !== questionId) {
        throw new HttpError(409, 'Speaking response does not belong to the requested question.', 'speaking_response_question_mismatch');
      }
      const usesObjectStorage = safeTrim(row.storage_key).startsWith('s3://');
      let effectiveMimeType = mimeType;
      let effectiveByteSize = byteSize;

      if (usesObjectStorage) {
        const objectState = await assertScholarshipSpeakingObjectUploaded({
          storageKey: row.storage_key,
          byteSize,
          mimeType,
        });
        effectiveMimeType = objectState.contentType || mimeType;
        effectiveByteSize = Number(objectState.contentLength || byteSize);
      } else {
        if (!['UPLOADED_BINARY', 'UPLOADED'].includes(safeTrim(row.status).toUpperCase())) {
          throw new HttpError(409, 'Speaking response audio has not been uploaded yet.', 'speaking_response_not_uploaded', {
            status: row.status,
          });
        }
        if (Number(row.byte_size || 0) > 0 && Number(row.byte_size) !== byteSize) {
          throw new HttpError(409, 'byteSize does not match the uploaded speaking audio.', 'speaking_response_size_mismatch', {
            expected_byte_size: Number(row.byte_size),
            received_byte_size: byteSize,
          });
        }
      }

      await client.query(
        `
          UPDATE exam_speaking_responses
          SET
            duration_seconds = $3,
            mime_type = $4,
            byte_size = $5,
            status = 'UPLOADED',
            uploaded_at = COALESCE(uploaded_at, NOW()),
            upload_token_hash = NULL,
            upload_expires_at = NULL,
            completed_at = NOW(),
            updated_at = NOW()
          WHERE attempt_id = $1
            AND response_id = $2::uuid
        `,
        [attemptId, responseId, durationSeconds, effectiveMimeType, effectiveByteSize],
      );

      return {
        responseId,
        storageKey: row.storage_key,
        status: 'uploaded',
      };
    });

    ok(res, responsePayload);
  });
}
