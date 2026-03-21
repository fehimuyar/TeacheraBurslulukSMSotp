BEGIN;

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS school_shift_type TEXT,
  ADD COLUMN IF NOT EXISTS class_start_local TIME,
  ADD COLUMN IF NOT EXISTS class_end_local TIME;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'schools'::regclass
      AND conname = 'chk_schools_shift_type'
  ) THEN
    ALTER TABLE schools
      ADD CONSTRAINT chk_schools_shift_type
      CHECK (
        school_shift_type IS NULL
        OR school_shift_type IN ('MORNING', 'AFTERNOON', 'FULL_DAY')
      );
  END IF;
END $$;

COMMIT;
