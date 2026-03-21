import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

function safeTrim(value) {
  return String(value ?? '').trim();
}

function normalizeEnvToken(value) {
  return safeTrim(value)
    .replace(/\\r/g, '')
    .replace(/\\n/g, '')
    .replace(/\r/g, '')
    .replace(/\n/g, '')
    .trim();
}

function normalizeBase(raw, fallback) {
  const value = normalizeEnvToken(raw || fallback);
  if (!value) throw new Error('missing_base_url');
  return value.replace(/\/+$/, '');
}

function nowIso() {
  return new Date().toISOString();
}

function randomDigits(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += String(Math.floor(Math.random() * 10));
  }
  return out;
}

function buildIdentityNo() {
  const base = `${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(/\D/g, '');
  return base.slice(-11).padStart(11, '9');
}

function readJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function makeCheck(id, status, detail, evidence = {}) {
  return { id, status, detail, evidence };
}

function reduceTotals(checks) {
  return checks.reduce(
    (acc, item) => {
      const key = String(item.status || '').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(acc, key)) {
        acc[key] += 1;
      }
      return acc;
    },
    { pass: 0, fail: 0, warn: 0, skip: 0 },
  );
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# P0 Attribution + Remarketing Smoke');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- overall_pass: **${report.overall_pass}**`);
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

async function httpRequest({ method = 'GET', url, headers = {}, body, timeoutMs = 20000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const payload = typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined;
    const response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        ...headers,
      },
      body: payload,
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      status: response.status,
      text,
      json: readJson(text),
    };
  } finally {
    clearTimeout(timer);
  }
}

function hasMarker(content, marker) {
  return content.includes(marker);
}

