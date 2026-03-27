import { query } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { resolveExamRuntimeWindow } from '../../_lib/examRuntime.js';
import { handleRequest, methodGuard, ok, safeTrim } from '../../_lib/http.js';
import { requireExamSession } from '../../_lib/sessionAuth.js';
import {
  resolveScholarshipExamContext,
  resolveScholarshipResultLifecycleStatus,
} from '../../_lib/scholarshipExam.js';

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);

    const attemptId = safeTrim(
      Array.isArray(req.query?.attemptId) ? req.query.attemptId[0] : req.query?.attemptId,
    );
    if (!attemptId) {
      throw new HttpError(400, 'attemptId is required.', 'missing_attempt_id');
    }

    await requireExamSession(req, attemptId);

    const state = await query(
      `
        SELECT
          ea.id,
          ea.status AS attempt_status,
          ea.started_at,
          ea.bank_key,
          ea.source AS attempt_source,
          c.grade,
          r.status AS result_status,
          r.score AS result_score,
          ses.status AS submission_status,
          ses.final_score AS submission_final_score
        FROM exam_attempts ea
        JOIN candidates c ON c.id = ea.candidate_id
        LEFT JOIN results r ON r.attempt_id = ea.id
        LEFT JOIN scholarship_exam_submissions ses ON ses.attempt_id = ea.id
        WHERE ea.id = $1
        LIMIT 1
      `,
      [attemptId],
    );

    if (state.rowCount === 0) {
      throw new HttpError(404, 'Exam attempt was not found.', 'attempt_not_found');
    }

    const row = state.rows[0];
    const scholarshipExam = resolveScholarshipExamContext({
      grade: row.grade,
      bankKey: row.bank_key,
      source: row.attempt_source,
    });
    if (!scholarshipExam) {
      throw new HttpError(
        409,
        'This attempt is not configured for the scholarship exam result contract.',
        'scholarship_exam_context_missing',
      );
    }

    let attemptStatus = row.attempt_status;
    const runtime = resolveExamRuntimeWindow(row.started_at);
    if (runtime.timed_out && ['STARTED', 'OPEN'].includes(attemptStatus)) {
      const timeoutUpdate = await query(
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
          RETURNING status
        `,
        [attemptId, runtime.duration_seconds],
      );
      if (timeoutUpdate.rowCount > 0) {
        attemptStatus = timeoutUpdate.rows[0].status;
      }
    }

    const status = resolveScholarshipResultLifecycleStatus({
      attemptStatus,
      submissionStatus: row.submission_status,
      resultStatus: row.result_status,
    });
    const finalScoreRaw = row.submission_final_score ?? row.result_score;

    ok(res, {
      status,
      ...(status === 'finalized' && finalScoreRaw !== null && finalScoreRaw !== undefined
        ? { finalScore: Number(finalScoreRaw) }
        : {}),
    });
  });
}
