// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { RESULT_STATUS, ROLES } from '../../_lib/constants.js';
import { query } from '../../_lib/db.js';
import { buildListResponse } from '../../_lib/listResponse.js';
import { decryptPii, isPrivilegedPiiRole, maskPiiName, maskPiiPhone } from '../../_lib/piiCrypto.js';
import {
  handleRequest,
  methodGuard,
  normalizeArrayFilter,
  ok,
  parseDateRange,
  parseListQuery,
  safeTrim,
} from '../../_lib/http.js';
import { buildWhereClause, toSqlOrder } from '../../_lib/sql.js';

const RESULT_REVIEW_COLUMNS = [
  'result_id',
  'attempt_id',
  'candidate_id',
  'campaign_code',
  'application_no',
  'student_full_name',
  'grade',
  'school_name',
  'result_status',
  'result_score',
  'result_percentage',
  'placement_label',
  'cefr_band',
  'published_at',
  'viewed_at',
  'override_count',
  'last_override_at',
  'updated_at',
];

const SORT_COLUMN_MAP = {
  result_id: 'result_id',
  attempt_id: 'attempt_id',
  candidate_id: 'candidate_id',
  campaign_code: 'campaign_code',
  application_no: 'application_no',
  student_full_name: 'student_full_name',
  grade: 'grade',
  school_name: 'school_name',
  result_status: 'result_status',
  result_score: 'result_score',
  result_percentage: 'result_percentage',
  placement_label: 'placement_label',
  cefr_band: 'cefr_band',
  published_at: 'published_at',
  viewed_at: 'viewed_at',
  override_count: 'override_count',
  last_override_at: 'last_override_at',
  updated_at: 'updated_at',
};

function appendInFilter(clauses, params, column, values) {
  if (!values || values.length === 0) return;
  params.push(values);
  clauses.push(`${column} = ANY($${params.length})`);
}

function addDateRangeFilter(clauses, params, column, range) {
  if (range.from) {
    params.push(range.from);
    clauses.push(`${column} >= $${params.length}::timestamptz`);
  }
  if (range.to) {
    params.push(range.to);
    clauses.push(`${column} <= $${params.length}::timestamptz`);
  }
}

function buildFilters(listQuery) {
  const { q, filters } = listQuery;
  const params = [];
  const clauses = [];

  const campaignCode = safeTrim(filters.campaign_code || filters.campaignCode);
  if (campaignCode) {
    params.push(campaignCode);
    clauses.push(`campaign_code = $${params.length}`);
  }

  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    clauses.push(
      `(LOWER(student_full_name) LIKE $${params.length} OR LOWER(parent_full_name) LIKE $${params.length} OR LOWER(parent_phone_e164) LIKE $${params.length} OR LOWER(application_no) LIKE $${params.length})`,
    );
  }

  const schoolQuery = safeTrim(filters.school_query || filters.schoolQuery);
  if (schoolQuery) {
    params.push(`%${schoolQuery.toLowerCase()}%`);
    clauses.push(`LOWER(school_name) LIKE $${params.length}`);
  }

  const grades = normalizeArrayFilter(filters.grade || filters.grades)
    .map((item) => Number.parseInt(item, 10))
    .filter(Number.isFinite);
  appendInFilter(clauses, params, 'grade', grades);

  appendInFilter(clauses, params, 'result_status', normalizeArrayFilter(filters.result_status, RESULT_STATUS));

  const viewedStatus = normalizeArrayFilter(
    filters.viewed_status || filters.viewedStatus || filters.result_viewed_status,
    ['VIEWED', 'NOT_VIEWED'],
  );
  if (viewedStatus.length === 1) {
    clauses.push(viewedStatus[0] === 'VIEWED' ? 'viewed_at IS NOT NULL' : 'viewed_at IS NULL');
  }

  const publishStatus = normalizeArrayFilter(
    filters.publish_status || filters.publishStatus,
    ['PUBLISHED', 'NOT_PUBLISHED'],
  );
  if (publishStatus.length === 1) {
    clauses.push(publishStatus[0] === 'PUBLISHED' ? 'published_at IS NOT NULL' : 'published_at IS NULL');
  }

  const overrideStatus = normalizeArrayFilter(
    filters.override_status || filters.overrideStatus,
    ['OVERRIDDEN', 'NOT_OVERRIDDEN'],
  );
  if (overrideStatus.length === 1) {
    clauses.push(overrideStatus[0] === 'OVERRIDDEN' ? 'override_count > 0' : 'override_count = 0');
  }

  addDateRangeFilter(clauses, params, 'published_at', parseDateRange(filters));
  return { whereClause: buildWhereClause(clauses), params };
}

