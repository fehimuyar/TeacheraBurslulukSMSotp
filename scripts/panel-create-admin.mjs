import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { getPool } from '../packages/shared/backend/db.js';

const ALLOWED_ROLES = new Set(['SUPER_ADMIN', 'OPERATIONS', 'READ_ONLY']);
const DEFAULT_ENV_FILES = ['.env.local', '.env.development.local', 'apps/panel-api/.env.local'];
const DEFAULT_NAMES_BY_ROLE = {
  SUPER_ADMIN: 'Panel Super Admin',
  OPERATIONS: 'Panel Operations',
  READ_ONLY: 'Panel Read Only',
};

function safeTrim(value) {
  return String(value ?? '').trim();
}

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return '';
  return safeTrim(process.argv[index + 1] || '');
}

function requireArg(name) {
  const value = readArg(name);
  if (!value) {
    throw new Error(`Missing required argument: --${name}`);
  }
  return value;
}

function normalizeEmail(value) {
  return safeTrim(value).toLowerCase();
}

function normalizeTckn(value) {
  return String(value || '').replace(/\D+/g, '').slice(0, 11);
}

function parseDotenvLine(line) {
  const clean = safeTrim(line);
  if (!clean || clean.startsWith('#')) return null;

  const normalized = clean.startsWith('export ') ? clean.slice(7) : clean;
  const eq = normalized.indexOf('=');
  if (eq < 1) return null;

  const key = safeTrim(normalized.slice(0, eq));
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  let value = normalized.slice(eq + 1);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadEnvFile(filePath, { required = false } = {}) {
  const absolutePath = resolve(process.cwd(), filePath);
  if (!existsSync(absolutePath)) {
    if (required) {
      throw new Error(`Env file not found: ${filePath}`);
    }
    return { loaded: false, filePath: absolutePath, count: 0 };
  }

  const raw = readFileSync(absolutePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  let count = 0;

  for (const line of lines) {
    const parsed = parseDotenvLine(line);
    if (!parsed) continue;
    if (!safeTrim(process.env[parsed.key])) {
      process.env[parsed.key] = parsed.value;
      count += 1;
    }
  }

  return { loaded: true, filePath: absolutePath, count };
}

function hydrateDatabaseEnv() {
  if (resolveConnectionString()) {
    return { source: 'process.env', loadedFiles: [] };
  }

  const explicitEnvFile = readArg('env-file');
  if (explicitEnvFile) {
    const result = loadEnvFile(explicitEnvFile, { required: true });
    return { source: explicitEnvFile, loadedFiles: result.loaded ? [result.filePath] : [] };
  }

  const loadedFiles = [];
  for (const filePath of DEFAULT_ENV_FILES) {
    const result = loadEnvFile(filePath);
    if (result.loaded && result.count > 0) {
      loadedFiles.push(result.filePath);
    }
    if (resolveConnectionString()) {
      return { source: filePath, loadedFiles };
    }
  }

  return { source: 'missing', loadedFiles };
}

function parseBooleanArg(name, fallback = false) {
  const raw = readArg(name);
  if (!raw) return fallback;
  const normalized = safeTrim(raw).toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  throw new Error(`Invalid boolean for --${name}: ${raw}`);
}

function parseRole(value) {
  const role = safeTrim(value).toUpperCase();
  if (!ALLOWED_ROLES.has(role)) {
    throw new Error(`Invalid role: ${value}. Allowed: ${Array.from(ALLOWED_ROLES).join(', ')}`);
  }
  return role;
}

function resolveEmail(email, tckn) {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) return normalizedEmail;
  if (tckn) return `panel-admin+${tckn}@teachera.local`;
  throw new Error('Missing required argument: --email (or provide --tckn to derive an internal email).');
}

function resolveFullName(name, role) {
  return safeTrim(name) || DEFAULT_NAMES_BY_ROLE[role] || 'Panel Admin';
}

function resolveConnectionString() {
  return safeTrim(process.env.DATABASE_URL || process.env.POSTGRES_URL || '');
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
            AND column_name = 'tckn'
        ) AS has_tckn
    `,
  );

  return {
    hasPasswordResetRequired: Boolean(result.rows[0]?.has_password_reset_required),
    hasPasswordUpdatedAt: Boolean(result.rows[0]?.has_password_updated_at),
    hasTckn: Boolean(result.rows[0]?.has_tckn),
  };
}

async function main() {
  const envMeta = hydrateDatabaseEnv();
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error(
      'Missing DATABASE_URL/POSTGRES_URL env. Pass --env-file <path> or export DATABASE_URL/POSTGRES_URL first.',
    );
  }

  const role = parseRole(requireArg('role'));
  const tckn = normalizeTckn(readArg('tckn'));
  const email = resolveEmail(readArg('email'), tckn);
  const fullName = resolveFullName(readArg('name'), role);
  const password = requireArg('password');
  const totpSecretRaw = readArg('totp-secret');
  const totpSecret = totpSecretRaw ? totpSecretRaw.replace(/[\s-]/g, '').toUpperCase() : '';
  const mfaEnabled = Boolean(totpSecret);
  const requirePasswordReset = parseBooleanArg('require-password-reset', false);

  if (tckn && !/^\d{11}$/.test(tckn)) {
    throw new Error('Invalid --tckn: must be exactly 11 digits.');
  }

  const pool = getPool();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const availability = await readAdminUserColumnAvailability(client);

    if (tckn && !availability.hasTckn) {
      throw new Error('admin_users.tckn column is missing. Run db:migrate first.');
    }

    await client.query(
      `
        INSERT INTO roles (code, name)
        VALUES ($1, $2)
        ON CONFLICT (code)
        DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
      `,
      [role, role.replace('_', ' ')],
    );

    const existingUserResult = await client.query(
      `
        SELECT id, email, tckn
        FROM admin_users
        WHERE lower(email) = lower($1)
          OR ($2 <> '' AND regexp_replace(COALESCE(tckn, ''), '\\D', '', 'g') = $2)
        ORDER BY CASE WHEN lower(email) = lower($1) THEN 0 ELSE 1 END
        LIMIT 1
      `,
      [email, tckn],
    );

    let userResult;
    if (existingUserResult.rowCount > 0) {
      const updateClauses = [];
      const updateParams = [];
      let nextParam = 1;

      if (availability.hasTckn && tckn) {
        updateClauses.push(`tckn = $${nextParam}`);
        updateParams.push(tckn);
        nextParam += 1;
      }

      updateClauses.push(
        `email = lower($${nextParam})`,
        `full_name = $${nextParam + 1}`,
        `password_hash = crypt($${nextParam + 2}, gen_salt('bf', 12))`,
        "status = 'ACTIVE'",
        `mfa_enabled = $${nextParam + 3}`,
        `mfa_totp_secret = $${nextParam + 4}`,
        'updated_at = NOW()',
      );
      updateParams.push(email, fullName, password, mfaEnabled, totpSecret || null);
      nextParam += 5;

      if (availability.hasPasswordResetRequired) {
        updateClauses.push(`password_reset_required = $${nextParam}`);
        updateParams.push(requirePasswordReset);
        nextParam += 1;
      }
      if (availability.hasPasswordUpdatedAt) {
        updateClauses.push('password_updated_at = NOW()');
      }
      updateParams.push(existingUserResult.rows[0].id);

      userResult = await client.query(
        `
          UPDATE admin_users
          SET ${updateClauses.join(',\n            ')}
          WHERE id = $${nextParam}::uuid
          RETURNING id, email, tckn
        `,
        updateParams,
      );
    } else {
      const columns = ['email', 'full_name', 'password_hash'];
      const values = ['lower($1)', '$2', "crypt($3, gen_salt('bf', 12))"];
      const params = [email, fullName, password];
      let nextParam = params.length + 1;

      if (availability.hasTckn) {
        columns.unshift('tckn');
        values.unshift(`$${nextParam}`);
        params.push(tckn || null);
        nextParam += 1;
      }
      if (availability.hasPasswordResetRequired) {
        columns.push('password_reset_required');
        values.push(`$${nextParam}`);
        params.push(requirePasswordReset);
        nextParam += 1;
      }
      if (availability.hasPasswordUpdatedAt) {
        columns.push('password_updated_at');
        values.push('NOW()');
      }

      columns.push('status', 'mfa_enabled', 'mfa_totp_secret', 'updated_at');
      values.push("'ACTIVE'", `$${nextParam}`, `$${nextParam + 1}`, 'NOW()');
      params.push(mfaEnabled, totpSecret || null);

      userResult = await client.query(
        `
          INSERT INTO admin_users (
            ${columns.join(',\n            ')}
          )
          VALUES (
            ${values.join(',\n            ')}
          )
          RETURNING id, email, tckn
        `,
        params,
      );
    }

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
    console.log(`TCKN: ${user.tckn || 'not_set'}`);
    console.log(`OTP: ${mfaEnabled ? 'enabled (secret present)' : 'disabled (optional)'}`);
    console.log(`password_reset_required: ${requirePasswordReset ? 'true' : 'false'}`);
    console.log(`env_source: ${envMeta.source}`);
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
