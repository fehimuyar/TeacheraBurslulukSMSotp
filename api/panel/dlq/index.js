// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { NOTIFICATION_CHANNELS, ROLES } from '../../_lib/constants.js';
import { query } from '../../_lib/db.js';
import { buildListResponse } from '../../_lib/listResponse.js';
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

const SORTABLE_COLUMNS = ['id', 'channel', 'error_code', 'retry_count', 'status', 'created_at', 'updated_at'];

const SORT_COLUMN_MAP = {
  id: 'id',
  channel: 'channel',
  error_code: 'error_code',
  retry_count: 'retry_count',
  status: 'status',
  created_at: 'created_at',
  updated_at: 'updated_at',
};

function buildFilters(listQuery) {
  const { q, filters } = listQuery;
  const clauses = [];
  const params = [];

  const campaignCode = safeTrim(filters.campaign_code || filters.campaignCode);
  if (campaignCode) {
    params.push(campaignCode);
    clauses.push(`campaign_code = $${params.length}`);
  }

  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    clauses.push(`(LOWER(error_code) LIKE $${params.length} OR LOWER(COALESCE(root_cause_note, '')) LIKE $${params.length})`);
  }

  const channels = normalizeArrayFilter(filters.channel || filters.channels, NOTIFICATION_CHANNELS);
  if (channels.length > 0) {
    params.push(channels);
    clauses.push(`channel = ANY($${params.length})`);
  }

  const statuses = normalizeArrayFilter(filters.status || filters.statuses);
  if (statuses.length > 0) {
    params.push(statuses);
    clauses.push(`status = ANY($${params.length})`);
  }

  const errorCodes = normalizeArrayFilter(filters.error_code || filters.errorCodes);
  if (errorCodes.length > 0) {
    params.push(errorCodes);
    clauses.push(`error_code = ANY($${params.length})`);
  }

  const retryFrom = Number.parseInt(String(filters.retry_from ?? ''), 10);
  const retryTo = Number.parseInt(String(filters.retry_to ?? ''), 10);
  if (Number.isFinite(retryFrom)) {
    params.push(retryFrom);
    clauses.push(`retry_count >= $${params.length}`);
  }
  if (Number.isFinite(retryTo)) {
    params.push(retryTo);
    clauses.push(`retry_count <= $${params.length}`);
  }

  const range = parseDateRange(filters);
  if (range.from) {
    params.push(range.from);
    clauses.push(`created_at >= $${params.length}::timestamptz`);
  }
  if (range.to) {
    params.push(range.to);
    clauses.push(`created_at <= $${params.length}::timestamptz`);
  }

  return { whereClause: buildWhereClause(clauses), params };
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY],
      ['PANEL_DLQ_READ'],
    );

    const listQuery = parseListQuery(req, SORTABLE_COLUMNS, 'created_at', 'desc');
    const { whereClause, params } = buildFilters(listQuery);
    const sortColumn = SORT_COLUMN_MAP[listQuery.sortBy] || SORT_COLUMN_MAP.created_at;
    const sortOrder = toSqlOrder(listQuery.sortOrder);

    params.push(listQuery.perPage);
    const limitIndex = params.length;
    params.push(listQuery.offset);
    const offsetIndex = params.length;

    const dataResult = await query(
      `
        SELECT
          id,
          source_job_id,
          channel,
          campaign_code,
          candidate_id,
          error_code,
          retry_count,
          status,
          root_cause_note,
          assigned_to,
          closed_at,
          created_at,
          updated_at
        FROM dlq_jobs
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder} NULLS LAST
        LIMIT $${limitIndex}
        OFFSET $${offsetIndex}
      `,
      params,
    );

    const countResult = await query(
      `
        SELECT COUNT(*)::int AS total
        FROM dlq_jobs
        ${whereClause}
      `,
      params.slice(0, -2),
    );

    const summaryResult = await query(
      `
        SELECT
          COUNT(*)::int AS total_dlq,
          COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_dlq,
          COUNT(*) FILTER (WHERE status = 'CLOSED')::int AS closed_dlq
        FROM dlq_jobs
        ${whereClause}
      `,
      params.slice(0, -2),
    );

    ok(
      res,
      buildListResponse({
        items: dataResult.rows,
        total: Number(countResult.rows[0]?.total || 0),
        page: listQuery.page,
        perPage: listQuery.perPage,
        summary: summaryResult.rows[0] || {},
      }),
    );

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_DLQ_READ',
      targetType: 'DLQ_LIST',
      targetId: `${listQuery.page}:${listQuery.perPage}`,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        q: listQuery.q || null,
        filters: listQuery.filters,
        returned: dataResult.rows.length,
      },
    });
  });
}
