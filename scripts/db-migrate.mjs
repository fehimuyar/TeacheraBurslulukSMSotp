import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getPool } from '../packages/shared/backend/db.js';

function resolveDatabaseUrl() {
  return (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
}

async function listMigrationFiles(migrationsDir) {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
}

function parseCliArgs(argv) {
  const options = {
    from: '',
    files: [],
  };

  for (const arg of argv) {
    const value = String(arg || '').trim();
    if (!value) continue;
    if (value.startsWith('--from=')) {
      options.from = value.slice('--from='.length).trim();
      continue;
    }
    if (value.startsWith('--files=')) {
      options.files = value
        .slice('--files='.length)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return options;
}

function filterMigrationFiles(migrationFiles, options) {
  if (Array.isArray(options.files) && options.files.length > 0) {
    const allowed = new Set(options.files);
    const selected = migrationFiles.filter((fileName) => allowed.has(fileName));
    const missing = options.files.filter((fileName) => !migrationFiles.includes(fileName));
    if (missing.length > 0) {
      throw new Error(`Requested migration files were not found: ${missing.join(', ')}`);
    }
    return selected;
  }

  if (options.from) {
    const startIndex = migrationFiles.indexOf(options.from);
    if (startIndex === -1) {
      throw new Error(`Migration file not found for --from: ${options.from}`);
    }
    return migrationFiles.slice(startIndex);
  }

  return migrationFiles;
}

async function main() {
  const connectionString = resolveDatabaseUrl();
  if (!connectionString) {
    console.error('DATABASE_URL/POSTGRES_URL bulunamadı. Önce env tanımlayın.');
    process.exit(1);
  }

  const currentFile = fileURLToPath(import.meta.url);
  const rootDir = path.resolve(path.dirname(currentFile), '..');
  const migrationsDir = path.join(rootDir, 'db', 'migrations');
  const allMigrationFiles = await listMigrationFiles(migrationsDir);
  const options = parseCliArgs(process.argv.slice(2));
  const migrationFiles = filterMigrationFiles(allMigrationFiles, options);

  if (migrationFiles.length === 0) {
    console.log('Migration dosyası bulunamadı.');
    return;
  }

  const pool = getPool();

  try {
    for (const fileName of migrationFiles) {
      const filePath = path.join(migrationsDir, fileName);
      const sql = await readFile(filePath, 'utf8');
      console.log(`Applying ${fileName} ...`);
      await pool.query(sql);
      console.log(`Applied ${fileName}`);
    }
    console.log('Tüm migration dosyaları uygulandı.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[db:migrate] failed', error);
  process.exit(1);
});
