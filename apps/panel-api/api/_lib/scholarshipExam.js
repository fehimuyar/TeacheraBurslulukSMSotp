// AUTO-GENERATED FROM packages/shared/backend. DO NOT EDIT DIRECTLY.
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './errors.js';

export const SCHOLARSHIP_EXAM_PUBLIC_ROOT = '/bursluluk-exam';
export const SCHOLARSHIP_EXAM_CONTENT_ROOT = `${SCHOLARSHIP_EXAM_PUBLIC_ROOT}/content`;
export const SCHOLARSHIP_EXAM_SHARED_SHELL_ROOT = `${SCHOLARSHIP_EXAM_PUBLIC_ROOT}/shared-shell`;

const REGISTRY_DIR_CANDIDATES = [
  ['private', 'scholarship-exam'],
  ['apps', 'exam-api', 'private', 'scholarship-exam'],
  ['packages', 'shared', 'scholarship-exam'],
];

const OBJECTIVE_SECTION_IDS = ['vocabulary', 'grammar', 'reading', 'listening'];

let scholarshipRegistryRootCache = '';
let scholarshipIndexCache = null;
const scholarshipJsonCache = new Map();

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJsonFile(filePath) {
  const cached = scholarshipJsonCache.get(filePath);
  if (cached) return cloneValue(cached);

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  scholarshipJsonCache.set(filePath, parsed);
  return cloneValue(parsed);
}

