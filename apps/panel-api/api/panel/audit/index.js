import { requireRole } from '../../_lib/auth.js';
import { ROLES } from '../../_lib/constants.js';
import { query } from '../../_lib/db.js';
import { buildListResponse } from '../../_lib/listResponse.js';
import {
  handleRequest,
  methodGuard,
  parseListQuery,
  ok,
  parseDateRange,
  parseFiltersFromQuery,
  safeTrim,
} from '../../_lib/http.js';
import { buildWhereClause, toSqlOrder } from '../../_lib/sql.js';

const AUDIT_SORT_COLUMNS = ['seq', 'created_at', 'actor_type', 'action', 'target_type'];
const AUDIT_SORT_COLUMN_MAP = {
  seq: 'seq',
  created_at: 'created_at',
  actor_type: 'actor_type',
  action: 'action',
  target_type: 'target_type',
};

function buildFilters(listQuery) {
  const filters = parseFiltersFromQuery(listQuery.filters);
  const params = [];
  const clauses = [];
  const q = safeTrim(listQuery.q).toLowerCase();

  if (q) {
    params.push(`%${q}%`);
    clauses.push(
      `(LOWER(COALESCE(actor_id, '')) LIKE $${params.length} OR LOWER(action) LIKE $${params.length} OR LOWER(COALESCE(target_type, '')) LIKE $${params.length} OR LOWER(COALESCE(target_id, '')) LIKE $${params.length} OR LOWER(COALESCE(request_id, '')) LIKE $${params.length})`,
    );
  }

  const actorId = safeTrim(filters.actor_id || filters.actorId);
  if (actorId) {
    params.push(actorId);
    clauses.push(`actor_id = $${params.length}`);
  }

  const actorType = safeTrim(filters.actor_type || filters.actorType).toUpperCase();
  if (actorType) {
    params.push(actorType);
    clauses.push(`actor_type = $${params.length}`);
  }

  const action = safeTrim(filters.action);
  if (action) {
    params.push(action);
    clauses.push(`action = $${params.length}`);
  }

  const targetType = safeTrim(filters.target_type || filters.targetType);
  if (targetType) {
    params.push(targetType);
    clauses.push(`target_type = $${params.length}`);
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

  return {
    whereClause: buildWhereClause(clauses),
    params,
  };
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY],
      ['PANEL_AUDIT_READ'],
    );

    const listQuery = parseListQuery(req, AUDIT_SORT_COLUMNS, 'seq', 'desc');
    const { whereClause, params } = buildFilters(listQuery);
    const sortColumn = AUDIT_SORT_COLUMN_MAP[listQuery.sortBy] || AUDIT_SORT_COLUMN_MAP.seq;
    const sortOrder = toSqlOrder(listQuery.sortOrder);

    const rowsPromise = query(
      `
        SELECT
          id,
          seq,
          actor_type,
          actor_id,
          actor_role,
          action,
          target_type,
          target_id,
          request_id,
          ip_address,
          user_agent,
          metadata,
          prev_hash,
          entry_hash,
          created_at
        FROM audit_log_entries
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder} NULLS LAST
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      [...params, listQuery.perPage, listQuery.offset],
    );

    const countPromise = query(
      `
        SELECT COUNT(*)::int AS total
        FROM audit_log_entries
        ${whereClause}
      `,
      params,
    );

    const summaryPromise = query(
      `
        SELECT
          COUNT(*)::int AS total_entries,
          COUNT(*) FILTER (WHERE actor_type = 'ADMIN_USER')::int AS admin_events,
          COUNT(*) FILTER (WHERE action LIKE 'PANEL_%')::int AS panel_actions
        FROM audit_log_entries
        ${whereClause}
      `,
      params,
    );

    const headPromise = query(
      `
        SELECT last_hash, updated_at
        FROM audit_log_chain_head
        WHERE id = 1
      `,
    );

    const [rowsResult, countResult, summaryResult, headResult] = await Promise.all([
      rowsPromise,
      countPromise,
      summaryPromise,
      headPromise,
    ]);

    const payload = buildListResponse({
      items: rowsResult.rows,
      page: listQuery.page,
      perPage: listQuery.perPage,
      total: Number(countResult.rows[0]?.total || 0),
      summary: {
        ...(summaryResult.rows[0] || {}),
        chain_last_hash: headResult.rows[0]?.last_hash || null,
        chain_updated_at: headResult.rows[0]?.updated_at || null,
      },
    });

    // Backward-compatible duplicate field for existing clients.
    payload.chain_head = {
      last_hash: headResult.rows[0]?.last_hash || null,
      updated_at: headResult.rows[0]?.updated_at || null,
    };

    ok(res, payload);
  });
}
