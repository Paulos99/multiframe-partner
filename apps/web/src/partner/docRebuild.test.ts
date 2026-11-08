import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLocalDemoObjects } from './demoSeed.ts';
import { planRebuild } from './docRebuild.ts';
import { isDocStale } from './docStale.ts';

const objects = buildLocalDemoObjects();
const chernov = objects.find((o) => o.id === 'obj_a11')!;
const project = objects.filter((o) => o.id.startsWith('obj_a11'));

test('Чернов: устаревший акустический профиль пересобирается из сохранённых ответов, без опроса', () => {
  assert.ok(chernov, 'в демо есть комната Чернова');
  const doc = { kind: 'profile' as const, areaM2: (chernov.room.areaM2 || 0) - 3 };
  assert.equal(isDocStale(doc, chernov), true);
  const plan = planRebuild(doc, chernov, project);
  assert.equal(plan.ok, true);
  assert.equal(plan.kind, 'profile');
  if (plan.ok && plan.kind === 'profile') {
    assert.equal(plan.answers.ceilingAreaM2, chernov.room.areaM2);
    assert.equal(plan.answers.slabType, 'hollow');
    assert.equal(plan.answers.roomType, 'office');
  }
});

test('Чернов: смета и КП пересобираются из сохранённых данных', () => {
  assert.deepEqual(planRebuild({ kind: 'estimate' }, chernov, project), { ok: true, kind: 'estimate', areaM2: chernov.room.areaM2 });
  assert.deepEqual(planRebuild({ kind: 'offer' }, chernov, project), { ok: true, kind: 'offer' });
});

test('нет сохранённых ответов — понятное сообщение и предложение пройти опрос', () => {
  const bare = { ...chernov, room: { areaM2: 20, roomType: 'office', answers: {} } };
  const plan = planRebuild({ kind: 'profile' }, bare, [bare]);
  assert.equal(plan.ok, false);
  if (!plan.ok) {
    assert.equal(plan.next, 'survey');
    assert.match(plan.message, /Пройдите опрос/);
  }
  const noArea = planRebuild({ kind: 'estimate' }, { ...chernov, room: { areaM2: null } }, []);
  assert.equal(noArea.ok, false);
  const noKp = planRebuild({ kind: 'offer' }, chernov, []);
  assert.equal(noKp.ok, false);
});
