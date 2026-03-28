import { query } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, safeTrim } from '../../_lib/http.js';
import { requireExamSession } from '../../_lib/sessionAuth.js';

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);

    const attemptId = Array.isArray(req.query?.attemptId)
      ? safeTrim(req.query.attemptId[0])
      : safeTrim(req.query?.attemptId);
    if (!attemptId) {
      throw new HttpError(400, 'attemptId parameter is required.', 'missing_attempt_id');
    }

    await requireExamSession(req, attemptId);

    const result = await query(
      `
        SELECT status, score, final_score_100
        FROM results
        WHERE attempt_id = $1
        LIMIT 1
      `,
      [attemptId],
    );

    if (result.rowCount === 0) {
      ok(res, {
        status: 'evaluation_pending',
      });
      return;
    }

    const row = result.rows[0];
    if (!['PUBLISHED', 'VIEWED'].includes(safeTrim(row.status).toUpperCase())) {
      ok(res, {
        status: 'evaluation_pending',
      });
      return;
    }

    ok(res, {
      status: 'finalized',
      finalScore: Number(row.score ?? row.final_score_100 ?? 0),
    });
  });
}
