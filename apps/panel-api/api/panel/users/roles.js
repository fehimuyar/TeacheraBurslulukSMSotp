import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { query } from '../../_lib/db.js';
import { handleRequest, methodGuard, ok } from '../../_lib/http.js';
import { ROLES } from '../../_lib/constants.js';
import {
  buildDefaultPermissionCodes,
  fallbackRoleName,
  isMissingRelationError,
  isSystemRoleCode,
  normalizePermissionCodes,
  normalizeRoleCode,
  roleSortValue,
} from '../../_lib/panelUsers.js';

function sortRoles(left, right) {
  const leftOrder = roleSortValue(left.role_code);
  const rightOrder = roleSortValue(right.role_code);
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  const leftName = String(left.role_name || '').toLocaleLowerCase('tr-TR');
  const rightName = String(right.role_name || '').toLocaleLowerCase('tr-TR');
  return leftName.localeCompare(rightName, 'tr');
}

async function readRoleRows(includePermissions) {
  const permissionSelect = includePermissions
    ? `
        COALESCE(
          array_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL),
          ARRAY[]::text[]
        ) AS permission_codes
      `
    : 'ARRAY[]::text[] AS permission_codes';

  const permissionJoins = includePermissions
    ? `
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        LEFT JOIN permissions p ON p.id = rp.permission_id
      `
    : '';

  return query(
    `
      SELECT
        r.id::text AS role_id,
        r.code AS role_code,
        COALESCE(NULLIF(BTRIM(r.name), ''), r.code) AS role_name,
        NULLIF(BTRIM(COALESCE(to_jsonb(r) ->> 'description', '')), '') AS description,
        NULLIF(COALESCE(to_jsonb(r) ->> 'created_at', ''), '') AS created_at,
        COUNT(DISTINCT ur.admin_user_id)::int AS user_count,
        COUNT(DISTINCT CASE WHEN au.status = 'ACTIVE' THEN ur.admin_user_id END)::int AS active_user_count,
        MAX(
          CASE
            WHEN COALESCE(to_jsonb(ur) ->> 'created_at', '') <> ''
              THEN (to_jsonb(ur) ->> 'created_at')::timestamptz
            ELSE NULL
          END
        ) AS last_assigned_at,
        ${permissionSelect}
      FROM roles r
      LEFT JOIN admin_user_roles ur ON ur.role_id = r.id
      LEFT JOIN admin_users au ON au.id = ur.admin_user_id
      ${permissionJoins}
      GROUP BY r.id, r.code, r.name
    `,
  );
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    const identity = await requireRole(req, [ROLES.SUPER_ADMIN]);

    let rows;
    try {
      rows = (await readRoleRows(true)).rows;
    } catch (error) {
      if (!isMissingRelationError(error)) {
        throw error;
      }
      rows = (await readRoleRows(false)).rows;
    }

    const items = rows
      .map((row) => {
        const roleCode = normalizeRoleCode(row.role_code);
        const permissions = normalizePermissionCodes(row.permission_codes || []);
        return {
          role_id: row.role_id,
          role_code: roleCode,
          role_name: row.role_name || fallbackRoleName(roleCode),
          description: row.description || null,
          created_at: row.created_at || null,
          is_system: isSystemRoleCode(roleCode),
          user_count: Number(row.user_count || 0),
          active_user_count: Number(row.active_user_count || 0),
          last_assigned_at: row.last_assigned_at || null,
          permissions: permissions.length > 0 ? permissions : buildDefaultPermissionCodes(roleCode),
        };
      })
      .sort(sortRoles);

    ok(res, {
      items,
    });

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_ROLE_LIST_READ',
      targetType: 'PANEL_ROLE_LIST',
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
