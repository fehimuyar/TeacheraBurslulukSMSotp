import { withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { clampInt, handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';
import { enforceCounterThreshold } from '../../_lib/redisEphemeral.js';
import { enforceRateLimit, getRequestIp } from '../../_lib/redisRateLimit.js';
import { requireExamSession } from '../../_lib/sessionAuth.js';

const ALLOWED_RUNTIME_EVENTS = new Set([
  'NETWORK_OFFLINE',
  'NETWORK_ONLINE',
  'VISIBILITY_HIDDEN',
  'VISIBILITY_VISIBLE',
  'WINDOW_BLUR',
  'WINDOW_FOCUS',
  'RECONNECT_SYNC',
  'AUTOSAVE_FAILED',
  'AUTOSAVE_RESTORED',
  'COPY_ATTEMPT',
  'PASTE_ATTEMPT',
]);

function normalizeRuntimeEventType(raw) {
  const normalized = safeTrim(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .slice(0, 48);
  if (!normalized) {
    throw new HttpError(400, 'eventType is required.', 'missing_runtime_event_type');
  }
  if (!ALLOWED_RUNTIME_EVENTS.has(normalized)) {
    throw new HttpError(400, 'Unsupported runtime event type.', 'invalid_runtime_event_type', {
      event_type: normalized,
    });
  }
  return normalized;
}

function normalizeClientOccurredAt(raw) {
  const value = safeTrim(raw);
  if (!value) return null;
  const parsed = Number(new Date(value));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function normalizeMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const entries = Object.entries(meta)
    .filter(([key]) => safeTrim(key))
    .slice(0, 12)
    .map(([key, value]) => {
      if (value === null || value === undefined) return [key, null];
      if (typeof value === 'number' && Number.isFinite(value)) return [key, value];
      if (typeof value === 'boolean') return [key, value];
      return [key, safeTrim(String(value)).slice(0, 240)];
    });
  return Object.fromEntries(entries);
}

function readBurstLimit() {
  return clampInt(process.env.RL_EXAM_RUNTIME_EVENT_BURST_MAX, 5, 200, 24);
}

function readBurstWindowSeconds() {
  return clampInt(process.env.RL_EXAM_RUNTIME_EVENT_BURST_WINDOW_SECONDS, 1, 300, 10);
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);
    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const attemptId = safeTrim(body.attemptId);
    if (!attemptId) {
      throw new HttpError(400, 'attemptId is required.', 'missing_attempt_id');
    }

    const eventType = normalizeRuntimeEventType(body.eventType ?? body.event_type ?? body.type);
    const clientOccurredAt = normalizeClientOccurredAt(body.clientOccurredAt ?? body.client_occurred_at);
    const source = safeTrim(body.source).slice(0, 80) || 'exam_runtime_client';
    const meta = normalizeMeta(body.meta);

    await enforceRateLimit(req, res, {
      scope: 'exam_runtime_event_ip',
      identity: getRequestIp(req),
      limitEnv: 'RL_EXAM_RUNTIME_EVENT_IP_LIMIT',
      windowSecondsEnv: 'RL_EXAM_RUNTIME_EVENT_IP_WINDOW_SECONDS',
      defaultLimit: 240,
      defaultWindowSeconds: 60,
      requireRedis: true,
      errorCode: 'exam_runtime_event_ip_rate_limited',
      errorMessage: 'Runtime event rate exceeded for this IP.',
    });

    await requireExamSession(req, attemptId);

    await enforceRateLimit(req, res, {
      scope: 'exam_runtime_event_attempt',
      identity: attemptId,
      limitEnv: 'RL_EXAM_RUNTIME_EVENT_ATTEMPT_LIMIT',
      windowSecondsEnv: 'RL_EXAM_RUNTIME_EVENT_ATTEMPT_WINDOW_SECONDS',
      defaultLimit: 90,
      defaultWindowSeconds: 60,
      requireRedis: true,
      errorCode: 'exam_runtime_event_attempt_rate_limited',
      errorMessage: 'Runtime event rate exceeded for this exam attempt.',
    });

    await enforceCounterThreshold({
      scope: 'exam_runtime_event_burst',
      identity: attemptId,
      increment: 1,
      windowSeconds: readBurstWindowSeconds(),
      maxCount: readBurstLimit(),
      requireRedis: true,
      errorCode: 'exam_runtime_event_burst_limited',
      errorMessage: 'Too many runtime events in a short time window.',
    });

    const payload = await withTransaction(async (client) => {
      const lookup = await client.query(
        `
          SELECT id, candidate_id, status
          FROM exam_attempts
          WHERE id = $1
          LIMIT 1
        `,
        [attemptId],
      );
      if (lookup.rowCount === 0) {
        throw new HttpError(404, 'Exam attempt was not found.', 'attempt_not_found');
      }

      const attempt = lookup.rows[0];
      const inserted = await client.query(
        `
          INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
          VALUES ($1, $2, 'EXAM_RUNTIME_EVENT', $3::jsonb)
          RETURNING id, occurred_at
        `,
        [
          attempt.candidate_id,
          attemptId,
          JSON.stringify({
            runtime_event_type: eventType,
            attempt_status: attempt.status,
            source,
            client_occurred_at: clientOccurredAt,
            request_ip: getRequestIp(req),
            user_agent: safeTrim(req.headers?.['user-agent']).slice(0, 300) || null,
            meta,
          }),
        ],
      );

      return {
        eventId: inserted.rows[0].id,
        occurredAt: inserted.rows[0].occurred_at,
        attemptStatus: attempt.status,
      };
    });

    ok(res, {
      event: {
        recorded: true,
        event_id: payload.eventId,
        attempt_id: attemptId,
        event_type: eventType,
        occurred_at: payload.occurredAt,
        attempt_status: payload.attemptStatus,
      },
    });
  });
}
