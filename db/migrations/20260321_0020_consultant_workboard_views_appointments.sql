BEGIN;

CREATE TABLE IF NOT EXISTS consultant_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_start_at TIMESTAMPTZ NOT NULL UNIQUE,
  slot_end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  capacity INTEGER NOT NULL DEFAULT 3,
  booked_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_consultant_slots_capacity CHECK (capacity >= 0),
  CONSTRAINT chk_consultant_slots_booked_count CHECK (booked_count >= 0),
  CONSTRAINT chk_consultant_slots_window CHECK (slot_end_at > slot_start_at)
);

CREATE INDEX IF NOT EXISTS idx_consultant_slots_start_active
  ON consultant_slots (slot_start_at, is_active);

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON UPDATE CASCADE ON DELETE CASCADE,
  attempt_id UUID REFERENCES exam_attempts(id) ON UPDATE CASCADE ON DELETE SET NULL,
  consultant_slot_id UUID REFERENCES consultant_slots(id) ON UPDATE CASCADE ON DELETE SET NULL,
  appointment_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'BOOKED',
  source TEXT,
  note TEXT,
  booked_at TIMESTAMPTZ,
  attended_at TIMESTAMPTZ,
  no_show_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_appointments_candidate UNIQUE (candidate_id),
  CONSTRAINT chk_appointments_status CHECK (status IN ('BOOKED', 'ATTENDED', 'NO_SHOW', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_slot_status
  ON appointments (consultant_slot_id, status, appointment_at);

CREATE INDEX IF NOT EXISTS idx_appointments_status_updated
  ON appointments (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS appointment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(id) ON UPDATE CASCADE ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON UPDATE CASCADE ON DELETE CASCADE,
  attempt_id UUID REFERENCES exam_attempts(id) ON UPDATE CASCADE ON DELETE SET NULL,
  activity_event_id UUID UNIQUE REFERENCES activity_events(id) ON UPDATE CASCADE ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_type TEXT,
  actor_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_appointment_events_type CHECK (event_type IN ('APPOINTMENT_BOOKED', 'APPOINTMENT_ATTENDED', 'APPOINTMENT_NO_SHOW'))
);

CREATE INDEX IF NOT EXISTS idx_appointment_events_candidate_occurred
  ON appointment_events (candidate_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointment_events_appointment_occurred
  ON appointment_events (appointment_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION sync_appointments_from_activity_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_type TEXT := UPPER(COALESCE(NEW.event_type, ''));
  v_status TEXT;
  v_appointment_at TIMESTAMPTZ;
  v_capacity INTEGER := 3;
  v_slot_duration_minutes INTEGER := 30;
  v_slot_id UUID;
  v_appointment_id UUID;
  v_source TEXT;
  v_note TEXT;
BEGIN
  IF v_event_type NOT IN ('APPOINTMENT_BOOKED', 'APPOINTMENT_ATTENDED', 'APPOINTMENT_NO_SHOW') THEN
    RETURN NEW;
  END IF;

  IF NEW.candidate_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_status := CASE
    WHEN v_event_type = 'APPOINTMENT_ATTENDED' THEN 'ATTENDED'
    WHEN v_event_type = 'APPOINTMENT_NO_SHOW' THEN 'NO_SHOW'
    ELSE 'BOOKED'
  END;

  IF NEW.event_payload ? 'appointment_at'
     AND COALESCE(NEW.event_payload->>'appointment_at', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
  THEN
    v_appointment_at := (NEW.event_payload->>'appointment_at')::timestamptz;
  ELSE
    v_appointment_at := NEW.occurred_at;
  END IF;

  IF COALESCE(NEW.event_payload->>'consultant_pool_size', '') ~ '^[0-9]+$' THEN
    v_capacity := GREATEST((NEW.event_payload->>'consultant_pool_size')::INTEGER, 0);
  END IF;

  IF COALESCE(NEW.event_payload->>'slot_duration_minutes', '') ~ '^[0-9]+$' THEN
    v_slot_duration_minutes := GREATEST((NEW.event_payload->>'slot_duration_minutes')::INTEGER, 1);
  END IF;

  v_source := NULLIF(BTRIM(NEW.event_payload->>'source'), '');
  v_note := NULLIF(BTRIM(NEW.event_payload->>'note'), '');

  INSERT INTO consultant_slots (
    slot_start_at,
    slot_end_at,
    capacity,
    updated_at
  )
  VALUES (
    v_appointment_at,
    v_appointment_at + make_interval(mins => v_slot_duration_minutes),
    v_capacity,
    NOW()
  )
  ON CONFLICT (slot_start_at) DO UPDATE
  SET
    slot_end_at = EXCLUDED.slot_end_at,
    capacity = GREATEST(consultant_slots.capacity, EXCLUDED.capacity),
    updated_at = NOW()
  RETURNING id INTO v_slot_id;

  INSERT INTO appointments (
    candidate_id,
    attempt_id,
    consultant_slot_id,
    appointment_at,
    status,
    source,
    note,
    booked_at,
    attended_at,
    no_show_at,
    updated_at
  )
  VALUES (
    NEW.candidate_id,
    NEW.attempt_id,
    v_slot_id,
    v_appointment_at,
    v_status,
    v_source,
    v_note,
    CASE WHEN v_status = 'BOOKED' THEN NEW.occurred_at ELSE NULL END,
    CASE WHEN v_status = 'ATTENDED' THEN NEW.occurred_at ELSE NULL END,
    CASE WHEN v_status = 'NO_SHOW' THEN NEW.occurred_at ELSE NULL END,
    NOW()
  )
  ON CONFLICT (candidate_id) DO UPDATE
  SET
    attempt_id = EXCLUDED.attempt_id,
    consultant_slot_id = EXCLUDED.consultant_slot_id,
    appointment_at = EXCLUDED.appointment_at,
    status = EXCLUDED.status,
    source = COALESCE(EXCLUDED.source, appointments.source),
    note = COALESCE(EXCLUDED.note, appointments.note),
    booked_at = CASE
      WHEN EXCLUDED.status = 'BOOKED' THEN COALESCE(EXCLUDED.booked_at, appointments.booked_at, NOW())
      ELSE appointments.booked_at
    END,
    attended_at = CASE
      WHEN EXCLUDED.status = 'ATTENDED' THEN COALESCE(EXCLUDED.attended_at, appointments.attended_at, NOW())
      ELSE appointments.attended_at
    END,
    no_show_at = CASE
      WHEN EXCLUDED.status = 'NO_SHOW' THEN COALESCE(EXCLUDED.no_show_at, appointments.no_show_at, NOW())
      ELSE appointments.no_show_at
    END,
    updated_at = NOW()
  RETURNING id INTO v_appointment_id;

  INSERT INTO appointment_events (
    appointment_id,
    candidate_id,
    attempt_id,
    activity_event_id,
    event_type,
    event_payload,
    actor_type,
    actor_id,
    occurred_at
  )
  VALUES (
    v_appointment_id,
    NEW.candidate_id,
    NEW.attempt_id,
    NEW.id,
    v_event_type,
    COALESCE(NEW.event_payload, '{}'::jsonb),
    COALESCE(NEW.event_payload->>'actor_type', 'SYSTEM'),
    NULLIF(BTRIM(NEW.event_payload->>'actor_id'), ''),
    NEW.occurred_at
  )
  ON CONFLICT (activity_event_id) DO NOTHING;

  UPDATE consultant_slots cs
  SET
    booked_count = COALESCE(
      (
        SELECT COUNT(*)::INTEGER
        FROM appointments a
        WHERE a.consultant_slot_id = cs.id
          AND a.status IN ('BOOKED', 'ATTENDED', 'NO_SHOW')
      ),
      0
    ),
    updated_at = NOW()
  WHERE cs.id = v_slot_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_appointments_from_activity_event ON activity_events;
CREATE TRIGGER trg_sync_appointments_from_activity_event
AFTER INSERT ON activity_events
FOR EACH ROW
EXECUTE FUNCTION sync_appointments_from_activity_event();

WITH appt_source AS (
  SELECT
    ae.id AS activity_event_id,
    ae.candidate_id,
    ae.attempt_id,
    ae.event_type,
    ae.event_payload,
    ae.occurred_at,
    CASE
      WHEN ae.event_payload ? 'appointment_at'
        AND COALESCE(ae.event_payload->>'appointment_at', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
      THEN (ae.event_payload->>'appointment_at')::timestamptz
      ELSE ae.occurred_at
    END AS appointment_at,
    CASE
      WHEN COALESCE(ae.event_payload->>'consultant_pool_size', '') ~ '^[0-9]+$'
      THEN GREATEST((ae.event_payload->>'consultant_pool_size')::INTEGER, 0)
      ELSE 3
    END AS capacity
  FROM activity_events ae
  WHERE ae.event_type IN ('APPOINTMENT_BOOKED', 'APPOINTMENT_ATTENDED', 'APPOINTMENT_NO_SHOW')
),
slot_seed AS (
  SELECT
    appointment_at,
    MAX(capacity) AS capacity
  FROM appt_source
  GROUP BY appointment_at
)
INSERT INTO consultant_slots (
  slot_start_at,
  slot_end_at,
  capacity,
  updated_at
)
SELECT
  ss.appointment_at,
  ss.appointment_at + interval '30 minutes',
  ss.capacity,
  NOW()
FROM slot_seed ss
ON CONFLICT (slot_start_at) DO UPDATE
SET
  slot_end_at = EXCLUDED.slot_end_at,
  capacity = GREATEST(consultant_slots.capacity, EXCLUDED.capacity),
  updated_at = NOW();

WITH appt_source AS (
  SELECT
    ae.id AS activity_event_id,
    ae.candidate_id,
    ae.attempt_id,
    ae.event_type,
    ae.event_payload,
    ae.occurred_at,
    CASE
      WHEN ae.event_payload ? 'appointment_at'
        AND COALESCE(ae.event_payload->>'appointment_at', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
      THEN (ae.event_payload->>'appointment_at')::timestamptz
      ELSE ae.occurred_at
    END AS appointment_at,
    ROW_NUMBER() OVER (
      PARTITION BY ae.candidate_id
      ORDER BY ae.occurred_at DESC, ae.id DESC
    ) AS rn
  FROM activity_events ae
  WHERE ae.event_type IN ('APPOINTMENT_BOOKED', 'APPOINTMENT_ATTENDED', 'APPOINTMENT_NO_SHOW')
),
latest AS (
  SELECT *
  FROM appt_source
  WHERE rn = 1
)
INSERT INTO appointments (
  candidate_id,
  attempt_id,
  consultant_slot_id,
  appointment_at,
  status,
  source,
  note,
  booked_at,
  attended_at,
  no_show_at,
  updated_at
)
SELECT
  l.candidate_id,
  l.attempt_id,
  cs.id,
  l.appointment_at,
  CASE
    WHEN l.event_type = 'APPOINTMENT_ATTENDED' THEN 'ATTENDED'
    WHEN l.event_type = 'APPOINTMENT_NO_SHOW' THEN 'NO_SHOW'
    ELSE 'BOOKED'
  END AS status,
  NULLIF(BTRIM(l.event_payload->>'source'), '') AS source,
  NULLIF(BTRIM(l.event_payload->>'note'), '') AS note,
  CASE WHEN l.event_type = 'APPOINTMENT_BOOKED' THEN l.occurred_at ELSE NULL END AS booked_at,
  CASE WHEN l.event_type = 'APPOINTMENT_ATTENDED' THEN l.occurred_at ELSE NULL END AS attended_at,
  CASE WHEN l.event_type = 'APPOINTMENT_NO_SHOW' THEN l.occurred_at ELSE NULL END AS no_show_at,
  NOW()
FROM latest l
LEFT JOIN consultant_slots cs ON cs.slot_start_at = l.appointment_at
ON CONFLICT (candidate_id) DO UPDATE
SET
  attempt_id = EXCLUDED.attempt_id,
  consultant_slot_id = EXCLUDED.consultant_slot_id,
  appointment_at = EXCLUDED.appointment_at,
  status = EXCLUDED.status,
  source = COALESCE(EXCLUDED.source, appointments.source),
  note = COALESCE(EXCLUDED.note, appointments.note),
  booked_at = CASE
    WHEN EXCLUDED.status = 'BOOKED' THEN COALESCE(EXCLUDED.booked_at, appointments.booked_at, NOW())
    ELSE appointments.booked_at
  END,
  attended_at = CASE
    WHEN EXCLUDED.status = 'ATTENDED' THEN COALESCE(EXCLUDED.attended_at, appointments.attended_at, NOW())
    ELSE appointments.attended_at
  END,
  no_show_at = CASE
    WHEN EXCLUDED.status = 'NO_SHOW' THEN COALESCE(EXCLUDED.no_show_at, appointments.no_show_at, NOW())
    ELSE appointments.no_show_at
  END,
  updated_at = NOW();

INSERT INTO appointment_events (
  appointment_id,
  candidate_id,
  attempt_id,
  activity_event_id,
  event_type,
  event_payload,
  actor_type,
  actor_id,
  occurred_at
)
SELECT
  a.id AS appointment_id,
  ae.candidate_id,
  ae.attempt_id,
  ae.id AS activity_event_id,
  ae.event_type,
  COALESCE(ae.event_payload, '{}'::jsonb),
  COALESCE(ae.event_payload->>'actor_type', 'SYSTEM'),
  NULLIF(BTRIM(ae.event_payload->>'actor_id'), ''),
  ae.occurred_at
FROM activity_events ae
JOIN appointments a ON a.candidate_id = ae.candidate_id
WHERE ae.event_type IN ('APPOINTMENT_BOOKED', 'APPOINTMENT_ATTENDED', 'APPOINTMENT_NO_SHOW')
ON CONFLICT (activity_event_id) DO NOTHING;

UPDATE consultant_slots cs
SET
  booked_count = COALESCE(
    (
      SELECT COUNT(*)::INTEGER
      FROM appointments a
      WHERE a.consultant_slot_id = cs.id
        AND a.status IN ('BOOKED', 'ATTENDED', 'NO_SHOW')
    ),
    0
  ),
  updated_at = NOW();

CREATE OR REPLACE VIEW v_consultant_workboard AS
WITH owner_audit AS (
  SELECT
    candidate_item.value::uuid AS candidate_id,
    al.actor_id,
    al.actor_role,
    NULLIF(BTRIM(al.metadata ->> 'actorName'), '') AS actor_name,
    al.created_at,
    al.seq,
    ROW_NUMBER() OVER (
      PARTITION BY candidate_item.value
      ORDER BY al.created_at DESC, al.seq DESC
    ) AS rn
  FROM audit_log_entries al
  JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(al.metadata -> 'candidateIds') = 'array' THEN al.metadata -> 'candidateIds'
      ELSE '[]'::jsonb
    END
  ) candidate_item(value) ON TRUE
  WHERE al.actor_type = 'PANEL_USER'
    AND candidate_item.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND al.action IN (
      'PANEL_CANDIDATE_NOTE_ADD',
      'PANEL_CANDIDATE_APPOINTMENT_BOOKED',
      'PANEL_CANDIDATE_APPOINTMENT_ATTENDED',
      'PANEL_CANDIDATE_APPOINTMENT_NO_SHOW',
      'PANEL_CANDIDATE_SMS_RETRY',
      'PANEL_CANDIDATE_WA_SEND',
      'PANEL_UNVIEWED_RESULTS_WA_SEND',
      'PANEL_UNVIEWED_RESULTS_BOT_SCAN'
    )
),
owner_latest AS (
  SELECT
    oa.candidate_id,
    oa.actor_id AS owner_id,
    COALESCE(oa.actor_name, NULLIF(BTRIM(au.full_name), ''), NULLIF(BTRIM(au.email), '')) AS owner_name,
    NULLIF(BTRIM(oa.actor_role), '') AS owner_role,
    oa.created_at AS owner_assigned_at
  FROM owner_audit oa
  LEFT JOIN admin_users au ON au.id::text = oa.actor_id
  WHERE oa.rn = 1
),
latest_appointment AS (
  SELECT
    a.candidate_id,
    a.status AS appointment_status,
    a.appointment_at,
    a.booked_at,
    a.attended_at,
    a.no_show_at,
    ROW_NUMBER() OVER (
      PARTITION BY a.candidate_id
      ORDER BY a.updated_at DESC, a.created_at DESC
    ) AS rn
  FROM appointments a
)
SELECT
  v.candidate_id,
  v.campaign_code,
  v.application_no,
  v.student_full_name,
  v.grade,
  v.section,
  v.school_name,
  v.result_score,
  v.result_status,
  v.result_viewed_at,
  COALESCE(la.appointment_status, 'NONE') AS appointment_status,
  la.appointment_at,
  la.booked_at,
  la.attended_at,
  la.no_show_at,
  ol.owner_id,
  COALESCE(ol.owner_name, 'Unassigned') AS owner_name,
  COALESCE(ol.owner_role, 'UNASSIGNED') AS owner_role,
  ol.owner_assigned_at,
  (
    COALESCE(v.result_status, 'NOT_READY') <> 'VIEWED'
    OR COALESCE(la.appointment_status, 'NONE') = 'NO_SHOW'
    OR (
      COALESCE(v.result_status, 'NOT_READY') = 'VIEWED'
      AND COALESCE(la.appointment_status, 'NONE') = 'NONE'
    )
  ) AS follow_up_needed,
  (COALESCE(v.result_status, 'NOT_READY') <> 'VIEWED') AS unviewed_result,
  (COALESCE(v.result_status, 'NOT_READY') = 'VIEWED' AND COALESCE(la.appointment_status, 'NONE') = 'NONE') AS viewed_no_appointment,
  v.updated_at
FROM v_candidate_operations v
LEFT JOIN latest_appointment la
  ON la.candidate_id = v.candidate_id
 AND la.rn = 1
LEFT JOIN owner_latest ol
  ON ol.candidate_id = v.candidate_id;

CREATE OR REPLACE VIEW v_school_performance AS
SELECT
  w.campaign_code,
  COALESCE(w.school_name, 'Unknown') AS school_name,
  w.grade,
  COALESCE(w.section, '-') AS section,
  COUNT(*)::INTEGER AS total_candidates,
  COUNT(*) FILTER (WHERE w.follow_up_needed)::INTEGER AS follow_up_needed,
  COUNT(*) FILTER (WHERE w.unviewed_result)::INTEGER AS unviewed_results,
  COUNT(*) FILTER (WHERE w.viewed_no_appointment)::INTEGER AS viewed_no_appointment,
  COUNT(*) FILTER (WHERE w.appointment_status = 'NO_SHOW')::INTEGER AS appointment_no_show,
  MAX(w.updated_at) AS updated_at
FROM v_consultant_workboard w
GROUP BY
  w.campaign_code,
  COALESCE(w.school_name, 'Unknown'),
  w.grade,
  COALESCE(w.section, '-');

COMMIT;
