import type { ExamSectionId } from './types';

export const AUTOSAVE_DELAY_MS = 450;

export const SECTION_LABELS: Record<ExamSectionId, string> = {
  vocabulary: 'Vocabulary',
  grammar: 'Grammar',
  reading: 'Reading',
  listening: 'Listening',
  speaking: 'Speaking',
};

export const RECORDER_MIME_PRIORITY = [
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/aac',
] as const;
