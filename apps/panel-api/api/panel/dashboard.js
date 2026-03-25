import { requireRole } from '../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../_lib/auditLog.js';
import { ROLES } from '../_lib/constants.js';
import { query } from '../_lib/db.js';
import { handleRequest, methodGuard, ok, parseDateRange, parseFiltersFromQuery, safeTrim } from '../_lib/http.js';
import { buildWhereClause, pushParam } from '../_lib/sql.js';

function buildCampaignAndDateFilters(filters, params, columnPrefix = '') {
  const clauses = [];
  const campaignCode = safeTrim(filters.campaign_code || filters.campaignCode);
  if (campaignCode) {
    clauses.push(`${columnPrefix}campaign_code = ${pushParam(params, campaignCode)}`);
  }

  const range = parseDateRange(filters);
  if (range.from) {
    clauses.push(`${columnPrefix}created_at >= ${pushParam(params, range.from)}::timestamptz`);
  }
  if (range.to) {
    clauses.push(`${columnPrefix}created_at <= ${pushParam(params, range.to)}::timestamptz`);
  }

  return clauses;
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY],
      ['PANEL_DASHBOARD_READ'],
    );

    const filters = parseFiltersFromQuery(req.query?.filters);
    const params = [];
    const whereBase = buildWhereClause(buildCampaignAndDateFilters(filters, params));

    const [kpiResult, trendResult, channelsResult, schoolDistributionResult, schoolPerformanceResult, dlqResult, criticalErrorsResult] = await Promise.all([
      query(
        `
          WITH base AS (
            SELECT c.id AS candidate_id, c.campaign_code, c.created_at
            FROM candidates c
            ${whereBase}
          ),
          first_login AS (
            SELECT DISTINCT ae.candidate_id
            FROM activity_events ae
            JOIN base b ON b.candidate_id = ae.candidate_id
            WHERE ae.event_type = 'FIRST_LOGIN'
          ),
          latest_attempt AS (
            SELECT DISTINCT ON (ea.candidate_id)
              ea.candidate_id,
              ea.status
            FROM exam_attempts ea
            JOIN base b ON b.candidate_id = ea.candidate_id
            ORDER BY ea.candidate_id, ea.created_at DESC
          ),
          latest_result AS (
            SELECT DISTINCT ON (r.candidate_id)
              r.candidate_id,
              r.status
            FROM results r
            JOIN base b ON b.candidate_id = r.candidate_id
            ORDER BY r.candidate_id, r.created_at DESC
          ),
          latest_sms AS (
            SELECT DISTINCT ON (nj.candidate_id)
              nj.candidate_id,
              nj.status
            FROM notification_jobs nj
            JOIN base b ON b.candidate_id = nj.candidate_id
            WHERE nj.channel = 'SMS'
              AND nj.template_code IN ('CREDENTIALS_SMS', 'LOGIN_CREDENTIALS')
            ORDER BY nj.candidate_id, nj.created_at DESC
          ),
          latest_wa AS (
            SELECT DISTINCT ON (nj.candidate_id)
              nj.candidate_id,
              nj.status
            FROM notification_jobs nj
            JOIN base b ON b.candidate_id = nj.candidate_id
            WHERE nj.channel = 'WHATSAPP'
            ORDER BY nj.candidate_id, nj.created_at DESC
          ),
          bot_followup_last_24h AS (
            SELECT
              COUNT(*)::int AS bot_followup_total_24h,
              COUNT(*) FILTER (
                WHERE COALESCE(nj.payload ->> 'trigger', '') = 'ops_unviewed_results_auto_whatsapp'
              )::int AS bot_followup_unviewed_24h,
              COUNT(*) FILTER (
                WHERE COALESCE(nj.payload ->> 'trigger', '') = 'ops_viewed_no_appointment_auto_whatsapp'
              )::int AS bot_followup_viewed_no_appointment_24h,
              COUNT(*) FILTER (
                WHERE COALESCE(nj.payload ->> 'trigger', '') = 'ops_appointment_no_show_auto_whatsapp'
              )::int AS bot_followup_no_show_24h,
              COUNT(*) FILTER (WHERE nj.status IN ('FAILED', 'DLQ'))::int AS bot_followup_problematic_24h
            FROM notification_jobs nj
            JOIN base b ON b.candidate_id = nj.candidate_id
            WHERE nj.channel = 'WHATSAPP'
              AND nj.template_code = 'WA_RESULT'
              AND COALESCE(nj.payload ->> 'trigger', '') IN (
                'ops_unviewed_results_auto_whatsapp',
                'ops_viewed_no_appointment_auto_whatsapp',
                'ops_appointment_no_show_auto_whatsapp'
              )
              AND nj.created_at >= NOW() - INTERVAL '24 hours'
          )
          SELECT
            (SELECT COUNT(*)::int FROM base) AS total_applications,
            (
              SELECT ROUND(100.0 * AVG(CASE WHEN ls.status IN ('SENT', 'DELIVERED', 'READ') THEN 1 ELSE 0 END), 2)
              FROM base b
              LEFT JOIN latest_sms ls ON ls.candidate_id = b.candidate_id
            ) AS sms_success_rate,
            (SELECT ROUND(100.0 * COUNT(*)::numeric / NULLIF((SELECT COUNT(*) FROM base), 0), 2) FROM first_login) AS first_login_rate,
            (
              SELECT ROUND(100.0 * AVG(CASE WHEN la.status IN ('SUBMITTED', 'TIMEOUT') THEN 1 ELSE 0 END), 2)
              FROM base b
              LEFT JOIN latest_attempt la ON la.candidate_id = b.candidate_id
            ) AS exam_completion_rate,
            (
              SELECT ROUND(100.0 * AVG(CASE WHEN lr.status = 'VIEWED' THEN 1 ELSE 0 END), 2)
              FROM base b
              LEFT JOIN latest_result lr ON lr.candidate_id = b.candidate_id
            ) AS result_view_rate,
            (
              SELECT ROUND(100.0 * AVG(CASE WHEN lw.status IN ('DELIVERED', 'READ') THEN 1 ELSE 0 END), 2)
              FROM base b
              LEFT JOIN latest_wa lw ON lw.candidate_id = b.candidate_id
            ) AS wa_delivery_rate,
            (SELECT bot_followup_total_24h FROM bot_followup_last_24h) AS bot_followup_total_24h,
            (SELECT bot_followup_unviewed_24h FROM bot_followup_last_24h) AS bot_followup_unviewed_24h,
            (SELECT bot_followup_viewed_no_appointment_24h FROM bot_followup_last_24h) AS bot_followup_viewed_no_appointment_24h,
            (SELECT bot_followup_no_show_24h FROM bot_followup_last_24h) AS bot_followup_no_show_24h,
            (SELECT bot_followup_problematic_24h FROM bot_followup_last_24h) AS bot_followup_problematic_24h
        `,
        params,
      ),
      query(
        `
          SELECT
            DATE_TRUNC('hour', created_at) AS hour,
            COUNT(*)::int AS application_count
          FROM candidates
          ${whereBase}
          GROUP BY DATE_TRUNC('hour', created_at)
          ORDER BY hour DESC
          LIMIT 24
        `,
        params,
      ),
      query(
        `
          SELECT
            channel,
            status,
            COUNT(*)::int AS count
          FROM notification_jobs
          ${whereBase.replace(/created_at/g, 'notification_jobs.created_at').replace(/campaign_code/g, 'notification_jobs.campaign_code')}
          GROUP BY channel, status
          ORDER BY channel, status
        `,
        params,
      ),
      query(
        `
          SELECT
            COALESCE(s.name, 'Belirtilmedi') AS school_name,
            c.grade,
            COUNT(*)::int AS candidate_count
          FROM candidates c
          LEFT JOIN schools s ON s.id = c.school_id
          ${whereBase.replace(/created_at/g, 'c.created_at').replace(/campaign_code/g, 'c.campaign_code')}
          GROUP BY school_name, c.grade
          ORDER BY candidate_count DESC
          LIMIT 100
        `,
        params,
      ),
      query(
        `
          WITH base AS (
            SELECT
              c.id AS candidate_id,
              c.grade,
              COALESCE(s.name, 'Belirtilmedi') AS school_name
            FROM candidates c
            LEFT JOIN schools s ON s.id = c.school_id
            ${whereBase.replace(/created_at/g, 'c.created_at').replace(/campaign_code/g, 'c.campaign_code')}
          ),
          latest_result AS (
            SELECT DISTINCT ON (r.candidate_id)
              r.candidate_id,
              r.status
            FROM results r
            JOIN base b ON b.candidate_id = r.candidate_id
            ORDER BY r.candidate_id, r.created_at DESC
          ),
          latest_appointment AS (
            SELECT DISTINCT ON (ev.candidate_id)
              ev.candidate_id,
              CASE ev.event_type
                WHEN 'APPOINTMENT_BOOKED' THEN 'BOOKED'
                WHEN 'APPOINTMENT_ATTENDED' THEN 'ATTENDED'
                WHEN 'APPOINTMENT_NO_SHOW' THEN 'NO_SHOW'
                ELSE NULL
              END AS appointment_status
            FROM activity_events ev
            JOIN base b ON b.candidate_id = ev.candidate_id
            WHERE ev.event_type IN ('APPOINTMENT_BOOKED', 'APPOINTMENT_ATTENDED', 'APPOINTMENT_NO_SHOW')
            ORDER BY ev.candidate_id, ev.occurred_at DESC
          ),
          latest_crm AS (
            SELECT DISTINCT ON (ce.candidate_id)
              ce.candidate_id,
              ce.status
            FROM crm_export_jobs ce
            JOIN base b ON b.candidate_id = ce.candidate_id
            ORDER BY ce.candidate_id, ce.created_at DESC
          ),
          enriched AS (
            SELECT
              b.school_name,
              b.candidate_id,
              COALESCE(NULLIF(b.grade::text, ''), 'Bilinmiyor') AS grade_label,
              COALESCE(lr.status::text, 'NOT_PUBLISHED') AS result_status,
              COALESCE(la.appointment_status, 'NONE') AS appointment_status,
              COALESCE(lc.status::text, 'NOT_QUEUED') AS crm_status
            FROM base b
            LEFT JOIN latest_result lr ON lr.candidate_id = b.candidate_id
            LEFT JOIN latest_appointment la ON la.candidate_id = b.candidate_id
            LEFT JOIN latest_crm lc ON lc.candidate_id = b.candidate_id
          ),
          school_grade_stats AS (
            SELECT
              school_name,
              grade_label,
              COUNT(*)::int AS grade_count
            FROM enriched
            GROUP BY school_name, grade_label
          )
          SELECT
            e.school_name,
            COUNT(*)::int AS total_applications,
            (
              SELECT jsonb_object_agg(sgs.grade_label, sgs.grade_count)
              FROM school_grade_stats sgs
              WHERE sgs.school_name = e.school_name
            ) AS class_distribution,
            COUNT(*) FILTER (WHERE e.result_status <> 'VIEWED')::int AS unviewed_results,
            COUNT(*) FILTER (WHERE e.appointment_status = 'NO_SHOW')::int AS appointment_no_show,
            COUNT(*) FILTER (WHERE e.crm_status IN ('FAILED', 'RETRYING', 'DLQ'))::int AS crm_problematic,
            COUNT(*) FILTER (
              WHERE e.result_status <> 'VIEWED'
                OR e.appointment_status = 'NO_SHOW'
                OR e.crm_status IN ('FAILED', 'RETRYING', 'DLQ')
            )::int AS follow_up_needed
          FROM enriched e
          GROUP BY e.school_name
          ORDER BY follow_up_needed DESC, total_applications DESC
          LIMIT 25
        `,
        params,
      ),
      query(
        `
          SELECT
            COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_dlq_jobs,
            COUNT(*) FILTER (WHERE status <> 'CLOSED')::int AS active_dlq_jobs,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 minutes')::int AS last_30m_failures
          FROM dlq_jobs
          ${whereBase.replace(/created_at/g, 'dlq_jobs.created_at').replace(/campaign_code/g, 'dlq_jobs.campaign_code')}
        `,
        params,
      ),
      query(
        `
          SELECT
            COALESCE(error_code, 'unknown') AS error_code,
            COUNT(*)::int AS count
          FROM dlq_jobs
          ${whereBase.replace(/created_at/g, 'dlq_jobs.created_at').replace(/campaign_code/g, 'dlq_jobs.campaign_code')}
          GROUP BY error_code
          ORDER BY count DESC
          LIMIT 5
        `,
        params,
      ),
    ]);

    const kpi = kpiResult.rows[0] || {};
    const dlq = dlqResult.rows[0] || {};

    ok(res, {
      summary: {
        total_applications: Number(kpi.total_applications || 0),
        sms_success_rate: Number(kpi.sms_success_rate || 0),
        first_login_rate: Number(kpi.first_login_rate || 0),
        exam_completion_rate: Number(kpi.exam_completion_rate || 0),
        result_view_rate: Number(kpi.result_view_rate || 0),
        wa_delivery_rate: Number(kpi.wa_delivery_rate || 0),
        bot_followup_total_24h: Number(kpi.bot_followup_total_24h || 0),
        bot_followup_unviewed_24h: Number(kpi.bot_followup_unviewed_24h || 0),
        bot_followup_viewed_no_appointment_24h: Number(kpi.bot_followup_viewed_no_appointment_24h || 0),
        bot_followup_no_show_24h: Number(kpi.bot_followup_no_show_24h || 0),
        bot_followup_problematic_24h: Number(kpi.bot_followup_problematic_24h || 0),
      },
      operations: {
        open_dlq_jobs: Number(dlq.open_dlq_jobs || 0),
        active_dlq_jobs: Number(dlq.active_dlq_jobs || 0),
        last_30m_failures: Number(dlq.last_30m_failures || 0),
        critical_error_codes: criticalErrorsResult.rows,
      },
      hourly_application_trend: trendResult.rows
        .map((row) => ({
          hour: row.hour,
          application_count: row.application_count,
        }))
        .reverse(),
      channel_status_distribution: channelsResult.rows,
      school_grade_distribution: schoolDistributionResult.rows,
      school_performance: schoolPerformanceResult.rows,
    });

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_DASHBOARD_READ',
      targetType: 'DASHBOARD',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        filters,
      },
    });
  });
}
