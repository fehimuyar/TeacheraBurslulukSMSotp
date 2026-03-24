import { getPool, query, withTransaction } from '../_lib/db.js';
import { HttpError } from '../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../_lib/http.js';
import {
  markNotificationDelivered,
  markNotificationFailed,
  markNotificationSent,
  updateNotificationEvent,
} from '../_lib/notifications.js';
import { reconcileWebhookInbox } from '../_lib/notificationWebhookReconciliation.js';

const NOTIFICATION_QUEUE_RUNTIME = 'DB_NOTIFICATION_JOBS';
const WORKER_OWNER_RUNTIME_DEFAULT = 'ops-api';
const WORKER_ADVISORY_LOCK_CLASS_ID = 20260314;
const WORKER_ADVISORY_LOCK_OBJECT_ID = 1001;

function resolveQueueTopology() {
  const sqsQueueUrl = safeTrim(process.env.SQS_QUEUE_URL);
  return {
    runtime: NOTIFICATION_QUEUE_RUNTIME,
    sqs_mode: sqsQueueUrl ? 'INFRA_OPTIONAL' : 'DISABLED',
    sqs_queue_declared: Boolean(sqsQueueUrl),
  };
}

function readWorkerOwnerRuntime() {
  return safeTrim(process.env.NOTIFICATION_WORKER_RUNTIME || WORKER_OWNER_RUNTIME_DEFAULT).toLowerCase();
}

function assertWorkerRuntimeOwnership() {
  const configuredRuntime = safeTrim(process.env.SERVICE_RUNTIME).toLowerCase();
  const expectedRuntime = readWorkerOwnerRuntime();
  const isProduction = safeTrim(process.env.NODE_ENV).toLowerCase() === 'production';

  if (!configuredRuntime) {
    if (isProduction) {
      throw new HttpError(503, 'SERVICE_RUNTIME is required for worker runtime ownership.', 'service_runtime_not_configured');
    }
    return expectedRuntime;
  }

  if (configuredRuntime !== expectedRuntime) {
    throw new HttpError(503, 'Worker runtime ownership mismatch.', 'worker_runtime_mismatch', {
      expected_runtime: expectedRuntime,
      actual_runtime: configuredRuntime,
    });
  }

  return expectedRuntime;
}

async function acquireWorkerRunLock() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const lockResult = await client.query(
      'SELECT pg_try_advisory_lock($1::int, $2::int) AS locked',
      [WORKER_ADVISORY_LOCK_CLASS_ID, WORKER_ADVISORY_LOCK_OBJECT_ID],
    );
    const locked = Boolean(lockResult.rows[0]?.locked);
    if (!locked) {
      client.release();
      return {
        locked: false,
        release: async () => {},
      };
    }

    return {
      locked: true,
      release: async () => {
        try {
          await client.query(
            'SELECT pg_advisory_unlock($1::int, $2::int)',
            [WORKER_ADVISORY_LOCK_CLASS_ID, WORKER_ADVISORY_LOCK_OBJECT_ID],
          );
        } finally {
          client.release();
        }
      },
    };
  } catch (error) {
    client.release();
    throw error;
  }
}

