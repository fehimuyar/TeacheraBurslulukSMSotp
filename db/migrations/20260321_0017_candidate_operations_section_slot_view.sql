BEGIN;

DROP VIEW IF EXISTS v_candidate_operations;

CREATE VIEW v_candidate_operations AS
SELECT
  c.id AS candidate_id,
  a.application_no,
  c.full_name AS student_full_name,
  c.grade,
  c.section,
  s.name AS school_name,
  g.full_name AS parent_full_name,
  g.phone_e164 AS parent_phone_e164,
  a.status AS application_status,
  a.credentials_sms_status,
  ae_first_login.occurred_at AS first_login_at,
  ea.status AS exam_status,
  ea.started_at AS exam_started_at,
  ea.submitted_at AS exam_submitted_at,
  ea.scheduled_exam_at AS exam_scheduled_at,
  ea.exam_slot_label,
  r.status AS result_status,
  r.score AS result_score,
  r.viewed_at AS result_viewed_at,
  COALESCE(nj_wa.status, 'NOT_QUEUED'::notification_status) AS wa_result_status,
  COALESCE(ne_last.error_code, nj_wa.last_error_code) AS last_error_code,
  GREATEST(
    c.updated_at,
    a.updated_at,
    COALESCE(ea.updated_at, c.updated_at),
    COALESCE(r.updated_at, c.updated_at),
    COALESCE(nj_wa.updated_at, c.updated_at)
  ) AS updated_at,
  c.campaign_code,
  c.full_name_enc AS student_full_name_enc,
  c.full_name_hash AS student_full_name_hash,
  g.full_name_enc AS parent_full_name_enc,
  g.phone_e164_enc AS parent_phone_e164_enc,
  g.phone_e164_hash AS parent_phone_e164_hash
FROM candidates c
LEFT JOIN applications a ON a.candidate_id = c.id
LEFT JOIN schools s ON s.id = c.school_id
LEFT JOIN guardians g ON g.id = c.guardian_id
LEFT JOIN LATERAL (
  SELECT ea2.*
  FROM exam_attempts ea2
  WHERE ea2.candidate_id = c.id
  ORDER BY ea2.created_at DESC
  LIMIT 1
) ea ON TRUE
LEFT JOIN results r ON r.attempt_id = ea.id
LEFT JOIN LATERAL (
  SELECT ev.*
  FROM activity_events ev
  WHERE ev.candidate_id = c.id
    AND ev.event_type = 'FIRST_LOGIN'
  ORDER BY ev.occurred_at ASC
  LIMIT 1
) ae_first_login ON TRUE
LEFT JOIN LATERAL (
  SELECT nj.*
  FROM notification_jobs nj
  WHERE nj.candidate_id = c.id
    AND nj.channel = 'WHATSAPP'
    AND (nj.template_code = 'RESULT' OR nj.template_code = 'WA_RESULT')
  ORDER BY nj.created_at DESC
  LIMIT 1
) nj_wa ON TRUE
LEFT JOIN LATERAL (
  SELECT ne.*
  FROM notification_events ne
  WHERE ne.job_id = nj_wa.id
  ORDER BY ne.created_at DESC
  LIMIT 1
) ne_last ON TRUE;

COMMIT;
