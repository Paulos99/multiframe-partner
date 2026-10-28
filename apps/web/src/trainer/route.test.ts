import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrainerHash, trainerHash, trainerHashOpen, type TrainerRoute } from './route';

test('адреса тренажёра разбираются и собираются обратно', () => {
  const routes: TrainerRoute[] = [
    { page: 'home' },
    { page: 'drill' },
    { page: 'drill', objectionId: 'obj-price-expensive' },
    { page: 'scenarios' },
    { page: 'scenario', id: 'sc-spouse', step: 'situation' },
    { page: 'scenario', id: 'sc-spouse', step: 'talk' },
    { page: 'scenario', id: 'sc-spouse', step: 'result' },
    { page: 'quiz', step: 'start' },
    { page: 'quiz', step: 'run' },
    { page: 'quiz', step: 'result' },
    { page: 'progress' },
    { page: 'bank' },
    { page: 'bank', id: 'obj-trust-tests' },
  ];
  for (const r of routes) assert.deepEqual(parseTrainerHash(trainerHash(r)), r);
});

test('чужие адреса не считаются адресами тренажёра', () => {
  assert.equal(trainerHashOpen('#project/1/overview'), false);
  assert.equal(trainerHashOpen(''), false);
  assert.equal(trainerHashOpen('#trainer/quiz'), true);
  assert.deepEqual(parseTrainerHash('#staff/12'), { page: 'home' });
});
