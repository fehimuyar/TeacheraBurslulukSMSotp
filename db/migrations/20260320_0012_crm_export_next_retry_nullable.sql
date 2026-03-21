BEGIN;

ALTER TABLE crm_export_jobs
  ALTER COLUMN next_retry_at DROP NOT NULL;

COMMIT;
