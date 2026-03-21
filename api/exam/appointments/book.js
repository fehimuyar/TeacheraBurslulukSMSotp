// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { clampInt, handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { enforceRateLimit, getRequestIp } from '../../_lib/redisRateLimit.js';
import { requireExamSession } from '../../_lib/sessionAuth.js';

const SLOT_BOOKING_LOCK_CLASS_ID = 20260321;

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

function readAttemptId(body) {
  return safeTrim(body?.attemptId || body?.attempt_id);
}

function readSource(body) {
  return safeTrim(body?.source).slice(0, 80) || 'candidate_result_slot_booking';
}

function readAppointmentAt(body) {
  const raw = safeTrim(body?.appointmentAt || body?.appointment_at);
  if (!raw) {
    throw new HttpError(400, 'appointmentAt is required.', 'missing_appointment_at');
  }
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) {
    throw new HttpError(400, 'appointmentAt must be a valid datetime.', 'invalid_appointment_at');
  }
  return parsed.toISOString();
}

async function assertResultReady(client, attemptId) {
  const lookup = await client.query(
    `
      SELECT id AS result_id, candidate_id, attempt_id, status
      FROM results
      WHERE attempt_id = $1
      LIMIT 1
    `,
    [attemptId],
  );
  if (lookup.rowCount === 0) {
    throw new HttpError(404, 'Result was not found.', 'result_not_found');
  }
  const result = lookup.rows[0];
  if (!['PUBLISHED', 'VIEWED'].includes(String(result.status || '').toUpperCase())) {
    throw new HttpError(409, 'Result is not published yet.', 'result_not_published');
  }
  return result;
}

