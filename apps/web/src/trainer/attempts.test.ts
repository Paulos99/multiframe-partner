import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreStep } from './scoring';
import { testContent } from './testContent';
import { MemoryStore } from './store';
import { buildDrillAttempt, buildQuizAttempt, buildScenarioAttempt, defaultSettings, type Who } from './attempts';
import {
  answerError,
  buildDeck,
  buildQuiz,
  cardKey,
  computeProgress,
  dueCards,
  evaluateScenario,
  highlightRanges,
  isCorrectAnswer,
  needsNote,
  calibrate,
  evaluateDrill,
  objectionsForRole,
  scenariosForRole,
  seededShuffle,
  shuffledOptions,
  streakOf,
  summarizeQuiz,
  trainerRoleOf,
  updateCard,
} from './engine';
import type { AttemptAnswer, ReviewCard } from './types';

const content = testContent();
const who: Who = { userId: 'u1', partnerId: 'org1', role: 'manager' };
const t0 = new Date('2026-10-28T09:00:00.000Z');
const day = (n: number) => new Date(t0.getTime() + n * 86400000);
const cardsMap = (list: ReviewCard[] = []) => new Map(list.map((c) => [c.key, c]));
const obj = (id: string) => content.objections.objections.find((o) => o.id === id)!;

test('роли кабинета сопоставляются ролям тренажёра', () => {
  assert.deepEqual(['admin', 'owner', 'sales', 'measurer', 'crew'].map(trainerRoleOf), ['stp_admin', 'owner', 'manager', 'measurer', 'crew']);
});

test('у каждой из пяти ролей есть возражения, сценарии и вопросы', () => {
  for (const role of ['owner', 'manager', 'measurer', 'crew', 'stp_admin'] as const) {
    assert.ok(objectionsForRole(content, role, false).length > 0, role);
    assert.ok(scenariosForRole(content, role, false).length > 0, role);
    assert.ok(buildQuiz(content, role, false, 'quick', { seed: 's' }).length > 0, role);
  }
  assert.equal(objectionsForRole(content, 'stp_admin', false).length, 36);
});

test('ответ короче 8 слов не принимается, «Не знаю» оформляется отдельно', () => {
  assert.ok(answerError(''));
  assert.ok(answerError('Дорого, да'));
  assert.equal(answerError('Понимаю, цена важна, давайте сравним итоговую экономику всей системы'), null);
});

test('быстрая отработка: эталонные ответы засчитаны и пишут попытку с context=training', () => {
  const o = obj('obj-price-expensive');
  const built = buildDrillAttempt({
    who, content, startedAt: t0, now: t0, cards: cardsMap(), objection: o, phrasing: 0,
    beat1: o.referenceAnswer, beat2: o.pushbackReferenceAnswer, ms: [1000, 2000], skipped: false, manual: false, selfScores: null,
  });
  assert.equal(built.attempt.context, 'training');
  assert.equal(built.attempt.mode, 'objection');
  assert.equal(built.attempt.passed, true);
  assert.equal(built.attempt.synced, false);
  assert.equal(built.attempt.selfScores, null);
  assert.equal(built.attempt.autoScores.objection, 5);
  assert.equal(built.cards[0].box, 2);
  assert.equal(built.attempt.contentVersion, content.contentVersion);
});

test('самооценка идёт в итог, автооценка хранится отдельно', () => {
  const o = obj('obj-price-expensive');
  const base = { who, content, startedAt: t0, now: t0, cards: cardsMap(), objection: o, phrasing: 0, beat1: o.referenceAnswer, beat2: o.pushbackReferenceAnswer, ms: [1, 1] as [number, number], skipped: false, manual: false };
  const auto = buildDrillAttempt({ ...base, selfScores: null });
  const self = buildDrillAttempt({ ...base, selfScores: { discovery: 1, listening: 2, objection: 2, value: 2, honesty: 5 } });
  assert.deepEqual(self.attempt.autoScores, auto.attempt.autoScores);
  assert.equal(self.attempt.finalScores.objection, 2);
  assert.ok(self.attempt.total < auto.attempt.total);
  assert.equal(self.attempt.passed, false);
});

test('«Не знаю»: 1 балл, не засчитано, карточка возвращается в первую коробку', () => {
  const o = obj('obj-price-expensive');
  const prev = updateCard(undefined, { userId: 'u1', itemType: 'objection', itemId: o.id }, true, 5, t0, content);
  const built = buildDrillAttempt({
    who, content, startedAt: t0, now: day(1), cards: cardsMap([prev]), objection: o, phrasing: 0,
    beat1: '', beat2: '', ms: [0, 0], skipped: true, manual: false, selfScores: null,
  });
  assert.equal(built.attempt.total, 1);
  assert.equal(built.attempt.passed, false);
  assert.equal(built.attempt.skipped, true);
  assert.equal(built.cards[0].box, 1);
  assert.equal(built.cards[0].lapses, 1);
});

