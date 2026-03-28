import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { query } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody } from '../../_lib/http.js';
import { normalizeAttemptIds } from './_helpers.js';

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    const identity = await requireRole(req, [ROLES.SUPER_ADMIN, ROLES.OPERATIONS]);
    methodGuard(req, ['POST']);

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const attemptIds = normalizeAttemptIds(body.attemptIds || body.attempt_ids);
    if (attemptIds.length === 0) {
      throw new HttpError(400, 'attemptIds is required.', 'missing_attempt_ids');
    }

    const updateResult = await query(
      `
        UPDATE results
        SET
          status = 'NOT_READY',
          score = NULL,
          percentage = NULL,
          published_at = NULL,
          viewed_at = NULL,
          updated_at = NOW()
        WHERE attempt_id = ANY($1::uuid[])
        RETURNING attempt_id
      `,
      [attemptIds],
    );

    ok(res, {
      requested: attemptIds.length,
      unpublished: updateResult.rowCount,
      attempt_ids: updateResult.rows.map((row) => row.attempt_id),
    });

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_RESULT_UNPUBLISH',
      targetType: 'RESULT_BATCH',
      targetId: String(updateResult.rowCount),
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        attemptIds,
      },
    });
  });
}
