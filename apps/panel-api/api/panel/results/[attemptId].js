import { requireRole } from '../../_lib/auth.js';
import { ROLES } from '../../_lib/constants.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, safeTrim } from '../../_lib/http.js';
import { loadPanelResultDetail } from './_helpers.js';
import { withTransaction } from '../../_lib/db.js';

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    await requireRole(req, [ROLES.SUPER_ADMIN, ROLES.OPERATIONS]);
    methodGuard(req, ['GET']);

    const attemptId = Array.isArray(req.query?.attemptId)
      ? safeTrim(req.query.attemptId[0])
      : safeTrim(req.query?.attemptId);
    if (!attemptId) {
      throw new HttpError(400, 'attemptId is required.', 'missing_attempt_id');
    }

    const result = await withTransaction(async (client) => loadPanelResultDetail(client, attemptId));
    ok(res, {
      item: result,
    });
  });
}
