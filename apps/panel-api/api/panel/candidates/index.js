import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import {
  APPLICATION_STATUS,
  CANDIDATE_GRID_COLUMNS,
  CRM_EXPORT_STATUS,
  CREDENTIALS_SMS_STATUS,
  EXAM_STATUS,
  RESULT_STATUS,
  ROLES,
  WA_RESULT_STATUS,
} from '../../_lib/constants.js';
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

const SORT_COLUMN_MAP = {
  candidate_id: 'candidate_id',
  application_no: 'application_no',
  student_full_name: 'student_full_name',
  grade: 'grade',
  section: 'section',
  school_name: 'school_name',
  parent_full_name: 'parent_full_name',
  parent_phone_e164: 'parent_phone_e164',
  application_status: 'application_status',
  credentials_sms_status: 'credentials_sms_status',
  first_login_at: 'first_login_at',
  exam_status: 'exam_status',
  exam_started_at: 'exam_started_at',
  exam_submitted_at: 'exam_submitted_at',
  exam_scheduled_at: 'exam_scheduled_at',
  exam_slot_label: 'exam_slot_label',
  result_status: 'result_status',
  result_score: 'result_score',
  result_viewed_at: 'result_viewed_at',
  wa_result_status: 'wa_result_status',
  appointment_status: 'appointment_status',
  appointment_status_at: 'appointment_status_at',
  appointment_booked_at: 'appointment_booked_at',
  crm_export_status: 'crm_export_status',
  crm_retry_count: 'crm_retry_count',
  crm_processed_at: 'crm_processed_at',
  crm_error_code: 'crm_error_code',
  bot_last_trigger: 'bot_last_trigger',
  bot_last_mode: 'bot_last_mode',
  bot_last_status: 'bot_last_status',
  bot_last_enqueued_at: 'bot_last_enqueued_at',
  bot_last_status_at: 'bot_last_status_at',
  bot_followup_count_7d: 'bot_followup_count_7d',
  attribution_source: 'attribution_source',
  attribution_medium: 'attribution_medium',
  attribution_campaign: 'attribution_campaign',
  attribution_captured_at: 'attribution_captured_at',
  last_error_code: 'last_error_code',
  operator_note_at: 'operator_note_at',
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
      `(LOWER(student_full_name) LIKE $${params.length} OR LOWER(parent_full_name) LIKE $${params.length} OR LOWER(parent_phone_e164) LIKE $${params.length} OR LOWER(application_no) LIKE $${params.length} OR LOWER(COALESCE(section, '')) LIKE $${params.length})`,
    );
  }

  const schools = normalizeArrayFilter(filters.school_name || filters.school);
  appendInFilter(clauses, params, 'school_name', schools);

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
  appendInFilter(clauses, params, 'grade', grades);

  appendInFilter(
    clauses,
    params,
    'application_status',
    normalizeArrayFilter(filters.application_status, APPLICATION_STATUS),
  );
  appendInFilter(
    clauses,
    params,
    'credentials_sms_status',
    normalizeArrayFilter(filters.credentials_sms_status, CREDENTIALS_SMS_STATUS),
  );

  const loginStatus = normalizeArrayFilter(filters.login_status || filters.loginStatus, ['LOGGED_IN', 'NOT_LOGGED_IN']);
  if (loginStatus.length === 1) {
    clauses.push(loginStatus[0] === 'LOGGED_IN' ? 'first_login_at IS NOT NULL' : 'first_login_at IS NULL');
  }

  appendInFilter(clauses, params, 'exam_status', normalizeArrayFilter(filters.exam_status, EXAM_STATUS));
  appendInFilter(clauses, params, 'result_status', normalizeArrayFilter(filters.result_status, RESULT_STATUS));

  const resultViewedStatus = normalizeArrayFilter(filters.result_viewed_status || filters.resultViewedStatus, ['VIEWED', 'NOT_VIEWED']);
  if (resultViewedStatus.length === 1) {
    clauses.push(resultViewedStatus[0] === 'VIEWED' ? 'result_viewed_at IS NOT NULL' : 'result_viewed_at IS NULL');
  }

  appendInFilter(clauses, params, 'wa_result_status', normalizeArrayFilter(filters.wa_result_status, WA_RESULT_STATUS));
  appendInFilter(
    clauses,
    params,
    'crm_export_status',
    normalizeArrayFilter(filters.crm_export_status || filters.crmExportStatus, CRM_EXPORT_STATUS),
  );

  addDateRangeFilter(clauses, params, 'updated_at', parseDateRange(filters));

  return { whereClause: buildWhereClause(clauses), params };
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY],
      ['PANEL_CANDIDATES_READ'],
    );

    const listQuery = parseListQuery(req, CANDIDATE_GRID_COLUMNS, 'updated_at', 'desc');
    const { whereClause, params } = buildFilters(listQuery);
    const sortColumn = SORT_COLUMN_MAP[listQuery.sortBy] || SORT_COLUMN_MAP.updated_at;
    const sortOrder = toSqlOrder(listQuery.sortOrder);

    params.push(listQuery.perPage);
    const limitIndex = params.length;
    params.push(listQuery.offset);
    const offsetIndex = params.length;

    const dataResult = await query(
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
        ORDER BY ${sortColumn} ${sortOrder} NULLS LAST
        LIMIT $${limitIndex}
        OFFSET $${offsetIndex}
      `,
      params,
    );

    const countResult = await query(
      `
        SELECT COUNT(*)::int AS total
        FROM v_candidate_operations
        ${whereClause}
      `,
      params.slice(0, -2),
    );

    const summaryResult = await query(
      `
        SELECT
          COUNT(*)::int AS total_candidates,
          COUNT(*) FILTER (WHERE exam_status IN ('SUBMITTED', 'TIMEOUT'))::int AS exam_completed,
          COUNT(*) FILTER (WHERE result_status = 'VIEWED')::int AS result_viewed,
          COUNT(*) FILTER (WHERE wa_result_status IN ('FAILED', 'DLQ'))::int AS wa_problematic,
          COUNT(*) FILTER (WHERE appt.appointment_status = 'BOOKED')::int AS appointment_booked,
          COUNT(*) FILTER (WHERE appt.appointment_status = 'NO_SHOW')::int AS appointment_no_show,
          COUNT(*) FILTER (WHERE crm.crm_export_status = 'SUCCEEDED')::int AS crm_succeeded,
          COUNT(*) FILTER (WHERE crm.crm_export_status IN ('QUEUED', 'PROCESSING', 'RETRYING'))::int AS crm_pending,
          COUNT(*) FILTER (WHERE crm.crm_export_status IN ('FAILED', 'DLQ'))::int AS crm_problematic,
          COUNT(*) FILTER (WHERE bot.bot_last_status IN ('QUEUED', 'RETRYING', 'SENT', 'DELIVERED', 'READ'))::int AS bot_followup_active,
          COUNT(*) FILTER (WHERE bot.bot_last_status IN ('FAILED', 'DLQ'))::int AS bot_followup_problematic,
          COUNT(*) FILTER (WHERE bot7.bot_followup_count_7d > 0)::int AS bot_followup_recent_candidates,
          COALESCE(SUM(bot7.bot_followup_count_7d), 0)::int AS bot_followup_events_7d
        FROM v_candidate_operations v
        LEFT JOIN LATERAL (
          SELECT
            CASE ev.event_type
              WHEN 'APPOINTMENT_BOOKED' THEN 'BOOKED'
              WHEN 'APPOINTMENT_ATTENDED' THEN 'ATTENDED'
              WHEN 'APPOINTMENT_NO_SHOW' THEN 'NO_SHOW'
              ELSE NULL
            END AS appointment_status
          FROM activity_events ev
          WHERE ev.candidate_id = v.candidate_id
            AND ev.event_type IN ('APPOINTMENT_BOOKED', 'APPOINTMENT_ATTENDED', 'APPOINTMENT_NO_SHOW')
          ORDER BY ev.occurred_at DESC
          LIMIT 1
        ) appt ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            ce.status AS crm_export_status
          FROM crm_export_jobs ce
          WHERE ce.candidate_id = v.candidate_id
          ORDER BY ce.created_at DESC
          LIMIT 1
        ) crm ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            nj.status AS bot_last_status
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
        ${whereClause}
      `,
      params.slice(0, -2),
    );

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
        };
      }),
    );

    ok(
      res,
      buildListResponse({
        items: items.map((item) => {
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
        }),
        total: Number(countResult.rows[0]?.total || 0),
        page: listQuery.page,
        perPage: listQuery.perPage,
        summary: summaryResult.rows[0] || {},
      }),
    );

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_CANDIDATES_READ',
      targetType: 'CANDIDATE_LIST',
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
