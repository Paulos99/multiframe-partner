/** Чистая логика тренажёра: колоды, повторение по Лейтнеру, викторина, прогресс. Выбор ответа и оценка — в choice.ts. */
import type { CriterionId, ErrorType, LearningAttempt, Objection, QuizAnswer, QuizQuestion, ReviewCard, Scenario, TrainerContent, TrainerRole } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/* ---------- роли ---------- */

/** Роль кабинета → роль тренажёра. */
export function trainerRoleOf(role: string): TrainerRole {
  switch (role) {
    case 'admin':
      return 'stp_admin';
    case 'sales':
    case 'stp_manager':
      // Менеджер StP проходит тот же курс, что менеджер по продажам партнёра.
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
  cards = cards.filter((c) => !isLegacyCard(c));
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

/** Попытка набором текста с автооценкой (до режима выбора): в итоги не входит. */
export const isLegacyAttempt = (a: LearningAttempt): boolean => a.mode !== 'quiz' && !a.picks;
/** Карточка возражения от старой автооценки: коробку нельзя переносить в режим выбора. */
export const isLegacyCard = (c: ReviewCard): boolean => c.itemType === 'objection' && c.scheme !== 2;

const LEVEL_WINDOW = 10;

/** Уровень: средняя доля «верно с первой попытки» по последним десяти попыткам в режиме выбора. */
export function levelOf(attempts: LearningAttempt[], content: TrainerContent): { level: Level; share: number | null } {
  const levels = content.scoring.choiceMode.passThresholds.levels;
  const recent = attempts
    .filter((a) => !isLegacyAttempt(a) && a.mode !== 'quiz' && typeof a.firstTryCorrect === 'number')
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .slice(0, LEVEL_WINDOW);
  if (!recent.length) return { level: levels[0], share: null };
  const share = recent.reduce((s, a) => s + (a.firstTryCorrect ?? 0), 0) / recent.length;
  let level = levels[0];
  for (const l of levels) if (share >= l.minShare) level = l;
  return { level, share: Math.round(share * 1000) / 1000 };
}

export type MasteryRow = { id: string; title: string; mastered: number; inWork: number; notStarted: number; total: number };

export type Progress = {
  criteriaAvg: { id: CriterionId; title: string; avg: number | null; weak: boolean }[];
  topics: MasteryRow[];
  reasons: MasteryRow[];
  streakDays: number;
  /** Чаще всего выбранные неверные ответы (первый выбор) по типам ошибки. */
  errorTypes: { type: ErrorType; count: number }[];
  /** Возражения, где чаще ошибались с первого раза. */
  weakObjections: { objectionId: string; title: string; count: number }[];
  attempts: LearningAttempt[];
  level: Level;
  /** Средняя доля верных с первой попытки по последним попыткам, 0–1. */
  levelShare: number | null;
  passedCount: number;
  /** Старые попытки набором текста: в итоги не входят. */
  legacyCount: number;
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

export function computeProgress(content: TrainerContent, role: TrainerRole, showAll: boolean, allAttempts: LearningAttempt[], allCards: ReviewCard[], now: Date): Progress {
  const attempts = allAttempts.filter((a) => !isLegacyAttempt(a));
  const cards = allCards.filter((c) => !isLegacyCard(c));
  const sorted = [...attempts].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  const choice = sorted.filter((a) => a.mode !== 'quiz');
  const last10 = choice.slice(0, LEVEL_WINDOW);
  const criteriaAvg = content.scoring.criteria.map((c) => {
    const vals = last10.map((a) => a.choiceScores?.[c.id]).filter((v): v is number => typeof v === 'number');
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
  const types = new Map<ErrorType, number>();
  const weak = new Map<string, number>();
  for (const a of choice.slice(0, 30)) {
    for (const p of a.picks ?? []) {
      if (p.firstTry) continue;
      const t = p.firstError?.errorType;
      if (t) types.set(t, (types.get(t) ?? 0) + 1);
      if (p.objectionId) weak.set(p.objectionId, (weak.get(p.objectionId) ?? 0) + 1);
    }
  }
  const titleOf = new Map(content.objections.objections.map((o) => [o.id, o.panel.title]));
  const lv = levelOf(attempts, content);
  return {
    criteriaAvg,
    topics,
    reasons,
    streakDays: streakOf(attempts, now),
    errorTypes: [...types.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count })),
    weakObjections: [...weak.entries()]
      .filter(([id]) => titleOf.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([objectionId, count]) => ({ objectionId, title: titleOf.get(objectionId) ?? objectionId, count })),
    attempts: sorted,
    level: lv.level,
    levelShare: lv.share,
    passedCount: attempts.filter((a) => a.passed).length,
    legacyCount: allAttempts.length - attempts.length,
  };
}
export function quizTotal(percent: number): number {
  return Math.round((percent / 100) * 5 * 100) / 100;
}

