BEGIN;

CREATE TABLE IF NOT EXISTS scholarship_exam_submissions (
  attempt_id UUID PRIMARY KEY REFERENCES exam_attempts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON UPDATE CASCADE ON DELETE CASCADE,
  campaign_code TEXT NOT NULL REFERENCES campaigns(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  exam_version_key TEXT NOT NULL,
  content_grade TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'STARTED',
  objective_score NUMERIC(6,2),
  objective_percentage NUMERIC(5,2),
  objective_question_count INTEGER NOT NULL DEFAULT 0,
  objective_answered_count INTEGER NOT NULL DEFAULT 0,
  objective_correct_count INTEGER NOT NULL DEFAULT 0,
  objective_wrong_count INTEGER NOT NULL DEFAULT 0,
  objective_unanswered_count INTEGER NOT NULL DEFAULT 0,
  speaking_expected_count INTEGER NOT NULL DEFAULT 0,
  speaking_uploaded_count INTEGER NOT NULL DEFAULT 0,
  objective_answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  speaking_responses JSONB NOT NULL DEFAULT '[]'::jsonb,
  speaking_score NUMERIC(5,2),
  final_score NUMERIC(5,2),
  submitted_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scholarship_exam_submissions_status_updated
  ON scholarship_exam_submissions (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_scholarship_exam_submissions_campaign_updated
  ON scholarship_exam_submissions (campaign_code, updated_at DESC);

CREATE TABLE IF NOT EXISTS exam_speaking_responses (
  response_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON UPDATE CASCADE ON DELETE CASCADE,
  campaign_code TEXT NOT NULL REFERENCES campaigns(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  exam_version_key TEXT NOT NULL,
  question_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 1800),
  status TEXT NOT NULL DEFAULT 'INITIATED',
  upload_token_hash TEXT,
  upload_expires_at TIMESTAMPTZ,
  audio_blob BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_exam_speaking_responses_attempt_question
  ON exam_speaking_responses (attempt_id, question_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exam_speaking_responses_status_expires
  ON exam_speaking_responses (status, upload_expires_at);

COMMIT;
