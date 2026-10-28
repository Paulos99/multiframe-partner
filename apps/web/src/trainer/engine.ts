/** Чистая логика тренажёра: колоды, повторение по Лейтнеру, оценка сценария и викторины, прогресс. */
import { norm, scoreStep, scoreText, total, tokens } from './scoring';
import type {
  AttemptAnswer,
  CriterionId,
  Flag,
  LearningAttempt,
  Mode,
  Objection,
  QuizAnswer,
  QuizQuestion,
  ReviewCard,
  Scenario,
  Scores,
  TrainerContent,
  TrainerRole,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/* ---------- роли ---------- */

/** Роль кабинета → роль тренажёра. */
export function trainerRoleOf(role: string): TrainerRole {
  switch (role) {
    case 'admin':
      return 'stp_admin';
    case 'sales':
      return 'manager';
    case 'owner':
    case 'measurer':
    case 'crew':
      return role;
    default:
      return 'manager';
  }
}

export const ROLE_TITLES: Record<TrainerRole, string> = {
  owner: 'Владелец',
  manager: 'Менеджер',
  measurer: 'Замерщик',
  crew: 'Монтажник',
  stp_admin: 'Администратор StP',
};

export const DEFAULT_DECK_SIZE = 5;
export const DECK_SIZES = [3, 5, 10] as const;
export const MIN_WORDS = 8;

export function objectionsForRole(content: TrainerContent, role: TrainerRole, showAll: boolean): Objection[] {
  const all = content.objections.objections;
  return showAll || role === 'stp_admin' ? all : all.filter((o) => o.roles.includes(role));
}
export function scenariosForRole(content: TrainerContent, role: TrainerRole, showAll: boolean): Scenario[] {
  const all = content.scenarios.scenarios;
  return showAll || role === 'stp_admin' ? all : all.filter((s) => s.roles.includes(role));
}
export function questionsForRole(content: TrainerContent, role: TrainerRole, showAll: boolean): QuizQuestion[] {
  const all = content.quiz.questions;
  return showAll || role === 'stp_admin' ? all : all.filter((q) => q.roles.includes(role));
}

/* ---------- текст ответа ---------- */

export function wordCount(text: string): number {
  return tokens(norm(text)).length;
}
export function answerError(text: string, minWords = MIN_WORDS): string | null {
  const n = wordCount(text);
  if (n === 0) return 'Напишите ответ клиенту.';
  if (n < minWords) return `Ответ короткий: нужно хотя бы ${minWords} слов, сейчас ${n}. Если не знаете, нажмите «Не знаю».`;
  return null;
}

/** Диапазоны найденных фрагментов в исходном тексте (длина строки при подготовке не меняется). */
export function highlightRanges(text: string, patterns: string[]): [number, number][] {
  const prepared = text.toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”]/g, ' ');
  const ranges: [number, number][] = [];
  for (const p of patterns) {
    let rx: RegExp;
    try {
      rx = new RegExp(p, 'g');
    } catch {
      continue;
    }
    for (const m of prepared.matchAll(rx)) {
      const start = m.index ?? 0;
      const text0 = m[0];
      if (!text0.trim()) continue;
      // шаблоны с (^|[^а-я]) захватывают лишний символ по краям
      const lead = text0.length - text0.trimStart().length;
      const from = start + lead;
      ranges.push([from, from + text0.trim().length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/* ---------- повторение по Лейтнеру ---------- */

export function cardKey(userId: string, itemType: 'objection' | 'quiz', itemId: string): string {
  return `${userId}:${itemType}:${itemId}`;
}

export function updateCard(
  prev: ReviewCard | undefined,
  base: { userId: string; itemType: 'objection' | 'quiz'; itemId: string },
  passed: boolean,
  totalScore: number,
  now: Date,
  content: TrainerContent,
): ReviewCard {
  const { boxes, intervalsDays } = content.scoring.srs;
  const box = passed ? Math.min(boxes, (prev?.box ?? 1) + 1) : 1;
  const days = intervalsDays[box - 1] ?? 0;
  return {
    key: cardKey(base.userId, base.itemType, base.itemId),
    userId: base.userId,
    itemType: base.itemType,
    itemId: base.itemId,
    box,
    lastAt: now.toISOString(),
    nextDueAt: new Date(now.getTime() + days * DAY_MS).toISOString(),
    attempts: (prev?.attempts ?? 0) + 1,
    passes: (prev?.passes ?? 0) + (passed ? 1 : 0),
    lapses: (prev?.lapses ?? 0) + (passed ? 0 : 1),
    bestTotal: Math.max(prev?.bestTotal ?? 0, totalScore),
    lastTotal: totalScore,
  };
}

export function isDue(card: ReviewCard, now: Date): boolean {
  return new Date(card.nextDueAt).getTime() <= now.getTime();
}

/** Просроченные карточки: сверху низкая коробка и большая просрочка. Не больше дневного предела. */
export function dueCards(cards: ReviewCard[], itemType: 'objection' | 'quiz', now: Date, limit: number): ReviewCard[] {
  return cards
    .filter((c) => c.itemType === itemType && isDue(c, now))
    .sort((a, b) => a.box - b.box || new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime())
    .slice(0, limit);
}

/** Колода подхода: сначала просроченные, потом новые, потом остальные. */
export function buildDeck(
  content: TrainerContent,
  role: TrainerRole,
  showAll: boolean,
  cards: ReviewCard[],
  now: Date,
  size: number,
): Objection[] {
  const pool = objectionsForRole(content, role, showAll);
  const byId = new Map(cards.filter((c) => c.itemType === 'objection').map((c) => [c.itemId, c]));
  const due = dueCards(cards, 'objection', now, content.scoring.srs.dailyLimit)
    .map((c) => pool.find((o) => o.id === c.itemId))
    .filter((o): o is Objection => Boolean(o));
  const used = new Set(due.map((o) => o.id));
  const fresh = pool.filter((o) => !byId.has(o.id) && !used.has(o.id)).sort((a, b) => a.difficulty - b.difficulty);
  fresh.forEach((o) => used.add(o.id));
  const rest = pool
    .filter((o) => !used.has(o.id))
    .sort((a, b) => (byId.get(a.id)?.box ?? 0) - (byId.get(b.id)?.box ?? 0));
  return [...due, ...fresh, ...rest].slice(0, size);
}

/** Какую из формулировок клиента показать: чередуем по числу прошлых попыток. */
export function phrasingIndex(o: Objection, card: ReviewCard | undefined): number {
  return (card?.attempts ?? 0) % o.clientPhrasing.length;
}

/* ---------- случайный порядок с зерном ---------- */

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let a = hashSeed(seed);
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ---------- самооценка и порог ---------- */

export const DRILL_CRITERIA: CriterionId[] = ['discovery', 'listening', 'objection', 'value', 'honesty'];
export const ROLEPLAY_CRITERIA: CriterionId[] = ['discovery', 'listening', 'objection', 'value', 'honesty', 'nextstep'];

export function criteriaOf(mode: Mode): CriterionId[] {
  return mode === 'roleplay' ? ROLEPLAY_CRITERIA : mode === 'quiz' ? ['honesty'] : DRILL_CRITERIA;
}

/** Изменение больше чем на балл требует короткой пометки. */
export function needsNote(auto: number | undefined, self: number): boolean {
  return auto !== undefined && Math.abs(self - auto) > 1;
}

export function isPassed(scores: Scores, mode: Mode, totalScore: number, content: TrainerContent, extra?: { quizPercent?: number }): boolean {
  const t = content.scoring.passThresholds;
  if (mode === 'quiz') return (extra?.quizPercent ?? 0) >= t.quiz.percentCorrect;
  if (mode === 'objection') {
    return totalScore >= t.objection.total && (scores.honesty ?? 1) >= t.objection.honestyAtLeast && (scores.objection ?? 1) >= t.objection.objectionAtLeast;
  }
  return totalScore >= t.roleplay.total && (scores.honesty ?? 1) >= t.roleplay.honestyAtLeast && (scores.nextstep ?? 1) >= t.roleplay.nextstepAtLeast;
}

export function finalOf(auto: Scores, self: Scores | null): Scores {
  return self ? { ...auto, ...self } : { ...auto };
}

export const ALL_ONES: Scores = { discovery: 1, listening: 1, objection: 1, value: 1, honesty: 1, nextstep: 1 };

/**
 * Подсказка самооценки не должна быть щедрее разбора. «Слышу клиента» в эталонном подсчёте
 * растёт от вежливого начала и повтора слов клиента, даже если ни один пункт не назван.
 * Поэтому: ни одного названного пункта — не больше 2, меньше половины — не больше 3.
 * Подсчёт в scoring.ts остаётся как в эталоне; поправка только здесь, в автооценке тренажёра.
 */
export function calibrate<T extends Partial<Record<CriterionId, number>>>(scores: T, cov: number): T {
  if (scores.listening === undefined) return scores;
  const cap = cov <= 0 ? 2 : cov < 0.5 ? 3 : 5;
  return { ...scores, listening: Math.min(scores.listening, cap) };
}

/* ---------- быстрая отработка ---------- */

export type DrillEvaluation = {
  autoScores: Scores;
  flags: Flag[];
  cov: number;
  matchedPointIds: string[];
  missedPointIds: string[];
  missingCritical: string[];
};

export function evaluateDrill(o: Objection, phrasing: number, beat1: string, beat2: string, content: TrainerContent, skipped: boolean): DrillEvaluation {
  if (skipped) {
    return {
      autoScores: { ...ALL_ONES },
      flags: [],
      cov: 0,
      matchedPointIds: [],
      missedPointIds: o.requiredPoints.map((p) => `${o.id}:${p.id}`),
      missingCritical: o.requiredPoints.filter((p) => p.critical).map((p) => p.id),
    };
  }
  const r = scoreStep(beat1, beat2, o, phrasing, content.scoring);
  return {
    autoScores: calibrate(r.scores, r.cov),
    flags: r.hits,
    cov: r.cov,
    matchedPointIds: r.matchedPointIds.map((p) => `${o.id}:${p}`),
    missedPointIds: r.missedPointIds.map((p) => `${o.id}:${p}`),
    missingCritical: r.missingCritical,
  };
}

/* ---------- сценарий ---------- */

export type StepResult = {
  stepId: string;
  objectionId: string;
  passed: boolean;
  cov: number;
  scores: Record<CriterionId, number>;
  flags: Flag[];
  matchedPointIds: string[];
  missedPointIds: string[];
  missingCritical: string[];
  usedHint: boolean;
};
export type ScenarioEvaluation = {
  steps: StepResult[];
  closingScores: Record<CriterionId, number> | null;
  autoScores: Scores;
  flags: Flag[];
  criteria: { id: string; text: string; kind: string; ok: boolean | null }[];
};

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 1);

export function evaluateScenario(
  scenario: Scenario,
  answers: AttemptAnswer[],
  hintsUsed: string[],
  content: TrainerContent,
): ScenarioEvaluation {
  const objById = new Map(content.objections.objections.map((o) => [o.id, o]));
  const steps: StepResult[] = [];
  for (const step of scenario.steps) {
    const o = objById.get(step.objectionId);
    if (!o) continue;
    const b1 = answers.find((a) => a.stepId === step.id && a.beat === 1)?.text ?? '';
    const b2 = answers.find((a) => a.stepId === step.id && a.beat === 2)?.text ?? '';
    const r = scoreStep(b1, b2, o, step.clientPhrasingIndex, content.scoring);
    const usedHint = hintsUsed.includes(step.id);
    const scores = { ...calibrate(r.scores, r.cov) };
    if (usedHint) scores.objection = Math.max(1, scores.objection - 1);
    const critical = r.hits.some((h) => h.severity === 'critical');
    steps.push({
      stepId: step.id,
      objectionId: o.id,
      passed: r.cov >= 0.6 && !critical,
      cov: r.cov,
      scores,
      flags: r.hits,
      matchedPointIds: r.matchedPointIds.map((p) => `${o.id}:${p}`),
      missedPointIds: r.missedPointIds.map((p) => `${o.id}:${p}`),
      missingCritical: r.missingCritical,
      usedHint,
    });
  }
  const closingText = answers.find((a) => a.stepId === 'closing')?.text ?? '';
  const closing = closingText ? scoreText(closingText, [], '', content.scoring) : null;
  const flags = [...steps.flatMap((s) => s.flags), ...(closing?.hits ?? [])];
  const honesty = Math.min(...steps.map((s) => s.scores.honesty), closing?.scores.honesty ?? 5);
  const autoScores: Scores = {
    discovery: mean(steps.map((s) => s.scores.discovery)),
    listening: mean(steps.map((s) => s.scores.listening)),
    objection: mean(steps.map((s) => s.scores.objection)),
    value: mean(steps.map((s) => s.scores.value)),
    honesty,
    nextstep: closing?.scores.nextstep ?? 1,
  };
  const criteria = scenario.successCriteria.map((c) => {
    let ok: boolean | null = null;
    if (c.kind === 'objectionPoints') ok = steps.every((s) => s.missingCritical.length === 0);
    else if (c.kind === 'noForbiddenClaims') ok = flags.length === 0;
    else if (c.kind === 'nextStep') ok = (autoScores.nextstep ?? 1) >= 5;
    return { id: c.id, text: c.text, kind: c.kind, ok };
  });
  return { steps, closingScores: closing?.scores ?? null, autoScores, flags, criteria };
}

/* ---------- викторина ---------- */

export type QuizKind = 'quick' | 'topic' | 'traps' | 'repeat';

export function buildQuiz(
  content: TrainerContent,
  role: TrainerRole,
  showAll: boolean,
  kind: QuizKind,
  opts: { topic?: string; cards?: ReviewCard[]; now?: Date; seed: string; size?: number },
): QuizQuestion[] {
  const size = opts.size ?? 10;
  let pool = questionsForRole(content, role, showAll);
  if (kind === 'topic') pool = pool.filter((q) => q.topic === opts.topic);
  if (kind === 'traps') pool = pool.filter((q) => q.isTrap);
  if (kind === 'repeat') {
    const due = new Set(dueCards(opts.cards ?? [], 'quiz', opts.now ?? new Date(), content.scoring.srs.dailyLimit).map((c) => c.itemId));
    pool = pool.filter((q) => due.has(q.id));
  }
  const seen = new Set((opts.cards ?? []).filter((c) => c.itemType === 'quiz').map((c) => c.itemId));
  // новые вопросы вперёд, затем уже виденные; внутри групп порядок с зерном
  const fresh = seededShuffle(pool.filter((q) => !seen.has(q.id)), `${opts.seed}:n`);
  const old = seededShuffle(pool.filter((q) => seen.has(q.id)), `${opts.seed}:o`);
  return [...fresh, ...old].slice(0, size);
}

export function shuffledOptions(q: QuizQuestion, attemptNo: string): QuizQuestion['options'] {
  return seededShuffle(q.options, `${q.id}:${attemptNo}`);
}

export function isCorrectAnswer(q: QuizQuestion, selected: string[]): boolean {
  const a = new Set(selected);
  return a.size === q.correctOptionIds.length && q.correctOptionIds.every((id) => a.has(id));
}

/** Критерий «Честность» в викторине: доля верных ответов на ловушки. */
export function honestyFromTraps(answers: QuizAnswer[], questions: QuizQuestion[]): number | null {
  const traps = new Set(questions.filter((q) => q.isTrap).map((q) => q.id));
  const rel = answers.filter((a) => traps.has(a.questionId));
  if (!rel.length) return null;
  const pct = (rel.filter((a) => a.correct).length / rel.length) * 100;
  return pct >= 80 ? 5 : pct >= 60 ? 4 : pct >= 40 ? 3 : pct >= 20 ? 2 : 1;
}

export type QuizSummary = {
  correct: number;
  count: number;
  percent: number;
  byTopic: { topic: string; title: string; correct: number; count: number }[];
  mistakes: { question: QuizQuestion; answer: QuizAnswer }[];
  honesty: number | null;
};

export function summarizeQuiz(content: TrainerContent, questions: QuizQuestion[], answers: QuizAnswer[]): QuizSummary {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const correct = answers.filter((a) => a.correct).length;
  const topics = new Map<string, { correct: number; count: number }>();
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q) continue;
    const t = topics.get(q.topic) ?? { correct: 0, count: 0 };
    t.count += 1;
    if (a.correct) t.correct += 1;
    topics.set(q.topic, t);
  }
  return {
    correct,
    count: answers.length,
    percent: answers.length ? Math.round((correct / answers.length) * 100) : 0,
    byTopic: [...topics.entries()].map(([topic, v]) => ({
      topic,
      title: content.quiz.topics.find((t) => t.id === topic)?.title ?? topic,
      ...v,
    })),
    mistakes: answers
      .filter((a) => !a.correct)
      .map((answer) => ({ question: byId.get(answer.questionId)!, answer }))
      .filter((m) => m.question),
    honesty: honestyFromTraps(answers, questions),
  };
}

/* ---------- прогресс ---------- */

export type Level = { id: string; title: string };

export function levelOf(attempts: LearningAttempt[], content: TrainerContent): { level: Level; avg: number | null } {
  const recent = [...attempts].filter((a) => a.mode !== 'quiz').sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)).slice(0, 10);
  const levels = content.scoring.passThresholds.levels;
  if (!recent.length) return { level: levels[0], avg: null };
  const avg = recent.reduce((s, a) => s + a.total, 0) / recent.length;
  let level = levels[0];
  for (const l of levels) if (avg >= l.minAvg) level = l;
  return { level, avg: Math.round(avg * 100) / 100 };
}

