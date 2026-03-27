import { requireRole } from '../../../../_lib/auth.js';
import { query } from '../../../../_lib/db.js';
import { HttpError } from '../../../../_lib/errors.js';
import { downloadScholarshipSpeakingObject } from '../../../../_lib/scholarshipObjectStorage.js';
import { handleRequest, methodGuard, safeTrim } from '../../../../_lib/http.js';

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);

    await requireRole(
      req,
      ['SUPER_ADMIN', 'OPERATIONS', 'READ_ONLY'],
      ['PANEL_RESULTS_REVIEW'],
    );

    const resultId = safeTrim(Array.isArray(req.query?.resultId) ? req.query.resultId[0] : req.query?.resultId);
    const responseId = safeTrim(Array.isArray(req.query?.responseId) ? req.query.responseId[0] : req.query?.responseId);
    if (!resultId) {
      throw new HttpError(400, 'resultId is required.', 'missing_result_id');
    }
    if (!responseId) {
      throw new HttpError(400, 'responseId is required.', 'missing_response_id');
    }

    const lookup = await query(
      `
        SELECT
          esr.storage_key,
          esr.mime_type,
          esr.byte_size,
          esr.audio_blob,
          esr.status
        FROM results r
        JOIN exam_speaking_responses esr ON esr.attempt_id = r.attempt_id
        WHERE r.id = $1
          AND esr.response_id = $2::uuid
        LIMIT 1
      `,
      [resultId, responseId],
    );

    if (lookup.rowCount === 0) {
      throw new HttpError(404, 'Speaking audio was not found.', 'speaking_audio_not_found');
    }

    const row = lookup.rows[0];
    if (!['UPLOADED', 'UPLOADED_BINARY'].includes(safeTrim(row.status).toUpperCase())) {
      throw new HttpError(409, 'Speaking audio is not ready yet.', 'speaking_audio_not_ready');
    }

    let buffer;
    let contentType = safeTrim(row.mime_type) || 'application/octet-stream';
    let contentLength = Number(row.byte_size || 0);

    if (safeTrim(row.storage_key).startsWith('s3://')) {
      const objectResponse = await downloadScholarshipSpeakingObject(row.storage_key);
      buffer = objectResponse.buffer;
      contentType = objectResponse.contentType || contentType;
      contentLength = Number(objectResponse.contentLength || buffer.length);
    } else {
      buffer = row.audio_blob;
      if (!buffer || buffer.length === 0) {
        throw new HttpError(404, 'Speaking audio binary is not available.', 'speaking_audio_binary_missing');
      }
      contentLength = buffer.length;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(contentLength));
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(buffer);
  });
}
