/** Сборка попыток тренировки и обновление карточек повторения. Попытка никогда не трогает рабочие данные (context: «training»). */
import { cardKey, quizTotal, summarizeQuiz, updateCard } from './engine';
import { isChoicePassed, scenarioSlots, scoreChoices, slotChoice, updateChoiceCard } from './choice';
import type {
  AttemptAnswer,
  ChoiceOption,
  LearningAttempt,
  Objection,
  Pick,
  QuizAnswer,
  QuizQuestion,
  ReviewCard,
  Scenario,
  Scores,
  TrainerContent,
  TrainerRole,
  TrainerSettings,
} from './types';

export type Who = { userId: string; partnerId: string | null; role: TrainerRole };

export function defaultSettings(userId: string, content: TrainerContent): TrainerSettings {
  void content;
  return { userId, deckSize: 5, showAllRoles: false };
}

export function newAttemptId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type Common = {
  who: Who;
  content: TrainerContent;
  startedAt: Date;
  now: Date;
  cards: Map<string, ReviewCard>;
  id?: string;
};

export type Built = { attempt: LearningAttempt; cards: ReviewCard[] };

const optionsOf = (o: Objection) => [...o.choices.beat1.options, ...o.choices.beat2.options];

/* ---------- быстрая отработка ---------- */

export type DrillInput = Common & {
  objection: Objection;
  /** Обе реплики: уже выбранные верные варианты со всеми попытками. */
  picks: [Pick, Pick];
  answers?: AttemptAnswer[];
};

export function buildDrillAttempt(i: DrillInput): Built {
  const o = i.objection;
  const result = scoreChoices(i.picks, optionsOf(o), i.content.scoring);
  const passed = isChoicePassed('objection', result.share, result.falsePromise, i.content.scoring);
  const attempt: LearningAttempt = {
    id: i.id ?? newAttemptId(),
    userId: i.who.userId,
    partnerId: i.who.partnerId,
    role: i.who.role,
    context: 'training',
    mode: 'objection',
    itemType: 'objection',
    itemIds: [o.id],
    contentVersion: i.content.contentVersion,
    startedAt: i.startedAt.toISOString(),
    finishedAt: i.now.toISOString(),
    scheme: 2,
    picks: i.picks,
    firstTryCorrect: result.share,
    choiceScores: result.criteria,
    answers: i.answers ?? [],
    total: result.total ?? Math.round(result.share * 500) / 100,
    passed,
    quiz: null,
    synced: false,
  };
  // коробка растёт, только если обе реплики верны с первой попытки
  const bothFirst = i.picks.every((p) => p.firstTry);
  const card = updateChoiceCard(i.cards.get(cardKey(i.who.userId, 'objection', o.id)), { userId: i.who.userId, itemId: o.id }, bothFirst, result.share, i.now, i.content);
  return { attempt, cards: [card] };
}

export function drillPhrasing(o: Objection, cards: Map<string, ReviewCard>, userId: string): number {
  const c = cards.get(cardKey(userId, 'objection', o.id));
  return c && c.scheme === 2 ? c.attempts % o.clientPhrasing.length : 0;
}

/* ---------- ролевой сценарий ---------- */

export type ScenarioInput = Common & {
  scenario: Scenario;
  picks: Pick[];
  answers?: AttemptAnswer[];
};

export type ScenarioCriterionResult = { id: string; text: string; kind: string; ok: boolean };

/** Условия успеха сценария считаются сами: по первым выборам, ложным обещаниям и заключительному шагу. */
export function scenarioCriteria(scenario: Scenario, picks: Pick[]): ScenarioCriterionResult[] {
  const steps = picks.filter((p) => p.beat !== 'closing');
  const closing = picks.find((p) => p.beat === 'closing');
  return scenario.successCriteria.map((c) => {
    let ok = false;
    if (c.kind === 'firstTryCorrect') ok = steps.length > 0 && steps.every((p) => p.firstTry);
    else if (c.kind === 'noFalsePromise') ok = !picks.some((p) => p.falsePromise);
    else if (c.kind === 'nextStepChoice') ok = Boolean(closing?.firstTry);
    return { id: c.id, text: c.text, kind: c.kind, ok };
  });
}

