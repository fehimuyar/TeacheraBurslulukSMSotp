// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { query, withTransaction } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, parseBody, safeTrim } from '../../_lib/http.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeSubmissionIds(raw) {
  const values = Array.isArray(raw) ? raw : Array.isArray(raw?.ids) ? raw.ids : [];
  return Array.from(
    new Set(
      values
        .map((item) => safeTrim(item))
        .filter((item) => UUID_PATTERN.test(item)),
    ),
  ).slice(0, 1000);
}

async function getExistingSubmissionIds(submissionIds) {
  const { rows } = await query(
    `
      SELECT id
      FROM lead_form_submissions
      WHERE id = ANY($1::uuid[])
    `,
    [submissionIds],
  );

  return rows.map((row) => row.id);
}

function readActorLabel(identity) {
  return safeTrim(identity?.fullName || identity?.email || identity?.userId || 'panel-user').slice(0, 200);
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['POST']);
    const identity = await requireRole(req, [ROLES.SUPER_ADMIN, ROLES.OPERATIONS]);

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
    }

    const action = safeTrim(body.action).toLowerCase();
    const submissionIds = normalizeSubmissionIds(body.ids || body.submission_ids || body.submissionIds || []);
    if (submissionIds.length === 0) {
      throw new HttpError(400, 'ids is required.', 'missing_submission_ids');
    }

    if (!['crm_transfer', 'add_note'].includes(action)) {
      throw new HttpError(400, 'Unsupported action.', 'invalid_action');
    }

    const existingSubmissionIds = await getExistingSubmissionIds(submissionIds);
    if (existingSubmissionIds.length === 0) {
      throw new HttpError(404, 'No matching applications found.', 'applications_not_found');
    }

    const actorLabel = readActorLabel(identity);

    if (action === 'add_note') {
      const note = safeTrim(body.note).slice(0, 2000);
      if (!note) {
        throw new HttpError(400, 'note is required for add_note action.', 'missing_note');
      }

      await withTransaction(async (client) => {
        for (const submissionId of existingSubmissionIds) {
          await client.query(
            `
              INSERT INTO lead_form_notes (submission_id, note, created_by)
              VALUES ($1::uuid, $2, $3)
            `,
            [submissionId, note, actorLabel],
          );

          await client.query(
            `
              UPDATE lead_form_submissions
              SET updated_at = NOW()
              WHERE id = $1::uuid
            `,
            [submissionId],
          );
        }
      });

      ok(res, {
        action,
        requested: submissionIds.length,
        processed: existingSubmissionIds.length,
        skipped: submissionIds.length - existingSubmissionIds.length,
        message: 'Not eklendi.',
      });

      const ctx = readRequestContext(req);
      await appendAuditLog({
        ...buildPanelActor(identity),
        action: 'PANEL_APPLICATION_NOTE_ADD',
        targetType: 'LEAD_FORM_BATCH',
        targetId: String(existingSubmissionIds.length),
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: {
          submissionIds: existingSubmissionIds,
          noteLength: note.length,
        },
      });
      return;
    }

    const transferResult = await withTransaction(async (client) =>
      client.query(
        `
          UPDATE lead_form_submissions
          SET
            crm_transfer_status = 'TRANSFERRED',
            crm_transferred_at = NOW(),
            crm_transferred_by = $2,
            crm_last_error = NULL,
            crm_last_attempt_at = NOW(),
            updated_at = NOW()
          WHERE id = ANY($1::uuid[])
          RETURNING id
        `,
        [existingSubmissionIds, actorLabel],
      ),
    );

    ok(res, {
      action,
      requested: submissionIds.length,
      processed: transferResult.rowCount,
      skipped: submissionIds.length - transferResult.rowCount,
      message: transferResult.rowCount === 1 ? 'Başvuru CRM’e aktarıldı.' : 'Seçilen başvurular CRM’e aktarıldı.',
    });

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_APPLICATION_CRM_TRANSFER',
      targetType: 'LEAD_FORM_BATCH',
      targetId: String(transferResult.rowCount),
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        submissionIds: transferResult.rows.map((row) => row.id),
      },
    });
  });
}
