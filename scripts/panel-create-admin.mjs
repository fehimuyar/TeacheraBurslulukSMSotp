import process from 'node:process';
import { getPool } from '../packages/shared/backend/db.js';

const ALLOWED_ROLES = new Set(['SUPER_ADMIN', 'OPERATIONS', 'READ_ONLY']);

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return '';
  return (process.argv[index + 1] || '').trim();
}

function requireArg(name) {
  const value = readArg(name);
  if (!value) {
    throw new Error(`Missing required argument: --${name}`);
  }
  return value;
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function normalizePhoneE164(value) {
  const raw = value.trim();
  if (!raw) return '';
  const compact = raw.replace(/[\s\-().]/g, '');
  let normalized = compact;
  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  } else if (normalized.startsWith('0') && normalized.length === 11) {
    normalized = `+90${normalized.slice(1)}`;
  } else if (!normalized.startsWith('+') && normalized.length === 10) {
    normalized = `+90${normalized}`;
  } else if (!normalized.startsWith('+')) {
    normalized = `+${normalized}`;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error('Invalid phone format. Use E.164 (example: +9053XXXXXXXX).');
  }
  return normalized;
}

function parseBooleanArg(name, fallback = false) {
  const raw = readArg(name);
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  throw new Error(`Invalid boolean for --${name}: ${raw}`);
}

function parseRole(value) {
  const role = value.trim().toUpperCase();
  if (!ALLOWED_ROLES.has(role)) {
    throw new Error(`Invalid role: ${value}. Allowed: ${Array.from(ALLOWED_ROLES).join(', ')}`);
  }
  return role;
}

function resolveConnectionString() {
  return (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
}

async function readAdminUserColumnAvailability(client) {
  const result = await client.query(
    `
      SELECT
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'admin_users'
            AND column_name = 'password_reset_required'
        ) AS has_password_reset_required,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'admin_users'
            AND column_name = 'password_updated_at'
        ) AS has_password_updated_at,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'admin_users'
            AND column_name = 'phone_e164'
        ) AS has_phone_e164
    `,
  );

  return {
    hasPasswordResetRequired: Boolean(result.rows[0]?.has_password_reset_required),
    hasPasswordUpdatedAt: Boolean(result.rows[0]?.has_password_updated_at),
    hasPhoneE164: Boolean(result.rows[0]?.has_phone_e164),
  };
}

async function main() {
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL/POSTGRES_URL env.');
  }

  const email = normalizeEmail(requireArg('email'));
  const fullName = requireArg('name');
  const password = requireArg('password');
  const role = parseRole(requireArg('role'));
  const rawTotpSecret = readArg('totp-secret');
  const rawPhone = readArg('phone');
  const phoneE164 = rawPhone ? normalizePhoneE164(rawPhone) : '';
  if (rawTotpSecret) {
    throw new Error('TOTP is removed. Use SMS OTP with --phone.');
  }
  if (!phoneE164) {
    throw new Error('--phone is required for SMS OTP panel login.');
  }
  const mfaEnabled = false;
  const requirePasswordReset = parseBooleanArg('require-password-reset', false);

  const pool = getPool();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const availability = await readAdminUserColumnAvailability(client);

    await client.query(
      `
        INSERT INTO roles (code, name)
        VALUES ($1, $2)
        ON CONFLICT (code)
        DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
      `,
      [role, role.replace('_', ' ')],
    );

    const columns = ['email', 'full_name', 'password_hash'];
    const values = ['lower($1)', '$2', 'crypt($3, gen_salt(\'bf\', 12))'];
    const params = [email, fullName, password];

    if (availability.hasPasswordResetRequired) {
      columns.push('password_reset_required');
      params.push(requirePasswordReset);
      values.push(`$${params.length}`);
    }
    if (availability.hasPasswordUpdatedAt) {
      columns.push('password_updated_at');
      values.push('NOW()');
    }
    if (availability.hasPhoneE164) {
      columns.push('phone_e164');
      params.push(phoneE164 || null);
      values.push(`$${params.length}`);
    }

    columns.push('status');
    values.push('\'ACTIVE\'');

    columns.push('mfa_enabled');
    params.push(mfaEnabled);
    values.push(`$${params.length}`);

    columns.push('mfa_totp_secret');
    params.push(null);
    values.push(`$${params.length}`);

    columns.push('updated_at');
    values.push('NOW()');

    const updates = [
      'full_name = EXCLUDED.full_name',
      'password_hash = EXCLUDED.password_hash',
      availability.hasPasswordResetRequired ? 'password_reset_required = EXCLUDED.password_reset_required' : null,
      availability.hasPasswordUpdatedAt ? 'password_updated_at = EXCLUDED.password_updated_at' : null,
      availability.hasPhoneE164 ? 'phone_e164 = EXCLUDED.phone_e164' : null,
      'status = \'ACTIVE\'',
      'mfa_enabled = EXCLUDED.mfa_enabled',
      'mfa_totp_secret = EXCLUDED.mfa_totp_secret',
      'updated_at = NOW()',
    ].filter(Boolean);

    const userResult = await client.query(
      `
        INSERT INTO admin_users (${columns.join(', ')})
        VALUES (${values.join(', ')})
        ON CONFLICT (email)
        DO UPDATE SET
          ${updates.join(',\n          ')}
        RETURNING id, email
      `,
      params,
    );

    const user = userResult.rows[0];
    await client.query(
      `
        DELETE FROM admin_user_roles
        WHERE admin_user_id = $1::uuid
      `,
      [user.id],
    );

    await client.query(
      `
        INSERT INTO admin_user_roles (admin_user_id, role_id)
        SELECT $1::uuid, r.id
        FROM roles r
        WHERE r.code = $2
      `,
      [user.id, role],
    );

    await client.query('COMMIT');
    console.log(`Admin user ready: ${user.email} (${role})`);
    console.log('auth_mode: sms_otp');
    if (availability.hasPhoneE164) {
      console.log(`phone_e164: ${phoneE164 || 'not_set'}`);
    } else {
      console.log('phone_e164: column_not_available');
    }
    console.log(`password_reset_required: ${requirePasswordReset ? 'true' : 'false'}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[panel:create-admin] failed:', error.message || String(error));
  process.exit(1);
});
