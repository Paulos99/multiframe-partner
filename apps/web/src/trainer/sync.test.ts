import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testContent } from './testContent';
import { MemoryStore } from './store';
import { buildDrillAttempt, type Who } from './attempts';
import { drillChoice, drillLines, makePick, type Try } from './choice';
import { backfillQueue, buildAttemptRecord, buildMaterialRecord, flushQueue, SYNC_BATCH } from './sync';
import type { Choice, Objection, Pick } from './types';
import { QUIZ_TOPIC_TITLES, REASON_TITLES, percent, sinceLabel, topicLabel } from '../partner/trainingLabels';

const content = testContent();
const who: Who = { userId: 'u1', partnerId: 'org1', role: 'manager' };
const t0 = new Date('2026-10-28T09:00:00.000Z');

function tries(choice: Choice, wrongFirst: boolean): Try[] {
  const right = choice.options.find((o) => o.correct)!;
  if (!wrongFirst) return [{ optionId: right.id, ms: 1 }];
  const wrong = choice.options.find((o) => !o.correct)!;
  return [{ optionId: wrong.id, ms: 1 }, { optionId: right.id, ms: 1 }];
}
function picks(o: Objection, wrongFirst: boolean): [Pick, Pick] {
  const lines = drillLines(o, 0);
  return [
    makePick({ stepId: o.id, objectionId: o.id, beat: 1, clientLine: lines[0], tries: tries(drillChoice(o, 1), wrongFirst), choice: drillChoice(o, 1) }),
    makePick({ stepId: o.id, objectionId: o.id, beat: 2, clientLine: lines[1], tries: tries(drillChoice(o, 2), false), choice: drillChoice(o, 2) }),
  ];
}
function attemptFor(index: number, wrongFirst = false, userId = 'u1') {
  const o = content.objections.objections[index % content.objections.objections.length]!;
  return buildDrillAttempt({ who: { ...who, userId }, content, startedAt: t0, now: new Date(t0.getTime() + index * 1000), cards: new Map(), objection: o, picks: picks(o, wrongFirst) }).attempt;
}

test('запись для сервера: доля, критерий и тема отказа есть, текста ответов нет', () => {
  const attempt = attemptFor(0, true);
  const record = buildAttemptRecord(attempt, content)!;
  assert.equal(record.id, attempt.id);
  assert.equal(record.scheme, 2);
  assert.equal(record.firstTryCorrect, 0.5);
  const misses = record.misses as { objectionId: string; reasonKey: string }[];
  assert.equal(misses.length, 1);
  assert.ok(misses[0]!.reasonKey);
  const text = JSON.stringify(record);
  for (const pick of attempt.picks ?? []) assert.ok(!text.includes(pick.clientLine), 'реплика клиента не уходит');
  assert.ok(!('answers' in record) && !('picks' in record));
});

test('очередь: отправка пачкой, подтверждённое уходит, при обрыве связи всё остаётся', async () => {
  const store = new MemoryStore();
  const attempts = [attemptFor(0), attemptFor(1, true), attemptFor(2)];
  for (const a of attempts) await store.addAttempt(a, buildAttemptRecord(a, content));
  await store.enqueue({ id: 'm1', userId: 'u1', queuedAt: t0.toISOString(), kind: 'material', record: buildMaterialRecord('m1', 'mat', 'Монтаж', t0) });
  await store.addAttempt(attemptFor(0, false, 'u2'), { id: 'x' });

  await assert.rejects(flushQueue(store, 'u1', async () => Promise.reject(new Error('нет сети'))));
  assert.equal((await store.queued('u1')).length, 4, 'после обрыва очередь цела');

  const bodies: { attempts: unknown[]; materials: unknown[] }[] = [];
  const result = await flushQueue(store, 'u1', async (body) => {
    bodies.push(body);
    return { acceptedAttemptIds: body.attempts.map((r) => (r as { id: string }).id), acceptedMaterialIds: body.materials.map((r) => (r as { id: string }).id) };
  });
  assert.deepEqual(result, { sent: 4, left: 0 });
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0]!.attempts.length, 3);
  assert.equal((await store.queued('u1')).length, 0);
  assert.equal((await store.queued('u2')).length, 1, 'чужая очередь на устройстве не трогается');
  assert.deepEqual(await flushQueue(store, 'u1', async () => assert.fail('пустую очередь не отправляют')), { sent: 0, left: 0 });
});

test('очередь: пачек не больше предела, отклонённая запись не зависает навсегда', async () => {
  const store = new MemoryStore();
  const total = SYNC_BATCH + 7;
  for (let i = 0; i < total; i += 1) {
    const a = attemptFor(i);
    await store.addAttempt(a, buildAttemptRecord(a, content));
  }
  const sizes: number[] = [];
  const rejectId = ((await store.queued('u1'))[0] as { id: string }).id;
  const result = await flushQueue(store, 'u1', async (body) => {
    sizes.push(body.attempts.length);
    return { acceptedAttemptIds: body.attempts.map((r) => (r as { id: string }).id).filter((id) => id !== rejectId), acceptedMaterialIds: [] };
  });
  assert.deepEqual(sizes, [SYNC_BATCH, 7]);
  assert.equal(result.sent, total - 1);
  assert.equal((await store.queued('u1')).length, 0);
});

test('старый элемент очереди без записи достраивается, старый подход набором текста убирается', async () => {
  const store = new MemoryStore();
  const fresh = attemptFor(0);
  await store.addAttempt(fresh);
  const legacy = { ...attemptFor(1), scheme: undefined, picks: undefined } as ReturnType<typeof attemptFor>;
  await store.addAttempt(legacy);
  await backfillQueue(store, 'u1', content);
  const queued = await store.queued('u1');
  assert.equal(queued.find((q) => q.id === fresh.id)?.record?.id, fresh.id);
  assert.equal(queued.find((q) => q.id === legacy.id), undefined);
});

test('подписи аналитики совпадают с содержимым тренажёра', () => {
  const read = (name: string) => JSON.parse(readFileSync(new URL(`./content/${name}.json`, import.meta.url), 'utf-8'));
  const reasons = (read('objections').refusalReasons as { key: string }[]).map((r) => r.key).sort();
  assert.deepEqual(Object.keys(REASON_TITLES).sort(), reasons);
  const topics = (read('quiz').topics as { id: string }[]).map((t) => t.id).sort();
  assert.deepEqual(Object.keys(QUIZ_TOPIC_TITLES).sort(), topics);
  assert.equal(topicLabel({ kind: 'reason', key: 'price_too_high' }), 'Дорого');
  assert.equal(topicLabel({ kind: 'quiz', key: 'nope' }), 'Другая тема');
});

test('даты и проценты читаются по-русски', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  assert.equal(sinceLabel('2026-10-29T08:00:00Z', now), 'сегодня');
  assert.equal(sinceLabel('2026-10-28T08:00:00Z', now), 'вчера');
  assert.equal(sinceLabel('2026-10-26T08:00:00Z', now), '3 дня назад');
  assert.equal(sinceLabel('2026-10-24T08:00:00Z', now), '5 дней назад');
  assert.equal(sinceLabel('2026-10-08T08:00:00Z', now), '21 день назад');
  assert.equal(sinceLabel('2026-08-01T08:00:00Z', now), 'больше месяца назад');
  assert.equal(sinceLabel(null, now), 'ещё не занимался');
  assert.equal(percent(0.836), '84%');
  assert.equal(percent(null), '—');
});
