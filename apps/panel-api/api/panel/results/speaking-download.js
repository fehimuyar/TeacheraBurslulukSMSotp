import { requireRole } from '../../_lib/auth.js';
import { buildSignedS3ObjectUrl } from '../../_lib/burslulukExam.js';
import { ROLES } from '../../_lib/constants.js';
import { query } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, safeTrim } from '../../_lib/http.js';

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    await requireRole(req, [ROLES.SUPER_ADMIN, ROLES.OPERATIONS]);
    methodGuard(req, ['GET']);

    const attemptId = Array.isArray(req.query?.attemptId)
      ? safeTrim(req.query.attemptId[0])
      : safeTrim(req.query?.attemptId);
    const responseId = Array.isArray(req.query?.responseId)
      ? safeTrim(req.query.responseId[0])
      : safeTrim(req.query?.responseId);

    if (!attemptId) {
      throw new HttpError(400, 'attemptId is required.', 'missing_attempt_id');
    }
    if (!responseId) {
      throw new HttpError(400, 'responseId is required.', 'missing_response_id');
    }

    const lookup = await query(
      `
        SELECT sr.storage_key, sr.mime_type, sr.upload_status
        FROM speaking_responses sr
        JOIN results r ON r.attempt_id = sr.attempt_id
        WHERE sr.attempt_id = $1
          AND sr.response_id = $2::uuid
        LIMIT 1
      `,
      [attemptId, responseId],
    );

    if (lookup.rowCount === 0) {
      throw new HttpError(404, 'Speaking recording was not found.', 'speaking_response_not_found');
    }

    const row = lookup.rows[0];
    if (safeTrim(row.upload_status).toUpperCase() !== 'UPLOADED') {
      throw new HttpError(409, 'Speaking recording is not uploaded yet.', 'speaking_response_not_uploaded');
    }

    const signedRequest = buildSignedS3ObjectUrl({
      storageKey: row.storage_key,
      method: 'GET',
      mimeType: row.mime_type || null,
      expiresSeconds: 10 * 60,
    });

    ok(res, {
      url: signedRequest.url,
      expiresAt: signedRequest.expiresAt,
      responseId,
    });
  });
}
