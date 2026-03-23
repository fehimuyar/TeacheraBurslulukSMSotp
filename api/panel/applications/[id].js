// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { query } from '../../_lib/db.js';
import { HttpError } from '../../_lib/errors.js';
import { handleRequest, methodGuard, ok, safeTrim } from '../../_lib/http.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_PATTERN.test(String(value || '').trim());
}

function readFieldEntries(row) {
  if (Array.isArray(row?.field_entries)) {
    return row.field_entries
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        label: safeTrim(item.label || item.key),
        value: safeTrim(item.value),
      }))
      .filter((item) => item.label);
  }

  const fields = row?.fields && typeof row.fields === 'object' ? row.fields : {};
  return Object.entries(fields).map(([label, value]) => ({
    label: safeTrim(label),
    value: safeTrim(value),
  }));
}

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    const identity = await requireRole(req, [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY]);

    const submissionId = Array.isArray(req.query?.id)
      ? safeTrim(req.query.id[0])
      : safeTrim(req.query?.id);
    if (!submissionId || !isUuid(submissionId)) {
      throw new HttpError(400, 'id parameter is required.', 'missing_submission_id');
    }

    const detailResult = await query(
      `
        SELECT
          s.id,
          s.form_type,
          s.form_subject,
          s.received_at,
          s.full_name,
          s.phone,
          s.email,
          s.form_source,
          s.fields,
          s.field_entries,
          CASE WHEN s.crm_transfer_status = 'TRANSFERRED' THEN 'TRANSFERRED' ELSE 'NOT_TRANSFERRED' END AS crm_status_ui,
          s.crm_transfer_status AS crm_transfer_status_internal,
          s.crm_transferred_at,
          s.crm_last_error
        FROM lead_form_submissions s
        WHERE s.id = $1::uuid
        LIMIT 1
      `,
      [submissionId],
    );

    if (detailResult.rowCount === 0) {
      throw new HttpError(404, 'Application was not found.', 'application_not_found');
    }

    const notesResult = await query(
      `
        SELECT
          id,
          note,
          created_by,
          created_at
        FROM lead_form_notes
        WHERE submission_id = $1::uuid
        ORDER BY created_at DESC
      `,
      [submissionId],
    );

    const row = detailResult.rows[0];
    ok(res, {
      item: {
        ...row,
        fields: row.fields && typeof row.fields === 'object' ? row.fields : {},
        field_entries: readFieldEntries(row),
        notes: notesResult.rows,
      },
    });

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_APPLICATION_DETAIL_READ',
      targetType: 'LEAD_FORM',
      targetId: submissionId,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        formType: row.form_type,
      },
    });
  });
}
