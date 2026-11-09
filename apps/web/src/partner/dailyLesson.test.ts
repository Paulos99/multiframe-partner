import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContent, type RawContent } from '../trainer/content';
import type { LearningAttempt } from '../trainer/types';
import {
  buildTodayLessonView,
  catalogForRole,
  catalogProgress,
  dailyLessonStreak,
  dayIndex,
  isLessonDone,
  lessonsForDay,
  localDayKey,
} from './dailyLesson';

const root = dirname(fileURLToPath(import.meta.url));
const contentDir = join(root, '../trainer/content');
const raw: RawContent = {
  objections: JSON.parse(readFileSync(join(contentDir, 'objections.json'), 'utf8')),
  scenarios: JSON.parse(readFileSync(join(contentDir, 'scenarios.json'), 'utf8')),
  quiz: JSON.parse(readFileSync(join(contentDir, 'quiz.json'), 'utf8')),
  scoring: JSON.parse(readFileSync(join(contentDir, 'scoring.json'), 'utf8')),
};
const content = buildContent(raw);

function attempt(partial: Partial<LearningAttempt> & Pick<LearningAttempt, 'itemType' | 'itemIds' | 'finishedAt'>): LearningAttempt {
  const { itemType, itemIds, finishedAt, id, ...rest } = partial;
  return {
    id: id ?? `a-${finishedAt}-${itemIds[0]}`,
    userId: 'u1',
    partnerId: 'p1',
    role: 'manager',
    context: 'training',
    mode: itemType === 'quiz' ? 'quiz' : itemType === 'scenario' ? 'roleplay' : 'objection',
    itemType,
    itemIds,
    contentVersion: content.contentVersion,
    startedAt: finishedAt,
    finishedAt,
    answers: [],
    total: 4,
    passed: true,
    quiz: null,
    synced: false,
    ...rest,
  };
}

describe('dailyLesson', () => {
  it('каталог менеджера не пустой и содержит отработки', () => {
    const catalog = catalogForRole(content, 'manager');
    assert.ok(catalog.length >= 5);
    assert.ok(catalog.some((l) => l.kind === 'drill'));
    assert.ok(catalog.every((l) => l.title && l.route));
  });

  it('каталог монтажника короче менеджера, но не пустой', () => {
    const crew = catalogForRole(content, 'crew');
    const manager = catalogForRole(content, 'manager');
    assert.ok(crew.length > 0);
    assert.ok(crew.length <= manager.length);
  });

  it('занятия дня стабильны для одной даты и меняются на другой', () => {
    const catalog = catalogForRole(content, 'owner');
    const a = lessonsForDay(catalog, new Date(2026, 10, 9));
    const b = lessonsForDay(catalog, new Date(2026, 10, 9));
    const c = lessonsForDay(catalog, new Date(2026, 10, 10));
    assert.deepEqual(a.map((l) => l.id), b.map((l) => l.id));
    assert.ok(a.length === 1 || a.length === 2);
    assert.notDeepEqual(
      a.map((l) => l.id),
      c.map((l) => l.id),
    );
  });

  it('пройдено по попытке того же дня', () => {
    const catalog = catalogForRole(content, 'manager');
    const day = new Date(2026, 10, 9, 15, 0, 0);
    const lessons = lessonsForDay(catalog, day);
    const first = lessons[0]!;
    const attempts = [
      attempt({
        itemType: first.kind === 'scenario' ? 'scenario' : first.kind === 'quiz' ? 'quiz' : 'objection',
        itemIds: first.kind === 'quiz' ? ['q1'] : [first.itemId],
        finishedAt: '2026-11-09T12:00:00.000Z',
      }),
    ];
    // Локальный день зависит от зоны коробки (Europe/Moscow): 12:00Z = 15:00 MSK 9 ноября.
    assert.equal(localDayKey(new Date(attempts[0]!.finishedAt)), localDayKey(day));
    assert.equal(isLessonDone(first, attempts, day), true);
    assert.equal(isLessonDone(first, attempts, new Date(2026, 10, 8)), false);
  });

  it('серия дней подряд считается по занятиям', () => {
    const catalog = catalogForRole(content, 'manager');
    const now = new Date(2026, 10, 9, 18, 0, 0);
    const d0 = lessonsForDay(catalog, now)[0]!;
    const d1 = lessonsForDay(catalog, new Date(2026, 10, 8))[0]!;
    const attempts = [
      attempt({
        itemType: d0.kind === 'scenario' ? 'scenario' : d0.kind === 'quiz' ? 'quiz' : 'objection',
        itemIds: d0.kind === 'quiz' ? ['q1'] : [d0.itemId],
        finishedAt: '2026-11-09T10:00:00.000Z',
      }),
      attempt({
        itemType: d1.kind === 'scenario' ? 'scenario' : d1.kind === 'quiz' ? 'quiz' : 'objection',
        itemIds: d1.kind === 'quiz' ? ['q1'] : [d1.itemId],
        finishedAt: '2026-11-08T10:00:00.000Z',
      }),
    ];
    assert.ok(dailyLessonStreak(catalog, attempts, now) >= 2);
  });

  it('прогресс каталога растёт после попыток', () => {
    const catalog = catalogForRole(content, 'measurer');
    const drill = catalog.find((l) => l.kind === 'drill')!;
    const before = catalogProgress(catalog, []);
    const after = catalogProgress(catalog, [
      attempt({
        itemType: 'objection',
        itemIds: [drill.itemId],
        finishedAt: '2026-11-01T10:00:00.000Z',
      }),
    ]);
    assert.equal(before.done, 0);
    assert.equal(after.done, 1);
    assert.equal(after.total, before.total);
  });

  it('сводка для роли кабинета sales → manager', () => {
    const view = buildTodayLessonView(content, 'sales', [], new Date(2026, 10, 9));
    assert.ok(view.lessons.length >= 1);
    assert.equal(view.allDoneToday, false);
    assert.equal(view.streakDays, 0);
  });

  it('dayIndex монотонен', () => {
    assert.ok(dayIndex(new Date(2026, 10, 10)) === dayIndex(new Date(2026, 10, 9)) + 1);
  });
});
