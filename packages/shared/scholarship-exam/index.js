import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHOLARSHIP_EXAM_PUBLIC_ROOT = '/bursluluk-exam';
export const SCHOLARSHIP_EXAM_CONTENT_ROOT = `${SCHOLARSHIP_EXAM_PUBLIC_ROOT}/content`;
export const SCHOLARSHIP_EXAM_SHARED_SHELL_ROOT = `${SCHOLARSHIP_EXAM_PUBLIC_ROOT}/shared-shell`;

export const SCHOLARSHIP_EXAM_PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SCHOLARSHIP_EXAM_CONTENT_DIR = path.join(SCHOLARSHIP_EXAM_PACKAGE_DIR, 'content');
export const SCHOLARSHIP_EXAM_SHARED_SHELL_DIR = path.join(SCHOLARSHIP_EXAM_PACKAGE_DIR, 'shared-shell');
export const SCHOLARSHIP_EXAM_STYLE_FILE = path.join(SCHOLARSHIP_EXAM_PACKAGE_DIR, 'styles.css');

const SCHOLARSHIP_EXAM_INDEX_FILE = path.join(SCHOLARSHIP_EXAM_CONTENT_DIR, 'index.json');

let scholarshipExamIndexCache = null;
const scholarshipExamJsonCache = new Map();

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJsonFile(filePath) {
  const cached = scholarshipExamJsonCache.get(filePath);
  if (cached) return cloneValue(cached);

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  scholarshipExamJsonCache.set(filePath, parsed);
  return cloneValue(parsed);
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function readScholarshipExamIndex() {
  if (!scholarshipExamIndexCache) {
    scholarshipExamIndexCache = readJsonFile(SCHOLARSHIP_EXAM_INDEX_FILE);
  }
  return cloneValue(scholarshipExamIndexCache);
}

export function normalizeScholarshipGradeNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 2 && value <= 11 ? Math.trunc(value) : null;
  }

  const raw = normalizeText(value);
  if (!raw) return null;

  const gradeMatch = /^grade-(\d{2})$/i.exec(raw);
  const parsed = Number.parseInt(gradeMatch ? gradeMatch[1] : raw, 10);
  if (!Number.isFinite(parsed) || parsed < 2 || parsed > 11) {
    return null;
  }
  return parsed;
}

export function formatScholarshipGradeKey(value) {
  const gradeNumber = normalizeScholarshipGradeNumber(value);
  if (!gradeNumber) return '';
  return `grade-${String(gradeNumber).padStart(2, '0')}`;
}

export function parseScholarshipExamBankKey(value) {
  const raw = normalizeText(value);
  const match = /^([a-z0-9-]+):((?:grade)-\d{2})$/i.exec(raw);
  if (!match) return null;
  return {
    examVersionKey: match[1],
    grade: match[2].toLowerCase(),
  };
}

export function isScholarshipExamBankKey(value) {
  return Boolean(parseScholarshipExamBankKey(value));
}

export function listScholarshipExamDescriptors() {
  return readScholarshipExamIndex().grades.map((descriptor) => ({
    ...descriptor,
    bankKey: `${descriptor.examVersionKey}:${descriptor.grade}`,
  }));
}

export function resolveScholarshipExamDescriptor(input) {
  const registry = readScholarshipExamIndex();
  const descriptorList = registry.grades || [];
  const parsedBankKey = typeof input === 'string' ? parseScholarshipExamBankKey(input) : parseScholarshipExamBankKey(input?.bankKey);

  if (parsedBankKey) {
    const byBankKey = descriptorList.find(
      (descriptor) =>
        descriptor.examVersionKey === parsedBankKey.examVersionKey
        && descriptor.grade === parsedBankKey.grade,
    );
    if (byBankKey) {
      return {
        ...cloneValue(byBankKey),
        bankKey: `${byBankKey.examVersionKey}:${byBankKey.grade}`,
      };
    }
  }

  const gradeKey = formatScholarshipGradeKey(
    typeof input === 'string'
      ? input
      : input?.grade ?? input?.gradeKey ?? input?.gradeNumber,
  );
  if (!gradeKey) return null;

  const requestedExamVersionKey = normalizeText(
    typeof input === 'object' && input ? input.examVersionKey : '',
  );
  const descriptor = descriptorList.find(
    (candidate) =>
      candidate.grade === gradeKey
      && (!requestedExamVersionKey || candidate.examVersionKey === requestedExamVersionKey),
  );

  if (!descriptor) return null;
  return {
    ...cloneValue(descriptor),
    bankKey: `${descriptor.examVersionKey}:${descriptor.grade}`,
  };
}

export function resolveScholarshipPublicContentPath(input) {
  const descriptor = resolveScholarshipExamDescriptor(input);
  if (!descriptor) return null;
  return `${SCHOLARSHIP_EXAM_CONTENT_ROOT}/${descriptor.grade}/${descriptor.files.publicAssessment}`;
}

export function resolveScholarshipAssetBaseUrl(input) {
  const descriptor = resolveScholarshipExamDescriptor(input);
  if (!descriptor) return null;
  return `${SCHOLARSHIP_EXAM_CONTENT_ROOT}/${descriptor.grade}`;
}

export function resolveScholarshipSharedShellBaseUrl() {
  return SCHOLARSHIP_EXAM_SHARED_SHELL_ROOT;
}

export function resolveScholarshipPublicContentFile(input) {
  const descriptor = resolveScholarshipExamDescriptor(input);
  if (!descriptor) return null;
  return path.join(SCHOLARSHIP_EXAM_CONTENT_DIR, descriptor.grade, descriptor.files.publicAssessment);
}

export function resolveScholarshipFullContentFile(input) {
  const descriptor = resolveScholarshipExamDescriptor(input);
  if (!descriptor) return null;
  return path.join(SCHOLARSHIP_EXAM_CONTENT_DIR, descriptor.grade, descriptor.files.fullAssessment);
}

export function loadScholarshipExamPublicContent(input) {
  const filePath = resolveScholarshipPublicContentFile(input);
  if (!filePath || !fs.existsSync(filePath)) return null;
  return readJsonFile(filePath);
}

export function loadScholarshipExamFullContent(input) {
  const filePath = resolveScholarshipFullContentFile(input);
  if (!filePath || !fs.existsSync(filePath)) return null;
  return readJsonFile(filePath);
}
