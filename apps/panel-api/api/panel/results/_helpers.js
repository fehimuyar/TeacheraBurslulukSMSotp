import {
  computeFinalScore100,
  computeRankingTable,
  normalizeSpeakingScore20,
} from '../../_lib/burslulukExam.js';
import { HttpError } from '../../_lib/errors.js';
import { safeTrim } from '../../_lib/http.js';

function normalizeAttemptId(value) {
  return safeTrim(value);
}

export function normalizeAttemptIds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizeAttemptId(item))
    .filter(Boolean)
    .slice(0, 1000);
}

export function normalizeOptionalText(value, maxLength = 2000) {
  const trimmed = safeTrim(value);
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export function parseSpeakingImportItems(body) {
  if (Array.isArray(body?.items)) {
    return body.items
      .map((item) => ({
        attemptId: normalizeAttemptId(item?.attemptId ?? item?.attempt_id),
        speakingScore20: item?.speakingScore20 ?? item?.speaking_score_20,
        reviewNote: normalizeOptionalText(item?.reviewNote ?? item?.review_note),
      }))
      .filter((item) => item.attemptId);
  }

  const csvText = String(body?.csvText || body?.csv || '').trim();
  if (!csvText) return [];

  const lines = csvText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return [];

  const header = lines[0].split(',').map((cell) => safeTrim(cell).toLowerCase());
  const attemptIndex = header.findIndex((cell) => ['attemptid', 'attempt_id'].includes(cell));
  const scoreIndex = header.findIndex((cell) => ['speakingscore20', 'speaking_score_20'].includes(cell));
  const noteIndex = header.findIndex((cell) => ['reviewnote', 'review_note'].includes(cell));

  if (attemptIndex < 0 || scoreIndex < 0) {
    throw new HttpError(400, 'CSV must include attempt_id and speaking_score_20 columns.', 'invalid_csv_columns');
  }

  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((cell) => cell.trim());
    return {
      attemptId: normalizeAttemptId(cells[attemptIndex]),
      speakingScore20: cells[scoreIndex],
      reviewNote: noteIndex >= 0 ? normalizeOptionalText(cells[noteIndex]) : null,
    };
  }).filter((item) => item.attemptId);
}

export async function loadPanelResultDetail(client, attemptId) {
  const detail = await client.query(
    `
      SELECT
        r.id AS result_id,
        r.attempt_id,
        r.status AS result_status,
        r.objective_score_80,
        r.speaking_score_20,
        r.speaking_status,
        r.final_score_100,
        r.ranking_group,
        r.ranking_position,
        r.ranking_total,
        r.placement_label,
        r.review_note,
        r.published_at,
        r.viewed_at,
        c.id AS candidate_id,
        c.full_name AS student_full_name,
        c.grade,
        s.name AS school_name,
        ea.submitted_at,
        speaking_counts.uploaded_count,
        speaking_counts.total_count,
        speaking_rows.items AS speaking_items
      FROM results r
      JOIN exam_attempts ea ON ea.id = r.attempt_id
      JOIN candidates c ON c.id = r.candidate_id
      LEFT JOIN schools s ON s.id = c.school_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE upload_status = 'UPLOADED')::int AS uploaded_count,
          COUNT(*)::int AS total_count
        FROM speaking_responses sr
        WHERE sr.attempt_id = ea.id
      ) speaking_counts ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'response_id', sr.response_id,
              'question_id', sr.question_id,
              'storage_key', sr.storage_key,
              'mime_type', sr.mime_type,
              'byte_size', sr.byte_size,
              'duration_seconds', sr.duration_seconds,
              'upload_status', sr.upload_status,
              'created_at', sr.created_at,
              'updated_at', sr.updated_at
            )
            ORDER BY sr.created_at DESC
          ),
          '[]'::json
        ) AS items
        FROM speaking_responses sr
        WHERE sr.attempt_id = ea.id
      ) speaking_rows ON TRUE
      WHERE r.attempt_id = $1
      LIMIT 1
    `,
    [attemptId],
  );

  if (detail.rowCount === 0) {
    throw new HttpError(404, 'Result was not found.', 'result_not_found');
  }

  return detail.rows[0];
}

