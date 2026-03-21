import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GUIDELINES_DIR = join(ROOT, 'guidelines');
const JSON_ARTIFACT = join(GUIDELINES_DIR, 'p2-campaign-season-automation-smoke-latest.json');
const MD_ARTIFACT = join(GUIDELINES_DIR, 'p2-campaign-season-automation-smoke-latest.md');

function has(text, token) {
  return String(text || '').includes(token);
}

function toMarkdown(summary) {
  return [
    '# P2 Campaign Season Automation Smoke',
    '',
    `- Generated (UTC): ${summary.generated_at_utc}`,
    `- Status: ${summary.ok ? 'PASS' : 'FAIL'}`,
    '',
    '## Checks',
    '',
    ...Object.entries(summary.checks || {}).map(([key, value]) => `- ${key}: ${value ? 'PASS' : 'FAIL'}`),
    '',
    summary.error ? `## Error\n\n- ${summary.error}\n` : '',
  ].join('\n');
}

async function writeArtifacts(summary) {
  await mkdir(GUIDELINES_DIR, { recursive: true });
  await writeFile(JSON_ARTIFACT, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(MD_ARTIFACT, `${toMarkdown(summary)}\n`, 'utf8');
}

async function main() {
  const endpointPath = join(ROOT, 'apps', 'ops-api', 'api', 'ops', 'campaign-season-sync.js');
  const vercelPath = join(ROOT, 'apps', 'ops-api', 'vercel.json');
  const readmePath = join(ROOT, 'README.md');

  const [endpointCode, vercelJsonRaw, readme] = await Promise.all([
    readFile(endpointPath, 'utf8'),
    readFile(vercelPath, 'utf8'),
    readFile(readmePath, 'utf8'),
  ]);
  const vercelConfig = JSON.parse(vercelJsonRaw);
  const crons = Array.isArray(vercelConfig?.crons) ? vercelConfig.crons : [];
  const seasonCron = crons.find((item) => String(item?.path || '').startsWith('/api/ops/campaign-season-sync'));

  const checks = {
    endpoint_exists: endpointCode.length > 0,
    endpoint_auth_guard_present: has(endpointCode, 'assertOpsSecret(req)'),
    endpoint_canonical_gate_keys_present: has(endpointCode, 'bursluluk.exam_force_open') && has(endpointCode, 'bursluluk.exam_open_at'),
    endpoint_season_settings_present: has(endpointCode, 'bursluluk.season.automation.open_at')
      && has(endpointCode, 'bursluluk.season.automation.close_at')
      && has(endpointCode, 'bursluluk.season.automation.enabled'),
    endpoint_dry_run_present: has(endpointCode, 'dry_run') || has(endpointCode, 'dryRun'),
    endpoint_window_decision_present: has(endpointCode, 'within_window')
      && has(endpointCode, 'before_window')
      && has(endpointCode, 'after_window'),
    cron_registered_on_ops_api: Boolean(seasonCron),
    cron_schedule_is_5_min: String(seasonCron?.schedule || '') === '*/5 * * * *',
    readme_has_endpoint_documentation: has(readme, 'api/ops/campaign-season-sync'),
    readme_has_settings_documentation: has(readme, 'bursluluk.season.automation.enabled')
      && has(readme, 'bursluluk.season.automation.open_at')
      && has(readme, 'bursluluk.season.automation.close_at'),
  };

  const summary = {
    ok: Object.values(checks).every(Boolean),
    checks,
    generated_at_utc: new Date().toISOString(),
  };
  await writeArtifacts(summary);
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

main().catch(async (error) => {
  const summary = {
    ok: false,
    checks: {},
    error: error?.message || String(error),
    generated_at_utc: new Date().toISOString(),
  };
  try {
    await writeArtifacts(summary);
  } catch (artifactError) {
    console.error('[p2-campaign-season-automation-smoke] artifact_write_failed', artifactError?.message || String(artifactError));
  }
  console.error('[p2-campaign-season-automation-smoke] failed', summary.error);
  process.exit(1);
});
