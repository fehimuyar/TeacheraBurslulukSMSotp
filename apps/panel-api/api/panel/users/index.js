import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { query } from '../../_lib/db.js';
import { handleRequest, methodGuard, ok } from '../../_lib/http.js';
import {
  fallbackRoleName,
  normalizeRoleCode,
  normalizeRoleCodes,
  roleSortValue,
} from '../../_lib/panelUsers.js';
import { ROLES } from '../../_lib/constants.js';

function sortUsers(left, right) {
  const leftRole = roleSortValue(left.role_code);
  const rightRole = roleSortValue(right.role_code);
  if (leftRole !== rightRole) return leftRole - rightRole;
  const leftName = String(left.full_name || '').toLocaleLowerCase('tr-TR');
  const rightName = String(right.full_name || '').toLocaleLowerCase('tr-TR');
  return leftName.localeCompare(rightName, 'tr');
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    const identity = await requireRole(req, [ROLES.SUPER_ADMIN]);

    const [usersResult, summaryResult] = await Promise.all([
      query(
        `
          SELECT
            u.id::text AS user_id,
            lower(u.email) AS email,
            u.full_name,
            NULLIF(regexp_replace(COALESCE(to_jsonb(u) ->> 'tckn', ''), '\\D', '', 'g'), '') AS tckn,
            NULLIF(COALESCE(to_jsonb(u) ->> 'phone_e164', ''), '') AS phone_e164,
            u.status,
            u.created_at,
            NULLIF(COALESCE(to_jsonb(u) ->> 'last_login_at', ''), '') AS last_login_at,
            COALESCE((to_jsonb(u) ->> 'password_reset_required')::boolean, FALSE) AS password_reset_required,
            COALESCE((to_jsonb(u) ->> 'mfa_enabled')::boolean, FALSE) AS mfa_enabled,
            COALESCE(primary_role.role_code, '') AS primary_role_code,
            COALESCE(primary_role.role_name, '') AS primary_role_name,
            COALESCE(session_counts.active_session_count, 0)::int AS active_session_count,
            COALESCE(
              array_agg(DISTINCT role_list.role_code) FILTER (WHERE role_list.role_code IS NOT NULL),
              ARRAY[]::text[]
            ) AS role_codes
          FROM admin_users u
          LEFT JOIN LATERAL (
            SELECT
              r.code AS role_code,
              COALESCE(NULLIF(BTRIM(r.name), ''), r.code) AS role_name
            FROM admin_user_roles ur
            JOIN roles r ON r.id = ur.role_id
            WHERE ur.admin_user_id = u.id
            ORDER BY
              CASE r.code
                WHEN 'SUPER_ADMIN' THEN 0
                WHEN 'OPERATIONS' THEN 1
                WHEN 'READ_ONLY' THEN 2
                ELSE 10
              END,
              r.name ASC,
              r.code ASC
            LIMIT 1
          ) primary_role ON TRUE
          LEFT JOIN LATERAL (
            SELECT
              r.code AS role_code
            FROM admin_user_roles ur
            JOIN roles r ON r.id = ur.role_id
            WHERE ur.admin_user_id = u.id
          ) role_list ON TRUE
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS active_session_count
            FROM admin_sessions s
            WHERE s.admin_user_id = u.id
              AND s.revoked_at IS NULL
              AND s.expires_at > NOW()
          ) session_counts ON TRUE
          GROUP BY
            u.id,
            u.email,
            u.full_name,
            u.status,
            u.created_at,
            primary_role.role_code,
            primary_role.role_name,
            session_counts.active_session_count
        `,
      ),
      query(
        `
          SELECT
            COUNT(*)::int AS total_users,
            COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_users,
            COUNT(*) FILTER (WHERE status <> 'ACTIVE')::int AS suspended_users,
            COUNT(*) FILTER (
              WHERE COALESCE((to_jsonb(admin_users) ->> 'password_reset_required')::boolean, FALSE)
            )::int AS password_reset_required,
            COUNT(*) FILTER (
              WHERE COALESCE((to_jsonb(admin_users) ->> 'mfa_enabled')::boolean, FALSE)
            )::int AS otp_enabled
          FROM admin_users
        `,
      ),
    ]);

    const items = usersResult.rows
      .map((row) => ({
        user_id: row.user_id,
        email: row.email,
        full_name: row.full_name,
        tckn: row.tckn || null,
        phone_e164: row.phone_e164 || null,
        status: row.status,
        created_at: row.created_at,
        last_login_at: row.last_login_at || null,
        password_reset_required: Boolean(row.password_reset_required),
        mfa_enabled: Boolean(row.mfa_enabled),
        active_session_count: Number(row.active_session_count || 0),
        role_code: normalizeRoleCode(row.primary_role_code),
        role_name: row.primary_role_name || fallbackRoleName(row.primary_role_code),
        role_codes: normalizeRoleCodes(row.role_codes || []),
      }))
      .sort(sortUsers);

    ok(res, {
      items,
      summary: {
        total_users: Number(summaryResult.rows[0]?.total_users || 0),
        active_users: Number(summaryResult.rows[0]?.active_users || 0),
        suspended_users: Number(summaryResult.rows[0]?.suspended_users || 0),
        password_reset_required: Number(summaryResult.rows[0]?.password_reset_required || 0),
        otp_enabled: Number(summaryResult.rows[0]?.otp_enabled || 0),
        active_sessions: items.reduce((sum, item) => sum + Number(item.active_session_count || 0), 0),
      },
    });

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_USERS_READ',
      targetType: 'PANEL_USERS',
      targetId: String(items.length),
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        returned: items.length,
      },
    });
  });
}
