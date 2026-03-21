import { requireRole } from '../../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../../_lib/auditLog.js';
import { ROLES } from '../../../_lib/constants.js';
import { query } from '../../../_lib/db.js';
import { buildListResponse } from '../../../_lib/listResponse.js';
import {
  handleRequest,
  methodGuard,
  normalizeArrayFilter,
  ok,
  parseDateRange,
  parseListQuery,
  safeTrim,
} from '../../../_lib/http.js';
import { buildWhereClause, toSqlOrder } from '../../../_lib/sql.js';

const RESULTS_HISTORY_COLUMNS = [
  'history_id',
  'action_type',
  'result_id',
  'candidate_id',
  'campaign_code',
  'application_no',
  'actor_id',
  'actor_role',
  'publish_mode',
  'occurred_at',
];

const SORT_COLUMN_MAP = {
  history_id: 'history_id',
  action_type: 'action_type',
  result_id: 'result_id',
  candidate_id: 'candidate_id',
  campaign_code: 'campaign_code',
  application_no: 'application_no',
  actor_id: 'actor_id',
  actor_role: 'actor_role',
  publish_mode: 'publish_mode',
  occurred_at: 'occurred_at',
};

function appendInFilter(clauses, params, column, values) {
  if (!Array.isArray(values) || values.length === 0) return;
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
    clauses.push(`hr.campaign_code = $${params.length}`);
  }

  const resultId = safeTrim(filters.result_id || filters.resultId);
  if (resultId) {
    params.push(resultId);
    clauses.push(`hr.result_id::text = $${params.length}`);
  }

  const candidateId = safeTrim(filters.candidate_id || filters.candidateId);
  if (candidateId) {
    params.push(candidateId);
    clauses.push(`hr.candidate_id::text = $${params.length}`);
  }

  const actorId = safeTrim(filters.actor_id || filters.actorId);
  if (actorId) {
    params.push(actorId);
    clauses.push(`hr.actor_id = $${params.length}`);
  }

  appendInFilter(
    clauses,
    params,
    'hr.action_type',
    normalizeArrayFilter(filters.action_type || filters.actionType, ['OVERRIDE', 'PUBLISH']),
  );

  appendInFilter(
    clauses,
    params,
    'hr.publish_mode',
    normalizeArrayFilter(filters.publish_mode || filters.publishMode, ['PUBLISH', 'REPUBLISH']),
  );

  addDateRangeFilter(clauses, params, 'hr.occurred_at', parseDateRange(filters));

  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    clauses.push(
      `(LOWER(COALESCE(hr.campaign_code, '')) LIKE $${params.length}
      OR LOWER(COALESCE(hr.application_no, '')) LIKE $${params.length}
      OR LOWER(hr.result_id::text) LIKE $${params.length}
      OR LOWER(hr.candidate_id::text) LIKE $${params.length}
      OR LOWER(COALESCE(hr.actor_id, '')) LIKE $${params.length}
      OR LOWER(COALESCE(hr.reason, '')) LIKE $${params.length}
      OR LOWER(COALESCE(hr.action_type, '')) LIKE $${params.length})`,
    );
  }

  return {
    whereClause: buildWhereClause(clauses),
    params,
  };
}

function buildApplicationNoLateral(referenceAlias) {
  return `
    LEFT JOIN LATERAL (
      SELECT a.application_no
      FROM applications a
      WHERE a.candidate_id = ${referenceAlias}.candidate_id
      ORDER BY a.created_at DESC
      LIMIT 1
    ) latest_app ON TRUE
  `;
}

function buildHistoryRowsCte({ hasOverrides, hasPublications }) {
  const blocks = [];

  if (hasOverrides) {
    blocks.push(`
      SELECT
        pro.id AS history_id,
        'OVERRIDE'::text AS action_type,
        pro.result_id,
        pro.candidate_id,
        pro.campaign_code,
        latest_app.application_no,
        pro.created_by AS actor_id,
        pro.created_role AS actor_role,
        pro.reason,
        pro.previous_score,
        pro.new_score,
        pro.previous_percentage,
        pro.new_percentage,
        pro.previous_placement_label,
        pro.new_placement_label,
        pro.previous_cefr_band,
        pro.new_cefr_band,
        NULL::result_status AS previous_status,
        NULL::result_status AS next_status,
        NULL::timestamptz AS previous_published_at,
        NULL::timestamptz AS next_published_at,
        NULL::text AS publish_mode,
        NULL::boolean AS enqueue_whatsapp,
        pro.created_at AS occurred_at
      FROM panel_result_overrides pro
      ${buildApplicationNoLateral('pro')}
    `);
  }

  if (hasPublications) {
    blocks.push(`
      SELECT
        prp.id AS history_id,
        'PUBLISH'::text AS action_type,
        prp.result_id,
        prp.candidate_id,
        prp.campaign_code,
        latest_app.application_no,
        prp.published_by AS actor_id,
        prp.published_role AS actor_role,
        NULL::text AS reason,
        NULL::numeric AS previous_score,
        NULL::numeric AS new_score,
        NULL::numeric AS previous_percentage,
        NULL::numeric AS new_percentage,
        NULL::text AS previous_placement_label,
        NULL::text AS new_placement_label,
        NULL::text AS previous_cefr_band,
        NULL::text AS new_cefr_band,
        prp.previous_status,
        prp.next_status,
        prp.previous_published_at,
        prp.next_published_at,
        prp.publish_mode,
        prp.enqueue_whatsapp,
        prp.created_at AS occurred_at
      FROM panel_result_publications prp
      ${buildApplicationNoLateral('prp')}
    `);
  }

  if (blocks.length === 0) {
    return '';
  }

  return `
    WITH history_rows AS (
      ${blocks.join('\nUNION ALL\n')}
    )
  `;
}