async function run() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const guidelinesDir = path.join(rootDir, 'guidelines');
  const checks = [];

  const cfg = {
    examApiBase: normalizeBase(process.env.EXAM_API_BASE_URL, 'https://exam-api.teachera.com.tr'),
    databaseUrl: normalizeEnvToken(process.env.SMOKE_DB_URL || process.env.DATABASE_URL),
    campaignCode: normalizeEnvToken(process.env.SMOKE_CAMPAIGN_CODE || '2026_BURSLULUK').slice(0, 120),
  };

  if (!cfg.databaseUrl) {
    throw new Error('DATABASE_URL or SMOKE_DB_URL is required.');
  }

  const utmCampaign = `p0_attr_${Date.now()}`.slice(0, 60);
  const attribution = {
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: utmCampaign,
    utm_term: 'bursluluk',
    utm_content: 'panel-first-p0',
    gclid: `gclid_${randomDigits(6)}`,
    fbclid: `fbclid_${randomDigits(6)}`,
    msclkid: `msclkid_${randomDigits(6)}`,
    landing_path: '/bursluluk/giris',
    landing_url: `https://teachera.com.tr/bursluluk/giris?utm_campaign=${encodeURIComponent(utmCampaign)}`,
    referrer: 'https://google.com/',
  };

  const startResp = await httpRequest({
    method: 'POST',
    url: `${cfg.examApiBase}/api/exam/session/start`,
    headers: {
      'content-type': 'application/json',
    },
    body: {
      studentFullName: `Attribution Smoke ${randomDigits(4)}`,
      parentFullName: `Parent Attribution ${randomDigits(4)}`,
      identityNo: buildIdentityNo(),
      birthYear: 2014,
      parentPhoneE164: `+90500${randomDigits(7)}`,
      schoolName: 'Smoke School Attribution',
      grade: 8,
      section: '8-A',
      selectedExamAt: '2026-03-28T10:00:00.000Z',
      ageRange: '13-17',
      language: 'en',
      source: 'p0_attribution_remarketing_smoke',
      campaignCode: cfg.campaignCode,
      questionCount: 5,
      attribution,
      consent: {
        kvkkApproved: true,
        contactConsent: true,
        consentVersion: 'KVKK_v1_2026-03-13',
        legalTextVersion: 'KVKK_v1_2026-03-13',
        source: 'p0_attribution_remarketing_smoke',
      },
    },
  });

  const candidateId = safeTrim(startResp.json?.session?.candidateId);
  checks.push(
    makeCheck(
      'start_session',
      startResp.status === 200 && Boolean(candidateId) ? 'PASS' : 'FAIL',
      `HTTP ${startResp.status}`,
      {
        status: startResp.status,
        candidate_id: candidateId || null,
        attempt_id: safeTrim(startResp.json?.session?.attemptId) || null,
        error: startResp.json?.error || null,
      },
    ),
  );

  if (candidateId) {
    const client = new Client({ connectionString: cfg.databaseUrl });
    try {
      await client.connect();
      const eventRes = await client.query(
        `
          SELECT event_payload, occurred_at
          FROM activity_events
          WHERE candidate_id = $1
            AND event_type = 'ATTRIBUTION_CAPTURED'
          ORDER BY occurred_at DESC
          LIMIT 1
        `,
        [candidateId],
      );

      const payload = eventRes.rows?.[0]?.event_payload || {};
      const campaignMatch = safeTrim(payload.utm_campaign) === attribution.utm_campaign;
      const sourceMatch = safeTrim(payload.utm_source) === attribution.utm_source;
      const mediumMatch = safeTrim(payload.utm_medium) === attribution.utm_medium;
      const clickIdsMatch =
        safeTrim(payload.gclid) === attribution.gclid
        && safeTrim(payload.fbclid) === attribution.fbclid
        && safeTrim(payload.msclkid) === attribution.msclkid;

      checks.push(
        makeCheck(
          'db_attribution_event_payload',
          campaignMatch && sourceMatch && mediumMatch ? 'PASS' : 'FAIL',
          `utm_source=${safeTrim(payload.utm_source)} utm_medium=${safeTrim(payload.utm_medium)} utm_campaign=${safeTrim(payload.utm_campaign)}`,
          {
            occurred_at: eventRes.rows?.[0]?.occurred_at || null,
            expected: {
              utm_source: attribution.utm_source,
              utm_medium: attribution.utm_medium,
              utm_campaign: attribution.utm_campaign,
            },
            actual: {
              utm_source: safeTrim(payload.utm_source),
              utm_medium: safeTrim(payload.utm_medium),
              utm_campaign: safeTrim(payload.utm_campaign),
            },
          },
        ),
      );

      checks.push(
        makeCheck(
          'db_attribution_click_ids',
          clickIdsMatch ? 'PASS' : 'FAIL',
          clickIdsMatch ? 'gclid/fbclid/msclkid persisted.' : 'click ids mismatch.',
          {
            expected: {
              gclid: attribution.gclid,
              fbclid: attribution.fbclid,
              msclkid: attribution.msclkid,
            },
            actual: {
              gclid: safeTrim(payload.gclid),
              fbclid: safeTrim(payload.fbclid),
              msclkid: safeTrim(payload.msclkid),
            },
          },
        ),
      );
    } catch (error) {
      checks.push(
        makeCheck(
          'db_attribution_event_payload',
          'FAIL',
          'Database query failed for attribution verification.',
          {
            error: safeTrim(error?.message || error),
          },
        ),
      );
    } finally {
      await client.end().catch(() => {});
    }
  }

  const tagManagerPath = path.join(rootDir, 'apps', 'www', 'src', 'app', 'lib', 'tagManager.ts');
  const analyticsPath = path.join(rootDir, 'apps', 'www', 'src', 'app', 'lib', 'analytics.ts');
  const [tagManagerContent, analyticsContent] = await Promise.all([
    fs.readFile(tagManagerPath, 'utf8'),
    fs.readFile(analyticsPath, 'utf8'),
  ]);

  const tagManagerMarkers = [
    "window.gtag('consent', 'default'",
    'ad_storage: toConsentState(false)',
    'ad_user_data: toConsentState(false)',
    'ad_personalization: toConsentState(false)',
    'analytics_storage: toConsentState(false)',
  ];
  const tagManagerMissing = tagManagerMarkers.filter((marker) => !hasMarker(tagManagerContent, marker));
  checks.push(
    makeCheck(
      'frontend_default_consent_optout',
      tagManagerMissing.length === 0 ? 'PASS' : 'FAIL',
      tagManagerMissing.length === 0
        ? 'Tag manager default consent denies ad/analytics storage.'
        : `Missing marker(s): ${tagManagerMissing.join(', ')}`,
      {
        missing_markers: tagManagerMissing,
      },
    ),
  );

  const analyticsMarkers = [
    'const fallbackPreferences: CookiePreferences = {',
    'analytics: false',
    'marketing: false',
    'personalization: false',
    'if (!hasConsent(requires)) return false;',
  ];
  const analyticsMissing = analyticsMarkers.filter((marker) => !hasMarker(analyticsContent, marker));
  checks.push(
    makeCheck(
      'frontend_tracking_respects_consent',
      analyticsMissing.length === 0 ? 'PASS' : 'FAIL',
      analyticsMissing.length === 0
        ? 'Tracking defaults to opt-out and checks consent before event emit.'
        : `Missing marker(s): ${analyticsMissing.join(', ')}`,
      {
        missing_markers: analyticsMissing,
      },
    ),
  );

  const totals = reduceTotals(checks);
  const report = {
    timestamp: nowIso(),
    exam_api_base: cfg.examApiBase,
    campaign_code: cfg.campaignCode,
    totals,
    overall_pass: totals.fail === 0,
    checks,
  };

  await fs.mkdir(guidelinesDir, { recursive: true });
  await fs.writeFile(path.join(guidelinesDir, 'p0-attribution-remarketing-smoke-latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(guidelinesDir, 'p0-attribution-remarketing-smoke-latest.md'), renderMarkdown(report), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.overall_pass ? 0 : 1;
}

run().catch((error) => {
  console.error('[p0-attribution-remarketing-smoke] failed:', error?.message || error);
  process.exit(1);
});