test('обещание тишины: итог не выше 2,4 и попытка не засчитана', () => {
  const o = obj('obj-price-expensive');
  const built = buildDrillAttempt({
    who, content, startedAt: t0, now: t0, cards: cardsMap(), objection: o, phrasing: 0,
    beat1: `${o.referenceAnswer} Гарантирую полную тишину.`, beat2: o.pushbackReferenceAnswer, ms: [1, 1], skipped: false, manual: false, selfScores: null,
  });
  assert.ok(built.attempt.total <= 2.4);
  assert.equal(built.attempt.passed, false);
  assert.ok(built.attempt.flags.some((f) => f.severity === 'critical'));
});

test('подсказка «Слышу клиента» не выше разбора: без названных пунктов не больше 2, при малом охвате не больше 3', () => {
  const b1 = 'Понятно, давайте сегодня спокойно обсудим погоду и выходные дни.';
  const b2 = 'Согласен, погода хорошая, выходные дни обсудим отдельно потом.';
  let sawGenerous = false;
  for (const o of content.objections.objections) {
    const raw = scoreStep(b1, b2, o, 0, content.scoring);
    if (raw.matchedPointIds.length) continue;
    const ev = evaluateDrill(o, 0, b1, b2, content, false);
    assert.equal(ev.matchedPointIds.length, 0);
    assert.ok((ev.autoScores.listening ?? 9) <= 2, o.id);
    if (raw.scores.listening >= 3) sawGenerous = true;
  }
  assert.ok(sawGenerous, 'эталонный подсчёт здесь щедрее, поправка нужна');
  assert.equal(calibrate({ listening: 5 }, 0.3).listening, 3);
  assert.equal(calibrate({ listening: 5 }, 0.8).listening, 5);
  assert.equal(calibrate({ listening: 1 }, 0).listening, 1);
  const o = content.objections.objections[0];
  const good = evaluateDrill(o, 0, o.referenceAnswer, o.pushbackReferenceAnswer, content, false);
  assert.ok((good.autoScores.listening ?? 0) >= 3);
});

test('пометка нужна при изменении самооценки больше чем на балл', () => {
  assert.equal(needsNote(4, 5), false);
  assert.equal(needsNote(4, 3), false);
  assert.equal(needsNote(4, 2), true);
  assert.equal(needsNote(undefined, 1), false);
});

test('повторение: коробки и сроки 0 / 1 / 3 / 7 / 21 дней, ошибка возвращает в первую', () => {
  let card: ReviewCard | undefined;
  const expected = [1, 3, 7, 21, 21];
  expected.forEach((days, i) => {
    card = updateCard(card, { userId: 'u1', itemType: 'objection', itemId: 'x' }, true, 4, day(0), content);
    assert.equal(card.box, Math.min(5, i + 2));
    assert.equal(Math.round((new Date(card.nextDueAt).getTime() - day(0).getTime()) / 86400000), days);
  });
  card = updateCard(card, { userId: 'u1', itemType: 'objection', itemId: 'x' }, false, 1, day(0), content);
  assert.equal(card.box, 1);
  assert.equal(card.nextDueAt, day(0).toISOString());
});

test('очередь «Сегодня» не больше предела, сверху низкая коробка и большая просрочка', () => {
  const cards: ReviewCard[] = [];
  for (let i = 0; i < 15; i += 1) {
    const c = updateCard(undefined, { userId: 'u1', itemType: 'objection', itemId: `o${i}` }, i % 2 === 0, 3, day(-30 + i), content);
    cards.push(c);
  }
  const due = dueCards(cards, 'objection', day(0), content.scoring.srs.dailyLimit);
  assert.ok(due.length <= 10);
  assert.ok(due.every((c, i) => i === 0 || due[i - 1].box < c.box || (due[i - 1].box === c.box && due[i - 1].nextDueAt <= c.nextDueAt)));
});

test('колода: сначала просроченные, потом новые; размер ограничен', () => {
  const pool = objectionsForRole(content, 'manager', false);
  const first = pool[3];
  const card = updateCard(undefined, { userId: 'u1', itemType: 'objection', itemId: first.id }, false, 1, day(-2), content);
  const deck = buildDeck(content, 'manager', false, [card], day(0), 5);
  assert.equal(deck.length, 5);
  assert.equal(deck[0].id, first.id);
  assert.equal(new Set(deck.map((o) => o.id)).size, 5);
  assert.equal(buildDeck(content, 'manager', false, [], day(0), 100).length, pool.length);
});

