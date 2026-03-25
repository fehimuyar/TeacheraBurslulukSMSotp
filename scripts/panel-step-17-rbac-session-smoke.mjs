import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function safeTrim(value) {
  return String(value ?? '').trim();
}

function normalizeBase(value, fallback) {
  const raw = safeTrim(value || fallback);
  if (!raw) throw new Error('missing_base_url');
  return raw.replace(/\/+$/, '');
}

function nowIso() {
  return new Date().toISOString();
}

function makeCheck(id, status, detail, evidence = {}) {
  return { id, status, detail, evidence };
}

async function httpRequest({ method = 'GET', url, headers = {}, timeoutMs = 20000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json, text/plain;q=0.9, text/html;q=0.8, */*;q=0.7',
        ...headers,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      status: response.status,
      text,
    };
  } finally {
    clearTimeout(timer);
  }
}

function hasAllMarkers(source, markers) {
  return markers.filter((marker) => source.includes(marker));
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Panel Step-17 RBAC + Session Smoke');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- overall_ready_for_step_17: **${report.overall_ready_for_step_17}**`);
  lines.push(`- pass: ${report.totals.pass}, fail: ${report.totals.fail}, warn: ${report.totals.warn}, skip: ${report.totals.skip}`);
  lines.push('');
  lines.push('## Checks');
  lines.push('');
  lines.push('| id | status | detail |');
  lines.push('| --- | --- | --- |');
  for (const check of report.checks) {
    lines.push(`| ${check.id} | ${check.status} | ${String(check.detail || '').replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function run() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const guidelinesDir = path.join(rootDir, 'guidelines');

  const cfg = {
    wwwBase: normalizeBase(process.env.WWW_BASE_URL, 'https://teachera.com.tr'),
    panelApiBase: normalizeBase(process.env.PANEL_API_BASE_URL, 'https://panel-api.teachera.com.tr'),
  };

  const checks = [];

  const publicRouteChecks = [
    ['/panel/login', 200],
    ['/panel/dashboard', 200],
    ['/panel/password-reset', 200],
  ];
  for (const [routePath, expected] of publicRouteChecks) {
    const response = await httpRequest({
      method: 'GET',
      url: `${cfg.wwwBase}${routePath}`,
    });
    checks.push(
      makeCheck(
        `public_route_${routePath}`,
        response.status === expected ? 'PASS' : 'FAIL',
        `HTTP ${response.status}`,
        { url: `${cfg.wwwBase}${routePath}`, status: response.status, expected: [expected] },
      ),
    );
  }

  const unauthMe = await httpRequest({
    method: 'GET',
    url: `${cfg.panelApiBase}/api/panel/auth/me`,
  });
  checks.push(
    makeCheck(
      'unauth_auth_me',
      unauthMe.status === 401 ? 'PASS' : 'FAIL',
      `HTTP ${unauthMe.status}`,
      { url: `${cfg.panelApiBase}/api/panel/auth/me`, status: unauthMe.status, expected: [401] },
    ),
  );

  const panelLoginSource = await fs.readFile(path.join(rootDir, 'apps/www/src/app/components/panel/PanelLoginPage.tsx'), 'utf8');
  const panelUseAuthSource = await fs.readFile(path.join(rootDir, 'apps/www/src/app/components/panel/usePanelAuth.ts'), 'utf8');
  const panelPreviewSource = await fs.readFile(path.join(rootDir, 'apps/www/src/app/components/panel/panelPreviewSession.ts'), 'utf8');
  const panelRoutesSource = await fs.readFile(path.join(rootDir, 'apps/www/src/app/routes.ts'), 'utf8');
  const backendAuthSource = await fs.readFile(path.join(rootDir, 'apps/panel-api/api/_lib/auth.js'), 'utf8');
  const backendLoginSource = await fs.readFile(path.join(rootDir, 'apps/panel-api/api/panel/auth/login.js'), 'utf8');

  const loginRoleMarkers = ['SUPER_ADMIN', 'ADMIN', 'EDUCATION_ADVISOR'];
  const loginFoundRoles = hasAllMarkers(panelLoginSource, loginRoleMarkers);
  checks.push(
    makeCheck(
      'login_role_based_redirect_markers',
      loginFoundRoles.length === loginRoleMarkers.length ? 'PASS' : 'FAIL',
      `Found ${loginFoundRoles.length}/${loginRoleMarkers.length} role marker(s).`,
      { expected: loginRoleMarkers, found: loginFoundRoles },
    ),
  );

  const loginFlowMarkers = ['/panel/password-reset', '/panel/dashboard', 'next_step', 'password_reset', 'otp_required'];
  const loginFlowFound = hasAllMarkers(panelLoginSource, loginFlowMarkers);
  checks.push(
    makeCheck(
      'login_password_reset_flow_markers',
      loginFlowFound.length === loginFlowMarkers.length ? 'PASS' : 'FAIL',
      `Found ${loginFlowFound.length}/${loginFlowMarkers.length} login flow marker(s).`,
      { expected: loginFlowMarkers, found: loginFlowFound },
    ),
  );

  const routeRedirectMarkers = [
    '/panel/dashboard?view=home',
    '/panel/dashboard?view=scholarship',
    '/panel/dashboard?view=operations',
    '/panel/dashboard?view=reports&focus=sales',
  ];
  const routeRedirectFound = hasAllMarkers(panelRoutesSource, routeRedirectMarkers);
  checks.push(
    makeCheck(
      'panel_route_redirect_markers',
      routeRedirectFound.length === routeRedirectMarkers.length ? 'PASS' : 'FAIL',
      `Found ${routeRedirectFound.length}/${routeRedirectMarkers.length} route redirect marker(s).`,
      { expected: routeRedirectMarkers, found: routeRedirectFound },
    ),
  );

  const dashboardGuardMarkers = ['/api/panel/auth/me', 'resolvePanelLoginHref', '/panel/password-reset'];
  const dashboardGuardFound = hasAllMarkers(panelUseAuthSource, dashboardGuardMarkers);
  checks.push(
    makeCheck(
      'dashboard_session_guard_markers',
      dashboardGuardFound.length === dashboardGuardMarkers.length ? 'PASS' : 'FAIL',
      `Found ${dashboardGuardFound.length}/${dashboardGuardMarkers.length} dashboard session guard marker(s).`,
      { expected: dashboardGuardMarkers, found: dashboardGuardFound },
    ),
  );

  const previewGuardMarkers = ['VITE_PANEL_PREVIEW_MODE', 'localhost', '127.0.0.1', '.local'];
  const previewGuardFound = hasAllMarkers(panelPreviewSource, previewGuardMarkers);
  const previewBypassBlocked = !panelPreviewSource.includes('panelPreview=1');
  checks.push(
    makeCheck(
      'preview_runtime_guard_markers',
      previewGuardFound.length === previewGuardMarkers.length && previewBypassBlocked ? 'PASS' : 'FAIL',
      previewBypassBlocked
        ? `Found ${previewGuardFound.length}/${previewGuardMarkers.length} preview guard marker(s) with no query bypass.`
        : 'Query-string preview bypass marker still present.',
      {
        expected: previewGuardMarkers,
        found: previewGuardFound,
        query_bypass_removed: previewBypassBlocked,
      },
    ),
  );

  const backendAuthMarkers = ['extractPanelSessionToken', 'readActiveSessionFromDb', 'panel_password_reset_required'];
  const backendAuthFound = hasAllMarkers(backendAuthSource, backendAuthMarkers);
  checks.push(
    makeCheck(
      'backend_auth_identity_enforced_markers',
      backendAuthFound.length === backendAuthMarkers.length ? 'PASS' : 'FAIL',
      `Found ${backendAuthFound.length}/${backendAuthMarkers.length} backend auth marker(s).`,
      { expected: backendAuthMarkers, found: backendAuthFound },
    ),
  );

  const backendLoginMarkers = [
    'LEGACY_ROLE_NORMALIZATION_MAP',
    'EDUCATION_ADVISOR',
    'ADMIN',
    'PANEL_LOGIN_SMS_OTP',
    'otp_required',
    'challenge_token',
  ];
  const backendLoginFound = hasAllMarkers(backendLoginSource, backendLoginMarkers);
  checks.push(
    makeCheck(
      'backend_login_role_and_otp_markers',
      backendLoginFound.length === backendLoginMarkers.length ? 'PASS' : 'FAIL',
      `Found ${backendLoginFound.length}/${backendLoginMarkers.length} backend login marker(s).`,
      { expected: backendLoginMarkers, found: backendLoginFound },
    ),
  );

  const totals = checks.reduce(
    (acc, item) => {
      const key = item.status.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(acc, key)) acc[key] += 1;
      return acc;
    },
    { pass: 0, fail: 0, warn: 0, skip: 0 },
  );

  const report = {
    timestamp: nowIso(),
    mode: { http: true, static: true },
    totals,
    overall_ready_for_step_17: totals.fail === 0,
    checks,
  };

  await fs.mkdir(guidelinesDir, { recursive: true });
  const outJson = path.join(guidelinesDir, 'panel-step-17-rbac-session-smoke-latest.json');
  const outMd = path.join(guidelinesDir, 'panel-step-17-rbac-session-smoke-latest.md');
  await fs.writeFile(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(outMd, renderMarkdown(report), 'utf8');

  console.log(JSON.stringify(report, null, 2));
  if (!report.overall_ready_for_step_17) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('[panel-step-17-rbac-session-smoke] failed:', error?.message || error);
  process.exitCode = 1;
});
