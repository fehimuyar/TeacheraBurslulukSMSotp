import { identityHasPermissions, requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { query, withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { enqueueNotification } from '../../_lib/notifications.js';
import { decryptPii } from '../../_lib/piiCrypto.js';
import { loadScholarshipExamFullContent } from '../../_lib/scholarshipExam.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_DISCOUNT_BRACKETS = [
  { min: 95, rate: 100 },
  { min: 90, rate: 75 },
  { min: 80, rate: 50 },
  { min: 70, rate: 35 },
  { min: 60, rate: 20 },
  { min: 0, rate: 10 },
];

function hasOwn(obj, key) {
  return Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key));
}

function normalizeResultIds(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const values = [];
  for (const entry of raw) {
    const value = safeTrim(entry);
    if (!value || !UUID_REGEX.test(value) || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values.slice(0, 1000);
}

function readBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  const normalized = safeTrim(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function readOptionalNumber(body, keys, fieldLabel, min, max) {
  const key = keys.find((item) => hasOwn(body, item));
  if (!key) {
    return {
      provided: false,
      value: null,
    };
  }

  const raw = body[key];
  if (raw === null || raw === undefined || safeTrim(raw) === '') {
    return {
      provided: true,
      value: null,
    };
  }

  const value = Number.parseFloat(String(raw));
  if (!Number.isFinite(value)) {
    throw new HttpError(400, `${fieldLabel} must be a number.`, 'invalid_number');
  }
  if (value < min || value > max) {
    throw new HttpError(400, `${fieldLabel} must be between ${min} and ${max}.`, 'invalid_range');
  }

  return {
    provided: true,
    value: Number(value.toFixed(2)),
  };
}

function readOptionalText(body, keys, maxLength) {
  const key = keys.find((item) => hasOwn(body, item));
  if (!key) {
    return {
      provided: false,
      value: null,
    };
  }

  const raw = safeTrim(body[key]).slice(0, maxLength);
  return {
    provided: true,
    value: raw || null,
  };
}

function normalizeDiscountBrackets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      min: Number(item?.min),
      rate: Number(item?.rate),
    }))
    .filter((item) => Number.isFinite(item.min) && Number.isFinite(item.rate))
    .sort((a, b) => b.min - a.min);
}

function readDiscountBracketsFromEnv() {
  const raw = safeTrim(process.env.BURSLULUK_DISCOUNT_BRACKETS);
  if (!raw) return DEFAULT_DISCOUNT_BRACKETS;
  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeDiscountBrackets(parsed);
    return normalized.length > 0 ? normalized : DEFAULT_DISCOUNT_BRACKETS;
  } catch {
    return DEFAULT_DISCOUNT_BRACKETS;
  }
}

function resolveDiscountRate(percentage) {
  const numeric = Number(percentage);
  if (!Number.isFinite(numeric)) return null;
  const matched = readDiscountBracketsFromEnv().find((item) => numeric >= item.min);
  return matched ? matched.rate : null;
}

function formatScholarshipPlacementLabel(discountRate) {
  const numeric = Number(discountRate);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'Burssuz';
  if (numeric >= 50) return `%${numeric} Burs`;
  return `%${numeric} Indirim`;
}

function readFinalizeRubric(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpError(400, 'rubric is required for finalize action.', 'missing_rubric');
  }

  const latestByQuestionId = new Map();
  for (const entry of raw) {
    const questionId = safeTrim(entry?.questionId).slice(0, 160);
    const score = Number.parseInt(String(entry?.score), 10);
    if (!questionId) {
      throw new HttpError(400, 'rubric.questionId is required.', 'missing_rubric_question_id');
    }
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new HttpError(400, 'rubric.score must be an integer between 0 and 100.', 'invalid_rubric_score');
    }
    latestByQuestionId.set(questionId, {
      questionId,
      score,
    });
  }

  return Array.from(latestByQuestionId.values());
}

function assertActionPermission(identity, permissionCode) {
  if (!identityHasPermissions(identity, [permissionCode])) {
    throw new HttpError(403, 'You do not have the required permission for this action.', 'forbidden_permission');
  }
}

