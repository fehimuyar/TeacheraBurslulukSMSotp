import { requireRole } from '../../_lib/auth.js';
import { ROLES } from '../../_lib/constants.js';
import { query, withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';

function normalizeRoleCode(value) {
  const normalized = safeTrim(value).toUpperCase();
  if (normalized === 'ADMIN' || normalized === 'EDUCATION_ADVISOR') return ROLES.OPERATIONS;
  return normalized;
}

function normalizeAllowedIps(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const values = [];
  for (const entry of raw) {
    const normalized = safeTrim(entry).toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
  }
  return values;
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET', 'PUT']);

    if (req.method === 'GET') {
      await requireRole(
        req,
        [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY],
        ['PANEL_IP_POLICY_READ'],
      );

      const result = await query(
        `
          SELECT
            role_code,
            is_enabled,
            allowed_ips,
            note,
            updated_by,
            updated_at
          FROM admin_ip_policies
          ORDER BY role_code ASC
        `,
      );

      ok(res, {
        items: result.rows,
      });
      return;
    }

    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN],
      ['PANEL_IP_POLICY_WRITE'],
    );

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const roleCode = normalizeRoleCode(body.role_code || body.roleCode);
    if (!roleCode) {
      throw new HttpError(400, 'roleCode is required.', 'missing_role_code');
    }

    const isEnabled = Boolean(body.is_enabled ?? body.isEnabled);
    const allowedIps = normalizeAllowedIps(body.allowed_ips ?? body.allowedIps);
    const note = safeTrim(body.note).slice(0, 400);

    await withTransaction(async (client) => {
      const roleCheck = await client.query(
        `
          SELECT code
          FROM roles
          WHERE code = $1
          LIMIT 1
        `,
        [roleCode],
      );
      if (roleCheck.rowCount === 0) {
        throw new HttpError(404, 'Role not found.', 'role_not_found');
      }

      await client.query(
        `
          INSERT INTO admin_ip_policies (
            role_code,
            is_enabled,
            allowed_ips,
            note,
            updated_by,
            updated_at
          )
          VALUES ($1, $2, $3::text[], $4, $5, NOW())
          ON CONFLICT (role_code)
          DO UPDATE
          SET
            is_enabled = EXCLUDED.is_enabled,
            allowed_ips = EXCLUDED.allowed_ips,
            note = EXCLUDED.note,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
        `,
        [roleCode, isEnabled, allowedIps, note || null, identity.keyId || identity.userId || 'super_admin'],
      );
    });

    ok(res, {
      role_code: roleCode,
      is_enabled: isEnabled,
      allowed_ips: allowedIps,
    });
  });
}
