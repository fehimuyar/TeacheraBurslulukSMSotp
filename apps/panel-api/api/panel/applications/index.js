import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { query } from '../../_lib/db.js';
import { buildListResponse } from '../../_lib/listResponse.js';
import {
  handleRequest,
  methodGuard,
  normalizeArrayFilter,
  ok,
  parseListQuery,
  safeTrim,
} from '../../_lib/http.js';
import { buildWhereClause, toSqlOrder } from '../../_lib/sql.js';

const APPLICATIONS_GRID_COLUMNS = [
  'form_type',
  'received_at',
  'full_name',
  'phone',
  'crm_transferred_at',
  'updated_at',
];

const SORT_COLUMN_MAP = {
  form_type: 's.form_type',
  received_at: 's.received_at',
  full_name: 's.full_name',
  phone: 's.phone',
  crm_transferred_at: 's.crm_transferred_at',
  updated_at: 's.updated_at',
};

const FORM_TYPES = [
  'CALLBACK',
  'FREE_TRIAL',
  'LEVEL_ASSESSMENT',
  'FORMAT_CONSULTATION',
  'CORPORATE_OFFER',
];

const CRM_UI_STATUS = ['TRANSFERRED', 'NOT_TRANSFERRED'];

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

function readReceivedRange(filters = {}) {
  const from = safeTrim(filters.received_from || filters.receivedFrom || filters.from || filters.date_from);
  const to = safeTrim(filters.received_to || filters.receivedTo || filters.to || filters.date_to);
  return {
    from: from || null,
    to: to || null,
  };
}

function buildFilters(listQuery) {
  const { q, filters } = listQuery;
  const params = [];
  const clauses = [];

  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    clauses.push(
      `(
        LOWER(COALESCE(s.full_name, '')) LIKE $${params.length}
        OR LOWER(COALESCE(s.phone, '')) LIKE $${params.length}
        OR LOWER(COALESCE(s.email, '')) LIKE $${params.length}
        OR EXISTS (
          SELECT 1
          FROM lead_form_notes n
          WHERE n.submission_id = s.id
            AND LOWER(n.note) LIKE $${params.length}
        )
      )`,
    );
  }

  appendInFilter(
    clauses,
    params,
    's.form_type',
    normalizeArrayFilter(filters.form_type || filters.formType, FORM_TYPES),
  );

  const crmStatuses = normalizeArrayFilter(filters.crm_status || filters.crmStatus, CRM_UI_STATUS);
  if (crmStatuses.length === 1) {
    clauses.push(
      crmStatuses[0] === 'TRANSFERRED'
        ? `s.crm_transfer_status = 'TRANSFERRED'`
        : `s.crm_transfer_status <> 'TRANSFERRED'`,
    );
  }

  addDateRangeFilter(clauses, params, 's.received_at', readReceivedRange(filters));

  return { whereClause: buildWhereClause(clauses), params };
}

function formatSummaryRow(row) {
  return {
    total_forms: Number(row?.total_forms || 0),
    crm_transferred: Number(row?.crm_transferred || 0),
    crm_pending: Number(row?.crm_pending || 0),
    today_received: Number(row?.today_received || 0),
  };
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    const identity = await requireRole(req, [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY]);

    const listQuery = parseListQuery(req, APPLICATIONS_GRID_COLUMNS, 'received_at', 'desc');
    const { whereClause, params } = buildFilters(listQuery);
    const sortColumn = SORT_COLUMN_MAP[listQuery.sortBy] || SORT_COLUMN_MAP.received_at;
    const sortOrder = toSqlOrder(listQuery.sortOrder);

    params.push(listQuery.perPage);
    const limitIndex = params.length;
    params.push(listQuery.offset);
    const offsetIndex = params.length;

    const dataResult = await query(
      `
        SELECT
          s.id,
          s.form_type,
          s.form_subject,
          s.received_at,
          s.full_name,
          s.phone,
          CASE WHEN s.crm_transfer_status = 'TRANSFERRED' THEN 'TRANSFERRED' ELSE 'NOT_TRANSFERRED' END AS crm_status_ui,
          s.crm_transferred_at,
          note.latest_note_excerpt,
          s.form_source
        FROM lead_form_submissions s
        LEFT JOIN LATERAL (
          SELECT
            LEFT(n.note, 60) AS latest_note_excerpt
          FROM lead_form_notes n
          WHERE n.submission_id = s.id
          ORDER BY n.created_at DESC
          LIMIT 1
        ) note ON TRUE
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
        FROM lead_form_submissions s
        ${whereClause}
      `,
      params.slice(0, -2),
    );

    const summaryResult = await query(
      `
        SELECT
          COUNT(*)::int AS total_forms,
          COUNT(*) FILTER (WHERE s.crm_transfer_status = 'TRANSFERRED')::int AS crm_transferred,
          COUNT(*) FILTER (WHERE s.crm_transfer_status <> 'TRANSFERRED')::int AS crm_pending,
          COUNT(*) FILTER (
            WHERE (s.received_at AT TIME ZONE 'Europe/Istanbul')::date = (NOW() AT TIME ZONE 'Europe/Istanbul')::date
          )::int AS today_received
        FROM lead_form_submissions s
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
        summary: formatSummaryRow(summaryResult.rows[0]),
      }),
    );

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_APPLICATIONS_READ',
      targetType: 'LEAD_FORM_LIST',
      targetId: `${listQuery.page}:${listQuery.perPage}`,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        q: listQuery.q || null,
        filters: listQuery.filters,
        sortBy: listQuery.sortBy,
        sortOrder: listQuery.sortOrder,
      },
    });
  });
}
