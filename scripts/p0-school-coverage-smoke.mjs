import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUIDELINES_DIR = path.join(ROOT, 'guidelines');
const DEFAULT_CSV_PATH = path.join(GUIDELINES_DIR, 'p0-school-target-130.csv');
const JSON_ARTIFACT = path.join(GUIDELINES_DIR, 'p0-school-coverage-smoke-latest.json');
const MD_ARTIFACT = path.join(GUIDELINES_DIR, 'p0-school-coverage-smoke-latest.md');

const REQUIRED_HEADERS = [
  'school_name',
  'district',
  'city',
  'channel_group',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
];

function safeTrim(value) {
  return String(value ?? '').trim();
}

function parseBoolean(value, fallback = false) {
  const normalized = safeTrim(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(value, fallback, min = 1, max = 100000) {
  const parsed = Number.parseInt(safeTrim(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
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
  return safeTrim(value).replace(/\s+/g, ' ').toLowerCase();
}

function isPlaceholderCsvPath(csvPath) {
  return /^\/absolute\/path\//.test(safeTrim(csvPath));
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
    return {
      headers: [],
      rows: [],
      invalidLineCount: 0,
    };
  }

  const headers = lines[0].split(',').map((token) => safeTrim(token));
  const rows = [];
  let invalidLineCount = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(',').map((token) => safeTrim(token));
    if (parts.length !== headers.length) {
      invalidLineCount += 1;
      continue;
    }
    const row = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = parts[j];
    }
    rows.push(row);
  }

  return {
    headers,
    rows,
    invalidLineCount,
  };
}

function makeCheck(id, status, detail, evidence = {}) {
  return { id, status, detail, evidence };
}

function reduceTotals(checks) {
  return checks.reduce(
    (acc, check) => {
      const key = safeTrim(check.status).toLowerCase();
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
  lines.push('# P0 School Coverage Smoke');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- overall_pass: **${report.overall_pass}**`);
  lines.push(`- csv_path: \`${report.config.csv_path}\``);
  lines.push(`- expected_school_count: ${report.config.expected_school_count}`);
  lines.push(`- date_tr: ${report.config.date_tr}`);
  lines.push(`- campaign_code: ${report.config.campaign_code}`);
  lines.push('');
  lines.push(`- pass: ${report.totals.pass}`);
  lines.push(`- fail: ${report.totals.fail}`);
  lines.push(`- warn: ${report.totals.warn}`);
  lines.push(`- skip: ${report.totals.skip}`);
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

async function writeArtifacts(report) {
  await fs.mkdir(GUIDELINES_DIR, { recursive: true });
  await fs.writeFile(JSON_ARTIFACT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(MD_ARTIFACT, renderMarkdown(report), 'utf8');
}

async function upsertSchools(client, rows) {
  let affected = 0;
  for (const row of rows) {
    const schoolName = safeTrim(row.school_name);
    if (!schoolName) continue;
    const district = safeTrim(row.district) || null;
    const city = safeTrim(row.city) || null;
    await client.query(
      `
        INSERT INTO schools (name, district, city)
        VALUES ($1, $2, $3)
        ON CONFLICT (name) DO UPDATE
        SET
          district = COALESCE(EXCLUDED.district, schools.district),
          city = COALESCE(EXCLUDED.city, schools.city),
          updated_at = NOW()
      `,
      [schoolName, district, city],
    );
    affected += 1;
  }
  return affected;
}

async function run() {
  const checks = [];
  const csvPath = path.resolve(safeTrim(process.env.SCHOOL_COVERAGE_CSV) || DEFAULT_CSV_PATH);
  const expectedSchoolCount = parsePositiveInt(process.env.SCHOOL_COVERAGE_EXPECTED_COUNT, 130, 1, 10000);
  const campaignCode = safeTrim(process.env.SCHOOL_COVERAGE_CAMPAIGN_CODE || '2026_BURSLULUK').slice(0, 160);
  const dateTr = safeTrim(process.env.SCHOOL_COVERAGE_DATE || toTurkeyDate());
  const requireDb = parseBoolean(process.env.SCHOOL_COVERAGE_REQUIRE_DB, false);
  const strictTraffic = parseBoolean(process.env.SCHOOL_COVERAGE_STRICT_TRAFFIC, false);
  const upsertMode = parseBoolean(process.env.SCHOOL_COVERAGE_UPSERT, false);
  const dbUrl = safeTrim(process.env.SMOKE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const placeholderCsvPath = isPlaceholderCsvPath(csvPath);

  checks.push(
    makeCheck(
      'csv_path_not_placeholder',
      placeholderCsvPath ? 'FAIL' : 'PASS',
      placeholderCsvPath
        ? 'SCHOOL_COVERAGE_CSV still points to placeholder path (/absolute/path/...).'
        : 'CSV path looks valid.',
      { path: csvPath },
    ),
  );

  let csvText = '';
  let csvFileExists = false;
  try {
    csvText = await fs.readFile(csvPath, 'utf8');
    csvFileExists = true;
    checks.push(makeCheck('csv_file_exists', 'PASS', 'CSV file found.', { path: csvPath }));
  } catch (error) {
    checks.push(
      makeCheck(
        'csv_file_exists',
        'FAIL',
        'CSV file not found.',
        { path: csvPath, error: error?.message || String(error) },
      ),
    );
  }

  const parsed = parseCsvText(csvText);
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !parsed.headers.includes(header));
  const csvHeadersOk = missingHeaders.length === 0;
  const csvRowsCount = parsed.rows.length;
  checks.push(
    makeCheck(
      'csv_headers_required',
      csvHeadersOk ? 'PASS' : 'FAIL',
      csvHeadersOk
        ? `All required headers present (${REQUIRED_HEADERS.length}).`
        : `Missing headers: ${missingHeaders.join(', ')}`,
      {
        required_headers: REQUIRED_HEADERS,
        actual_headers: parsed.headers,
      },
    ),
  );

  checks.push(
    makeCheck(
      'csv_parse_valid_lines',
      parsed.invalidLineCount === 0 ? 'PASS' : 'FAIL',
      parsed.invalidLineCount === 0 ? 'All lines parsed.' : `${parsed.invalidLineCount} invalid line(s) skipped.`,
      {
        row_count: parsed.rows.length,
        invalid_line_count: parsed.invalidLineCount,
      },
    ),
  );

  const normalizedNames = parsed.rows
    .map((row) => normalizeSchoolKey(row.school_name))
    .filter(Boolean);
  const exactSchoolNames = parsed.rows
    .map((row) => safeTrim(row.school_name))
    .filter(Boolean);
  const uniqueExactSchoolNames = Array.from(new Set(exactSchoolNames));
  const uniqueSchoolKeys = Array.from(new Set(normalizedNames));
  const duplicateCount = normalizedNames.length - uniqueSchoolKeys.length;

  checks.push(
    makeCheck(
      'csv_school_count_expected',
      uniqueSchoolKeys.length >= expectedSchoolCount ? 'PASS' : 'FAIL',
      `unique schools=${uniqueSchoolKeys.length}, expected>=${expectedSchoolCount}`,
      {
        csv_row_count: parsed.rows.length,
        unique_school_count: uniqueSchoolKeys.length,
        expected_school_count: expectedSchoolCount,
      },
    ),
  );

  checks.push(
    makeCheck(
      'csv_no_duplicate_school_names',
      duplicateCount === 0 ? 'PASS' : 'FAIL',
      duplicateCount === 0 ? 'No duplicate school names.' : `${duplicateCount} duplicate school name(s) found.`,
      { duplicate_count: duplicateCount },
    ),
  );

  const missingChannelRows = parsed.rows
    .map((row, index) => ({
      row_number: index + 2,
      school_name: safeTrim(row.school_name),
      channel_group: safeTrim(row.channel_group),
      utm_source: safeTrim(row.utm_source),
      utm_medium: safeTrim(row.utm_medium),
    }))
    .filter((row) => !row.school_name || !row.channel_group || !row.utm_source || !row.utm_medium);

  checks.push(
    makeCheck(
      'csv_channel_fields_complete',
      missingChannelRows.length === 0 ? 'PASS' : 'FAIL',
      missingChannelRows.length === 0
        ? 'All rows have school/channel/source/medium fields.'
        : `${missingChannelRows.length} row(s) missing required channel fields.`,
      {
        missing_rows_preview: missingChannelRows.slice(0, 10),
      },
    ),
  );

  const expectedChannels = Array.from(
    new Set(
      parsed.rows
        .map((row) => safeTrim(row.utm_source).toLowerCase())
        .filter(Boolean),
    ),
  ).sort();

  checks.push(
    makeCheck(
      'csv_channel_mix_present',
      expectedChannels.length > 0 ? 'PASS' : 'FAIL',
      expectedChannels.length > 0
        ? `CSV channel sources: ${expectedChannels.join(', ')}`
        : 'No utm_source values found in CSV.',
      { expected_channels: expectedChannels },
    ),
  );

  if (!dbUrl) {
    checks.push(
      makeCheck(
        'db_connection',
        requireDb ? 'FAIL' : 'SKIP',
        requireDb ? 'DB connection required but missing DATABASE_URL/SMOKE_DB_URL.' : 'DB checks skipped (no DATABASE_URL).',
      ),
    );
  } else {
    const client = new Client({ connectionString: dbUrl });
    try {
      await client.connect();
      checks.push(makeCheck('db_connection', 'PASS', 'Connected to database.'));

      if (upsertMode) {
        if (!csvFileExists || !csvHeadersOk || csvRowsCount === 0) {
          checks.push(
            makeCheck(
              'db_upsert_school_master',
              'FAIL',
              'Upsert skipped because CSV is missing/invalid/empty.',
              {
                csv_file_exists: csvFileExists,
                csv_headers_ok: csvHeadersOk,
                csv_rows_count: csvRowsCount,
              },
            ),
          );
        } else {
          const affected = await upsertSchools(client, parsed.rows);
          checks.push(
            makeCheck(
              'db_upsert_school_master',
              'PASS',
              `Upsert completed for ${affected} row(s).`,
              { affected_rows: affected },
            ),
          );
        }
      } else {
        checks.push(
          makeCheck(
            'db_upsert_school_master',
            'SKIP',
            'Upsert skipped (set SCHOOL_COVERAGE_UPSERT=true to enable).',
          ),
        );
      }

      const totalSchoolsRes = await client.query('SELECT COUNT(*)::int AS total FROM schools');
      const dbTotalSchools = Number(totalSchoolsRes.rows?.[0]?.total || 0);
      checks.push(
        makeCheck(
          'db_total_schools_expected',
          dbTotalSchools >= expectedSchoolCount ? 'PASS' : 'FAIL',
          `db schools=${dbTotalSchools}, expected>=${expectedSchoolCount}`,
          { db_total_schools: dbTotalSchools, expected_school_count: expectedSchoolCount },
        ),
      );

      const dbMatchRes = await client.query(
        `
          SELECT COUNT(*)::int AS matched
          FROM schools s
          WHERE trim(s.name) = ANY($1::text[])
        `,
        [uniqueExactSchoolNames],
      );
      const matchedSchools = Number(dbMatchRes.rows?.[0]?.matched || 0);
      checks.push(
        makeCheck(
          'db_school_master_matches_csv',
          matchedSchools >= expectedSchoolCount ? 'PASS' : 'FAIL',
          `matched schools=${matchedSchools}, expected>=${expectedSchoolCount}`,
          {
            matched_schools: matchedSchools,
            expected_school_count: expectedSchoolCount,
          },
        ),
      );

      const campaignCoverageRes = await client.query(
        `
          SELECT COUNT(DISTINCT c.school_id)::int AS school_count
          FROM applications a
          JOIN candidates c ON c.id = a.candidate_id
          WHERE c.campaign_code = $1
            AND c.school_id IS NOT NULL
        `,
        [campaignCode],
      );
      const campaignSchoolCount = Number(campaignCoverageRes.rows?.[0]?.school_count || 0);
      checks.push(
        makeCheck(
          'db_campaign_school_coverage',
          campaignSchoolCount >= expectedSchoolCount
            ? 'PASS'
            : strictTraffic
              ? 'FAIL'
              : 'WARN',
          `campaign schools=${campaignSchoolCount}, expected>=${expectedSchoolCount}`,
          {
            campaign_code: campaignCode,
            campaign_school_count: campaignSchoolCount,
            expected_school_count: expectedSchoolCount,
            strict_traffic: strictTraffic,
          },
        ),
      );

      const attrSchoolCoverageRes = await client.query(
        `
          SELECT COUNT(DISTINCT c.school_id)::int AS school_count
          FROM activity_events ev
          JOIN candidates c ON c.id = ev.candidate_id
          WHERE ev.event_type = 'ATTRIBUTION_CAPTURED'
            AND c.campaign_code = $1
            AND c.school_id IS NOT NULL
            AND (ev.occurred_at AT TIME ZONE 'Europe/Istanbul')::date = $2::date
        `,
        [campaignCode, dateTr],
      );
      const attrSchoolCount = Number(attrSchoolCoverageRes.rows?.[0]?.school_count || 0);
      checks.push(
        makeCheck(
          'db_same_day_attr_school_coverage',
          attrSchoolCount >= expectedSchoolCount
            ? 'PASS'
            : strictTraffic
              ? 'FAIL'
              : 'WARN',
          `same-day attribution schools=${attrSchoolCount}, expected>=${expectedSchoolCount}`,
          {
            campaign_code: campaignCode,
            date_tr: dateTr,
            school_count: attrSchoolCount,
            expected_school_count: expectedSchoolCount,
            strict_traffic: strictTraffic,
          },
        ),
      );

      const attrChannelsRes = await client.query(
        `
          SELECT
            lower(trim(COALESCE(ev.event_payload ->> 'utm_source', ''))) AS utm_source,
            COUNT(*)::int AS total
          FROM activity_events ev
          JOIN candidates c ON c.id = ev.candidate_id
          WHERE ev.event_type = 'ATTRIBUTION_CAPTURED'
            AND c.campaign_code = $1
            AND (ev.occurred_at AT TIME ZONE 'Europe/Istanbul')::date = $2::date
          GROUP BY 1
          ORDER BY total DESC, utm_source ASC
        `,
        [campaignCode, dateTr],
      );
      const observedChannels = attrChannelsRes.rows
        .map((row) => safeTrim(row.utm_source))
        .filter(Boolean);
      const missingChannels = expectedChannels.filter((channel) => !observedChannels.includes(channel));
      const hasExpectedChannels = expectedChannels.length > 0;
      checks.push(
        makeCheck(
          'db_same_day_channel_coverage',
          !hasExpectedChannels
            ? strictTraffic ? 'FAIL' : 'WARN'
            : missingChannels.length === 0
              ? 'PASS'
              : strictTraffic
                ? 'FAIL'
                : 'WARN',
          !hasExpectedChannels
            ? 'Expected channels list is empty (CSV utm_source values missing).'
            : missingChannels.length === 0
              ? `All expected channels observed: ${expectedChannels.join(', ')}`
              : `Missing channels: ${missingChannels.join(', ')}`,
          {
            campaign_code: campaignCode,
            date_tr: dateTr,
            expected_channels: expectedChannels,
            observed_channels: observedChannels,
            missing_channels: missingChannels,
            strict_traffic: strictTraffic,
          },
        ),
      );
    } catch (error) {
      checks.push(
        makeCheck(
          'db_runtime_checks',
          'FAIL',
          'Database check failed.',
          { error: error?.message || String(error) },
        ),
      );
    } finally {
      await client.end().catch(() => {});
    }
  }

  const totals = reduceTotals(checks);
  const report = {
    timestamp: new Date().toISOString(),
    config: {
      csv_path: csvPath,
      expected_school_count: expectedSchoolCount,
      campaign_code: campaignCode,
      date_tr: dateTr,
      require_db: requireDb,
      strict_traffic: strictTraffic,
      upsert_mode: upsertMode,
      has_db_url: Boolean(dbUrl),
    },
    totals,
    overall_pass: totals.fail === 0,
    checks,
  };

  await writeArtifacts(report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.overall_pass) {
    process.exitCode = 1;
  }
}

run().catch(async (error) => {
  const report = {
    timestamp: new Date().toISOString(),
    config: {},
    totals: { pass: 0, fail: 1, warn: 0, skip: 0 },
    overall_pass: false,
    checks: [
      makeCheck(
        'script_runtime',
        'FAIL',
        'Script execution failed.',
        { error: error?.message || String(error) },
      ),
    ],
  };
  try {
    await writeArtifacts(report);
  } catch {
    // Ignore artifact write errors in fallback path.
  }
  console.error('[p0-school-coverage-smoke] failed', error?.message || String(error));
  process.exit(1);
});
