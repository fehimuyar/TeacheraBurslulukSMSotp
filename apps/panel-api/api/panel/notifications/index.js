import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import {
  JOB_STATUS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_GRID_COLUMNS,
  ROLES,
} from '../../_lib/constants.js';
import { query } from '../../_lib/db.js';
import { buildListResponse } from '../../_lib/listResponse.js';
import { isPrivilegedPiiRole, maskPiiPhone } from '../../_lib/piiCrypto.js';
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

const SORT_COLUMN_MAP = {
  job_id: 'job_id',
  channel: 'channel',
  template_code: 'template_code',
  recipient: 'recipient',
  status: 'status',
  retry_count: 'retry_count',
  next_retry_at: 'next_retry_at',
  provider_message_id: 'provider_message_id',
  sent_at: 'sent_at',
  delivered_at: 'delivered_at',
  read_at: 'read_at',
  error_code: 'error_code',
};

function parseBooleanLike(value) {
  const normalized = safeTrim(value).toLowerCase();
  if (!normalized) return false;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function readSyntheticSmsPrefixes() {
  const raw = safeTrim(process.env.NOTIFICATION_TEST_SMS_PREFIXES || process.env.SMS_TEST_PREFIXES);
  if (!raw) return [];

  return raw
    .split(',')
    .map((item) => item.replace(/\D+/g, ''))
    .filter(Boolean);
}

function buildSyntheticNotificationClause(params) {
  const clauses = ["(channel = 'SMS' AND LOWER(COALESCE(recipient, '')) LIKE 'lt:%')"];
  for (const prefix of readSyntheticSmsPrefixes()) {
    params.push(`${prefix}%`);
    clauses.push(`(channel = 'SMS' AND REGEXP_REPLACE(COALESCE(recipient, ''), '[^0-9]', '', 'g') LIKE $${params.length})`);
  }
  return clauses.join(' OR ');
}

function resolveSyntheticNotificationMeta(row) {
  if (String(row?.channel || '').toUpperCase() !== 'SMS') {
    return {
      syntheticTest: false,
      syntheticReason: null,
    };
  }

  const recipient = safeTrim(row?.recipient).toLowerCase();
  const normalizedRecipient = normalizeDigits(row?.recipient);
  if (recipient.startsWith('lt:')) {
    return {
      syntheticTest: true,
      syntheticReason: 'load_test_recipient',
    };
  }

  const matchedPrefix = readSyntheticSmsPrefixes().find((prefix) => normalizedRecipient.startsWith(prefix));
  return {
    syntheticTest: Boolean(matchedPrefix),
    syntheticReason: matchedPrefix ? `test_sms_prefix_${matchedPrefix}` : null,
  };
}

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
    clauses.push(
      `(LOWER(template_code) LIKE $${params.length} OR LOWER(recipient) LIKE $${params.length} OR LOWER(COALESCE(provider_message_id, '')) LIKE $${params.length} OR LOWER(COALESCE(error_code, '')) LIKE $${params.length})`,
    );
  }

  const channels = normalizeArrayFilter(filters.channel || filters.channels, NOTIFICATION_CHANNELS);
  if (channels.length > 0) {
    params.push(channels);
    clauses.push(`channel = ANY($${params.length})`);
  }

  const statuses = normalizeArrayFilter(filters.status || filters.statuses, JOB_STATUS);
  if (statuses.length > 0) {
    params.push(statuses);
    clauses.push(`status = ANY($${params.length})`);
  }

  const includeSynthetic = parseBooleanLike(filters.include_synthetic || filters.includeSynthetic);
  if (!includeSynthetic) {
    const syntheticClause = buildSyntheticNotificationClause(params);
    if (syntheticClause) {
      clauses.push(`NOT (${syntheticClause})`);
    }
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
    includeSynthetic,
  };
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY],
      ['PANEL_NOTIFICATIONS_READ'],
    );

    const listQuery = parseListQuery(req, NOTIFICATION_GRID_COLUMNS, 'next_retry_at', 'desc');
    const { whereClause, params, includeSynthetic } = buildFilters(listQuery);
    const sortColumn = SORT_COLUMN_MAP[listQuery.sortBy] || 'next_retry_at';
    const sortOrder = toSqlOrder(listQuery.sortOrder);

    params.push(listQuery.perPage);
    const limitIndex = params.length;
    params.push(listQuery.offset);
    const offsetIndex = params.length;

    const dataResult = await query(
      `
        SELECT
          job_id,
          channel,
          template_code,
          recipient,
          status,
          retry_count,
          next_retry_at,
          provider_message_id,
          sent_at,
          delivered_at,
          read_at,
          error_code
        FROM v_notifications
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
        FROM v_notifications
        ${whereClause}
      `,
      params.slice(0, -2),
    );

    const summaryResult = await query(
      `
        SELECT
          COUNT(*)::int AS total_jobs,
          COUNT(*) FILTER (WHERE status = 'DLQ')::int AS dlq_jobs,
          COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_jobs,
          COUNT(*) FILTER (WHERE status IN ('DELIVERED', 'READ'))::int AS successful_jobs
        FROM v_notifications
        ${whereClause}
      `,
      params.slice(0, -2),
    );

    const piiScopeFull = isPrivilegedPiiRole(identity.role);
    const items = dataResult.rows.map((row) => {
      const syntheticMeta = resolveSyntheticNotificationMeta(row);
      return {
        ...row,
        recipient: piiScopeFull ? row.recipient : maskPiiPhone(row.recipient),
        synthetic_test: syntheticMeta.syntheticTest,
        synthetic_reason: syntheticMeta.syntheticReason,
      };
    });

    ok(
      res,
      buildListResponse({
        items,
        total: Number(countResult.rows[0]?.total || 0),
        page: listQuery.page,
        perPage: listQuery.perPage,
        summary: summaryResult.rows[0] || {},
      }),
    );

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_NOTIFICATIONS_READ',
      targetType: 'NOTIFICATION_LIST',
      targetId: `${listQuery.page}:${listQuery.perPage}`,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        q: listQuery.q || null,
        filters: listQuery.filters,
        returned: items.length,
        includeSynthetic,
        piiScope: piiScopeFull ? 'FULL' : 'MASKED',
      },
    });
  });
}
