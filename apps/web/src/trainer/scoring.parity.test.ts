import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson, testContent } from './testContent';
import { allForbidden, forbiddenHits, scoreStep, scoreText, total, norm, sentences, round2 } from './scoring';
import type { CriterionId, Flag, Mode, Objection } from './types';

type Fixtures = {
  steps: { objectionId: string; recipe: string; scores: Record<CriterionId, number>; hits: Flag[]; cov: number; missing: string[]; total: number }[];
  free: { key: string; text: string; scores: Record<CriterionId, number>; hits: Flag[]; cov: number; missing: string[] }[];
  nextSteps: { scenarioId: string; index: number; scores: Record<CriterionId, number>; hits: Flag[] }[];
  totals: { mode: Mode; scores: Record<CriterionId, number>; total: number }[];
};
const fixtures = readJson<Fixtures>('parity.fixtures.json');
const content = testContent();
const { scoring } = content;
const byId = new Map(content.objections.objections.map((o) => [o.id, o]));
const firstSentence = (t: string) => t.split(/[.!?\n;]+/)[0];

function recipe(o: Objection, name: string): [string, string, number] {
  const r1 = o.referenceAnswer;
  const r2 = o.pushbackReferenceAnswer;
  switch (name) {
    case 'ref': return [r1, r2, 0];
    case 'phr1': return [r1, r2, 1];
    case 'swap': return [r2, r1, 0];
    case 'unknown': return ['Не знаю, это просто хороший материал.', 'Не знаю.', 0];
    case 'silence': return [`${r1} Гарантирую полную тишину.`, r2, 0];
    case 'half': return [firstSentence(r1), firstSentence(r2), 0];
    case 'question': return [`Скажите, что вы слышите вечером и когда? ${firstSentence(r1)}.`, r2, 0];
    default: throw new Error(name);
  }
}
const sortFlags = (flags: Flag[]) => flags.map((f) => `${f.id}|${f.severity}|${f.fragment}`).sort();

test('шаги: оценки, охват, нарушения и итог совпадают с эталоном score_reference.py', () => {
  assert.equal(fixtures.steps.length, content.objections.objections.length * 7);
  for (const fx of fixtures.steps) {
    const o = byId.get(fx.objectionId)!;
    const [b1, b2, idx] = recipe(o, fx.recipe);
    const got = scoreStep(b1, b2, o, idx, scoring);
    const where = `${fx.objectionId}/${fx.recipe}`;
    assert.deepEqual(got.scores, fx.scores, where);
    assert.deepEqual(sortFlags(got.hits), sortFlags(fx.hits), where);
    assert.ok(Math.abs(got.cov - fx.cov) < 1e-12, where);
    assert.deepEqual(got.missingCritical, fx.missing, where);
    assert.equal(total(got.scores, 'objection', scoring), fx.total, where);
  }
});

test('свободные фразы: честность, отрицания, исключения и остальные критерии совпадают с эталоном', () => {
  const first = byId.get(content.objections.objections[0].id)!;
  for (const fx of fixtures.free) {
    const got = scoreText(fx.text, first.requiredPoints, first.clientPhrasing[0], scoring);
    assert.deepEqual(got.scores, fx.scores, fx.key);
    assert.deepEqual(sortFlags(got.hits), sortFlags(fx.hits), fx.key);
    assert.ok(Math.abs(got.cov - fx.cov) < 1e-12, fx.key);
    assert.deepEqual(got.missingCritical, fx.missing, fx.key);
  }
});

test('нарушения: «Гарантирую тишину» — критическое, «Мы не обещаем тишину» — нет', () => {
  assert.ok(forbiddenHits('Гарантирую полную тишину, вы ничего не услышите.', scoring).some((h) => h.severity === 'critical'));
  assert.deepEqual(forbiddenHits('Мы не обещаем тишину: ни одна система не делает квартиру абсолютно беззвучной.', scoring), []);
  assert.deepEqual(forbiddenHits('Система не поддерживает горения и не выделяет опасного чёрного дыма.', scoring), []);
  assert.ok(forbiddenHits('Материал негорючий, он совсем не горит.', scoring).length > 0);
  assert.ok(forbiddenHits('Эффект до 17 дБ.', scoring).length > 0);
  assert.ok(forbiddenHits('Это гипоаллергенная система.', scoring).length > 0);
});

test('следующий шаг: все примеры из сценариев получают 5', () => {
  assert.equal(fixtures.nextSteps.length, content.scenarios.scenarios.reduce((n, s) => n + s.closing.goodExamples.length, 0));
  for (const fx of fixtures.nextSteps) {
    const s = content.scenarios.scenarios.find((x) => x.id === fx.scenarioId)!;
    const got = scoreText(s.closing.goodExamples[fx.index], [], '', scoring);
    assert.deepEqual(got.scores, fx.scores, fx.scenarioId);
    assert.equal(got.scores.nextstep, 5);
    assert.deepEqual(got.hits, []);
  }
});

test('итог: веса пересчитываются, честность ограничивает итог 2,4', () => {
  for (const fx of fixtures.totals) assert.equal(total(fx.scores, fx.mode, scoring), fx.total, JSON.stringify(fx));
  const all5 = { discovery: 5, listening: 5, objection: 5, value: 5, honesty: 5, nextstep: 5 } as Record<CriterionId, number>;
  assert.equal(total(all5, 'objection', scoring), 5);
  assert.equal(total({ ...all5, honesty: 1 }, 'roleplay', scoring), 2.4);
  // в быстрой отработке «Следующий шаг» не участвует
  assert.equal(total({ ...all5, nextstep: 1 }, 'objection', scoring), 5);
});

test('эталонные ответы всех возражений получают 5 по охвату и честности', () => {
  for (const o of content.objections.objections) {
    const got = scoreStep(o.referenceAnswer, o.pushbackReferenceAnswer, o, 0, scoring);
    assert.equal(got.scores.objection, 5, o.id);
    assert.equal(got.scores.honesty, 5, o.id);
    assert.deepEqual(got.missedPointIds, [], o.id);
  }
});

test('все шаблоны компилируются в JavaScript и не содержат \\b, \\w, «ё»', () => {
  const all: string[] = [];
  for (const r of allForbidden(scoring)) all.push(...r.patterns, ...(r.exceptIfSentenceMatches ?? []));
  for (const o of content.objections.objections) for (const p of o.requiredPoints) all.push(...p.anyOf);
  all.push(...scoring.ackStarters, ...scoring.openQuestionStarters, scoring.valueLinkPattern);
  all.push(...scoring.nextStep.action, ...scoring.nextStep.time, ...scoring.nextStep.who);
  for (const p of all) {
    assert.doesNotThrow(() => new RegExp(p), p);
    assert.ok(!/\\[bBwW]/.test(p) && !p.includes('ё'), p);
  }
});

test('нормализация и деление на предложения', () => {
  assert.equal(norm('  Ёжик «Тишина»\n  будет  '), 'ежик тишина будет');
  assert.deepEqual(sentences('Один. Два! Три? Четыре; пять'), ['Один', 'Два', 'Три', 'Четыре', 'пять']);
  assert.equal(round2(2.345), 2.35);
  assert.equal(round2(0.125), 0.12);
});
