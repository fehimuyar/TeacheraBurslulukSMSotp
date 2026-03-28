import { withTransaction } from '../../_lib/db.js';
import {
  calculateObjectiveScore80,
  computeFinalScore100,
  loadFullAssessmentForGrade,
} from '../../_lib/burslulukExam.js';
import { HttpError } from '../../_lib/errors.js';
import { normalizeSubmissionStatus, optionalString } from '../../_lib/exam.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { isAuthorizedLoadTestMode } from '../../_lib/loadTestMode.js';
import { enqueueNotification } from '../../_lib/notifications.js';
import { decryptPii } from '../../_lib/piiCrypto.js';
import { acquireShortLock, releaseShortLock } from '../../_lib/redisEphemeral.js';
import { enforceRateLimit, getRequestIp } from '../../_lib/redisRateLimit.js';
import { requireExamSession } from '../../_lib/sessionAuth.js';

function readBoundedIntEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(safeTrim(process.env[name] || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clampMetricInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clampMetricFloat(value, min, max, fallback) {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeClientMetrics(metrics, questionCount) {
  const total = Math.max(0, clampMetricInt(questionCount, 0, 500, 0));
  const answeredCount = clampMetricInt(metrics?.answeredCount, 0, total || 500, 0);
  const correctCount = clampMetricInt(metrics?.correctCount, 0, answeredCount, 0);
  const wrongCount = clampMetricInt(metrics?.wrongCount, 0, answeredCount, Math.max(0, answeredCount - correctCount));
  const unansweredCount = clampMetricInt(metrics?.unansweredCount, 0, total || 500, Math.max(0, total - answeredCount));
  const score = clampMetricFloat(metrics?.score, 0, total || 500, correctCount);
  const percentage = clampMetricFloat(
    metrics?.percentage,
    0,
    100,
    total > 0 ? Math.round((score / total) * 10000) / 100 : 0,
  );

  return {
    score,
    percentage,
    correctCount,
    wrongCount,
    unansweredCount,
  };
}

function normalizeSubmittedAnswers(answers) {
  if (!Array.isArray(answers)) return [];
  return answers
    .map((raw) => {
      const questionId = safeTrim(raw?.questionId).slice(0, 120);
      if (!questionId) return null;
      const selectedOption = raw?.selectedOption === null || raw?.selectedOption === undefined
        ? null
        : String(raw.selectedOption).slice(0, 500);
      const isCorrect = typeof raw?.isCorrect === 'boolean' ? raw.isCorrect : null;
      const scoreDeltaRaw = Number.parseFloat(String(raw?.scoreDelta ?? 0));
      const weightRaw = Number.parseFloat(String(raw?.questionWeight ?? 1));
      return {
        questionId,
        selectedOption,
        isCorrect,
        scoreDelta: Number.isFinite(scoreDeltaRaw) ? Math.max(-100, Math.min(100, scoreDeltaRaw)) : 0,
        questionWeight: Number.isFinite(weightRaw) ? Math.max(0, Math.min(100, weightRaw)) : 1,
      };
    })
    .filter(Boolean);
}

function isBurslulukPackageSubmit(body) {
  return Array.isArray(body?.objectiveAnswers)
    || Array.isArray(body?.speakingResponses)
    || safeTrim(body?.examVersionKey).startsWith('bursluluk-2026-');
}

function normalizePackageObjectiveAnswers(rawAnswers) {
  if (!Array.isArray(rawAnswers)) return [];
  return rawAnswers
    .map((raw) => {
      const questionId = safeTrim(raw?.questionId).slice(0, 120);
      if (!questionId) return null;
      const selectedOptionId = raw?.selectedOptionId === null || raw?.selectedOptionId === undefined
        ? null
        : String(raw.selectedOptionId).slice(0, 500);
      return {
        questionId,
        selectedOptionId,
      };
    })
    .filter(Boolean);
}

function normalizePackageSpeakingResponses(rawResponses) {
  if (!Array.isArray(rawResponses)) return [];
  return rawResponses
    .map((raw) => {
      const questionId = safeTrim(raw?.questionId).slice(0, 120);
      const responseId = safeTrim(raw?.responseId);
      if (!questionId || !responseId) return null;
      return {
        questionId,
        responseId,
      };
    })
    .filter(Boolean);
}

async function loadPersistedObjectiveAnswerMap(client, attemptId) {
  const result = await client.query(
    `
      SELECT question_id, selected_option
      FROM exam_answers
      WHERE attempt_id = $1
    `,
    [attemptId],
  );

  return new Map(
    result.rows.map((row) => [
      row.question_id,
      row.selected_option || null,
    ]),
  );
}

async function handleBurslulukPackageSubmit({
  client,
  attemptId,
  body,
  loadTestMode,
}) {
  const completionStatus = normalizeSubmissionStatus(body.completionStatus || body.status || 'completed');
  const durationSeconds = clampMetricInt(body.durationSeconds, 0, 60 * 60 * 8, 0);
  const objectiveAnswers = normalizePackageObjectiveAnswers(body.objectiveAnswers);
  const speakingResponses = normalizePackageSpeakingResponses(body.speakingResponses);

  const attemptLookup = await client.query(
    loadTestMode
      ? `
          SELECT
            ea.id,
            ea.status,
            ea.question_count,
            ea.candidate_id,
            ea.campaign_code,
            ea.application_id,
            c.grade
          FROM exam_attempts ea
          JOIN candidates c ON c.id = ea.candidate_id
          WHERE ea.id = $1
          LIMIT 1
        `
      : `
          SELECT
            ea.id,
            ea.status,
            ea.question_count,
            ea.candidate_id,
            ea.campaign_code,
            ea.application_id,
            c.grade,
            g.phone_e164 AS parent_phone_e164_legacy,
            g.phone_e164_enc AS parent_phone_e164_enc
          FROM exam_attempts ea
          JOIN candidates c ON c.id = ea.candidate_id
          LEFT JOIN guardians g ON g.id = c.guardian_id
          WHERE ea.id = $1
          LIMIT 1
        `,
    [attemptId],
  );

  if (attemptLookup.rowCount === 0) {
    throw new HttpError(404, 'Exam attempt was not found.', 'attempt_not_found');
  }

  const attempt = attemptLookup.rows[0];
  const parentPhoneE164 = loadTestMode
    ? null
    : await decryptPii(
        attempt.parent_phone_e164_enc,
        attempt.parent_phone_e164_legacy,
      );

  if (objectiveAnswers.length > 0) {
    await upsertAnswersBatch(
      client,
      attemptId,
      objectiveAnswers.map((answer) => ({
        questionId: answer.questionId,
        selectedOption: answer.selectedOptionId,
        isCorrect: null,
        questionWeight: 1,
        scoreDelta: 0,
      })),
    );
  }

  const persistedObjectiveAnswers = objectiveAnswers.length > 0
    ? new Map(objectiveAnswers.map((answer) => [answer.questionId, answer.selectedOptionId]))
    : await loadPersistedObjectiveAnswerMap(client, attemptId);

  const content = await loadFullAssessmentForGrade(attempt.grade);
  const objectiveMetrics = calculateObjectiveScore80(content, persistedObjectiveAnswers);

  if (speakingResponses.length > 0) {
    const responseLookup = await client.query(
      `
        SELECT response_id::text AS response_id, question_id, upload_status
        FROM speaking_responses
        WHERE attempt_id = $1
          AND response_id = ANY($2::uuid[])
      `,
      [attemptId, speakingResponses.map((item) => item.responseId)],
    );

    const responseMap = new Map(
      responseLookup.rows.map((row) => [row.response_id, row]),
    );
    for (const response of speakingResponses) {
      const matched = responseMap.get(response.responseId);
      if (!matched) {
        throw new HttpError(400, 'Speaking response is missing.', 'speaking_response_missing', {
          questionId: response.questionId,
          responseId: response.responseId,
        });
      }
      if (safeTrim(matched.upload_status).toUpperCase() !== 'UPLOADED') {
        throw new HttpError(409, 'Speaking response upload is not complete.', 'speaking_upload_incomplete', {
          questionId: response.questionId,
          responseId: response.responseId,
          uploadStatus: matched.upload_status,
        });
      }
    }
  }

  const existingResult = await client.query(
    `
      SELECT
        id,
        status,
        objective_score_80,
        speaking_score_20,
        speaking_status,
        final_score_100,
        published_at,
        viewed_at
      FROM results
      WHERE attempt_id = $1
      LIMIT 1
    `,
    [attemptId],
  );

  if (existingResult.rowCount > 0 && ['PUBLISHED', 'VIEWED'].includes(existingResult.rows[0].status)) {
    return {
      attemptId,
      resultId: existingResult.rows[0].id,
      status: existingResult.rows[0].status,
      objectiveScore80: Number(existingResult.rows[0].objective_score_80 ?? 0),
      speakingStatus: existingResult.rows[0].speaking_status || 'PENDING',
      finalScore100: existingResult.rows[0].final_score_100 == null
        ? null
        : Number(existingResult.rows[0].final_score_100),
      publishedAt: existingResult.rows[0].published_at,
      viewedAt: existingResult.rows[0].viewed_at,
      alreadyPublished: true,
      campaignCode: attempt.campaign_code,
      candidateId: attempt.candidate_id,
      parentPhoneE164,
    };
  }

  const existingSpeakingScore20 = existingResult.rowCount > 0 && existingResult.rows[0].speaking_score_20 != null
    ? Number(existingResult.rows[0].speaking_score_20)
    : null;
  const finalScore100 = computeFinalScore100(objectiveMetrics.score80, existingSpeakingScore20);
  const speakingStatus = existingSpeakingScore20 == null ? 'PENDING' : 'SCORED';

  await client.query(
    `
      UPDATE exam_attempts
      SET
        status = $2::exam_status,
        submitted_at = NOW(),
        duration_seconds = $3,
        completion_status = $4,
        updated_at = NOW()
      WHERE id = $1
    `,
    [attemptId, completionStatus, durationSeconds || null, body.completionStatus || null],
  );

  const resultUpsert = await client.query(
    `
      INSERT INTO results (
        attempt_id,
        candidate_id,
        campaign_code,
        status,
        objective_score_80,
        speaking_score_20,
        speaking_status,
        final_score_100,
        score,
        percentage,
        correct_count,
        wrong_count,
        unanswered_count,
        placement_label,
        published_at,
        viewed_at
      )
      VALUES ($1, $2, $3, 'NOT_READY', $4, $5, $6, $7, NULL, NULL, $8, $9, $10, NULL, NULL, NULL)
      ON CONFLICT (attempt_id)
      DO UPDATE
      SET
        status = 'NOT_READY',
        objective_score_80 = EXCLUDED.objective_score_80,
        speaking_score_20 = COALESCE(results.speaking_score_20, EXCLUDED.speaking_score_20),
        speaking_status = CASE
          WHEN COALESCE(results.speaking_score_20, EXCLUDED.speaking_score_20) IS NULL THEN 'PENDING'
          ELSE 'SCORED'
        END,
        final_score_100 = CASE
          WHEN COALESCE(results.speaking_score_20, EXCLUDED.speaking_score_20) IS NULL THEN NULL
          ELSE ROUND((EXCLUDED.objective_score_80 + COALESCE(results.speaking_score_20, EXCLUDED.speaking_score_20))::numeric, 2)
        END,
        score = NULL,
        percentage = NULL,
        correct_count = EXCLUDED.correct_count,
        wrong_count = EXCLUDED.wrong_count,
        unanswered_count = EXCLUDED.unanswered_count,
        ranking_group = NULL,
        ranking_position = NULL,
        ranking_total = NULL,
        placement_label = NULL,
        published_at = NULL,
        viewed_at = NULL,
        updated_at = NOW()
      RETURNING
        id,
        status,
        objective_score_80,
        speaking_status,
        final_score_100,
        published_at,
        viewed_at
    `,
    [
      attemptId,
      attempt.candidate_id,
      attempt.campaign_code,
      objectiveMetrics.score80,
      existingSpeakingScore20,
      speakingStatus,
      finalScore100,
      objectiveMetrics.correctCount,
      objectiveMetrics.wrongCount,
      objectiveMetrics.unansweredCount,
    ],
  );

  if (!loadTestMode) {
    await client.query(
      `
        INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
        VALUES ($1, $2, 'EXAM_SUBMITTED', $3::jsonb)
      `,
      [
        attempt.candidate_id,
        attemptId,
        JSON.stringify({
          completionStatus,
          objectiveScore80: objectiveMetrics.score80,
          speakingStatus,
          speakingResponseCount: speakingResponses.length,
        }),
      ],
    );
  }

  const savedResult = resultUpsert.rows[0];
  return {
    attemptId,
    resultId: savedResult.id,
    status: savedResult.status,
    objectiveScore80: Number(savedResult.objective_score_80 ?? 0),
    speakingStatus: savedResult.speaking_status || speakingStatus,
    finalScore100: savedResult.final_score_100 == null ? null : Number(savedResult.final_score_100),
    publishedAt: savedResult.published_at,
    viewedAt: savedResult.viewed_at,
    alreadyPublished: false,
    campaignCode: attempt.campaign_code,
    candidateId: attempt.candidate_id,
    parentPhoneE164,
  };
}

async function upsertAnswersBatch(client, attemptId, submittedAnswers) {
  if (!Array.isArray(submittedAnswers) || submittedAnswers.length === 0) return;

  const rows = submittedAnswers.map((answer) => ({
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

async function getComputedMetrics(client, attemptId, questionCount, fallbackMetrics) {
  const answerStats = await client.query(
    `
      SELECT
        COUNT(*)::int AS answered_count,
        COALESCE(SUM(CASE WHEN is_correct IS TRUE THEN 1 ELSE 0 END), 0)::int AS correct_count,
        COALESCE(SUM(CASE WHEN is_correct IS FALSE THEN 1 ELSE 0 END), 0)::int AS wrong_count,
        COALESCE(
          SUM(
            CASE
              WHEN score_delta IS NOT NULL THEN score_delta
              WHEN is_correct IS TRUE THEN 1
              ELSE 0
            END
          ),
          0
        )::numeric(8,2) AS score
      FROM exam_answers
      WHERE attempt_id = $1
    `,
    [attemptId],
  );

  const row = answerStats.rows[0];
  const hasScorableRows = Number(row?.answered_count || 0) > 0;
  if (!hasScorableRows) {
    return normalizeClientMetrics(fallbackMetrics || {}, questionCount);
  }

  const answeredCount = Number(row.answered_count || 0);
  const correctCount = Number(row.correct_count || 0);
  const wrongCount = Number(row.wrong_count || 0);
  const unansweredCount = Math.max(0, questionCount - answeredCount);
  const score = Number(row.score || 0);
  const percentage = questionCount > 0 ? Math.round((Math.max(0, score) / questionCount) * 10000) / 100 : 0;

  return {
    score: Math.max(0, score),
    percentage: Math.max(0, Math.min(100, percentage)),
    correctCount,
    wrongCount,
    unansweredCount,
  };
}

async function enqueueResultNotifications({
  campaignCode,
  candidateId,
  attemptId,
  resultId,
  parentPhoneE164,
  score,
  percentage,
  placementLabel,
}) {
  if (!parentPhoneE164) return [];
  return Promise.all([
    enqueueNotification({
      campaignCode,
      candidateId,
      attemptId,
      resultId,
      channel: 'SMS',
      templateCode: 'RESULT_READY_SMS',
      recipient: parentPhoneE164,
      payload: {
        score,
        percentage,
        placementLabel,
      },
    }),
  ]);
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
        scope: 'exam_submit_ip',
        identity: getRequestIp(req),
        limitEnv: 'RL_EXAM_SUBMIT_IP_LIMIT',
        windowSecondsEnv: 'RL_EXAM_SUBMIT_IP_WINDOW_SECONDS',
        defaultLimit: 40,
        defaultWindowSeconds: 60,
        requireRedis: true,
        errorCode: 'exam_submit_rate_limited',
        errorMessage: 'Too many exam submission requests. Please retry shortly.',
      });
    }

    await requireExamSession(req, attemptId);

    if (!loadTestMode) {
      await enforceRateLimit(req, res, {
        scope: 'exam_submit_attempt',
        identity: attemptId,
        limitEnv: 'RL_EXAM_SUBMIT_ATTEMPT_LIMIT',
        windowSecondsEnv: 'RL_EXAM_SUBMIT_ATTEMPT_WINDOW_SECONDS',
        defaultLimit: 8,
        defaultWindowSeconds: 5 * 60,
        requireRedis: true,
        errorCode: 'exam_submit_attempt_rate_limited',
        errorMessage: 'This exam session has too many submission retries. Please wait and retry.',
      });
    }

    const submitLock = loadTestMode
      ? null
      : await acquireShortLock({
          scope: 'exam_submit_lock',
          identity: attemptId,
          ttlSeconds: readBoundedIntEnv('EXAM_SUBMIT_LOCK_TTL_SECONDS', 20, 1, 300),
          requireRedis: true,
        });
    if (!loadTestMode && !submitLock?.acquired) {
      throw new HttpError(409, 'A submission is already in progress for this exam.', 'submission_in_progress');
    }

    try {
      if (isBurslulukPackageSubmit(body)) {
        const result = await withTransaction(async (client) => handleBurslulukPackageSubmit({
          client,
          attemptId,
          body,
          loadTestMode,
        }));

        ok(res, {
          result: {
            attempt_id: result.attemptId,
            result_id: result.resultId,
            status: result.status,
            objective_score_80: result.objectiveScore80,
            speaking_status: result.speakingStatus,
            final_score_100: result.finalScore100,
            published_at: result.publishedAt,
            viewed_at: result.viewedAt,
          },
          notifications_enqueued: false,
        });
        return;
      }

      const completionStatus = normalizeSubmissionStatus(body.completionStatus || body.status || 'completed');
      const placementLabel = optionalString(body.placementLabel || body.metrics?.placementLabel, 180);
      const cefrBand = optionalString(body.cefrBand || body.metrics?.cefrBand, 40);
      const durationSeconds = clampMetricInt(body.durationSeconds || body.metrics?.durationSeconds, 0, 60 * 60 * 8, 0);
      const submittedAnswers = normalizeSubmittedAnswers(body.answers);

      const result = await withTransaction(async (client) => {
        const attemptLookup = await client.query(
          loadTestMode
            ? `
                SELECT
                  id,
                  status,
                  question_count,
                  candidate_id,
                  campaign_code,
                  application_id
                FROM exam_attempts
                WHERE id = $1
                LIMIT 1
              `
            : `
                SELECT
                  ea.id,
                  ea.status,
                  ea.question_count,
                  ea.candidate_id,
                  ea.campaign_code,
                  ea.application_id,
                  g.phone_e164 AS parent_phone_e164_legacy,
                  g.phone_e164_enc AS parent_phone_e164_enc
                FROM exam_attempts ea
                JOIN candidates c ON c.id = ea.candidate_id
                LEFT JOIN guardians g ON g.id = c.guardian_id
                WHERE ea.id = $1
                LIMIT 1
              `,
          [attemptId],
        );

        if (attemptLookup.rowCount === 0) {
          throw new HttpError(404, 'Exam attempt was not found.', 'attempt_not_found');
        }

        const attempt = attemptLookup.rows[0];
        const parentPhoneE164 = loadTestMode
          ? null
          : await decryptPii(
              attempt.parent_phone_e164_enc,
              attempt.parent_phone_e164_legacy,
            );

        await upsertAnswersBatch(client, attemptId, submittedAnswers);

        if (loadTestMode) {
          const metrics = normalizeClientMetrics(body.metrics || {}, Number(attempt.question_count || 0));

          await client.query(
            `
              UPDATE exam_attempts
              SET
                status = $2::exam_status,
                submitted_at = NOW(),
                duration_seconds = $3,
                completion_status = $4,
                updated_at = NOW()
              WHERE id = $1
            `,
            [attemptId, completionStatus, durationSeconds || null, body.completionStatus || null],
          );

          const resultUpsert = await client.query(
            `
              INSERT INTO results (
                attempt_id,
                candidate_id,
                campaign_code,
                status,
                score,
                percentage,
                correct_count,
                wrong_count,
                unanswered_count,
                placement_label,
                cefr_band,
                published_at
              )
              VALUES ($1, $2, $3, 'PUBLISHED', $4, $5, $6, $7, $8, $9, $10, NOW())
              ON CONFLICT (attempt_id)
              DO UPDATE
              SET
                status = 'PUBLISHED',
                score = EXCLUDED.score,
                percentage = EXCLUDED.percentage,
                correct_count = EXCLUDED.correct_count,
                wrong_count = EXCLUDED.wrong_count,
                unanswered_count = EXCLUDED.unanswered_count,
                placement_label = EXCLUDED.placement_label,
                cefr_band = EXCLUDED.cefr_band,
                published_at = COALESCE(results.published_at, EXCLUDED.published_at),
                updated_at = NOW()
              RETURNING id, status, score, percentage, placement_label, cefr_band, published_at, viewed_at
            `,
            [
              attemptId,
              attempt.candidate_id,
              attempt.campaign_code,
              metrics.score,
              metrics.percentage,
              metrics.correctCount,
              metrics.wrongCount,
              metrics.unansweredCount,
              placementLabel,
              cefrBand,
            ],
          );

          const savedResult = resultUpsert.rows[0];
          return {
            attemptId,
            resultId: savedResult.id,
            status: savedResult.status,
            score: Number(savedResult.score ?? 0),
            percentage: Number(savedResult.percentage ?? 0),
            placementLabel: savedResult.placement_label,
            cefrBand: savedResult.cefr_band,
            publishedAt: savedResult.published_at,
            viewedAt: savedResult.viewed_at,
            alreadyPublished: false,
            campaignCode: attempt.campaign_code,
            candidateId: attempt.candidate_id,
            parentPhoneE164,
          };
        }

        const existingResult = await client.query(
          `
            SELECT id, status, score, percentage, placement_label, cefr_band, published_at, viewed_at
            FROM results
            WHERE attempt_id = $1
            LIMIT 1
          `,
          [attemptId],
        );

        if (existingResult.rowCount > 0 && ['PUBLISHED', 'VIEWED'].includes(existingResult.rows[0].status)) {
          await client.query(
            `
              UPDATE exam_attempts
              SET
                status = CASE
                  WHEN status IN ('SUBMITTED', 'TIMEOUT', 'ABANDONED') THEN status
                  ELSE $2::exam_status
                END,
                duration_seconds = COALESCE(duration_seconds, $3),
                submitted_at = COALESCE(submitted_at, NOW()),
                updated_at = NOW()
              WHERE id = $1
            `,
            [attemptId, completionStatus, durationSeconds || null],
          );

          return {
            attemptId,
            resultId: existingResult.rows[0].id,
            status: existingResult.rows[0].status,
            score: Number(existingResult.rows[0].score ?? 0),
            percentage: Number(existingResult.rows[0].percentage ?? 0),
            placementLabel: existingResult.rows[0].placement_label,
            cefrBand: existingResult.rows[0].cefr_band,
            publishedAt: existingResult.rows[0].published_at,
            viewedAt: existingResult.rows[0].viewed_at,
            alreadyPublished: true,
            campaignCode: attempt.campaign_code,
            candidateId: attempt.candidate_id,
            parentPhoneE164,
          };
        }

      const metrics = await getComputedMetrics(client, attemptId, Number(attempt.question_count || 0), body.metrics || {});

      await client.query(
        `
          UPDATE exam_attempts
          SET
            status = $2::exam_status,
            submitted_at = NOW(),
            duration_seconds = $3,
            completion_status = $4,
            updated_at = NOW()
          WHERE id = $1
        `,
        [attemptId, completionStatus, durationSeconds || null, body.completionStatus || null],
      );

      const resultUpsert = await client.query(
        `
          INSERT INTO results (
            attempt_id,
            candidate_id,
            campaign_code,
            status,
            score,
            percentage,
            correct_count,
            wrong_count,
            unanswered_count,
            placement_label,
            cefr_band,
            published_at
          )
          VALUES ($1, $2, $3, 'PUBLISHED', $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (attempt_id)
          DO UPDATE
          SET
            status = 'PUBLISHED',
            score = EXCLUDED.score,
            percentage = EXCLUDED.percentage,
            correct_count = EXCLUDED.correct_count,
            wrong_count = EXCLUDED.wrong_count,
            unanswered_count = EXCLUDED.unanswered_count,
            placement_label = EXCLUDED.placement_label,
            cefr_band = EXCLUDED.cefr_band,
            published_at = COALESCE(results.published_at, EXCLUDED.published_at),
            updated_at = NOW()
          RETURNING id, status, score, percentage, placement_label, cefr_band, published_at, viewed_at
        `,
        [
          attemptId,
          attempt.candidate_id,
          attempt.campaign_code,
          metrics.score,
          metrics.percentage,
          metrics.correctCount,
          metrics.wrongCount,
          metrics.unansweredCount,
          placementLabel,
          cefrBand,
        ],
      );

      if (!loadTestMode) {
        await client.query(
          `
            INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
            VALUES ($1, $2, 'EXAM_SUBMITTED', $3::jsonb)
          `,
          [
            attempt.candidate_id,
            attemptId,
            JSON.stringify({
              completionStatus,
              score: metrics.score,
              percentage: metrics.percentage,
            }),
          ],
        );
      }

      const savedResult = resultUpsert.rows[0];
      return {
        attemptId,
        resultId: savedResult.id,
        status: savedResult.status,
        score: Number(savedResult.score ?? 0),
        percentage: Number(savedResult.percentage ?? 0),
        placementLabel: savedResult.placement_label,
        cefrBand: savedResult.cefr_band,
        publishedAt: savedResult.published_at,
        viewedAt: savedResult.viewed_at,
        alreadyPublished: false,
        campaignCode: attempt.campaign_code,
        candidateId: attempt.candidate_id,
        parentPhoneE164,
      };
    });

      if (!loadTestMode && !result.alreadyPublished) {
        await enqueueResultNotifications({
          campaignCode: result.campaignCode,
          candidateId: result.candidateId,
          attemptId: result.attemptId,
          resultId: result.resultId,
          parentPhoneE164: result.parentPhoneE164,
          score: result.score,
          percentage: result.percentage,
          placementLabel: result.placementLabel,
        });
      }

      ok(res, {
        result: {
          attempt_id: result.attemptId,
          result_id: result.resultId,
          status: result.status,
          score: result.score,
          percentage: result.percentage,
          placement_label: result.placementLabel,
          cefr_band: result.cefrBand,
          published_at: result.publishedAt,
          viewed_at: result.viewedAt,
        },
        notifications_enqueued: !loadTestMode && !result.alreadyPublished,
      });
    } finally {
      if (submitLock) {
        await releaseShortLock(submitLock);
      }
    }
  });
}