function walkUpDirectories(startDir) {
  const visited = [];
  let cursor = path.resolve(startDir);
  while (!visited.includes(cursor)) {
    visited.push(cursor);
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return visited;
}

function findScholarshipRegistryRoot() {
  if (scholarshipRegistryRootCache) return scholarshipRegistryRootCache;

  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  const searchRoots = Array.from(new Set([process.cwd(), currentFileDir]));

  for (const searchRoot of searchRoots) {
    for (const candidateBase of walkUpDirectories(searchRoot)) {
      for (const segments of REGISTRY_DIR_CANDIDATES) {
        const candidateDir = path.join(candidateBase, ...segments);
        const indexFile = path.join(candidateDir, 'content', 'index.json');
        if (fs.existsSync(indexFile)) {
          scholarshipRegistryRootCache = candidateDir;
          return scholarshipRegistryRootCache;
        }
      }
    }
  }

  throw new Error('scholarship_exam_registry_not_found');
}

function readScholarshipExamIndex() {
  if (!scholarshipIndexCache) {
    scholarshipIndexCache = readJsonFile(path.join(findScholarshipRegistryRoot(), 'content', 'index.json'));
  }
  return cloneValue(scholarshipIndexCache);
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
  const match = /^([a-z0-9-]+):(grade-\d{2})$/i.exec(raw);
  if (!match) return null;
  return {
    examVersionKey: match[1],
    grade: match[2].toLowerCase(),
  };
}

export function buildScholarshipExamBankKey(descriptor) {
  if (!descriptor?.examVersionKey || !descriptor?.grade) return '';
  return `${descriptor.examVersionKey}:${descriptor.grade}`;
}

export function isScholarshipExamBankKey(value) {
  return Boolean(parseScholarshipExamBankKey(value));
}

export function isScholarshipExamSource(value) {
  const source = normalizeText(value).toLowerCase();
  return source.includes('bursluluk');
}

function resolveScholarshipDescriptor(input) {
  const registry = readScholarshipExamIndex();
  const descriptors = Array.isArray(registry.grades) ? registry.grades : [];
  const parsedBankKey = parseScholarshipExamBankKey(
    typeof input === 'string' ? input : input?.bankKey,
  );

  if (parsedBankKey) {
    const byBankKey = descriptors.find(
      (descriptor) =>
        descriptor.examVersionKey === parsedBankKey.examVersionKey
        && descriptor.grade === parsedBankKey.grade,
    );
    if (byBankKey) {
      return {
        ...cloneValue(byBankKey),
        bankKey: buildScholarshipExamBankKey(byBankKey),
      };
    }
  }

  const requestedGrade = formatScholarshipGradeKey(
    typeof input === 'string'
      ? input
      : input?.grade ?? input?.gradeKey ?? input?.gradeNumber,
  );
  if (!requestedGrade) return null;

  const requestedExamVersionKey = normalizeText(
    typeof input === 'object' && input ? input.examVersionKey : '',
  );

  const descriptor = descriptors.find(
    (candidate) =>
      candidate.grade === requestedGrade
      && (!requestedExamVersionKey || candidate.examVersionKey === requestedExamVersionKey),
  );

  if (!descriptor) return null;
  return {
    ...cloneValue(descriptor),
    bankKey: buildScholarshipExamBankKey(descriptor),
  };
}

function resolveScholarshipFilePath(input, fileKey) {
  const descriptor = resolveScholarshipDescriptor(input);
  if (!descriptor) return null;
  return path.join(findScholarshipRegistryRoot(), 'content', descriptor.grade, descriptor.files[fileKey]);
}

export function loadScholarshipExamFullContent(input) {
  const filePath = resolveScholarshipFilePath(input, 'fullAssessment');
  if (!filePath || !fs.existsSync(filePath)) return null;
  return readJsonFile(filePath);
}

export function loadScholarshipExamPublicContent(input) {
  const filePath = resolveScholarshipFilePath(input, 'publicAssessment');
  if (!filePath || !fs.existsSync(filePath)) return null;
  return readJsonFile(filePath);
}

export function resolveScholarshipExamContext(input) {
  const isCandidateScholarship = Boolean(
    parseScholarshipExamBankKey(input?.bankKey)
    || isScholarshipExamSource(input?.source)
    || normalizeText(input?.examVersionKey).startsWith('bursluluk-'),
  );
  if (!isCandidateScholarship) return null;

  const descriptor = resolveScholarshipDescriptor(input);
  if (!descriptor) return null;

  return {
    enabled: true,
    examVersionKey: descriptor.examVersionKey,
    contentGrade: descriptor.grade,
    gradeNumber: normalizeScholarshipGradeNumber(descriptor.grade),
    bankKey: descriptor.bankKey,
    questionCount: Number(descriptor.counts?.questions || 0),
    objectiveQuestionCount: Number(descriptor.counts?.objectiveQuestions || 0),
    speakingQuestionCount: Number(descriptor.counts?.speakingQuestions || 0),
    publicContentPath: `${SCHOLARSHIP_EXAM_CONTENT_ROOT}/${descriptor.grade}/${descriptor.files.publicAssessment}`,
    assetBaseUrl: `${SCHOLARSHIP_EXAM_CONTENT_ROOT}/${descriptor.grade}`,
    sharedShellBaseUrl: SCHOLARSHIP_EXAM_SHARED_SHELL_ROOT,
    descriptor,
  };
}

export function assertScholarshipExamVersion(examVersionKey, context) {
  const normalized = normalizeText(examVersionKey);
  if (!normalized) {
    throw new HttpError(400, 'examVersionKey is required.', 'missing_exam_version_key');
  }
  if (!context) {
    throw new HttpError(409, 'Scholarship exam context could not be resolved.', 'scholarship_exam_context_missing');
  }
  if (normalized !== context.examVersionKey) {
    throw new HttpError(409, 'examVersionKey does not match the active scholarship exam content.', 'exam_version_mismatch', {
      requested_exam_version_key: normalized,
      expected_exam_version_key: context.examVersionKey,
    });
  }
  return normalized;
}

export function hasScholarshipExamPayload(body) {
  if (!body || typeof body !== 'object') return false;
  if (normalizeText(body.examVersionKey).startsWith('bursluluk-')) return true;
  if (Array.isArray(body.objectiveAnswers)) return true;
  if (Array.isArray(body.speakingResponses)) return true;
  return Array.isArray(body.answers) && body.answers.some((item) => Object.prototype.hasOwnProperty.call(item || {}, 'selectedOptionId'));
}

function normalizeNullableId(value, maxLength = 180) {
  if (value === null || value === undefined) return null;
  const normalized = normalizeText(String(value));
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function normalizeScholarshipObjectiveAnswers(rawAnswers) {
  if (!Array.isArray(rawAnswers)) return [];
  const latestByQuestionId = new Map();

  for (const raw of rawAnswers) {
    const questionId = normalizeText(raw?.questionId).slice(0, 160);
    if (!questionId) continue;
    latestByQuestionId.set(questionId, {
      questionId,
      selectedOptionId: normalizeNullableId(raw?.selectedOptionId, 180),
    });
  }

  return Array.from(latestByQuestionId.values());
}

export function normalizeScholarshipSpeakingResponses(rawResponses) {
  if (!Array.isArray(rawResponses)) return [];
  const latestByQuestionId = new Map();

  for (const raw of rawResponses) {
    const questionId = normalizeText(raw?.questionId).slice(0, 160);
    const responseId = normalizeNullableId(raw?.responseId, 120);
    if (!questionId || !responseId) continue;
    latestByQuestionId.set(questionId, { questionId, responseId });
  }

  return Array.from(latestByQuestionId.values());
}

export function buildScholarshipObjectiveScoringPlan(content) {
  const sectionPoints = content?.scoring?.sectionPoints || {};
  const questions = Array.isArray(content?.questions) ? content.questions : [];
  const objectiveQuestions = questions.filter((question) => question?.type !== 'speaking' && normalizeText(question?.correctOptionId));

  return OBJECTIVE_SECTION_IDS.flatMap((sectionId) => {
    const sectionQuestions = objectiveQuestions.filter((question) => question.section === sectionId);
    const sectionWeightTotal = sectionQuestions.reduce((sum, question) => sum + Number(question.difficultyWeight || 0), 0);
    const sectionMaxPoints = Number(sectionPoints[sectionId] || 0);

    return sectionQuestions.map((question) => ({
      questionId: question.id,
      section: sectionId,
      correctOptionId: question.correctOptionId,
      difficulty: question.difficulty || 'easy',
      rawWeight: Number(question.difficultyWeight || 0),
      maxPoints: sectionWeightTotal > 0 ? (sectionMaxPoints * Number(question.difficultyWeight || 0)) / sectionWeightTotal : 0,
    }));
  });
}

export function countScholarshipSpeakingQuestions(content) {
  return Array.isArray(content?.questions)
    ? content.questions.filter((question) => question?.type === 'speaking').length
    : 0;
}

export function findScholarshipQuestion(content, questionId) {
  const normalizedQuestionId = normalizeText(questionId);
  return Array.isArray(content?.questions)
    ? content.questions.find((question) => question?.id === normalizedQuestionId) || null
    : null;
}

export function calculateScholarshipObjectiveMetrics(content, answersInput) {
  const normalizedAnswers = normalizeScholarshipObjectiveAnswers(answersInput);
  const selectedByQuestionId = new Map(
    normalizedAnswers.map((answer) => [answer.questionId, answer.selectedOptionId]),
  );
  const scoringPlan = buildScholarshipObjectiveScoringPlan(content);
  const totalPoints = Number(
    scoringPlan.reduce((sum, row) => sum + Number(row.maxPoints || 0), 0).toFixed(2),
  );

  let answeredCount = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let score = 0;

  for (const row of scoringPlan) {
    const selectedOptionId = selectedByQuestionId.get(row.questionId) ?? null;
    if (!selectedOptionId) continue;

    answeredCount += 1;
    if (selectedOptionId === row.correctOptionId) {
      correctCount += 1;
      score += Number(row.maxPoints || 0);
    } else {
      wrongCount += 1;
    }
  }

  const unansweredCount = Math.max(0, scoringPlan.length - answeredCount);
  const normalizedScore = Number(score.toFixed(2));
  const percentage = totalPoints > 0 ? Number(((normalizedScore / totalPoints) * 100).toFixed(2)) : 0;

  return {
    score: normalizedScore,
    percentage,
    totalPoints,
    questionCount: scoringPlan.length,
    answeredCount,
    correctCount,
    wrongCount,
    unansweredCount,
  };
}

export function buildScholarshipScoredAnswerRows(content, answersInput) {
  const normalizedAnswers = normalizeScholarshipObjectiveAnswers(answersInput);
  const scoringRowsByQuestionId = new Map(
    buildScholarshipObjectiveScoringPlan(content).map((row) => [row.questionId, row]),
  );

  return normalizedAnswers.map((answer) => {
    const scoringRow = scoringRowsByQuestionId.get(answer.questionId);
    const isCorrect = Boolean(
      answer.selectedOptionId
      && scoringRow
      && answer.selectedOptionId === scoringRow.correctOptionId,
    );

    return {
      questionId: answer.questionId,
      selectedOption: answer.selectedOptionId,
      isCorrect,
      questionWeight: Number((scoringRow?.maxPoints || 0).toFixed(2)),
      scoreDelta: isCorrect ? Number((scoringRow?.maxPoints || 0).toFixed(2)) : 0,
    };
  });
}

export function createScholarshipSpeakingUploadToken() {
  return randomBytes(24).toString('hex');
}

export function hashScholarshipSpeakingUploadToken(token) {
  return createHash('sha256').update(normalizeText(token)).digest('hex');
}

export function resolveScholarshipSpeakingStorageKey({ attemptId, questionId, responseId }) {
  return `db://scholarship-exam/${normalizeText(attemptId)}/${normalizeText(questionId)}/${normalizeText(responseId)}`;
}

export function resolveScholarshipResultLifecycleStatus({ attemptStatus, submissionStatus, resultStatus }) {
  const normalizedResultStatus = normalizeText(resultStatus).toUpperCase();
  const normalizedSubmissionStatus = normalizeText(submissionStatus).toUpperCase();
  const normalizedAttemptStatus = normalizeText(attemptStatus).toUpperCase();

  if (['PUBLISHED', 'VIEWED'].includes(normalizedResultStatus)) {
    return 'finalized';
  }
  if (
    normalizedSubmissionStatus === 'FINALIZED'
    || normalizedSubmissionStatus === 'EVALUATION_PENDING'
    || normalizedResultStatus === 'NOT_READY'
    || normalizedAttemptStatus === 'SUBMITTED'
  ) {
    return 'evaluation_pending';
  }
  if (normalizedAttemptStatus === 'TIMEOUT' || normalizedSubmissionStatus === 'TIMEOUT') {
    return 'timeout';
  }
  return 'started';
}
