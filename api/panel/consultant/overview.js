// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { query } from '../../_lib/db.js';
import { decryptPii, isPrivilegedPiiRole, maskPiiName } from '../../_lib/piiCrypto.js';
import {
  handleRequest,
  methodGuard,
  normalizeArrayFilter,
  ok,
  parseListQuery,
  safeTrim,
} from '../../_lib/http.js';
import { buildWhereClause, toSqlOrder } from '../../_lib/sql.js';

const SORT_COLUMN_MAP = {
  updated_at: 'e.updated_at',
  follow_up_needed: 'e.follow_up_needed',
  school_name: "COALESCE(e.school_name, '')",
  owner_name: "COALESCE(e.owner_name, '')",
  appointment_status_at: 'e.appointment_status_at',
  result_score: 'e.result_score',
};

const APPOINTMENT_STATUS = ['BOOKED', 'ATTENDED', 'NO_SHOW', 'NONE'];

function readBooleanFlag(rawValue, fallback = false) {
  const value = safeTrim(rawValue).toLowerCase();
  if (!value) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
}

function buildFilters(listQuery) {
  const { q, filters } = listQuery;
  const params = [];
  const clauses = [];

  const campaignCode = safeTrim(filters.campaign_code || filters.campaignCode);
  if (campaignCode) {
    params.push(campaignCode);
    clauses.push(`e.campaign_code = $${params.length}`);
  }

  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    clauses.push(
      `(LOWER(COALESCE(e.student_full_name_legacy, '')) LIKE $${params.length}
        OR LOWER(COALESCE(e.application_no, '')) LIKE $${params.length}
        OR LOWER(COALESCE(e.school_name, '')) LIKE $${params.length}
        OR LOWER(COALESCE(e.owner_name, '')) LIKE $${params.length})`,
    );
  }

  const schoolQuery = safeTrim(filters.school_query || filters.schoolQuery || filters.school_name || filters.schoolName);
  if (schoolQuery) {
    params.push(`%${schoolQuery.toLowerCase()}%`);
    clauses.push(`LOWER(COALESCE(e.school_name, '')) LIKE $${params.length}`);
  }

  const ownerId = safeTrim(filters.owner_id || filters.ownerId);
  if (ownerId) {
    if (ownerId === '__unassigned__') {
      clauses.push('e.owner_id IS NULL');
    } else {
      params.push(ownerId);
      clauses.push(`e.owner_id = $${params.length}`);
    }
  }

  const ownerRole = safeTrim(filters.owner_role || filters.ownerRole).toUpperCase();
  if (ownerRole) {
    if (ownerRole === 'UNASSIGNED') {
      clauses.push('e.owner_id IS NULL');
    } else {
      params.push(ownerRole);
      clauses.push(`UPPER(COALESCE(e.owner_role, '')) = $${params.length}`);
    }
  }

  const followUpOnly = readBooleanFlag(filters.follow_up_only ?? filters.followUpOnly, false);
  if (followUpOnly) {
    clauses.push('e.follow_up_needed = TRUE');
  }

  const followUpState = safeTrim(filters.follow_up_state || filters.followUpState).toUpperCase();
  if (followUpState === 'NEEDED') {
    clauses.push('e.follow_up_needed = TRUE');
  } else if (followUpState === 'CLEAR') {
    clauses.push('e.follow_up_needed = FALSE');
  }

  const appointmentStatuses = normalizeArrayFilter(filters.appointment_status || filters.appointmentStatus, APPOINTMENT_STATUS);
  if (appointmentStatuses.length > 0) {
    params.push(appointmentStatuses);
    clauses.push(`COALESCE(e.appointment_status, 'NONE') = ANY($${params.length})`);
  }

  return {
    whereClause: buildWhereClause(clauses),
    params,
  };
}

