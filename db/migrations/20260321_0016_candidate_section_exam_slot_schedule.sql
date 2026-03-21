BEGIN;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS section TEXT;

ALTER TABLE exam_attempts
  ADD COLUMN IF NOT EXISTS scheduled_exam_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exam_slot_label TEXT;

DO $$
DECLARE
  grade_constraint record;
BEGIN
  FOR grade_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'candidates'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%grade%'
      AND pg_get_constraintdef(oid) ILIKE '%BETWEEN 2 AND 11%'
  LOOP
    EXECUTE format('ALTER TABLE candidates DROP CONSTRAINT IF EXISTS %I', grade_constraint.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'candidates'::regclass
      AND conname = 'chk_candidates_grade_range'
  ) THEN
    ALTER TABLE candidates
      ADD CONSTRAINT chk_candidates_grade_range
      CHECK (grade BETWEEN 1 AND 12);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exam_attempts_scheduled_exam_at
  ON exam_attempts (scheduled_exam_at);

COMMIT;
