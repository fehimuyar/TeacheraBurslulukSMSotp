#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_TEAM = process.env.VERCEL_TEAM || 'ahmet-fehim-uyars-projects';
const DEFAULT_ENVIRONMENT = 'production';
const ROOT_ENV_FILE = '.env.production.local';

const PROJECTS = [
  {
    id: 'www',
    cwd: 'apps/www',
    projectName: 'teachera-www',
    envFileName: '.env.production.local',
  },
  {
    id: 'exam-api',
    cwd: 'apps/exam-api',
    projectName: 'teachera-exam-api',
    envFileName: '.env.production.local',
  },
  {
    id: 'panel-api',
    cwd: 'apps/panel-api',
    projectName: 'teachera-panel-api',
    envFileName: '.env.production.local',
  },
  {
    id: 'ops-api',
    cwd: 'apps/ops-api',
    projectName: 'teachera-ops-api',
    envFileName: '.env.production.local',
  },
];

const ROOT_SYNC_EXACT_SKIP_KEYS = new Set([
  'SERVICE_RUNTIME',
  'EXPECTED_SERVICE_HOST',
  'EXPECTED_SERVICE_HOSTS',
  'SERVICE_HOST_GUARD_MODE',
  'SERVICE_ROUTE_GUARD_MODE',
]);

const ROOT_SYNC_SKIP_PREFIXES = [
  'CORS_',
  'VERCEL_',
];

function trim(value) {
  return String(value ?? '').trim();
}

function parseArg(name, fallback = '') {
  const prefix = `${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) {
      return trim(arg.slice(prefix.length));
    }
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

function normalizeValue(value) {
  return String(value ?? '')
    .replace(/\\r/g, '')
    .replace(/\\n/g, '')
    .replace(/\r/g, '')
    .replace(/\n/g, '')
    .trim();
}

function parseDotenvLine(line) {
  const clean = trim(line);
  if (!clean || clean.startsWith('#')) return null;

  const normalized = clean.startsWith('export ') ? clean.slice(7) : clean;
  const eq = normalized.indexOf('=');
  if (eq < 1) return null;

  const key = trim(normalized.slice(0, eq));
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  let value = normalized.slice(eq + 1);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return { key, value: normalizeValue(value) };
}

function loadEnvMap(filePath) {
  if (!existsSync(filePath)) return {};

  const raw = readFileSync(filePath, 'utf8');
  const map = {};
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseDotenvLine(line);
    if (!parsed) continue;
    map[parsed.key] = parsed.value;
  }
  return map;
}

function escapeEnvValue(value) {
  const normalized = normalizeValue(value);
  if (/^[A-Za-z0-9_./:@%+,=?-]*$/.test(normalized)) {
    return normalized;
  }

  return JSON.stringify(normalized);
}

function renderEnvFile(map, headerLines = []) {
  const lines = [];
  for (const header of headerLines) {
    lines.push(header);
  }
  if (headerLines.length > 0) {
    lines.push('');
  }

  const keys = Object.keys(map).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    lines.push(`${key}=${escapeEnvValue(map[key])}`);
  }

  return `${lines.join('\n')}\n`;
}

function runVercel(args) {
  return execFileSync('npx', ['--yes', 'vercel', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function syncProjectEnv(project, { team, environment, skipLink }) {
  const envPath = resolve(ROOT, project.cwd, project.envFileName);
  mkdirSync(resolve(ROOT, project.cwd), { recursive: true });

  if (!skipLink) {
    runVercel([
      'link',
      '--yes',
      '--scope',
      team,
      '--project',
      project.projectName,
      '--cwd',
      project.cwd,
    ]);
  }

  const tempEnvPath = join(tmpdir(), `${project.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.env`);
  runVercel([
    'env',
    'pull',
    tempEnvPath,
    '--environment',
    environment,
    '--cwd',
    project.cwd,
  ]);

  const map = loadEnvMap(tempEnvPath);
  writeFileSync(
    envPath,
    renderEnvFile(map, [
      `# Synced from Vercel project ${project.projectName}`,
      `# Environment: ${environment}`,
    ]),
    'utf8',
  );

  return {
    ...project,
    envPath,
    keyCount: Object.keys(map).length,
    map,
  };
}

function shouldSyncKeyToRoot(key) {
  if (ROOT_SYNC_EXACT_SKIP_KEYS.has(key)) return false;
  return !ROOT_SYNC_SKIP_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function applyRootAliases(map) {
  if (trim(map.VITE_SITE_URL)) {
    map.WWW_BASE_URL = normalizeValue(map.VITE_SITE_URL);
  }

  if (trim(map.VITE_EXAM_API_BASE)) {
    map.EXAM_API_BASE_URL = normalizeValue(map.VITE_EXAM_API_BASE);
  }

  if (trim(map.VITE_PANEL_API_BASE)) {
    map.PANEL_API_BASE_URL = normalizeValue(map.VITE_PANEL_API_BASE);
  }

  if (!trim(map.WWW_BASE_URL)) {
    map.WWW_BASE_URL = 'https://teachera.com.tr';
  }
  if (!trim(map.EXAM_API_BASE_URL)) {
    map.EXAM_API_BASE_URL = 'https://exam-api.teachera.com.tr';
  }
  if (!trim(map.PANEL_API_BASE_URL)) {
    map.PANEL_API_BASE_URL = 'https://panel-api.teachera.com.tr';
  }
  if (!trim(map.OPS_API_BASE_URL)) {
    map.OPS_API_BASE_URL = 'https://ops-api.teachera.com.tr';
  }
}

function syncRootEnv(results, { rootEnvPath }) {
  const existingMap = loadEnvMap(rootEnvPath);
  const nextMap = { ...existingMap };

  for (const result of results) {
    for (const [key, value] of Object.entries(result.map)) {
      if (!shouldSyncKeyToRoot(key)) continue;
      nextMap[key] = value;
    }
  }

  applyRootAliases(nextMap);

  let backupPath = null;
  if (existsSync(rootEnvPath)) {
    backupPath = `${rootEnvPath}.bak-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
    renameSync(rootEnvPath, backupPath);
  }

  writeFileSync(
    rootEnvPath,
    renderEnvFile(nextMap, [
      '# Synced root production env for local scripts',
      `# Source projects: ${results.map((item) => item.projectName).join(', ')}`,
    ]),
    'utf8',
  );

  return {
    backupPath,
    keyCount: Object.keys(nextMap).length,
  };
}

function main() {
  const team = parseArg('--team', DEFAULT_TEAM);
  const environment = parseArg('--environment', DEFAULT_ENVIRONMENT);
  const skipLink = hasFlag('--skip-link');
  const rootEnvPath = resolve(ROOT, ROOT_ENV_FILE);

  const results = PROJECTS.map((project) => syncProjectEnv(project, {
    team,
    environment,
    skipLink,
  }));

  const rootResult = syncRootEnv(results, { rootEnvPath });

  const summary = {
    ok: true,
    team,
    environment,
    root_env_path: rootEnvPath,
    root_env_backup: rootResult.backupPath,
    root_key_count: rootResult.keyCount,
    projects: results.map((result) => ({
      id: result.id,
      project: result.projectName,
      cwd: result.cwd,
      env_path: result.envPath,
      key_count: result.keyCount,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
