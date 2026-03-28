import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { applySpeakingScore, normalizeOptionalText } from './_helpers.js';

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    const identity = await requireRole(req, [ROLES.SUPER_ADMIN, ROLES.OPERATIONS]);
    methodGuard(req, ['POST']);

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const attemptId = safeTrim(body.attemptId);
    if (!attemptId) {
      throw new HttpError(400, 'attemptId is required.', 'missing_attempt_id');
    }

    const result = await withTransaction((client) => applySpeakingScore(client, {
      attemptId,
      speakingScore20: body.speakingScore20,
      reviewNote: normalizeOptionalText(body.reviewNote),
    }));

    ok(res, {
      item: result,
    });

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_RESULT_SPEAKING_SCORE_SET',
      targetType: 'RESULT',
      targetId: attemptId,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        speakingScore20: body.speakingScore20,
      },
    });
  });
}
