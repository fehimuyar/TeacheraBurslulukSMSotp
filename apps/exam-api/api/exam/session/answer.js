import { query, withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { resolveExamRuntimeWindow } from '../../_lib/examRuntime.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { isAuthorizedLoadTestMode } from '../../_lib/loadTestMode.js';
import { enforceCounterThreshold } from '../../_lib/redisEphemeral.js';
import { enforceRateLimit, getRequestIp } from '../../_lib/redisRateLimit.js';
import { requireExamSession } from '../../_lib/sessionAuth.js';
import {
  assertScholarshipExamVersion,
  hasScholarshipExamPayload,
  resolveScholarshipExamContext,
} from '../../_lib/scholarshipExam.js';

function readBoundedIntEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(safeTrim(process.env[name] || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeIncomingAnswers(body, scholarshipContract = false) {
  if (Array.isArray(body.answers)) return body.answers;

  const questionId = safeTrim(body.questionId);
  if (!questionId) return [];

  return [
    scholarshipContract
      ? {
          questionId,
          selectedOptionId: body.selectedOptionId ?? body.selectedOption,
        }
      : {
          questionId,
          selectedOption: body.selectedOption,
          isCorrect: body.isCorrect,
          questionWeight: body.questionWeight,
          scoreDelta: body.scoreDelta,
        },
  ];
}

function normalizeAnswerRow(raw, { scholarshipContract = false } = {}) {
  const questionId = safeTrim(raw?.questionId).slice(0, 120);
  if (!questionId) return null;

  const selectedOptionRaw = scholarshipContract ? raw?.selectedOptionId : raw?.selectedOption;
  const selectedOption = selectedOptionRaw === null || selectedOptionRaw === undefined
    ? null
    : String(selectedOptionRaw).slice(0, 500);

  const scoreDeltaRaw = Number.parseFloat(String(raw?.scoreDelta ?? 0));
  const questionWeightRaw = Number.parseFloat(String(raw?.questionWeight ?? 1));

  return {
    questionId,
    selectedOption,
    isCorrect: scholarshipContract ? null : (typeof raw?.isCorrect === 'boolean' ? raw.isCorrect : null),
    scoreDelta: scholarshipContract
      ? 0
      : (Number.isFinite(scoreDeltaRaw) ? Math.max(-100, Math.min(100, scoreDeltaRaw)) : 0),
    questionWeight: scholarshipContract
      ? 0
      : (Number.isFinite(questionWeightRaw) ? Math.max(0, Math.min(100, questionWeightRaw)) : 1),
  };
}

async function upsertAnswersBatch(client, attemptId, normalizedAnswers) {
  const rows = normalizedAnswers.map((answer) => ({
    question_id: answer.questionId,
    selected_option: answer.selectedOption,
    is_correct: answer.isCorrect,
    question_weight: answer.questionWeight,
    score_delta: answer.scoreDelta,
  }));

  await client.query(
    `
      INSERT INTO exam_answers (
        attempt_id,
        question_id,
        selected_option,
        is_correct,
        question_weight,
        score_delta,
        answered_at
      )
      SELECT
        $1::uuid,
        payload.question_id,
        payload.selected_option,
        payload.is_correct,
        payload.question_weight,
        payload.score_delta,
        NOW()
      FROM jsonb_to_recordset($2::jsonb) AS payload(
        question_id TEXT,
        selected_option TEXT,
        is_correct BOOLEAN,
        question_weight NUMERIC,
        score_delta NUMERIC
      )
      ON CONFLICT (attempt_id, question_id)
      DO UPDATE
      SET
        selected_option = EXCLUDED.selected_option,
        is_correct = EXCLUDED.is_correct,
        question_weight = EXCLUDED.question_weight,
        score_delta = EXCLUDED.score_delta,
        answered_at = NOW()
    `,
    [attemptId, JSON.stringify(rows)],
  );
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);
    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const attemptId = safeTrim(body.attemptId);
    if (!attemptId) {
      throw new HttpError(400, 'attemptId is required.', 'missing_attempt_id');
    }
    if (!req.headers?.['x-exam-session-token'] && body.sessionToken) {
      req.headers = {
        ...req.headers,
        'x-exam-session-token': safeTrim(body.sessionToken),
      };
    }
    const loadTestMode = isAuthorizedLoadTestMode(req);

    if (!loadTestMode) {
      await enforceRateLimit(req, res, {
        scope: 'exam_answer_ip',
        identity: getRequestIp(req),
        limitEnv: 'RL_EXAM_ANSWER_IP_LIMIT',
        windowSecondsEnv: 'RL_EXAM_ANSWER_IP_WINDOW_SECONDS',
        defaultLimit: 300,
        defaultWindowSeconds: 60,
        requireRedis: true,
        errorCode: 'exam_answer_rate_limited',
        errorMessage: 'Too many answer requests. Please slow down.',
      });
    }

    await requireExamSession(req, attemptId);
    const useScholarshipContract = hasScholarshipExamPayload(body);

    if (!loadTestMode) {
      await enforceRateLimit(req, res, {
        scope: 'exam_answer_attempt',
        identity: attemptId,
        limitEnv: 'RL_EXAM_ANSWER_ATTEMPT_LIMIT',
        windowSecondsEnv: 'RL_EXAM_ANSWER_ATTEMPT_WINDOW_SECONDS',
        defaultLimit: 200,
        defaultWindowSeconds: 60,
        requireRedis: true,
        errorCode: 'exam_answer_attempt_rate_limited',
        errorMessage: 'Answer flow is temporarily throttled for this exam session.',
      });

      await enforceCounterThreshold({
        scope: 'exam_answer_burst',
        identity: attemptId,
        increment: 1,
        windowSeconds: readBoundedIntEnv('EXAM_ANSWER_BURST_WINDOW_SECONDS', 15, 1, 600),
        maxCount: readBoundedIntEnv('EXAM_ANSWER_BURST_MAX', 45, 1, 1000),
        requireRedis: true,
        errorCode: 'exam_answer_burst_limited',
        errorMessage: 'Too many rapid answer updates. Please retry in a few seconds.',
      });
    }

    const normalizedAnswers = normalizeIncomingAnswers(body, useScholarshipContract)
      .map((item) => normalizeAnswerRow(item, { scholarshipContract: useScholarshipContract }))
      .filter(Boolean);

    if (normalizedAnswers.length === 0) {
      throw new HttpError(400, 'At least one answer is required.', 'missing_answers');
    }

    if (!loadTestMode) {
      const attemptState = await query(
        `
          SELECT
            ea.status,
            ea.started_at,
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

      if (attemptState.rowCount === 0) {
        throw new HttpError(404, 'Exam attempt was not found.', 'attempt_not_found');
      }

      const attempt = attemptState.rows[0];
      const runtime = resolveExamRuntimeWindow(attempt.started_at);
      if (runtime.timed_out) {
        if (['STARTED', 'OPEN'].includes(attempt.status)) {
          await query(
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
            `,
            [attemptId, runtime.duration_seconds],
          );
        }
        throw new HttpError(409, 'Exam time limit has been reached.', 'attempt_time_limit_reached', {
          runtime,
        });
      }
      if (!['STARTED', 'OPEN'].includes(attempt.status)) {
        throw new HttpError(409, 'Attempt no longer accepts answers.', 'attempt_not_open', { status: attempt.status });
      }

      if (useScholarshipContract) {
        const scholarshipExam = resolveScholarshipExamContext({
          grade: attempt.grade,
          bankKey: attempt.bank_key,
          source: attempt.source,
          examVersionKey: body.examVersionKey,
        });

        if (!scholarshipExam) {
          throw new HttpError(
            409,
            'This attempt is not configured for the scholarship exam contract.',
            'scholarship_exam_context_missing',
          );
        }

        assertScholarshipExamVersion(body.examVersionKey, scholarshipExam);
      }
    }

    if (loadTestMode) {
      await query(
        `
          INSERT INTO exam_answers (
            attempt_id,
            question_id,
            selected_option,
            is_correct,
            question_weight,
            score_delta,
            answered_at
          )
          SELECT
            $1::uuid,
            payload.question_id,
            payload.selected_option,
            payload.is_correct,
            payload.question_weight,
            payload.score_delta,
            NOW()
          FROM jsonb_to_recordset($2::jsonb) AS payload(
            question_id TEXT,
            selected_option TEXT,
            is_correct BOOLEAN,
            question_weight NUMERIC,
            score_delta NUMERIC
          )
          ON CONFLICT (attempt_id, question_id)
          DO UPDATE
          SET
            selected_option = EXCLUDED.selected_option,
            is_correct = EXCLUDED.is_correct,
            question_weight = EXCLUDED.question_weight,
            score_delta = EXCLUDED.score_delta,
            answered_at = NOW()
        `,
        [
          attemptId,
          JSON.stringify(
            normalizedAnswers.map((answer) => ({
              question_id: answer.questionId,
              selected_option: answer.selectedOption,
              is_correct: answer.isCorrect,
              question_weight: answer.questionWeight,
              score_delta: answer.scoreDelta,
            })),
          ),
        ],
      );

      ok(res, {
        attempt_id: attemptId,
        answered_count: normalizedAnswers.length,
      });
      return;
    }

    const persistedCount = await withTransaction(async (client) => {
      await upsertAnswersBatch(client, attemptId, normalizedAnswers);

      const countResult = await client.query(
        `
          SELECT COUNT(*)::int AS answered_count
          FROM exam_answers
          WHERE attempt_id = $1
        `,
        [attemptId],
      );

      return countResult.rows[0].answered_count;
    });

    ok(res, {
      attempt_id: attemptId,
      answered_count: persistedCount,
    });
  });
}
