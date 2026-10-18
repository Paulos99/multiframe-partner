import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { JobObject } from '../../../../packages/shared/partner';
import { sortRooms, moveRoomOrder, orderAt, canMoveRoom, rankMovedColumn } from './kanban';
const room = (id: string, stageOrder?: number) =>
  ({
    id,
    stageOrder,
    status: 'draft',
    updatedAt: '2026-01-01',
    createdAt: '2025-01-01',
    clientName: id,
  }) as JobObject;
test('default drop inserts first and explicit position is respected', () => {
  assert.deepEqual(moveRoomOrder(['a', 'b', 'c'], 'c'), ['c', 'a', 'b']);
  assert.deepEqual(moveRoomOrder(['a', 'b', 'c'], 'c', 'b'), ['a', 'c', 'b']);
});
test('persisted fractional rank restores reorder and top insertion', () => {
  const a = room('a', 10),
    b = room('b', 20),
    c = room('c', 30);
  const moved = { ...c, stageOrder: orderAt([a, c, b], 'c') };
  assert.deepEqual(
    sortRooms([a, b, moved], 'manual', []).map((r) => r.id),
    ['a', 'c', 'b'],
  );
  const top = { ...c, stageOrder: orderAt([c, a, b], 'c') };
  assert.deepEqual(
    sortRooms([a, b, top], 'manual', []).map((r) => r.id),
    ['c', 'a', 'b'],
  );
});
test('legacy rooms sort deterministically and accept persisted order', () => {
  const initial = sortRooms([room('a'), room('b'), room('c')], 'manual', []);
  const moved = {
    ...initial[2],
    stageOrder: orderAt([initial[2], initial[0], initial[1]], initial[2].id),
  };
  assert.equal(
    sortRooms([initial[0], initial[1], moved], 'manual', [])[0].id,
    moved.id,
  );
});
test('date and client sorting do not mutate input; crew restrictions remain', () => {
  const input = [
    room('z'),
    { ...room('a'), updatedAt: '2026-02-01', createdAt: '2026-01-01' },
  ];
  for (const sort of ['updatedAt', 'createdAt', 'client'] as const)
    assert.equal(sortRooms(input, sort, [])[0].id, 'a');
  assert.equal(input[0].id, 'z');
  assert.equal(canMoveRoom('crew', 'measured'), false);
  assert.equal(canMoveRoom('crew', 'closed'), true);
});

test('drag in a client/date sorted view persists the entire displayed order', () => {
  const displayed = [room('c', 30), room('b', 20), room('a', 10)];
  const saved = rankMovedColumn(displayed, 'b');
  assert.deepEqual(
    sortRooms(saved, 'manual', []).map((r) => r.id),
    ['c', 'b', 'a'],
  );
});
