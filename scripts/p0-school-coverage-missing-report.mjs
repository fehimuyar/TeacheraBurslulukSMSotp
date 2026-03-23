import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUIDELINES_DIR = path.join(ROOT, 'guidelines');
const DEFAULT_CSV_PATH = path.join(GUIDELINES_DIR, 'p0-school-target-130.csv');
const OUT_JSON = path.join(GUIDELINES_DIR, 'p0-school-coverage-missing-latest.json');
const OUT_MD = path.join(GUIDELINES_DIR, 'p0-school-coverage-missing-latest.md');
const OUT_CSV = path.join(GUIDELINES_DIR, 'p0-school-coverage-missing-schools-latest.csv');

function safeTrim(value) {
  return String(value ?? '').trim();
}

function toTurkeyDate(value = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(value);
}

function normalizeSchoolKey(value) {
  return safeTrim(value)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCsvText(text) {
  const normalized = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split(',').map((token) => safeTrim(token));
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(',').map((token) => safeTrim(token));
    if (parts.length !== headers.length) continue;
    const row = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = parts[j];
    }
    rows.push(row);
  }

  return { headers, rows };
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows, headers) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((key) => csvEscape(row[key])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# P0 School Coverage Missing Report');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- campaign_code: ${report.config.campaign_code}`);
  lines.push(`- date_tr: ${report.config.date_tr}`);
  lines.push(`- expected_schools: ${report.summary.expected_schools}`);
  lines.push(`- campaign_seen_schools: ${report.summary.campaign_seen_schools}`);
  lines.push(`- same_day_attr_seen_schools: ${report.summary.same_day_attr_seen_schools}`);
  lines.push(`- missing_in_campaign: ${report.summary.missing_in_campaign}`);
  lines.push(`- missing_in_same_day_attr: ${report.summary.missing_in_same_day_attr}`);
  lines.push(`- missing_channels: ${report.summary.missing_channels.join(', ') || '-'}`);
  lines.push('');
  lines.push('## Top Missing Schools (First 20)');
  lines.push('');
  lines.push('| school_name | district | utm_source | missing_in_campaign | missing_in_same_day_attr |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of report.missing_school_rows.slice(0, 20)) {
    lines.push(`| ${row.school_name} | ${row.district} | ${row.utm_source} | ${row.missing_in_campaign} | ${row.missing_in_same_day_attr} |`);
  }
  lines.push('');
  lines.push('## Output');
  lines.push('');
  lines.push(`- CSV: \`${OUT_CSV}\``);
  lines.push(`- JSON: \`${OUT_JSON}\``);
  lines.push(`- MD: \`${OUT_MD}\``);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function run() {
  const csvPath = path.resolve(safeTrim(process.env.SCHOOL_COVERAGE_CSV) || DEFAULT_CSV_PATH);
  const campaignCode = safeTrim(process.env.SCHOOL_COVERAGE_CAMPAIGN_CODE || '2026_BURSLULUK').slice(0, 160);
  const dateTr = safeTrim(process.env.SCHOOL_COVERAGE_DATE || toTurkeyDate());
  const dbUrl = safeTrim(process.env.SMOKE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL);

  if (!dbUrl) {
    throw new Error('DATABASE_URL/SMOKE_DB_URL is required.');
  }

  const rawCsv = await fs.readFile(csvPath, 'utf8');
  const parsed = parseCsvText(rawCsv);

  const expectedRows = parsed.rows
    .map((row) => ({
      school_name: safeTrim(row.school_name),
      district: safeTrim(row.district),
      city: safeTrim(row.city),
      channel_group: safeTrim(row.channel_group),
      utm_source: safeTrim(row.utm_source).toLowerCase(),
      apply_url: '',
    }))
    .filter((row) => row.school_name);

  const expectedByKey = new Map();
  for (const row of expectedRows) {
    const key = normalizeSchoolKey(row.school_name);
    if (!expectedByKey.has(key)) {
      expectedByKey.set(key, row);
    }
  }

  const expectedKeys = Array.from(expectedByKey.keys());
  const expectedChannels = Array.from(new Set(expectedRows.map((row) => row.utm_source).filter(Boolean))).sort();

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const campaignSchoolsRes = await client.query(
      `
        SELECT DISTINCT s.name AS school_name
        FROM applications a
        JOIN candidates c ON c.id = a.candidate_id
        JOIN schools s ON s.id = c.school_id
        WHERE c.campaign_code = $1
          AND c.school_id IS NOT NULL
      `,
      [campaignCode],
    );

    const sameDayAttrRes = await client.query(
      `
        SELECT DISTINCT
          s.name AS school_name,
          lower(trim(COALESCE(ev.event_payload ->> 'utm_source', ''))) AS utm_source
        FROM activity_events ev
        JOIN candidates c ON c.id = ev.candidate_id
        JOIN schools s ON s.id = c.school_id
        WHERE ev.event_type = 'ATTRIBUTION_CAPTURED'
          AND c.campaign_code = $1
          AND c.school_id IS NOT NULL
          AND (ev.occurred_at AT TIME ZONE 'Europe/Istanbul')::date = $2::date
      `,
      [campaignCode, dateTr],
    );

    const campaignSeenKeys = new Set(
      campaignSchoolsRes.rows
        .map((row) => normalizeSchoolKey(row.school_name))
        .filter(Boolean),
    );

    const sameDaySeenKeys = new Set(
      sameDayAttrRes.rows
        .map((row) => normalizeSchoolKey(row.school_name))
        .filter(Boolean),
    );

    const observedChannels = Array.from(
      new Set(
        sameDayAttrRes.rows
          .map((row) => safeTrim(row.utm_source).toLowerCase())
          .filter(Boolean),
      ),
    ).sort();

    const missingChannels = expectedChannels.filter((channel) => !observedChannels.includes(channel));

    const missingSchoolRows = expectedKeys
      .map((key) => {
        const base = expectedByKey.get(key);
        const missingInCampaign = !campaignSeenKeys.has(key);
        const missingInSameDayAttr = !sameDaySeenKeys.has(key);
        return {
          school_name: base.school_name,
          district: base.district,
          city: base.city,
          channel_group: base.channel_group,
          utm_source: base.utm_source,
          missing_in_campaign: missingInCampaign ? 'YES' : 'NO',
          missing_in_same_day_attr: missingInSameDayAttr ? 'YES' : 'NO',
        };
      })
      .filter((row) => row.missing_in_campaign === 'YES' || row.missing_in_same_day_attr === 'YES')
      .sort((a, b) => a.school_name.localeCompare(b.school_name, 'tr'));

    const campaignSeenExpectedCount = expectedKeys.filter((key) => campaignSeenKeys.has(key)).length;
    const sameDaySeenExpectedCount = expectedKeys.filter((key) => sameDaySeenKeys.has(key)).length;

    const report = {
      timestamp: new Date().toISOString(),
      config: {
        csv_path: csvPath,
        campaign_code: campaignCode,
        date_tr: dateTr,
      },
      summary: {
        expected_schools: expectedKeys.length,
        campaign_seen_schools: campaignSeenExpectedCount,
        same_day_attr_seen_schools: sameDaySeenExpectedCount,
        missing_in_campaign: expectedKeys.length - campaignSeenExpectedCount,
        missing_in_same_day_attr: expectedKeys.length - sameDaySeenExpectedCount,
        expected_channels: expectedChannels,
        observed_channels: observedChannels,
        missing_channels: missingChannels,
      },
      missing_school_rows: missingSchoolRows,
    };

    await fs.writeFile(
      OUT_CSV,
      toCsv(missingSchoolRows, [
        'school_name',
        'district',
        'city',
        'channel_group',
        'utm_source',
        'missing_in_campaign',
        'missing_in_same_day_attr',
      ]),
      'utf8',
    );
    await fs.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(OUT_MD, renderMarkdown(report), 'utf8');

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await client.end().catch(() => {});
  }
}

run().catch((error) => {
  process.stderr.write(`[p0-school-coverage-missing-report] failed: ${error?.message || String(error)}\n`);
  process.exit(1);
});
