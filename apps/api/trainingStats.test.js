import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  TRAINING_CRITERIA,
  TRAINING_LEVELS,
  levelFor,
  normalizeTrainingAttempt,
  summarizeCompanyTraining,
  summarizeUserTraining,
} from '../../packages/shared/trainingStats.js';
import { demoTrainingFor } from '../../packages/shared/trainingDemo.js';

const scoring = JSON.parse(readFileSync(new URL('../web/src/trainer/content/scoring.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-10-29T12:00:00Z');
const DAY = 86400000;

const att = (i, share, over = {}) => ({
  id: `a${i}`,
  mode: 'objection',
  scheme: 2,
  itemIds: ['obj-1'],
  finishedAt: new Date(NOW - i * DAY).toISOString(),
  firstTryCorrect: share,
  count: 2,
  total: 4,
  passed: share >= 0.75,
  ...over,
});

test('уровни и критерии совпадают с тренажёром (scoring.json)', () => {
  assert.deepEqual(TRAINING_LEVELS, scoring.choiceMode.passThresholds.levels);
  assert.deepEqual(TRAINING_CRITERIA, scoring.criteria.map(({ id, title }) => ({ id, title })));
});

test('уровень по границам', () => {
  assert.equal(levelFor(null).id, 'new');
  assert.equal(levelFor(0.74).id, 'new');
  assert.equal(levelFor(0.75).id, 'basic');
  assert.equal(levelFor(0.89).id, 'basic');
  assert.equal(levelFor(0.9).id, 'pro');
});

test('сводка по человеку: доля по последним десяти подходам, слабые места, материалы', () => {
  const attempts = [];
  for (let i = 1; i <= 12; i += 1) {
    attempts.push(
      normalizeTrainingAttempt(
        att(i, i <= 10 ? 1 : 0, {
          criteria: { honesty: 2, listening: 5 },
          misses: i === 1 ? [{ objectionId: 'obj-1', reasonKey: 'price_too_high', errorType: 'vague', violates: 'honesty' }] : [],
        }),
        NOW,
      ),
    );
  }
  const s = summarizeUserTraining(attempts, [
    { id: 'm1', materialId: 'x', title: 'Х', at: new Date(NOW - 1000).toISOString() },
    { id: 'm2', materialId: 'x', title: 'Х', at: new Date(NOW - 2000).toISOString() },
  ]);
  assert.equal(s.sets, 12);
  assert.equal(s.levelShare, 1, 'старые два подхода в окно не входят');
  assert.equal(s.level.title, 'Мастер');
  assert.deepEqual(s.weakCriteria.map((c) => c.id), ['honesty']);
  assert.deepEqual(s.weakTopics, [{ kind: 'reason', key: 'price_too_high', count: 1 }]);
  assert.equal(s.materialsOpened, 1);
  assert.equal(s.materialOpens, 2);
  assert.equal(s.lastActivityAt, new Date(NOW - 1000).toISOString(), 'открытие материала — тоже активность');
});

test('пустое обучение не ломает сводку', () => {
  const s = summarizeUserTraining([], []);
  assert.equal(s.sets, 0);
  assert.equal(s.levelShare, null);
  assert.equal(s.level.title, 'Начинающий');
  assert.equal(s.lastActivityAt, null);
});

test('сводка по компании: обучены, средняя доля, активные за 7 и 30 дней, слабые темы', () => {
  const mk = (n, share, topic) =>
    summarizeUserTraining(
      Array.from({ length: n }, (_, i) =>
        normalizeTrainingAttempt(att(i + 1, share, { misses: topic ? [{ objectionId: 'o', reasonKey: topic }] : [] }), NOW),
      ),
    );
  const company = summarizeCompanyTraining([mk(3, 1, null), mk(2, 0.5, 'doubt_effect'), mk(0, 0, null)], NOW);
  assert.equal(company.staffTotal, 3);
  assert.equal(company.trained, 2);
  assert.equal(company.avgShare, 0.75);
  assert.equal(company.active7, 2);
  assert.equal(company.active30, 2);
  assert.deepEqual(company.levels, { new: 1, basic: 0, pro: 1 });
  assert.equal(company.weakTopics[0].key, 'doubt_effect');
});

test('запись подхода: обрезка и защита от мусора', () => {
  const a = normalizeTrainingAttempt(
    att(1, 7, { total: 99, itemIds: Array.from({ length: 100 }, (_, i) => `i${i}`), criteria: { honesty: 9, nope: 3, value: 4.123 }, free: 'текст' }),
    NOW,
  );
  assert.equal(a.firstTryCorrect, 1);
  assert.equal(a.total, 5);
  assert.equal(a.itemIds.length, 60);
  assert.deepEqual(a.criteria, { honesty: null, value: 4.12 });
  assert.equal('free' in a, false);
  assert.equal(normalizeTrainingAttempt({ ...att(1, 1), finishedAt: new Date(NOW + 9 * DAY).toISOString() }, NOW).finishedAt, new Date(NOW).toISOString());
});

test('демо-данные детерминированы и дают разные уровни', () => {
  assert.deepEqual(demoTrainingFor('sales1', NOW), demoTrainingFor('sales1', NOW));
  const levels = ['sales1', 'exec1', 'crew1', 'sales2', 'exec2'].map((l) => {
    const d = demoTrainingFor(l, NOW);
    return summarizeUserTraining(d.attempts, d.materials).level.title;
  });
  assert.equal(levels[0], 'Мастер');
  assert.ok(levels.includes('Уверенный') && levels.includes('Начинающий'), levels.join());
  assert.deepEqual(demoTrainingFor('crew2', NOW), { attempts: [], materials: [] });
});
