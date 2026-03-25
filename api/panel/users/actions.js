// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { PANEL_PERMISSIONS, ROLES } from '../../_lib/constants.js';
import {
  buildRoleCodeSeed,
  fallbackRoleName,
  isMissingRelationError,
  isSystemRoleCode,
  normalizeEmail,
  normalizePermissionCodes,
  normalizePhoneE164,
  normalizeRoleCode,
  normalizeTckn,
  readAdminUserColumnAvailability,
  readRoleColumnAvailability,
} from '../../_lib/panelUsers.js';

const KNOWN_PANEL_PERMISSION_SET = new Set(PANEL_PERMISSIONS.map((code) => safeTrim(code).toUpperCase()));

function parseBooleanLike(value) {
  const normalized = safeTrim(value).toLowerCase();
  if (!normalized) return false;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function readStatus(value) {
  const normalized = safeTrim(value).toUpperCase();
  if (!normalized) return '';
  if (normalized === 'ACTIVE' || normalized === 'SUSPENDED') return normalized;
  return '';
}

function buildRoleName(roleCode) {
  return fallbackRoleName(roleCode).replace(/\s+/g, ' ').trim();
}

function readRolePermissionCodes(value) {
  const codes = normalizePermissionCodes(value);
  const invalidCodes = codes.filter((code) => !KNOWN_PANEL_PERMISSION_SET.has(code));
  if (invalidCodes.length > 0) {
    throw new HttpError(400, `Unknown permission codes: ${invalidCodes.join(', ')}`, 'invalid_permission_codes');
  }
  return codes;
}

async function ensureRoleExists(client, roleCode) {
  const normalizedRoleCode = normalizeRoleCode(roleCode);
  if (!normalizedRoleCode) {
    throw new HttpError(400, 'roleCode is required.', 'missing_role_code');
  }

  if (isSystemRoleCode(normalizedRoleCode)) {
    await client.query(
      `
        INSERT INTO roles (code, name)
        VALUES ($1, $2)
        ON CONFLICT (code)
        DO NOTHING
      `,
      [normalizedRoleCode, buildRoleName(normalizedRoleCode)],
    );
  }

  const roleResult = await client.query(
    `
      SELECT
        id::text AS role_id,
        code AS role_code,
        COALESCE(NULLIF(BTRIM(name), ''), code) AS role_name
      FROM roles
      WHERE code = $1
      LIMIT 1
    `,
    [normalizedRoleCode],
  );

  if (roleResult.rowCount === 0) {
    throw new HttpError(404, 'Role not found.', 'role_not_found');
  }

  return roleResult.rows[0];
}

async function revokeActiveSessions(client, userId) {
  await client.query(
    `
      UPDATE admin_sessions
      SET revoked_at = NOW(), updated_at = NOW()
      WHERE admin_user_id = $1::uuid
        AND revoked_at IS NULL
    `,
    [userId],
  );
}

async function buildUniqueRoleCode(client, roleName) {
  const baseCode = buildRoleCodeSeed(roleName) || 'CUSTOM_ROLE';
  let nextCode = baseCode;
  let suffix = 2;

  while (true) {
    const existing = await client.query(
      `
        SELECT 1
        FROM roles
        WHERE code = $1
        LIMIT 1
      `,
      [nextCode],
    );
    if (existing.rowCount === 0) {
      return nextCode;
    }
    nextCode = `${baseCode}_${suffix}`;
    suffix += 1;
  }
}

async function syncRolePermissions(client, roleId, permissionCodes) {
  try {
    const permissionResult = await client.query(
      `
        SELECT code
        FROM permissions
        WHERE code = ANY($1::text[])
      `,
      [permissionCodes],
    );

    const matchedCodes = new Set(permissionResult.rows.map((row) => safeTrim(row.code).toUpperCase()));
    const missingCodes = permissionCodes.filter((code) => !matchedCodes.has(code));
    if (missingCodes.length > 0) {
      throw new HttpError(409, `Permissions are not seeded in DB: ${missingCodes.join(', ')}`, 'missing_permission_seed');
    }

    await client.query(
      `
        DELETE FROM role_permissions
        WHERE role_id = $1::uuid
      `,
      [roleId],
    );

    if (permissionCodes.length > 0) {
      await client.query(
        `
          INSERT INTO role_permissions (role_id, permission_id)
          SELECT $1::uuid, p.id
          FROM permissions p
          WHERE p.code = ANY($2::text[])
          ON CONFLICT (role_id, permission_id)
          DO NOTHING
        `,
        [roleId, permissionCodes],
      );
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    if (isMissingRelationError(error)) {
      throw new HttpError(503, 'Panel RBAC permission tables are missing.', 'panel_role_permission_schema_missing');
    }
    throw error;
  }
}

async function ensureRoleIpPolicyRow(client, roleCode) {
  try {
    await client.query(
      `
        INSERT INTO admin_ip_policies (role_code, is_enabled, allowed_ips, note, updated_by)
        VALUES ($1, FALSE, ARRAY[]::TEXT[], 'Created from panel role management.', 'panel_users_actions')
        ON CONFLICT (role_code)
        DO NOTHING
      `,
      [roleCode],
    );
  } catch (error) {
    if (isMissingRelationError(error)) {
      return;
    }
    throw error;
  }
}

async function upsertRole(client, { roleId, roleName, description, permissionCodes }) {
  const trimmedRoleName = safeTrim(roleName);
  if (!trimmedRoleName) {
    throw new HttpError(400, 'roleName is required.', 'missing_role_name');
  }
  if (permissionCodes.length === 0) {
    throw new HttpError(400, 'At least one permission is required.', 'missing_role_permissions');
  }

  const roleColumns = await readRoleColumnAvailability(client);
  let savedRole;

  if (roleId) {
    const existingRole = await client.query(
      `
        SELECT
          id::text AS role_id,
          code AS role_code,
          COALESCE(NULLIF(BTRIM(name), ''), code) AS role_name
        FROM roles
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [roleId],
    );

    if (existingRole.rowCount === 0) {
      throw new HttpError(404, 'Role not found.', 'role_not_found');
    }

    const currentRole = existingRole.rows[0];
    if (isSystemRoleCode(currentRole.role_code)) {
      throw new HttpError(403, 'System roles cannot be edited from panel UI.', 'system_role_locked');
    }

    const updateClauses = ['name = $1', 'updated_at = NOW()'];
    const updateParams = [trimmedRoleName];
    let nextParam = updateParams.length + 1;

    if (roleColumns.hasDescription) {
      updateClauses.push(`description = $${nextParam}`);
      updateParams.push(safeTrim(description) || null);
      nextParam += 1;
    }

    updateParams.push(roleId);
    const updatedRole = await client.query(
      `
        UPDATE roles
        SET ${updateClauses.join(',\n          ')}
        WHERE id = $${nextParam}::uuid
        RETURNING
          id::text AS role_id,
          code AS role_code,
          COALESCE(NULLIF(BTRIM(name), ''), code) AS role_name
      `,
      updateParams,
    );
    savedRole = updatedRole.rows[0];
  } else {
    const roleCode = await buildUniqueRoleCode(client, trimmedRoleName);
    const columns = ['code', 'name'];
    const values = ['$1', '$2'];
    const params = [roleCode, trimmedRoleName];

    if (roleColumns.hasDescription) {
      columns.push('description');
      values.push('$3');
      params.push(safeTrim(description) || null);
    }

    const createdRole = await client.query(
      `
        INSERT INTO roles (
          ${columns.join(',\n          ')}
        )
        VALUES (
          ${values.join(',\n          ')}
        )
        RETURNING
          id::text AS role_id,
          code AS role_code,
          COALESCE(NULLIF(BTRIM(name), ''), code) AS role_name
      `,
      params,
    );
    savedRole = createdRole.rows[0];
    await ensureRoleIpPolicyRow(client, savedRole.role_code);
  }

  await syncRolePermissions(client, savedRole.role_id, permissionCodes);

  return savedRole;
}

async function deleteRole(client, roleId) {
  const roleResult = await client.query(
    `
      SELECT
        r.id::text AS role_id,
        r.code AS role_code,
        COALESCE(NULLIF(BTRIM(r.name), ''), r.code) AS role_name,
        COUNT(DISTINCT ur.admin_user_id)::int AS user_count
      FROM roles r
      LEFT JOIN admin_user_roles ur ON ur.role_id = r.id
      WHERE r.id = $1::uuid
      GROUP BY r.id, r.code, r.name
      LIMIT 1
    `,
    [roleId],
  );

  if (roleResult.rowCount === 0) {
    throw new HttpError(404, 'Role not found.', 'role_not_found');
  }

  const existingRole = roleResult.rows[0];
  if (isSystemRoleCode(existingRole.role_code)) {
    throw new HttpError(403, 'System roles cannot be deleted.', 'system_role_locked');
  }
  if (Number(existingRole.user_count || 0) > 0) {
    throw new HttpError(409, 'Cannot delete a role that still has assigned users.', 'role_has_assigned_users');
  }

  const deletedRole = await client.query(
    `
      DELETE FROM roles
      WHERE id = $1::uuid
      RETURNING
        id::text AS role_id,
        code AS role_code,
        COALESCE(NULLIF(BTRIM(name), ''), code) AS role_name
    `,
    [roleId],
  );

  return deletedRole.rows[0];
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);
    const identity = await requireRole(req, [ROLES.SUPER_ADMIN]);

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const action = safeTrim(body.action).toLowerCase();
    if (!['upsert_user', 'set_status', 'upsert_role', 'delete_role'].includes(action)) {
      throw new HttpError(400, 'Unsupported action.', 'invalid_action');
    }

    if (action === 'set_status') {
      const userId = safeTrim(body.user_id || body.userId);
      const status = readStatus(body.status);
      if (!userId) {
        throw new HttpError(400, 'userId is required.', 'missing_user_id');
      }
      if (!status) {
        throw new HttpError(400, 'status must be ACTIVE or SUSPENDED.', 'invalid_status');
      }
      if (userId === identity.userId && status !== 'ACTIVE') {
        throw new HttpError(400, 'You cannot suspend your own active session owner.', 'self_suspend_not_allowed');
      }

      const updatedUser = await withTransaction(async (client) => {
        const updated = await client.query(
          `
            UPDATE admin_users
            SET status = $2, updated_at = NOW()
            WHERE id = $1::uuid
            RETURNING id::text AS user_id, email, full_name, status
          `,
          [userId, status],
        );

        if (updated.rowCount === 0) {
          throw new HttpError(404, 'Panel user not found.', 'panel_user_not_found');
        }

        if (status !== 'ACTIVE') {
          await revokeActiveSessions(client, userId);
        }

        return updated.rows[0];
      });

      const ctx = readRequestContext(req);
      await appendAuditLog({
        ...buildPanelActor(identity),
        action: 'PANEL_USER_STATUS_UPDATE',
        targetType: 'PANEL_USER',
        targetId: updatedUser.user_id,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: {
          status: updatedUser.status,
          email: updatedUser.email,
        },
      });

      ok(res, {
        action,
        user_id: updatedUser.user_id,
        email: updatedUser.email,
        full_name: updatedUser.full_name,
        status: updatedUser.status,
        message: updatedUser.status === 'ACTIVE' ? 'Kullanici aktiflestirildi.' : 'Kullanici askiya alindi.',
      });
      return;
    }

    if (action === 'upsert_role') {
      const roleId = safeTrim(body.role_id || body.roleId);
      const roleName = safeTrim(body.role_name || body.roleName || body.name);
      const description = safeTrim(body.description);
      const permissionCodes = readRolePermissionCodes(
        body.permissions || body.permission_codes || body.permissionCodes || [],
      );

      const savedRole = await withTransaction((client) =>
        upsertRole(client, {
          roleId,
          roleName,
          description,
          permissionCodes,
        }),
      );

      const ctx = readRequestContext(req);
      await appendAuditLog({
        ...buildPanelActor(identity),
        action: roleId ? 'PANEL_ROLE_UPDATE' : 'PANEL_ROLE_CREATE',
        targetType: 'PANEL_ROLE',
        targetId: savedRole.role_id,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: {
          roleCode: savedRole.role_code,
          roleName: savedRole.role_name,
          permissionCount: permissionCodes.length,
        },
      });

      ok(res, {
        action,
        role_id: savedRole.role_id,
        role_code: savedRole.role_code,
        role_name: savedRole.role_name,
        permissions: permissionCodes,
        message: roleId ? 'Rol guncellendi.' : 'Rol olusturuldu.',
      });
      return;
    }

    if (action === 'delete_role') {
      const roleId = safeTrim(body.role_id || body.roleId);
      if (!roleId) {
        throw new HttpError(400, 'roleId is required.', 'missing_role_id');
      }

      const deletedRole = await withTransaction((client) => deleteRole(client, roleId));

      const ctx = readRequestContext(req);
      await appendAuditLog({
        ...buildPanelActor(identity),
        action: 'PANEL_ROLE_DELETE',
        targetType: 'PANEL_ROLE',
        targetId: deletedRole.role_id,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: {
          roleCode: deletedRole.role_code,
          roleName: deletedRole.role_name,
        },
      });

      ok(res, {
        action,
        role_id: deletedRole.role_id,
        role_code: deletedRole.role_code,
        role_name: deletedRole.role_name,
        message: 'Rol silindi.',
      });
      return;
    }

    const userId = safeTrim(body.user_id || body.userId);
    const email = normalizeEmail(body.email);
    const fullName = safeTrim(body.full_name || body.fullName);
    const tckn = normalizeTckn(body.tckn);
    const rawPhone = safeTrim(body.phone_e164 || body.phoneE164 || body.phone);
    const phoneE164 = rawPhone ? normalizePhoneE164(rawPhone) : '';
    const roleCode = normalizeRoleCode(body.role_code || body.roleCode);
    const password = safeTrim(body.password);
    const passwordResetRequired = parseBooleanLike(body.password_reset_required ?? body.passwordResetRequired);
    const status = readStatus(body.status || 'ACTIVE') || 'ACTIVE';
    const isCreate = !userId;

    if (!email) {
      throw new HttpError(400, 'email is required.', 'missing_email');
    }
    if (!fullName) {
      throw new HttpError(400, 'fullName is required.', 'missing_full_name');
    }
    if (!roleCode) {
      throw new HttpError(400, 'roleCode is required.', 'missing_role_code');
    }
    if (rawPhone && !phoneE164) {
      throw new HttpError(400, 'phone must be valid E.164 or Turkish mobile format.', 'invalid_phone');
    }
    if (tckn && tckn.length !== 11) {
      throw new HttpError(400, 'tckn must be exactly 11 digits.', 'invalid_tckn');
    }
    if (isCreate && !password) {
      throw new HttpError(400, 'password is required for new users.', 'missing_password');
    }
    if (!isCreate && userId === identity.userId && status !== 'ACTIVE') {
      throw new HttpError(400, 'You cannot suspend your own account.', 'self_suspend_not_allowed');
    }
    if (!isCreate && userId === identity.userId && roleCode !== ROLES.SUPER_ADMIN) {
      throw new HttpError(400, 'You cannot remove your own super admin role.', 'self_role_change_not_allowed');
    }

    const savedUser = await withTransaction(async (client) => {
      const availability = await readAdminUserColumnAvailability(client);
      const role = await ensureRoleExists(client, roleCode);

      if (tckn && !availability.hasTckn) {
        throw new HttpError(400, 'admin_users.tckn column is missing.', 'missing_tckn_column');
      }
      if (rawPhone && !availability.hasPhoneE164) {
        throw new HttpError(400, 'admin_users.phone_e164 column is missing.', 'missing_phone_column');
      }

      const duplicateUser = await client.query(
        `
          SELECT id::text AS user_id
          FROM admin_users
          WHERE (
            lower(email) = lower($1)
            OR ($2 <> '' AND regexp_replace(COALESCE(to_jsonb(admin_users) ->> 'tckn', ''), '\\D', '', 'g') = $2)
          )
            AND ($3 = '' OR id <> $3::uuid)
          LIMIT 1
        `,
        [email, tckn, userId],
      );
      if (duplicateUser.rowCount > 0) {
        throw new HttpError(409, 'Another panel user already uses this email or TCKN.', 'panel_user_conflict');
      }

      let saved;
      if (isCreate) {
        const columns = ['email', 'full_name', 'password_hash', 'status'];
        const values = ['lower($1)', '$2', "crypt($3, gen_salt('bf', 12))", '$4'];
        const params = [email, fullName, password, status];
        let nextParam = params.length + 1;

        if (availability.hasTckn) {
          columns.push('tckn');
          values.push(`$${nextParam}`);
          params.push(tckn || null);
          nextParam += 1;
        }
        if (availability.hasPhoneE164) {
          columns.push('phone_e164');
          values.push(`$${nextParam}`);
          params.push(phoneE164 || null);
          nextParam += 1;
        }
        if (availability.hasPasswordResetRequired) {
          columns.push('password_reset_required');
          values.push(`$${nextParam}`);
          params.push(passwordResetRequired);
          nextParam += 1;
        }
        if (availability.hasPasswordUpdatedAt) {
          columns.push('password_updated_at');
          values.push('NOW()');
        }
        if (availability.hasMfaEnabled) {
          columns.push('mfa_enabled');
          values.push(`$${nextParam}`);
          params.push(false);
          nextParam += 1;
        }
        if (availability.hasMfaTotpSecret) {
          columns.push('mfa_totp_secret');
          values.push(`$${nextParam}`);
          params.push(null);
          nextParam += 1;
        }

        saved = await client.query(
          `
            INSERT INTO admin_users (
              ${columns.join(',\n              ')}
            )
            VALUES (
              ${values.join(',\n              ')}
            )
            RETURNING id::text AS user_id, lower(email) AS email, full_name, status
          `,
          params,
        );
      } else {
        const updateClauses = [
          'email = lower($1)',
          'full_name = $2',
          'status = $3',
          'updated_at = NOW()',
        ];
        const updateParams = [email, fullName, status];
        let nextParam = updateParams.length + 1;

        if (availability.hasTckn) {
          updateClauses.push(`tckn = $${nextParam}`);
          updateParams.push(tckn || null);
          nextParam += 1;
        }
        if (availability.hasPhoneE164) {
          updateClauses.push(`phone_e164 = $${nextParam}`);
          updateParams.push(phoneE164 || null);
          nextParam += 1;
        }
        if (availability.hasPasswordResetRequired) {
          updateClauses.push(`password_reset_required = $${nextParam}`);
          updateParams.push(passwordResetRequired);
          nextParam += 1;
        }
        if (password) {
          updateClauses.push(`password_hash = crypt($${nextParam}, gen_salt('bf', 12))`);
          updateParams.push(password);
          nextParam += 1;
          if (availability.hasPasswordUpdatedAt) {
            updateClauses.push('password_updated_at = NOW()');
          }
        }

        updateParams.push(userId);
        saved = await client.query(
          `
            UPDATE admin_users
            SET ${updateClauses.join(',\n              ')}
            WHERE id = $${nextParam}::uuid
            RETURNING id::text AS user_id, lower(email) AS email, full_name, status
          `,
          updateParams,
        );
      }

      if (saved.rowCount === 0) {
        throw new HttpError(404, 'Panel user not found.', 'panel_user_not_found');
      }

      await client.query(
        `
          DELETE FROM admin_user_roles
          WHERE admin_user_id = $1::uuid
        `,
        [saved.rows[0].user_id],
      );

      await client.query(
        `
          INSERT INTO admin_user_roles (admin_user_id, role_id)
          VALUES ($1::uuid, $2::uuid)
        `,
        [saved.rows[0].user_id, role.role_id],
      );

      if (status !== 'ACTIVE') {
        await revokeActiveSessions(client, saved.rows[0].user_id);
      }

      return {
        ...saved.rows[0],
        role_code: role.role_code,
        role_name: role.role_name,
      };
    });

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: isCreate ? 'PANEL_USER_CREATE' : 'PANEL_USER_UPDATE',
      targetType: 'PANEL_USER',
      targetId: savedUser.user_id,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        email: savedUser.email,
        roleCode: savedUser.role_code,
        passwordChanged: Boolean(password),
        status: savedUser.status,
        passwordResetRequired,
      },
    });

    ok(res, {
      action,
      user_id: savedUser.user_id,
      email: savedUser.email,
      full_name: savedUser.full_name,
      role_code: savedUser.role_code,
      role_name: savedUser.role_name,
      status: savedUser.status,
      message: isCreate ? 'Kullanici olusturuldu.' : 'Kullanici guncellendi.',
    });
  });
}
