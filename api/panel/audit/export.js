// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { query } from '../../_lib/db.js';
import { handleRequest, methodGuard, parseDateRange, parseFiltersFromQuery, safeTrim } from '../../_lib/http.js';
import { buildWhereClause } from '../../_lib/sql.js';

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

function buildFilterState(req) {
  const filters = parseFiltersFromQuery(req.query?.filters);
  const params = [];
  const clauses = [];
  const q = safeTrim(req.query?.q || '').toLowerCase();

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
    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY],
      ['PANEL_AUDIT_EXPORT'],
    );
    const exportFormat = readExportFormat(req.query?.format);
    const { whereClause, params } = buildFilterState(req);

    const rowsResult = await query(
      `
        SELECT
          seq,
          created_at,
          actor_type,
          actor_id,
          actor_role,
          action,
          target_type,
          target_id,
          request_id,
          ip_address,
          metadata,
          entry_hash
        FROM audit_log_entries
        ${whereClause}
        ORDER BY created_at DESC NULLS LAST
        LIMIT 100000
      `,
      params,
    );

    const headers = [
      'seq',
      'created_at',
      'actor_type',
      'actor_id',
      'actor_role',
      'action',
      'target_type',
      'target_id',
      'request_id',
      'ip_address',
      'metadata',
      'entry_hash',
    ];

    const mappedRows = rowsResult.rows.map((row) => ({
      ...row,
      metadata: row.metadata ? JSON.stringify(row.metadata) : '',
    }));

    const now = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
    res.status(200);
    if (exportFormat === 'xls') {
      const tableHead = `<tr>${headers.map((header) => `<th>${escapeHtmlCell(header)}</th>`).join('')}</tr>`;
      const tableBody = mappedRows
        .map((row) => `<tr>${headers.map((header) => `<td>${escapeHtmlCell(row[header])}</td>`).join('')}</tr>`)
        .join('');
      const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1">${tableHead}${tableBody}</table></body></html>`;
      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="panel-audit-${now}.xls"`);
      res.end(html);
    } else {
      const lines = [headers.join(',')];
      for (const row of mappedRows) {
        lines.push(headers.map((header) => escapeCsvCell(row[header])).join(','));
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="panel-audit-${now}.csv"`);
      res.end(lines.join('\n'));
    }

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_AUDIT_EXPORT',
      targetType: 'AUDIT_EXPORT',
      targetId: now,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        format: exportFormat,
        filters: parseFiltersFromQuery(req.query?.filters),
        q: safeTrim(req.query?.q),
        row_count: mappedRows.length,
      },
    });
  });
}
