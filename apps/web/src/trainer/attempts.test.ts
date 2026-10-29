import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testContent } from './testContent';
import { MemoryStore } from './store';
import { buildDrillAttempt, buildQuizAttempt, buildScenarioAttempt, defaultSettings, scenarioCriteria, type Who } from './attempts';
import {
  ERROR_LABELS,
  isChoicePassed,
  levelByShare,
  makePick,
  scenarioSlots,
  scoreChoices,
  shuffleOptions,
  slotChoice,
  slotClientLine,
  drillChoice,
  drillLines,
  type Try,
} from './choice';
import {
  buildDeck,
  buildQuiz,
  cardKey,
  computeProgress,
  dueCards,
  isCorrectAnswer,
  isLegacyAttempt,
  isLegacyCard,
  objectionsForRole,
  scenariosForRole, questionsForRole,
  seededShuffle,
  shuffledOptions,
  streakOf,
  summarizeQuiz,
  trainerRoleOf,
  updateCard,
} from './engine';
import { hideOpenIssues } from './content';
import { checkPractice } from './practice';
import { highlightRanges } from './engine';
import type { Choice, LearningAttempt, Objection, Pick, ReviewCard, Scenario } from './types';

const content = testContent();
const who: Who = { userId: 'u1', partnerId: 'org1', role: 'manager' };
const t0 = new Date('2026-10-28T09:00:00.000Z');
const day = (n: number) => new Date(t0.getTime() + n * 86400000);
const cardsMap = (list: ReviewCard[] = []) => new Map(list.map((c) => [c.key, c]));
const obj = (id: string) => content.objections.objections.find((o) => o.id === id)!;

type How = 'right' | 'wrong' | 'false';
/** Попытки выбора: верно сразу, сначала ошибка (не ложное обещание) или сначала ложное обещание. */
function tries(choice: Choice, how: How): Try[] {
  const right = choice.options.find((o) => o.correct)!;
  if (how === 'right') return [{ optionId: right.id, ms: 1 }];
  const wrong =
    how === 'false'
      ? (choice.options.find((o) => o.errorType === 'false_promise') ?? choice.options.find((o) => !o.correct)!)
      : (choice.options.find((o) => !o.correct && o.errorType !== 'false_promise') ?? choice.options.find((o) => !o.correct)!);
  return [{ optionId: wrong.id, ms: 1 }, { optionId: right.id, ms: 1 }];
}
function drillPicks(o: Objection, h1: How, h2: How): [Pick, Pick] {
  const lines = drillLines(o, 0);
  return [
    makePick({ stepId: o.id, objectionId: o.id, beat: 1, clientLine: lines[0], tries: tries(drillChoice(o, 1), h1), choice: drillChoice(o, 1) }),
    makePick({ stepId: o.id, objectionId: o.id, beat: 2, clientLine: lines[1], tries: tries(drillChoice(o, 2), h2), choice: drillChoice(o, 2) }),
  ];
}
function scenarioPicks(s: Scenario, how: (slotKey: string) => How): Pick[] {
  return scenarioSlots(s).map((slot) =>
    makePick({ stepId: slot.stepId, objectionId: slot.objectionId, beat: slot.beat, clientLine: slotClientLine(s, slot), tries: tries(slotChoice(s, slot), how(slot.key)), choice: slotChoice(s, slot) }),
  );
}
const drillInput = (o: Objection, picks: [Pick, Pick], at = t0, cards: ReviewCard[] = []) => ({ who, content, startedAt: t0, now: at, cards: cardsMap(cards), objection: o, picks });

test('роли кабинета сопоставляются ролям тренажёра', () => {
  assert.deepEqual(['admin', 'owner', 'sales', 'measurer', 'crew'].map(trainerRoleOf), ['stp_admin', 'owner', 'manager', 'measurer', 'crew']);
});

test('менеджер StP видит все сценарии, возражения и вопросы всех ролей без настройки', () => {
  assert.equal(trainerRoleOf('stp_manager'), 'stp_manager');
  assert.equal(trainerRoleOf('sales'), 'manager');
  assert.equal(scenariosForRole(content, 'stp_manager', false).length, content.scenarios.scenarios.length);
  assert.equal(objectionsForRole(content, 'stp_manager', false).length, content.objections.objections.length);
  assert.equal(questionsForRole(content, 'stp_manager', false).length, content.quiz.questions.length);
  assert.ok(scenariosForRole(content, 'stp_manager', false).length > scenariosForRole(content, 'manager', false).length);
  assert.ok(buildQuiz(content, 'stp_manager', false, 'quick', { seed: 's' }).length > 0);
});

