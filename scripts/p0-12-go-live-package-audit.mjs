import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const enableHttpChecks = args.has('--http');
const enableAwsChecks = args.has('--aws');

const STATUS = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  WARN: 'WARN',
  SKIP: 'SKIP',
};

function trim(value) {
  return String(value ?? '').trim();
}

function readEnv(...names) {
  for (const name of names) {
    const value = trim(process.env[name]);
    if (value) return value;
  }
  return '';
}

function normalizeBase(raw, fallback) {
  const value = trim(raw || fallback);
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, '');
  return `https://${value.replace(/\/$/, '')}`;
}

function pushCheck(checks, id, status, detail, evidence = {}) {
  checks.push({ id, status, detail, evidence });
}

function summarize(checks) {
  const totals = { pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const check of checks) {
    if (check.status === STATUS.PASS) totals.pass += 1;
    if (check.status === STATUS.FAIL) totals.fail += 1;
    if (check.status === STATUS.WARN) totals.warn += 1;
    if (check.status === STATUS.SKIP) totals.skip += 1;
  }
  return totals;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function runAwsJson(region, argsList) {
  const output = execFileSync('aws', [...argsList, '--region', region, '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

function discoverSnsTopicArn(region) {
  const explicit = readEnv('OBSERVABILITY_ALARM_SNS_TOPIC_ARN');
  if (explicit) {
    return { topicArn: explicit, source: 'env:OBSERVABILITY_ALARM_SNS_TOPIC_ARN' };
  }

  const topicName = readEnv('OBSERVABILITY_ALARM_TOPIC_NAME') || 'teachera-p0-10-alarms';
  let nextToken = '';

  while (true) {
    const argsList = ['sns', 'list-topics'];
    if (nextToken) {
      argsList.push('--next-token', nextToken);
    }

    const page = runAwsJson(region, argsList);
    const topics = Array.isArray(page?.Topics) ? page.Topics : [];
    const match = topics.find((item) => trim(item?.TopicArn).endsWith(`:${topicName}`));

    if (match?.TopicArn) {
      return { topicArn: trim(match.TopicArn), source: `auto-discovered:${topicName}` };
    }

    nextToken = trim(page?.NextToken);
    if (!nextToken) break;
  }

  return { topicArn: '', source: `missing:${topicName}` };
}

async function runHttpChecks(checks) {
  if (!enableHttpChecks) {
    pushCheck(checks, 'http_checks', STATUS.SKIP, 'HTTP checks disabled (use --http).');
    return;
  }

  const targets = [
    {
      id: 'www_bursluluk_route',
      url: `${normalizeBase(readEnv('WWW_BASE_URL'), 'https://teachera.com.tr')}/bursluluk-2026`,
      expected: [200],
    },
    {
      id: 'www_panel_login_route',
      url: `${normalizeBase(readEnv('WWW_BASE_URL'), 'https://teachera.com.tr')}/panel/login`,
      expected: [200],
    },
    {
      id: 'exam_health_http',
      url: `${normalizeBase(readEnv('EXAM_API_BASE_URL'), 'https://exam-api.teachera.com.tr')}/api/health`,
      expected: [200],
    },
    {
      id: 'panel_auth_http',
      url: `${normalizeBase(readEnv('PANEL_API_BASE_URL'), 'https://panel-api.teachera.com.tr')}/api/panel/auth/me`,
      expected: [200, 401, 403],
    },
    {
      id: 'ops_health_http',
      url: `${normalizeBase(readEnv('OPS_API_BASE_URL'), 'https://ops-api.teachera.com.tr')}/api/health`,
      expected: [200],
    },
  ];

  for (const target of targets) {
    try {
      const response = await fetch(target.url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      const status = target.expected.includes(response.status) ? STATUS.PASS : STATUS.FAIL;
      pushCheck(
        checks,
        target.id,
        status,
        `HTTP ${response.status}`,
        { url: target.url, status: response.status, expected: target.expected },
      );
    } catch (error) {
      pushCheck(
        checks,
        target.id,
        STATUS.FAIL,
        `HTTP request failed: ${error?.message || String(error)}`,
        { url: target.url },
      );
    }
  }
}

function runAwsChecks(checks) {
  if (!enableAwsChecks) {
    pushCheck(checks, 'aws_checks', STATUS.SKIP, 'AWS checks disabled (use --aws).');
    return;
  }

  const region = readEnv('AWS_REGION', 'AWS_DEFAULT_REGION');
  if (!region) {
    pushCheck(checks, 'aws_region', STATUS.FAIL, 'AWS region is missing (AWS_REGION).');
    return;
  }

  try {
    runAwsJson(region, ['sts', 'get-caller-identity']);
    pushCheck(checks, 'aws_identity', STATUS.PASS, 'AWS credentials are valid.');
  } catch (error) {
    pushCheck(checks, 'aws_identity', STATUS.FAIL, `AWS auth failed: ${error?.message || String(error)}`);
    return;
  }

  let topicMeta;
  try {
    topicMeta = discoverSnsTopicArn(region);
  } catch (error) {
    pushCheck(checks, 'sns_topic_discovery', STATUS.FAIL, `SNS topic discovery failed: ${error?.message || String(error)}`);
    return;
  }

  if (!topicMeta?.topicArn) {
    pushCheck(
      checks,
      'sns_topic_discovery',
      STATUS.WARN,
      'SNS topic could not be discovered from env or AWS topic name lookup.',
      { source: topicMeta?.source || 'unknown' },
    );
    return;
  }

  pushCheck(checks, 'sns_topic_discovery', STATUS.PASS, 'SNS topic ARN resolved.', {
    topic_arn: topicMeta.topicArn,
    source: topicMeta.source,
  });

  try {
    const subscriptions = runAwsJson(region, [
      'sns',
      'list-subscriptions-by-topic',
      '--topic-arn',
      topicMeta.topicArn,
    ]);

    const confirmed = (subscriptions?.Subscriptions || []).filter(
      (item) => trim(item.SubscriptionArn) && trim(item.SubscriptionArn) !== 'PendingConfirmation',
    );

    pushCheck(
      checks,
      'sns_subscription_confirmed',
      confirmed.length > 0 ? STATUS.PASS : STATUS.FAIL,
      confirmed.length > 0
        ? `Confirmed subscriptions: ${confirmed.length}`
        : 'No confirmed SNS subscription found.',
      {
        topic_arn: topicMeta.topicArn,
        discovery_source: topicMeta.source,
        confirmed_count: confirmed.length,
      },
    );
  } catch (error) {
    pushCheck(checks, 'sns_subscription_confirmed', STATUS.FAIL, `SNS check failed: ${error?.message || String(error)}`, {
      topic_arn: topicMeta.topicArn,
      discovery_source: topicMeta.source,
    });
  }
}

function runDocumentChecks(checks) {
  const packageDocPath = resolve(ROOT, 'guidelines/p0-12-final-go-live-operations-package.md');
  const checklistPath = resolve(ROOT, 'guidelines/p0-12-cutover-checklist.json');
  const approvalPath = resolve(ROOT, 'guidelines/p0-12-go-live-approval.json');
  const mandatoryGateIds = [
    'panel_step20_final_closeout_freshness_gate',
    'panel_slot_visibility_smoke_gate',
    'appointment_schedule_capacity_smoke_gate',
  ];

  if (!existsSync(packageDocPath)) {
    pushCheck(checks, 'package_doc_exists', STATUS.FAIL, 'P0-12 package document missing.', { path: packageDocPath });
    return;
  }

  pushCheck(checks, 'package_doc_exists', STATUS.PASS, 'P0-12 package document exists.', { path: packageDocPath });

  const doc = readFileSync(packageDocPath, 'utf8');
  const requiredSections = [
    'Runbook (Go-Live)',
    'War-Room Roles',
    'Escalation SLA',
    'Deploy-Freeze Window',
    'Rollback Plan',
    'Cutover Checklist',
    'Approval',
  ];

  const missingSections = requiredSections.filter((section) => !doc.includes(section));
  pushCheck(
    checks,
    'package_doc_sections',
    missingSections.length === 0 ? STATUS.PASS : STATUS.FAIL,
    missingSections.length === 0
      ? 'All required P0-12 sections present.'
      : `Missing sections: ${missingSections.join(', ')}`,
    { missing_sections: missingSections },
  );

  const requiredArtifacts = [
    'guidelines/p0-9-target-topology-10k-15k.md',
    'guidelines/p0-10-observability-slo.md',
    'guidelines/p0-11-load-resilience-certification.md',
    'guidelines/p0-11-load-resilience-report-latest.json',
    'guidelines/p0-11-load-resilience-report-latest.md',
    'guidelines/p0-5-go-live-evidence-2026-03-11.md',
    'guidelines/p0-panel-prod-slot-visibility-smoke-latest.json',
    'guidelines/p0-panel-prod-slot-visibility-smoke-latest.md',
    'guidelines/p0-appointment-schedule-capacity-smoke-latest.json',
    'guidelines/p0-appointment-schedule-capacity-smoke-latest.md',
  ];

  const missingArtifacts = requiredArtifacts.filter((item) => !existsSync(resolve(ROOT, item)));
  pushCheck(
    checks,
    'package_evidence_files',
    missingArtifacts.length === 0 ? STATUS.PASS : STATUS.FAIL,
    missingArtifacts.length === 0
      ? `All required evidence files exist (${requiredArtifacts.length}).`
      : `Missing evidence files: ${missingArtifacts.join(', ')}`,
    { missing_files: missingArtifacts },
  );

  if (!existsSync(checklistPath)) {
    pushCheck(checks, 'cutover_checklist_exists', STATUS.FAIL, 'Cutover checklist JSON missing.', { path: checklistPath });
  } else {
    const checklist = readJson(checklistPath);
    const gates = Array.isArray(checklist.gates) ? checklist.gates : [];
    const pending = gates.filter((gate) => trim(gate.status).toUpperCase() !== 'DONE').map((gate) => gate.id);
    const gateMap = new Map(gates.map((gate) => [trim(gate.id), trim(gate.status).toUpperCase()]));
    const missingMandatory = mandatoryGateIds.filter((gateId) => !gateMap.has(gateId));
    const mandatoryNotDone = mandatoryGateIds.filter((gateId) => gateMap.has(gateId) && gateMap.get(gateId) !== 'DONE');

    pushCheck(
      checks,
      'cutover_checklist_status',
      pending.length === 0 ? STATUS.PASS : STATUS.FAIL,
      pending.length === 0
        ? 'All cutover checklist gates are DONE.'
        : `Pending cutover gates: ${pending.join(', ')}`,
      { pending_gates: pending },
    );

    pushCheck(
      checks,
      'cutover_checklist_mandatory_gates',
      missingMandatory.length === 0 && mandatoryNotDone.length === 0 ? STATUS.PASS : STATUS.FAIL,
      missingMandatory.length === 0 && mandatoryNotDone.length === 0
        ? 'Mandatory cutover gates exist and are DONE.'
        : `Mandatory gate issues (missing: ${missingMandatory.join(', ') || 'none'}; not_done: ${mandatoryNotDone.join(', ') || 'none'}).`,
      {
        mandatory_gate_ids: mandatoryGateIds,
        missing_mandatory_gates: missingMandatory,
        mandatory_gates_not_done: mandatoryNotDone,
      },
    );
  }

  if (!existsSync(approvalPath)) {
    pushCheck(checks, 'go_live_approval_exists', STATUS.FAIL, 'Go-live approval file missing.', { path: approvalPath });
  } else {
    const approval = readJson(approvalPath);
    const requiredApprovers = ['incident_commander', 'ops_lead', 'backend_lead', 'qa_lead'];
    const missingApprovers = requiredApprovers.filter((role) => !trim(approval?.approvers?.[role]));
    const approved = Boolean(approval?.approved);

    pushCheck(
      checks,
      'go_live_approval_state',
      approved && missingApprovers.length === 0 ? STATUS.PASS : STATUS.FAIL,
      approved && missingApprovers.length === 0
        ? 'Go-live approval is signed.'
        : `Approval incomplete (approved=${approved}, missing approvers: ${missingApprovers.join(', ') || 'none'}).`,
      {
        approved,
        missing_approvers: missingApprovers,
        approved_at_utc: approval?.approved_at_utc || null,
      },
    );
  }
}

async function main() {
  const checks = [];

  runDocumentChecks(checks);
  await runHttpChecks(checks);
  runAwsChecks(checks);

  const totals = summarize(checks);
  const output = {
    timestamp: new Date().toISOString(),
    mode: {
      http: enableHttpChecks,
      aws: enableAwsChecks,
    },
    totals,
    overall_ready_for_p0_12: totals.fail === 0,
    checks,
  };

  const outFile = resolve(ROOT, 'guidelines/p0-12-go-live-package-audit-latest.json');
  writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error('[p0-12-go-live-package-audit] failed', error);
  process.exit(1);
});
