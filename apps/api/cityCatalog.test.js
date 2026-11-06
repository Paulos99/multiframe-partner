import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ensureIndexFromTsv,
  isKnownCity,
  resolveCity,
  searchCities,
} from '../../packages/shared/cityCatalog.js';
import ruCitiesTsv from '../../packages/shared/data/ru-cities.js';
import cisCitiesTsv from '../../packages/shared/data/cis-cities.js';

const ruFile = readFileSync(new URL('../../packages/shared/data/ru-cities.tsv', import.meta.url), 'utf8');
const cisFile = readFileSync(new URL('../../packages/shared/data/cis-cities.tsv', import.meta.url), 'utf8');
assert.equal(ruCitiesTsv.replace(/\r\n/g, '\n'), ruFile.replace(/\r\n/g, '\n'));
assert.equal(cisCitiesTsv.replace(/\r\n/g, '\n'), cisFile.replace(/\r\n/g, '\n'));
ensureIndexFromTsv(`${ruCitiesTsv}\n${cisCitiesTsv}`);

test('Шуя находится с регионом', () => {
  const hits = searchCities('Шуя');
  assert.equal(hits[0]?.label, 'Шуя — Ивановская область');
  assert.equal(resolveCity('Шуя').city, 'Шуя — Ивановская область');
  assert.equal(resolveCity('шуя').city, 'Шуя — Ивановская область');
  assert.equal(resolveCity('Шуя — Ивановская область').city, 'Шуя — Ивановская область');
});

test('города Беларуси, Казахстана и Узбекистана находятся', () => {
  assert.equal(resolveCity('Минск').city, 'Минск — Минск');
  assert.equal(resolveCity('Алматы').city, 'Алматы — Алматы');
  assert.equal(resolveCity('Ташкент').city, 'Ташкент — Ташкент');
  assert.ok(searchCities('Минск').some((row) => row.name === 'Минск'));
  assert.ok(searchCities('Алматы').some((row) => row.name === 'Алматы'));
  assert.ok(searchCities('Ташкент').some((row) => row.name === 'Ташкент'));
});

test('произвольный текст не принимается', () => {
  const bad = resolveCity('ГГ');
  assert.equal(bad.ok, false);
  assert.equal(bad.message, 'Такого города нет');
  assert.equal(isKnownCity('ГГ'), false);
  assert.equal(isKnownCity(''), true);
  assert.equal(isKnownCity('Москва'), true);
  assert.equal(isKnownCity('1'), false);
  const one = resolveCity('1');
  assert.equal(one.ok, false);
  assert.equal(one.message, 'Такого города нет');
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
