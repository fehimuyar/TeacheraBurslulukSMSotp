// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { query } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { clampInt, handleRequest, methodGuard, ok, safeTrim } from '../../_lib/http.js';
import { enforceRateLimit, getRequestIp } from '../../_lib/redisRateLimit.js';
import { requireExamSession } from '../../_lib/sessionAuth.js';

function readAttemptId(req) {
  const queryValue = Array.isArray(req.query?.attemptId) ? req.query.attemptId[0] : req.query?.attemptId;
  return safeTrim(queryValue);
}

function readBoundedIntEnv(name, fallback, min, max) {
  return clampInt(process.env[name], min, max, fallback);
}

function readAppointmentConfig() {
  const consultantCount = readBoundedIntEnv('APPOINTMENT_CONSULTANT_COUNT', 3, 1, 12);
  const slotDurationMinutes = readBoundedIntEnv('APPOINTMENT_SLOT_DURATION_MINUTES', 30, 15, 120);
  const workdayStartHour = readBoundedIntEnv('APPOINTMENT_WORKDAY_START_HOUR', 10, 0, 23);
  const defaultWorkdayEnd = Math.max(workdayStartHour + 1, 20);
  const workdayEndHour = clampInt(
    process.env.APPOINTMENT_WORKDAY_END_HOUR,
    workdayStartHour + 1,
    24,
    Math.min(defaultWorkdayEnd, 24),
  );
  const lookaheadDays = readBoundedIntEnv('APPOINTMENT_LOOKAHEAD_DAYS', 7, 1, 30);
  const leadMinutes = readBoundedIntEnv('APPOINTMENT_MIN_LEAD_MINUTES', 30, 5, 24 * 60);
  const timezone = safeTrim(process.env.APPOINTMENT_BOOKING_TIMEZONE) || 'Europe/Istanbul';
  return {
    consultantCount,
    slotDurationMinutes,
    workdayStartHour,
    workdayEndHour,
    lookaheadDays,
    leadMinutes,
    timezone,
  };
}

function isUndefinedRelationError(error) {
  return Boolean(error && (error.code === '42P01' || error.code === '42703'));
}

