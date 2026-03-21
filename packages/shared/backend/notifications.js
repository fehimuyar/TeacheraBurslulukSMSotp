import { randomUUID } from 'node:crypto';
import { readNotificationRetryLimit } from './env.js';
import { query, withTransaction } from './db.js';
import { HttpError } from './errors.js';
import { NOTIFICATION_CHANNELS } from './constants.js';

// Retry delays: 1m, 5m, 15m, 60m, 6h
const RETRY_BACKOFF_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60, 6 * 60 * 60];
const CREDENTIALS_SMS_TEMPLATE_CODES = new Set(['CREDENTIALS_SMS', 'LOGIN_CREDENTIALS']);
const RESULT_SMS_TEMPLATE_CODES = new Set(['RESULT', 'RESULT_SMS']);
const RESULT_WHATSAPP_TEMPLATE_CODES = new Set(['WA_RESULT', 'RESULT']);

export function assertChannel(channel) {
  const normalized = String(channel || '').toUpperCase();
  if (!NOTIFICATION_CHANNELS.includes(normalized)) {
    throw new HttpError(400, 'Notification channel is invalid.', 'invalid_notification_channel');
  }
  return normalized;
}

function isCredentialsSmsTemplate(templateCode) {
  return CREDENTIALS_SMS_TEMPLATE_CODES.has(String(templateCode || '').toUpperCase());
}

function isCredentialsSmsJob(job) {
  return String(job?.channel || '').toUpperCase() === 'SMS' && isCredentialsSmsTemplate(job?.template_code);
}

function isResultSmsTemplate(templateCode) {
  return RESULT_SMS_TEMPLATE_CODES.has(String(templateCode || '').toUpperCase());
}

function readBooleanFlag(value, fallback) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function canUseWhatsappFallback(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  if (Object.prototype.hasOwnProperty.call(source, 'enable_whatsapp_fallback')) {
    return readBooleanFlag(source.enable_whatsapp_fallback, true);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'enableWhatsappFallback')) {
    return readBooleanFlag(source.enableWhatsappFallback, true);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'enqueue_whatsapp')) {
    return readBooleanFlag(source.enqueue_whatsapp, true);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'enqueueWhatsapp')) {
    return readBooleanFlag(source.enqueueWhatsapp, true);
  }
  return true;
}

async function enqueueWhatsappFallbackForResultSms(sourceJob, reasonCode) {
  if (!sourceJob?.result_id) {
    return {
      enqueued: false,
      reason: 'missing_result_id',
      job_id: null,
    };
  }
  if (!canUseWhatsappFallback(sourceJob.payload)) {
    return {
      enqueued: false,
      reason: 'fallback_disabled',
      job_id: null,
    };
  }

  const existing = await query(
    `
      SELECT id
      FROM notification_jobs
      WHERE result_id = $1
        AND channel = 'WHATSAPP'
        AND UPPER(COALESCE(template_code, '')) = ANY($2::text[])
        AND status IN ('QUEUED', 'RETRYING', 'SENT', 'DELIVERED', 'READ')
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [sourceJob.result_id, [...RESULT_WHATSAPP_TEMPLATE_CODES]],
  );
  if (existing.rowCount > 0) {
    return {
      enqueued: false,
      reason: 'already_exists',
      job_id: existing.rows[0].id,
    };
  }

  const recipient = String(sourceJob.recipient || '').trim();
  if (!recipient) {
    return {
      enqueued: false,
      reason: 'missing_recipient',
      job_id: null,
    };
  }

  const created = await enqueueNotification({
    campaignCode: sourceJob.campaign_code,
    candidateId: sourceJob.candidate_id,
    attemptId: sourceJob.attempt_id,
    resultId: sourceJob.result_id,
    channel: 'WHATSAPP',
    templateCode: 'WA_RESULT',
    recipient,
    payload: {
      trigger: 'sms_failed_whatsapp_fallback',
      source_job_id: sourceJob.id,
      source_status: sourceJob.status,
      source_template_code: sourceJob.template_code,
      source_error_code: reasonCode || sourceJob.last_error_code || null,
    },
  });

  return {
    enqueued: Boolean(created?.jobId),
    reason: created?.jobId ? 'enqueued' : 'enqueue_failed',
    job_id: created?.jobId || null,
  };
}

async function syncApplicationCredentialsSmsStatusByCandidate(candidateId, status) {
  if (!candidateId) return null;

  const { rows } = await query(
    `
      UPDATE applications
      SET
        credentials_sms_status = $2::notification_status,
        updated_at = NOW()
      WHERE id = (
        SELECT id
        FROM applications
        WHERE candidate_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      )
      RETURNING id, candidate_id, credentials_sms_status
    `,
    [candidateId, status],
  );

  return rows[0] || null;
}

export async function syncApplicationCredentialsSmsStatus(jobId) {
  const state = await query(
    `
      SELECT id, candidate_id, channel, template_code, status
      FROM notification_jobs
      WHERE id = $1
      LIMIT 1
    `,
    [jobId],
  );

  const job = state.rows[0];
  if (!job || !isCredentialsSmsJob(job)) {
    return null;
  }

  return syncApplicationCredentialsSmsStatusByCandidate(job.candidate_id, job.status);
}

export async function enqueueNotification({
  campaignCode,
  candidateId,
  attemptId = null,
  resultId = null,
  channel,
  templateCode,
  recipient,
  payload,
}) {
  const normalizedChannel = assertChannel(channel);
  const jobId = randomUUID();

  // Queue-first runtime contract: enqueue to DB queue first (notification_jobs).
  // External queue infrastructure must not be treated as source of truth.
  await withTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO notification_jobs (
          id,
          campaign_code,
          candidate_id,
          attempt_id,
          result_id,
          channel,
          template_code,
          recipient,
          payload,
          status,
          retry_count
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'QUEUED', 0)
      `,
      [
        jobId,
        campaignCode,
        candidateId,
        attemptId,
        resultId,
        normalizedChannel,
        templateCode,
        recipient,
        JSON.stringify(payload || {}),
      ],
    );

    await client.query(
      `
        INSERT INTO notification_events (
          id,
          job_id,
          event_type,
          payload
        )
        VALUES (gen_random_uuid(), $1, 'QUEUED', $2::jsonb)
      `,
      [
        jobId,
        JSON.stringify({
          source: 'api_enqueue',
          channel: normalizedChannel,
          template_code: templateCode,
        }),
      ],
    );
  });

  if (normalizedChannel === 'SMS' && isCredentialsSmsTemplate(templateCode)) {
    await syncApplicationCredentialsSmsStatusByCandidate(candidateId, 'QUEUED');
  }

  return { jobId };
}