test('ролевой сценарий: полный разговор по эталонам засчитан, примеры следующего шага получают 5', () => {
  const sc = content.scenarios.scenarios[1];
  const answers: AttemptAnswer[] = [];
  for (const step of sc.steps) {
    const o = obj(step.objectionId);
    answers.push({ stepId: step.id, beat: 1, clientLine: o.clientPhrasing[step.clientPhrasingIndex], text: o.referenceAnswer, ms: 1 });
    answers.push({ stepId: step.id, beat: 2, clientLine: o.pushback, text: o.pushbackReferenceAnswer, ms: 1 });
  }
  answers.push({ stepId: 'closing', beat: 1, clientLine: sc.closing.clientLine, text: sc.closing.goodExamples[0], ms: 1 });
  const evaluation = evaluateScenario(sc, answers, [], content);
  assert.ok(evaluation.steps.every((s) => s.passed));
  assert.equal(evaluation.autoScores.nextstep, 5);
  assert.equal(evaluation.autoScores.honesty, 5);
  const built = buildScenarioAttempt({ who, content, startedAt: t0, now: t0, cards: cardsMap(), scenario: sc, answers, evaluation, selfScores: null, manualChecks: [] });
  assert.equal(built.attempt.mode, 'roleplay');
  assert.equal(built.attempt.passed, true);
  assert.equal(built.cards.length, new Set(sc.steps.map((s) => s.objectionId)).size);
  // подсказка снижает оценку шага не более чем на балл
  const hinted = evaluateScenario(sc, answers, [sc.steps[0].id], content);
  assert.equal(hinted.steps[0].scores.objection, evaluation.steps[0].scores.objection - 1);
  assert.equal(hinted.steps[1].scores.objection, evaluation.steps[1].scores.objection);
  // пустой разговор: шаги не засчитаны
  const empty = evaluateScenario(sc, [], [], content);
  assert.ok(empty.steps.every((s) => !s.passed));
  assert.equal(empty.autoScores.nextstep, 1);
});

test('викторина: подбор по роли, ловушки, проверка ответов, итог по темам', () => {
  const traps = buildQuiz(content, 'manager', false, 'traps', { seed: 'a' });
  assert.ok(traps.length > 0 && traps.every((q) => q.isTrap));
  const quick = buildQuiz(content, 'crew', false, 'quick', { seed: 'a' });
  assert.equal(quick.length, 10);
  assert.ok(quick.every((q) => q.roles.includes('crew')));
  assert.deepEqual(buildQuiz(content, 'crew', false, 'quick', { seed: 'a' }).map((q) => q.id), quick.map((q) => q.id));
  const topic = content.quiz.topics[0].id;
  assert.ok(buildQuiz(content, 'stp_admin', false, 'topic', { topic, seed: 'a' }).every((q) => q.topic === topic));
  const q = quick[0];
  assert.equal(isCorrectAnswer(q, q.correctOptionIds), true);
  assert.equal(isCorrectAnswer(q, ['нет-такого']), false);
  const answers = quick.map((x, i) => ({ questionId: x.id, selected: i < 8 ? x.correctOptionIds : [], correct: i < 8, ms: 1 }));
  const summary = summarizeQuiz(content, quick, answers);
  assert.equal(summary.percent, 80);
  assert.equal(summary.mistakes.length, 2);
  const built = buildQuizAttempt({ who, content, startedAt: t0, now: t0, cards: cardsMap(), questions: quick, answers });
  assert.equal(built.attempt.passed, true);
  assert.equal(built.cards.length, 10);
  const worse = buildQuizAttempt({ who, content, startedAt: t0, now: t0, cards: cardsMap(), questions: quick, answers: answers.map((a, i) => ({ ...a, correct: i < 5 })) });
  assert.equal(worse.attempt.passed, false);
  // «Повторить» берёт только просроченные
  assert.equal(buildQuiz(content, 'crew', false, 'repeat', { seed: 'a', cards: [], now: t0 }).length, 0);
  const due = buildQuiz(content, 'crew', false, 'repeat', { seed: 'a', cards: worse.cards, now: day(1) });
  assert.ok(due.length > 0);
});

test('порядок вариантов перемешивается с зерном от вопроса и попытки', () => {
  const q = content.quiz.questions[0];
  assert.deepEqual(shuffledOptions(q, '1').map((o) => o.id), shuffledOptions(q, '1').map((o) => o.id));
  assert.equal(shuffledOptions(q, '1').length, q.options.length);
  assert.deepEqual(seededShuffle([1, 2, 3, 4, 5], 'x').sort(), [1, 2, 3, 4, 5]);
});

