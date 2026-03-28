import type { ReactNode } from "react";

export type ExamSectionId =
  | "vocabulary"
  | "grammar"
  | "reading"
  | "listening"
  | "speaking";

export type ObjectiveSectionId = Exclude<ExamSectionId, "speaking">;
export type DifficultyLevel = "easy" | "medium" | "hard";
export type ResultStatus = "started" | "evaluation_pending" | "finalized" | "timeout";
export type UploadMethod = "PUT" | "POST";

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
  type: "objective" | "visual" | "reading" | "listening";
  options: ExamOption[];
  readingPassage?: string | null;
  listeningAsset?: string | null;
}

export interface SpeakingQuestion extends ExamQuestionBase {
  type: "speaking";
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

export interface FullExamQuestion extends ObjectiveQuestion {
  correctOptionId: string;
  difficulty: DifficultyLevel;
  difficultyWeight: number;
  audioTranscript?: string | null;
}

export interface FullSpeakingQuestion extends SpeakingQuestion {}

export interface ExamContentFull {
  examVersionKey: string;
  grade: string;
  gradeNumber: number;
  title: string;
  ui: ExamContentPublic["ui"];
  scoring: {
    totalPoints: number;
    sectionPoints: Record<ExamSectionId, number>;
    difficultyWeights: Record<DifficultyLevel, number>;
    speaking: {
      promptCount: number;
      maxDurationSeconds: number;
      rubricMaxPerPrompt: number;
      totalPoints: number;
    };
  };
  stimuli: {
    readingPassage: string;
    audioTranscript: string;
    listeningAsset: string;
  };
  questions: Array<FullExamQuestion | FullSpeakingQuestion>;
}

export interface ExamAttemptState {
  attemptId: string;
  examVersionKey: string;
  grade: string;
  studentLabel?: string;
  startedAt: string;
  deadlineAt: string;
  durationSeconds: number;
  status: ResultStatus;
}

export interface ObjectiveAnswerState {
  questionId: string;
  selectedOptionId: string | null;
  savedAt: string;
}

export interface PersistedSpeakingResponse {
  questionId: string;
  responseId?: string;
  storageKey?: string;
  durationSeconds?: number;
  status: "idle" | "recording" | "uploading" | "uploaded" | "error";
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
  answers: ObjectiveAnswerState[];
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
  uploadMethod?: UploadMethod;
  uploadHeaders?: Record<string, string>;
  expiresAt?: string;
}

export interface SpeakingUploadTarget {
  uploadUrl: string;
  uploadMethod?: UploadMethod;
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
  status: "uploaded";
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
  status: "evaluation_pending" | "finalized";
  finalScore?: number;
}

export interface ResultStatusResponse {
  status: ResultStatus;
  finalScore?: number;
}

export interface TeacherSpeakingRubricItem {
  questionId: string;
  score: 0 | 1 | 2 | 3 | 4;
}

export interface FinalizeSpeakingEvaluationPayload {
  attemptId: string;
  examVersionKey: string;
  rubric: TeacherSpeakingRubricItem[];
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
