import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUIDELINES_DIR = path.join(ROOT, 'guidelines');
const INPUT_CSV = path.join(GUIDELINES_DIR, 'p0-school-link-distribution-pack-latest.csv');
const OUTPUT_CSV = path.join(GUIDELINES_DIR, 'p0-school-message-link-list-latest.csv');
const OUTPUT_MD = path.join(GUIDELINES_DIR, 'p0-school-message-link-list-latest.md');
const OUTPUT_JSON = path.join(GUIDELINES_DIR, 'p0-school-message-link-list-latest.json');

function safeTrim(value) {
  return String(value ?? '').trim();
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
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

function renderMd(report) {
  const lines = [];
  lines.push('# P0 School Message + Link List');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- Input CSV: \`${report.input_csv}\``);
  lines.push(`- Total schools: ${report.total_schools}`);
  lines.push(`- Output CSV: \`${report.output_csv}\``);
  lines.push('');
  lines.push('## Template (SMS)');
  lines.push('');
  lines.push('`Merhaba {OKUL} velileri, Teachera Bursluluk Sinavi 2026 basvurulari acildi. Basvuru linki: {LINK}`');
  lines.push('');
  lines.push('## Template (WhatsApp)');
  lines.push('');
  lines.push('`Merhaba {OKUL} velileri. Teachera Bursluluk Sinavi 2026 basvurusu icin link: {LINK}`');
  lines.push('`Sorulariniz icin bu numaraya yazabilirsiniz.`');
  lines.push('');
  lines.push('## First 5 Rows Preview');
  lines.push('');
  lines.push('| school_name | apply_url |');
  lines.push('| --- | --- |');
  for (const row of report.preview) {
    lines.push(`| ${row.school_name} | ${row.apply_url} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const raw = await fs.readFile(INPUT_CSV, 'utf8');
  const parsed = parseCsv(raw);

  const required = ['school_name', 'district', 'city', 'channel_group', 'apply_url'];
  const missing = required.filter((key) => !parsed.headers.includes(key));
  if (missing.length > 0) {
    throw new Error(`missing_headers:${missing.join(',')}`);
  }

  const outputRows = parsed.rows
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
  ];

  const lines = [headers.join(',')];
  for (const row of outputRows) {
    lines.push(headers.map((key) => csvEscape(row[key])).join(','));
  }

  const report = {
    timestamp: new Date().toISOString(),
    input_csv: INPUT_CSV,
    output_csv: OUTPUT_CSV,
    total_schools: outputRows.length,
    preview: outputRows.slice(0, 5).map((row) => ({
      school_name: row.school_name,
      apply_url: row.apply_url,
    })),
  };

  await fs.writeFile(OUTPUT_CSV, `${lines.join('\n')}\n`, 'utf8');
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(OUTPUT_MD, renderMd(report), 'utf8');

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`[p0-school-message-pack] failed: ${error?.message || String(error)}\n`);
  process.exit(1);
});
