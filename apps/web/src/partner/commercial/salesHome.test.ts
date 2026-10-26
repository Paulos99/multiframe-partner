import assert from 'node:assert/strict';
import test from 'node:test';
import type { Deal } from '../../../../../packages/shared/deal';
import type { JobObject } from '../../../../../packages/shared/partner';
import { preliminaryRoomPatch } from '../cabinetCalc.ts';
import { nextActionsForRole } from './nextActions.ts';
import { WORK_ENTRIES } from './entryPoints.ts';
import {
  areasDiffer,
  saveSummary,
  shouldCreateProject,
  validateSave,
  type SaveDraftView,
  type SaveIntent,
} from './saveDestination.ts';
import { claimSave, creationIdempotencyKey, dedupeByKey, releaseSave } from '../idempotency.ts';
import { overlayDemoSalesRooms } from './demoQueue.ts';
import { dealGapCopy } from './dealHint.ts';

function room(partial: Partial<JobObject> & Pick<JobObject, 'id' | 'status'>): JobObject {
  return {
    orgId: 'org',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    createdBy: 'u',
    assignedTo: null,
    clientName: 'Клиент',
    clientPhone: '',
    address: 'ул. Лесная, 1',
    city: 'Москва',
    room: {},
    estimate: null,
    clientSummary: '',
    history: [],
    projectId: 'prj',
    roomName: 'Кухня',
    ...partial,
  };
}

function deal(partial: Partial<Deal> & Pick<Deal, 'id' | 'stage'>): Deal {
  return {
    orgId: 'org',
    projectId: 'prj',
    ownerUserId: 'u',
    assignments: { salesUserId: null, measurerUserId: null, crewUserId: null },
    nextActionAt: null,
    outcome: null,
    lossReason: null,
    lossComment: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  };
}

test('очередь менеджера сортирует действия и ведёт в проект или комнату', () => {
  const objects = [
    room({ id: 'kitchen', status: 'measured', roomName: 'Кухня' }),
    room({ id: 'hall', status: 'quote_sent', projectId: 'prj-2', roomName: 'Зал', address: 'Невский, 2' }),
    room({ id: 'bath', status: 'measured', projectId: 'prj-ready', roomName: 'Ванная' }),
  ];
  const deals = [
    deal({
      id: 'paused',
      projectId: 'prj-pause',
      stage: 'quote_postponed',
      nextActionAt: '2020-01-01T00:00:00.000Z',
    }),
    deal({ id: 'sent', projectId: 'prj-2', stage: 'quote_sent_confirmed' }),
    deal({ id: 'fresh', projectId: 'prj', stage: 'quote_created' }),
    deal({ id: 'won', projectId: 'prj-ready', stage: 'quote_accepted', outcome: 'accepted' }),
    deal({
      id: 'old',
      projectId: 'prj-next',
      stage: 'closed',
      outcome: 'declined',
      deferredRoomIds: ['later'],
    } as Deal & { deferredRoomIds: string[] }),
  ];
  objects.push(room({ id: 'later', status: 'measured', projectId: 'prj-next', roomName: 'Детская' }));
  const actions = nextActionsForRole('sales', objects, deals);
  assert.equal(actions.length <= 8, true);
  assert.deepEqual(
    actions.map((action) => action.title),
    [
      'Возобновить',
      'Получить ответ',
      'Подтвердить отправку',
      'Подготовить к монтажу',
      'Создать следующую сделку',
      'Сформировать КП',
      'Уточнить ответ клиента',
    ],
  );
  const resume = actions.find((action) => action.title === 'Возобновить');
  assert.equal(resume?.projectId, 'prj-pause');
  assert.equal(resume?.dealId, 'paused');
  assert.equal(actions.find((action) => action.title === 'Подготовить к монтажу')?.objectId, 'bath');
  assert.equal(actions.find((action) => action.title === 'Создать следующую сделку')?.objectId, 'later');
  assert.equal(actions.every((action) => !action.detail.includes('deal')), true);
});

test('входы в инструменты не дублируют проблемомер', () => {
  assert.deepEqual(WORK_ENTRIES.map((entry) => entry.route), ['problemomer', 'calculator']);
  assert.equal(new Set(WORK_ENTRIES.map((entry) => entry.route)).size, 2);
});

