// AUTO-GENERATED FROM packages/shared/backend. DO NOT EDIT DIRECTLY.
import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './errors.js';
import { safeTrim } from './http.js';

const CONTENT_ROOT_CANDIDATES = [
  '../../content/bursluluk-exam',
  '../../apps/exam-api/content/bursluluk-exam',
];

const contentIndexCache = new Map();
const fullAssessmentCache = new Map();
const S3_SIGNED_URL_TTL_SECONDS = 15 * 60;

function roundScore(value, max = 100) {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(max, Number(parsed.toFixed(2))));
}

function encodeRfc3986(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeS3PathSegment(value) {
  return encodeRfc3986(value).replace(/%2F/g, '/');
}

function formatAmzDateParts(inputDate = new Date()) {
  const iso = inputDate.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    shortDate: iso.slice(0, 8),
  };
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function signHmac(key, value, encoding) {
  const hmac = createHmac('sha256', key).update(value);
  return encoding ? hmac.digest(encoding) : hmac.digest();
}

function deriveSigningKey(secretAccessKey, shortDate, region, service = 's3') {
  const kDate = signHmac(`AWS4${secretAccessKey}`, shortDate);
  const kRegion = signHmac(kDate, region);
  const kService = signHmac(kRegion, service);
  return signHmac(kService, 'aws4_request');
}

function resolveMimeExtension(mimeType) {
  const normalized = safeTrim(mimeType).toLowerCase();
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('mp4')) return 'mp4';
  if (normalized.includes('mpeg')) return 'mp3';
  if (normalized.includes('aac')) return 'aac';
  if (normalized.includes('wav')) return 'wav';
  return 'bin';
}

function readAwsSigningConfig() {
  const bucket = safeTrim(process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME);
  const region = safeTrim(process.env.AWS_REGION || process.env.S3_REGION || 'eu-central-1');
  const accessKeyId = safeTrim(process.env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = safeTrim(process.env.AWS_SECRET_ACCESS_KEY);
  const sessionToken = safeTrim(process.env.AWS_SESSION_TOKEN);

  if (!bucket) {
    throw new HttpError(500, 'S3_BUCKET_NAME env is required for speaking uploads.', 'missing_s3_bucket');
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new HttpError(500, 'AWS signing credentials are required for speaking uploads.', 'missing_aws_credentials');
  }

  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken: sessionToken || null,
  };
}

export function normalizeBurslulukGrade(raw, fallback = 8) {
  const numeric = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(12, numeric));
}

export function mapDisplayedGradeToContentGrade(displayedGrade) {
  const normalized = normalizeBurslulukGrade(displayedGrade);
  if (normalized <= 1) return 2;
  if (normalized >= 12) return 11;
  return normalized;
}

export function resolveContentGradeKey(displayedGrade) {
  const contentGrade = mapDisplayedGradeToContentGrade(displayedGrade);
  return `grade-${String(contentGrade).padStart(2, '0')}`;
}

export function resolveRankingGroup(displayedGrade) {
  const normalized = normalizeBurslulukGrade(displayedGrade);
  return `grade-${String(normalized).padStart(2, '0')}`;
}

export function buildStorageKey({ campaignCode, attemptId, questionId, responseId, mimeType }) {
  const extension = resolveMimeExtension(mimeType);
  return [
    'bursluluk-speaking',
    safeTrim(campaignCode) || 'unknown-campaign',
    safeTrim(attemptId),
    safeTrim(questionId),
    `${safeTrim(responseId)}.${extension}`,
  ].join('/');
}

export function buildSignedS3ObjectUrl({
  storageKey,
  method = 'GET',
  mimeType = null,
  expiresSeconds = S3_SIGNED_URL_TTL_SECONDS,
}) {
  const {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken,
  } = readAwsSigningConfig();
  const normalizedMethod = safeTrim(method).toUpperCase() || 'GET';
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const encodedKey = encodeS3PathSegment(storageKey);
  const now = new Date();
  const { amzDate, shortDate } = formatAmzDateParts(now);
  const credentialScope = `${shortDate}/${region}/s3/aws4_request`;
  const baseQuery = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  });

  if (sessionToken) {
    baseQuery.set('X-Amz-Security-Token', sessionToken);
  }

  const canonicalQueryString = [...baseQuery.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');

  const canonicalRequest = [
    normalizedMethod,
    `/${encodedKey}`,
    canonicalQueryString,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signature = signHmac(
    deriveSigningKey(secretAccessKey, shortDate, region),
    stringToSign,
    'hex',
  );

  return {
    url: `https://${host}/${encodedKey}?${canonicalQueryString}&X-Amz-Signature=${signature}`,
    method: normalizedMethod,
    headers: mimeType ? { 'Content-Type': mimeType } : {},
    expiresAt: new Date(now.getTime() + expiresSeconds * 1000).toISOString(),
  };
}

export async function resolveBurslulukContentRoot() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  for (const relativePath of CONTENT_ROOT_CANDIDATES) {
    const candidate = path.resolve(currentDir, relativePath);
    try {
      await access(candidate, fsConstants.R_OK);
      return candidate;
    } catch {
      // Continue until a readable content root is found.
    }
  }
  throw new HttpError(500, 'Bursluluk content directory was not found.', 'missing_bursluluk_content');
}

export async function loadBurslulukContentIndex() {
  const root = await resolveBurslulukContentRoot();
  const cacheKey = `${root}:index`;
  if (contentIndexCache.has(cacheKey)) {
    return contentIndexCache.get(cacheKey);
  }

  const payload = JSON.parse(await readFile(path.join(root, 'index.json'), 'utf8'));
  contentIndexCache.set(cacheKey, payload);
  return payload;
}