function buildResultRowsCte(includeOverrideTable) {
  const overrideSelect = includeOverrideTable
    ? `
      COALESCE(ov.override_count, 0)::int AS override_count,
      ov.last_override_at,
      ov.last_override_reason,
      ov.last_overridden_by,
    `
    : `
      0::int AS override_count,
      NULL::timestamptz AS last_override_at,
      NULL::text AS last_override_reason,
      NULL::text AS last_overridden_by,
    `;

  const overrideJoin = includeOverrideTable
    ? `
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS override_count,
          MAX(created_at) AS last_override_at,
          (ARRAY_AGG(reason ORDER BY created_at DESC))[1] AS last_override_reason,
          (ARRAY_AGG(created_by ORDER BY created_at DESC))[1] AS last_overridden_by
        FROM panel_result_overrides pro
        WHERE pro.result_id = r.id
      ) ov ON TRUE
    `
    : '';

  return `
    WITH result_rows AS (
      SELECT
        r.id AS result_id,
        r.attempt_id,
        r.candidate_id,
        r.campaign_code,
        a.application_no,
        c.full_name AS student_full_name_legacy,
        c.full_name_enc AS student_full_name_enc,
        c.grade,
        s.name AS school_name,
        g.full_name AS parent_full_name_legacy,
        g.full_name_enc AS parent_full_name_enc,
        g.phone_e164 AS parent_phone_e164_legacy,
        g.phone_e164_enc AS parent_phone_e164_enc,
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
        ${overrideSelect}
        r.updated_at
      FROM results r
      JOIN candidates c ON c.id = r.candidate_id
      LEFT JOIN schools s ON s.id = c.school_id
      LEFT JOIN guardians g ON g.id = c.guardian_id
      LEFT JOIN LATERAL (
        SELECT a2.application_no
        FROM applications a2
        WHERE a2.candidate_id = c.id
        ORDER BY a2.created_at DESC
        LIMIT 1
      ) a ON TRUE
      ${overrideJoin}
    )
  `;
}

function isMissingOverrideRelation(error) {
  const code = safeTrim(error?.code);
  const message = safeTrim(error?.message).toLowerCase();
  return code === '42P01' && message.includes('panel_result_overrides');
}

