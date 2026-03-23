import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUIDELINES_DIR = path.join(ROOT, 'guidelines');
const INPUT_CSV = path.join(GUIDELINES_DIR, 'p0-school-link-distribution-pack-latest.csv');
const OUTPUT_TRACKER_CSV = path.join(GUIDELINES_DIR, 'p0-school-send-ops-tracker-latest.csv');
const OUTPUT_READY_CSV = path.join(GUIDELINES_DIR, 'p0-school-send-ops-ready-latest.csv');
const OUTPUT_MD = path.join(GUIDELINES_DIR, 'p0-school-send-ops-tracker-latest.md');
const OUTPUT_JSON = path.join(GUIDELINES_DIR, 'p0-school-send-ops-tracker-latest.json');

const REQUIRED_HEADERS = [
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

function safeTrim(value) {
  return String(value ?? '').trim();
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function parseCsv(text) {
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

  const headers = lines[0].split(',').map((item) => safeTrim(item));
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',').map((item) => safeTrim(item));
    if (cols.length !== headers.length) continue;
    const row = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = cols[j];
    }
    rows.push(row);
  }

  return { headers, rows };
}

function suggestChannelActual(channelGroup) {
  const value = safeTrim(channelGroup).toLowerCase();
  if (value === 'outdoor_qr') return 'qr';
  if (value === 'mall_screen') return 'avm_screen';
  if (value === 'social_paid') return 'social_dm';
  return 'digital';
}

function buildSmsMessage(row) {
  const schoolName = safeTrim(row.school_name);
  const link = safeTrim(row.apply_url);
  return `Merhaba ${schoolName} velileri, Teachera Bursluluk Sinavi 2026 basvurulari acildi. Basvuru linki: ${link}`;
}

function buildWhatsappMessage(row) {
  const schoolName = safeTrim(row.school_name);
  const link = safeTrim(row.apply_url);
  return `Merhaba ${schoolName} velileri. Teachera Bursluluk Sinavi 2026 basvurusu icin link: ${link}\nSorulariniz icin bu numaraya yazabilirsiniz.`;
}

function countBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = safeTrim(row[key]) || '(empty)';
    map.set(value, (map.get(value) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (b.count - a.count) || a.value.localeCompare(b.value, 'tr'));
}

function renderMd(report) {
  const lines = [];
  lines.push('# P0 School Send Ops Tracker');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- Input CSV: \`${report.input_csv}\``);
  lines.push(`- Tracker CSV: \`${report.output_tracker_csv}\``);
  lines.push(`- Ready CSV: \`${report.output_ready_csv}\``);
  lines.push(`- Total schools: ${report.total_schools}`);
  lines.push('');
  lines.push('## Required Fill Columns');
  lines.push('');
  lines.push('- `send_owner`');
  lines.push('- `send_channel_actual`');
  lines.push('- `sent_at` (ISO date-time)');
  lines.push('- `delivery_proof`');
  lines.push('- `status` (`READY|SENT|DELIVERED|FAILED`)');
  lines.push('');
  lines.push('## District Mix');
  lines.push('');
  lines.push('| district | schools |');
  lines.push('| --- | --- |');
  for (const item of report.by_district) {
    lines.push(`| ${item.value} | ${item.count} |`);
  }
  lines.push('');
  lines.push('## Channel Group Mix');
  lines.push('');
  lines.push('| channel_group | schools |');
  lines.push('| --- | --- |');
  for (const item of report.by_channel_group) {
    lines.push(`| ${item.value} | ${item.count} |`);
  }
  lines.push('');
  lines.push('## First 5 Rows');
  lines.push('');
  lines.push('| school_name | apply_url | status |');
  lines.push('| --- | --- | --- |');
  for (const row of report.preview) {
    lines.push(`| ${row.school_name} | ${row.apply_url} | ${row.status} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const raw = await fs.readFile(INPUT_CSV, 'utf8');
  const parsed = parseCsv(raw);

  const missingHeaders = REQUIRED_HEADERS.filter((header) => !parsed.headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`missing_headers:${missingHeaders.join(',')}`);
  }

  const rows = parsed.rows
    .map((row) => ({
      school_name: safeTrim(row.school_name),
      district: safeTrim(row.district),
      city: safeTrim(row.city),
      channel_group: safeTrim(row.channel_group),
      utm_source: safeTrim(row.utm_source),
      utm_medium: safeTrim(row.utm_medium),
      utm_campaign: safeTrim(row.utm_campaign),
      utm_content: safeTrim(row.utm_content),
      apply_url: safeTrim(row.apply_url),
      message_sms: buildSmsMessage(row),
      message_whatsapp: buildWhatsappMessage(row),
      send_owner: '',
      send_channel_actual: suggestChannelActual(row.channel_group),
      sent_at: '',
      delivery_proof: '',
      status: 'READY',
    }))
    .filter((row) => row.school_name && row.apply_url);

  const headers = [
    'school_name',
    'district',
    'city',
    'channel_group',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'apply_url',
    'message_sms',
    'message_whatsapp',
    'send_owner',
    'send_channel_actual',
    'sent_at',
    'delivery_proof',
    'status',
  ];

  const trackerLines = [headers.join(',')];
  for (const row of rows) {
    trackerLines.push(headers.map((key) => csvEscape(row[key])).join(','));
  }

  const readyRows = rows.filter((row) => row.status === 'READY');
  const readyLines = [headers.join(',')];
  for (const row of readyRows) {
    readyLines.push(headers.map((key) => csvEscape(row[key])).join(','));
  }

  const report = {
    timestamp: new Date().toISOString(),
    input_csv: INPUT_CSV,
    output_tracker_csv: OUTPUT_TRACKER_CSV,
    output_ready_csv: OUTPUT_READY_CSV,
    total_schools: rows.length,
    ready_schools: readyRows.length,
    by_district: countBy(rows, 'district'),
    by_channel_group: countBy(rows, 'channel_group'),
    preview: rows.slice(0, 5).map((row) => ({
      school_name: row.school_name,
      apply_url: row.apply_url,
      status: row.status,
    })),
  };

  await fs.writeFile(OUTPUT_TRACKER_CSV, `${trackerLines.join('\n')}\n`, 'utf8');
  await fs.writeFile(OUTPUT_READY_CSV, `${readyLines.join('\n')}\n`, 'utf8');
  await fs.writeFile(OUTPUT_MD, renderMd(report), 'utf8');
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`[p0-school-send-tracker-init] failed: ${error?.message || String(error)}\n`);
  process.exit(1);
});