function extractBearer(req) {
  const header = safeTrim(req.headers?.authorization);
  if (!header) return '';
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

function assertWorkerSecret(req) {
  const expected = safeTrim(process.env.NOTIFICATION_WORKER_SECRET || process.env.CRON_SECRET);
  if (!expected) return;
  const provided = safeTrim(req.headers?.['x-worker-secret'] || req.query?.worker_secret || extractBearer(req));
  if (!provided || provided !== expected) {
    throw new HttpError(401, 'Worker secret is invalid.', 'invalid_worker_secret');
  }
}

function resolveProviderConfig(channel) {
  if (channel === 'SMS') {
    return {
      endpoint: safeTrim(process.env.SMS_PROVIDER_ENDPOINT),
      token: safeTrim(process.env.SMS_PROVIDER_TOKEN),
    };
  }
  return {
    endpoint: safeTrim(process.env.WHATSAPP_PROVIDER_ENDPOINT),
    token: safeTrim(process.env.WHATSAPP_PROVIDER_TOKEN),
  };
}

function resolveFaultRecipientBehavior(job) {
  const recipient = safeTrim(job?.recipient).toLowerCase();
  if (!recipient.startsWith('fault://')) {
    return null;
  }

  if (recipient.startsWith('fault://provider-outage/')) {
    throw new Error('simulated_provider_outage');
  }

  if (recipient.startsWith('fault://provider-ok/')) {
    return {
      providerMessageId: `simulated-${safeTrim(job?.id)}`,
    };
  }

  throw new Error('simulated_fault_recipient_invalid');
}

function shouldAssumeDelivered() {
  return safeTrim(process.env.NOTIFICATION_ASSUME_DELIVERED || 'false').toLowerCase() === 'true';
}

function readProviderTimeoutMs() {
  return readBoundedInt(
    process.env.NOTIFICATION_PROVIDER_TIMEOUT_MS ?? 8000,
    8000,
    1000,
    30000,
  );
}

function readBoundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function resolveWorkerLeaseSeconds(raw) {
  return readBoundedInt(
    raw ?? process.env.NOTIFICATION_WORKER_LEASE_SECONDS ?? 90,
    90,
    10,
    30 * 60,
  );
}

async function lockPendingJobs(limit, leaseSeconds, campaignCode = '') {
  // Queue-first contract: Postgres notification_jobs is the authoritative runtime queue.
  // SQS, if configured, is infra-level support and does not replace DB dequeue semantics.
  return withTransaction(async (client) => {
    const result = await client.query(
      `
        WITH pending AS (
          SELECT id
          FROM notification_jobs
          WHERE status IN ('QUEUED', 'RETRYING')
            AND (next_retry_at IS NULL OR next_retry_at <= NOW())
            AND ($3::text = '' OR campaign_code = $3)
          ORDER BY created_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE notification_jobs nj
        SET
          status = 'RETRYING',
          next_retry_at = NOW() + make_interval(secs => $2::int),
          updated_at = NOW()
        FROM pending
        WHERE nj.id = pending.id
        RETURNING nj.id, nj.channel, nj.template_code, nj.recipient, nj.payload, nj.retry_count
      `,
      [limit, leaseSeconds, campaignCode],
    );

    return result.rows;
  });
}

async function sendJobToProvider(job) {
  const faultBehavior = resolveFaultRecipientBehavior(job);
  if (faultBehavior) {
    return faultBehavior;
  }

  const config = resolveProviderConfig(job.channel);
  if (!config.endpoint) {
    throw new Error(`missing_provider_endpoint_${job.channel}`);
  }

  const providerTimeoutMs = readProviderTimeoutMs();
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, providerTimeoutMs);

  let response;
  try {
    response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      },
      signal: abortController.signal,
      body: JSON.stringify({
        channel: job.channel,
        template_code: job.template_code,
        recipient: job.recipient,
        payload: job.payload || {},
        client_reference_id: job.id,
      }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('provider_timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    throw new Error(`provider_status_${response.status}`);
  }

  const data = await response.json().catch(() => ({}));
  return {
    providerMessageId: safeTrim(data?.provider_message_id || data?.message_id || ''),
  };
}

async function moveToDlqIfNeeded(jobId, currentState = null) {
  let job = currentState;
  if (!job) {
    const state = await query(
      `
        SELECT id, channel, campaign_code, candidate_id, status, retry_count, last_error_code
        FROM notification_jobs
        WHERE id = $1
        LIMIT 1
      `,
      [jobId],
    );
    job = state.rows[0];
  }

  if (!job || job.status !== 'DLQ') return;

  await query(
    `
      INSERT INTO dlq_jobs (
        source_job_id,
        channel,
        campaign_code,
        candidate_id,
        error_code,
        retry_count,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'OPEN')
      ON CONFLICT DO NOTHING
    `,
    [job.id, job.channel, job.campaign_code, job.candidate_id, job.last_error_code || 'provider_failed', job.retry_count],
  );
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST', 'GET']);
    const ownerRuntime = assertWorkerRuntimeOwnership();
    assertWorkerSecret(req);

    const runLock = await acquireWorkerRunLock();
    if (!runLock.locked) {
      ok(res, {
        queue_topology: resolveQueueTopology(),
        owner_runtime: ownerRuntime,
        skipped: true,
        reason: 'worker_lock_held',
      });
      return;
    }

    try {
      const body = req.method === 'GET' ? null : await parseBody(req);
      const limit = readBoundedInt(body?.limit ?? req.query?.limit ?? 20, 20, 1, 200);
      const campaignCode = safeTrim(body?.campaign_code ?? body?.campaignCode ?? req.query?.campaign_code).slice(0, 120);
      const reconcileLimit = readBoundedInt(
        body?.reconcile_limit ?? body?.reconcileLimit ?? req.query?.reconcile_limit ?? process.env.NOTIFICATION_RECONCILE_LIMIT ?? 50,
        50,
        0,
        500,
      );
      const leaseSeconds = resolveWorkerLeaseSeconds(body?.lease_seconds ?? req.query?.lease_seconds);
      const assumeDelivered = shouldAssumeDelivered();
      const jobs = await lockPendingJobs(limit, leaseSeconds, campaignCode);
      const summary = {
        requested_limit: limit,
        campaign_code_filter: campaignCode || null,
        lease_seconds: leaseSeconds,
        fetched: jobs.length,
        sent: 0,
        delivered: 0,
        failed: 0,
        dlq: 0,
      };

      for (const job of jobs) {
        try {
          const sent = await sendJobToProvider(job);
          await markNotificationSent(job.id, sent.providerMessageId || null);

          await updateNotificationEvent({
            jobId: job.id,
            providerMessageId: sent.providerMessageId || null,
            eventType: 'SENT',
            eventPayload: {
              worker: 'notification_worker',
            },
          });

          summary.sent += 1;
          if (assumeDelivered) {
            await markNotificationDelivered(job.id);
            await updateNotificationEvent({
              jobId: job.id,
              providerMessageId: sent.providerMessageId || null,
              eventType: 'DELIVERED',
              eventPayload: {
                worker: 'notification_worker',
              },
            });
            summary.delivered += 1;
          }
        } catch (error) {
          const errorCode = error instanceof Error ? safeTrim(error.message).slice(0, 120) : 'provider_failed';
          const failed = await markNotificationFailed(job.id, errorCode);
          await updateNotificationEvent({
            jobId: job.id,
            eventType: 'FAILED',
            errorCode,
            eventPayload: {
              worker: 'notification_worker',
              retry_count: failed?.retry_count ?? null,
            },
          });

          if (failed?.status === 'RETRYING') {
            await updateNotificationEvent({
              jobId: job.id,
              eventType: 'RETRYING',
              eventPayload: {
                worker: 'notification_worker',
                retry_count: failed.retry_count,
                next_retry_at: failed.next_retry_at,
                effective_retry_limit: failed.effective_retry_limit,
              },
            });
            summary.failed += 1;
            continue;
          }

          if (failed?.status === 'DLQ') {
            await updateNotificationEvent({
              jobId: job.id,
              eventType: 'DLQ',
              errorCode,
              eventPayload: {
                worker: 'notification_worker',
                retry_count: failed.retry_count,
                effective_retry_limit: failed.effective_retry_limit,
              },
            });
            await moveToDlqIfNeeded(job.id);
            summary.dlq += 1;
          }
        }
      }

      const reconciliation = await reconcileWebhookInbox({ limit: reconcileLimit });
      const queueTopology = resolveQueueTopology();

      ok(res, {
        queue_topology: queueTopology,
        owner_runtime: ownerRuntime,
        lock: 'pg_advisory',
        ...summary,
        reconciliation,
      });
    } finally {
      await runLock.release();
    }
  });
}
