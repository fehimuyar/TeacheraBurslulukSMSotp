BEGIN;

CREATE TABLE IF NOT EXISTS panel_result_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES results(id) ON UPDATE CASCADE ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON UPDATE CASCADE ON DELETE CASCADE,
  campaign_code TEXT NOT NULL REFERENCES campaigns(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  previous_score NUMERIC(5,2),
  previous_percentage NUMERIC(5,2),
  previous_placement_label TEXT,
  previous_cefr_band TEXT,
  new_score NUMERIC(5,2),
  new_percentage NUMERIC(5,2),
  new_placement_label TEXT,
  new_cefr_band TEXT,
  created_by TEXT NOT NULL,
  created_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_panel_result_overrides_result_created
  ON panel_result_overrides (result_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_panel_result_overrides_campaign_created
  ON panel_result_overrides (campaign_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_panel_result_overrides_candidate_created
  ON panel_result_overrides (candidate_id, created_at DESC);

CREATE TABLE IF NOT EXISTS panel_result_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES results(id) ON UPDATE CASCADE ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON UPDATE CASCADE ON DELETE CASCADE,
  campaign_code TEXT NOT NULL REFERENCES campaigns(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  previous_status result_status NOT NULL,
  next_status result_status NOT NULL,
  previous_published_at TIMESTAMPTZ,
  next_published_at TIMESTAMPTZ,
  publish_mode TEXT NOT NULL,
  enqueue_whatsapp BOOLEAN NOT NULL DEFAULT TRUE,
  published_by TEXT NOT NULL,
  published_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_panel_result_publications_result_created
  ON panel_result_publications (result_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_panel_result_publications_campaign_created
  ON panel_result_publications (campaign_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_panel_result_publications_candidate_created
  ON panel_result_publications (candidate_id, created_at DESC);

COMMIT;
