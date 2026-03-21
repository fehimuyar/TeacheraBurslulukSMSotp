import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { DecryptCommand, KMSClient } from '@aws-sdk/client-kms';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GUIDELINES_DIR = join(ROOT, 'guidelines');

function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEnvToken(value) {
  const raw = safeTrim(value);
  if (!raw) return '';
  let normalized = raw
    .replace(/\\r/g, '')
    .replace(/\\n/g, '')
    .replace(/\r/g, '')
    .replace(/\n/g, '')
    .trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"'))
    || (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function asBool(value, fallback = false) {
  const normalized = safeTrim(value).toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function checkEnv() {
  const strictRaw = normalizeEnvToken(process.env.PII_CRYPTO_STRICT || 'true');
  const strict = asBool(strictRaw, true);
  const encryptedDataKey = normalizeEnvToken(process.env.PII_KMS_ENCRYPTED_DATA_KEY_B64);
  const lookupHmac = normalizeEnvToken(process.env.PII_LOOKUP_HMAC_KEY);
  const region = normalizeEnvToken(process.env.PII_KMS_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION);
  const keyId = normalizeEnvToken(process.env.PII_KMS_KEY_ID);

  const checks = [
    {
      id: 'pii_crypto_strict_enabled',
      ok: strict,
      detail: strict ? `PII_CRYPTO_STRICT=${strictRaw || 'true'}` : `PII_CRYPTO_STRICT=${strictRaw || '(empty)'}`,
    },
    {
      id: 'pii_lookup_hmac_key_present',
      ok: Boolean(lookupHmac),
      detail: lookupHmac ? 'PII_LOOKUP_HMAC_KEY is set.' : 'PII_LOOKUP_HMAC_KEY is missing.',
    },
    {
      id: 'pii_kms_encrypted_data_key_present',
      ok: Boolean(encryptedDataKey),
      detail: encryptedDataKey ? 'PII_KMS_ENCRYPTED_DATA_KEY_B64 is set.' : 'PII_KMS_ENCRYPTED_DATA_KEY_B64 is missing.',
    },
    {
      id: 'pii_kms_region_present',
      ok: Boolean(region),
      detail: region ? 'PII_KMS_REGION/AWS_REGION is set.' : 'PII_KMS_REGION/AWS_REGION is missing.',
    },
    {
      id: 'pii_kms_key_id_present',
      ok: Boolean(keyId),
      detail: keyId ? 'PII_KMS_KEY_ID is set.' : 'PII_KMS_KEY_ID is missing (optional but recommended).',
      warnOnly: true,
    },
  ];

  return { checks, strict };
}

async function runLocalKmsDecryptCheck() {
  const encryptedDataKey = normalizeEnvToken(process.env.PII_KMS_ENCRYPTED_DATA_KEY_B64);
  const region = normalizeEnvToken(process.env.PII_KMS_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION);
  const keyId = normalizeEnvToken(process.env.PII_KMS_KEY_ID);
  const envContext = normalizeEnvToken(process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown');

  if (!encryptedDataKey || !region) {
    return {
      id: 'kms_decrypt_data_key',
      ok: false,
      detail: 'Missing encrypted data key or region.',
      evidence: {},
    };
  }

  let ciphertext;
  try {
    ciphertext = Buffer.from(encryptedDataKey, 'base64');
  } catch {
    return {
      id: 'kms_decrypt_data_key',
      ok: false,
      detail: 'PII_KMS_ENCRYPTED_DATA_KEY_B64 is not valid base64.',
      evidence: {},
    };
  }

  const client = new KMSClient({ region });
  const contexts = [
    { app: 'teachera', scope: 'pii', env: envContext || 'unknown' },
    { app: 'teachera', scope: 'pii' },
  ];

  let lastError = null;
  for (let i = 0; i < contexts.length; i += 1) {
    const context = contexts[i];
    try {
      const output = await client.send(new DecryptCommand({
        CiphertextBlob: ciphertext,
        ...(keyId ? { KeyId: keyId } : {}),
        EncryptionContext: context,
      }));
      const plaintext = Buffer.from(output?.Plaintext || []);
      const ok = plaintext.length === 32;
      return {
        id: 'kms_decrypt_data_key',
        ok,
        detail: ok
          ? `KMS decrypt succeeded with context #${i + 1}.`
          : `KMS decrypt returned unexpected plaintext length=${plaintext.length}.`,
        evidence: {
          context,
          plaintext_length: plaintext.length,
        },
      };
    } catch (error) {
      lastError = error;
      const errName = safeTrim(error?.name || error?.Code || error?.code);
      if (errName === 'InvalidCiphertextException' && i < contexts.length - 1) {
        continue;
      }
      break;
    }
  }

  const errName = safeTrim(lastError?.name || lastError?.Code || lastError?.code) || 'kms_error';
  const errMsg = safeTrim(lastError?.message);
  return {
    id: 'kms_decrypt_data_key',
    ok: false,
    detail: `${errName}${errMsg ? `: ${errMsg}` : ''}`,
    evidence: {},
  };
}

function buildSmokePayload() {
  const now = Date.now();
  const identityNo = String(90000000000 + (now % 999999999)).slice(0, 11).padEnd(11, '0');
  return {
    studentFullName: `PII Preflight Student ${now.toString().slice(-4)}`,
    parentFullName: `PII Preflight Parent ${now.toString().slice(-4)}`,
    identityNo,
    birthYear: 2013,
    parentPhoneE164: `+90530${String(now).slice(-7)}`,
    schoolName: 'PII Preflight School',
    grade: 8,
    section: '8-A',
    selectedExamAt: '2026-03-28T10:00:00.000Z',
    ageRange: '13-17',
    language: 'en',
    source: 'p0_pii_crypto_preflight',
    campaignCode: safeTrim(process.env.DEFAULT_CAMPAIGN_CODE) || '2026_BURSLULUK',
    questionCount: 40,
    consent: {
      kvkkApproved: true,
      contactConsent: true,
      consentVersion: 'KVKK_v1_2026-03-13',
      legalTextVersion: 'KVKK_v1_2026-03-13',
      source: 'p0_pii_crypto_preflight',
    },
  };
}

async function runApiPreflight() {
  const examBase = normalizeEnvToken(process.env.EXAM_API_BASE_URL) || 'https://exam-api.teachera.com.tr';
  const endpoint = `${examBase.replace(/\/$/, '')}/api/exam/session/start`;
  const payload = buildSmokePayload();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    const errorCode = safeTrim(body?.error || body?.code || body?.message);

    if (response.ok) {
      return {
        id: 'exam_api_start_pii_runtime',
        ok: true,
        detail: `HTTP ${response.status} (session start succeeded).`,
        evidence: {
          status: response.status,
          attempt_id: safeTrim(body?.session?.attemptId) || null,
        },
      };
    }

    const piiNotConfigured = response.status === 503 && errorCode === 'pii_crypto_not_configured';
    return {
      id: 'exam_api_start_pii_runtime',
      ok: !piiNotConfigured,
      detail: `HTTP ${response.status}${errorCode ? ` ${errorCode}` : ''}`,
      evidence: {
        status: response.status,
        error: errorCode || null,
      },
    };
  } catch (error) {
    return {
      id: 'exam_api_start_pii_runtime',
      ok: false,
      detail: `network_error: ${error?.message || String(error)}`,
      evidence: {},
    };
  }
}

function toMarkdown(summary) {
  const lines = [];
  lines.push('# P0 PII Crypto Preflight');
  lines.push('');
  lines.push(`- Generated (UTC): ${summary.generated_at_utc}`);
  lines.push(`- Status: ${summary.ok ? 'PASS' : 'FAIL'}`);
  lines.push('');
  lines.push('## Checks');
  lines.push('');
  for (const check of summary.checks) {
    lines.push(`- ${check.id}: ${check.ok ? 'PASS' : 'FAIL'} (${check.detail})`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const envResult = checkEnv();
  const [kmsCheck, apiCheck] = await Promise.all([
    runLocalKmsDecryptCheck(),
    runApiPreflight(),
  ]);
  const checks = [...envResult.checks, kmsCheck, apiCheck];

  const ok = checks.every((check) => check.ok || check.warnOnly === true);
  const summary = {
    ok,
    generated_at_utc: new Date().toISOString(),
    checks,
  };

  await mkdir(GUIDELINES_DIR, { recursive: true });
  await writeFile(
    join(GUIDELINES_DIR, 'p0-pii-crypto-preflight-latest.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    join(GUIDELINES_DIR, 'p0-pii-crypto-preflight-latest.md'),
    `${toMarkdown(summary)}\n`,
    'utf8',
  );

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[p0-pii-crypto-preflight] failed', error?.message || String(error));
  process.exit(1);
});
