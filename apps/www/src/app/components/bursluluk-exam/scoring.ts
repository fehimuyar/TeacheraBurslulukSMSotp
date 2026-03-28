import { DIFFICULTY_WEIGHTS, SECTION_POINTS } from "./constants";
import type {
  DifficultyLevel,
  ExamContentFull,
  ExamSectionId,
  FinalizeSpeakingEvaluationPayload,
  FullExamQuestion,
  TeacherSpeakingRubricItem,
} from "./types";

export interface ObjectiveQuestionScoreRow {
  questionId: string;
  section: ExamSectionId;
  difficulty: DifficultyLevel;
  rawWeight: number;
  maxPoints: number;
}

export function buildObjectiveScoringPlan(content: ExamContentFull): ObjectiveQuestionScoreRow[] {
  const objectiveQuestions = content.questions.filter(
    (question): question is FullExamQuestion =>
      question.type !== "speaking" && "correctOptionId" in question,
  );

  return content.ui.sectionOrder
    .filter((section): section is Exclude<ExamSectionId, "speaking"> => section !== "speaking")
    .flatMap((section) => {
      const sectionQuestions = objectiveQuestions.filter((question) => question.section === section);
      const sectionWeightTotal = sectionQuestions.reduce((sum, question) => sum + question.difficultyWeight, 0);
      return sectionQuestions.map((question) => ({
        questionId: question.id,
        section,
        difficulty: question.difficulty,
        rawWeight: question.difficultyWeight,
        maxPoints:
          sectionWeightTotal > 0
            ? (SECTION_POINTS[section] * question.difficultyWeight) / sectionWeightTotal
            : 0,
      }));
    });
}

export function calculateObjectiveScore(
  content: ExamContentFull,
  selectedOptionIds: Record<string, string | null | undefined>,
): number {
  const scoringPlan = buildObjectiveScoringPlan(content);
  const questionMap = new Map(
    content.questions
      .filter((question): question is FullExamQuestion => question.type !== "speaking" && "correctOptionId" in question)
      .map((question) => [question.id, question]),
  );

  return Number(
    scoringPlan
      .reduce((sum, row) => {
        const selected = selectedOptionIds[row.questionId] ?? null;
        const question = questionMap.get(row.questionId);
        if (!question || !selected || question.correctOptionId !== selected) {
          return sum;
        }
        return sum + row.maxPoints;
      }, 0)
      .toFixed(2),
  );
}

export function calculateSpeakingScore(rubric: TeacherSpeakingRubricItem[]): number {
  return Number(rubric.reduce((sum, item) => sum + item.score, 0).toFixed(2));
}

export function calculateFinalScore(
  content: ExamContentFull,
  selectedOptionIds: Record<string, string | null | undefined>,
  rubric: TeacherSpeakingRubricItem[],
): number {
  const objective = calculateObjectiveScore(content, selectedOptionIds);
  const speaking = calculateSpeakingScore(rubric);
  return Number((objective + speaking).toFixed(2));
}

export function buildFinalizeSpeakingPayload(
  attemptId: string,
  examVersionKey: string,
  rubric: TeacherSpeakingRubricItem[],
): FinalizeSpeakingEvaluationPayload {
  return {
    attemptId,
    examVersionKey,
    rubric,
  };
}

export function resolveDifficultyWeight(level: DifficultyLevel): number {
  return DIFFICULTY_WEIGHTS[level];
}
