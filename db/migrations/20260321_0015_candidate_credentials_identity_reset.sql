BEGIN;

CREATE SEQUENCE IF NOT EXISTS candidate_code_seq START WITH 100000;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS candidate_code TEXT,
  ADD COLUMN IF NOT EXISTS credential_password_hash TEXT,
  ADD COLUMN IF NOT EXISTS credential_password_updated_at TIMESTAMPTZ;

ALTER TABLE applications
  ALTER COLUMN candidate_code SET DEFAULT ('AD' || LPAD(nextval('candidate_code_seq')::text, 6, '0'));

UPDATE applications
SET candidate_code = ('AD' || LPAD(nextval('candidate_code_seq')::text, 6, '0'))
WHERE candidate_code IS NULL;

ALTER TABLE applications
  ALTER COLUMN candidate_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_candidate_code
  ON applications (candidate_code);

CREATE INDEX IF NOT EXISTS idx_applications_campaign_candidate_code
  ON applications (campaign_code, candidate_code);

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS identity_no_hash TEXT,
  ADD COLUMN IF NOT EXISTS birth_year SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_candidates_birth_year_range'
  ) THEN
    ALTER TABLE candidates
      ADD CONSTRAINT chk_candidates_birth_year_range
      CHECK (birth_year IS NULL OR (birth_year BETWEEN 1900 AND 2100));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_candidates_identity_recovery
  ON candidates (campaign_code, identity_no_hash, birth_year);

COMMIT;
