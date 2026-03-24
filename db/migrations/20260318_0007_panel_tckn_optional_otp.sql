BEGIN;

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS tckn TEXT;

UPDATE admin_users
SET tckn = NULL
WHERE tckn IS NOT NULL
  AND length(btrim(tckn)) = 0;

ALTER TABLE admin_users
  ALTER COLUMN mfa_enabled SET DEFAULT FALSE;

ALTER TABLE admin_users
  DROP CONSTRAINT IF EXISTS chk_admin_users_mfa_secret;

ALTER TABLE admin_users
  ADD CONSTRAINT chk_admin_users_tckn_format
  CHECK (
    tckn IS NULL
    OR regexp_replace(tckn, '\\D', '', 'g') ~ '^[0-9]{11}$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_tckn_unique
  ON admin_users ((regexp_replace(tckn, '\\D', '', 'g')))
  WHERE tckn IS NOT NULL;

COMMIT;
