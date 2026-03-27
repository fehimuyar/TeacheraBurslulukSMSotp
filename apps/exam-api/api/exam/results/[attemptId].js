import { getPanelIdentity } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, safeTrim } from '../../_lib/http.js';
import { isAuthorizedLoadTestMode } from '../../_lib/loadTestMode.js';
import { decryptPii, isPrivilegedPiiRole, maskPiiName, maskPiiPhone } from '../../_lib/piiCrypto.js';
import { enforceRateLimit, getRequestIp } from '../../_lib/redisRateLimit.js';
import { requireExamSession } from '../../_lib/sessionAuth.js';

const DEFAULT_DISCOUNT_BRACKETS = [
  { min: 95, rate: 100 },
  { min: 90, rate: 75 },
  { min: 80, rate: 50 },
  { min: 70, rate: 35 },
  { min: 60, rate: 20 },
  { min: 0, rate: 10 },
];

function shouldIncludePii(req) {
  const queryValue = Array.isArray(req.query?.include_pii) ? req.query.include_pii[0] : req.query?.include_pii;
  const headerValue = req.headers?.['x-include-pii'];
  const raw = safeTrim(queryValue || headerValue || '');
  if (!raw) return true;
  const normalized = raw.toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(normalized);
}

function normalizeDiscountBrackets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      min: Number(item?.min),
      rate: Number(item?.rate),
    }))
    .filter((item) => Number.isFinite(item.min) && Number.isFinite(item.rate))
    .sort((a, b) => b.min - a.min);
}

function readDiscountBracketsFromEnv() {
  const raw = safeTrim(process.env.BURSLULUK_DISCOUNT_BRACKETS);
  if (!raw) return DEFAULT_DISCOUNT_BRACKETS;
  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeDiscountBrackets(parsed);
    if (normalized.length === 0) return DEFAULT_DISCOUNT_BRACKETS;
    return normalized;
  } catch {
    return DEFAULT_DISCOUNT_BRACKETS;
  }
}

function resolveDiscountRate(percentage) {
  const numeric = Number(percentage);
  if (!Number.isFinite(numeric)) return null;
  const brackets = readDiscountBracketsFromEnv();
  const matched = brackets.find((item) => numeric >= item.min);
  return matched ? matched.rate : null;
}

