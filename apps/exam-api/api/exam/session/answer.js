import { query, withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { isAuthorizedLoadTestMode } from '../../_lib/loadTestMode.js';
import { enforceCounterThreshold } from '../../_lib/redisEphemeral.js';
import { enforceRateLimit, getRequestIp } from '../../_lib/redisRateLimit.js';
import { requireExamSession } from '../../_lib/sessionAuth.js';

function readBoundedIntEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(safeTrim(process.env[name] || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeIncomingAnswers(body) {
  if (Array.isArray(body.answers)) return body.answers;

  const questionId = safeTrim(body.questionId);
  if (!questionId) return [];

  return [
    {
      questionId,
      selectedOptionId: body.selectedOptionId,
      selectedOption: body.selectedOption,
      isCorrect: body.isCorrect,
      questionWeight: body.questionWeight,
      scoreDelta: body.scoreDelta,
      savedAt: body.savedAt,
    },
  ];
}

function normalizeAnswerRow(raw) {
  const questionId = safeTrim(raw?.questionId).slice(0, 120);
  if (!questionId) return null;

  const selectedOptionRaw = raw?.selectedOptionId ?? raw?.selectedOption;
  const selectedOption = selectedOptionRaw === null || selectedOptionRaw === undefined
    ? null
    : String(selectedOptionRaw).slice(0, 500);

  const isPackagePayload = Object.prototype.hasOwnProperty.call(raw || {}, 'selectedOptionId');
  const scoreDeltaRaw = Number.parseFloat(String(isPackagePayload ? 0 : (raw?.scoreDelta ?? 0)));
  const questionWeightRaw = Number.parseFloat(String(isPackagePayload ? 1 : (raw?.questionWeight ?? 1)));

  return {
    questionId,
    selectedOption,
    isCorrect: isPackagePayload ? null : (typeof raw?.isCorrect === 'boolean' ? raw.isCorrect : null),
    scoreDelta: Number.isFinite(scoreDeltaRaw) ? Math.max(-100, Math.min(100, scoreDeltaRaw)) : 0,
    questionWeight: Number.isFinite(questionWeightRaw) ? Math.max(0, Math.min(100, questionWeightRaw)) : 1,
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

    const normalizedAnswers = normalizeIncomingAnswers(body)
      .map((item) => normalizeAnswerRow(item))
      .filter(Boolean);

    if (normalizedAnswers.length === 0) {
      throw new HttpError(400, 'At least one answer is required.', 'missing_answers');
    }

    if (!loadTestMode) {
      const attemptState = await query(
        `
          SELECT status
          FROM exam_attempts
          WHERE id = $1
          LIMIT 1
        `,
        [attemptId],
      );

      if (attemptState.rowCount === 0) {
        throw new HttpError(404, 'Exam attempt was not found.', 'attempt_not_found');
      }

      const status = attemptState.rows[0].status;
      if (!['STARTED', 'OPEN'].includes(status)) {
        throw new HttpError(409, 'Attempt no longer accepts answers.', 'attempt_not_open', { status });
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
