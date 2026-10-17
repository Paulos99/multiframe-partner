import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ensureIndexFromTsv,
  isKnownCity,
  resolveCity,
  searchCities,
} from './cityCatalog.js';
import ruCitiesTsv from './data/ru-cities.js';

const tsvFile = readFileSync(new URL('./data/ru-cities.tsv', import.meta.url), 'utf8');
assert.equal(ruCitiesTsv, tsvFile);
ensureIndexFromTsv(ruCitiesTsv);

test('Шуя находится с регионом', () => {
  const hits = searchCities('Шуя');
  assert.equal(hits[0]?.label, 'Шуя — Ивановская область');
  assert.equal(resolveCity('Шуя').city, 'Шуя — Ивановская область');
  assert.equal(resolveCity('шуя').city, 'Шуя — Ивановская область');
  assert.equal(resolveCity('Шуя — Ивановская область').city, 'Шуя — Ивановская область');
});

test('произвольный текст не принимается', () => {
  const bad = resolveCity('ГГ');
  assert.equal(bad.ok, false);
  assert.equal(isKnownCity('ГГ'), false);
  assert.equal(isKnownCity(''), true);
  assert.equal(isKnownCity('Москва'), true);
});

test('одноимённые города требуют регион', () => {
  const ambiguous = resolveCity('Киров');
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.message, /регион/);
  assert.equal(resolveCity('Киров — Кировская область').city, 'Киров — Кировская область');
  const hits = searchCities('Киров');
  assert.ok(hits.length >= 2);
  assert.ok(hits.every((row) => row.label.includes('—')));
});

test('уже сохранённый невалидный город не переписывается', () => {
  assert.deepEqual(resolveCity('ГГ', 'ГГ'), { ok: true, city: 'ГГ' });
  assert.equal(resolveCity('Москва', 'Москва').city, 'Москва');
});
