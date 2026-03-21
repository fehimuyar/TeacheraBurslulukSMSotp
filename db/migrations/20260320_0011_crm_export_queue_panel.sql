BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_export_status') THEN
    CREATE TYPE crm_export_status AS ENUM (
      'QUEUED',
      'PROCESSING',
      'SUCCEEDED',
      'FAILED',
      'RETRYING',
      'DLQ',
      'CANCELLED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_code TEXT NOT NULL REFERENCES campaigns(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON UPDATE CASCADE ON DELETE CASCADE,
  attempt_id UUID REFERENCES exam_attempts(id) ON UPDATE CASCADE ON DELETE SET NULL,
  result_id UUID REFERENCES results(id) ON UPDATE CASCADE ON DELETE SET NULL,
  destination TEXT NOT NULL DEFAULT 'EXTERNAL_CRM',
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB,
  status crm_export_status NOT NULL DEFAULT 'QUEUED',
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ DEFAULT NOW(),
  http_status INTEGER,
  external_reference TEXT,
  error_code TEXT,
  error_message TEXT,
  enqueued_by TEXT,
  enqueued_role TEXT,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_export_jobs_status_retry
  ON crm_export_jobs (status, next_retry_at, created_at);

CREATE INDEX IF NOT EXISTS idx_crm_export_jobs_candidate_created
  ON crm_export_jobs (candidate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_export_jobs_campaign_created
  ON crm_export_jobs (campaign_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_export_jobs_error_created
  ON crm_export_jobs (error_code, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_export_jobs_campaign_candidate_active
  ON crm_export_jobs (campaign_code, candidate_id)
  WHERE status IN ('QUEUED', 'PROCESSING', 'RETRYING');

CREATE OR REPLACE VIEW v_crm_export_jobs AS
SELECT
  ce.id AS job_id,
  ce.campaign_code,
  ce.candidate_id,
  ce.attempt_id,
  ce.result_id,
  ce.destination,
  ce.request_payload,
  ce.response_payload,
  ce.status,
  ce.retry_count,
  ce.next_retry_at,
  ce.http_status,
  ce.external_reference,
  ce.error_code,
  ce.error_message,
  ce.enqueued_by,
  ce.enqueued_role,
  ce.enqueued_at,
  ce.processed_at,
  ce.created_at,
  ce.updated_at,
  a.application_no,
  c.full_name AS student_full_name,
  c.full_name_enc AS student_full_name_enc,
  c.grade,
  s.name AS school_name,
  g.full_name AS parent_full_name,
  g.full_name_enc AS parent_full_name_enc,
  g.phone_e164 AS parent_phone_e164,
  g.phone_e164_enc AS parent_phone_e164_enc
FROM crm_export_jobs ce
JOIN candidates c ON c.id = ce.candidate_id
LEFT JOIN schools s ON s.id = c.school_id
LEFT JOIN guardians g ON g.id = c.guardian_id
LEFT JOIN LATERAL (
  SELECT application_no
  FROM applications a2
  WHERE a2.candidate_id = c.id
  ORDER BY a2.created_at DESC
  LIMIT 1
) a ON TRUE;

COMMIT;
