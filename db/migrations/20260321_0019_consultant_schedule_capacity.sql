BEGIN;

CREATE TABLE IF NOT EXISTS appointment_consultants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointment_consultant_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES appointment_consultants(id) ON UPDATE CASCADE ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_local TIME NOT NULL,
  end_local TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_appointment_consultant_availability_window CHECK (end_local > start_local),
  CONSTRAINT uq_appointment_consultant_availability UNIQUE (consultant_id, day_of_week, start_local, end_local)
);

CREATE TABLE IF NOT EXISTS appointment_consultant_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES appointment_consultants(id) ON UPDATE CASCADE ON DELETE CASCADE,
  leave_start_utc TIMESTAMPTZ NOT NULL,
  leave_end_utc TIMESTAMPTZ NOT NULL,
  is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_appointment_consultant_leave_window CHECK (leave_end_utc > leave_start_utc)
);

CREATE INDEX IF NOT EXISTS idx_appointment_consultants_active
  ON appointment_consultants (is_active, consultant_code);

CREATE INDEX IF NOT EXISTS idx_appointment_consultant_availability_lookup
  ON appointment_consultant_availability (day_of_week, start_local, end_local)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_appointment_consultant_leaves_lookup
  ON appointment_consultant_leaves (consultant_id, leave_start_utc, leave_end_utc)
  WHERE is_cancelled = FALSE;

INSERT INTO appointment_consultants (consultant_code, display_name, timezone, is_active)
VALUES
  ('CONSULTANT_1', 'Egitim Danismani 1', 'Europe/Istanbul', TRUE),
  ('CONSULTANT_2', 'Egitim Danismani 2', 'Europe/Istanbul', TRUE),
  ('CONSULTANT_3', 'Egitim Danismani 3', 'Europe/Istanbul', TRUE)
ON CONFLICT (consultant_code) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  timezone = EXCLUDED.timezone,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

WITH consultant_base AS (
  SELECT id
  FROM appointment_consultants
  WHERE consultant_code IN ('CONSULTANT_1', 'CONSULTANT_2', 'CONSULTANT_3')
),
default_days AS (
  SELECT generate_series(1, 6)::smallint AS day_of_week
)
INSERT INTO appointment_consultant_availability (
  consultant_id,
  day_of_week,
  start_local,
  end_local,
  is_active
)
SELECT
  c.id,
  d.day_of_week,
  '10:00'::time,
  '20:00'::time,
  TRUE
FROM consultant_base c
CROSS JOIN default_days d
ON CONFLICT ON CONSTRAINT uq_appointment_consultant_availability DO NOTHING;

COMMIT;
