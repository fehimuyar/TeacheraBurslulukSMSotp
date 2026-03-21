import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { DecryptCommand, KMSClient } from '@aws-sdk/client-kms';
import { HttpError } from './errors.js';
import { safeTrim } from './http.js';

const PII_VERSION = 1;
const AAD = Buffer.from('teachera-pii-v1');
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let kmsClient = null;
let dataKeyPromise = null;

function normalizePiiString(value, maxLength = 300) {
  const trimmed = safeTrim(value);
  if (!trimmed) return '';
  return trimmed.slice(0, maxLength);
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

function normalizeLookupSource(value) {
  return safeTrim(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function readAwsRegion() {
  return (
    normalizeEnvToken(process.env.PII_KMS_REGION) ||
    normalizeEnvToken(process.env.AWS_REGION) ||
    normalizeEnvToken(process.env.AWS_DEFAULT_REGION)
  );
}

function readEncryptedDataKeyB64() {
  return normalizeEnvToken(process.env.PII_KMS_ENCRYPTED_DATA_KEY_B64);
}

function readKmsKeyId() {
  return normalizeEnvToken(process.env.PII_KMS_KEY_ID);
}

function readLookupHmacKey() {
  return normalizeEnvToken(process.env.PII_LOOKUP_HMAC_KEY);
}

function readEnvContextValue() {
  return normalizeEnvToken(process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown');
}

function buildDecryptContexts() {
  const base = {
    app: 'teachera',
    scope: 'pii',
  };
  const envValue = readEnvContextValue();
  if (!envValue) {
    return [base];
  }
  return [
    {
      ...base,
      env: envValue,
    },
    base,
  ];
}

function isInvalidCiphertextError(error) {
  const name = safeTrim(error?.name || error?.Code || error?.code || error?.__type);
  return name === 'InvalidCiphertextException';
}

function isPiiCryptoStrict() {
  const raw = safeTrim(process.env.PII_CRYPTO_STRICT || 'true').toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(raw);
}

function ensureKmsClient() {
  if (!kmsClient) {
    const region = readAwsRegion();
    if (!region) {
      throw new Error('PII_KMS_REGION/AWS_REGION is required.');
    }
    kmsClient = new KMSClient({ region });
  }
  return kmsClient;
}

function assertConfigured() {
  const encryptedKey = readEncryptedDataKeyB64();
  const lookupKey = readLookupHmacKey();
  if (!encryptedKey || !lookupKey) {
    throw new Error('PII crypto configuration is missing.');
  }
}

function toConfigError() {
  return new HttpError(
    503,
    'PII crypto is not configured.',
    'pii_crypto_not_configured',
  );
}

async function resolveDataKey() {
  assertConfigured();
  const encryptedKey = Buffer.from(readEncryptedDataKeyB64(), 'base64');
  if (!Buffer.isBuffer(encryptedKey) || encryptedKey.length === 0) {
    throw new Error('PII encrypted key is invalid base64.');
  }

  const contexts = buildDecryptContexts();
  let lastError = null;

  for (let index = 0; index < contexts.length; index += 1) {
    const context = contexts[index];
    try {
      const command = new DecryptCommand({
        CiphertextBlob: encryptedKey,
        ...(readKmsKeyId() ? { KeyId: readKmsKeyId() } : {}),
        EncryptionContext: context,
      });
      const output = await ensureKmsClient().send(command);
      const plaintext = Buffer.from(output?.Plaintext || []);
      if (plaintext.length !== 32) {
        throw new Error(`Expected 32-byte PII data key, got ${plaintext.length}`);
      }
      return plaintext;
    } catch (error) {
      lastError = error;
      // Backward compatibility: older data-keys may have been generated
      // without env-bound encryption context.
      if (isInvalidCiphertextError(error) && index < contexts.length - 1) {
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('Failed to resolve PII data key.');
}

async function getDataKey() {
  if (!dataKeyPromise) {
    dataKeyPromise = resolveDataKey().catch((error) => {
      dataKeyPromise = null;
      throw error;
    });
  }
  return dataKeyPromise;
}

function maybeThrowConfigError(error) {
  if (isPiiCryptoStrict()) {
    console.error('[pii_crypto_config_error]', error);
    throw toConfigError();
  }
  return null;
}

function normalizeCipherBuffer(cipherValue) {
  if (!cipherValue) return null;
  if (Buffer.isBuffer(cipherValue)) return cipherValue;
  if (cipherValue?.type === 'Buffer' && Array.isArray(cipherValue?.data)) {
    return Buffer.from(cipherValue.data);
  }
  if (typeof cipherValue === 'string') {
    try {
      return Buffer.from(cipherValue, 'base64');
    } catch {
      return null;
    }
  }
  return null;
}

export function computePiiLookupHash(value) {
  const lookupKey = readLookupHmacKey();
  if (!lookupKey) {
    maybeThrowConfigError(new Error('PII_LOOKUP_HMAC_KEY is missing.'));
    return '';
  }
  return createHmac('sha256', lookupKey).update(normalizeLookupSource(value)).digest('hex');
}

export async function encryptPii(value, maxLength = 300) {
  const normalized = normalizePiiString(value, maxLength);
  if (!normalized) return null;

  let dataKey;
  try {
    dataKey = await getDataKey();
  } catch (error) {
    maybeThrowConfigError(error);
    return null;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([PII_VERSION]), iv, authTag, encrypted]);
}

export async function decryptPii(cipherValue, fallbackPlain = '') {
  const cipherBuffer = normalizeCipherBuffer(cipherValue);
  if (!cipherBuffer || cipherBuffer.length === 0) {
    return normalizePiiString(fallbackPlain, 300) || null;
  }

  let dataKey;
  try {
    dataKey = await getDataKey();
  } catch (error) {
    maybeThrowConfigError(error);
    return normalizePiiString(fallbackPlain, 300) || null;
  }

  if (cipherBuffer.length <= 1 + IV_LENGTH + AUTH_TAG_LENGTH) {
    return normalizePiiString(fallbackPlain, 300) || null;
  }

  const version = cipherBuffer.readUInt8(0);
  if (version !== PII_VERSION) {
    return normalizePiiString(fallbackPlain, 300) || null;
  }

  try {
    const iv = cipherBuffer.subarray(1, 1 + IV_LENGTH);
    const authTag = cipherBuffer.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = cipherBuffer.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', dataKey, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    return normalizePiiString(plain, 300) || null;
  } catch {
    return normalizePiiString(fallbackPlain, 300) || null;
  }
}

export function isPrivilegedPiiRole(role) {
  const normalized = safeTrim(role).toUpperCase();
  return normalized === 'SUPER_ADMIN' || normalized === 'OPERATIONS';
}

function maskMiddle(value, keepStart = 1, keepEnd = 1) {
  const normalized = safeTrim(value);
  if (!normalized) return '';
  if (normalized.length <= keepStart + keepEnd) return '*'.repeat(Math.max(normalized.length, 1));
  const middleLength = normalized.length - (keepStart + keepEnd);
  return `${normalized.slice(0, keepStart)}${'*'.repeat(middleLength)}${normalized.slice(-keepEnd)}`;
}

export function maskPiiName(value) {
  const normalized = safeTrim(value);
  if (!normalized) return '';
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.map((part) => maskMiddle(part, 1, 0)).join(' ');
}

export function maskPiiPhone(value) {
  const normalized = safeTrim(value);
  if (!normalized) return '';
  const digits = normalized.replace(/\D+/g, '');
  if (digits.length < 4) return maskMiddle(normalized, 1, 0);
  return `***${digits.slice(-4)}`;
}

export function maskPiiEmail(value) {
  const normalized = safeTrim(value).toLowerCase();
  if (!normalized || !normalized.includes('@')) return '';
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return '';
  const [domainName, ...rest] = domain.split('.');
  const suffix = rest.length > 0 ? `.${rest.join('.')}` : '';
  return `${maskMiddle(local, 1, 0)}@${maskMiddle(domainName, 1, 0)}${suffix}`;
}
