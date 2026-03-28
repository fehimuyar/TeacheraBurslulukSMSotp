BEGIN;

ALTER TABLE candidates
  DROP CONSTRAINT IF EXISTS candidates_grade_check;

ALTER TABLE candidates
  ADD CONSTRAINT candidates_grade_check
  CHECK (grade BETWEEN 1 AND 12);

ALTER TABLE results
  ADD COLUMN IF NOT EXISTS objective_score_80 NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS speaking_score_20 NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS speaking_status TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS final_score_100 NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS ranking_group TEXT,
  ADD COLUMN IF NOT EXISTS ranking_position INTEGER,
  ADD COLUMN IF NOT EXISTS ranking_total INTEGER,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

CREATE INDEX IF NOT EXISTS idx_results_ranking_group
  ON results (ranking_group, ranking_position)
  WHERE ranking_group IS NOT NULL;

CREATE TABLE IF NOT EXISTS speaking_responses (
  response_id UUID PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT,
  byte_size INTEGER,
  duration_seconds INTEGER,
  upload_status TEXT NOT NULL DEFAULT 'INITIATED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_speaking_responses_attempt_created
  ON speaking_responses (attempt_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_speaking_responses_attempt_question
  ON speaking_responses (attempt_id, question_id, created_at DESC);

COMMIT;
