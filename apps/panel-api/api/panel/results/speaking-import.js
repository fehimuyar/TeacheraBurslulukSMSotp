import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody } from '../../_lib/http.js';
import { applySpeakingScore, parseSpeakingImportItems } from './_helpers.js';

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    const identity = await requireRole(req, [ROLES.SUPER_ADMIN, ROLES.OPERATIONS]);
    methodGuard(req, ['POST']);

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const items = parseSpeakingImportItems(body);
    if (items.length === 0) {
      throw new HttpError(400, 'At least one speaking score row is required.', 'missing_items');
    }

    const results = [];
    for (const item of items) {
      const updated = await withTransaction((client) => applySpeakingScore(client, item));
      results.push(updated);
    }

    ok(res, {
      processed: results.length,
      items: results,
    });

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_RESULT_SPEAKING_IMPORT',
      targetType: 'RESULT_BATCH',
      targetId: String(results.length),
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        attemptIds: results.map((item) => item.attempt_id),
      },
    });
  });
}