function isMissingResultsHistoryRelation(error) {
  const code = safeTrim(error?.code);
  const message = safeTrim(error?.message).toLowerCase();
  return (
    code === '42P01'
    && (message.includes('panel_result_overrides') || message.includes('panel_result_publications'))
  );
}

async function insertOverrideHistory(client, row, nextValues, identity, reason) {
  try {
    await client.query(
      `
        INSERT INTO panel_result_overrides (
          result_id,
          candidate_id,
          campaign_code,
          reason,
          previous_score,
          previous_percentage,
          previous_placement_label,
          previous_cefr_band,
          new_score,
          new_percentage,
          new_placement_label,
          new_cefr_band,
          created_by,
          created_role
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `,
      [
        row.result_id,
        row.candidate_id,
        row.campaign_code,
        reason,
        row.result_score,
        row.result_percentage,
        row.placement_label,
        row.cefr_band,
        nextValues.score,
        nextValues.percentage,
        nextValues.placement_label,
        nextValues.cefr_band,
        identity.keyId || identity.userId || 'panel_user',
        identity.role || null,
      ],
    );
  } catch (error) {
    if (!isMissingResultsHistoryRelation(error)) {
      throw error;
    }
  }
}

async function insertPublicationHistory(client, row, nextValues, identity, publishMode, enqueueWhatsapp) {
  try {
    await client.query(
      `
        INSERT INTO panel_result_publications (
          result_id,
          candidate_id,
          campaign_code,
          previous_status,
          next_status,
          previous_published_at,
          next_published_at,
          publish_mode,
          enqueue_whatsapp,
          published_by,
          published_role
        )
        VALUES ($1, $2, $3, $4::result_status, $5::result_status, $6, $7, $8, $9, $10, $11)
      `,
      [
        row.result_id,
        row.candidate_id,
        row.campaign_code,
        row.result_status,
        nextValues.result_status,
        row.published_at,
        nextValues.published_at,
        publishMode,
        enqueueWhatsapp,
        identity.keyId || identity.userId || 'panel_user',
        identity.role || null,
      ],
    );
  } catch (error) {
    if (!isMissingResultsHistoryRelation(error)) {
      throw error;
    }
  }
}

async function loadResultsForAction(client, resultIds) {
  const result = await client.query(
    `
      SELECT
        r.id AS result_id,
        r.attempt_id,
        r.candidate_id,
        r.campaign_code,
        r.status AS result_status,
        r.score AS result_score,
        r.percentage AS result_percentage,
        r.placement_label,
        r.cefr_band,
        r.published_at,
        r.viewed_at,
        ses.status AS scholarship_submission_status,
        g.phone_e164 AS parent_phone_e164_legacy,
        g.phone_e164_enc AS parent_phone_e164_enc
      FROM results r
      JOIN candidates c ON c.id = r.candidate_id
      LEFT JOIN guardians g ON g.id = c.guardian_id
      LEFT JOIN scholarship_exam_submissions ses ON ses.attempt_id = r.attempt_id
      WHERE r.id = ANY($1::uuid[])
      FOR UPDATE OF r
    `,
    [resultIds],
  );
  return result.rows;
}

async function loadScholarshipFinalizeTarget(client, resultId) {
  const result = await client.query(
    `
      SELECT
        r.id AS result_id,
        r.attempt_id,
        r.candidate_id,
        r.campaign_code,
        r.status AS result_status,
        ses.status AS submission_status,
        ses.exam_version_key,
        ses.content_grade,
        ses.objective_score,
        ses.objective_percentage,
        ses.objective_correct_count,
        ses.objective_wrong_count,
        ses.objective_unanswered_count,
        ses.speaking_expected_count,
        ses.speaking_uploaded_count,
        ses.speaking_rubric
      FROM results r
      LEFT JOIN scholarship_exam_submissions ses ON ses.attempt_id = r.attempt_id
      WHERE r.id = $1
      LIMIT 1
      FOR UPDATE OF r
    `,
    [resultId],
  );

  return result.rows[0] || null;
}