test('у каждой из пяти ролей есть возражения, сценарии и вопросы', () => {
  for (const role of ['owner', 'manager', 'measurer', 'crew', 'stp_admin'] as const) {
    assert.ok(objectionsForRole(content, role, false).length > 0, role);
    assert.ok(scenariosForRole(content, role, false).length > 0, role);
    assert.ok(buildQuiz(content, role, false, 'quick', { seed: 's' }).length > 0, role);
  }
  assert.equal(objectionsForRole(content, 'stp_admin', false).length, content.objections.objections.length);
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
  const card: ReviewCard = { ...updateCard(undefined, { userId: 'u1', itemType: 'objection', itemId: first.id }, false, 1, day(-2), content), scheme: 2 };
  const deck = buildDeck(content, 'manager', false, [card], day(0), 5);
  assert.equal(deck.length, 5);
  assert.equal(deck[0].id, first.id);
  assert.equal(new Set(deck.map((o) => o.id)).size, 5);
  assert.equal(buildDeck(content, 'manager', false, [], day(0), 100).length, pool.length);
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

test('хранилище: данные привязаны к пользователю, сброс удаляет только его', async () => {
  const store = new MemoryStore();
  const o = obj('obj-price-expensive');
  const mk = (userId: string) => buildDrillAttempt({ ...drillInput(o, drillPicks(o, 'right', 'right')), who: { ...who, userId } });
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

test('содержимое: у каждой реплики четыре варианта и один верный, подписи типов ошибок известны', () => {
  const all: Choice[] = [];
  for (const o of content.objections.objections) all.push(o.choices.beat1, o.choices.beat2);
  for (const s of content.scenarios.scenarios) {
    for (const st of s.steps) all.push(st.choices.beat1, st.choices.beat2);
    all.push(s.closing.choices);
  }
  assert.ok(all.length > 100);
  for (const c of all) {
    assert.equal(c.options.length, 4);
    assert.equal(c.options.filter((o) => o.correct).length, 1);
    for (const o of c.options) if (!o.correct) assert.ok(o.errorType && ERROR_LABELS[o.errorType] && o.violates && o.explanation, o.id);
  }
  const ids = new Set(all.flatMap((c) => c.options.map((o) => o.id)));
  assert.equal(ids.size, all.flatMap((c) => c.options).length, 'идентификаторы вариантов уникальны');
});

test('возражение с открытым вопросом скрыто из колоды, банка и сценариев; без вопроса остаётся', () => {
  const raw = {
    objections: { ...content.objections, objections: content.objections.objections.map((o) => (o.id === 'obj-eco-fire' ? { ...o, openIssues: [{ id: 'x', text: 'ждём документ' }] } : o)) },
    scenarios: content.scenarios,
    quiz: content.quiz,
    scoring: content.scoring,
  };
  const { content: hiddenC, hidden } = hideOpenIssues(raw);
  assert.deepEqual(hidden.map((h) => h.id), ['obj-eco-fire']);
  assert.ok(!hiddenC.objections.objections.some((o) => o.id === 'obj-eco-fire'));
  assert.ok(hiddenC.scenarios.scenarios.every((s) => s.steps.every((st) => st.objectionId !== 'obj-eco-fire')));
  assert.ok(hiddenC.quiz.questions.every((q) => !q.relatedObjectionIds.includes('obj-eco-fire')));
  assert.equal(hiddenC.objections.objections.length, content.objections.objections.length - 1);
  assert.equal(hideOpenIssues({ ...raw, objections: content.objections }).hidden.length, 0);
});

test('перемешивание: тот же порядок при повторе, состав и верный вариант по id сохраняются', () => {
  const o = obj('obj-price-expensive');
  const a = shuffleOptions(o.choices.beat1, 'seed-1').map((x) => x.id);
  assert.deepEqual(a, shuffleOptions(o.choices.beat1, 'seed-1').map((x) => x.id));
  assert.deepEqual([...a].sort(), o.choices.beat1.options.map((x) => x.id).sort());
  const orders = new Set(Array.from({ length: 40 }, (_, i) => shuffleOptions(o.choices.beat1, `s${i}`).map((x) => x.id).join()));
  assert.ok(orders.size > 6, 'порядок действительно меняется');
  // положение верного ответа равномерно не привязано к одному месту
  const spots = new Set(Array.from({ length: 60 }, (_, i) => shuffleOptions(o.choices.beat1, `p${i}`).findIndex((x) => x.correct)));
  assert.equal(spots.size, 4);
  for (const x of shuffleOptions(o.choices.beat1, 'z')) assert.equal(x.correct, o.choices.beat1.options.find((y) => y.id === x.id)!.correct);
});

test('первая попытка решает: верно сразу, потом ошибка, ложное обещание', () => {
  const o = obj('obj-price-expensive');
  const [p1, p2] = drillPicks(o, 'right', 'wrong');
  assert.equal(p1.firstTry, true);
  assert.equal(p1.tries.length, 1);
  assert.equal(p2.firstTry, false);
  assert.equal(p2.correct, true);
  assert.equal(p2.tries.length, 2);
  assert.ok(p2.firstError?.violates);
  const fp = drillPicks(o, 'false', 'right')[0];
  assert.equal(fp.firstTry, false);
});

test('критерии: старт 5, минус 1,5 за неверный первый выбор, не ниже 1; без вариантов с таким нарушением — «не оценивалось»', () => {
  const o = obj('obj-price-expensive');
  const played = [...o.choices.beat1.options, ...o.choices.beat2.options];
  const clean = scoreChoices(drillPicks(o, 'right', 'right'), played, content.scoring);
  assert.equal(clean.share, 1);
  const rated = Object.entries(clean.criteria).filter(([, v]) => v !== null);
  assert.ok(rated.length > 0 && rated.every(([, v]) => v === 5));
  assert.ok(Object.values(clean.criteria).some((v) => v === null), 'часть критериев не оценивалась');
  assert.equal(clean.total, 5);
  const bad = scoreChoices(drillPicks(o, 'wrong', 'wrong'), played, content.scoring);
  assert.equal(bad.share, 0);
  const violated = Object.values(bad.criteria).length;
  assert.ok(violated > 0);
  const values = Object.values(bad.criteria).filter((v): v is number => typeof v === 'number');
  assert.ok(values.every((v) => v >= 1 && v <= 5));
  assert.ok(values.some((v) => v < 5));
  assert.ok(bad.total !== null && bad.total < 5);
  // полный ряд ошибок не опускает ниже 1
  const many = Array.from({ length: 6 }, () => drillPicks(o, 'wrong', 'wrong')).flat();
  assert.ok(Object.values(scoreChoices(many, played, content.scoring).criteria).every((v) => v === null || v >= 1));
  // ровно −1,5 за один неверный выбор
  const one = scoreChoices([drillPicks(o, 'wrong', 'right')[0]], played, content.scoring);
  const v = one.criteria[drillPicks(o, 'wrong', 'right')[0].firstError!.violates!];
  assert.equal(v, 3.5);
});

test('порог: возражение от 75 % с первой попытки; сценарий ещё и без ложного обещания; уровни 75 % и 90 %', () => {
  assert.equal(isChoicePassed('objection', 1, false, content.scoring), true);
  assert.equal(isChoicePassed('objection', 0.5, false, content.scoring), false);
  assert.equal(isChoicePassed('scenario', 0.75, false, content.scoring), true);
  assert.equal(isChoicePassed('scenario', 0.74, false, content.scoring), false);
  assert.equal(isChoicePassed('scenario', 1, true, content.scoring), false);
  assert.deepEqual(['Начинающий', 'Начинающий', 'Уверенный', 'Уверенный', 'Мастер'], [null, 0.74, 0.75, 0.89, 0.9].map((x) => levelByShare(x, content.scoring).title));
});

test('быстрая отработка: оба верных с первого раза — засчитано, коробка растёт; одна ошибка — не засчитано, коробка 1', () => {
  const o = obj('obj-price-expensive');
  const good = buildDrillAttempt(drillInput(o, drillPicks(o, 'right', 'right')));
  assert.equal(good.attempt.context, 'training');
  assert.equal(good.attempt.scheme, 2);
  assert.equal(good.attempt.firstTryCorrect, 1);
  assert.equal(good.attempt.passed, true);
  assert.equal(good.cards[0].box, 2);
  assert.equal(good.cards[0].scheme, 2);
  const next = buildDrillAttempt(drillInput(o, drillPicks(o, 'right', 'right'), day(1), good.cards));
  assert.equal(next.cards[0].box, 3);
  const slip = buildDrillAttempt(drillInput(o, drillPicks(o, 'right', 'wrong'), day(2), next.cards));
  assert.equal(slip.attempt.firstTryCorrect, 0.5);
  assert.equal(slip.attempt.passed, false);
  assert.equal(slip.cards[0].box, 1);
  assert.equal(slip.cards[0].nextDueAt, day(2).toISOString());
  assert.ok(!('skipped' in slip.attempt));
});

test('сценарий: все верно — засчитан; ошибка в шаге — доля падает; ложное обещание — не засчитан', () => {
  const s = content.scenarios.scenarios[0];
  const slots = scenarioSlots(s);
  assert.equal(slots.length, s.steps.length * 2 + 1);
  const base = { who, content, startedAt: t0, now: t0, cards: cardsMap(), scenario: s };
  const clean = buildScenarioAttempt({ ...base, picks: scenarioPicks(s, () => 'right') });
  assert.equal(clean.attempt.passed, true);
  assert.equal(clean.attempt.firstTryCorrect, 1);
  assert.ok(scenarioCriteria(s, clean.attempt.picks!).every((c) => c.ok));
  assert.equal(clean.cards.length, s.steps.length);
  // одна ошибка в закрытии: 1 из 7 реплик ошибочна, доля выше порога, но условие «следующий шаг» не выполнено
  const closingSlip = buildScenarioAttempt({ ...base, picks: scenarioPicks(s, (k) => (k === 'closing' ? 'wrong' : 'right')) });
  assert.ok(closingSlip.attempt.firstTryCorrect! < 1);
  assert.equal(scenarioCriteria(s, closingSlip.attempt.picks!).find((c) => c.kind === 'nextStepChoice')!.ok, false);
  // много ошибок
  const poor = buildScenarioAttempt({ ...base, picks: scenarioPicks(s, () => 'wrong') });
  assert.equal(poor.attempt.firstTryCorrect, 0);
  assert.equal(poor.attempt.passed, false);
  assert.equal(scenarioCriteria(s, poor.attempt.picks!).find((c) => c.kind === 'firstTryCorrect')!.ok, false);
  // ложное обещание в одной реплике: доля высокая, но не засчитан
  const target = slots.find((sl) => slotChoice(s, sl).options.some((o) => o.errorType === 'false_promise'))!;
  const promised = buildScenarioAttempt({ ...base, picks: scenarioPicks(s, (k) => (k === target.key ? 'false' : 'right')) });
  assert.ok(promised.attempt.firstTryCorrect! >= 0.75);
  assert.equal(promised.attempt.passed, false);
  assert.equal(scenarioCriteria(s, promised.attempt.picks!).find((c) => c.kind === 'noFalsePromise')!.ok, false);
});

test('подсказка наставника не снимает баллов', () => {
  const s = content.scenarios.scenarios[0];
  const slot = scenarioSlots(s)[0];
  const hinted = makePick({ stepId: slot.stepId, objectionId: slot.objectionId, beat: 1, clientLine: 'x', tries: tries(slotChoice(s, slot), 'right'), choice: slotChoice(s, slot), usedHint: true });
  assert.equal(hinted.usedHint, true);
  assert.equal(hinted.firstTry, true);
});

test('свободная практика: пункты ищутся в обоих ответах вместе и ничего не оценивают', () => {
  const o = obj('obj-price-expensive');
  const res = checkPractice(o.requiredPoints, ['', '']);
  assert.ok(res.every((r) => !r.said));
  const said = checkPractice(o.requiredPoints, [o.referenceAnswer, o.pushbackReferenceAnswer]);
  assert.ok(said.some((r) => r.said));
  const split = checkPractice(o.requiredPoints, [o.referenceAnswer, '']).filter((r) => r.said).length;
  assert.ok(said.filter((r) => r.said).length >= split);
});

test('старые попытки и карточки (набор текста) в итоги не входят', () => {
  const o = obj('obj-price-expensive');
  const fresh = buildDrillAttempt(drillInput(o, drillPicks(o, 'right', 'right'), day(1))).attempt;
  const legacy = { ...fresh, id: 'old', picks: undefined, scheme: undefined, firstTryCorrect: undefined, total: 4.8, finishedAt: day(2).toISOString(), autoScores: { honesty: 5 }, finalScores: { honesty: 5 } } as LearningAttempt;
  assert.equal(isLegacyAttempt(legacy), true);
  assert.equal(isLegacyAttempt(fresh), false);
  const legacyCard: ReviewCard = { key: cardKey('u1', 'objection', o.id), userId: 'u1', itemType: 'objection', itemId: o.id, box: 4, lastAt: t0.toISOString(), nextDueAt: t0.toISOString(), attempts: 3, passes: 3, lapses: 0, bestTotal: 5, lastTotal: 5 };
  assert.equal(isLegacyCard(legacyCard), true);
  const progress = computeProgress(content, 'manager', false, [legacy, fresh], [legacyCard], day(2));
  assert.equal(progress.attempts.length, 1);
  assert.equal(progress.legacyCount, 1);
  assert.equal(progress.level.title, 'Мастер');
  // коробка старой карточки не переносится
  const card = buildDrillAttempt(drillInput(o, drillPicks(o, 'right', 'right'), day(3), [legacyCard])).cards[0];
  assert.equal(card.box, 2);
  // старая карточка не мешает колоде
  assert.ok(buildDeck(content, 'manager', false, [legacyCard], day(3), 5).length > 0);
});

test('прогресс: доля с первой попытки, критерии, типы ошибок, серия дней', () => {
  let cards: ReviewCard[] = [];
  const attempts: LearningAttempt[] = [];
  const o = obj('obj-price-expensive');
  for (let d = 0; d < 3; d += 1) {
    const built = buildDrillAttempt(drillInput(o, drillPicks(o, d === 2 ? 'wrong' : 'right', 'right'), day(d), cards));
    attempts.push(built.attempt);
    cards = built.cards;
  }
  const progress = computeProgress(content, 'manager', false, attempts, cards, day(2));
  assert.equal(progress.streakDays, 3);
  assert.equal(progress.attempts.length, 3);
  assert.equal(progress.levelShare, Math.round(((1 + 1 + 0.5) / 3) * 1000) / 1000);
  assert.equal(progress.level.title, 'Уверенный');
  const reason = progress.reasons.find((r) => r.id === o.refusalReasonKey)!;
  assert.equal(reason.inWork + reason.mastered, 1);
  assert.ok(progress.criteriaAvg.every((c) => c.avg === null || (c.avg >= 1 && c.avg <= 5)));
  assert.ok(progress.criteriaAvg.some((c) => c.avg === null));
  assert.equal(progress.errorTypes.reduce((n, e) => n + e.count, 0), 1);
  assert.equal(progress.weakObjections[0]?.objectionId, o.id);
  assert.equal(streakOf([], day(0)), 0);
});

test('подсветка находит фрагменты в исходном тексте', () => {
  const text = 'Понимаю! Давайте сравним итоговую экономику всей системы, а не только цену.';
  const ranges = highlightRanges(text, ['экономик[а-я]*\\s+(всей\\s+)?систем']);
  assert.equal(ranges.length, 1);
  assert.equal(text.slice(ranges[0][0], ranges[0][1]), 'экономику всей систем');
});

test('черновик сценария живёт 7 дней, черновик старого образца игнорируется', async () => {
  const store = new MemoryStore();
  const fresh = { key: 'u1:s', userId: 'u1', scenarioId: 's', savedAt: new Date().toISOString(), picks: [], hintsUsed: [], startedAt: t0.toISOString() };
  await store.putDraft(fresh);
  assert.ok(await store.draft('u1', 's'));
  await store.putDraft({ ...fresh, savedAt: new Date(Date.now() - 8 * 86400000).toISOString() });
  assert.equal(await store.draft('u1', 's'), null);
  await store.putDraft({ ...fresh, picks: undefined, stepIndex: 1, answers: [] } as never);
  assert.equal(await store.draft('u1', 's'), null);
});