test('прогресс: средние, освоено / в работе / не начато, серия дней, слабые места', () => {
  const o = obj('obj-price-expensive');
  const base = { who, content, startedAt: t0, cards: cardsMap(), objection: o, phrasing: 0, ms: [1, 1] as [number, number], skipped: false, manual: false, selfScores: null };
  let cards: ReviewCard[] = [];
  const attempts = [];
  for (let d = 0; d < 3; d += 1) {
    const built = buildDrillAttempt({ ...base, now: day(d), cards: cardsMap(cards), beat1: d === 2 ? 'Просто хороший материал для вас, это отличный выбор' : o.referenceAnswer, beat2: o.pushbackReferenceAnswer });
    attempts.push(built.attempt);
    cards = built.cards;
  }
  const progress = computeProgress(content, 'manager', false, attempts, cards, day(2));
  assert.equal(progress.streakDays, 3);
  assert.equal(progress.attempts.length, 3);
  const reason = progress.reasons.find((r) => r.id === o.refusalReasonKey)!;
  assert.equal(reason.inWork + reason.mastered, 1);
  assert.ok(reason.notStarted >= 0 && reason.total === reason.mastered + reason.inWork + reason.notStarted);
  assert.ok(progress.criteriaAvg.every((c) => c.avg === null || (c.avg >= 1 && c.avg <= 5)));
  assert.ok(progress.weakPoints.length > 0);
  assert.equal(streakOf([], day(0)), 0);
});

test('подсветка находит фрагменты в исходном тексте', () => {
  const text = 'Понимаю! Давайте сравним итоговую экономику всей системы, а не только цену.';
  const ranges = highlightRanges(text, ['экономик[а-я]*\\s+(всей\\s+)?систем']);
  assert.equal(ranges.length, 1);
  assert.equal(text.slice(ranges[0][0], ranges[0][1]), 'экономику всей систем');
});

test('хранилище: данные привязаны к пользователю, сброс удаляет только его', async () => {
  const store = new MemoryStore();
  const o = obj('obj-price-expensive');
  const mk = (userId: string) =>
    buildDrillAttempt({ who: { ...who, userId }, content, startedAt: t0, now: t0, cards: cardsMap(), objection: o, phrasing: 0, beat1: o.referenceAnswer, beat2: o.pushbackReferenceAnswer, ms: [1, 1], skipped: false, manual: false, selfScores: null });
  for (const u of ['u1', 'u2']) {
    const b = mk(u);
    await store.addAttempt(b.attempt);
    await store.putCards(b.cards);
    await store.putSettings({ ...defaultSettings(u, content), deckSize: 10 });
  }
  assert.equal((await store.attempts('u1')).length, 1);
  assert.equal(await store.pendingSync('u1'), 1);
  await store.reset('u1');
  assert.equal((await store.attempts('u1')).length, 0);
  assert.equal((await store.cards('u1')).length, 0);
  assert.equal(await store.settings('u1'), null);
  assert.equal(await store.pendingSync('u1'), 0);
  assert.equal((await store.attempts('u2')).length, 1);
  assert.equal((await store.cards('u2')).length, 1);
  assert.equal((await store.settings('u2'))?.deckSize, 10);
  assert.ok((await store.cards('u2'))[0].key === cardKey('u2', 'objection', o.id));
});

test('черновик сценария живёт 7 дней', async () => {
  const store = new MemoryStore();
  const fresh = { key: 'u1:s', userId: 'u1', scenarioId: 's', savedAt: new Date().toISOString(), stepIndex: 1, answers: [], hintsUsed: [], startedAt: t0.toISOString() };
  await store.putDraft(fresh);
  assert.ok(await store.draft('u1', 's'));
  await store.putDraft({ ...fresh, savedAt: new Date(Date.now() - 8 * 86400000).toISOString() });
  assert.equal(await store.draft('u1', 's'), null);
});

test('тренажёр не обращается к сети и к рабочим данным кабинета', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const files = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.|testContent/.test(f));
  assert.ok(files.length > 5);
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf-8');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/.test(src), `${f}: сетевой вызов`);
    // Только корень берёт у кабинета личность пользователя (id, роль, организация); рабочие данные не читает.
    const banned = f === 'TrainerRoot.tsx' ? /partner\/(localStore|syncEngine|apiClient|projectClient|offlineDb|analytics)|\.\.\/analytics/ : /partner\/(localStore|syncEngine|apiClient|projectClient|offlineDb|PartnerContext|analytics)|\.\.\/analytics/;
    assert.ok(!banned.test(src), `${f}: рабочие данные`);
  }
});
