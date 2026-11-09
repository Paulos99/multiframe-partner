/**
 * Ежедневные занятия тренажёра для вкладки «Сегодня».
 * Ротация по дню из существующего содержимого роли: короткая отработка возражения,
 * иногда ролевой разговор или проверка знаний. Без новых обещаний и цифр.
 */
import { objectionsForRole, questionsForRole, scenariosForRole, seesAllRoles, trainerRoleOf } from '../trainer/engine';
import type { TrainerRoute } from '../trainer/route';
import type { LearningAttempt, TrainerContent, TrainerRole } from '../trainer/types';

export type DailyLessonKind = 'drill' | 'scenario' | 'quiz';

export type DailyLesson = {
  /** Стабильный ключ занятия в каталоге роли. */
  id: string;
  kind: DailyLessonKind;
  title: string;
  /** Короткая подпись под названием. */
  subtitle: string;
  /** Оценка длительности в минутах — только ориентир. */
  minutes: number;
  route: TrainerRoute;
  /** Идентификатор содержимого: возражение, сценарий или «quiz». */
  itemId: string;
};

const KIND_SUBTITLE: Record<DailyLessonKind, string> = {
  drill: 'Отработка возражения · около 5 минут',
  scenario: 'Ролевой разговор · около 7 минут',
  quiz: 'Проверка знаний · около 5 минут',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Локальный ключ календарного дня. */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Порядковый номер дня (UTC-полуночь локальной даты) для стабильной ротации. */
export function dayIndex(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

function kindTitle(kind: DailyLessonKind, name: string): string {
  if (kind === 'quiz') return 'Проверка знаний';
  return name;
}

/**
 * Каталог занятий роли: сначала лёгкие возражения, затем сценарии и проверка знаний
 * вставлены через равные промежутки, чтобы дни не были однотипными.
 */
export function catalogForRole(content: TrainerContent, role: TrainerRole): DailyLesson[] {
  const showAll = seesAllRoles(role);
  const objections = [...objectionsForRole(content, role, showAll)].sort(
    (a, b) => a.difficulty - b.difficulty || a.panel.priority - b.panel.priority || a.id.localeCompare(b.id),
  );
  const scenarios = [...scenariosForRole(content, role, showAll)].sort((a, b) => a.id.localeCompare(b.id));
  const quizCount = questionsForRole(content, role, showAll).length;

  const drills: DailyLesson[] = objections.map((o) => ({
    id: `drill:${o.id}`,
    kind: 'drill' as const,
    title: kindTitle('drill', o.panel.title),
    subtitle: KIND_SUBTITLE.drill,
    minutes: 5,
    route: { page: 'drill', objectionId: o.id },
    itemId: o.id,
  }));

  const scenarioLessons: DailyLesson[] = scenarios.map((s) => ({
    id: `scenario:${s.id}`,
    kind: 'scenario' as const,
    title: kindTitle('scenario', s.title),
    subtitle: KIND_SUBTITLE.scenario,
    minutes: 7,
    route: { page: 'scenario', id: s.id, step: 'situation' },
    itemId: s.id,
  }));

  const quizLesson: DailyLesson | null =
    quizCount > 0
      ? {
          id: 'quiz:daily',
          kind: 'quiz',
          title: kindTitle('quiz', 'Проверка знаний'),
          subtitle: KIND_SUBTITLE.quiz,
          minutes: 5,
          route: { page: 'quiz', step: 'start' },
          itemId: 'quiz',
        }
      : null;

  if (!drills.length && !scenarioLessons.length && !quizLesson) return [];

  // База — отработки; сценарии и викторина вставляются равномерно.
  if (!drills.length) {
    const out = [...scenarioLessons];
    if (quizLesson) out.push(quizLesson);
    return out;
  }

  const extras = [...scenarioLessons, ...(quizLesson ? [quizLesson] : [])];
  if (!extras.length) return drills;

  const out: DailyLesson[] = [];
  const step = Math.max(2, Math.floor(drills.length / (extras.length + 1)));
  let e = 0;
  for (let i = 0; i < drills.length; i += 1) {
    out.push(drills[i]!);
    if (e < extras.length && (i + 1) % step === 0) {
      out.push(extras[e]!);
      e += 1;
    }
  }
  while (e < extras.length) {
    out.push(extras[e]!);
    e += 1;
  }
  return out;
}

/** Одно или два занятия на день: второе — через половину каталога, чтобы не дублировать вид. */
export function lessonsForDay(catalog: DailyLesson[], date: Date): DailyLesson[] {
  if (!catalog.length) return [];
  const idx = ((dayIndex(date) % catalog.length) + catalog.length) % catalog.length;
  const first = catalog[idx]!;
  if (catalog.length === 1) return [first];
  const secondIdx = (idx + Math.max(1, Math.floor(catalog.length / 2))) % catalog.length;
  const second = catalog[secondIdx]!;
  if (second.id === first.id) return [first];
  // По чётным дням — одно занятие, по нечётным — два (если они разные).
  if (dayIndex(date) % 2 === 0) return [first];
  return [first, second];
}

function attemptOnDay(a: LearningAttempt, day: string): boolean {
  return localDayKey(new Date(a.finishedAt)) === day;
}

/** Занятие пройдено, если в этот день есть законченная попытка по его содержимому. */
export function isLessonDone(lesson: DailyLesson, attempts: LearningAttempt[], date: Date): boolean {
  const day = localDayKey(date);
  return attempts.some((a) => {
    if (!attemptOnDay(a, day)) return false;
    if (lesson.kind === 'drill') return a.itemType === 'objection' && a.itemIds.includes(lesson.itemId);
    if (lesson.kind === 'scenario') return a.itemType === 'scenario' && a.itemIds.includes(lesson.itemId);
    return a.itemType === 'quiz' || a.mode === 'quiz';
  });
}

/** День засчитан в серию, если пройдено хотя бы одно занятие этого дня. */
export function dayHasLessonDone(catalog: DailyLesson[], attempts: LearningAttempt[], date: Date): boolean {
  const lessons = lessonsForDay(catalog, date);
  if (!lessons.length) return false;
  return lessons.some((l) => isLessonDone(l, attempts, date));
}

/** Серия дней подряд с хотя бы одним пройденным занятием (сегодня или со вчера). */
export function dailyLessonStreak(catalog: DailyLesson[], attempts: LearningAttempt[], now: Date): number {
  if (!catalog.length) return 0;
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!dayHasLessonDone(catalog, attempts, cursor)) {
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  let n = 0;
  while (dayHasLessonDone(catalog, attempts, cursor)) {
    n += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return n;
}

/** Сколько разных занятий каталога человек уже проходил хотя бы раз. */
export function catalogProgress(
  catalog: DailyLesson[],
  attempts: LearningAttempt[],
): { done: number; total: number } {
  const total = catalog.length;
  if (!total) return { done: 0, total: 0 };
  let done = 0;
  for (const lesson of catalog) {
    const hit = attempts.some((a) => {
      if (lesson.kind === 'drill') return a.itemType === 'objection' && a.itemIds.includes(lesson.itemId);
      if (lesson.kind === 'scenario') return a.itemType === 'scenario' && a.itemIds.includes(lesson.itemId);
      return a.itemType === 'quiz' || a.mode === 'quiz';
    });
    if (hit) done += 1;
  }
  return { done, total };
}

export type TodayLessonView = {
  lessons: Array<DailyLesson & { done: boolean }>;
  streakDays: number;
  progress: { done: number; total: number };
  allDoneToday: boolean;
};

export function buildTodayLessonView(
  content: TrainerContent,
  cabinetRole: string,
  attempts: LearningAttempt[],
  now: Date = new Date(),
): TodayLessonView {
  const role = trainerRoleOf(cabinetRole);
  const catalog = catalogForRole(content, role);
  const lessons = lessonsForDay(catalog, now).map((l) => ({ ...l, done: isLessonDone(l, attempts, now) }));
  return {
    lessons,
    streakDays: dailyLessonStreak(catalog, attempts, now),
    progress: catalogProgress(catalog, attempts),
    allDoneToday: lessons.length > 0 && lessons.every((l) => l.done),
  };
}