async function assertSlotIsBookable(client, desiredAppointmentAt, config) {
  const { rowCount } = await client.query(
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
      SELECT 1
      FROM slot_candidates
      WHERE (local_slot AT TIME ZONE (SELECT tz_name FROM cfg)) = $7::timestamptz
        AND (local_slot AT TIME ZONE (SELECT tz_name FROM cfg))
          >= NOW() + make_interval(mins => (SELECT lead_minutes FROM cfg))
      LIMIT 1
    `,
    [
      config.slotDurationMinutes,
      config.workdayStartHour,
      config.workdayEndHour,
      config.lookaheadDays,
      config.timezone,
      config.leadMinutes,
      desiredAppointmentAt,
    ],
  );
  if (rowCount === 0) {
    throw new HttpError(409, 'Selected appointment slot is not available.', 'invalid_appointment_slot');
  }
}

async function readLatestCandidateAppointment(client, candidateId) {
  const { rows } = await client.query(
    `
      SELECT
        id,
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
  return rows[0] || null;
}

async function readSlotBookingCount(client, desiredAppointmentAt) {
  const { rows } = await client.query(
    `
      SELECT COUNT(DISTINCT candidate_id)::int AS booked_count
      FROM activity_events
      WHERE event_type = 'APPOINTMENT_BOOKED'
        AND (
          CASE
            WHEN event_payload ? 'appointment_at'
              AND COALESCE(event_payload->>'appointment_at', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
            THEN (event_payload->>'appointment_at')::timestamptz
            ELSE NULL
          END
        ) = $1::timestamptz
    `,
    [desiredAppointmentAt],
  );
  return Number(rows[0]?.booked_count || 0);
}

async function readSlotCapacity(client, desiredAppointmentAt, config) {
  try {
    const readiness = await client.query(
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
        capacity: config.consultantCount,
        capacitySource: 'env_fallback',
      };
    }

    const capacityResult = await client.query(
      `
        SELECT
          COUNT(DISTINCT c.id)::int AS schedule_capacity
        FROM appointment_consultants c
        INNER JOIN appointment_consultant_availability a
          ON a.consultant_id = c.id
         AND a.is_active = TRUE
         AND a.day_of_week = EXTRACT(DOW FROM ($1::timestamptz AT TIME ZONE $2))::int
         AND ($1::timestamptz AT TIME ZONE $2)::time >= a.start_local
         AND ($1::timestamptz AT TIME ZONE $2)::time < a.end_local
        LEFT JOIN appointment_consultant_leaves l
          ON l.consultant_id = c.id
         AND COALESCE(l.is_cancelled, FALSE) = FALSE
         AND $1::timestamptz >= l.leave_start_utc
         AND $1::timestamptz < l.leave_end_utc
        WHERE c.is_active = TRUE
          AND l.id IS NULL
      `,
      [desiredAppointmentAt, config.timezone],
    );

    return {
      capacity: Number(capacityResult.rows?.[0]?.schedule_capacity || 0),
      capacitySource: 'consultant_schedule',
    };
  } catch (error) {
    if (isUndefinedRelationError(error)) {
      return {
        capacity: config.consultantCount,
        capacitySource: 'env_fallback',
      };
    }
    throw error;
  }
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);

    await enforceRateLimit(req, res, {
      scope: 'appointment_book_ip',
      identity: getRequestIp(req),
      limitEnv: 'RL_APPOINTMENT_BOOK_IP_LIMIT',
      windowSecondsEnv: 'RL_APPOINTMENT_BOOK_IP_WINDOW_SECONDS',
      defaultLimit: 35,
      defaultWindowSeconds: 60,
      requireRedis: true,
      errorCode: 'appointment_book_ip_rate_limited',
      errorMessage: 'Too many booking attempts from this IP. Please retry shortly.',
    });

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const attemptId = readAttemptId(body);
    if (!attemptId) {
      throw new HttpError(400, 'attemptId is required.', 'missing_attempt_id');
    }
    await requireExamSession(req, attemptId);

    await enforceRateLimit(req, res, {
      scope: 'appointment_book_attempt',
      identity: attemptId,
      limitEnv: 'RL_APPOINTMENT_BOOK_ATTEMPT_LIMIT',
      windowSecondsEnv: 'RL_APPOINTMENT_BOOK_ATTEMPT_WINDOW_SECONDS',
      defaultLimit: 8,
      defaultWindowSeconds: 60,
      requireRedis: true,
      errorCode: 'appointment_book_attempt_rate_limited',
      errorMessage: 'Too many booking attempts for this candidate. Please retry shortly.',
    });

    const desiredAppointmentAt = readAppointmentAt(body);
    const source = readSource(body);
    const config = readAppointmentConfig();

    const booking = await withTransaction(async (client) => {
      const result = await assertResultReady(client, attemptId);
      await assertSlotIsBookable(client, desiredAppointmentAt, config);

      await client.query(
        'SELECT pg_advisory_xact_lock($1::int, hashtext($2))',
        [SLOT_BOOKING_LOCK_CLASS_ID, desiredAppointmentAt],
      );

      const latest = await readLatestCandidateAppointment(client, result.candidate_id);
      const slotCapacity = await readSlotCapacity(client, desiredAppointmentAt, config);
      if (latest && String(latest.event_type || '').toUpperCase() === 'APPOINTMENT_BOOKED') {
        const latestAt = latest.appointment_at ? new Date(latest.appointment_at).toISOString() : null;
        if (latestAt && latestAt === desiredAppointmentAt) {
          return {
            recorded: false,
            reason: 'already_booked_same_slot',
            event_id: latest.id,
            candidate_id: result.candidate_id,
            attempt_id: result.attempt_id,
            appointment_at: latestAt,
            consultant_slot_index: null,
            consultant_count: slotCapacity.capacity,
            consultant_capacity_source: slotCapacity.capacitySource,
          };
        }
        throw new HttpError(
          409,
          'Candidate already has an active appointment booking.',
          'candidate_already_booked',
          {
            existing_appointment_at: latestAt,
          },
        );
      }

      const bookedCount = await readSlotBookingCount(client, desiredAppointmentAt);
      if (slotCapacity.capacity <= 0 || bookedCount >= slotCapacity.capacity) {
        throw new HttpError(409, 'Selected appointment slot is full.', 'appointment_slot_full');
      }

      const consultantSlotIndex = bookedCount + 1;
      const inserted = await client.query(
        `
          INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
          VALUES ($1, $2, 'APPOINTMENT_BOOKED', $3::jsonb)
          RETURNING id, occurred_at
        `,
        [
          result.candidate_id,
          result.attempt_id,
          JSON.stringify({
            action: 'appointment_booked',
            source,
            appointment_at: desiredAppointmentAt,
            consultant_slot_index: consultantSlotIndex,
            consultant_pool_size: slotCapacity.capacity,
            consultant_capacity_source: slotCapacity.capacitySource,
            createdAt: new Date().toISOString(),
          }),
        ],
      );

      return {
        recorded: true,
        reason: 'booked',
        event_id: inserted.rows[0].id,
        occurred_at: inserted.rows[0].occurred_at
          ? new Date(inserted.rows[0].occurred_at).toISOString()
          : null,
        candidate_id: result.candidate_id,
        attempt_id: result.attempt_id,
        appointment_at: desiredAppointmentAt,
        consultant_slot_index: consultantSlotIndex,
        consultant_count: slotCapacity.capacity,
        consultant_capacity_source: slotCapacity.capacitySource,
      };
    });

    ok(res, {
      appointment_booking: booking,
    });
  });
}