export async function updateNotificationEvent({
  jobId,
  providerMessageId = null,
  eventType,
  errorCode = null,
  eventPayload = {},
}) {
  const upperEventType = String(eventType || '').toUpperCase();
  const sentAt = upperEventType === 'SENT' ? new Date().toISOString() : null;
  const deliveredAt = upperEventType === 'DELIVERED' ? new Date().toISOString() : null;
  const readAt = upperEventType === 'READ' ? new Date().toISOString() : null;

  await query(
    `
      INSERT INTO notification_events (
        id,
        job_id,
        provider_message_id,
        event_type,
        sent_at,
        delivered_at,
        read_at,
        error_code,
        payload
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [jobId, providerMessageId, upperEventType, sentAt, deliveredAt, readAt, errorCode, JSON.stringify(eventPayload || {})],
  );
}

function computeNextRetryAt(retryCount) {
  const seconds = RETRY_BACKOFF_SECONDS[Math.min(retryCount, RETRY_BACKOFF_SECONDS.length - 1)];
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function resolveEffectiveRetryLimit() {
  // To guarantee the complete backoff policy is reachable:
  // 1m -> 5m -> 15m -> 60m -> 6h -> DLQ
  return Math.max(readNotificationRetryLimit(), RETRY_BACKOFF_SECONDS.length + 1);
}

export async function markNotificationSent(jobId, providerMessageId = null) {
  const { rows } = await query(
    `
      UPDATE notification_jobs
      SET
        status = 'SENT',
        provider_message_id = COALESCE($2, provider_message_id),
        next_retry_at = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, candidate_id, channel, template_code, status
    `,
    [jobId, providerMessageId],
  );

  const updated = rows[0] || null;
  if (updated && isCredentialsSmsJob(updated)) {
    await syncApplicationCredentialsSmsStatusByCandidate(updated.candidate_id, updated.status);
  }

  return updated;
}

export async function markNotificationFailed(jobId, errorCode) {
  const retryLimit = resolveEffectiveRetryLimit();
  const currentState = await query(
    `
      SELECT retry_count
      FROM notification_jobs
      WHERE id = $1
      LIMIT 1
    `,
    [jobId],
  );
  const currentRetryCount = Number(currentState.rows[0]?.retry_count || 0);
  const nextRetryAt = computeNextRetryAt(currentRetryCount);

  const { rows } = await query(
    `
      UPDATE notification_jobs
      SET
        retry_count = retry_count + 1,
        status = CASE
          WHEN retry_count + 1 >= $2 THEN 'DLQ'::notification_status
          ELSE 'RETRYING'::notification_status
        END,
        next_retry_at = CASE WHEN retry_count + 1 >= $2 THEN NULL ELSE $3::timestamptz END,
        updated_at = NOW(),
        last_error_code = $4
      WHERE id = $1
      RETURNING id, retry_count, status, next_retry_at, candidate_id, attempt_id, result_id, campaign_code, channel, template_code, recipient, payload, last_error_code
    `,
    [jobId, retryLimit, nextRetryAt, errorCode || 'provider_failed'],
  );

  const updated = rows[0] || null;
  if (updated && isCredentialsSmsJob(updated)) {
    await syncApplicationCredentialsSmsStatusByCandidate(updated.candidate_id, updated.status);
  }

  let fallback = null;
  if (
    updated
    && updated.status === 'DLQ'
    && String(updated.channel || '').toUpperCase() === 'SMS'
    && isResultSmsTemplate(updated.template_code)
  ) {
    fallback = await enqueueWhatsappFallbackForResultSms(updated, errorCode || 'provider_failed');
  }

  return updated
    ? {
        ...updated,
        effective_retry_limit: retryLimit,
        whatsapp_fallback: fallback,
      }
    : null;
}

export async function markNotificationDelivered(jobId) {
  const { rows } = await query(
    `
      UPDATE notification_jobs
      SET
        status = 'DELIVERED',
        updated_at = NOW(),
        next_retry_at = NULL
      WHERE id = $1
      RETURNING id, candidate_id, channel, template_code, status
    `,
    [jobId],
  );

  const updated = rows[0] || null;
  if (updated && isCredentialsSmsJob(updated)) {
    await syncApplicationCredentialsSmsStatusByCandidate(updated.candidate_id, updated.status);
  }

  return updated;
}

export async function markNotificationRead(jobId) {
  const { rows } = await query(
    `
      UPDATE notification_jobs
      SET
        status = 'READ',
        updated_at = NOW(),
        next_retry_at = NULL
      WHERE id = $1
      RETURNING id, candidate_id, channel, template_code, status
    `,
    [jobId],
  );

  const updated = rows[0] || null;
  if (updated && isCredentialsSmsJob(updated)) {
    await syncApplicationCredentialsSmsStatusByCandidate(updated.candidate_id, updated.status);
  }

  return updated;
}
