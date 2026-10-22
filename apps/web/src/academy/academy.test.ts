import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACADEMY_ATTEMPTS_STORAGE_KEY,
  completeAcademyAttempt,
  detectFalsePromise,
  evaluateSellMultiframeAttempt,
  isAttemptMastered,
  isScenarioMastered,
  loadAcademyAttempts,
  startAcademyAttempt,
} from './scenarios/sellMultiframe.ts';
import {
  OBJECTION_CASES,
  evaluateObjectionCase,
} from './scenarios/objections.ts';

function createMockStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

test('false promise penalty lowers score in Sell MultiFrame and Objections', () => {
  const cleanEval = evaluateSellMultiframeAttempt([
    'start_discovery',
    'pitch_accurate',
    'objection_handled',
    'closing_tools',
  ]);
  assert.equal(cleanEval.hasFalsePromise, false);
  assert.equal(cleanEval.baseScore, 100);
  assert.equal(cleanEval.finalScore, 100);
  assert.equal(cleanEval.passed, true);

  const falsePromiseInNoteEval = evaluateSellMultiframeAttempt(
    ['start_discovery', 'pitch_accurate', 'objection_handled', 'closing_tools'],
    'Обещаем вам: это гарантированная тишина и снизит на 45 дБ!',
  );
  assert.equal(falsePromiseInNoteEval.hasFalsePromise, true);
  assert.ok(falsePromiseInNoteEval.finalScore < cleanEval.finalScore);
  assert.equal(falsePromiseInNoteEval.finalScore, 75);
  assert.ok(falsePromiseInNoteEval.errorTypes.includes('false_promise'));
  assert.equal(falsePromiseInNoteEval.passed, false);

  const falsePromiseChoiceEval = evaluateSellMultiframeAttempt([
    'start_discovery',
    'pitch_accurate',
    'objection_handled',
    'closing_false_guarantee',
  ]);
  assert.equal(falsePromiseChoiceEval.hasFalsePromise, true);
  assert.equal(falsePromiseChoiceEval.baseScore, 75);
  assert.equal(falsePromiseChoiceEval.finalScore, 50);

  const priceCase = OBJECTION_CASES.find((c) => c.category === 'price')!;
  const cleanObjection = evaluateObjectionCase(priceCase, ['price_1_best', 'price_2_best']);
  const falseObjection = evaluateObjectionCase(priceCase, ['price_1_false', 'price_2_best']);
  assert.ok(falseObjection.finalScore < cleanObjection.finalScore);
  assert.equal(falseObjection.hasFalsePromise, true);
  assert.equal(detectFalsePromise('гарантированная тишина в спальне').hasFalsePromise, true);
  assert.equal(detectFalsePromise('уберёт 45 дБ любого шума').hasFalsePromise, true);
});

test('completed attempt has context training and persists in mf_academy_attempts_v1', () => {
  const storage = createMockStorage();
  const started = startAcademyAttempt('sell_multiframe', storage, '2026-10-22T08:00:00.000Z');
  assert.equal(started.context, 'training');
  assert.equal(started.status, 'started');
  assert.equal(started.completedAt, null);

  const completed = completeAcademyAttempt(
    started.id,
    {
      baseScore: 90,
      score: 90,
      hasFalsePromise: true,
      errorTypes: ['false_promise'],
    },
    storage,
    '2026-10-22T08:04:00.000Z',
  );
  assert.equal(completed.context, 'training');
  assert.equal(completed.status, 'completed');
  assert.equal(completed.completedAt, '2026-10-22T08:04:00.000Z');
  assert.equal(completed.score, 65);

  const rawJson = storage.getItem(ACADEMY_ATTEMPTS_STORAGE_KEY);
  assert.ok(rawJson);
  const loaded = loadAcademyAttempts(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, started.id);
  assert.equal(loaded[0].scenarioId, 'sell_multiframe');
  assert.equal(loaded[0].status, 'completed');
  assert.equal(loaded[0].context, 'training');
});

test('opening without complete is not mastery', () => {
  const storage = createMockStorage();
  const started = startAcademyAttempt('sell_multiframe', storage, '2026-10-22T09:00:00.000Z');

  assert.equal(isAttemptMastered(started), false);
  assert.equal(isScenarioMastered(loadAcademyAttempts(storage), 'sell_multiframe'), false);

  const completedGood = completeAcademyAttempt(
    started.id,
    {
      score: 95,
      hasFalsePromise: false,
      errorTypes: [],
    },
    storage,
    '2026-10-22T09:05:00.000Z',
  );
  assert.equal(isAttemptMastered(completedGood), true);
  assert.equal(isScenarioMastered(loadAcademyAttempts(storage), 'sell_multiframe'), true);
});