function buildEnrichedCteSql() {
  return `
    WITH base AS (
      SELECT
        v.candidate_id,
        v.application_no,
        v.student_full_name AS student_full_name_legacy,
        v.student_full_name_enc,
        v.school_name,
        v.grade,
        v.section,
        v.result_score,
        v.result_status,
        v.result_viewed_at,
        v.updated_at,
        v.campaign_code,
        appt.appointment_status,
        appt.appointment_status_at,
        appt_booked.appointment_booked_at,
        crm.crm_export_status,
        note.operator_note
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
        SELECT ev.occurred_at AS appointment_booked_at
        FROM activity_events ev
        WHERE ev.candidate_id = v.candidate_id
          AND ev.event_type = 'APPOINTMENT_BOOKED'
        ORDER BY ev.occurred_at DESC
        LIMIT 1
      ) appt_booked ON TRUE
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
          NULLIF(BTRIM(ev.event_payload ->> 'note'), '') AS operator_note
        FROM activity_events ev
        WHERE ev.candidate_id = v.candidate_id
          AND ev.event_type = 'OPERATOR_NOTE'
        ORDER BY ev.occurred_at DESC
        LIMIT 1
      ) note ON TRUE
    ),
    base_candidates AS (
      SELECT candidate_id::text AS candidate_id_text
      FROM base
    ),
    owner_audit AS (
      SELECT
        candidate_item.value AS candidate_id_text,
        al.actor_id,
        al.actor_role,
        NULLIF(BTRIM(al.metadata ->> 'actorName'), '') AS actor_name,
        al.created_at,
        al.seq,
        ROW_NUMBER() OVER (
          PARTITION BY candidate_item.value
          ORDER BY al.created_at DESC, al.seq DESC
        ) AS rn
      FROM audit_log_entries al
      JOIN LATERAL jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(al.metadata -> 'candidateIds') = 'array' THEN al.metadata -> 'candidateIds'
          ELSE '[]'::jsonb
        END
      ) candidate_item(value) ON TRUE
      JOIN base_candidates bc ON bc.candidate_id_text = candidate_item.value
      WHERE al.actor_type = 'PANEL_USER'
        AND al.action IN (
          'PANEL_CANDIDATE_NOTE_ADD',
          'PANEL_CANDIDATE_APPOINTMENT_BOOKED',
          'PANEL_CANDIDATE_APPOINTMENT_ATTENDED',
          'PANEL_CANDIDATE_APPOINTMENT_NO_SHOW',
          'PANEL_CANDIDATE_SMS_RETRY',
          'PANEL_CANDIDATE_WA_SEND',
          'PANEL_UNVIEWED_RESULTS_WA_SEND',
          'PANEL_UNVIEWED_RESULTS_BOT_SCAN'
        )
    ),
    owner_latest AS (
      SELECT
        oa.candidate_id_text,
        oa.actor_id AS owner_id,
        COALESCE(oa.actor_name, NULLIF(BTRIM(au.full_name), ''), NULLIF(BTRIM(au.email), '')) AS owner_name,
        NULLIF(BTRIM(oa.actor_role), '') AS owner_role,
        oa.created_at AS owner_assigned_at
      FROM owner_audit oa
      LEFT JOIN admin_users au ON au.id::text = oa.actor_id
      WHERE oa.rn = 1
    ),
    enriched AS (
      SELECT
        b.candidate_id,
        b.application_no,
        b.student_full_name_legacy,
        b.student_full_name_enc,
        b.school_name,
        b.grade,
        b.section,
        b.result_score,
        b.result_status,
        b.result_viewed_at,
        b.appointment_status,
        b.appointment_status_at,
        b.appointment_booked_at,
        b.crm_export_status,
        b.operator_note,
        b.updated_at,
        b.campaign_code,
        ol.owner_id,
        ol.owner_name,
        ol.owner_role,
        ol.owner_assigned_at,
        (
          COALESCE(b.result_status, 'NOT_READY') <> 'VIEWED'
          OR COALESCE(b.appointment_status, 'NONE') = 'NO_SHOW'
          OR COALESCE(b.crm_export_status, 'NOT_QUEUED') IN ('FAILED', 'RETRYING', 'DLQ')
          OR (
            COALESCE(b.result_status, 'NOT_READY') = 'VIEWED'
            AND COALESCE(b.appointment_status, 'NONE') = 'NONE'
          )
        ) AS follow_up_needed,
        (COALESCE(b.result_status, 'NOT_READY') = 'VIEWED' AND COALESCE(b.appointment_status, 'NONE') = 'NONE') AS viewed_no_appointment,
        (COALESCE(b.result_status, 'NOT_READY') <> 'VIEWED') AS unviewed_result
      FROM base b
      LEFT JOIN owner_latest ol ON ol.candidate_id_text = b.candidate_id::text
    )
  `;
}