async function runListQueries({ listQuery, whereClause, params, includeOverrideTable }) {
  const sortColumn = SORT_COLUMN_MAP[listQuery.sortBy] || SORT_COLUMN_MAP.updated_at;
  const sortOrder = toSqlOrder(listQuery.sortOrder);
  const cte = buildResultRowsCte(includeOverrideTable);
  const listParams = [...params, listQuery.perPage, listQuery.offset];
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [dataResult, countResult, summaryResult] = await Promise.all([
    query(
      `
        ${cte}
        SELECT
          result_id,
          attempt_id,
          candidate_id,
          campaign_code,
          application_no,
          student_full_name_legacy,
          student_full_name_enc,
          grade,
          school_name,
          parent_full_name_legacy,
          parent_full_name_enc,
          parent_phone_e164_legacy,
          parent_phone_e164_enc,
          result_status,
          result_score,
          result_percentage,
          correct_count,
          wrong_count,
          unanswered_count,
          placement_label,
          cefr_band,
          published_at,
          viewed_at,
          override_count,
          last_override_at,
          last_override_reason,
          last_overridden_by,
          updated_at
        FROM result_rows
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder} NULLS LAST
        LIMIT $${limitIndex}
        OFFSET $${offsetIndex}
      `,
      listParams,
    ),
    query(
      `
        ${cte}
        SELECT COUNT(*)::int AS total
        FROM result_rows
        ${whereClause}
      `,
      params,
    ),
    query(
      `
        ${cte}
        SELECT
          COUNT(*)::int AS total_results,
          COUNT(*) FILTER (WHERE published_at IS NOT NULL)::int AS published_results,
          COUNT(*) FILTER (WHERE viewed_at IS NOT NULL)::int AS viewed_results,
          COUNT(*) FILTER (WHERE published_at IS NULL OR result_status = 'NOT_READY')::int AS pending_publish,
          COUNT(*) FILTER (WHERE override_count > 0)::int AS overridden_results
        FROM result_rows
        ${whereClause}
      `,
      params,
    ),
  ]);

  return {
    dataResult,
    countResult,
    summaryResult,
  };
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY],
      ['PANEL_RESULTS_REVIEW'],
    );

    const listQuery = parseListQuery(req, RESULT_REVIEW_COLUMNS, 'updated_at', 'desc');
    const { whereClause, params } = buildFilters(listQuery);

    let queryBundle;
    try {
      queryBundle = await runListQueries({
        listQuery,
        whereClause,
        params,
        includeOverrideTable: true,
      });
    } catch (error) {
      if (!isMissingOverrideRelation(error)) {
        throw error;
      }
      queryBundle = await runListQueries({
        listQuery,
        whereClause,
        params,
        includeOverrideTable: false,
      });
    }

    const piiScopeFull = isPrivilegedPiiRole(identity.role);
    const items = await Promise.all(
      queryBundle.dataResult.rows.map(async (row) => {
        const [studentFullNameRaw, parentFullNameRaw, parentPhoneRaw] = await Promise.all([
          decryptPii(row.student_full_name_enc, row.student_full_name_legacy),
          decryptPii(row.parent_full_name_enc, row.parent_full_name_legacy),
          decryptPii(row.parent_phone_e164_enc, row.parent_phone_e164_legacy),
        ]);

        return {
          ...row,
          student_full_name: piiScopeFull ? studentFullNameRaw : maskPiiName(studentFullNameRaw),
          parent_full_name: piiScopeFull ? parentFullNameRaw : maskPiiName(parentFullNameRaw),
          parent_phone_e164: piiScopeFull ? parentPhoneRaw : maskPiiPhone(parentPhoneRaw),
        };
      }),
    );

    const payloadItems = items.map((item) => {
      const {
        student_full_name_legacy: _studentLegacy,
        student_full_name_enc: _studentEnc,
        parent_full_name_legacy: _parentLegacy,
        parent_full_name_enc: _parentEnc,
        parent_phone_e164_legacy: _phoneLegacy,
        parent_phone_e164_enc: _phoneEnc,
        ...rest
      } = item;
      return rest;
    });

    ok(
      res,
      buildListResponse({
        items: payloadItems,
        total: Number(queryBundle.countResult.rows[0]?.total || 0),
        page: listQuery.page,
        perPage: listQuery.perPage,
        summary: queryBundle.summaryResult.rows[0] || {},
      }),
    );

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_RESULTS_REVIEW',
      targetType: 'RESULT_LIST',
      targetId: `${listQuery.page}:${listQuery.perPage}`,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        q: listQuery.q || null,
        filters: listQuery.filters,
        returned: payloadItems.length,
        piiScope: piiScopeFull ? 'FULL' : 'MASKED',
      },
    });
  });
}
