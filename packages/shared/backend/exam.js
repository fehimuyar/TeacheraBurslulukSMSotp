import { randomUUID, createHash } from 'node:crypto';
import { HttpError } from './errors.js';
import { readExamSessionTtlMinutes } from './env.js';
import { safeTrim } from './http.js';

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createSessionToken() {
  return randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
}

export function buildSessionExpiry() {
  const ttlMinutes = readExamSessionTtlMinutes();
  return new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
}

export function normalizeSubmissionStatus(raw) {
  const value = safeTrim(raw).toLowerCase();
  if (value === 'completed') return 'SUBMITTED';
  if (value === 'time_limit_reached') return 'TIMEOUT';
  if (value === 'left_exam') return 'ABANDONED';
  throw new HttpError(400, 'Invalid submission status.', 'invalid_submission_status');
}

export function normalizeGrade(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const grade = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(grade)) {
    throw new HttpError(400, 'Grade must be numeric.', 'invalid_grade');
  }
  if (grade < 1 || grade > 12) {
    throw new HttpError(400, 'Grade must be between 1 and 12.', 'grade_out_of_range');
  }
  return grade;
}

export function requireString(value, fieldName, maxLength = 250) {
  const trimmed = safeTrim(value);
  if (!trimmed) {
    throw new HttpError(400, `${fieldName} is required.`, 'validation_failed', { field: fieldName });
  }
  return trimmed.slice(0, maxLength);
}

export function optionalString(value, maxLength = 250) {
  const trimmed = safeTrim(value);
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export function normalizePhoneE164(value) {
  const raw = safeTrim(value);
  if (!raw) return null;
  const compact = raw.replace(/[\s\-().]/g, '');
  let normalized = compact;

  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  } else if (normalized.startsWith('0') && normalized.length === 11) {
    normalized = `+90${normalized.slice(1)}`;
  } else if (!normalized.startsWith('+') && normalized.length === 10) {
    normalized = `+90${normalized}`;
  } else if (!normalized.startsWith('+')) {
    normalized = `+${normalized}`;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new HttpError(400, 'Phone must be in E.164 format.', 'invalid_phone');
  }
  return normalized;
}

export function normalizeEmail(value) {
  const raw = safeTrim(value).toLowerCase();
  if (!raw) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    throw new HttpError(400, 'Email format is invalid.', 'invalid_email');
  }
  return raw.slice(0, 250);
}