function parseTimeToMinutes(raw) {
  const value = safeTrim(raw);
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

function readLocalMinutes(slotIso, timezone) {
  const date = new Date(slotIso);
  if (!Number.isFinite(date.getTime())) return null;
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  if (!Number.isFinite(localDate.getTime())) return null;
  return (localDate.getHours() * 60) + localDate.getMinutes();
}

function resolveSchoolFriendly(slotIso, schoolSchedule, timezone) {
  if (!schoolSchedule) return null;
  const localMinutes = readLocalMinutes(slotIso, timezone);
  if (!Number.isFinite(localMinutes)) return null;
  const bufferMinutes = 30;
  const classStartMinutes = parseTimeToMinutes(schoolSchedule.class_start_local);
  const classEndMinutes = parseTimeToMinutes(schoolSchedule.class_end_local);

  if (Number.isFinite(classStartMinutes) && Number.isFinite(classEndMinutes)) {
    const beforeSchool = localMinutes <= Math.max(0, classStartMinutes - bufferMinutes);
    const afterSchool = localMinutes >= Math.min((24 * 60) - 1, classEndMinutes + bufferMinutes);
    return beforeSchool || afterSchool;
  }

  const shiftType = safeTrim(schoolSchedule.school_shift_type).toUpperCase();
  if (shiftType === 'MORNING') return localMinutes >= (13 * 60);
  if (shiftType === 'AFTERNOON') return localMinutes <= (11 * 60) + 30;
  if (shiftType === 'FULL_DAY') return localMinutes >= (18 * 60);
  return null;
}

async function assertResultReady(attemptId) {
  const { rows } = await query(
    `
      SELECT id AS result_id, candidate_id, attempt_id, status
      FROM results
      WHERE attempt_id = $1
      LIMIT 1
    `,
    [attemptId],
  );
  if (rows.length === 0) {
    throw new HttpError(404, 'Result was not found.', 'result_not_found');
  }
  const result = rows[0];
  if (!['PUBLISHED', 'VIEWED'].includes(String(result.status || '').toUpperCase())) {
    throw new HttpError(409, 'Result is not published yet.', 'result_not_published');
  }
  return result;
}

async function readGeneratedSlots({ config, limit }) {
  const { rows } = await query(
    `
      WITH cfg AS (
        SELECT
          $1::int AS slot_minutes,
          $2::int AS start_hour,
          $3::int AS end_hour,
          $4::int AS lookahead_days,
          $5::text AS tz_name,
          $6::int AS lead_minutes
      ),
      days AS (
        SELECT generate_series(
          date_trunc('day', NOW() AT TIME ZONE (SELECT tz_name FROM cfg)),
          date_trunc('day', NOW() AT TIME ZONE (SELECT tz_name FROM cfg))
            + make_interval(days => (SELECT lookahead_days FROM cfg)),
          interval '1 day'
        ) AS local_day
      ),
      slot_candidates AS (
        SELECT
          (
            d.local_day
            + make_interval(hours => (SELECT start_hour FROM cfg))
            + make_interval(mins => (slot_index.idx * (SELECT slot_minutes FROM cfg)))
          ) AS local_slot
        FROM days d
        CROSS JOIN LATERAL generate_series(
          0,
          GREATEST((((SELECT end_hour FROM cfg) - (SELECT start_hour FROM cfg)) * 60 / (SELECT slot_minutes FROM cfg)) - 1, 0)
        ) AS slot_index(idx)
      )
      SELECT (local_slot AT TIME ZONE (SELECT tz_name FROM cfg)) AS appointment_at
      FROM slot_candidates
      WHERE (local_slot AT TIME ZONE (SELECT tz_name FROM cfg))
        >= NOW() + make_interval(mins => (SELECT lead_minutes FROM cfg))
      ORDER BY appointment_at ASC
      LIMIT $7
    `,
    [
      config.slotDurationMinutes,
      config.workdayStartHour,
      config.workdayEndHour,
      config.lookaheadDays,
      config.timezone,
      config.leadMinutes,
      limit,
    ],
  );
  return rows
    .map((row) => {
      const iso = row?.appointment_at ? new Date(row.appointment_at).toISOString() : '';
      return iso || null;
    })
    .filter(Boolean);
}

async function readBookedCounts(slotIsoList) {
  if (!Array.isArray(slotIsoList) || slotIsoList.length === 0) {
    return new Map();
  }

  const { rows } = await query(
    `
      WITH slot_values AS (
        SELECT unnest($1::timestamptz[]) AS appointment_at
      ),
      booked_raw AS (
        SELECT
          candidate_id,
          CASE
            WHEN event_payload ? 'appointment_at'
              AND COALESCE(event_payload->>'appointment_at', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
            THEN (event_payload->>'appointment_at')::timestamptz
            ELSE NULL
          END AS appointment_at
        FROM activity_events
        WHERE event_type = 'APPOINTMENT_BOOKED'
          AND occurred_at >= NOW() - interval '90 days'
      )
      SELECT
        sv.appointment_at,
        COUNT(DISTINCT br.candidate_id)::int AS booked_count
      FROM slot_values sv
      LEFT JOIN booked_raw br ON br.appointment_at = sv.appointment_at
      GROUP BY sv.appointment_at
      ORDER BY sv.appointment_at ASC
    `,
    [slotIsoList],
  );

  const counts = new Map();
  for (const row of rows) {
    const key = row?.appointment_at ? new Date(row.appointment_at).toISOString() : '';
    if (!key) continue;
    counts.set(key, Number(row.booked_count || 0));
  }
  return counts;
}

async function readScheduleCapacityMap(slotIsoList, config) {
  if (!Array.isArray(slotIsoList) || slotIsoList.length === 0) {
    return {
      capacityMap: new Map(),
      capacitySource: 'env_fallback',
      activeConsultants: 0,
      activeAvailabilityRules: 0,
    };
  }

  try {
    const readiness = await query(
      `
        SELECT
          (
            SELECT COUNT(*)::int
            FROM appointment_consultants c
            WHERE c.is_active = TRUE
          ) AS active_consultants,
          (
            SELECT COUNT(*)::int
            FROM appointment_consultant_availability a
            INNER JOIN appointment_consultants c ON c.id = a.consultant_id
            WHERE a.is_active = TRUE
              AND c.is_active = TRUE
          ) AS active_availability_rules
      `,
      [],
    );

    const activeConsultants = Number(readiness.rows?.[0]?.active_consultants || 0);
    const activeAvailabilityRules = Number(readiness.rows?.[0]?.active_availability_rules || 0);
    if (activeConsultants <= 0 || activeAvailabilityRules <= 0) {
      return {
        capacityMap: new Map(),
        capacitySource: 'env_fallback',
        activeConsultants,
        activeAvailabilityRules,
      };
    }

    const { rows } = await query(
      `
        WITH slot_values AS (
          SELECT unnest($1::timestamptz[]) AS appointment_at
        ),
        eligible AS (
          SELECT
            sv.appointment_at,
            c.id AS consultant_id
          FROM slot_values sv
          INNER JOIN appointment_consultants c ON c.is_active = TRUE
          INNER JOIN appointment_consultant_availability a
            ON a.consultant_id = c.id
           AND a.is_active = TRUE
           AND a.day_of_week = EXTRACT(DOW FROM (sv.appointment_at AT TIME ZONE $2))::int
           AND (sv.appointment_at AT TIME ZONE $2)::time >= a.start_local
           AND (sv.appointment_at AT TIME ZONE $2)::time < a.end_local
          LEFT JOIN appointment_consultant_leaves l
            ON l.consultant_id = c.id
           AND COALESCE(l.is_cancelled, FALSE) = FALSE
           AND sv.appointment_at >= l.leave_start_utc
           AND sv.appointment_at < l.leave_end_utc
          WHERE l.id IS NULL
        )
        SELECT
          sv.appointment_at,
          COALESCE(COUNT(DISTINCT e.consultant_id), 0)::int AS schedule_capacity
        FROM slot_values sv
        LEFT JOIN eligible e ON e.appointment_at = sv.appointment_at
        GROUP BY sv.appointment_at
        ORDER BY sv.appointment_at ASC
      `,
      [slotIsoList, config.timezone],
    );

    const capacityMap = new Map();
    for (const row of rows) {
      const key = row?.appointment_at ? new Date(row.appointment_at).toISOString() : '';
      if (!key) continue;
      capacityMap.set(key, Number(row.schedule_capacity || 0));
    }

    return {
      capacityMap,
      capacitySource: 'consultant_schedule',
      activeConsultants,
      activeAvailabilityRules,
    };
  } catch (error) {
    if (isUndefinedRelationError(error)) {
      return {
        capacityMap: new Map(),
        capacitySource: 'env_fallback',
        activeConsultants: 0,
        activeAvailabilityRules: 0,
      };
    }
    throw error;
  }
}

async function readLatestCandidateBooking(candidateId) {
  const { rows } = await query(
    `
      SELECT
        event_type,
        occurred_at,
        CASE
          WHEN event_payload ? 'appointment_at'
            AND COALESCE(event_payload->>'appointment_at', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
          THEN (event_payload->>'appointment_at')::timestamptz
          ELSE NULL
        END AS appointment_at
      FROM activity_events
      WHERE candidate_id = $1
        AND event_type IN ('APPOINTMENT_BOOKED', 'APPOINTMENT_ATTENDED', 'APPOINTMENT_NO_SHOW')
      ORDER BY occurred_at DESC
      LIMIT 1
    `,
    [candidateId],
  );
  const latest = rows[0];
  if (!latest) return null;
  return {
    event_type: latest.event_type,
    occurred_at: latest.occurred_at ? new Date(latest.occurred_at).toISOString() : null,
    appointment_at: latest.appointment_at ? new Date(latest.appointment_at).toISOString() : null,
  };
}

async function readCandidateSchoolSchedule(candidateId) {
  const { rows } = await query(
    `
      SELECT
        s.name AS school_name,
        s.school_shift_type,
        s.class_start_local::text AS class_start_local,
        s.class_end_local::text AS class_end_local
      FROM candidates c
      LEFT JOIN schools s ON s.id = c.school_id
      WHERE c.id = $1
      LIMIT 1
    `,
    [candidateId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    school_name: row.school_name || null,
    school_shift_type: row.school_shift_type || null,
    class_start_local: row.class_start_local || null,
    class_end_local: row.class_end_local || null,
  };
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);

    const attemptId = readAttemptId(req);
    if (!attemptId) {
      throw new HttpError(400, 'attemptId is required.', 'missing_attempt_id');
    }

    await enforceRateLimit(req, res, {
      scope: 'appointment_slots_ip',
      identity: getRequestIp(req),
      limitEnv: 'RL_APPOINTMENT_SLOTS_IP_LIMIT',
      windowSecondsEnv: 'RL_APPOINTMENT_SLOTS_IP_WINDOW_SECONDS',
      defaultLimit: 120,
      defaultWindowSeconds: 60,
      requireRedis: true,
      errorCode: 'appointment_slots_ip_rate_limited',
      errorMessage: 'Too many slot listing requests from this IP. Please retry shortly.',
    });

    await requireExamSession(req, attemptId);

    await enforceRateLimit(req, res, {
      scope: 'appointment_slots_attempt',
      identity: attemptId,
      limitEnv: 'RL_APPOINTMENT_SLOTS_ATTEMPT_LIMIT',
      windowSecondsEnv: 'RL_APPOINTMENT_SLOTS_ATTEMPT_WINDOW_SECONDS',
      defaultLimit: 45,
      defaultWindowSeconds: 60,
      requireRedis: true,
      errorCode: 'appointment_slots_attempt_rate_limited',
      errorMessage: 'Too many slot listing requests for this candidate. Please retry shortly.',
    });

    const config = readAppointmentConfig();
    const limit = clampInt(req.query?.limit, 1, 120, 36);
    const result = await assertResultReady(attemptId);
    const slotIsoList = await readGeneratedSlots({ config, limit });
    const bookedCounts = await readBookedCounts(slotIsoList);
    const scheduleCapacity = await readScheduleCapacityMap(slotIsoList, config);
    const latestBooking = await readLatestCandidateBooking(result.candidate_id);
    const schoolSchedule = await readCandidateSchoolSchedule(result.candidate_id);

    const slots = slotIsoList.map((appointmentAt) => {
      const booked = Number(bookedCounts.get(appointmentAt) || 0);
      const scheduleBasedCapacity = Number(scheduleCapacity.capacityMap.get(appointmentAt) || 0);
      const capacity = scheduleCapacity.capacitySource === 'consultant_schedule'
        ? scheduleBasedCapacity
        : config.consultantCount;
      const available = Math.max(0, capacity - booked);
      const schoolFriendly = resolveSchoolFriendly(appointmentAt, schoolSchedule, config.timezone);
      return {
        appointment_at: appointmentAt,
        capacity,
        booked,
        available,
        is_available: available > 0,
        school_friendly: schoolFriendly,
        recommended: available > 0 && schoolFriendly === true,
        capacity_source: scheduleCapacity.capacitySource,
      };
    });

    ok(res, {
      attempt_id: attemptId,
      timezone: config.timezone,
      slot_duration_minutes: config.slotDurationMinutes,
      consultant_count: config.consultantCount,
      slot_capacity_source: scheduleCapacity.capacitySource,
      schedule_active_consultants: scheduleCapacity.activeConsultants,
      schedule_active_availability_rules: scheduleCapacity.activeAvailabilityRules,
      min_lead_minutes: config.leadMinutes,
      slots,
      candidate_school_schedule: schoolSchedule,
      candidate_latest_appointment: latestBooking,
    });
  });
}