export async function loadFullAssessmentForGrade(displayedGrade) {
  const root = await resolveBurslulukContentRoot();
  const gradeKey = resolveContentGradeKey(displayedGrade);
  const cacheKey = `${root}:${gradeKey}`;
  if (fullAssessmentCache.has(cacheKey)) {
    return fullAssessmentCache.get(cacheKey);
  }

  const payload = JSON.parse(
    await readFile(path.join(root, gradeKey, 'assessment.full.json'), 'utf8'),
  );
  fullAssessmentCache.set(cacheKey, payload);
  return payload;
}

export function calculateObjectiveScore80(content, objectiveAnswers) {
  const questionMap = new Map(
    (content?.questions || [])
      .filter((question) => question.type !== 'speaking' && question.correctOptionId)
      .map((question) => [question.id, question]),
  );

  const sectionWeightTotals = new Map();
  for (const question of questionMap.values()) {
    const current = Number(sectionWeightTotals.get(question.section) || 0);
    sectionWeightTotals.set(question.section, current + Number(question.difficultyWeight || 0));
  }

  let score = 0;
  let correctCount = 0;
  let answeredCount = 0;
  const selectedMap = objectiveAnswers instanceof Map
    ? objectiveAnswers
    : new Map(Object.entries(objectiveAnswers || {}));

  for (const question of questionMap.values()) {
    const selected = selectedMap.get(question.id) ?? null;
    if (!selected) continue;
    answeredCount += 1;
    if (selected !== question.correctOptionId) continue;
    correctCount += 1;
    const sectionMax = Number(content?.scoring?.sectionPoints?.[question.section] || 0);
    const sectionWeightTotal = Number(sectionWeightTotals.get(question.section) || 0);
    if (sectionMax > 0 && sectionWeightTotal > 0) {
      score += (sectionMax * Number(question.difficultyWeight || 0)) / sectionWeightTotal;
    }
  }

  const objectiveQuestionCount = questionMap.size;
  const wrongCount = Math.max(0, answeredCount - correctCount);
  const unansweredCount = Math.max(0, objectiveQuestionCount - answeredCount);

  return {
    score80: roundScore(score, 80),
    answeredCount,
    correctCount,
    wrongCount,
    unansweredCount,
    objectiveQuestionCount,
    speakingQuestionCount: (content?.questions || []).filter((question) => question.type === 'speaking').length,
  };
}

export function normalizeSpeakingScore20(value) {
  return roundScore(value, 20);
}

export function computeFinalScore100(objectiveScore80, speakingScore20) {
  if (objectiveScore80 === null || objectiveScore80 === undefined) return null;
  if (speakingScore20 === null || speakingScore20 === undefined) return null;
  return roundScore(Number(objectiveScore80) + Number(speakingScore20), 100);
}

export function computeBursLabel(finalScore100, rankingPosition) {
  if (rankingPosition === 1) return '%100 Burs';
  if (rankingPosition === 2) return '%80 Burs';
  if (rankingPosition === 3 || rankingPosition === 4) return '%70 Burs';

  const score = roundScore(finalScore100, 100);
  if (score >= 90) return '%60 Burs';
  if (score >= 80) return '%50 Burs';
  if (score >= 70) return '%40 Burs';
  return '%20 Katılım Bursu';
}

export function computeRankingTable(rows) {
  const grouped = new Map();
  for (const row of rows || []) {
    const rankingGroup = resolveRankingGroup(row.grade);
    if (!grouped.has(rankingGroup)) grouped.set(rankingGroup, []);
    grouped.get(rankingGroup).push({
      attemptId: row.attemptId,
      grade: normalizeBurslulukGrade(row.grade),
      objectiveScore80: roundScore(row.objectiveScore80, 80),
      speakingScore20: roundScore(row.speakingScore20, 20),
      finalScore100: roundScore(row.finalScore100, 100),
      submittedAt: row.submittedAt ? new Date(row.submittedAt).toISOString() : new Date(0).toISOString(),
    });
  }

  const result = [];
  for (const [rankingGroup, groupRows] of grouped.entries()) {
    const sorted = [...groupRows].sort((left, right) => {
      if (right.finalScore100 !== left.finalScore100) return right.finalScore100 - left.finalScore100;
      if (right.objectiveScore80 !== left.objectiveScore80) return right.objectiveScore80 - left.objectiveScore80;
      if (right.speakingScore20 !== left.speakingScore20) return right.speakingScore20 - left.speakingScore20;
      if (left.submittedAt !== right.submittedAt) return left.submittedAt.localeCompare(right.submittedAt);
      return String(left.attemptId).localeCompare(String(right.attemptId));
    });

    const total = sorted.length;
    sorted.forEach((row, index) => {
      result.push({
        attemptId: row.attemptId,
        rankingGroup,
        rankingPosition: index + 1,
        rankingTotal: total,
        placementLabel: computeBursLabel(row.finalScore100, index + 1),
      });
    });
  }
  return result;
}

export function buildSpeakingUploadInitResponse({
  campaignCode,
  attemptId,
  questionId,
  mimeType,
  expiresSeconds = S3_SIGNED_URL_TTL_SECONDS,
}) {
  const responseId = randomUUID();
  const storageKey = buildStorageKey({
    campaignCode,
    attemptId,
    questionId,
    responseId,
    mimeType,
  });
  const signedRequest = buildSignedS3ObjectUrl({
    storageKey,
    method: 'PUT',
    mimeType,
    expiresSeconds,
  });

  return {
    responseId,
    storageKey,
    uploadUrl: signedRequest.url,
    uploadMethod: signedRequest.method,
    uploadHeaders: signedRequest.headers,
    expiresAt: signedRequest.expiresAt,
  };
}
