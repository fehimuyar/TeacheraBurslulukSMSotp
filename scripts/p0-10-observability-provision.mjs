import { execFileSync } from 'node:child_process';

const SERVICE_CONFIG = {
  www: {
    endpointKeys: ['www_root'],
    includeOpsMetrics: false,
  },
  exam: {
    endpointKeys: ['exam_api'],
    includeOpsMetrics: false,
  },
  panel: {
    endpointKeys: ['panel_api'],
    includeOpsMetrics: false,
  },
  ops: {
    endpointKeys: ['ops_api'],
    includeOpsMetrics: true,
  },
};

const SERVICE_ORDER = ['www', 'exam', 'panel', 'ops'];

const MISSING_DATA_POLICY_BY_METRIC = Object.freeze({
  ApiLatencyP95Ms: 'notBreaching',
  ApiLatencyP99Ms: 'notBreaching',
  ApiErrorRatePct: 'notBreaching',
  QueueDepth: 'missing',
  QueueLagSeconds: 'missing',
  WorkerFailRatePct15m: 'missing',
  DbHealth: 'missing',
  RedisHealth: 'missing',
  NotificationSuccessRatePct60m: 'missing',
});

const CLOUDWATCH_DELETE_BATCH_SIZE = 100;

function trim(value) {
  return String(value || '').trim();
}

function readEnv(...names) {
  for (const name of names) {
    const value = trim(process.env[name]);
    if (value) return value;
  }
  return '';
}

function readIntEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(trim(process.env[name]), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function readFloatEnv(name, fallback, min, max) {
  const parsed = Number.parseFloat(trim(process.env[name]));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function readBoolEnv(name, fallback) {
  const raw = trim(process.env[name]).toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function runAws(region, args, expectJson = true) {
  const commandArgs = [...args, '--region', region];
  if (expectJson) commandArgs.push('--output', 'json');

  const output = execFileSync('aws', commandArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (!expectJson) return null;
  return output ? JSON.parse(output) : null;
}

function serviceUpper(service) {
  return service.toUpperCase();
}

function sanitizeCloudWatchToken(value, fallback = '') {
  const cleaned = trim(value)
    .replace(/\\[rn]/g, '')
    .replace(/[^A-Za-z0-9_-]/g, '');
  return cleaned || fallback;
}

function resolveDashboardName(baseName, service) {
  const raw =
    readEnv(`OBSERVABILITY_DASHBOARD_NAME_${serviceUpper(service)}`) ||
    `${baseName}-${service}`;
  return sanitizeCloudWatchToken(raw, `teachera-p0-10-observability-${service}`);
}

function resolveAlarmPrefix(basePrefix, service) {
  const raw =
    readEnv(`OBSERVABILITY_ALARM_PREFIX_${serviceUpper(service)}`) ||
    `${basePrefix}-${service}`;
  return sanitizeCloudWatchToken(raw, `teachera-p0-10-${service}`);
}

function resolveAlarmTopic(defaultTopic, service) {
  return readEnv(`OBSERVABILITY_ALARM_SNS_TOPIC_ARN_${serviceUpper(service)}`) || defaultTopic;
}

function resolveTreatMissingData(metricName) {
  return MISSING_DATA_POLICY_BY_METRIC[metricName] || 'missing';
}

function expectedAlarmNames(prefix, endpointKeys, includeOpsMetrics) {
  const names = [];

  for (const endpointKey of endpointKeys) {
    names.push(
      `${prefix}-${endpointKey}-latency-p95`,
      `${prefix}-${endpointKey}-latency-p99`,
      `${prefix}-${endpointKey}-error-rate`,
    );
  }

  if (includeOpsMetrics) {
    names.push(
      `${prefix}-queue-depth`,
      `${prefix}-queue-lag`,
      `${prefix}-worker-fail-rate`,
      `${prefix}-db-health`,
      `${prefix}-redis-health`,
      `${prefix}-sms-success-rate`,
      `${prefix}-wa-success-rate`,
    );
  }

  return names;
}

function buildDashboard({ namespace, endpointKeys, region, service, includeOpsMetrics }) {
  const widgets = [
    {
      type: 'text',
      x: 0,
      y: 0,
      width: 24,
      height: 2,
      properties: {
        markdown:
          `# Teachera P0-10 Observability (${service})\\nService-scoped latency/error metrics${includeOpsMetrics ? ' + queue/worker/db/redis/sms/wa' : ''}.`,
      },
    },
    {
      type: 'metric',
      x: 0,
      y: 2,
      width: 12,
      height: 6,
      properties: {
        view: 'timeSeries',
        stacked: false,
        title: 'API Latency p95/p99 (ms)',
        region,
        stat: 'Average',
        period: 300,
        metrics: endpointKeys.flatMap((endpointKey) => [
          [namespace, 'ApiLatencyP95Ms', 'Endpoint', endpointKey, { label: `${endpointKey} p95` }],
          [namespace, 'ApiLatencyP99Ms', 'Endpoint', endpointKey, { label: `${endpointKey} p99` }],
        ]),
      },
    },
    {
      type: 'metric',
      x: 12,
      y: 2,
      width: 12,
      height: 6,
      properties: {
        view: 'timeSeries',
        stacked: false,
        title: 'API Error Rate (%)',
        region,
        stat: 'Average',
        period: 300,
        metrics: endpointKeys.map((endpointKey) => [
          namespace,
          'ApiErrorRatePct',
          'Endpoint',
          endpointKey,
          { label: `${endpointKey} error` },
        ]),
      },
    },
  ];

  if (includeOpsMetrics) {
    widgets.push(
      {
        type: 'metric',
        x: 0,
        y: 8,
        width: 12,
        height: 6,
        properties: {
          view: 'timeSeries',
          stacked: false,
          title: 'Queue Depth / Lag',
          region,
          stat: 'Average',
          period: 300,
          metrics: [
            [namespace, 'QueueDepth', { label: 'Queue depth' }],
            [namespace, 'QueueLagSeconds', { label: 'Queue lag (sec)' }],
          ],
        },
      },
      {
        type: 'metric',
        x: 12,
        y: 8,
        width: 12,
        height: 6,
        properties: {
          view: 'timeSeries',
          stacked: false,
          title: 'Worker + Delivery Success',
          region,
          stat: 'Average',
          period: 300,
          metrics: [
            [namespace, 'WorkerFailRatePct15m', { label: 'Worker fail rate 15m (%)' }],
            [namespace, 'NotificationSuccessRatePct60m', 'Channel', 'SMS', { label: 'SMS success 60m (%)' }],
            [namespace, 'NotificationSuccessRatePct60m', 'Channel', 'WHATSAPP', { label: 'WA success 60m (%)' }],
          ],
        },
      },
      {
        type: 'metric',
        x: 0,
        y: 14,
        width: 24,
        height: 6,
        properties: {
          view: 'timeSeries',
          stacked: false,
          title: 'DB / Redis Health',
          region,
          stat: 'Average',
          period: 60,
          metrics: [
            [namespace, 'DbHealth', { label: 'DB health (1=up)' }],
            [namespace, 'RedisHealth', { label: 'Redis health (1=up)' }],
          ],
          yAxis: {
            left: {
              min: 0,
              max: 1,
            },
          },
        },
      },
    );
  }

  return { widgets };
}

function buildAlarmDefinitions({
  namespace,
  alarmPrefix,
  endpointKeys,
  thresholds,
  includeOpsMetrics,
}) {
  const alarms = [];

  for (const endpointKey of endpointKeys) {
    alarms.push(
      {
        alarmName: `${alarmPrefix}-${endpointKey}-latency-p95`,
        metricName: 'ApiLatencyP95Ms',
        threshold: thresholds.p95,
        comparisonOperator: 'GreaterThanThreshold',
        evaluationPeriods: 3,
        period: 60,
        dimensions: [{ Name: 'Endpoint', Value: endpointKey }],
      },
      {
        alarmName: `${alarmPrefix}-${endpointKey}-latency-p99`,
        metricName: 'ApiLatencyP99Ms',
        threshold: thresholds.p99,
        comparisonOperator: 'GreaterThanThreshold',
        evaluationPeriods: 3,
        period: 60,
        dimensions: [{ Name: 'Endpoint', Value: endpointKey }],
      },
      {
        alarmName: `${alarmPrefix}-${endpointKey}-error-rate`,
        metricName: 'ApiErrorRatePct',
        threshold: thresholds.errorRatePct,
        comparisonOperator: 'GreaterThanThreshold',
        evaluationPeriods: 3,
        period: 60,
        dimensions: [{ Name: 'Endpoint', Value: endpointKey }],
      },
    );
  }

  if (includeOpsMetrics) {
    alarms.push(
      {
        alarmName: `${alarmPrefix}-queue-depth`,
        metricName: 'QueueDepth',
        threshold: thresholds.queueDepth,
        comparisonOperator: 'GreaterThanThreshold',
        evaluationPeriods: 3,
        period: 60,
        dimensions: [],
      },
      {
        alarmName: `${alarmPrefix}-queue-lag`,
        metricName: 'QueueLagSeconds',
        threshold: thresholds.queueLagSeconds,
        comparisonOperator: 'GreaterThanThreshold',
        evaluationPeriods: 3,
        period: 60,
        dimensions: [],
      },
      {
        alarmName: `${alarmPrefix}-worker-fail-rate`,
        metricName: 'WorkerFailRatePct15m',
        threshold: thresholds.workerFailRatePct,
        comparisonOperator: 'GreaterThanThreshold',
        evaluationPeriods: 3,
        period: 60,
        dimensions: [],
      },
      {
        alarmName: `${alarmPrefix}-db-health`,
        metricName: 'DbHealth',
        threshold: 1,
        comparisonOperator: 'LessThanThreshold',
        evaluationPeriods: 2,
        period: 60,
        dimensions: [],
      },
      {
        alarmName: `${alarmPrefix}-redis-health`,
        metricName: 'RedisHealth',
        threshold: 1,
        comparisonOperator: 'LessThanThreshold',
        evaluationPeriods: 2,
        period: 60,
        dimensions: [],
      },
      {
        alarmName: `${alarmPrefix}-sms-success-rate`,
        metricName: 'NotificationSuccessRatePct60m',
        threshold: thresholds.smsSuccessRatePct,
        comparisonOperator: 'LessThanThreshold',
        evaluationPeriods: 3,
        period: 300,
        dimensions: [{ Name: 'Channel', Value: 'SMS' }],
      },
      {
        alarmName: `${alarmPrefix}-wa-success-rate`,
        metricName: 'NotificationSuccessRatePct60m',
        threshold: thresholds.waSuccessRatePct,
        comparisonOperator: 'LessThanThreshold',
        evaluationPeriods: 3,
        period: 300,
        dimensions: [{ Name: 'Channel', Value: 'WHATSAPP' }],
      },
    );
  }

  return alarms.map((alarm) => ({
    ...alarm,
    namespace,
    statistic: 'Average',
    treatMissingData: resolveTreatMissingData(alarm.metricName),
  }));
}

function putMetricAlarm({ region, alarm, alarmActions }) {
  const args = [
    'cloudwatch',
    'put-metric-alarm',
    '--alarm-name', alarm.alarmName,
    '--namespace', alarm.namespace,
    '--metric-name', alarm.metricName,
    '--statistic', alarm.statistic,
    '--period', String(alarm.period),
    '--evaluation-periods', String(alarm.evaluationPeriods),
    '--threshold', String(alarm.threshold),
    '--comparison-operator', alarm.comparisonOperator,
    '--treat-missing-data', alarm.treatMissingData || 'missing',
  ];

  if (alarm.dimensions.length > 0) {
    args.push(
      '--dimensions',
      ...alarm.dimensions.map((item) => `Name=${item.Name},Value=${item.Value}`),
    );
  }

  if (alarmActions.length > 0) {
    args.push('--alarm-actions', ...alarmActions, '--ok-actions', ...alarmActions);
  }

  runAws(region, args, false);
}

function listMetricAlarmsByPrefix(region, alarmNamePrefix) {
  const alarms = [];
  let nextToken = '';

  do {
    const args = [
      'cloudwatch',
      'describe-alarms',
      '--alarm-name-prefix',
      alarmNamePrefix,
      '--max-records',
      String(CLOUDWATCH_DELETE_BATCH_SIZE),
    ];

    if (nextToken) {
      args.push('--next-token', nextToken);
    }

    const response = runAws(region, args);
    alarms.push(...(Array.isArray(response?.MetricAlarms) ? response.MetricAlarms : []));
    nextToken = trim(response?.NextToken);
  } while (nextToken);

  return alarms;
}

function deleteMetricAlarms(region, alarmNames) {
  for (let index = 0; index < alarmNames.length; index += CLOUDWATCH_DELETE_BATCH_SIZE) {
    const batch = alarmNames.slice(index, index + CLOUDWATCH_DELETE_BATCH_SIZE);
    if (batch.length === 0) continue;
    runAws(region, ['cloudwatch', 'delete-alarms', '--alarm-names', ...batch], false);
  }
}

function main() {
  const region = readEnv('AWS_REGION', 'AWS_DEFAULT_REGION', 'OBSERVABILITY_AWS_REGION');
  if (!region) {
    throw new Error('Missing AWS region. Set AWS_REGION or AWS_DEFAULT_REGION.');
  }

  const namespace = readEnv('OBSERVABILITY_CLOUDWATCH_NAMESPACE') || 'Teachera/ExamPlatform';
  const dashboardBaseName = readEnv('OBSERVABILITY_DASHBOARD_NAME') || 'teachera-p0-10-observability';
  const alarmBasePrefix = readEnv('OBSERVABILITY_ALARM_PREFIX') || 'teachera-p0-10';
  const defaultAlarmTopic = readEnv('OBSERVABILITY_ALARM_SNS_TOPIC_ARN', 'OBSERVABILITY_ALARM_SNS_TOPIC_ARN_ALL');
  const requireAlarmActions = readBoolEnv('OBSERVABILITY_ALARM_ACTIONS_REQUIRED', true);
  const deleteStaleAlarms = readBoolEnv('OBSERVABILITY_DELETE_STALE_ALARMS', true);

  const thresholds = {
    p95: readFloatEnv('OBS_SLO_P95_MS', 1200, 50, 60000),
    p99: readFloatEnv('OBS_SLO_P99_MS', 2500, 50, 60000),
    errorRatePct: readFloatEnv('OBS_SLO_ERROR_RATE_PCT', 2, 0.1, 100),
    queueDepth: readFloatEnv('OBS_SLO_QUEUE_DEPTH', 200, 1, 100000),
    queueLagSeconds: readFloatEnv('OBS_SLO_QUEUE_LAG_SECONDS', 300, 1, 86400),
    workerFailRatePct: readFloatEnv('OBS_SLO_WORKER_FAIL_RATE_PCT', 5, 0.1, 100),
    smsSuccessRatePct: readFloatEnv('OBS_SLO_SMS_SUCCESS_RATE_PCT', 85, 1, 100),
    waSuccessRatePct: readFloatEnv('OBS_SLO_WA_SUCCESS_RATE_PCT', 80, 1, 100),
  };

  const serviceSummaries = [];
  const expectedAlarmNameSet = new Set();
  let totalAlarmCount = 0;

  for (const service of SERVICE_ORDER) {
    const cfg = SERVICE_CONFIG[service];
    const dashboardName = resolveDashboardName(dashboardBaseName, service);
    const alarmPrefix = resolveAlarmPrefix(alarmBasePrefix, service);
    const alarmTopic = resolveAlarmTopic(defaultAlarmTopic, service);
    const alarmActions = alarmTopic ? [alarmTopic] : [];

    if (requireAlarmActions && alarmActions.length === 0) {
      throw new Error(
        `Missing SNS alarm action topic for service=${service}. Set OBSERVABILITY_ALARM_SNS_TOPIC_ARN_${serviceUpper(service)} or OBSERVABILITY_ALARM_SNS_TOPIC_ARN.`,
      );
    }

    const dashboardBody = buildDashboard({
      namespace,
      endpointKeys: cfg.endpointKeys,
      region,
      service,
      includeOpsMetrics: cfg.includeOpsMetrics,
    });

    runAws(region, [
      'cloudwatch',
      'put-dashboard',
      '--dashboard-name',
      dashboardName,
      '--dashboard-body',
      JSON.stringify(dashboardBody),
    ]);

    const alarms = buildAlarmDefinitions({
      namespace,
      alarmPrefix,
      endpointKeys: cfg.endpointKeys,
      thresholds,
      includeOpsMetrics: cfg.includeOpsMetrics,
    });

    for (const alarm of alarms) {
      expectedAlarmNameSet.add(alarm.alarmName);
      putMetricAlarm({
        region,
        alarm,
        alarmActions,
      });
    }

    totalAlarmCount += alarms.length;
    serviceSummaries.push({
      service,
      dashboard_name: dashboardName,
      alarm_prefix: alarmPrefix,
      alarm_count: alarms.length,
      alarm_actions_attached: alarmActions.length > 0,
      alarm_topic_arn: alarmTopic || null,
    });
  }

  const staleAlarms = listMetricAlarmsByPrefix(region, alarmBasePrefix)
    .map((alarm) => trim(alarm?.AlarmName))
    .filter((alarmName) => alarmName && alarmName.startsWith(`${alarmBasePrefix}-`))
    .filter((alarmName) => !expectedAlarmNameSet.has(alarmName))
    .sort();

  if (deleteStaleAlarms && staleAlarms.length > 0) {
    deleteMetricAlarms(region, staleAlarms);
  }

  console.log(JSON.stringify({
    ok: true,
    region,
    namespace,
    require_alarm_actions: requireAlarmActions,
    dashboard_count: serviceSummaries.length,
    alarm_count: totalAlarmCount,
    stale_alarm_cleanup: {
      enabled: deleteStaleAlarms,
      stale_alarm_count: staleAlarms.length,
      deleted_alarm_count: deleteStaleAlarms ? staleAlarms.length : 0,
      stale_alarms: staleAlarms,
    },
    services: serviceSummaries,
    thresholds,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error('[p0-10-observability-provision] failed:', error?.message || error);
  process.exit(1);
}