async function runOverrideAction({ identity, resultIds, patch, reason }) {
  return withTransaction(async (client) => {
    const rows = await loadResultsForAction(client, resultIds);
    if (rows.length === 0) {
      throw new HttpError(404, 'No matching results found.', 'results_not_found');
    }

    const updatedRows = [];
    for (const row of rows) {
      const nextValues = {
        score: patch.score.provided ? patch.score.value : row.result_score,
        percentage: patch.percentage.provided ? patch.percentage.value : row.result_percentage,
        placement_label: patch.placementLabel.provided ? patch.placementLabel.value : row.placement_label,
        cefr_band: patch.cefrBand.provided ? patch.cefrBand.value : row.cefr_band,
      };

      const updateResult = await client.query(
        `
          UPDATE results
          SET
            score = $2,
            percentage = $3,
            placement_label = $4,
            cefr_band = $5,
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id AS result_id,
            attempt_id,
            candidate_id,
            campaign_code,
            status AS result_status,
            score AS result_score,
            percentage AS result_percentage,
            placement_label,
            cefr_band,
            published_at,
            viewed_at,
            updated_at
        `,
        [
          row.result_id,
          nextValues.score,
          nextValues.percentage,
          nextValues.placement_label,
          nextValues.cefr_band,
        ],
      );

      await insertOverrideHistory(client, row, nextValues, identity, reason);

      await client.query(
        `
          INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
          VALUES ($1, $2, 'RESULT_OVERRIDE', $3::jsonb)
        `,
        [
          row.candidate_id,
          row.attempt_id,
          JSON.stringify({
            resultId: row.result_id,
            reason,
            previous: {
              score: row.result_score,
              percentage: row.result_percentage,
              placement_label: row.placement_label,
              cefr_band: row.cefr_band,
            },
            next: nextValues,
          }),
        ],
      );

      updatedRows.push(updateResult.rows[0]);
    }

    return updatedRows;
  });
}

async function runPublishAction({ identity, resultIds, forceRepublish, enqueueWhatsapp }) {
  return withTransaction(async (client) => {
    const rows = await loadResultsForAction(client, resultIds);
    if (rows.length === 0) {
      throw new HttpError(404, 'No matching results found.', 'results_not_found');
    }

    const updatedRows = [];
    for (const row of rows) {
      const previouslyPublished = Boolean(row.published_at);
      if (
        row.scholarship_submission_status
        && safeTrim(row.scholarship_submission_status).toUpperCase() !== 'FINALIZED'
        && !previouslyPublished
      ) {
        throw new HttpError(
          409,
          'Scholarship result must be finalized before publish.',
          'scholarship_result_not_finalized',
          {
            result_id: row.result_id,
            scholarship_submission_status: row.scholarship_submission_status,
          },
        );
      }
      const publishMode = previouslyPublished ? 'REPUBLISH' : 'PUBLISH';
      const shouldMovePublishedAt = !previouslyPublished || forceRepublish;

      let nextRow = {
        ...row,
      };
      if (shouldMovePublishedAt || row.result_status === 'NOT_READY') {
        const updateResult = await client.query(
          `
            UPDATE results
            SET
              status = CASE WHEN viewed_at IS NOT NULL THEN 'VIEWED'::result_status ELSE 'PUBLISHED'::result_status END,
              published_at = CASE
                WHEN published_at IS NULL OR $2::boolean THEN NOW()
                ELSE published_at
              END,
              updated_at = NOW()
            WHERE id = $1
            RETURNING
              id AS result_id,
              attempt_id,
              candidate_id,
              campaign_code,
              status AS result_status,
              score AS result_score,
              percentage AS result_percentage,
              placement_label,
              cefr_band,
              published_at,
              viewed_at,
              updated_at
          `,
          [row.result_id, forceRepublish],
        );
        nextRow = {
          ...row,
          ...updateResult.rows[0],
        };
      }

      await insertPublicationHistory(client, row, nextRow, identity, publishMode, enqueueWhatsapp);

      await client.query(
        `
          INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
          VALUES ($1, $2, 'RESULT_PUBLISH', $3::jsonb)
        `,
        [
          row.candidate_id,
          row.attempt_id,
          JSON.stringify({
            resultId: row.result_id,
            mode: publishMode,
            forceRepublish,
            enqueueWhatsapp,
            previous: {
              status: row.result_status,
              published_at: row.published_at,
            },
            next: {
              status: nextRow.result_status,
              published_at: nextRow.published_at,
            },
          }),
        ],
      );

      updatedRows.push({
        ...nextRow,
        publish_mode: publishMode,
        previously_published: previouslyPublished,
        should_notify: !previouslyPublished || forceRepublish,
      });
    }

    return updatedRows;
  });
}

