import type { ExamDefinition } from './examBuilderTypes';

export const MOCK_EXAMS: ExamDefinition[] = [
  {
    id: 'exam_1',
    name: 'İngilizce A1-A2 (Kids 7-12)',
    status: 'PUBLISHED',
    totalDurationSeconds: 2400,
    randomizeQuestions: true,
    shuffleAnswers: true,
    startAt: '2026-03-28T07:00:00Z',
    endAt: '2026-03-28T17:00:00Z',
    questions: [
      { id: 'q1', order: 1, contentType: 'RICH_TEXT', contentHtml: '<p>What is the correct greeting for <strong>morning</strong>?</p>', videoUrl: '', videoViewLimit: null, audioUrl: '', audioListenLimit: null, answerType: 'MULTIPLE_CHOICE', answers: [{ id: 'a1', label: 'A', content: 'Good morning', isCorrect: true, mediaUrl: null }, { id: 'a2', label: 'B', content: 'Good night', isCorrect: false, mediaUrl: null }, { id: 'a3', label: 'C', content: 'Good evening', isCorrect: false, mediaUrl: null }, { id: 'a4', label: 'D', content: 'Goodbye', isCorrect: false, mediaUrl: null }], durationSeconds: null, weight: 1 },
      { id: 'q2', order: 2, contentType: 'RICH_TEXT', contentHtml: '<p>Which animal says <em>"meow"</em>?</p>', videoUrl: '', videoViewLimit: null, audioUrl: '', audioListenLimit: null, answerType: 'MULTIPLE_CHOICE', answers: [{ id: 'a5', label: 'A', content: 'Dog', isCorrect: false, mediaUrl: null }, { id: 'a6', label: 'B', content: 'Cat', isCorrect: true, mediaUrl: null }, { id: 'a7', label: 'C', content: 'Bird', isCorrect: false, mediaUrl: null }, { id: 'a8', label: 'D', content: 'Fish', isCorrect: false, mediaUrl: null }], durationSeconds: null, weight: 1 },
      { id: 'q3', order: 3, contentType: 'RICH_TEXT', contentHtml: '<p>What color is the <strong>sky</strong>?</p>', videoUrl: '', videoViewLimit: null, audioUrl: '', audioListenLimit: null, answerType: 'MULTIPLE_CHOICE', answers: [{ id: 'a9', label: 'A', content: 'Red', isCorrect: false, mediaUrl: null }, { id: 'a10', label: 'B', content: 'Green', isCorrect: false, mediaUrl: null }, { id: 'a11', label: 'C', content: 'Blue', isCorrect: true, mediaUrl: null }, { id: 'a12', label: 'D', content: 'Yellow', isCorrect: false, mediaUrl: null }], durationSeconds: null, weight: 1 },
    ],
    createdAt: '2026-03-18T10:00:00Z',
    updatedAt: '2026-03-20T14:00:00Z',
  },
  {
    id: 'exam_2',
    name: 'Almanca Genel (Teens 13-17)',
    status: 'DRAFT',
    totalDurationSeconds: 1800,
    randomizeQuestions: false,
    shuffleAnswers: true,
    startAt: null,
    endAt: null,
    questions: [
      { id: 'q4', order: 1, contentType: 'RICH_TEXT', contentHtml: '<p>Wie heißt du?</p>', videoUrl: '', videoViewLimit: null, audioUrl: '', audioListenLimit: null, answerType: 'MULTIPLE_CHOICE', answers: [{ id: 'a13', label: 'A', content: 'Ich heiße...', isCorrect: true, mediaUrl: null }, { id: 'a14', label: 'B', content: 'Ich bin...', isCorrect: false, mediaUrl: null }], durationSeconds: null, weight: 1 },
    ],
    createdAt: '2026-03-19T08:00:00Z',
    updatedAt: '2026-03-19T08:00:00Z',
  },
  {
    id: 'exam_3',
    name: 'Fransızca Başlangıç',
    status: 'ARCHIVED',
    totalDurationSeconds: 1500,
    randomizeQuestions: true,
    shuffleAnswers: false,
    startAt: null,
    endAt: null,
    questions: [],
    createdAt: '2026-03-10T12:00:00Z',
    updatedAt: '2026-03-15T09:00:00Z',
  },
];
