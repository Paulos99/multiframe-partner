import assert from 'node:assert/strict';
import test from 'node:test';
import { calcModeLabel } from './calcModeLabel.ts';

test('calculator modes show Russian labels, never raw keys', () => {
  assert.equal(calcModeLabel('draw'), 'Схема');
  assert.equal(calcModeLabel('dims'), 'Размеры');
  assert.equal(calcModeLabel('area'), 'Только площадь');
  assert.equal(calcModeLabel('polygon'), 'Полигон');
  assert.equal(calcModeLabel('unknown'), 'Не указано');
  assert.equal(calcModeLabel(''), 'Не указано');
  assert.equal(calcModeLabel(undefined), 'Не указано');
  assert.equal(calcModeLabel('transform'), 'Другой режим');
});
