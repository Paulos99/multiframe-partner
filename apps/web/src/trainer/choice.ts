/**
 * Режим выбора ответа (ТЗ, разделы 3 и 5.0): перемешивание вариантов, сбор выбора из попыток,
 * доля «верно с первой попытки», критерии из нарушений, порог «засчитано», уровень.
 * Нейросети и подбора слов здесь нет: оценивается только первый выбор и пометка `violates`.
 */
import { isLegacyCard, seededShuffle, updateCard } from './engine';
import type {
  Choice,
  ChoiceOption,
  ChoiceScores,
  CriterionId,
  ErrorType,
  Objection,
  Pick,
  PickBeat,
  ReviewCard,
  Scenario,
  ScoringFile,
  TrainerContent,
} from './types';

export const ERROR_LABELS: Record<ErrorType, string> = {
  false_promise: 'Обещание или выдуманный факт',
  pressure: 'Давление или спор',
  vague: 'Расплывчато, без факта и пользы',
  ignores_concern: 'Мимо заботы клиента',
};
export const errorLabel = (type: ErrorType | null | undefined): string => (type ? ERROR_LABELS[type] : 'Неверный ответ');

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Порядок вариантов при показе: с зерном, поэтому при повторном выборе он остаётся прежним. Ответ привязан к `id`, а не к номеру. */
export function shuffleOptions(choice: Choice, seed: string): ChoiceOption[] {
  return seededShuffle(choice.options, seed);
}

export type Try = { optionId: string; ms: number };

/** Выбор готов, когда последней попыткой выбран верный вариант. */
export function makePick(args: {
  stepId?: string;
  objectionId?: string;
  beat: PickBeat;
  clientLine: string;
  tries: Try[];
  choice: Choice;
  usedHint?: boolean;
}): Pick {
  const byId = new Map(args.choice.options.map((o) => [o.id, o]));
  const first = byId.get(args.tries[0]?.optionId ?? '');
  const last = byId.get(args.tries[args.tries.length - 1]?.optionId ?? '');
  const firstTry = Boolean(first?.correct);
  return {
    ...(args.stepId ? { stepId: args.stepId } : {}),
    ...(args.objectionId ? { objectionId: args.objectionId } : {}),
    beat: args.beat,
    clientLine: args.clientLine,
    optionId: last?.id ?? '',
    correct: Boolean(last?.correct),
    firstTry,
    tries: args.tries,
    ...(args.usedHint ? { usedHint: true } : {}),
    firstError: firstTry || !first ? null : { errorType: first.errorType, violates: first.violates },
    falsePromise: args.tries.some((t) => byId.get(t.optionId)?.errorType === 'false_promise'),
  };
}

export type ChoiceResult = {
  count: number;
  firstTryCount: number;
  /** Доля верных с первой попытки, 0–1. */
  share: number;
  falsePromise: boolean;
  /** По каждому критерию: балл или null («не оценивалось»). */
  criteria: ChoiceScores;
  /** Итог 0–5 по оценённым критериям; null, если оценённых нет. */
  total: number | null;
};

/**
 * `played` — все варианты показанных реплик: критерий «оценивается», если среди них есть неверный
 * вариант с таким `violates`. Балл критерия: 5, минус 1,5 за каждый неверный первый выбор, не ниже 1.
 */
export function scoreChoices(picks: Pick[], played: ChoiceOption[], scoring: ScoringFile): ChoiceResult {
  const rule = scoring.choiceMode.criteriaFromViolations;
  const evaluated = new Set(played.filter((o) => !o.correct && o.violates).map((o) => o.violates as CriterionId));
  const criteria: ChoiceScores = {};
  let sum = 0;
  let weights = 0;
  for (const c of scoring.criteria) {
    if (!evaluated.has(c.id)) {
      criteria[c.id] = null;
      continue;
    }
    const violations = picks.filter((p) => p.firstError?.violates === c.id).length;
    const score = Math.max(rule.floor, rule.start - rule.penaltyPerViolation * violations);
    criteria[c.id] = score;
    sum += c.weight * score;
    weights += c.weight;
  }
  const firstTryCount = picks.filter((p) => p.firstTry).length;
  return {
    count: picks.length,
    firstTryCount,
    share: picks.length ? firstTryCount / picks.length : 0,
    falsePromise: picks.some((p) => p.falsePromise),
    criteria,
    total: weights ? round2(sum / weights) : null,
  };
}

export function isChoicePassed(kind: 'objection' | 'scenario', share: number, falsePromise: boolean, scoring: ScoringFile): boolean {
  const t = scoring.choiceMode.passThresholds;
  if (kind === 'objection') return share >= t.objection.firstTryCorrectAtLeast;
  return share >= t.scenario.firstTryCorrectAtLeast && !(t.scenario.noFalsePromisePick && falsePromise);
}

export type LevelInfo = { id: string; title: string };

export function levelByShare(share: number | null, scoring: ScoringFile): LevelInfo {
  const levels = scoring.choiceMode.passThresholds.levels;
  let level = levels[0];
  if (share === null) return level;
  for (const l of levels) if (share >= l.minShare) level = l;
  return level;
}

export function updateChoiceCard(prev: ReviewCard | undefined, base: { userId: string; itemId: string }, passed: boolean, share: number, now: Date, content: TrainerContent): ReviewCard {
  const prevCurrent = prev && !isLegacyCard(prev) ? prev : undefined;
  return { ...updateCard(prevCurrent, { userId: base.userId, itemType: 'objection', itemId: base.itemId }, passed, round2(share * 5), now, content), scheme: 2 };
}

/* ---------- сценарий: порядок реплик ---------- */

export type Slot = { key: string; stepId?: string; objectionId?: string; beat: PickBeat };

/** Все реплики сценария по порядку: две реплики каждого шага, затем заключительная. */
export function scenarioSlots(s: Scenario): Slot[] {
  const out: Slot[] = [];
  for (const st of s.steps) {
    out.push({ key: `${st.id}:1`, stepId: st.id, objectionId: st.objectionId, beat: 1 });
    out.push({ key: `${st.id}:2`, stepId: st.id, objectionId: st.objectionId, beat: 2 });
  }
  out.push({ key: 'closing', stepId: 'closing', beat: 'closing' });
  return out;
}

export function slotChoice(s: Scenario, slot: Slot): Choice {
  if (slot.beat === 'closing') return s.closing.choices;
  const step = s.steps.find((x) => x.id === slot.stepId)!;
  return slot.beat === 1 ? step.choices.beat1 : step.choices.beat2;
}

export function slotClientLine(s: Scenario, slot: Slot): string {
  if (slot.beat === 'closing') return s.closing.clientLine;
  const step = s.steps.find((x) => x.id === slot.stepId)!;
  return step.clientLines[slot.beat - 1];
}

/** Реплики быстрой отработки: формулировка клиента и повтор. */
export function drillLines(o: Objection, phrasing: number): [string, string] {
  return [o.clientPhrasing[phrasing] ?? o.clientPhrasing[0], o.pushback];
}

/** Выбор по номеру реплики для карточки быстрой отработки. */
export function drillChoice(o: Objection, beat: 1 | 2): Choice {
  return beat === 1 ? o.choices.beat1 : o.choices.beat2;
}
