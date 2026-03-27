import type { ExamContentPublic, ObjectiveQuestion, PublicExamQuestion } from './types';
import { createSeededRandom, hashSeed } from './utils';

function seededShuffle<T>(items: readonly T[], seedKey: string): T[] {
  const clone = [...items];
  const random = createSeededRandom(hashSeed(seedKey));
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [clone[index], clone[randomIndex]] = [clone[randomIndex], clone[index]];
  }
  return clone;
}

function shuffleObjectiveOptions(question: ObjectiveQuestion, seedKey: string): ObjectiveQuestion {
  return {
    ...question,
    options: seededShuffle(question.options, seedKey),
  };
}

export function buildAttemptQuestionOrder(content: ExamContentPublic, attemptId: string): PublicExamQuestion[] {
  const ordered: PublicExamQuestion[] = [];

  for (const sectionId of content.ui.sectionOrder) {
    const sectionQuestions = content.questions.filter((question) => question.section === sectionId);
    const shuffledQuestions = seededShuffle(
      sectionQuestions,
      `${attemptId}:${content.examVersionKey}:${sectionId}:questions`,
    );

    for (const question of shuffledQuestions) {
      if (question.type === 'speaking') {
        ordered.push(question);
        continue;
      }

      ordered.push(
        shuffleObjectiveOptions(
          question,
          `${attemptId}:${content.examVersionKey}:${question.id}:options`,
        ),
      );
    }
  }

  return ordered;
}
