// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { CRM_EXPORT_GRID_COLUMNS, CRM_EXPORT_STATUS, ROLES } from '../../_lib/constants.js';
import { query } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
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

const SORT_COLUMN_MAP = {
  job_id: 'job_id',
  campaign_code: 'campaign_code',
  candidate_id: 'candidate_id',
  application_no: 'application_no',
  student_full_name: 'student_full_name',
  grade: 'grade',
  school_name: 'school_name',
  status: 'status',
  retry_count: 'retry_count',
  next_retry_at: 'next_retry_at',
  http_status: 'http_status',
  external_reference: 'external_reference',
  error_code: 'error_code',
  processed_at: 'processed_at',
  created_at: 'created_at',
  updated_at: 'updated_at',
};

function isMissingCrmSchema(error) {
  const code = safeTrim(error?.code);
  const message = safeTrim(error?.message).toLowerCase();
  return (
    code === '42P01'
    && (message.includes('crm_export_jobs') || message.includes('v_crm_export_jobs'))
  );
}

function readBooleanFlag(rawValue, fallback = false) {
  const value = safeTrim(rawValue).toLowerCase();
  if (!value) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
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
      `(LOWER(COALESCE(application_no, '')) LIKE $${params.length} OR LOWER(COALESCE(student_full_name, '')) LIKE $${params.length} OR LOWER(COALESCE(parent_full_name, '')) LIKE $${params.length} OR LOWER(COALESCE(parent_phone_e164, '')) LIKE $${params.length} OR LOWER(COALESCE(error_code, '')) LIKE $${params.length} OR LOWER(COALESCE(external_reference, '')) LIKE $${params.length})`,
    );
  }

  const statuses = normalizeArrayFilter(filters.status || filters.statuses, CRM_EXPORT_STATUS);
  if (statuses.length > 0) {
    params.push(statuses);
    clauses.push(`status = ANY($${params.length}::crm_export_status[])`);
  }

  const problematicOnly = readBooleanFlag(filters.problematic_only ?? filters.problematicOnly, false);
  if (problematicOnly) {
    params.push(['FAILED', 'DLQ', 'RETRYING']);
    clauses.push(`status = ANY($${params.length}::crm_export_status[])`);
  }

  const retryDueOnly = readBooleanFlag(filters.retry_due_only ?? filters.retryDueOnly, false);
  if (retryDueOnly) {
    clauses.push(`status = 'RETRYING' AND next_retry_at IS NOT NULL AND next_retry_at <= NOW()`);
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
    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS],
      ['PANEL_CRM_PUSH'],
    );

    const listQuery = parseListQuery(req, CRM_EXPORT_GRID_COLUMNS, 'created_at', 'desc');
    const { whereClause, params } = buildFilters(listQuery);
    const sortColumn = SORT_COLUMN_MAP[listQuery.sortBy] || SORT_COLUMN_MAP.created_at;
    const sortOrder = toSqlOrder(listQuery.sortOrder);

    params.push(listQuery.perPage);
    const limitIndex = params.length;
    params.push(listQuery.offset);
    const offsetIndex = params.length;

    let dataResult;
    let countResult;
    let summaryResult;
    let errorBreakdownResult;
    try {
      [dataResult, countResult, summaryResult, errorBreakdownResult] = await Promise.all([
        query(
          `
            SELECT
              job_id,
              campaign_code,
              candidate_id,
              application_no,
              student_full_name AS student_full_name_legacy,
              student_full_name_enc,
              grade,
              school_name,
              parent_full_name AS parent_full_name_legacy,
              parent_full_name_enc,
              parent_phone_e164 AS parent_phone_e164_legacy,
              parent_phone_e164_enc,
              status,
              retry_count,
              next_retry_at,
              http_status,
              external_reference,
              error_code,
              error_message,
              processed_at,
              enqueued_by,
              enqueued_role,
              enqueued_at,
              created_at,
              updated_at
            FROM v_crm_export_jobs
            ${whereClause}
            ORDER BY ${sortColumn} ${sortOrder} NULLS LAST
            LIMIT $${limitIndex}
            OFFSET $${offsetIndex}
          `,
          params,
        ),
        query(
          `
            SELECT COUNT(*)::int AS total
            FROM v_crm_export_jobs
            ${whereClause}
          `,
          params.slice(0, -2),
        ),
        query(
          `
            SELECT
              COUNT(*)::int AS total_jobs,
              COUNT(*) FILTER (WHERE status = 'QUEUED')::int AS queued_jobs,
              COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing_jobs,
              COUNT(*) FILTER (WHERE status = 'RETRYING')::int AS retrying_jobs,
              COUNT(*) FILTER (WHERE status = 'SUCCEEDED')::int AS succeeded_jobs,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_jobs,
              COUNT(*) FILTER (WHERE status = 'DLQ')::int AS dlq_jobs,
              COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled_jobs,
              COUNT(*) FILTER (WHERE status IN ('FAILED', 'DLQ'))::int AS hard_fail_jobs,
              COUNT(*) FILTER (
                WHERE status = 'RETRYING'
                  AND next_retry_at IS NOT NULL
                  AND next_retry_at <= NOW()
              )::int AS retry_due_jobs
            FROM v_crm_export_jobs
            ${whereClause}
          `,
          params.slice(0, -2),
        ),
        query(
          `
            SELECT
              COALESCE(NULLIF(BTRIM(error_code), ''), 'unknown') AS error_code,
              COUNT(*)::int AS count
            FROM v_crm_export_jobs
            ${whereClause ? `${whereClause} AND status IN ('FAILED', 'DLQ', 'RETRYING')` : "WHERE status IN ('FAILED', 'DLQ', 'RETRYING')"}
            GROUP BY COALESCE(NULLIF(BTRIM(error_code), ''), 'unknown')
            ORDER BY count DESC, error_code ASC
            LIMIT 5
          `,
          params.slice(0, -2),
        ),
      ]);
    } catch (error) {
      if (isMissingCrmSchema(error)) {
        throw new HttpError(503, 'CRM export schema is missing. Run DB migration 20260320_0011 first.', 'crm_schema_missing');
      }
      throw error;
    }

    const piiScopeFull = isPrivilegedPiiRole(identity.role);
    const items = await Promise.all(
      dataResult.rows.map(async (row) => {
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
          student_full_name_legacy: undefined,
          parent_full_name_legacy: undefined,
          parent_phone_e164_legacy: undefined,
          student_full_name_enc: undefined,
          parent_full_name_enc: undefined,
          parent_phone_e164_enc: undefined,
        };
      }),
    );

    const summaryPayload = {
      ...(summaryResult.rows[0] || {}),
      error_breakdown: errorBreakdownResult.rows || [],
    };

    ok(
      res,
      buildListResponse({
        items,
        total: Number(countResult.rows[0]?.total || 0),
        page: listQuery.page,
        perPage: listQuery.perPage,
        summary: summaryPayload,
      }),
    );

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_CRM_EXPORT_READ',
      targetType: 'CRM_EXPORT_LIST',
      targetId: `${listQuery.page}:${listQuery.perPage}`,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        q: listQuery.q || null,
        filters: listQuery.filters,
        returned: items.length,
        piiScope: piiScopeFull ? 'FULL' : 'MASKED',
      },
    });
  });
}
