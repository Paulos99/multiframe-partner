import assert from 'node:assert/strict';
import test from 'node:test';
import { objectPatchFromCalc } from './cabinetCalc.ts';
import { carriedObjectLink } from './objectLink.ts';
import { preliminaryRoomTotal } from './projectSummary.ts';

test('площадь расчёта остаётся у своей комнаты', () => {
  const kitchen = objectPatchFromCalc(
    { type: 'mf-cabinet-calc', areaM2: 12, panels: 8, dowels: 16, hasScheme: true },
    {
      id: 'room-kitchen',
      orgId: 'org',
      createdAt: '',
      updatedAt: '',
      createdBy: 'u',
      assignedTo: null,
      status: 'measured',
      clientName: 'Кухня',
      clientPhone: '',
      address: '',
      city: '',
      room: { areaM2: 12 },
      estimate: null,
      clientSummary: '',
      history: [],
      projectId: 'prj_flat',
      roomName: 'Кухня',
    },
    null,
    'room-kitchen',
  );
  const bedroom = objectPatchFromCalc(
    { type: 'mf-cabinet-calc', areaM2: 16, panels: 10, dowels: 20, hasScheme: true },
    {
      id: 'room-bedroom',
      orgId: 'org',
      createdAt: '',
      updatedAt: '',
      createdBy: 'u',
      assignedTo: null,
      status: 'draft',
      clientName: 'Спальня',
      clientPhone: '',
      address: '',
      city: '',
      room: { areaM2: 16 },
      estimate: null,
      clientSummary: '',
      history: [],
      projectId: 'prj_flat',
      roomName: 'Спальня',
    },
    null,
    'room-bedroom',
  );
  assert.equal(kitchen.id, 'room-kitchen');
  assert.equal(kitchen.room?.areaM2, 12);
  assert.equal(kitchen.projectId, 'prj_flat');
  assert.equal(kitchen.roomName, 'Кухня');
  assert.equal(bedroom.room?.areaM2, 16);
  assert.equal(bedroom.roomName, 'Спальня');
  assert.notEqual(kitchen.room?.areaM2, bedroom.room?.areaM2);
});

test('привязка к проекту не пропадает, если PATCH её не прислал', () => {
  assert.deepEqual(
    carriedObjectLink({ status: 'measured' }, {
      id: 'obj',
      projectId: 'prj_1',
      roomName: 'Кухня',
    } as never),
    { projectId: 'prj_1', roomName: 'Кухня' },
  );
  assert.deepEqual(carriedObjectLink({}, { id: 'old' } as never), {});
  assert.deepEqual(carriedObjectLink({ projectId: null, roomName: '  ' }, { projectId: 'prj_1' } as never), {
    projectId: 'prj_1',
    roomName: null,
  });
});

test('предварительный итог считает только рассчитанные комнаты', () => {
  const summary = preliminaryRoomTotal([
    { estimate: { totalCost: 100 } },
    { estimate: null },
    { estimate: { totalCost: null } },
    { estimate: { totalCost: 40 } },
  ]);
  assert.deepEqual(summary, { calculated: 2, total: 140, rooms: 4 });
});
