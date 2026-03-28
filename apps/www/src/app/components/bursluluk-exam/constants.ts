import type { DifficultyLevel, ExamSectionId } from "./types";

export const EXAM_ROOT_CLASSNAME = "te-exam";
export const DRAFT_STORAGE_PREFIX = "teachera-dropin-exam-draft";
export const AUTOSAVE_DELAY_MS = 450;
export const SECTION_POINTS: Record<ExamSectionId, number> = {
  vocabulary: 20,
  grammar: 20,
  reading: 20,
  listening: 20,
  speaking: 20,
};

export const DIFFICULTY_WEIGHTS: Record<DifficultyLevel, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

export const RECORDER_MIME_PRIORITY = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/aac",
] as const;
