import { requireRole } from '../../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../../_lib/auditLog.js';
import { ROLES } from '../../../_lib/constants.js';
import { query } from '../../../_lib/db.js';
import {
  handleRequest,
  methodGuard,
  normalizeArrayFilter,
  parseDateRange,
  parseFiltersFromQuery,
  safeTrim,
} from '../../../_lib/http.js';
import { buildWhereClause } from '../../../_lib/sql.js';

function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  if (!/[,"\n]/.test(raw)) return raw;
  return `"${raw.replaceAll('"', '""')}"`;
}

function escapeHtmlCell(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function readExportFormat(value) {
  const normalized = safeTrim(value).toLowerCase();
  return normalized === 'xls' ? 'xls' : 'csv';
}

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

function buildFilters(req) {
  const filters = parseFiltersFromQuery(req.query?.filters);
  const params = [];
  const clauses = [];
  const q = safeTrim(req.query?.q).toLowerCase();

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
    params.push(`%${q}%`);
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
    filters,
    q,
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

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY],
      ['PANEL_RESULTS_REVIEW', 'PANEL_AUDIT_EXPORT'],
    );

    const sources = await readHistorySources();
    const exportFormat = readExportFormat(req.query?.format);
    const { whereClause, params, filters, q } = buildFilters(req);

    const headers = [
      'history_id',
      'action_type',
      'occurred_at',
      'result_id',
      'candidate_id',
      'campaign_code',
      'application_no',
      'actor_id',
      'actor_role',
      'reason',
      'previous_score',
      'new_score',
      'previous_percentage',
      'new_percentage',
      'previous_placement_label',
      'new_placement_label',
      'previous_cefr_band',
      'new_cefr_band',
      'previous_status',
      'next_status',
      'previous_published_at',
      'next_published_at',
      'publish_mode',
      'enqueue_whatsapp',
      'sms_job_id',
      'sms_status',
      'sms_queued_at',
      'sms_sent_at',
      'sms_delivered_at',
      'sms_read_at',
      'sms_error_code',
      'sms_retry_count',
      'wa_job_id',
      'wa_status',
      'wa_queued_at',
      'wa_sent_at',
      'wa_delivered_at',
      'wa_read_at',
      'wa_error_code',
      'wa_retry_count',
      'sms_fallback_expected',
      'sms_fallback_triggered',
    ];

    let mappedRows = [];
    if (sources.hasOverrides || sources.hasPublications) {
      const cte = buildHistoryRowsCte(sources);
      const rowsResult = await query(
        `
          ${cte}
          SELECT
            hr.history_id,
            hr.action_type,
            hr.occurred_at,
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
          ORDER BY hr.occurred_at DESC NULLS LAST
          LIMIT 100000
        `,
        params,
      );
      mappedRows = rowsResult.rows.map((row) => ({
        ...row,
        enqueue_whatsapp: row.enqueue_whatsapp === null ? '' : row.enqueue_whatsapp ? 'true' : 'false',
        sms_fallback_expected: row.sms_fallback_expected ? 'true' : 'false',
        sms_fallback_triggered: row.sms_fallback_triggered ? 'true' : 'false',
      }));
    }

    const now = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
    res.status(200);
    if (exportFormat === 'xls') {
      const tableHead = `<tr>${headers.map((header) => `<th>${escapeHtmlCell(header)}</th>`).join('')}</tr>`;
      const tableBody = mappedRows
        .map((row) => `<tr>${headers.map((header) => `<td>${escapeHtmlCell(row[header])}</td>`).join('')}</tr>`)
        .join('');
      const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1">${tableHead}${tableBody}</table></body></html>`;
      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="panel-results-history-${now}.xls"`);
      res.end(html);
    } else {
      const lines = [headers.join(',')];
      for (const row of mappedRows) {
        lines.push(headers.map((header) => escapeCsvCell(row[header])).join(','));
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="panel-results-history-${now}.csv"`);
      res.end(lines.join('\n'));
    }

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_RESULTS_HISTORY_EXPORT',
      targetType: 'RESULTS_HISTORY_EXPORT',
      targetId: now,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        format: exportFormat,
        filters,
        q,
        row_count: mappedRows.length,
        sources: {
          has_overrides: sources.hasOverrides,
          has_publications: sources.hasPublications,
        },
      },
    });
  });
}
