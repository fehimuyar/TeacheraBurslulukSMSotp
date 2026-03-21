BEGIN;

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS phone_e164 TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_users_phone_e164
  ON admin_users (phone_e164)
  WHERE phone_e164 IS NOT NULL;

CREATE TABLE IF NOT EXISTS panel_login_otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  challenge_token_hash TEXT NOT NULL,
  otp_code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_panel_login_otp_challenges_user_created
  ON panel_login_otp_challenges (admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_panel_login_otp_challenges_expires
  ON panel_login_otp_challenges (expires_at)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_panel_login_otp_challenges_token_hash
  ON panel_login_otp_challenges (challenge_token_hash);

COMMIT;
