BEGIN;

ALTER TABLE scholarship_exam_submissions
  ADD COLUMN IF NOT EXISTS speaking_rubric JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS placement_label TEXT,
  ADD COLUMN IF NOT EXISTS cefr_band TEXT,
  ADD COLUMN IF NOT EXISTS finalized_by TEXT,
  ADD COLUMN IF NOT EXISTS finalized_role TEXT;

COMMIT;