export type MasteryRow = { id: string; title: string; mastered: number; inWork: number; notStarted: number; total: number };

export type Progress = {
  criteriaAvg: { id: CriterionId; title: string; avg: number | null; weak: boolean }[];
  topics: MasteryRow[];
  reasons: MasteryRow[];
  streakDays: number;
  weakPoints: { key: string; objectionId: string; text: string; count: number }[];
  attempts: LearningAttempt[];
  level: Level;
  levelAvg: number | null;
  passedCount: number;
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function streakOf(attempts: LearningAttempt[], now: Date): number {
  const days = new Set(attempts.map((a) => dayKey(new Date(a.finishedAt))));
  let cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor = new Date(cursor.getTime() - DAY_MS);
  let n = 0;
  while (days.has(dayKey(cursor))) {
    n += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return n;
}

function mastery(items: { id: string; title: string; ids: string[] }[], cards: Map<string, ReviewCard>): MasteryRow[] {
  return items.map((it) => {
    let mastered = 0;
    let inWork = 0;
    for (const id of it.ids) {
      const c = cards.get(id);
      if (!c) continue;
      if (c.box >= 4) mastered += 1;
      else inWork += 1;
    }
    return { id: it.id, title: it.title, mastered, inWork, notStarted: it.ids.length - mastered - inWork, total: it.ids.length };
  });
}

export function computeProgress(content: TrainerContent, role: TrainerRole, showAll: boolean, attempts: LearningAttempt[], cards: ReviewCard[], now: Date): Progress {
  const sorted = [...attempts].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  const last10 = sorted.slice(0, 10);
  const criteriaAvg = content.scoring.criteria.map((c) => {
    const vals = last10.map((a) => a.finalScores[c.id]).filter((v): v is number => typeof v === 'number');
    const avg = vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
    return { id: c.id, title: c.title, avg, weak: avg !== null && avg < 3.5 };
  });
  const objCards = new Map(cards.filter((c) => c.itemType === 'objection').map((c) => [c.itemId, c]));
  const quizCards = new Map(cards.filter((c) => c.itemType === 'quiz').map((c) => [c.itemId, c]));
  const objs = objectionsForRole(content, role, showAll);
  const qs = questionsForRole(content, role, showAll);
  const topics = mastery(
    content.quiz.topics.map((t) => ({ id: t.id, title: t.title, ids: qs.filter((q) => q.topic === t.id).map((q) => q.id) })),
    quizCards,
  ).filter((r) => r.total > 0);
  const reasons = mastery(
    content.objections.refusalReasons.map((r) => ({ id: r.key, title: r.title, ids: objs.filter((o) => o.refusalReasonKey === r.key).map((o) => o.id) })),
    objCards,
  ).filter((r) => r.total > 0);
  const missed = new Map<string, number>();
  for (const a of attempts) for (const k of a.missedPointIds) missed.set(k, (missed.get(k) ?? 0) + 1);
  const objById = new Map(content.objections.objections.map((o) => [o.id, o]));
  const weakPoints = [...missed.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, count]) => {
      const [objectionId, pointId] = key.split(':');
      const text = objById.get(objectionId)?.requiredPoints.find((p) => p.id === pointId)?.text ?? key;
      return { key, objectionId, text, count };
    })
    .filter((w) => objById.has(w.objectionId));
  const lv = levelOf(attempts, content);
  return {
    criteriaAvg,
    topics,
    reasons,
    streakDays: streakOf(attempts, now),
    weakPoints,
    attempts: sorted,
    level: lv.level,
    levelAvg: lv.avg,
    passedCount: attempts.filter((a) => a.passed).length,
  };
}

export function quizTotal(percent: number): number {
  return Math.round((percent / 100) * 5 * 100) / 100;
}

export { total as totalScore };
