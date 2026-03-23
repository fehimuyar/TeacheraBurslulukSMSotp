import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUIDELINES_DIR = path.join(ROOT, 'guidelines');

const TARGET_CSV = path.join(GUIDELINES_DIR, 'p0-school-target-130.csv');
const MISSING_CSV = path.join(GUIDELINES_DIR, 'p0-school-coverage-missing-schools-latest.csv');

const OUT_CSV = path.join(GUIDELINES_DIR, 'p0-school-send-priority-urgent-latest.csv');
const OUT_JSON = path.join(GUIDELINES_DIR, 'p0-school-send-priority-urgent-latest.json');
const OUT_MD = path.join(GUIDELINES_DIR, 'p0-school-send-priority-urgent-latest.md');

const APPLY_BASE = 'https://teachera.com.tr/bursluluk-2026';

function safeTrim(value) {
  return String(value ?? '').trim();
}

function normalizeKey(value) {
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
    const cols = lines[i].split(',').map((token) => safeTrim(token));
    if (cols.length !== headers.length) continue;
    const row = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = cols[j];
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

function buildApplyUrl(row) {
  const params = new URLSearchParams({
    utm_source: safeTrim(row.utm_source),
    utm_medium: safeTrim(row.utm_medium),
    utm_campaign: safeTrim(row.utm_campaign),
    utm_content: safeTrim(row.utm_content),
    utm_term: safeTrim(row.district).toLowerCase(),
  });
  return `${APPLY_BASE}?${params.toString()}`;
}

function buildSmsMessage(row) {
  return `Merhaba ${row.school_name} velileri, Teachera Bursluluk Sinavi 2026 basvurulari acildi. Basvuru linki: ${row.apply_url}`;
}

function buildWhatsappMessage(row) {
  return `Merhaba ${row.school_name} velileri. Teachera Bursluluk Sinavi 2026 basvurusu icin link: ${row.apply_url}\nSorulariniz icin bu numaraya yazabilirsiniz.`;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# P0 School Send Priority (Urgent Missing Coverage)');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- Expected target schools: ${report.summary.expected_target_schools}`);
  lines.push(`- Missing schools (urgent send): ${report.summary.missing_schools}`);
  lines.push(`- Output CSV: \`${OUT_CSV}\``);
  lines.push('');
  lines.push('## Channel Breakdown');
  lines.push('');
  lines.push('| channel_group | count |');
  lines.push('| --- | --- |');
  for (const item of report.summary.by_channel_group) {
    lines.push(`| ${item.channel_group} | ${item.count} |`);
  }
  lines.push('');
  lines.push('## UTM Source Breakdown');
  lines.push('');
  lines.push('| utm_source | count |');
  lines.push('| --- | --- |');
  for (const item of report.summary.by_utm_source) {
    lines.push(`| ${item.utm_source} | ${item.count} |`);
  }
  lines.push('');
  lines.push('## First 15 Urgent Rows');
  lines.push('');
  lines.push('| school_name | district | channel_group | utm_source | apply_url |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of report.preview) {
    lines.push(`| ${row.school_name} | ${row.district} | ${row.channel_group} | ${row.utm_source} | ${row.apply_url} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function countBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const label = safeTrim(row[key]);
    map.set(label, (map.get(label) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ [key]: label, count }))
    .sort((a, b) => b.count - a.count || String(a[key]).localeCompare(String(b[key]), 'tr'));
}

async function run() {
  const targetRaw = await fs.readFile(TARGET_CSV, 'utf8');
  const missingRaw = await fs.readFile(MISSING_CSV, 'utf8');

  const target = parseCsvText(targetRaw);
  const missing = parseCsvText(missingRaw);

  const targetMap = new Map();
  for (const row of target.rows) {
    const key = normalizeKey(row.school_name);
    if (key && !targetMap.has(key)) {
      targetMap.set(key, row);
    }
  }

  const urgentRows = [];
  for (const row of missing.rows) {
    const key = normalizeKey(row.school_name);
    const base = targetMap.get(key);
    if (!base) continue;

    const merged = {
      school_name: safeTrim(base.school_name),
      district: safeTrim(base.district),
      city: safeTrim(base.city),
      channel_group: safeTrim(base.channel_group),
      utm_source: safeTrim(base.utm_source),
      utm_medium: safeTrim(base.utm_medium),
      utm_campaign: safeTrim(base.utm_campaign),
      utm_content: safeTrim(base.utm_content),
      apply_url: '',
      message_sms: '',
      message_whatsapp: '',
      missing_in_campaign: safeTrim(row.missing_in_campaign) || 'YES',
      missing_in_same_day_attr: safeTrim(row.missing_in_same_day_attr) || 'YES',
      priority_reason: safeTrim(row.missing_in_same_day_attr) === 'YES' ? 'URGENT_NO_ATTRIBUTION' : 'URGENT_NO_CAMPAIGN_EVENT',
      send_owner: '',
      send_channel_actual: '',
      sent_at: '',
      delivery_proof: '',
      status: 'READY_TO_SEND_TODAY',
    };

    merged.apply_url = buildApplyUrl(merged);
    merged.message_sms = buildSmsMessage(merged);
    merged.message_whatsapp = buildWhatsappMessage(merged);

    urgentRows.push(merged);
  }

  urgentRows.sort((a, b) => {
    if (a.channel_group !== b.channel_group) return a.channel_group.localeCompare(b.channel_group, 'tr');
    if (a.district !== b.district) return a.district.localeCompare(b.district, 'tr');
    return a.school_name.localeCompare(b.school_name, 'tr');
  });

  const byChannelGroup = countBy(urgentRows, 'channel_group');
  const byUtmSource = countBy(urgentRows, 'utm_source');

  const report = {
    timestamp: new Date().toISOString(),
    input: {
      target_csv: TARGET_CSV,
      missing_csv: MISSING_CSV,
    },
    summary: {
      expected_target_schools: targetMap.size,
      missing_schools: urgentRows.length,
      by_channel_group: byChannelGroup,
      by_utm_source: byUtmSource,
    },
    preview: urgentRows.slice(0, 15).map((row) => ({
      school_name: row.school_name,
      district: row.district,
      channel_group: row.channel_group,
      utm_source: row.utm_source,
      apply_url: row.apply_url,
    })),
  };

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
    'missing_in_campaign',
    'missing_in_same_day_attr',
    'priority_reason',
    'send_owner',
    'send_channel_actual',
    'sent_at',
    'delivery_proof',
    'status',
  ];

  await fs.writeFile(OUT_CSV, toCsv(urgentRows, headers), 'utf8');
  await fs.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(OUT_MD, renderMarkdown(report), 'utf8');

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

run().catch((error) => {
  process.stderr.write(`[p0-school-send-priority-pack] failed: ${error?.message || String(error)}\n`);
  process.exit(1);
});
