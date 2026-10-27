import assert from 'node:assert/strict';
import test from 'node:test';
import { noiseKpiLines } from './noiseKpi.ts';

test('воздушный шум: крупно процент, мелко децибелы и Rw', () => {
  const lines = noiseKpiLines('air', 45.2, 52.4, 55.4);
  assert.equal(lines.primary, 'на 55% тише');
  assert.equal(lines.secondary, '45 → 52 дБ · разница 7 дБ · Rw');
  assert.ok(lines.primary.length < lines.secondary.length || lines.primary.startsWith('на '));
});

test('ударный шум: крупно процент, мелко децибелы и Lnw', () => {
  const lines = noiseKpiLines('impact', 68, 55, 62);
  assert.equal(lines.primary, 'на 62% тише');
  assert.equal(lines.secondary, '68 → 55 дБ · разница 13 дБ · Lnw');
});
