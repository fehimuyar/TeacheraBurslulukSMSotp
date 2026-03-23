import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUIDELINES_DIR = path.join(ROOT, 'guidelines');
const INPUT_CSV = path.join(GUIDELINES_DIR, 'p0-school-send-priority-urgent-latest.csv');
const SUMMARY_MD = path.join(GUIDELINES_DIR, 'p0-school-send-priority-batches-latest.md');
const SUMMARY_JSON = path.join(GUIDELINES_DIR, 'p0-school-send-priority-batches-latest.json');

function safeTrim(value) {
  return String(value ?? '').trim();
}

function parsePositiveInt(value, fallback, min = 1, max = 10000) {
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

function parseCsv(content) {
  const text = String(content || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      continue;
    }
    if (ch === '\r') {
      continue;
    }
    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const normalized = rows.filter((r) => r.some((cell) => safeTrim(cell).length > 0));
  if (normalized.length === 0) return { headers: [], rows: [] };

  const headers = normalized[0].map((item) => safeTrim(item));
  const data = normalized.slice(1).map((cols) => {
    const obj = {};
    for (let i = 0; i < headers.length; i += 1) {
      obj[headers[i]] = cols[i] ?? '';
    }
    return obj;
  });

  return { headers, rows: data };
}

function toCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function renderMarkdown(summary) {
  const lines = [];
  lines.push('# P0 School Send Priority Batches');
  lines.push('');
  lines.push(`- Timestamp: ${summary.timestamp}`);
  lines.push(`- Input: \`${summary.input_csv}\``);
  lines.push(`- Total rows: ${summary.total_rows}`);
  lines.push(`- Batch size: ${summary.batch_size}`);
  lines.push(`- Batch count: ${summary.batch_count}`);
  lines.push('');
  lines.push('| Batch | Rows | File |');
  lines.push('| --- | --- | --- |');
  for (const batch of summary.batches) {
    lines.push(`| ${batch.batch_id} | ${batch.row_count} | \`${batch.file}\` |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const batchSize = parsePositiveInt(process.env.SCHOOL_SEND_BATCH_SIZE, 30, 1, 500);
  const raw = await fs.readFile(INPUT_CSV, 'utf8');
  const parsed = parseCsv(raw);
  if (parsed.headers.length === 0) {
    throw new Error('input_csv_empty');
  }

  const activeRows = parsed.rows.filter((row) => safeTrim(row.status) !== 'SENT');
  const batches = chunkArray(activeRows, batchSize);
  const outputBatches = [];

  await fs.mkdir(GUIDELINES_DIR, { recursive: true });

  for (let i = 0; i < batches.length; i += 1) {
    const idx = String(i + 1).padStart(2, '0');
    const file = path.join(GUIDELINES_DIR, `p0-school-send-priority-batch-${idx}.csv`);
    const csv = toCsv(parsed.headers, batches[i]);
    await fs.writeFile(file, csv, 'utf8');
    outputBatches.push({
      batch_id: idx,
      row_count: batches[i].length,
      file,
    });
  }

  const summary = {
    timestamp: new Date().toISOString(),
    input_csv: INPUT_CSV,
    total_rows: activeRows.length,
    batch_size: batchSize,
    batch_count: outputBatches.length,
    batches: outputBatches,
  };

  await fs.writeFile(SUMMARY_JSON, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await fs.writeFile(SUMMARY_MD, renderMarkdown(summary), 'utf8');
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`[p0-school-send-batch-pack] failed: ${error?.message || String(error)}\n`);
  process.exit(1);
});
