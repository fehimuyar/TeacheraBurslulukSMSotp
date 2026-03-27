import { query } from '../../../_lib/db.js';
import { HttpError } from '../../../_lib/errors.js';
import { handleRequest, methodGuard, readRawBody, safeTrim } from '../../../_lib/http.js';
import { hashScholarshipSpeakingUploadToken } from '../../../_lib/scholarshipExam.js';

function readBoundedIntEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(safeTrim(process.env[name] || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function readQueryValue(req, key) {
  const value = Array.isArray(req.query?.[key]) ? req.query[key][0] : req.query?.[key];
  return safeTrim(value);
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['PUT', 'POST']);

    const attemptId = readQueryValue(req, 'attemptId');
    const responseId = readQueryValue(req, 'responseId');
    const uploadToken = readQueryValue(req, 'token') || safeTrim(req.headers?.['x-upload-token']);
    if (!attemptId) {
      throw new HttpError(400, 'attemptId is required.', 'missing_attempt_id');
    }
    if (!responseId) {
      throw new HttpError(400, 'responseId is required.', 'missing_response_id');
    }
    if (!uploadToken) {
      throw new HttpError(400, 'upload token is required.', 'missing_upload_token');
    }

    const maxUploadBytes = readBoundedIntEnv('EXAM_SPEAKING_UPLOAD_MAX_BYTES', 20 * 1024 * 1024, 1024, 100 * 1024 * 1024);
    const audioBuffer = await readRawBody(req, maxUploadBytes);
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new HttpError(400, 'Audio payload is required.', 'missing_audio_payload');
    }

    const uploadLookup = await query(
      `
        SELECT
          response_id::text AS response_id,
          storage_key,
          upload_token_hash,
          upload_expires_at,
          status
        FROM exam_speaking_responses
        WHERE attempt_id = $1
          AND response_id = $2::uuid
        LIMIT 1
      `,
      [attemptId, responseId],
    );

    if (uploadLookup.rowCount === 0) {
      throw new HttpError(404, 'Speaking upload target was not found.', 'speaking_upload_target_not_found');
    }

    const row = uploadLookup.rows[0];
    if (safeTrim(row.storage_key).startsWith('s3://')) {
      throw new HttpError(409, 'This speaking upload target expects direct object storage upload.', 'speaking_upload_direct_only');
    }
    if (safeTrim(row.status).toUpperCase() !== 'INITIATED') {
      throw new HttpError(409, 'Speaking upload target is no longer accepting audio.', 'speaking_upload_not_open', {
        status: row.status,
      });
    }
    if (!row.upload_token_hash || hashScholarshipSpeakingUploadToken(uploadToken) !== row.upload_token_hash) {
      throw new HttpError(403, 'Speaking upload token is invalid.', 'invalid_upload_token');
    }
    if (row.upload_expires_at && Number(new Date(row.upload_expires_at)) < Date.now()) {
      throw new HttpError(410, 'Speaking upload token has expired.', 'upload_token_expired');
    }

    const contentTypeHeader = safeTrim(req.headers?.['content-type']).split(';')[0] || 'application/octet-stream';

    await query(
      `
        UPDATE exam_speaking_responses
        SET
          audio_blob = $3,
          mime_type = $4,
          byte_size = $5,
          status = 'UPLOADED_BINARY',
          upload_token_hash = NULL,
          upload_expires_at = NULL,
          uploaded_at = NOW(),
          updated_at = NOW()
        WHERE attempt_id = $1
          AND response_id = $2::uuid
      `,
      [attemptId, responseId, audioBuffer, contentTypeHeader, audioBuffer.length],
    );

    res.status(204).end();
  });
}
