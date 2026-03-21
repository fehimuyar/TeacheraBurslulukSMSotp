import process from 'node:process';
import { getPool } from '../packages/shared/backend/db.js';

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
  if (!raw) throw new Error('phone is required');
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

function resolveConnectionString() {
  return (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
}

async function main() {
  if (!resolveConnectionString()) {
    throw new Error('Missing DATABASE_URL/POSTGRES_URL env.');
  }

  const email = normalizeEmail(requireArg('email'));
  const phone = normalizePhoneE164(requireArg('phone'));
  const pool = getPool();

  const client = await pool.connect();
  try {
    const updated = await client.query(
      `
        UPDATE admin_users
        SET
          phone_e164 = $2,
          updated_at = NOW()
        WHERE lower(email) = lower($1)
        RETURNING id, email, status, phone_e164
      `,
      [email, phone],
    );

    if (updated.rowCount === 0) {
      throw new Error(`admin_user_not_found:${email}`);
    }

    const row = updated.rows[0];
    console.log(
      JSON.stringify(
        {
          ok: true,
          user_id: row.id,
          email: row.email,
          status: row.status,
          phone_e164: row.phone_e164,
        },
        null,
        2,
      ),
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[panel:set-admin-phone] failed:', error.message || String(error));
  process.exit(1);
});