export function scenarioPlayed(scenario: Scenario): ChoiceOption[] {
  return scenarioSlots(scenario).flatMap((slot) => slotChoice(scenario, slot).options);
}

export function buildScenarioAttempt(i: ScenarioInput): Built {
  const s = i.scenario;
  const result = scoreChoices(i.picks, scenarioPlayed(s), i.content.scoring);
  const passed = isChoicePassed('scenario', result.share, result.falsePromise, i.content.scoring);
  const attempt: LearningAttempt = {
    id: i.id ?? newAttemptId(),
    userId: i.who.userId,
    partnerId: i.who.partnerId,
    role: i.who.role,
    context: 'training',
    mode: 'roleplay',
    itemType: 'scenario',
    itemIds: [s.id],
    contentVersion: i.content.contentVersion,
    startedAt: i.startedAt.toISOString(),
    finishedAt: i.now.toISOString(),
    scheme: 2,
    picks: i.picks,
    firstTryCorrect: result.share,
    choiceScores: result.criteria,
    answers: i.answers ?? [],
    total: result.total ?? Math.round(result.share * 500) / 100,
    passed,
    quiz: null,
    synced: false,
  };
  // карточки возражений шагов: коробка растёт, если обе реплики шага верны с первого раза
  const cards: ReviewCard[] = [];
  for (const step of s.steps) {
    const stepPicks = i.picks.filter((p) => p.stepId === step.id && (p.beat === 1 || p.beat === 2));
    if (stepPicks.length < 2) continue;
    const share = stepPicks.filter((p) => p.firstTry).length / stepPicks.length;
    const prev = cards.find((c) => c.itemId === step.objectionId) ?? i.cards.get(cardKey(i.who.userId, 'objection', step.objectionId));
    const card = updateChoiceCard(prev, { userId: i.who.userId, itemId: step.objectionId }, stepPicks.every((p) => p.firstTry), share, i.now, i.content);
    const at = cards.findIndex((c) => c.itemId === step.objectionId);
    if (at >= 0) cards[at] = card;
    else cards.push(card);
  }
  return { attempt, cards };
}

/* ---------- викторина ---------- */

export type QuizInput = Common & { questions: QuizQuestion[]; answers: QuizAnswer[] };

export function buildQuizAttempt(i: QuizInput): Built {
  const summary = summarizeQuiz(i.content, i.questions, i.answers);
  const scores: Scores = summary.honesty === null ? {} : { honesty: summary.honesty };
  const attempt: LearningAttempt = {
    id: i.id ?? newAttemptId(),
    userId: i.who.userId,
    partnerId: i.who.partnerId,
    role: i.who.role,
    context: 'training',
    mode: 'quiz',
    itemType: 'quiz',
    itemIds: i.questions.map((q) => q.id),
    contentVersion: i.content.contentVersion,
    startedAt: i.startedAt.toISOString(),
    finishedAt: i.now.toISOString(),
    answers: [],
    autoScores: scores,
    selfScores: null,
    finalScores: scores,
    total: quizTotal(summary.percent),
    passed: summary.percent >= i.content.scoring.passThresholds.quiz.percentCorrect,
    matchedPointIds: [],
    missedPointIds: [],
    flags: [],
    quiz: i.answers,
    synced: false,
  };
  const cards: ReviewCard[] = i.answers.map((a) => {
    const key = cardKey(i.who.userId, 'quiz', a.questionId);
    return updateCard(i.cards.get(key), { userId: i.who.userId, itemType: 'quiz', itemId: a.questionId }, a.correct, a.correct ? 5 : 1, i.now, i.content);
  });
  return { attempt, cards };
}
