// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import {
  APPLICATION_STATUS,
  CRM_EXPORT_STATUS,
  CREDENTIALS_SMS_STATUS,
  EXAM_STATUS,
  RESULT_STATUS,
  ROLES,
  WA_RESULT_STATUS,
} from '../../_lib/constants.js';
import { query } from '../../_lib/db.js';
import {
  handleRequest,
  methodGuard,
  normalizeArrayFilter,
  parseDateRange,
  parseFiltersFromQuery,
  safeTrim,
} from '../../_lib/http.js';
import { decryptPii, isPrivilegedPiiRole, maskPiiName, maskPiiPhone } from '../../_lib/piiCrypto.js';
import { buildWhereClause } from '../../_lib/sql.js';
import { utils as xlsxUtils, write as xlsxWrite } from 'xlsx';

function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  const asString = String(value);
  if (!/[,"\n]/.test(asString)) return asString;
  return `"${asString.replaceAll('"', '""')}"`;
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
  if (normalized === 'xlsx') return 'xlsx';
  return normalized === 'xls' ? 'xls' : 'csv';
}

function buildFilterState(req) {
  const filters = parseFiltersFromQuery(req.query?.filters);
  const q = safeTrim(req.query?.q);
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
      `(LOWER(student_full_name) LIKE $${params.length} OR LOWER(parent_full_name) LIKE $${params.length} OR LOWER(parent_phone_e164) LIKE $${params.length} OR LOWER(application_no) LIKE $${params.length} OR LOWER(COALESCE(section, '')) LIKE $${params.length})`,
    );
  }

  const schoolNames = normalizeArrayFilter(filters.school_name || filters.school);
  if (schoolNames.length > 0) {
    params.push(schoolNames);
    clauses.push(`school_name = ANY($${params.length})`);
  }

  const schoolQuery = safeTrim(filters.school_query || filters.schoolQuery);
  if (schoolQuery) {
    params.push(`%${schoolQuery.toLowerCase()}%`);
    clauses.push(`LOWER(school_name) LIKE $${params.length}`);
  }

  const attributionSource = safeTrim(filters.attribution_source || filters.attributionSource).toLowerCase();
  if (attributionSource) {
    params.push(`%${attributionSource}%`);
    clauses.push(
      `EXISTS (
        SELECT 1
        FROM activity_events ev
        WHERE ev.candidate_id = candidate_id
          AND ev.event_type = 'ATTRIBUTION_CAPTURED'
          AND LOWER(
            COALESCE(
              ev.event_payload ->> 'utm_source',
              ev.event_payload ->> 'last_touch_utm_source',
              ev.event_payload ->> 'first_touch_utm_source',
              ''
            )
          ) LIKE $${params.length}
      )`,
    );
  }

  const grades = normalizeArrayFilter(filters.grade || filters.grades).map((item) => Number.parseInt(item, 10)).filter(Number.isFinite);
  if (grades.length > 0) {
    params.push(grades);
    clauses.push(`grade = ANY($${params.length})`);
  }

  const applicationStatuses = normalizeArrayFilter(filters.application_status, APPLICATION_STATUS);
  if (applicationStatuses.length > 0) {
    params.push(applicationStatuses);
    clauses.push(`application_status = ANY($${params.length})`);
  }

  const smsStatuses = normalizeArrayFilter(filters.credentials_sms_status, CREDENTIALS_SMS_STATUS);
  if (smsStatuses.length > 0) {
    params.push(smsStatuses);
    clauses.push(`credentials_sms_status = ANY($${params.length})`);
  }

  const loginStatus = normalizeArrayFilter(filters.login_status || filters.loginStatus, ['LOGGED_IN', 'NOT_LOGGED_IN']);
  if (loginStatus.length === 1) {
    clauses.push(loginStatus[0] === 'LOGGED_IN' ? 'first_login_at IS NOT NULL' : 'first_login_at IS NULL');
  }

  const examStatuses = normalizeArrayFilter(filters.exam_status, EXAM_STATUS);
  if (examStatuses.length > 0) {
    params.push(examStatuses);
    clauses.push(`exam_status = ANY($${params.length})`);
  }

  const resultStatuses = normalizeArrayFilter(filters.result_status, RESULT_STATUS);
  if (resultStatuses.length > 0) {
    params.push(resultStatuses);
    clauses.push(`result_status = ANY($${params.length})`);
  }

  const resultViewedStatus = normalizeArrayFilter(filters.result_viewed_status || filters.resultViewedStatus, ['VIEWED', 'NOT_VIEWED']);
  if (resultViewedStatus.length === 1) {
    clauses.push(resultViewedStatus[0] === 'VIEWED' ? 'result_viewed_at IS NOT NULL' : 'result_viewed_at IS NULL');
  }

  const waStatuses = normalizeArrayFilter(filters.wa_result_status, WA_RESULT_STATUS);
  if (waStatuses.length > 0) {
    params.push(waStatuses);
    clauses.push(`wa_result_status = ANY($${params.length})`);
  }

  const crmStatuses = normalizeArrayFilter(filters.crm_export_status || filters.crmExportStatus, CRM_EXPORT_STATUS);
  if (crmStatuses.length > 0) {
    params.push(crmStatuses);
    clauses.push(`crm_export_status = ANY($${params.length}::crm_export_status[])`);
  }

  const range = parseDateRange(filters);
  if (range.from) {
    params.push(range.from);
    clauses.push(`updated_at >= $${params.length}::timestamptz`);
  }
  if (range.to) {
    params.push(range.to);
    clauses.push(`updated_at <= $${params.length}::timestamptz`);
  }

  return {
    whereClause: buildWhereClause(clauses),
    params,
  };
}

