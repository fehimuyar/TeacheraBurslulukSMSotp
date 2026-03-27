import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { HttpError } from './errors.js';
import { safeTrim } from './http.js';

let scholarshipObjectStorageClient = null;

function readConfig() {
  const bucket = safeTrim(process.env.SCHOLARSHIP_EXAM_S3_BUCKET);
  const region = safeTrim(process.env.SCHOLARSHIP_EXAM_S3_REGION || process.env.AWS_REGION || 'eu-central-1');
  const endpoint = safeTrim(process.env.SCHOLARSHIP_EXAM_S3_ENDPOINT);
  const keyPrefix = safeTrim(process.env.SCHOLARSHIP_EXAM_S3_KEY_PREFIX || 'scholarship-exam');
  const forcePathStyle = ['1', 'true', 'yes', 'on'].includes(
    safeTrim(process.env.SCHOLARSHIP_EXAM_S3_FORCE_PATH_STYLE).toLowerCase(),
  );

  return {
    enabled: Boolean(bucket),
    bucket,
    region,
    endpoint: endpoint || undefined,
    keyPrefix: keyPrefix || 'scholarship-exam',
    forcePathStyle,
  };
}

function readClient() {
  const config = readConfig();
  if (!config.enabled) return null;
  if (!scholarshipObjectStorageClient) {
    scholarshipObjectStorageClient = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
    });
  }
  return scholarshipObjectStorageClient;
}

function sanitizeSegment(value) {
  return safeTrim(value).replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function extensionForMimeType(mimeType) {
  const normalized = safeTrim(mimeType).toLowerCase();
  if (normalized === 'audio/mp4' || normalized === 'audio/mp4;codecs=mp4a.40.2') return 'm4a';
  if (normalized === 'audio/webm' || normalized === 'audio/webm;codecs=opus') return 'webm';
  if (normalized === 'audio/aac') return 'aac';
  if (normalized === 'audio/wav' || normalized === 'audio/wave' || normalized === 'audio/x-wav') return 'wav';
  return 'bin';
}

export function isScholarshipObjectStorageEnabled() {
  return readConfig().enabled;
}

export function buildScholarshipSpeakingObjectKey({ attemptId, questionId, responseId, mimeType }) {
  const config = readConfig();
  return [
    config.keyPrefix,
    sanitizeSegment(attemptId),
    sanitizeSegment(questionId),
    `${sanitizeSegment(responseId)}.${extensionForMimeType(mimeType)}`,
  ].join('/');
}

export function buildScholarshipSpeakingStorageKey({ objectKey }) {
  const config = readConfig();
  if (!config.enabled) {
    throw new Error('scholarship_object_storage_not_configured');
  }
  return `s3://${config.bucket}/${objectKey}`;
}

export function parseScholarshipSpeakingStorageKey(storageKey) {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(safeTrim(storageKey));
  if (!match) return null;
  return {
    bucket: match[1],
    key: match[2],
  };
}

export async function createScholarshipSpeakingUploadTarget({
  attemptId,
  questionId,
  responseId,
  mimeType,
  byteSize,
  expiresInSeconds = 900,
}) {
  const client = readClient();
  const config = readConfig();
  if (!client || !config.enabled) {
    throw new Error('scholarship_object_storage_not_configured');
  }

  const objectKey = buildScholarshipSpeakingObjectKey({
    attemptId,
    questionId,
    responseId,
    mimeType,
  });

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    ContentType: mimeType,
    ContentLength: byteSize,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });

  return {
    storageKey: buildScholarshipSpeakingStorageKey({ objectKey }),
    uploadUrl,
    uploadMethod: 'PUT',
    uploadHeaders: {
      'Content-Type': mimeType,
    },
  };
}

export async function assertScholarshipSpeakingObjectUploaded({ storageKey, byteSize, mimeType }) {
  const client = readClient();
  const parsed = parseScholarshipSpeakingStorageKey(storageKey);
  if (!client || !parsed) {
    throw new Error('scholarship_object_storage_not_configured');
  }

  const response = await client.send(
    new HeadObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.key,
    }),
  );

  const contentLength = Number(response.ContentLength || 0);
  if (Number.isFinite(byteSize) && byteSize > 0 && contentLength !== byteSize) {
    throw new HttpError(409, 'Stored speaking audio size does not match the completed upload.', 'speaking_object_size_mismatch', {
      expected_byte_size: byteSize,
      actual_byte_size: contentLength,
    });
  }

  const storedMimeType = safeTrim(response.ContentType);
  if (mimeType && storedMimeType && safeTrim(mimeType).toLowerCase() !== storedMimeType.toLowerCase()) {
    throw new HttpError(409, 'Stored speaking audio mimeType does not match the completed upload.', 'speaking_object_mime_mismatch', {
      expected_mime_type: mimeType,
      actual_mime_type: storedMimeType,
    });
  }

  return {
    contentType: storedMimeType || mimeType || 'application/octet-stream',
    contentLength,
  };
}

async function bodyToBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (typeof body.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray());
  }

  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function downloadScholarshipSpeakingObject(storageKey) {
  const client = readClient();
  const parsed = parseScholarshipSpeakingStorageKey(storageKey);
  if (!client || !parsed) {
    throw new Error('scholarship_object_storage_not_configured');
  }

  const response = await client.send(
    new GetObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.key,
    }),
  );

  return {
    buffer: await bodyToBuffer(response.Body),
    contentType: safeTrim(response.ContentType) || 'application/octet-stream',
    contentLength: Number(response.ContentLength || 0),
  };
}
