import { withTransaction } from '../../../_lib/db.js';
import { HttpError } from '../../../_lib/errors.js';
import { clampInt, handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../../_lib/http.js';
import { enforceRateLimit, getRequestIp } from '../../../_lib/redisRateLimit.js';
import { requireExamSession } from '../../../_lib/sessionAuth.js';

function readAttemptId(req) {
  const value = Array.isArray(req.query?.attemptId)
    ? req.query.attemptId[0]
    : req.query?.attemptId;
  return safeTrim(value);
}

function readOptionalSource(value) {
  return safeTrim(value).slice(0, 80) || 'result_page_cta';
}

function readOptionalDestination(value) {
  return safeTrim(value).slice(0, 500) || null;
}

function readDuplicateWindowMinutes(raw) {
  return clampInt(
    raw ?? process.env.RESULT_APPOINTMENT_INTENT_DEDUPE_MINUTES ?? 10,
    1,
    12 * 60,
    10,
  );
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);

    const attemptId = readAttemptId(req);
    if (!attemptId) {
      throw new HttpError(400, 'attemptId parameter is required.', 'missing_attempt_id');
    }

    await enforceRateLimit(req, res, {
      scope: 'result_appointment_intent_ip',
      identity: getRequestIp(req),
      limitEnv: 'RL_RESULT_APPOINTMENT_INTENT_IP_LIMIT',
      windowSecondsEnv: 'RL_RESULT_APPOINTMENT_INTENT_IP_WINDOW_SECONDS',
      defaultLimit: 45,
      defaultWindowSeconds: 60,
      requireRedis: true,
      errorCode: 'result_appointment_intent_ip_rate_limited',
      errorMessage: 'Too many appointment requests from this IP. Please retry shortly.',
    });

    await requireExamSession(req, attemptId);

    await enforceRateLimit(req, res, {
      scope: 'result_appointment_intent_attempt',
      identity: attemptId,
      limitEnv: 'RL_RESULT_APPOINTMENT_INTENT_ATTEMPT_LIMIT',
      windowSecondsEnv: 'RL_RESULT_APPOINTMENT_INTENT_ATTEMPT_WINDOW_SECONDS',
      defaultLimit: 6,
      defaultWindowSeconds: 60,
      requireRedis: true,
      errorCode: 'result_appointment_intent_attempt_rate_limited',
      errorMessage: 'Too many appointment requests for this candidate. Please retry shortly.',
    });

    const body = await parseBody(req);
    const source = readOptionalSource(body?.source);
    const destinationUrl = readOptionalDestination(body?.destination_url ?? body?.destinationUrl);
    const duplicateWindowMinutes = readDuplicateWindowMinutes(
      body?.dedupe_window_minutes ?? body?.dedupeWindowMinutes,
    );

    const payload = await withTransaction(async (client) => {
      const resultLookup = await client.query(
        `
          SELECT id AS result_id, candidate_id, attempt_id
          FROM results
          WHERE attempt_id = $1
          LIMIT 1
        `,
        [attemptId],
      );

      if (resultLookup.rowCount === 0) {
        throw new HttpError(404, 'Result was not found.', 'result_not_found');
      }

      const resultRow = resultLookup.rows[0];
      const duplicateLookup = await client.query(
        `
          SELECT id, occurred_at
          FROM activity_events
          WHERE candidate_id = $1
            AND attempt_id = $2
            AND event_type = 'APPOINTMENT_INTENT'
            AND occurred_at >= NOW() - make_interval(mins => $3::int)
          ORDER BY occurred_at DESC
          LIMIT 1
        `,
        [resultRow.candidate_id, resultRow.attempt_id, duplicateWindowMinutes],
      );

      if (duplicateLookup.rowCount > 0) {
        return {
          recorded: false,
          event_id: duplicateLookup.rows[0].id,
          occurred_at: duplicateLookup.rows[0].occurred_at,
          result_id: resultRow.result_id,
          candidate_id: resultRow.candidate_id,
          attempt_id: resultRow.attempt_id,
        };
      }

      const inserted = await client.query(
        `
          INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
          VALUES ($1, $2, 'APPOINTMENT_INTENT', $3::jsonb)
          RETURNING id, occurred_at
        `,
        [
          resultRow.candidate_id,
          resultRow.attempt_id,
          JSON.stringify({
            source,
            destination_url: destinationUrl,
            request_ip: getRequestIp(req),
            user_agent: safeTrim(req.headers?.['user-agent']).slice(0, 300) || null,
          }),
        ],
      );

      return {
        recorded: true,
        event_id: inserted.rows[0].id,
        occurred_at: inserted.rows[0].occurred_at,
        result_id: resultRow.result_id,
        candidate_id: resultRow.candidate_id,
        attempt_id: resultRow.attempt_id,
      };
    });

    ok(res, {
      appointment_intent: payload,
      dedupe_window_minutes: duplicateWindowMinutes,
    });
  });
}
