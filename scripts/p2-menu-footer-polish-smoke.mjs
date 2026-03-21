import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GUIDELINES_DIR = join(ROOT, 'guidelines');
const JSON_ARTIFACT = join(GUIDELINES_DIR, 'p2-menu-footer-polish-smoke-latest.json');
const MD_ARTIFACT = join(GUIDELINES_DIR, 'p2-menu-footer-polish-smoke-latest.md');

function has(text, token) {
  return String(text || '').includes(token);
}

function toMarkdown(summary) {
  return [
    '# P2 Menu/Footer Polish Smoke',
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
  const navPath = join(ROOT, 'apps', 'www', 'src', 'app', 'components', 'Navigation.tsx');
  const mobilePath = join(ROOT, 'apps', 'www', 'src', 'app', 'components', 'MobileMenu.tsx');
  const footerPath = join(ROOT, 'apps', 'www', 'src', 'app', 'components', 'Footer.tsx');
  const rootLayoutPath = join(ROOT, 'apps', 'www', 'src', 'app', 'components', 'RootLayout.tsx');

  const [navCode, mobileCode, footerCode, rootLayoutCode] = await Promise.all([
    readFile(navPath, 'utf8'),
    readFile(mobilePath, 'utf8'),
    readFile(footerPath, 'utf8'),
    readFile(rootLayoutPath, 'utf8'),
  ]);

  const checks = {
    desktop_navigation_no_special_bursluluk_cta: !has(navCode, 'Bursluluk 2026'),
    mobile_menu_has_bursluluk_basvuru_entry: has(mobileCode, "{ id: 'bursluluk-apply', label: 'Bursluluk Başvuru', href: '/bursluluk-2026', isRoute: true }"),
    mobile_menu_has_bursluluk_giris_entry: has(mobileCode, "{ id: 'bursluluk-login', label: 'Bursluluk Giriş', href: '/bursluluk/giris', isRoute: true }"),
    footer_site_map_has_bursluluk_basvuru_link: has(footerCode, 'Bursluluk Sınavı Başvuru') && has(footerCode, '/bursluluk-2026'),
    footer_site_map_has_bursluluk_giris_link: has(footerCode, 'Bursluluk Giriş') && has(footerCode, '/bursluluk/giris'),
    root_layout_footer_render_guard_kept: has(rootLayoutCode, '!isAuthPage && <Footer />'),
    mobile_menu_core_entries_still_present: has(mobileCode, 'Ana Sayfa') && has(mobileCode, 'İletişim'),
    footer_contact_block_still_present: has(footerCode, 'İletişim') && has(footerCode, '0332 236 80 66'),
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
    console.error('[p2-menu-footer-polish-smoke] artifact_write_failed', artifactError?.message || String(artifactError));
  }
  console.error('[p2-menu-footer-polish-smoke] failed', summary.error);
  process.exit(1);
});
