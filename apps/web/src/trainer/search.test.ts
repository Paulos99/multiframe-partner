import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSearchEntries, normalizeText, queryTokens, searchBank, stemOf } from './search';
import { testContent } from './testContent';

const entries = () => buildSearchEntries(testContent());

test('запрос приводится к нижнему регистру, «ё» к «е», без знаков', () => {
  assert.equal(normalizeText('  Всё, «ГОРЕНИЕ»! '), 'все горение');
  assert.deepEqual(queryTokens('Цена  дорого'), ['цена', 'дорого']);
  assert.equal(stemOf('дот'), 'дот');
  assert.equal(stemOf('горение'), 'горени'.slice(0, 5));
});

test('пустой запрос ничего не находит', () => {
  assert.deepEqual(searchBank(entries(), ''), []);
  assert.deepEqual(searchBank(entries(), '   !! '), []);
});

test('слово «цена» находит возражение про цену раньше остальных и отдаёт ответ с объяснением', () => {
  const hits = searchBank(entries(), 'цена');
  assert.ok(hits.length >= 2);
  const first = hits[0].entry;
  assert.equal(first.kind, 'objection');
  assert.ok(first.answer.length > 40, 'эталонный ответ есть');
  assert.ok(first.explanation.length > 10, 'объяснение есть');
  assert.ok(first.question.length > 5);
});

test('«горение» находит карточки; регистр и форма слова не мешают', () => {
  const a = searchBank(entries(), 'горение').map((h) => h.entry.id);
  const b = searchBank(entries(), 'ГОРЕНИЯ').map((h) => h.entry.id);
  assert.ok(a.length > 0);
  assert.deepEqual(a, b);
});

test('несколько слов сужают выдачу: нужны все', () => {
  const one = searchBank(entries(), 'цена').length;
  const two = searchBank(entries(), 'цена дорого').length;
  assert.ok(two <= one);
  assert.equal(searchBank(entries(), 'цена яблокоящер').length, 0);
});

test('в выдаче есть и возражения, и вопросы проверки знаний', () => {
  const kinds = new Set(searchBank(entries(), 'звукоизоляция').map((h) => h.entry.kind));
  assert.ok(kinds.has('objection') && kinds.has('question'));
});

test('вопрос проверки знаний отдаёт верный вариант как ответ', () => {
  const hit = searchBank(entries(), 'каркас панели').find((h) => h.entry.id === 'quiz-frame-material');
  assert.ok(hit);
  assert.match(hit.entry.answer, /вспененного полипропилена/);
});

test('в тексте поиска нет ссылок на видео: источники не попадают в карточки', () => {
  for (const e of entries()) assert.doesNotMatch(`${e.answer} ${e.explanation} ${e.question}`, /видео|ролик/i, e.id);
});