function buildHtmlExport(headers, rows) {
  const tableHead = `<tr>${headers.map((header) => `<th>${escapeHtmlCell(header)}</th>`).join('')}</tr>`;
  const tableBody = rows
    .map((row) => `<tr>${headers.map((header) => `<td>${escapeHtmlCell(row[header])}</td>`).join('')}</tr>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1">${tableHead}${tableBody}</table></body></html>`;
}

function buildCsvExport(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvCell(row[header])).join(','));
  }
  return lines.join('\n');
}

function buildXlsxExport(headers, rows) {
  const workbook = xlsxUtils.book_new();
  const worksheet = xlsxUtils.json_to_sheet(rows, { header: headers });
  xlsxUtils.book_append_sheet(workbook, worksheet, 'Candidates');
  return xlsxWrite(workbook, { bookType: 'xlsx', type: 'buffer' });
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY],
      ['PANEL_CANDIDATES_EXPORT'],
    );
    const exportFormat = readExportFormat(req.query?.format);

    const { whereClause, params } = buildFilterState(req);
    const result = await query(
      `
        SELECT
          v.candidate_id,
          v.application_no,
          v.student_full_name AS student_full_name_legacy,
          v.student_full_name_enc,
          v.grade,
          v.section,
          v.school_name,
          v.parent_full_name AS parent_full_name_legacy,
          v.parent_full_name_enc,
          v.parent_phone_e164 AS parent_phone_e164_legacy,
          v.parent_phone_e164_enc,
          v.application_status,
          v.credentials_sms_status,
          v.first_login_at,
          v.exam_status,
          v.exam_started_at,
          v.exam_submitted_at,
          v.exam_scheduled_at,
          v.exam_slot_label,
          v.result_status,
          v.result_score,
          v.result_viewed_at,
          v.wa_result_status,
          appt.appointment_status,
          appt.appointment_status_at,
          appt_booked.appointment_booked_at,
          crm.crm_export_status,
          crm.crm_retry_count,
          crm.crm_processed_at,
          crm.crm_error_code,
          bot.bot_last_trigger,
          bot.bot_last_mode,
          bot.bot_last_status,
          bot.bot_last_enqueued_at,
          bot.bot_last_status_at,
          bot7.bot_followup_count_7d,
          attr.attribution_source,
          attr.attribution_medium,
          attr.attribution_campaign,
          attr.attribution_click_id,
          attr.attribution_captured_at,
          v.last_error_code,
          note.operator_note,
          note.operator_note_at,
          v.updated_at
        FROM v_candidate_operations v
        LEFT JOIN LATERAL (
          SELECT
            CASE ev.event_type
              WHEN 'APPOINTMENT_BOOKED' THEN 'BOOKED'
              WHEN 'APPOINTMENT_ATTENDED' THEN 'ATTENDED'
              WHEN 'APPOINTMENT_NO_SHOW' THEN 'NO_SHOW'
              ELSE NULL
            END AS appointment_status,
            ev.occurred_at AS appointment_status_at
          FROM activity_events ev
          WHERE ev.candidate_id = v.candidate_id
            AND ev.event_type IN ('APPOINTMENT_BOOKED', 'APPOINTMENT_ATTENDED', 'APPOINTMENT_NO_SHOW')
          ORDER BY ev.occurred_at DESC
          LIMIT 1
        ) appt ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            ev.occurred_at AS appointment_booked_at
          FROM activity_events ev
          WHERE ev.candidate_id = v.candidate_id
            AND ev.event_type = 'APPOINTMENT_BOOKED'
          ORDER BY ev.occurred_at DESC
          LIMIT 1
        ) appt_booked ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            ce.status AS crm_export_status,
            ce.retry_count AS crm_retry_count,
            ce.processed_at AS crm_processed_at,
            ce.error_code AS crm_error_code
          FROM crm_export_jobs ce
          WHERE ce.candidate_id = v.candidate_id
          ORDER BY ce.created_at DESC
          LIMIT 1
        ) crm ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            ev.event_payload ->> 'note' AS operator_note,
            ev.occurred_at AS operator_note_at
          FROM activity_events ev
          WHERE ev.candidate_id = v.candidate_id
            AND ev.event_type = 'OPERATOR_NOTE'
          ORDER BY ev.occurred_at DESC
          LIMIT 1
        ) note ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(nj.payload ->> 'trigger', '') AS bot_last_trigger,
            CASE
              WHEN COALESCE(nj.payload ->> 'mode', '') <> '' THEN nj.payload ->> 'mode'
              WHEN COALESCE(nj.payload ->> 'trigger', '') = 'ops_unviewed_results_auto_whatsapp' THEN 'unviewed_result'
              ELSE NULL
            END AS bot_last_mode,
            nj.status AS bot_last_status,
            nj.created_at AS bot_last_enqueued_at,
            nj.updated_at AS bot_last_status_at
          FROM notification_jobs nj
          WHERE nj.candidate_id = v.candidate_id
            AND nj.channel = 'WHATSAPP'
            AND nj.template_code = 'WA_RESULT'
            AND COALESCE(nj.payload ->> 'trigger', '') IN (
              'ops_unviewed_results_auto_whatsapp',
              'ops_viewed_no_appointment_auto_whatsapp',
              'ops_appointment_no_show_auto_whatsapp'
            )
          ORDER BY nj.created_at DESC
          LIMIT 1
        ) bot ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS bot_followup_count_7d
          FROM notification_jobs nj
          WHERE nj.candidate_id = v.candidate_id
            AND nj.channel = 'WHATSAPP'
            AND nj.template_code = 'WA_RESULT'
            AND COALESCE(nj.payload ->> 'trigger', '') IN (
              'ops_unviewed_results_auto_whatsapp',
              'ops_viewed_no_appointment_auto_whatsapp',
              'ops_appointment_no_show_auto_whatsapp'
            )
            AND nj.created_at >= NOW() - INTERVAL '7 days'
        ) bot7 ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            NULLIF(
              COALESCE(
                ev.event_payload ->> 'utm_source',
                ev.event_payload ->> 'last_touch_utm_source',
                ev.event_payload ->> 'first_touch_utm_source',
                ''
              ),
              ''
            ) AS attribution_source,
            NULLIF(
              COALESCE(
                ev.event_payload ->> 'utm_medium',
                ev.event_payload ->> 'last_touch_utm_medium',
                ev.event_payload ->> 'first_touch_utm_medium',
                ''
              ),
              ''
            ) AS attribution_medium,
            NULLIF(
              COALESCE(
                ev.event_payload ->> 'utm_campaign',
                ev.event_payload ->> 'last_touch_utm_campaign',
                ev.event_payload ->> 'first_touch_utm_campaign',
                ''
              ),
              ''
            ) AS attribution_campaign,
            NULLIF(
              COALESCE(
                ev.event_payload ->> 'gclid',
                ev.event_payload ->> 'fbclid',
                ev.event_payload ->> 'msclkid',
                ''
              ),
              ''
            ) AS attribution_click_id,
            ev.occurred_at AS attribution_captured_at
          FROM activity_events ev
          WHERE ev.candidate_id = v.candidate_id
            AND ev.event_type = 'ATTRIBUTION_CAPTURED'
          ORDER BY ev.occurred_at DESC
          LIMIT 1
        ) attr ON TRUE
        ${whereClause}
        ORDER BY v.updated_at DESC
        LIMIT 100000
      `,
      params,
    );

    const headers = [
      'candidate_id',
      'application_no',
      'student_full_name',
      'grade',
      'section',
      'school_name',
      'parent_full_name',
      'parent_phone_e164',
      'application_status',
      'credentials_sms_status',
      'first_login_at',
      'exam_status',
      'exam_started_at',
      'exam_submitted_at',
      'exam_scheduled_at',
      'exam_slot_label',
      'result_status',
      'result_score',
      'result_viewed_at',
      'wa_result_status',
      'appointment_status',
      'appointment_status_at',
      'appointment_booked_at',
      'crm_export_status',
      'crm_retry_count',
      'crm_processed_at',
      'crm_error_code',
      'bot_last_trigger',
      'bot_last_mode',
      'bot_last_status',
      'bot_last_enqueued_at',
      'bot_last_status_at',
      'bot_followup_count_7d',
      'attribution_source',
      'attribution_medium',
      'attribution_campaign',
      'attribution_click_id',
      'attribution_captured_at',
      'last_error_code',
      'operator_note',
      'operator_note_at',
      'updated_at',
    ];

    const piiScopeFull = isPrivilegedPiiRole(identity.role);
    const mappedRows = await Promise.all(
      result.rows.map(async (row) => {
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

    const now = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
    res.status(200);
    if (exportFormat === 'xlsx') {
      const workbookBuffer = buildXlsxExport(headers, mappedRows);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="candidate-operations-${now}.xlsx"`);
      res.end(workbookBuffer);
    } else if (exportFormat === 'xls') {
      const html = buildHtmlExport(headers, mappedRows);
      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="candidate-operations-${now}.xls"`);
      res.end(html);
    } else {
      const csv = buildCsvExport(headers, mappedRows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="candidate-operations-${now}.csv"`);
      res.end(csv);
    }

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_CANDIDATES_EXPORT',
      targetType: 'CANDIDATE_EXPORT',
      targetId: now,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        q: safeTrim(req.query?.q) || null,
        filters: parseFiltersFromQuery(req.query?.filters),
        exportFormat,
        rowCount: mappedRows.length,
        piiScope: piiScopeFull ? 'FULL' : 'MASKED',
      },
    });
  });
}
