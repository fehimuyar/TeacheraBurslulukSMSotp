// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';

function normalizeDlqIds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => safeTrim(item)).filter(Boolean).slice(0, 500);
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);
    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS],
      ['PANEL_DLQ_ACTION'],
    );

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const action = safeTrim(body.action).toLowerCase();
    const dlqIds = normalizeDlqIds(body.dlq_ids || body.dlqIds);
    if (dlqIds.length === 0) {
      throw new HttpError(400, 'dlqIds is required.', 'missing_dlq_ids');
    }

    if (!['retry', 'change_template', 'assign', 'close'].includes(action)) {
      throw new HttpError(400, 'Unsupported action.', 'invalid_action');
    }

    const result = await withTransaction(async (client) => {
      if (action === 'close') {
        const rootCauseNote = safeTrim(body.root_cause_note || body.rootCauseNote).slice(0, 4000);
        if (!rootCauseNote) {
          throw new HttpError(400, 'root_cause_note is required for close action.', 'missing_root_cause_note');
        }

        const { rowCount } = await client.query(
          `
            UPDATE dlq_jobs
            SET
              status = 'CLOSED',
              root_cause_note = $2,
              closed_at = NOW(),
              updated_at = NOW()
            WHERE id = ANY($1::uuid[])
          `,
          [dlqIds, rootCauseNote],
        );

        return { updated: rowCount };
      }

      if (action === 'assign') {
        const assignedTo = safeTrim(body.assigned_to || body.assignedTo).slice(0, 120);
        if (!assignedTo) {
          throw new HttpError(400, 'assigned_to is required for assign action.', 'missing_assigned_to');
        }
        const { rowCount } = await client.query(
          `
            UPDATE dlq_jobs
            SET
              assigned_to = $2,
              updated_at = NOW()
            WHERE id = ANY($1::uuid[])
          `,
          [dlqIds, assignedTo],
        );
        return { updated: rowCount };
      }

      if (action === 'retry') {
        const requeued = await client.query(
          `
            UPDATE notification_jobs nj
            SET
              status = 'QUEUED',
              next_retry_at = NOW(),
              updated_at = NOW()
            FROM dlq_jobs dj
            WHERE dj.id = ANY($1::uuid[])
              AND nj.id = dj.source_job_id
            RETURNING nj.id
          `,
          [dlqIds],
        );

        await client.query(
          `
            UPDATE dlq_jobs
            SET
              status = 'REQUEUED',
              updated_at = NOW()
            WHERE id = ANY($1::uuid[])
          `,
          [dlqIds],
        );

        return { updated: requeued.rowCount };
      }

      const templateCode = safeTrim(body.template_code || body.templateCode).slice(0, 120);
      if (!templateCode) {
        throw new HttpError(400, 'template_code is required for change_template action.', 'missing_template_code');
      }

      const changed = await client.query(
        `
          UPDATE notification_jobs nj
          SET
            template_code = $2,
            status = 'QUEUED',
            next_retry_at = NOW(),
            updated_at = NOW()
          FROM dlq_jobs dj
          WHERE dj.id = ANY($1::uuid[])
            AND nj.id = dj.source_job_id
          RETURNING nj.id
        `,
        [dlqIds, templateCode],
      );

      await client.query(
        `
          UPDATE dlq_jobs
          SET
            status = 'REQUEUED',
            updated_at = NOW()
          WHERE id = ANY($1::uuid[])
        `,
        [dlqIds],
      );

      return { updated: changed.rowCount };
    });

    ok(res, {
      action,
      requested: dlqIds.length,
      updated: result.updated,
    });

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: `PANEL_DLQ_${action.toUpperCase()}`,
      targetType: 'DLQ_BATCH',
      targetId: String(dlqIds.length),
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        dlqIds,
        updated: result.updated,
      },
    });
  });
}
