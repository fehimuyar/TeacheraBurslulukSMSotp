import { getPanelIdentity } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, safeTrim } from '../../_lib/http.js';
import { isAuthorizedLoadTestMode } from '../../_lib/loadTestMode.js';
import { decryptPii, isPrivilegedPiiRole, maskPiiName, maskPiiPhone } from '../../_lib/piiCrypto.js';
import { enforceRateLimit, getRequestIp } from '../../_lib/redisRateLimit.js';
import { requireExamSession } from '../../_lib/sessionAuth.js';

function shouldIncludePii(req) {
  const queryValue = Array.isArray(req.query?.include_pii) ? req.query.include_pii[0] : req.query?.include_pii;
  const headerValue = req.headers?.['x-include-pii'];
  const raw = safeTrim(queryValue || headerValue || '');
  if (!raw) return true;
  const normalized = raw.toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(normalized);
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
                r.objective_score_80,
                r.speaking_score_20,
                r.speaking_status,
                r.final_score_100,
                r.ranking_group,
                r.ranking_position,
                r.ranking_total,
                r.review_note,
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
                r.objective_score_80,
                r.speaking_score_20,
                r.speaking_status,
                r.final_score_100,
                r.ranking_group,
                r.ranking_position,
                r.ranking_total,
                r.review_note,
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
      const isPublished = ['PUBLISHED', 'VIEWED'].includes(safeTrim(row.status).toUpperCase());

      if (!loadTestMode && !isPanelRequest && isPublished && !row.viewed_at) {
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

      return row;
    });

    const isPublished = ['PUBLISHED', 'VIEWED'].includes(safeTrim(payload.status).toUpperCase());
    if (!isPanelRequest && !isPublished) {
      ok(res, {
        result: {
          attempt_id: payload.attempt_id,
          candidate_id: payload.candidate_id,
          exam_status: payload.exam_status,
          status: payload.status,
          objective_ready: payload.objective_score_80 != null,
          speaking_status: payload.speaking_status || 'PENDING',
          started_at: payload.started_at,
          submitted_at: payload.submitted_at,
          published_at: null,
          viewed_at: null,
          pii_included: false,
        },
      });
      return;
    }

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
        score: Number(payload.score ?? payload.final_score_100 ?? 0),
        percentage: Number(payload.percentage ?? payload.final_score_100 ?? 0),
        objective_score_80: payload.objective_score_80 == null ? null : Number(payload.objective_score_80),
        speaking_score_20: payload.speaking_score_20 == null ? null : Number(payload.speaking_score_20),
        speaking_status: payload.speaking_status || 'PENDING',
        final_score_100: payload.final_score_100 == null ? null : Number(payload.final_score_100),
        ranking_group: payload.ranking_group,
        ranking_position: payload.ranking_position,
        ranking_total: payload.ranking_total,
        correct_count: payload.correct_count,
        wrong_count: payload.wrong_count,
        unanswered_count: payload.unanswered_count,
        placement_label: payload.placement_label,
        cefr_band: payload.cefr_band,
        review_note: payload.review_note,
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
