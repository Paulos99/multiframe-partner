import assert from 'node:assert/strict';
import test from 'node:test';
import { fitWithin } from './photos/imagePrep';

test('большой снимок вписывается в 1600 по длинной стороне', () => {
  assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3000, 4000, 1600), { width: 1200, height: 1600 });
});

test('маленький снимок не увеличивается', () => {
  assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
});

test('пустые размеры не дают ноль', () => {
  assert.deepEqual(fitWithin(0, 0, 1600), { width: 1, height: 1 });
  assert.deepEqual(fitWithin(5000, 1, 1600), { width: 1600, height: 1 });
});
