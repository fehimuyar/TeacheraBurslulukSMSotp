import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GUIDELINES_DIR = join(ROOT, 'guidelines');
const JSON_ARTIFACT = join(GUIDELINES_DIR, 'p1-landing-apply-confirm-login-smoke-latest.json');
const MD_ARTIFACT = join(GUIDELINES_DIR, 'p1-landing-apply-confirm-login-smoke-latest.md');

async function readUtf8(path) {
  return readFile(path, 'utf8');
}

function has(text, token) {
  return text.includes(token);
}

function hasAny(text, tokens) {
  return tokens.some((token) => has(text, token));
}

function toMarkdown(summary) {
  return [
    '# P1 Landing/Apply/Confirm/Login Smoke',
    '',
    `- Generated (UTC): ${summary.generated_at_utc}`,
    `- Status: ${summary.ok ? 'PASS' : 'FAIL'}`,
    '',
    '## Checks',
    '',
    ...Object.entries(summary.checks).map(([key, value]) => `- ${key}: ${value ? 'PASS' : 'FAIL'}`),
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
  const routesPath = join(ROOT, 'apps', 'www', 'src', 'app', 'routes.ts');
  const legacyRoutesPath = join(ROOT, 'src', 'app', 'routes.ts');
  const landingPath = join(ROOT, 'apps', 'www', 'src', 'app', 'components', 'Bursluluk2026Page.tsx');
  const girisPath = join(ROOT, 'apps', 'www', 'src', 'app', 'components', 'BurslulukGirisPage.tsx');
  const onayPath = join(ROOT, 'apps', 'www', 'src', 'app', 'components', 'BurslulukOnayPage.tsx');
  const beklemePath = join(ROOT, 'apps', 'www', 'src', 'app', 'components', 'BurslulukBeklemePage.tsx');
  const sessionPath = join(ROOT, 'apps', 'www', 'src', 'app', 'components', 'bursluluk', 'burslulukFlowSession.ts');

  const [
    routes,
    legacyRoutes,
    landing,
    giris,
    onay,
    bekleme,
    flowSession,
  ] = await Promise.all([
    readUtf8(routesPath),
    readUtf8(legacyRoutesPath),
    readUtf8(landingPath),
    readUtf8(girisPath),
    readUtf8(onayPath),
    readUtf8(beklemePath),
    readUtf8(sessionPath),
  ]);

  const loginHasResumeButton = has(giris, 'handleResumeSession') && has(giris, 'Mevcut Oturuma Devam Et');
  const loginHasSessionPrefill = has(giris, 'const [sessionContext, setSessionContext] = useState<BurslulukCandidateSession | null>(() => readCandidateSession())')
    && has(giris, "sessionContext?.applicationNo || ''")
    && has(giris, "sessionContext?.parentPhoneE164 || ''");

  const checks = {
    routes_bursluluk_redirects_to_landing: has(routes, "path: 'bursluluk', loader: () => redirect('/bursluluk-2026')"),
    routes_exam_result_ascii_canonical: has(routes, "path: 'bursluluk/sinav'") && has(routes, "path: 'bursluluk/sonuc'"),
    routes_exam_result_accent_redirects: has(routes, "path: 'bursluluk/sınav', loader: () => redirect('/bursluluk/sinav')")
      && has(routes, "path: 'bursluluk/sonuç', loader: () => redirect('/bursluluk/sonuc')"),
    legacy_routes_kept_in_sync: has(legacyRoutes, "path: 'bursluluk', loader: () => redirect('/bursluluk-2026')")
      && has(legacyRoutes, "path: 'bursluluk/sınav', loader: () => redirect('/bursluluk/sinav')")
      && has(legacyRoutes, "path: 'bursluluk/sonuç', loader: () => redirect('/bursluluk/sonuc')"),
    landing_cta_to_giris: has(landing, 'to="/bursluluk/giris"'),
    apply_submit_starts_session_and_navigates_confirm: has(landing, 'startExamSession({') && has(landing, "navigate('/bursluluk/onay')"),
    login_submit_calls_candidate_login_and_navigates_waiting: has(giris, 'candidateLogin({') && has(giris, "navigate('/bursluluk/bekleme')"),
    login_reset_flow_present: hasAny(giris, ['candidatePasswordReset({', 'renewCandidateCredentials(']) && hasAny(giris, ['Sifremi Yenile', 'Şifremi Yenile']),
    login_resume_existing_session_present: has(giris, 'readCandidateSession') && (loginHasResumeButton || loginHasSessionPrefill),
    confirm_to_waiting_navigation_present: has(onay, 'to="/bursluluk/giris"') && has(onay, 'Şifreyi Tekrar Gönder'),
    waiting_to_exam_navigation_ascii_canonical: has(bekleme, "navigate('/bursluluk/sinav')"),
    flow_session_expires_at_guard_present: has(flowSession, 'const expiresAtMs = Number(new Date(parsed.expiresAt || \'\'))')
      && has(flowSession, 'expiresAtMs <= Date.now()'),
  };

  const ok = Object.values(checks).every(Boolean);
  const summary = {
    ok,
    checks,
    generated_at_utc: new Date().toISOString(),
  };

  await writeArtifacts(summary);
  console.log(JSON.stringify(summary, null, 2));
  if (!ok) process.exitCode = 1;
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
    console.error('[p1-landing-apply-confirm-login-smoke] artifact_write_failed', artifactError?.message || String(artifactError));
  }
  console.error('[p1-landing-apply-confirm-login-smoke] failed', summary.error);
  process.exit(1);
});
