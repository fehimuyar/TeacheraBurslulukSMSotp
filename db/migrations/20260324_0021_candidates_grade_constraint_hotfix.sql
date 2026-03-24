-- 20260324_0021_candidates_grade_constraint_hotfix.sql
-- Production hotfix: remove legacy grade 2..11 constraint and enforce grade 1..12.

BEGIN;

DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Drop any legacy CHECK constraints that still enforce grade 2..11.
  FOR rec IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'candidates'
      AND c.contype = 'c'
      AND (
        pg_get_constraintdef(c.oid) ILIKE '%grade >= 2%grade <= 11%'
        OR pg_get_constraintdef(c.oid) ILIKE '%grade >= 2 AND grade <= 11%'
      )
  LOOP
    EXECUTE format('ALTER TABLE candidates DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;
END
$$;

ALTER TABLE candidates
  DROP CONSTRAINT IF EXISTS candidates_grade_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'candidates'
      AND c.conname = 'chk_candidates_grade_range'
  ) THEN
    ALTER TABLE candidates
      ADD CONSTRAINT chk_candidates_grade_range
      CHECK (grade >= 1 AND grade <= 12);
  END IF;
END
$$;

COMMIT;
