export type AnswerType = 'MULTIPLE_CHOICE' | 'AUDIO_RECORDING' | 'VISUAL' | 'TEXT';
export type QuestionContentType = 'RICH_TEXT' | 'VIDEO' | 'AUDIO';
export type ExamStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type ExamDefinition = {
  id: string;
  name: string;
  status: ExamStatus;
  totalDurationSeconds: number;
  randomizeQuestions: boolean;
  shuffleAnswers: boolean;
  startAt: string | null;
  endAt: string | null;
  questions: QuestionDefinition[];
  createdAt: string;
  updatedAt: string;
};

export type QuestionDefinition = {
  id: string;
  order: number;
  contentType: QuestionContentType;
  contentHtml: string;
  videoUrl: string;
  videoViewLimit: number | null;
  audioUrl: string;
  audioListenLimit: number | null;
  answerType: AnswerType;
  answers: AnswerOption[];
  durationSeconds: number | null;
  weight: number;
};

export type AnswerOption = {
  id: string;
  label: string;
  content: string;
  isCorrect: boolean;
  mediaUrl: string | null;
};

export function createEmptyQuestion(order: number, contentType: QuestionContentType = 'RICH_TEXT'): QuestionDefinition {
  return {
    id: `q_${Date.now()}_${order}`,
    order,
    contentType,
    contentHtml: '',
    videoUrl: '',
    videoViewLimit: null,
    audioUrl: '',
    audioListenLimit: null,
    answerType: 'MULTIPLE_CHOICE',
    answers: [
      { id: `a_${Date.now()}_1`, label: 'A', content: '', isCorrect: true, mediaUrl: null },
      { id: `a_${Date.now()}_2`, label: 'B', content: '', isCorrect: false, mediaUrl: null },
      { id: `a_${Date.now()}_3`, label: 'C', content: '', isCorrect: false, mediaUrl: null },
      { id: `a_${Date.now()}_4`, label: 'D', content: '', isCorrect: false, mediaUrl: null },
    ],
    durationSeconds: null,
    weight: 1,
  };
}

export function createEmptyExam(): ExamDefinition {
  return {
    id: `exam_${Date.now()}`,
    name: 'Yeni Sınav',
    status: 'DRAFT',
    totalDurationSeconds: 2400,
    randomizeQuestions: true,
    shuffleAnswers: true,
    startAt: null,
    endAt: null,
    questions: [createEmptyQuestion(1)],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
