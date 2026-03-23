import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUIDELINES_DIR = path.join(ROOT, 'guidelines');
const DEFAULT_CSV_PATH = path.join(GUIDELINES_DIR, 'p0-school-target-130.csv');
const DEFAULT_BASE_URL = 'https://teachera.com.tr/bursluluk-2026';
const OUTPUT_CSV_PATH = path.join(GUIDELINES_DIR, 'p0-school-link-distribution-pack-latest.csv');
const OUTPUT_JSON_PATH = path.join(GUIDELINES_DIR, 'p0-school-link-distribution-pack-latest.json');
const OUTPUT_MD_PATH = path.join(GUIDELINES_DIR, 'p0-school-link-distribution-pack-latest.md');

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

function parsePositiveInt(value, fallback, min = 1, max = 100000) {
  const parsed = Number.parseInt(safeTrim(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
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

function normalizeBaseUrl(raw) {
  const value = safeTrim(raw || DEFAULT_BASE_URL);
  if (!value) throw new Error('missing_base_url');
  return value.replace(/\/+$/, '');
}

function buildApplyLink(baseUrl, row) {
  const params = new URLSearchParams();
  const utmSource = safeTrim(row.utm_source);
  const utmMedium = safeTrim(row.utm_medium);
  const utmCampaign = safeTrim(row.utm_campaign);
  const utmContent = safeTrim(row.utm_content);
  const utmTerm = safeTrim(row.district).toLowerCase();

  if (utmSource) params.set('utm_source', utmSource);
  if (utmMedium) params.set('utm_medium', utmMedium);
  if (utmCampaign) params.set('utm_campaign', utmCampaign);
  if (utmContent) params.set('utm_content', utmContent);
  if (utmTerm) params.set('utm_term', utmTerm);

  const query = params.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
}

function groupCounts(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = safeTrim(row[key]) || '(empty)';
    map.set(value, (map.get(value) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (b.count - a.count) || a.value.localeCompare(b.value, 'tr'));
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# P0 School Link Distribution Pack');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- base_url: \`${report.config.base_url}\``);
  lines.push(`- source_csv: \`${report.config.source_csv}\``);
  lines.push(`- expected_school_count: ${report.config.expected_school_count}`);
  lines.push(`- generated_links: ${report.summary.generated_links}`);
  lines.push(`- unique_schools: ${report.summary.unique_schools}`);
  lines.push(`- required_headers_ok: ${report.summary.required_headers_ok}`);
  lines.push(`- invalid_line_count: ${report.summary.invalid_line_count}`);
  lines.push('');

  lines.push('## Channel Mix');
  lines.push('');
  lines.push('| channel_group | schools |');
  lines.push('| --- | --- |');
  for (const item of report.summary.by_channel_group) {
    lines.push(`| ${item.value} | ${item.count} |`);
  }
  lines.push('');

  lines.push('## Source Mix');
  lines.push('');
  lines.push('| utm_source | schools |');
  lines.push('| --- | --- |');
  for (const item of report.summary.by_utm_source) {
    lines.push(`| ${item.value} | ${item.count} |`);
  }
  lines.push('');

  lines.push('## District Mix');
  lines.push('');
  lines.push('| district | schools |');
  lines.push('| --- | --- |');
  for (const item of report.summary.by_district) {
    lines.push(`| ${item.value} | ${item.count} |`);
  }
  lines.push('');

  lines.push('## Output');
  lines.push('');
  lines.push(`- CSV pack: \`${report.output.csv_path}\``);
  lines.push(`- JSON artifact: \`${report.output.json_path}\``);
  lines.push(`- Markdown summary: \`${report.output.md_path}\``);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function run() {
  const sourceCsv = path.resolve(safeTrim(process.env.SCHOOL_LINK_SOURCE_CSV) || DEFAULT_CSV_PATH);
  const baseUrl = normalizeBaseUrl(process.env.SCHOOL_LINK_BASE_URL || DEFAULT_BASE_URL);
  const expectedSchoolCount = parsePositiveInt(process.env.SCHOOL_LINK_EXPECTED_COUNT, 130, 1, 10000);

  const rawCsv = await fs.readFile(sourceCsv, 'utf8');
  const parsed = parseCsvText(rawCsv);
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !parsed.headers.includes(header));
  const requiredHeadersOk = missingHeaders.length === 0;

  if (!requiredHeadersOk) {
    throw new Error(`missing_headers:${missingHeaders.join(',')}`);
  }

  const cleanRows = parsed.rows
    .map((row) => ({
      school_name: safeTrim(row.school_name),
      district: safeTrim(row.district),
      city: safeTrim(row.city),
      channel_group: safeTrim(row.channel_group),
      utm_source: safeTrim(row.utm_source),
      utm_medium: safeTrim(row.utm_medium),
      utm_campaign: safeTrim(row.utm_campaign),
      utm_content: safeTrim(row.utm_content),
    }))
    .filter((row) => row.school_name);

  const uniqueSchoolSet = new Set(cleanRows.map((row) => row.school_name.toLowerCase()));

  const outputRows = cleanRows.map((row) => ({
    ...row,
    apply_url: buildApplyLink(baseUrl, row),
  }));

  const header = [
    'school_name',
    'district',
    'city',
    'channel_group',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'apply_url',
  ];

  const csvLines = [header.join(',')];
  for (const row of outputRows) {
    csvLines.push(header.map((key) => csvEscape(row[key])).join(','));
  }

  const report = {
    timestamp: new Date().toISOString(),
    config: {
      source_csv: sourceCsv,
      base_url: baseUrl,
      expected_school_count: expectedSchoolCount,
    },
    summary: {
      generated_links: outputRows.length,
      unique_schools: uniqueSchoolSet.size,
      required_headers_ok: requiredHeadersOk,
      missing_headers: missingHeaders,
      invalid_line_count: parsed.invalidLineCount,
      expected_school_count_ok: uniqueSchoolSet.size >= expectedSchoolCount,
      by_channel_group: groupCounts(cleanRows, 'channel_group'),
      by_utm_source: groupCounts(cleanRows, 'utm_source'),
      by_district: groupCounts(cleanRows, 'district'),
    },
    output: {
      csv_path: OUTPUT_CSV_PATH,
      json_path: OUTPUT_JSON_PATH,
      md_path: OUTPUT_MD_PATH,
    },
  };

  await fs.mkdir(GUIDELINES_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_CSV_PATH, `${csvLines.join('\n')}\n`, 'utf8');
  await fs.writeFile(OUTPUT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(OUTPUT_MD_PATH, renderMarkdown(report), 'utf8');

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

run().catch((error) => {
  process.stderr.write(`[p0-school-link-distribution-pack] failed: ${error?.message || String(error)}\n`);
  process.exit(1);
});