async function readClassRank(client, campaignCode, grade, attemptId) {
  if (!campaignCode || !Number.isFinite(Number(grade)) || !attemptId) return null;

  const { rows } = await client.query(
    `
      WITH ranked AS (
        SELECT
          r.attempt_id,
          RANK() OVER (
            PARTITION BY c.grade
            ORDER BY COALESCE(r.score, 0) DESC, COALESCE(r.percentage, 0) DESC, r.created_at ASC
          )::int AS class_rank
        FROM results r
        JOIN candidates c ON c.id = r.candidate_id
        WHERE r.campaign_code = $1
          AND c.grade = $2
          AND r.status IN ('PUBLISHED', 'VIEWED')
      )
      SELECT class_rank
      FROM ranked
      WHERE attempt_id = $3
      LIMIT 1
    `,
    [campaignCode, Number(grade), attemptId],
  );

  return rows[0]?.class_rank ?? null;
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    const attemptId = Array.isArray(req.query?.attemptId)
      ? safeTrim(req.query.attemptId[0])
      : safeTrim(req.query?.attemptId);
    if (!attemptId) {
      throw new HttpError(400, 'attemptId parameter is required.', 'missing_attempt_id');
    }

    const panelIdentity = await getPanelIdentity(req);
    const isPanelRequest = panelIdentity.authenticated;
    const includePii = shouldIncludePii(req);
    const loadTestMode = isAuthorizedLoadTestMode(req);
    const effectiveIncludePii = loadTestMode && !isPanelRequest ? false : includePii;

    if (isPanelRequest) {
      await enforceRateLimit(req, res, {
        scope: 'exam_result_panel',
        identity: panelIdentity.keyId || getRequestIp(req),
        limitEnv: 'RL_EXAM_RESULT_PANEL_LIMIT',
        windowSecondsEnv: 'RL_EXAM_RESULT_PANEL_WINDOW_SECONDS',
        defaultLimit: 500,
        defaultWindowSeconds: 60,
        requireRedis: true,
        errorCode: 'exam_result_panel_rate_limited',
        errorMessage: 'Panel result requests are temporarily throttled.',
      });
    } else {
      if (!loadTestMode) {
        await enforceRateLimit(req, res, {
          scope: 'exam_result_candidate_ip',
          identity: getRequestIp(req),
          limitEnv: 'RL_EXAM_RESULT_IP_LIMIT',
          windowSecondsEnv: 'RL_EXAM_RESULT_IP_WINDOW_SECONDS',
          defaultLimit: 90,
          defaultWindowSeconds: 60,
          requireRedis: true,
          errorCode: 'exam_result_rate_limited',
          errorMessage: 'Too many result requests. Please retry shortly.',
        });
      }
      await requireExamSession(req, attemptId);
      if (!loadTestMode) {
        await enforceRateLimit(req, res, {
          scope: 'exam_result_candidate_attempt',
          identity: attemptId,
          limitEnv: 'RL_EXAM_RESULT_ATTEMPT_LIMIT',
          windowSecondsEnv: 'RL_EXAM_RESULT_ATTEMPT_WINDOW_SECONDS',
          defaultLimit: 30,
          defaultWindowSeconds: 60,
          requireRedis: true,
          errorCode: 'exam_result_attempt_rate_limited',
          errorMessage: 'Result view rate exceeded for this attempt. Please retry shortly.',
        });
      }
    }

    const payload = await withTransaction(async (client) => {
      const resultLookup = await client.query(
        loadTestMode && !isPanelRequest
          ? `
              SELECT
                r.id AS result_id,
                r.status,
                r.score,
                r.percentage,
                r.campaign_code,
                r.correct_count,
                r.wrong_count,
                r.unanswered_count,
                r.placement_label,
                r.cefr_band,
                r.published_at,
                r.viewed_at,
                ea.id AS attempt_id,
                ea.status AS exam_status,
                ea.exam_language,
                ea.exam_age_range,
                ea.question_count,
                ea.started_at,
                ea.submitted_at,
                c.id AS candidate_id,
                NULL::text AS student_full_name_legacy,
                NULL::bytea AS student_full_name_enc,
                c.grade,
                NULL::text AS school_name,
                NULL::text AS parent_full_name_legacy,
                NULL::bytea AS parent_full_name_enc,
                NULL::text AS parent_phone_e164_legacy,
                NULL::bytea AS parent_phone_e164_enc
              FROM results r
              JOIN exam_attempts ea ON ea.id = r.attempt_id
              JOIN candidates c ON c.id = r.candidate_id
              WHERE r.attempt_id = $1
              LIMIT 1
            `
          : `
              SELECT
                r.id AS result_id,
                r.status,
                r.score,
                r.percentage,
                r.campaign_code,
                r.correct_count,
                r.wrong_count,
                r.unanswered_count,
                r.placement_label,
                r.cefr_band,
                r.published_at,
                r.viewed_at,
                ea.id AS attempt_id,
                ea.status AS exam_status,
                ea.exam_language,
                ea.exam_age_range,
                ea.question_count,
                ea.started_at,
                ea.submitted_at,
                c.id AS candidate_id,
                c.full_name AS student_full_name_legacy,
                c.full_name_enc AS student_full_name_enc,
                c.grade,
                s.name AS school_name,
                g.full_name AS parent_full_name_legacy,
                g.full_name_enc AS parent_full_name_enc,
                g.phone_e164 AS parent_phone_e164_legacy,
                g.phone_e164_enc AS parent_phone_e164_enc
              FROM results r
              JOIN exam_attempts ea ON ea.id = r.attempt_id
              JOIN candidates c ON c.id = r.candidate_id
              LEFT JOIN schools s ON s.id = c.school_id
              LEFT JOIN guardians g ON g.id = c.guardian_id
              WHERE r.attempt_id = $1
              LIMIT 1
            `,
        [attemptId],
      );

      if (resultLookup.rowCount === 0) {
        throw new HttpError(404, 'Result was not found.', 'result_not_found');
      }

      const row = resultLookup.rows[0];
      const normalizedResultStatus = safeTrim(row.status).toUpperCase();
      const isCandidateViewable = Boolean(row.published_at) || ['PUBLISHED', 'VIEWED'].includes(normalizedResultStatus);

      if (!loadTestMode && !isPanelRequest && !isCandidateViewable) {
        throw new HttpError(404, 'Result is not published yet.', 'result_not_published');
      }

      if (!loadTestMode && !isPanelRequest && isCandidateViewable && !row.viewed_at) {
        await client.query(
          `
            UPDATE results
            SET status = 'VIEWED', viewed_at = NOW(), updated_at = NOW()
            WHERE attempt_id = $1
          `,
          [attemptId],
        );

        await client.query(
          `
            INSERT INTO activity_events (candidate_id, attempt_id, event_type, event_payload)
            VALUES ($1, $2, 'RESULT_VIEWED', $3::jsonb)
          `,
          [
            row.candidate_id,
            row.attempt_id,
            JSON.stringify({
              viewedVia: isPanelRequest ? 'panel' : 'candidate',
            }),
          ],
        );

        row.status = 'VIEWED';
        row.viewed_at = new Date().toISOString();
      }

      row.class_rank = await readClassRank(client, row.campaign_code, row.grade, row.attempt_id);
      row.discount_rate = resolveDiscountRate(row.percentage);

      return row;
    });

    const [studentFullNameRaw, parentFullNameRaw, parentPhoneRaw] = effectiveIncludePii
      ? await Promise.all([
          decryptPii(payload.student_full_name_enc, payload.student_full_name_legacy),
          decryptPii(payload.parent_full_name_enc, payload.parent_full_name_legacy),
          decryptPii(payload.parent_phone_e164_enc, payload.parent_phone_e164_legacy),
        ])
      : [
          payload.student_full_name_legacy || null,
          payload.parent_full_name_legacy || null,
          payload.parent_phone_e164_legacy || null,
        ];

    const shouldMaskPii = isPanelRequest && !isPrivilegedPiiRole(panelIdentity.role);
    const studentFullName = shouldMaskPii ? maskPiiName(studentFullNameRaw) : studentFullNameRaw;
    const parentFullName = shouldMaskPii ? maskPiiName(parentFullNameRaw) : parentFullNameRaw;
    const parentPhoneE164 = shouldMaskPii ? maskPiiPhone(parentPhoneRaw) : parentPhoneRaw;

    if (isPanelRequest) {
      const ctx = readRequestContext(req);
      await appendAuditLog({
        ...buildPanelActor(panelIdentity),
        action: 'PANEL_RESULT_READ',
        targetType: 'RESULT',
        targetId: payload.result_id,
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
          metadata: {
            attemptId: payload.attempt_id,
            candidateId: payload.candidate_id,
            piiScope: effectiveIncludePii ? (shouldMaskPii ? 'MASKED' : 'FULL') : 'SKIPPED',
          },
        });
    }

    ok(res, {
      result: {
        result_id: payload.result_id,
        attempt_id: payload.attempt_id,
        candidate_id: payload.candidate_id,
        student_full_name: studentFullName,
        parent_full_name: parentFullName,
        parent_phone_e164: parentPhoneE164,
        school_name: payload.school_name,
        grade: payload.grade,
        exam_status: payload.exam_status,
        exam_language: payload.exam_language,
        exam_age_range: payload.exam_age_range,
        question_count: payload.question_count,
        score: Number(payload.score ?? 0),
        percentage: Number(payload.percentage ?? 0),
        discount_rate: payload.discount_rate,
        class_rank: payload.class_rank,
        correct_count: payload.correct_count,
        wrong_count: payload.wrong_count,
        unanswered_count: payload.unanswered_count,
        placement_label: payload.placement_label,
        cefr_band: payload.cefr_band,
        status: payload.status,
        started_at: payload.started_at,
        submitted_at: payload.submitted_at,
        published_at: payload.published_at,
        viewed_at: payload.viewed_at,
        pii_included: effectiveIncludePii,
      },
    });
  });
}
