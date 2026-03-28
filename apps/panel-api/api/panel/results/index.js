import { requireRole } from '../../_lib/auth.js';
import { ROLES } from '../../_lib/constants.js';
import { query } from '../../_lib/db.js';
import { handleRequest, methodGuard, ok, safeTrim, clampInt } from '../../_lib/http.js';

function normalizeGrade(raw) {
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, Math.min(12, parsed));
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    await requireRole(req, [ROLES.SUPER_ADMIN, ROLES.OPERATIONS]);
    methodGuard(req, ['GET']);

    const page = clampInt(req.query?.page, 1, 1000, 1);
    const perPage = clampInt(req.query?.per_page ?? req.query?.perPage, 1, 200, 50);
    const q = safeTrim(Array.isArray(req.query?.q) ? req.query.q[0] : req.query?.q);
    const grade = normalizeGrade(Array.isArray(req.query?.grade) ? req.query.grade[0] : req.query?.grade);
    const resultStatus = safeTrim(Array.isArray(req.query?.result_status) ? req.query.result_status[0] : req.query?.result_status).toUpperCase();
    const speakingStatus = safeTrim(Array.isArray(req.query?.speaking_status) ? req.query.speaking_status[0] : req.query?.speaking_status).toUpperCase();

    const clauses = [];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      clauses.push(`(c.full_name ILIKE $${params.length} OR COALESCE(s.name, '') ILIKE $${params.length})`);
    }
    if (grade) {
      params.push(grade);
      clauses.push(`c.grade = $${params.length}`);
    }
    if (resultStatus) {
      params.push(resultStatus);
      clauses.push(`r.status = $${params.length}`);
    }
    if (speakingStatus) {
      params.push(speakingStatus);
      clauses.push(`COALESCE(r.speaking_status, 'PENDING') = $${params.length}`);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const offset = (page - 1) * perPage;

    const baseFrom = `
      FROM results r
      JOIN exam_attempts ea ON ea.id = r.attempt_id
      JOIN candidates c ON c.id = r.candidate_id
      LEFT JOIN schools s ON s.id = c.school_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE upload_status = 'UPLOADED')::int AS uploaded_count
        FROM speaking_responses sr
        WHERE sr.attempt_id = ea.id
      ) speaking_counts ON TRUE
    `;

    const [rowsResult, countResult, summaryResult] = await Promise.all([
      query(
        `
          SELECT
            r.attempt_id,
            r.id AS result_id,
            c.id AS candidate_id,
            c.full_name AS student_full_name,
            c.grade,
            s.name AS school_name,
            r.objective_score_80,
            r.speaking_score_20,
            COALESCE(r.speaking_status, 'PENDING') AS speaking_status,
            r.final_score_100,
            r.ranking_group,
            r.ranking_position,
            r.ranking_total,
            r.placement_label,
            r.review_note,
            r.status AS result_status,
            r.published_at,
            r.viewed_at AS result_viewed_at,
            ea.submitted_at,
            COALESCE(speaking_counts.uploaded_count, 0) AS speaking_uploaded_count
          ${baseFrom}
          ${whereSql}
          ORDER BY c.grade ASC, COALESCE(r.final_score_100, -1) DESC, ea.submitted_at ASC NULLS LAST
          LIMIT ${perPage}
          OFFSET ${offset}
        `,
        params,
      ),
      query(
        `
          SELECT COUNT(*)::int AS total
          ${baseFrom}
          ${whereSql}
        `,
        params,
      ),
      query(
        `
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE r.status = 'PUBLISHED')::int AS published,
            COUNT(*) FILTER (WHERE COALESCE(r.speaking_status, 'PENDING') = 'PENDING')::int AS speaking_pending,
            COUNT(*) FILTER (WHERE r.final_score_100 IS NOT NULL)::int AS final_scored
          ${baseFrom}
          ${whereSql}
        `,
        params,
      ),
    ]);

    ok(res, {
      items: rowsResult.rows,
      summary: summaryResult.rows[0] || {
        total: 0,
        published: 0,
        speaking_pending: 0,
        final_scored: 0,
      },
      pagination: {
        page,
        per_page: perPage,
        total: countResult.rows[0]?.total || 0,
      },
    });
  });
}
