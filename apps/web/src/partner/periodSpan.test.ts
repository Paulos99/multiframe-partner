import assert from 'node:assert/strict';
import test from 'node:test';
import { spansMoreThanTwoMonths } from './periodSpan.ts';

test('«По месяцам» only for periods longer than two months', () => {
  assert.equal(spansMoreThanTwoMonths('2026-10-12', '2026-10-18', []), false);
  assert.equal(spansMoreThanTwoMonths('2026-09-19', '2026-10-18', []), false);
  assert.equal(spansMoreThanTwoMonths('2026-08-18', '2026-10-18', []), false);
  assert.equal(spansMoreThanTwoMonths('2026-08-17', '2026-10-18', []), true);
  assert.equal(spansMoreThanTwoMonths('2026-01-01', '2026-10-18', []), true);
});

test('«Всё время» uses the series range', () => {
  assert.equal(spansMoreThanTwoMonths(null, null, []), false);
  assert.equal(spansMoreThanTwoMonths(null, null, [{ day: '2026-10-01' }, { day: '2026-10-18' }]), false);
  assert.equal(spansMoreThanTwoMonths(null, null, [{ day: '2026-10-18' }, { day: '2026-06-01' }]), true);
  assert.equal(spansMoreThanTwoMonths(null, '2026-10-18', [{ day: '2026-07-01' }]), true);
});
