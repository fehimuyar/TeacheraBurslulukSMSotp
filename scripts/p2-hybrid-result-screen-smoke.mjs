import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GUIDELINES_DIR = join(ROOT, 'guidelines');
const JSON_ARTIFACT = join(GUIDELINES_DIR, 'p2-hybrid-result-screen-smoke-latest.json');
const MD_ARTIFACT = join(GUIDELINES_DIR, 'p2-hybrid-result-screen-smoke-latest.md');

function has(text, token) {
  return String(text || '').includes(token);
}

function toMarkdown(summary) {
  return [
    '# P2 Hybrid Result Screen Smoke',
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

function countProgramRows(code) {
  const matches = code.match(/id:\s*'p\d{2}'/g) || [];
  return matches.length;
}

async function main() {
  const hybridPath = join(ROOT, 'apps', 'www', 'src', 'app', 'components', 'BurslulukHybridResultOffers.tsx');
  const resultPath = join(ROOT, 'apps', 'www', 'src', 'app', 'components', 'BurslulukSonucPage.tsx');
  const hybridCode = await readFile(hybridPath, 'utf8');
  const resultCode = await readFile(resultPath, 'utf8');

  const programCount = countProgramRows(hybridCode);
  const checks = {
    component_exists: hybridCode.length > 0,
    result_page_integration_present: has(resultCode, 'BurslulukHybridResultOffers') && has(resultCode, '<BurslulukHybridResultOffers />'),
    hybrid_tabs_present: has(hybridCode, "tab === 'programs'")
      && has(hybridCode, "tab === 'prices'")
      && has(hybridCode, "tab === 'packages'")
      && has(hybridCode, "tab === 'video'"),
    high_volume_program_catalog_present: programCount >= 20,
    program_search_present: has(hybridCode, 'placeholder="Program ara'),
    program_pagination_present: has(hybridCode, 'Sayfa {safePage} / {totalPages}') && has(hybridCode, 'setPage((prev) => Math.min(totalPages, prev + 1))'),
    pricing_table_present: has(hybridCode, '<table') && has(hybridCode, 'Aylik') && has(hybridCode, 'Baslangic'),
    package_cards_present: has(hybridCode, 'BUNDLES') && has(hybridCode, 'discountRate'),
    video_panel_present: has(hybridCode, '<video') && has(hybridCode, 'homeHeroVideoWebm') && has(hybridCode, 'VIDEOS'),
    analytics_tab_tracking_present: has(hybridCode, "trackEvent('hybrid_result_tab_view'"),
  };

  const summary = {
    ok: Object.values(checks).every(Boolean),
    checks: {
      ...checks,
      high_volume_program_catalog_count_at_least_20: programCount >= 20,
    },
    stats: {
      program_catalog_count: programCount,
    },
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
    console.error('[p2-hybrid-result-screen-smoke] artifact_write_failed', artifactError?.message || String(artifactError));
  }
  console.error('[p2-hybrid-result-screen-smoke] failed', summary.error);
  process.exit(1);
});