export async function recalculateRankingsForGrade(client, grade) {
  const rows = await client.query(
    `
      SELECT
        r.attempt_id,
        c.grade,
        r.objective_score_80,
        r.speaking_score_20,
        r.final_score_100,
        ea.submitted_at
      FROM results r
      JOIN exam_attempts ea ON ea.id = r.attempt_id
      JOIN candidates c ON c.id = r.candidate_id
      WHERE c.grade = $1
        AND r.final_score_100 IS NOT NULL
    `,
    [grade],
  );

  await client.query(
    `
      UPDATE results r
      SET
        ranking_group = NULL,
        ranking_position = NULL,
        ranking_total = NULL,
        placement_label = CASE
          WHEN r.status IN ('PUBLISHED', 'VIEWED') THEN r.placement_label
          ELSE NULL
        END,
        updated_at = NOW()
      FROM exam_attempts ea
      JOIN candidates c ON c.id = ea.candidate_id
      WHERE r.attempt_id = ea.id
        AND c.grade = $1
    `,
    [grade],
  );

  if (rows.rowCount === 0) return [];

  const rankingRows = computeRankingTable(
    rows.rows.map((row) => ({
      attemptId: row.attempt_id,
      grade: row.grade,
      objectiveScore80: row.objective_score_80,
      speakingScore20: row.speaking_score_20,
      finalScore100: row.final_score_100,
      submittedAt: row.submitted_at,
    })),
  );

  await client.query(
    `
      UPDATE results r
      SET
        ranking_group = payload.ranking_group,
        ranking_position = payload.ranking_position,
        ranking_total = payload.ranking_total,
        placement_label = payload.placement_label,
        updated_at = NOW()
      FROM jsonb_to_recordset($1::jsonb) AS payload(
        attempt_id UUID,
        ranking_group TEXT,
        ranking_position INTEGER,
        ranking_total INTEGER,
        placement_label TEXT
      )
      WHERE r.attempt_id = payload.attempt_id
    `,
    [
      JSON.stringify(
        rankingRows.map((row) => ({
          attempt_id: row.attemptId,
          ranking_group: row.rankingGroup,
          ranking_position: row.rankingPosition,
          ranking_total: row.rankingTotal,
          placement_label: row.placementLabel,
        })),
      ),
    ],
  );

  return rankingRows;
}

export async function applySpeakingScore(client, { attemptId, speakingScore20, reviewNote }) {
  const current = await client.query(
    `
      SELECT
        r.attempt_id,
        r.objective_score_80,
        r.review_note,
        c.grade
      FROM results r
      JOIN exam_attempts ea ON ea.id = r.attempt_id
      JOIN candidates c ON c.id = ea.candidate_id
      WHERE r.attempt_id = $1
      LIMIT 1
    `,
    [attemptId],
  );

  if (current.rowCount === 0) {
    throw new HttpError(404, 'Result was not found.', 'result_not_found');
  }

  const row = current.rows[0];
  if (row.objective_score_80 == null) {
    throw new HttpError(409, 'Objective score is not ready for this attempt.', 'objective_score_missing');
  }

  const normalizedSpeakingScore20 = normalizeSpeakingScore20(speakingScore20);
  const finalScore100 = computeFinalScore100(row.objective_score_80, normalizedSpeakingScore20);

  await client.query(
    `
      UPDATE results
      SET
        speaking_score_20 = $2,
        speaking_status = 'SCORED',
        final_score_100 = $3,
        review_note = COALESCE($4, review_note),
        updated_at = NOW()
      WHERE attempt_id = $1
    `,
    [attemptId, normalizedSpeakingScore20, finalScore100, reviewNote],
  );

  await recalculateRankingsForGrade(client, row.grade);
  return loadPanelResultDetail(client, attemptId);
}
