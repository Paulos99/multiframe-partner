import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BLOCKER_PRESETS,
  checklistOrTemplate,
  closeBlockedReason,
  conflictSummary,
  containsMoney,
  countedContribution,
  createIdempotencyKey,
  fieldErrorText,
  fieldHeaders,
  fieldSync,
  compositionFigure,
  measurementStatusLabel,
  nextCrewAction,
  sortMeasurements,
  sortTasks,
  type CheckItem,
  type CrewRoom,
} from './fieldModel.ts';

test('итог комнаты берёт расчёт по замеру и не складывает предварительный', () => {
  const counted = countedContribution(
    { revisionSeq: 1, amount: 100 },
    { revisionSeq: 1, amount: 250 },
  );
  assert.equal(counted?.calcType, 'detailed');
  assert.equal(counted?.amount, 250);
  assert.notEqual(counted?.amount, 350);
});

test('без расчёта по замеру итог остаётся предварительным', () => {
  const counted = countedContribution({ revisionSeq: 1, amount: 80 }, null);
  assert.equal(counted?.calcType, 'preliminary');
  assert.equal(counted?.amount, 80);
});

test('конфликт показывает обе ветки и один учитываемый итог', () => {
  const summary = conflictSummary({
    saved: { amount: 999 },
    current: { amount: 250, revisionSeq: 1 },
    contribution: { calcType: 'detailed', amount: 250, calculationId: 'c' },
  });
  assert.equal(summary.serverAmount, 250);
  assert.equal(summary.mineAmount, 999);
  assert.equal(summary.countedAmount, 250);
  assert.equal(summary.doubled, false);
  assert.equal(summary.countedLabel, 'Расчёт по замеру');
});

test('закрытие комнаты требует список и не знает исключений', () => {
  const pending: CheckItem[] = checklistOrTemplate([]).items;
  assert.match(closeBlockedReason(pending, []) || '', /отметьте/i);
  const half: CheckItem[] = pending.map((item, index) => (
    index === 0 ? { ...item, state: 'done' } : item
  ));
  assert.match(closeBlockedReason(half, []) || '', /каждый пункт/);
  const na: CheckItem[] = pending.map((item) => ({ ...item, state: 'na', reason: '' }));
  assert.match(closeBlockedReason(na, []) || '', /почему/);
  const done: CheckItem[] = pending.map((item) => ({ ...item, state: 'done', reason: null }));
  assert.equal(closeBlockedReason(done, []), null);
  assert.match(closeBlockedReason(done, [{ id: 'b', status: 'open', text: 'Нет схемы' }]) || '', /препятствие/);
  assert.equal(BLOCKER_PRESETS.includes('Нет схемы'), true);
});

test('задания бригады: сначала текущие, потом препятствие, потом новые', () => {
  const base = {
    projectId: 'p',
    dealId: 'd',
    projectName: 'Сорокина',
    place: 'Москва',
    recordVersion: 2,
    materialsComplete: true,
    blockers: [],
  };
  const rooms: CrewRoom[] = [
    { ...base, id: 'new', roomName: 'Новая', workStatus: 'tech_ready', checklist: [] },
    {
      ...base,
      id: 'blocked',
      roomName: 'Стоп',
      workStatus: 'blocked',
      checklist: [{ id: 'a', title: 'Каркас', state: 'done', reason: null }],
      blockers: [{ id: 'b', status: 'open', text: 'Нет материалов' }],
    },
    {
      ...base,
      id: 'now',
      roomName: 'В работе',
      workStatus: 'tech_ready',
      checklist: [
        { id: 'a', title: 'Каркас', state: 'done', reason: null },
        { id: 'b', title: 'Панели', state: 'pending', reason: null },
      ],
    },
  ];
  assert.deepEqual(sortTasks(rooms).map((room) => room.id), ['now', 'blocked', 'new']);
  assert.equal(nextCrewAction(rooms[1]!), 'Есть препятствие');
  assert.equal(nextCrewAction(rooms[2]!), 'Заполнить список проверки');
  assert.equal(containsMoney(rooms), false);
});

test('пустой состав рисуется прочерком, а не нулём', () => {
  assert.equal(compositionFigure(null, 'м²'), '—');
  assert.equal(compositionFigure(0, 'м²'), '—');
  assert.equal(compositionFigure(undefined), '—');
  assert.equal(compositionFigure(12.4, 'м²'), '12.4 м²');
  assert.equal(compositionFigure(12), '12');
});

test('расчёт по замеру не оставляет статус «Нужен замер»', () => {
  assert.equal(measurementStatusLabel({ workStatus: 'draft', detailed: null }), 'Нужен замер');
  assert.equal(
    measurementStatusLabel({ workStatus: 'draft', detailed: { revisionSeq: 1, amount: 156646 } }),
    'Замер сохранён',
  );
  assert.equal(measurementStatusLabel({ workStatus: 'tech_ready', detailed: { revisionSeq: 1, amount: 1 }, techReady: true }), 'Технически готово');
  assert.equal(
    measurementStatusLabel({ workStatus: 'draft', detailed: { revisionSeq: 1, amount: 1 }, blockers: [{ status: 'open' }] }),
    'Есть препятствие',
  );
});

test('очередь замеров ставит комнату без расчёта по замеру выше готовой', () => {
  const rooms = [
    { id: 'ready', detailed: { revisionSeq: 1, amount: 10 }, techReady: true, blockers: [] },
    { id: 'gap', detailed: null, techReady: false, blockers: [] },
  ];
  assert.equal(sortMeasurements(rooms)[0]?.id, 'gap');
});

test('заголовки записи: контекст работы, ключ и версия', () => {
  const headers = fieldHeaders({ idempotencyKey: 'k1', ifMatch: '4' });
  assert.equal(headers['X-Data-Context'], 'work');
  assert.equal(headers['Idempotency-Key'], 'k1');
  assert.equal(headers['If-Match'], '4');
  assert.equal('If-Match' in fieldHeaders({ idempotencyKey: 'k2' }), false);
  assert.notEqual(createIdempotencyKey(), createIdempotencyKey());
});

test('сбой сети и отсутствие версии не называются успешным сохранением', () => {
  assert.match(fieldErrorText(428, 'Нужен заголовок If-Match'), /версии/);
  assert.match(fieldErrorText(0, ''), /устройстве/);
  const offline = fieldSync({ online: false, pending: 1 });
  assert.equal(offline.label, 'Сохранено на устройстве');
  assert.notEqual(offline.kind, 'synced');
  const lost = fieldSync({ online: false, pending: 0 });
  assert.equal(lost.kind, 'offline');
});
