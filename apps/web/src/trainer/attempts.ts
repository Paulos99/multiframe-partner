/** Сборка попыток тренировки и обновление карточек повторения. Попытка никогда не трогает рабочие данные (context: «training»). */
import {
  ALL_ONES,
  cardKey,
  criteriaOf,
  evaluateDrill,
  finalOf,
  isPassed,
  phrasingIndex,
  quizTotal,
  summarizeQuiz,
  updateCard,
  type ScenarioEvaluation,
} from './engine';
import { total } from './scoring';
import type {
  AttemptAnswer,
  CriterionId,
  Flag,
  LearningAttempt,
  Objection,
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
  return { userId, deckSize: 5, showAllRoles: false, autoScoring: true };
}

export function newAttemptId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function pickScores(scores: Scores, ids: CriterionId[]): Scores {
  const out: Scores = {};
  for (const id of ids) if (scores[id] !== undefined) out[id] = scores[id];
  return out;
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

/* ---------- быстрая отработка ---------- */

export type DrillInput = Common & {
  objection: Objection;
  phrasing: number;
  beat1: string;
  beat2: string;
  ms: [number, number];
  /** «Не знаю» или устный ответ. */
  skipped: boolean;
  /** Без автооценки (отключена в настройках или ответ устный). */
  manual: boolean;
  selfScores: Scores | null;
  selfNotes?: Partial<Record<CriterionId, string>>;
};

export function buildDrillAttempt(i: DrillInput): Built {
  const o = i.objection;
  const ev = evaluateDrill(o, i.phrasing, i.beat1, i.beat2, i.content, i.skipped);
  const auto: Scores = i.manual ? {} : pickScores(ev.autoScores, criteriaOf('objection'));
  // «Не знаю»: одна единица по всем критериям, оценку пользователя при этом не требуем
  const baseline: Scores = i.manual ? (i.selfScores ?? { ...ALL_ONES }) : auto;
  const finalScores = pickScores(finalOf(baseline, i.selfScores), criteriaOf('objection'));
  const t = total(finalScores, 'objection', i.content.scoring);
  const passed = !i.skipped && isPassed(finalScores, 'objection', t, i.content);
  const answers: AttemptAnswer[] = i.skipped
    ? []
    : [
        { stepId: o.id, beat: 1, clientLine: o.clientPhrasing[i.phrasing], text: i.beat1, ms: i.ms[0] },
        { stepId: o.id, beat: 2, clientLine: o.pushback, text: i.beat2, ms: i.ms[1] },
      ];
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
    answers,
    autoScores: auto,
    selfScores: i.selfScores,
    ...(i.selfNotes && Object.keys(i.selfNotes).length ? { selfNotes: i.selfNotes } : {}),
    ...(i.skipped || i.manual ? { skipped: i.skipped } : {}),
    finalScores,
    total: t,
    passed,
    matchedPointIds: i.manual ? [] : ev.matchedPointIds,
    missedPointIds: i.manual ? [] : ev.missedPointIds,
    flags: i.manual ? [] : ev.flags,
    quiz: null,
    synced: false,
  };
  const key = cardKey(i.who.userId, 'objection', o.id);
  const card = updateCard(i.cards.get(key), { userId: i.who.userId, itemType: 'objection', itemId: o.id }, passed, t, i.now, i.content);
  return { attempt, cards: [card] };
}

export function drillPhrasing(o: Objection, cards: Map<string, ReviewCard>, userId: string): number {
  return phrasingIndex(o, cards.get(cardKey(userId, 'objection', o.id)));
}

/* ---------- ролевой сценарий ---------- */

export type ScenarioInput = Common & {
  scenario: Scenario;
  answers: AttemptAnswer[];
  evaluation: ScenarioEvaluation;
  selfScores: Scores | null;
  selfNotes?: Partial<Record<CriterionId, string>>;
  manualChecks: string[];
};

export function buildScenarioAttempt(i: ScenarioInput): Built {
  const auto = pickScores(i.evaluation.autoScores, criteriaOf('roleplay'));
  const finalScores = pickScores(finalOf(auto, i.selfScores), criteriaOf('roleplay'));
  const t = total(finalScores, 'roleplay', i.content.scoring);
  const passed = isPassed(finalScores, 'roleplay', t, i.content);
  const attempt: LearningAttempt = {
    id: i.id ?? newAttemptId(),
    userId: i.who.userId,
    partnerId: i.who.partnerId,
    role: i.who.role,
    context: 'training',
    mode: 'roleplay',
    itemType: 'scenario',
    itemIds: [i.scenario.id],
    contentVersion: i.content.contentVersion,
    startedAt: i.startedAt.toISOString(),
    finishedAt: i.now.toISOString(),
    answers: i.answers,
    autoScores: auto,
    selfScores: i.selfScores,
    ...(i.selfNotes && Object.keys(i.selfNotes).length ? { selfNotes: i.selfNotes } : {}),
    manualChecks: i.manualChecks,
    finalScores,
    total: t,
    passed,
    matchedPointIds: i.evaluation.steps.flatMap((s) => s.matchedPointIds),
    missedPointIds: i.evaluation.steps.flatMap((s) => s.missedPointIds),
    flags: i.evaluation.flags as Flag[],
    quiz: null,
    synced: false,
  };
  // шаги сценария обновляют карточки возражений
  const cards: ReviewCard[] = [];
  const working = new Map(i.cards);
  for (const step of i.evaluation.steps) {
    const key = cardKey(i.who.userId, 'objection', step.objectionId);
    const stepTotal = total(step.scores, 'objection', i.content.scoring);
    const card = updateCard(working.get(key), { userId: i.who.userId, itemType: 'objection', itemId: step.objectionId }, step.passed, stepTotal, i.now, i.content);
    working.set(key, card);
    cards.push(card);
  }
  return { attempt, cards: [...new Map(cards.map((c) => [c.key, c])).values()] };
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
    passed: isPassed(scores, 'quiz', 0, i.content, { quizPercent: summary.percent }),
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
