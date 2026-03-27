import { requireRole } from '../../_lib/auth.js';
import { query } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, safeTrim } from '../../_lib/http.js';
import {
  decryptPii,
  isPrivilegedPiiRole,
  maskPiiName,
  maskPiiPhone,
} from '../../_lib/piiCrypto.js';
import {
  loadScholarshipExamPublicContent,
  SCHOLARSHIP_EXAM_CONTENT_ROOT,
} from '../../_lib/scholarshipExam.js';

function readJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function resolveVisualUrl(contentGrade, visualAsset) {
  const normalizedGrade = safeTrim(contentGrade);
  const normalizedAsset = safeTrim(visualAsset);
  if (!normalizedGrade || !normalizedAsset) return null;
  return `${SCHOLARSHIP_EXAM_CONTENT_ROOT}/${normalizedGrade}/${normalizedAsset}`;
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);

    const identity = await requireRole(
      req,
      ['SUPER_ADMIN', 'OPERATIONS', 'READ_ONLY'],
      ['PANEL_RESULTS_REVIEW'],
    );

    const resultId = safeTrim(Array.isArray(req.query?.resultId) ? req.query.resultId[0] : req.query?.resultId);
    if (!resultId) {
      throw new HttpError(400, 'resultId is required.', 'missing_result_id');
    }

    const detailResult = await query(
      `
        SELECT
          r.id AS result_id,
          r.attempt_id,
          r.candidate_id,
          r.campaign_code,
          r.status AS result_status,
          r.score AS result_score,
          r.percentage AS result_percentage,
          r.correct_count,
          r.wrong_count,
          r.unanswered_count,
          r.placement_label,
          r.cefr_band,
          r.published_at,
          r.viewed_at,
          r.updated_at,
          ea.exam_language,
          ea.exam_age_range,
          c.grade,
          c.full_name AS student_full_name_legacy,
          c.full_name_enc AS student_full_name_enc,
          g.full_name AS parent_full_name_legacy,
          g.full_name_enc AS parent_full_name_enc,
          g.phone_e164 AS parent_phone_e164_legacy,
          g.phone_e164_enc AS parent_phone_e164_enc,
          s.name AS school_name,
          a.application_no,
          ses.status AS scholarship_submission_status,
          ses.exam_version_key,
          ses.content_grade,
          ses.objective_score,
          ses.objective_percentage,
          ses.objective_question_count,
          ses.objective_answered_count,
          ses.objective_correct_count,
          ses.objective_wrong_count,
          ses.objective_unanswered_count,
          ses.speaking_expected_count,
          ses.speaking_uploaded_count,
          ses.speaking_score,
          ses.final_score,
          ses.speaking_responses,
          ses.speaking_rubric,
          ses.submitted_at,
          ses.finalized_at
        FROM results r
        JOIN exam_attempts ea ON ea.id = r.attempt_id
        JOIN candidates c ON c.id = r.candidate_id
        LEFT JOIN schools s ON s.id = c.school_id
        LEFT JOIN guardians g ON g.id = c.guardian_id
        LEFT JOIN LATERAL (
          SELECT application_no
          FROM applications
          WHERE candidate_id = c.id
          ORDER BY created_at DESC
          LIMIT 1
        ) a ON TRUE
        LEFT JOIN scholarship_exam_submissions ses ON ses.attempt_id = r.attempt_id
        WHERE r.id = $1
        LIMIT 1
      `,
      [resultId],
    );

    if (detailResult.rowCount === 0) {
      throw new HttpError(404, 'Result was not found.', 'result_not_found');
    }

    const row = detailResult.rows[0];
    if (!row.scholarship_submission_status) {
      throw new HttpError(404, 'Scholarship review detail was not found for this result.', 'scholarship_detail_not_found');
    }

    const content = loadScholarshipExamPublicContent({
      examVersionKey: row.exam_version_key,
      grade: row.content_grade,
    });
    if (!content) {
      throw new HttpError(503, 'Scholarship exam content is not available on the server.', 'scholarship_exam_content_missing');
    }

    const submittedResponses = readJsonArray(row.speaking_responses);
    const rubricItems = readJsonArray(row.speaking_rubric);
    const responseIds = submittedResponses
      .map((item) => safeTrim(item?.responseId))
      .filter(Boolean);

    const responseLookup = responseIds.length > 0
      ? await query(
          `
            SELECT
              response_id::text AS response_id,
              question_id,
              storage_key,
              mime_type,
              byte_size,
              duration_seconds,
              status,
              uploaded_at,
              completed_at
            FROM exam_speaking_responses
            WHERE attempt_id = $1
              AND response_id = ANY($2::uuid[])
          `,
          [row.attempt_id, responseIds],
        )
      : { rows: [] };

    const responseById = new Map(responseLookup.rows.map((item) => [item.response_id, item]));
    const submittedResponseByQuestionId = new Map(
      submittedResponses.map((item) => [safeTrim(item?.questionId), item]),
    );
    const rubricByQuestionId = new Map(
      rubricItems.map((item) => [safeTrim(item?.questionId), Number(item?.score ?? 0)]),
    );

    const speakingQuestions = Array.isArray(content.questions)
      ? content.questions.filter((question) => question?.type === 'speaking')
      : [];

    const piiScopeFull = isPrivilegedPiiRole(identity.role);
    const [studentFullNameRaw, parentFullNameRaw, parentPhoneRaw] = await Promise.all([
      decryptPii(row.student_full_name_enc, row.student_full_name_legacy),
      decryptPii(row.parent_full_name_enc, row.parent_full_name_legacy),
      decryptPii(row.parent_phone_e164_enc, row.parent_phone_e164_legacy),
    ]);

    ok(res, {
      result: {
        result_id: row.result_id,
        attempt_id: row.attempt_id,
        candidate_id: row.candidate_id,
        campaign_code: row.campaign_code,
        application_no: row.application_no || null,
        student_full_name: piiScopeFull ? studentFullNameRaw : maskPiiName(studentFullNameRaw),
        parent_full_name: piiScopeFull ? parentFullNameRaw : maskPiiName(parentFullNameRaw),
        parent_phone_e164: piiScopeFull ? parentPhoneRaw : maskPiiPhone(parentPhoneRaw),
        grade: row.grade,
        school_name: row.school_name || null,
        result_status: row.result_status,
        result_score: row.result_score,
        result_percentage: row.result_percentage,
        correct_count: row.correct_count,
        wrong_count: row.wrong_count,
        unanswered_count: row.unanswered_count,
        placement_label: row.placement_label,
        cefr_band: row.cefr_band,
        published_at: row.published_at,
        viewed_at: row.viewed_at,
        updated_at: row.updated_at,
        exam_language: row.exam_language,
        exam_age_range: row.exam_age_range,
      },
      scholarship: {
        submission_status: row.scholarship_submission_status,
        exam_version_key: row.exam_version_key,
        content_grade: row.content_grade,
        objective_score: Number(row.objective_score || 0),
        objective_percentage: Number(row.objective_percentage || 0),
        objective_question_count: Number(row.objective_question_count || 0),
        objective_answered_count: Number(row.objective_answered_count || 0),
        objective_correct_count: Number(row.objective_correct_count || 0),
        objective_wrong_count: Number(row.objective_wrong_count || 0),
        objective_unanswered_count: Number(row.objective_unanswered_count || 0),
        speaking_expected_count: Number(row.speaking_expected_count || 0),
        speaking_uploaded_count: Number(row.speaking_uploaded_count || 0),
        speaking_score: row.speaking_score === null ? null : Number(row.speaking_score),
        final_score: row.final_score === null ? null : Number(row.final_score),
        submitted_at: row.submitted_at,
        finalized_at: row.finalized_at,
        speaking_rubric: rubricItems,
      },
      speaking_questions: speakingQuestions.map((question) => {
        const submittedResponse = submittedResponseByQuestionId.get(question.id);
        const responseRow = submittedResponse ? responseById.get(safeTrim(submittedResponse.responseId)) : null;

        return {
          question_id: question.id,
          question_no: question.questionNo,
          prompt: question.prompt,
          visual_asset: question.visualAsset || null,
          visual_url: resolveVisualUrl(row.content_grade, question.visualAsset),
          max_duration_seconds: Number(question.maxDurationSeconds || 0),
          rubric_max_score: Number(question.rubricMaxScore || 0),
          rubric_score: rubricByQuestionId.has(question.id) ? Number(rubricByQuestionId.get(question.id)) : null,
          response: responseRow
            ? {
                response_id: responseRow.response_id,
                storage_key: responseRow.storage_key,
                mime_type: responseRow.mime_type,
                byte_size: Number(responseRow.byte_size || 0),
                duration_seconds: responseRow.duration_seconds === null ? null : Number(responseRow.duration_seconds),
                status: responseRow.status,
                uploaded_at: responseRow.uploaded_at,
                completed_at: responseRow.completed_at,
                audio_url: `/api/panel/results/${encodeURIComponent(resultId)}/speaking/${encodeURIComponent(responseRow.response_id)}`,
              }
            : null,
        };
      }),
    });
  });
}