function cleanupItem(row) {
  const {
    student_full_name_legacy: _legacy,
    student_full_name_enc: _enc,
    ...rest
  } = row;
  return rest;
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY],
      ['PANEL_CANDIDATES_READ'],
    );

    const listQuery = parseListQuery(req, Object.keys(SORT_COLUMN_MAP), 'updated_at', 'desc');
    const { whereClause, params } = buildFilters(listQuery);
    const sortColumn = SORT_COLUMN_MAP[listQuery.sortBy] || SORT_COLUMN_MAP.updated_at;
    const sortOrder = toSqlOrder(listQuery.sortOrder);
    const cte = buildEnrichedCteSql();

    const listParams = [...params];
    listParams.push(listQuery.perPage);
    const limitIndex = listParams.length;
    listParams.push(listQuery.offset);
    const offsetIndex = listParams.length;

    const [dataResult, countResult, summaryResult, schoolResult, ownershipResult] = await Promise.all([
      query(
        `
          ${cte}
          SELECT
            e.candidate_id,
            e.application_no,
            e.student_full_name_legacy,
            e.student_full_name_enc,
            e.school_name,
            e.grade,
            e.section,
            e.result_score,
            e.result_status,
            e.result_viewed_at,
            e.appointment_status,
            e.appointment_status_at,
            e.appointment_booked_at,
            e.crm_export_status,
            e.operator_note,
            e.updated_at,
            e.owner_id,
            COALESCE(e.owner_name, 'Unassigned') AS owner_name,
            COALESCE(e.owner_role, 'UNASSIGNED') AS owner_role,
            e.owner_assigned_at,
            e.follow_up_needed,
            e.unviewed_result,
            e.viewed_no_appointment
          FROM enriched e
          ${whereClause}
          ORDER BY ${sortColumn} ${sortOrder} NULLS LAST, e.updated_at DESC
          LIMIT $${limitIndex}
          OFFSET $${offsetIndex}
        `,
        listParams,
      ),
      query(
        `
          ${cte}
          SELECT COUNT(*)::int AS total
          FROM enriched e
          ${whereClause}
        `,
        params,
      ),
      query(
        `
          ${cte}
          SELECT
            COUNT(*)::int AS total_candidates,
            COUNT(*) FILTER (WHERE e.follow_up_needed)::int AS follow_up_needed,
            COUNT(*) FILTER (WHERE COALESCE(e.appointment_status, 'NONE') = 'BOOKED')::int AS appointment_booked,
            COUNT(*) FILTER (WHERE COALESCE(e.appointment_status, 'NONE') = 'ATTENDED')::int AS appointment_attended,
            COUNT(*) FILTER (WHERE COALESCE(e.appointment_status, 'NONE') = 'NO_SHOW')::int AS appointment_no_show,
            COUNT(*) FILTER (WHERE e.owner_id IS NOT NULL)::int AS owner_assigned,
            COUNT(*) FILTER (WHERE e.unviewed_result)::int AS unviewed_results,
            COUNT(*) FILTER (WHERE e.viewed_no_appointment)::int AS viewed_no_appointment,
            COUNT(*) FILTER (
              WHERE DATE_TRUNC('day', COALESCE(e.appointment_status_at, e.appointment_booked_at, e.updated_at) AT TIME ZONE 'Europe/Istanbul')
                = DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Istanbul')
            )::int AS today_flow
          FROM enriched e
          ${whereClause}
        `,
        params,
      ),
      query(
        `
          ${cte}
          SELECT
            COALESCE(e.school_name, 'Belirtilmedi') AS school_name,
            COUNT(*)::int AS total_candidates,
            COUNT(*) FILTER (WHERE e.follow_up_needed)::int AS follow_up_needed,
            COUNT(*) FILTER (WHERE COALESCE(e.appointment_status, 'NONE') = 'NO_SHOW')::int AS appointment_no_show,
            COUNT(*) FILTER (WHERE e.unviewed_result)::int AS unviewed_results,
            COUNT(*) FILTER (WHERE e.viewed_no_appointment)::int AS viewed_no_appointment
          FROM enriched e
          ${whereClause}
          GROUP BY COALESCE(e.school_name, 'Belirtilmedi')
          ORDER BY follow_up_needed DESC, total_candidates DESC
          LIMIT 50
        `,
        params,
      ),
      query(
        `
          ${cte}
          SELECT
            e.owner_id,
            COALESCE(e.owner_name, 'Unassigned') AS owner_name,
            COALESCE(e.owner_role, 'UNASSIGNED') AS owner_role,
            COUNT(*)::int AS total_candidates,
            COUNT(*) FILTER (WHERE e.follow_up_needed)::int AS follow_up_needed,
            COUNT(*) FILTER (WHERE COALESCE(e.appointment_status, 'NONE') = 'NO_SHOW')::int AS appointment_no_show,
            COUNT(*) FILTER (WHERE e.unviewed_result)::int AS unviewed_results,
            COUNT(*) FILTER (WHERE e.viewed_no_appointment)::int AS viewed_no_appointment,
            MAX(e.owner_assigned_at) AS last_assignment_at
          FROM enriched e
          ${whereClause}
          GROUP BY e.owner_id, COALESCE(e.owner_name, 'Unassigned'), COALESCE(e.owner_role, 'UNASSIGNED')
          ORDER BY follow_up_needed DESC, total_candidates DESC
          LIMIT 100
        `,
        params,
      ),
    ]);

    const piiScopeFull = isPrivilegedPiiRole(identity.role);
    const items = await Promise.all(
      dataResult.rows.map(async (row) => {
        const studentFullNameRaw = await decryptPii(row.student_full_name_enc, row.student_full_name_legacy);
        return {
          ...row,
          student_full_name: piiScopeFull ? studentFullNameRaw : maskPiiName(studentFullNameRaw),
        };
      }),
    );

    ok(res, {
      items: items.map(cleanupItem),
      total: Number(countResult.rows[0]?.total || 0),
      page: listQuery.page,
      per_page: listQuery.perPage,
      summary: summaryResult.rows[0] || {},
      school_performance: schoolResult.rows || [],
      ownership: ownershipResult.rows || [],
    });

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_CONSULTANT_OVERVIEW_READ',
      targetType: 'CONSULTANT_OVERVIEW',
      targetId: `${listQuery.page}:${listQuery.perPage}`,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        q: listQuery.q || null,
        filters: listQuery.filters,
        returned: items.length,
        total: Number(countResult.rows[0]?.total || 0),
        piiScope: piiScopeFull ? 'FULL' : 'MASKED',
      },
    });
  });
}