async function readHistorySources() {
  const result = await query(`
    SELECT
      (to_regclass('public.panel_result_overrides') IS NOT NULL) AS has_overrides,
      (to_regclass('public.panel_result_publications') IS NOT NULL) AS has_publications
  `);
  return {
    hasOverrides: Boolean(result.rows[0]?.has_overrides),
    hasPublications: Boolean(result.rows[0]?.has_publications),
  };
}

async function runListQueries({ listQuery, whereClause, params, sources }) {
  const sortColumn = SORT_COLUMN_MAP[listQuery.sortBy] || SORT_COLUMN_MAP.occurred_at;
  const sortOrder = toSqlOrder(listQuery.sortOrder);
  const cte = buildHistoryRowsCte(sources);
  const listParams = [...params, listQuery.perPage, listQuery.offset];
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [dataResult, countResult, summaryResult] = await Promise.all([
    query(
      `
        ${cte}
        SELECT
          hr.history_id,
          hr.action_type,
          hr.result_id,
          hr.candidate_id,
          hr.campaign_code,
          hr.application_no,
          hr.actor_id,
          hr.actor_role,
          hr.reason,
          hr.previous_score,
          hr.new_score,
          hr.previous_percentage,
          hr.new_percentage,
          hr.previous_placement_label,
          hr.new_placement_label,
          hr.previous_cefr_band,
          hr.new_cefr_band,
          hr.previous_status,
          hr.next_status,
          hr.previous_published_at,
          hr.next_published_at,
          hr.publish_mode,
          hr.enqueue_whatsapp,
          hr.occurred_at,
          sms.sms_job_id,
          sms.sms_status,
          sms.sms_queued_at,
          sms.sms_sent_at,
          sms.sms_delivered_at,
          sms.sms_read_at,
          sms.sms_error_code,
          sms.sms_retry_count,
          wa.wa_job_id,
          wa.wa_status,
          wa.wa_queued_at,
          wa.wa_sent_at,
          wa.wa_delivered_at,
          wa.wa_read_at,
          wa.wa_error_code,
          wa.wa_retry_count,
          CASE
            WHEN sms.sms_status IN ('FAILED', 'DLQ', 'RETRYING') THEN TRUE
            ELSE FALSE
          END AS sms_fallback_expected,
          CASE
            WHEN sms.sms_status IN ('FAILED', 'DLQ', 'RETRYING')
              AND wa.wa_job_id IS NOT NULL
              AND (sms.sms_failed_at IS NULL OR wa.wa_queued_at IS NULL OR wa.wa_queued_at >= sms.sms_failed_at)
            THEN TRUE
            ELSE FALSE
          END AS sms_fallback_triggered
        FROM history_rows hr
        LEFT JOIN LATERAL (
          SELECT
            nj.id AS sms_job_id,
            nj.status AS sms_status,
            nj.enqueued_at AS sms_queued_at,
            nj.retry_count AS sms_retry_count,
            COALESCE(ne_last.error_code, nj.last_error_code) AS sms_error_code,
            ne_metrics.sent_at AS sms_sent_at,
            ne_metrics.delivered_at AS sms_delivered_at,
            ne_metrics.read_at AS sms_read_at,
            ne_metrics.failed_at AS sms_failed_at
          FROM notification_jobs nj
          LEFT JOIN LATERAL (
            SELECT
              MAX(ne.sent_at) AS sent_at,
              MAX(ne.delivered_at) AS delivered_at,
              MAX(ne.read_at) AS read_at,
              MAX(
                CASE
                  WHEN UPPER(COALESCE(ne.event_type, '')) IN ('FAILED', 'DLQ', 'ERROR')
                    OR ne.error_code IS NOT NULL
                  THEN ne.created_at
                  ELSE NULL
                END
              ) AS failed_at
            FROM notification_events ne
            WHERE ne.job_id = nj.id
          ) ne_metrics ON TRUE
          LEFT JOIN LATERAL (
            SELECT ne2.error_code
            FROM notification_events ne2
            WHERE ne2.job_id = nj.id
            ORDER BY ne2.created_at DESC
            LIMIT 1
          ) ne_last ON TRUE
          WHERE nj.result_id = hr.result_id
            AND nj.channel = 'SMS'
            AND UPPER(COALESCE(nj.template_code, '')) LIKE '%RESULT%'
          ORDER BY nj.created_at DESC
          LIMIT 1
        ) sms ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            nj.id AS wa_job_id,
            nj.status AS wa_status,
            nj.enqueued_at AS wa_queued_at,
            nj.retry_count AS wa_retry_count,
            COALESCE(ne_last.error_code, nj.last_error_code) AS wa_error_code,
            ne_metrics.sent_at AS wa_sent_at,
            ne_metrics.delivered_at AS wa_delivered_at,
            ne_metrics.read_at AS wa_read_at
          FROM notification_jobs nj
          LEFT JOIN LATERAL (
            SELECT
              MAX(ne.sent_at) AS sent_at,
              MAX(ne.delivered_at) AS delivered_at,
              MAX(ne.read_at) AS read_at
            FROM notification_events ne
            WHERE ne.job_id = nj.id
          ) ne_metrics ON TRUE
          LEFT JOIN LATERAL (
            SELECT ne2.error_code
            FROM notification_events ne2
            WHERE ne2.job_id = nj.id
            ORDER BY ne2.created_at DESC
            LIMIT 1
          ) ne_last ON TRUE
          WHERE nj.result_id = hr.result_id
            AND nj.channel = 'WHATSAPP'
            AND UPPER(COALESCE(nj.template_code, '')) LIKE '%RESULT%'
          ORDER BY nj.created_at DESC
          LIMIT 1
        ) wa ON TRUE
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
        FROM history_rows hr
        ${whereClause}
      `,
      params,
    ),
    query(
      `
        ${cte}
        SELECT
          COUNT(*)::int AS total_events,
          COUNT(*) FILTER (WHERE hr.action_type = 'OVERRIDE')::int AS override_events,
          COUNT(*) FILTER (WHERE hr.action_type = 'PUBLISH')::int AS publish_events,
          COUNT(*) FILTER (WHERE hr.action_type = 'PUBLISH' AND hr.publish_mode = 'REPUBLISH')::int AS republish_events,
          COUNT(DISTINCT hr.result_id)::int AS distinct_results,
          COUNT(DISTINCT hr.candidate_id)::int AS distinct_candidates
        FROM history_rows hr
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

function emptySummary(sources) {
  return {
    total_events: 0,
    override_events: 0,
    publish_events: 0,
    republish_events: 0,
    distinct_results: 0,
    distinct_candidates: 0,
    sources: {
      has_overrides: sources.hasOverrides,
      has_publications: sources.hasPublications,
    },
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

    const listQuery = parseListQuery(req, RESULTS_HISTORY_COLUMNS, 'occurred_at', 'desc');
    const sources = await readHistorySources();
    const { whereClause, params } = buildFilters(listQuery);

    if (!sources.hasOverrides && !sources.hasPublications) {
      ok(
        res,
        buildListResponse({
          items: [],
          total: 0,
          page: listQuery.page,
          perPage: listQuery.perPage,
          summary: emptySummary(sources),
        }),
      );
      return;
    }

    const queryBundle = await runListQueries({
      listQuery,
      whereClause,
      params,
      sources,
    });

    ok(
      res,
      buildListResponse({
        items: queryBundle.dataResult.rows,
        total: Number(queryBundle.countResult.rows[0]?.total || 0),
        page: listQuery.page,
        perPage: listQuery.perPage,
        summary: {
          ...(queryBundle.summaryResult.rows[0] || {}),
          sources: {
            has_overrides: sources.hasOverrides,
            has_publications: sources.hasPublications,
          },
        },
      }),
    );

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_RESULTS_HISTORY_REVIEW',
      targetType: 'RESULTS_HISTORY_LIST',
      targetId: `${listQuery.page}:${listQuery.perPage}`,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        q: listQuery.q || null,
        filters: listQuery.filters,
        returned: queryBundle.dataResult.rows.length,
        sources: {
          has_overrides: sources.hasOverrides,
          has_publications: sources.hasPublications,
        },
      },
    });
  });
}
