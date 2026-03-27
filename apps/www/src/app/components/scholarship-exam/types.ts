import type { ReactNode } from 'react';

export type ExamSectionId = 'vocabulary' | 'grammar' | 'reading' | 'listening' | 'speaking';

export interface ExamSectionConfig {
  id: ExamSectionId;
  label: string;
  maxPoints: number;
}

export interface ExamOption {
  optionId: string;
  originalLetter: string;
  label: string;
}

export interface ExamQuestionBase {
  id: string;
  questionNo: number;
  displayQuestionNo: number;
  sourceQuestionNo: number | null;
  section: ExamSectionId;
  sectionQuestionNo: number;
  prompt: string;
  visualAsset?: string | null;
}

export interface ObjectiveQuestion extends ExamQuestionBase {
  type: 'objective' | 'visual' | 'reading' | 'listening';
  options: ExamOption[];
  readingPassage?: string | null;
  listeningAsset?: string | null;
}

export interface SpeakingQuestion extends ExamQuestionBase {
  type: 'speaking';
  maxDurationSeconds: number;
  rubricMaxScore: number;
}

export type PublicExamQuestion = ObjectiveQuestion | SpeakingQuestion;

export interface ExamContentPublic {
  examVersionKey: string;
  grade: string;
  gradeNumber: number;
  title: string;
  ui: {
    referenceTheme: string;
    sectionOrder: ExamSectionId[];
    keepLetterLabels: boolean;
    deterministicShuffle: boolean;
  };
  sections: ExamSectionConfig[];
  questions: PublicExamQuestion[];
}

export interface ExamAttemptState {
  attemptId: string;
  examVersionKey: string;
  grade: string;
  studentLabel?: string;
  startedAt: string;
  deadlineAt: string;
  durationSeconds: number;
  status: 'started' | 'evaluation_pending' | 'finalized' | 'timeout';
}

export interface PersistedSpeakingResponse {
  questionId: string;
  responseId?: string;
  storageKey?: string;
  durationSeconds?: number;
  status: 'idle' | 'recording' | 'uploading' | 'uploaded' | 'error';
  errorMessage?: string;
  updatedAt: string;
}

export interface ExamDraftSnapshot {
  attemptId: string;
  currentQuestionIndex: number;
  objectiveAnswers: Record<string, string | null>;
  speakingResponses: Record<string, PersistedSpeakingResponse>;
  updatedAt: string;
}

export interface SaveObjectiveAnswersPayload {
  attemptId: string;
  examVersionKey: string;
  answers: Array<{
    questionId: string;
    selectedOptionId: string | null;
    savedAt?: string;
  }>;
}

export interface SpeakingUploadInitPayload {
  attemptId: string;
  examVersionKey: string;
  questionId: string;
  mimeType: string;
  byteSize: number;
}

export interface SpeakingUploadInitResponse {
  responseId: string;
  uploadUrl: string;
  uploadMethod?: 'PUT' | 'POST';
  uploadHeaders?: Record<string, string>;
  expiresAt?: string;
}

export interface SpeakingUploadTarget {
  uploadUrl: string;
  uploadMethod?: 'PUT' | 'POST';
  uploadHeaders?: Record<string, string>;
}

export interface SpeakingUploadCompletePayload {
  attemptId: string;
  examVersionKey: string;
  questionId: string;
  responseId: string;
  durationSeconds: number;
  mimeType: string;
  byteSize: number;
}

export interface SpeakingUploadCompleteResponse {
  responseId: string;
  storageKey: string;
  status: 'uploaded';
}

export interface SubmitExamPayload {
  attemptId: string;
  examVersionKey: string;
  objectiveAnswers: Array<{
    questionId: string;
    selectedOptionId: string | null;
  }>;
  speakingResponses: Array<{
    questionId: string;
    responseId: string;
  }>;
}

export interface SubmitExamResponse {
  status: 'evaluation_pending' | 'finalized';
  finalScore?: number;
}

export interface ResultStatusResponse {
  status: 'started' | 'evaluation_pending' | 'finalized' | 'timeout';
  finalScore?: number;
}

export interface ExamModuleAdapter {
  saveObjectiveAnswers(payload: SaveObjectiveAnswersPayload): Promise<void>;
  initSpeakingUpload(payload: SpeakingUploadInitPayload): Promise<SpeakingUploadInitResponse>;
  uploadSpeakingBlob(target: SpeakingUploadTarget, blob: Blob): Promise<void>;
  completeSpeakingUpload(payload: SpeakingUploadCompletePayload): Promise<SpeakingUploadCompleteResponse>;
  submitExam(payload: SubmitExamPayload): Promise<SubmitExamResponse>;
  getResultStatus?(attemptId: string): Promise<ResultStatusResponse>;
}

export interface ScholarshipExamModuleProps {
  content: ExamContentPublic;
  attempt: ExamAttemptState;
  adapter: ExamModuleAdapter;
  assetBaseUrl?: string;
  initialDraft?: ExamDraftSnapshot | null;
  onDraftChange?: (draft: ExamDraftSnapshot) => void;
  onSubmitted?: (response: SubmitExamResponse) => void;
  loadingSlot?: ReactNode;
}