test('предварительный расчёт по площади не создаёт комнату сам', () => {
  assert.equal(
    preliminaryRoomPatch(
      { type: 'mf-cabinet-calc', areaM2: 18, panels: 12, dowels: 24, areaEstimate: true, hasScheme: false },
      undefined,
      null,
    ),
    null,
  );
  const patch = preliminaryRoomPatch(
    { type: 'mf-cabinet-calc', areaM2: 18, panels: 12, dowels: 24, areaEstimate: true, hasScheme: false },
    room({ id: 'kitchen', status: 'measured', room: { areaM2: 12 } }),
    null,
  );
  assert.equal(patch?.id, 'kitchen');
  assert.equal(patch?.room?.areaM2, 18);
  assert.match(String(patch?.clientSummary), /без схемы/);
});

test('сохранение требует явного места и не создаёт проект до подтверждения', () => {
  const draft: SaveDraftView = {
    tool: 'calculator',
    areaM2: 16,
    totalCost: 90000,
    hasProfile: false,
    preliminary: true,
    hasScheme: false,
  };
  const intent: SaveIntent = {
    mode: 'new',
    projectId: null,
    roomId: null,
    projectName: '',
    roomName: '',
    phone: '',
    address: '',
    areaChoice: null,
    roomAreaM2: null,
  };
  assert.equal(shouldCreateProject(false, 'new'), false);
  assert.equal(shouldCreateProject(true, 'existing'), false);
  assert.equal(shouldCreateProject(true, 'new'), true);
  assert.match(String(validateSave(draft, intent)), /название проекта/);
  assert.equal(
    validateSave(draft, { ...intent, projectName: 'Лесная', roomName: 'Кухня' }),
    null,
  );
  assert.equal(areasDiffer(12, 16), true);
  assert.match(
    String(
      validateSave(
        { ...draft, tool: 'problemomer', hasProfile: true },
        {
          ...intent,
          mode: 'existing',
          projectId: 'prj',
          roomId: 'kitchen',
          roomAreaM2: 12,
        },
      ),
    ),
    /Площадь/,
  );
  const lines = saveSummary(draft);
  assert.equal(lines[0], 'Предварительный расчёт по площади, без схемы');
  assert.match(lines[1] || '', /16/);
  assert.match(lines[2] || '', /90/);
});

test('три синхронных нажатия «Сохранить» создают проект один раз и с одним ключом', async () => {
  const lock = { current: false };
  const key = creationIdempotencyKey('проект|Кухня|16');
  let creates = 0;
  const keys: string[] = [];

  async function onSave() {
    if (!claimSave(lock)) return;
    try {
      await dedupeByKey(key, async () => {
        keys.push(key);
        await new Promise((resolve) => setTimeout(resolve, 15));
        creates += 1;
        return { id: 'prj-once' };
      });
    } finally {
      releaseSave(lock);
    }
  }

  await Promise.all([onSave(), onSave(), onSave()]);
  assert.equal(creates, 1);
  assert.deepEqual(keys, [key]);
  assert.equal(creationIdempotencyKey('проект|Кухня|16'), key);

  const parallelKey = creationIdempotencyKey('параллельно');
  let parallel = 0;
  await Promise.all(
    [0, 1, 2].map(() =>
      dedupeByKey(parallelKey, async () => {
        parallel += 1;
        await new Promise((resolve) => setTimeout(resolve, 15));
        return { id: 'prj-parallel' };
      }),
    ),
  );
  assert.equal(parallel, 1);
});

test('в демо-режиме пустая очередь менеджера получает задачи', () => {
  const user = { id: 'u_sales1', orgId: 'org_demo', role: 'sales' as const };
  assert.equal(overlayDemoSalesRooms([], user, false).length, 0);
  const quiet = overlayDemoSalesRooms([], user, true);
  const actions = nextActionsForRole('sales', quiet, []);
  assert.equal(actions.length > 0, true);
  assert.equal(actions.every((action) => Boolean(action.objectId)), true);
  const busy = overlayDemoSalesRooms([room({ id: 'kitchen', status: 'measured' })], user, true);
  assert.equal(busy.length, 1);
});

test('подсказка сделки не врёт, когда проект с комнатами уже открыт', () => {
  const text = dealGapCopy({ projectOpen: true, hasRooms: true, loading: false });
  assert.equal(text.includes('когда проект открыт'), false);
  assert.match(text, /этом проекте|сделку/);
  assert.match(dealGapCopy({ projectOpen: true, hasRooms: true, loading: false, failed: true }), /ещё не создана/);
});
