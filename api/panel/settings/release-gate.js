// AUTO-GENERATED FROM apps/*/api (legacy root runtime mirror). DO NOT EDIT DIRECTLY.
import { requireRole } from '../../_lib/auth.js';
import { appendAuditLog, buildPanelActor, readRequestContext } from '../../_lib/auditLog.js';
import { ROLES } from '../../_lib/constants.js';
import { evaluateCampaignReleaseGate, resolveReleaseGateCampaignCode } from '../../_lib/releaseGate.js';
import { handleRequest, methodGuard, ok, safeTrim } from '../../_lib/http.js';

export default async function handler(req, res) {
  await handleRequest(req, res, async () => {
    methodGuard(req, ['GET']);
    const identity = await requireRole(
      req,
      [ROLES.SUPER_ADMIN, ROLES.OPERATIONS, ROLES.READ_ONLY],
      ['PANEL_SETTINGS_READ'],
    );

    const requestedCampaignCode = safeTrim(req.query?.campaign_code || req.query?.campaignCode).slice(0, 120);
    const campaignCode = await resolveReleaseGateCampaignCode(requestedCampaignCode);
    const releaseGate = await evaluateCampaignReleaseGate({
      campaignCode,
    });

    ok(res, {
      campaign_code: campaignCode || null,
      release_gate: releaseGate,
    });

    const ctx = readRequestContext(req);
    await appendAuditLog({
      ...buildPanelActor(identity),
      action: 'PANEL_RELEASE_GATE_READ',
      targetType: 'RELEASE_GATE',
      targetId: campaignCode || null,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        requestedCampaignCode: requestedCampaignCode || null,
        campaignCode: campaignCode || null,
        passed: releaseGate.passed === true,
        enabled: releaseGate.enabled !== false,
        failedChecks: Array.isArray(releaseGate.failed_checks) ? releaseGate.failed_checks : [],
      },
    });
  });
}
