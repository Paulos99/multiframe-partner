/**
 * Академия / тренажёры. Попытки изолированы от боевой аналитики продаж.
 * Не импортирует partner.ts — избегаем циклов с реэкспортом.
 */

export type LearningScenarioId = 'sell_multiframe' | 'objections' | 'calc_sandbox' | 'install_nodes';

export type RubricCriterion =
  | 'need_discovery'
  | 'tech_accuracy'
  | 'non_pushy_offer'
  | 'clarity'
  | 'objection_handling'
  | 'next_step'
  | 'no_false_promises';

export type LearningRubric = {
  criteria: RubricCriterion[];
  /** Штраф за недостоверные обещания («гарантированная тишина», выдуманные дБ). */
  falsePromisePenalty: number;
};

export type LearningScenario = {
  id: LearningScenarioId;
  role: 'admin' | 'owner' | 'sales' | 'measurer' | 'crew' | 'any';
  difficulty: 'easy' | 'medium' | 'hard';
  version: string;
  title: string;
  rubric: LearningRubric;
};

export type LearningAttemptStatus = 'assigned' | 'started' | 'completed' | 'abandoned';

export type LearningAttempt = {
  id: string;
  userId: string;
  orgId: string;
  scenarioId: LearningScenarioId;
  status: LearningAttemptStatus;
  startedAt: string | null;
  completedAt: string | null;
  score: number | null;
  errorTypes: string[];
  /** Контекст всегда training — не смешивать с рабочими KPI. */
  context: 'training';
};

export const DEFAULT_SALES_RUBRIC: LearningRubric = {
  criteria: [
    'need_discovery',
    'tech_accuracy',
    'non_pushy_offer',
    'clarity',
    'objection_handling',
    'next_step',
    'no_false_promises',
  ],
  falsePromisePenalty: 25,
};

/** Открытие тренажёра ≠ освоение навыка. */
export function openingCountsAsMastery(_attempt: Pick<LearningAttempt, 'status'>): boolean {
  return false;
}

export function isAttemptCompleted(attempt: Pick<LearningAttempt, 'status' | 'completedAt'>): boolean {
  return attempt.status === 'completed' && Boolean(attempt.completedAt);
}

/** Учебные попытки никогда не увеличивают воронку продаж. */
export function learningAttemptAffectsSalesFunnel(_attempt: LearningAttempt): boolean {
  return false;
}

export function scoreWithFalsePromisePenalty(
  baseScore: number,
  hasFalsePromise: boolean,
  rubric: LearningRubric = DEFAULT_SALES_RUBRIC,
): number {
  const raw = hasFalsePromise ? baseScore - rubric.falsePromisePenalty : baseScore;
  return Math.max(0, Math.min(100, raw));
}

export function progressDelta(
  previous: number | null | undefined,
  current: number | null | undefined,
): number | null {
  if (previous == null || current == null) return null;
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return null;
  return current - previous;
}
