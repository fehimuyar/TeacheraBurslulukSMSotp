BEGIN;

CREATE TABLE IF NOT EXISTS lead_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_type TEXT NOT NULL,
  form_subject TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  field_entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  form_source TEXT,
  crm_transfer_status TEXT NOT NULL DEFAULT 'NOT_TRANSFERRED',
  crm_transferred_at TIMESTAMPTZ,
  crm_transferred_by TEXT,
  crm_last_error TEXT,
  crm_last_attempt_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_lead_form_submissions_crm_transfer_status
    CHECK (crm_transfer_status IN ('NOT_TRANSFERRED', 'TRANSFERRED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_lead_form_submissions_received_at
  ON lead_form_submissions (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_form_submissions_type_received
  ON lead_form_submissions (form_type, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_form_submissions_crm_received
  ON lead_form_submissions (crm_transfer_status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_form_submissions_full_name
  ON lead_form_submissions (LOWER(COALESCE(full_name, '')));

CREATE INDEX IF NOT EXISTS idx_lead_form_submissions_phone
  ON lead_form_submissions (LOWER(COALESCE(phone, '')));

CREATE INDEX IF NOT EXISTS idx_lead_form_submissions_email
  ON lead_form_submissions (LOWER(COALESCE(email, '')));

CREATE TABLE IF NOT EXISTS lead_form_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES lead_form_submissions(id) ON UPDATE CASCADE ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_form_notes_submission_created
  ON lead_form_notes (submission_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_lead_form_note_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'lead_form_notes is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_lead_form_note_mutation ON lead_form_notes;

CREATE TRIGGER trg_prevent_lead_form_note_mutation
BEFORE UPDATE OR DELETE ON lead_form_notes
FOR EACH ROW
EXECUTE FUNCTION prevent_lead_form_note_mutation();

COMMIT;
