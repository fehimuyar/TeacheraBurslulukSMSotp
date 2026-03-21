import { query } from './db.js';
import { safeTrim } from './http.js';
import { enqueueNotification } from './notifications.js';

const ACTIVE_JOB_STATUSES = ['QUEUED', 'RETRYING', 'SENT', 'DELIVERED', 'READ'];

function resolveLoginUrl(campaignCode) {
  const campaign = safeTrim(campaignCode).toLowerCase();
  if (campaign.includes('bursluluk')) {
    return safeTrim(process.env.EXAM_LOGIN_URL) || 'https://teachera.com.tr/bursluluk/giris';
  }
  return safeTrim(process.env.EXAM_LOGIN_URL) || 'https://teachera.com.tr/seviye-tespit-sinavi';
}

function normalizeLeadMinutes(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(24 * 60, parsed));
}

async function findExistingExamReminderSms(candidateId, attemptId) {
  const { rows } = await query(
    `
      SELECT id, status
      FROM notification_jobs
      WHERE candidate_id = $1
        AND attempt_id = $2
        AND template_code = 'EXAM_REMINDER_SMS'
        AND status = ANY($3::notification_status[])
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [candidateId, attemptId, ACTIVE_JOB_STATUSES],
  );

  return rows[0] || null;
}

export async function enqueueExamReminderSmsIfNeeded({
  campaignCode,
  candidateId,
  attemptId,
  parentPhoneE164,
  applicationNo,
  candidateCode,
  examOpenAt,
  reminderLeadMinutes = 30,
  trigger = 'exam_reminder',
}) {
  const recipient = safeTrim(parentPhoneE164);
  if (!candidateId || !attemptId || !recipient) {
    return {
      enqueued: false,
      reason: 'missing_fields',
    };
  }

  const existing = await findExistingExamReminderSms(candidateId, attemptId);
  if (existing) {
    return {
      enqueued: false,
      reason: 'already_exists',
      jobId: existing.id,
      status: existing.status,
    };
  }

  const payload = {
    applicationNo: safeTrim(applicationNo) || null,
    candidateCode: safeTrim(candidateCode) || null,
    examOpenAt: safeTrim(examOpenAt) || null,
    reminderLeadMinutes: normalizeLeadMinutes(reminderLeadMinutes),
    loginUrl: resolveLoginUrl(campaignCode),
    trigger: safeTrim(trigger) || 'exam_reminder',
  };

  const enqueued = await enqueueNotification({
    campaignCode,
    candidateId,
    attemptId,
    channel: 'SMS',
    templateCode: 'EXAM_REMINDER_SMS',
    recipient,
    payload,
  });

  return {
    enqueued: true,
    jobId: enqueued.jobId,
  };
}