async function runFinalizeAction({ identity, resultId, rubric }) {
  return withTransaction(async (client) => {
    const row = await loadScholarshipFinalizeTarget(client, resultId);
    if (!row) {
      throw new HttpError(404, 'No matching result found.', 'result_not_found');
    }
    if (!row.submission_status) {
      throw new HttpError(409, 'This result does not have a scholarship submission to finalize.', 'scholarship_submission_not_found');
    }
    if (['PUBLISHED', 'VIEWED'].includes(safeTrim(row.result_status).toUpperCase())) {
      throw new HttpError(409, 'Published results cannot be re-finalized from rubric flow.', 'result_already_published');
    }

    const content = loadScholarshipExamFullContent({
      examVersionKey: row.exam_version_key,
      grade: row.content_grade,
    });
    if (!content) {
      throw new HttpError(503, 'Scholarship exam content is not available on the server.', 'scholarship_exam_content_missing');
    }

    const speakingQuestions = Array.isArray(content.questions)
      ? content.questions.filter((question) => question?.type === 'speaking')
      : [];
    if (speakingQuestions.length === 0) {
      throw new HttpError(409, 'Scholarship exam content has no speaking prompts to finalize.', 'speaking_questions_missing');
    }

    const rubricByQuestionId = new Map(rubric.map((item) => [item.questionId, item]));
    const missingQuestionIds = speakingQuestions
      .map((question) => question.id)
      .filter((questionId) => !rubricByQuestionId.has(questionId));
    if (missingQuestionIds.length > 0) {
      throw new HttpError(400, 'Rubric must include every speaking question.', 'rubric_incomplete', {
        missing_question_ids: missingQuestionIds,
      });
    }

    let speakingRawScore = 0;
    let speakingRawMax = 0;
    const normalizedRubric = speakingQuestions.map((question) => {
      const rubricItem = rubricByQuestionId.get(question.id);
      const score = Number(rubricItem?.score ?? 0);
      const maxScore = Number(question.rubricMaxScore || 0);
      if (!Number.isFinite(score) || score < 0 || score > maxScore) {
        throw new HttpError(
          400,
          `Rubric score for ${question.id} must be between 0 and ${maxScore}.`,
          'rubric_score_out_of_range',
          {
            question_id: question.id,
            max_score: maxScore,
            received_score: score,
          },
        );
      }
      speakingRawScore += score;
      speakingRawMax += maxScore;
      return {
        questionId: question.id,
        score,
        maxScore,
      };
    });

    const totalSpeakingPoints = Number(content?.scoring?.speaking?.totalPoints || speakingRawMax || 0);
    const speakingScore = speakingRawMax > 0
      ? Number(((speakingRawScore / speakingRawMax) * totalSpeakingPoints).toFixed(2))
      : 0;
    const objectiveScore = Number(row.objective_score || 0);
    const objectivePercentage = Number(row.objective_percentage || 0);
    const finalScore = Number(Math.max(0, Math.min(100, objectiveScore + speakingScore)).toFixed(2));
    const discountRate = resolveDiscountRate(finalScore);
    const placementLabel = formatScholarshipPlacementLabel(discountRate);
    const cefrBand = null;

    await client.query(
      `
        UPDATE scholarship_exam_submissions
        SET
          status = 'FINALIZED',
          speaking_rubric = $2::jsonb,
          speaking_score = $3,
          final_score = $4,
          placement_label = $5,
          cefr_band = $6,
          finalized_at = NOW(),
          finalized_by = $7,
          finalized_role = $8,
          updated_at = NOW()
        WHERE attempt_id = $1
      `,
      [
        row.attempt_id,
        JSON.stringify(normalizedRubric),
        speakingScore,
        finalScore,
        placementLabel,
        cefrBand,
        identity.keyId || identity.userId || 'panel_user',
        identity.role || null,
      ],
    );

    const resultUpdate = await client.query(
      `
        UPDATE results
        SET
          status = 'NOT_READY',
          score = $2,
          percentage = $3,
          correct_count = $4,
          wrong_count = $5,
          unanswered_count = $6,
          placement_label = $7,
          cefr_band = $8,
          published_at = NULL,
          viewed_at = NULL,
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id AS result_id,
          attempt_id,
          candidate_id,
          campaign_code,
          status AS result_status,
          score AS result_score,
          percentage AS result_percentage,
          placement_label,
          cefr_band,
          published_at,
          viewed_at,
          updated_at
      `,
      [
        resultId,
        finalScore,
        finalScore,
        Number(row.objective_correct_count || 0),
        Number(row.objective_wrong_count || 0),
        Number(row.objective_unanswered_count || 0),
        placementLabel,
        cefrBand,
      ],
    );

    await client.query(
      `
        INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
        VALUES ($1, $2, 'RESULT_FINALIZE', $3::jsonb)
      `,
      [
        row.candidate_id,
        row.attempt_id,
        JSON.stringify({
          resultId,
          contract: 'scholarship_exam_v1',
          objective_score: objectiveScore,
          objective_percentage: objectivePercentage,
          speaking_score: speakingScore,
          final_score: finalScore,
          placement_label: placementLabel,
          speaking_uploaded_count: Number(row.speaking_uploaded_count || 0),
          speaking_expected_count: Number(row.speaking_expected_count || 0),
          rubric: normalizedRubric,
        }),
      ],
    );

    return {
      ...resultUpdate.rows[0],
      scholarship_submission_status: 'FINALIZED',
      objective_score: objectiveScore,
      objective_percentage: objectivePercentage,
      speaking_score: speakingScore,
      final_score: finalScore,
      speaking_uploaded_count: Number(row.speaking_uploaded_count || 0),
      speaking_expected_count: Number(row.speaking_expected_count || 0),
      speaking_rubric: normalizedRubric,
    };
  });
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);
    const identity = await requireRole(req, [ROLES.SUPER_ADMIN, ROLES.OPERATIONS]);

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const action = safeTrim(body.action).toLowerCase();
    if (!['override', 'publish', 'finalize'].includes(action)) {
      throw new HttpError(400, 'Unsupported action.', 'invalid_action');
    }

    const resultIds = normalizeResultIds(body.result_ids || body.resultIds);
    if (resultIds.length === 0) {
      throw new HttpError(400, 'resultIds is required.', 'missing_result_ids');
    }

    if (action === 'override') {
      assertActionPermission(identity, 'PANEL_RESULTS_OVERRIDE');
      const reason = safeTrim(body.reason).slice(0, 1000);
      if (!reason) {
        throw new HttpError(400, 'reason is required for override action.', 'missing_reason');
      }

      const patch = {
        score: readOptionalNumber(body, ['score', 'result_score', 'resultScore'], 'score', 0, 100),
        percentage: readOptionalNumber(body, ['percentage', 'result_percentage', 'resultPercentage'], 'percentage', 0, 100),
        placementLabel: readOptionalText(body, ['placement_label', 'placementLabel'], 120),
        cefrBand: readOptionalText(body, ['cefr_band', 'cefrBand'], 40),
      };

      if (!patch.score.provided && !patch.percentage.provided && !patch.placementLabel.provided && !patch.cefrBand.provided) {
        throw new HttpError(400, 'At least one override field is required.', 'missing_override_fields');
      }

      const updatedRows = await runOverrideAction({
        identity,
        resultIds,
        patch,
        reason,
      });

      ok(res, {
        action: 'override',
        requested: resultIds.length,
        updated: updatedRows.length,
        items: updatedRows,
      });

      const ctx = readRequestContext(req);
      await appendAuditLog({
        ...buildPanelActor(identity),
        action: 'PANEL_RESULTS_OVERRIDE',
        targetType: 'RESULT_BATCH',
        targetId: String(updatedRows.length),
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: {
          resultIds: updatedRows.map((item) => item.result_id),
          reasonLength: reason.length,
          fields: {
            score: patch.score.provided,
            percentage: patch.percentage.provided,
            placement_label: patch.placementLabel.provided,
            cefr_band: patch.cefrBand.provided,
          },
        },
      });
      return;
    }

    if (action === 'finalize') {
      assertActionPermission(identity, 'PANEL_RESULTS_OVERRIDE');
      if (resultIds.length !== 1) {
        throw new HttpError(400, 'Finalize action requires exactly one result id.', 'invalid_finalize_batch_size');
      }

      const rubric = readFinalizeRubric(body.rubric);
      const finalized = await runFinalizeAction({
        identity,
        resultId: resultIds[0],
        rubric,
      });

      ok(res, {
        action: 'finalize',
        requested: 1,
        finalized: 1,
        item: finalized,
      });

      const ctx = readRequestContext(req);
      await appendAuditLog({
        ...buildPanelActor(identity),
        action: 'PANEL_RESULTS_FINALIZE',
        targetType: 'RESULT',
        targetId: resultIds[0],
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: {
          resultId: resultIds[0],
          rubricCount: rubric.length,
        },
      });
      return;
    }

    assertActionPermission(identity, 'PANEL_RESULTS_PUBLISH');

    const enqueueWhatsapp = readBoolean(body.enqueue_whatsapp ?? body.enqueueWhatsapp, true);
    const forceRepublish = readBoolean(body.force_republish ?? body.forceRepublish, false);

    const publishedRows = await runPublishAction({
      identity,
      resultIds,
      forceRepublish,
      enqueueWhatsapp,
    });

    const notifyTargets = publishedRows.filter((item) => item.should_notify);
    const smsJobIds = [];
    let skippedNoRecipient = 0;

    for (const row of notifyTargets) {
      const recipient = await decryptPii(row.parent_phone_e164_enc, row.parent_phone_e164_legacy);
      if (!recipient) {
        skippedNoRecipient += 1;
        continue;
      }
      const enqueued = await enqueueNotification({
        campaignCode: row.campaign_code,
        candidateId: row.candidate_id,
        attemptId: row.attempt_id,
        resultId: row.result_id,
        channel: 'SMS',
        templateCode: 'RESULT',
        recipient,
        payload: {
          trigger: 'panel_result_publish_sms',
          mode: row.publish_mode,
          force_republish: forceRepublish,
          enable_whatsapp_fallback: enqueueWhatsapp,
        },
      });
      smsJobIds.push(enqueued.jobId);
    }

    ok(res, {
      action: 'publish',
      requested: resultIds.length,
      published: publishedRows.length,
      notifications_enqueued: smsJobIds.length,
      sms_notifications_enqueued: smsJobIds.length,
      whatsapp_fallback_enabled: enqueueWhatsapp,
      notifications_skipped_no_recipient: skippedNoRecipient,
      result_ids: publishedRows.map((item) => item.result_id),
      job_ids: smsJobIds,
    });

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_RESULTS_PUBLISH',
      targetType: 'RESULT_BATCH',
      targetId: String(publishedRows.length),
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        resultIds: publishedRows.map((item) => item.result_id),
        enqueueWhatsapp,
        forceRepublish,
        smsNotificationsEnqueued: smsJobIds.length,
        notificationsSkippedNoRecipient: skippedNoRecipient,
      },
    });
  });
}
