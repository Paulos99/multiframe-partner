import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTO_ARCHIVE_DAYS,
  allRoomsCompleted,
  applyAutoArchive,
  archivePatchResult,
  lastRoomCompletedAt,
  shouldAutoArchive,
} from '../../packages/shared/autoArchive.js';

const DAY = 24 * 60 * 60 * 1000;

test('все комнаты closed — готовы к автоархиву', () => {
  assert.equal(allRoomsCompleted([]), false);
  assert.equal(allRoomsCompleted([{ status: 'closed' }, { status: 'install' }]), false);
  assert.equal(allRoomsCompleted([{ status: 'closed' }, { status: 'closed' }]), true);
});

test('дата закрытия — max updatedAt среди closed', () => {
  const at = lastRoomCompletedAt([
    { status: 'closed', updatedAt: '2026-01-01T00:00:00.000Z' },
    { status: 'closed', updatedAt: '2026-01-20T12:00:00.000Z' },
    { status: 'install', updatedAt: '2026-02-01T00:00:00.000Z' },
  ]);
  assert.equal(at, Date.parse('2026-01-20T12:00:00.000Z'));
});

test('через 14 суток после последней комнаты — архивируем', () => {
  const completed = '2026-01-01T00:00:00.000Z';
  const rooms = [{ status: 'closed', updatedAt: completed }];
  const project = { id: 'p1', archivedAt: null };
  const justBefore = Date.parse(completed) + AUTO_ARCHIVE_DAYS * DAY - 1;
  const justAfter = Date.parse(completed) + AUTO_ARCHIVE_DAYS * DAY;
  assert.equal(shouldAutoArchive(project, rooms, justBefore), false);
  assert.equal(shouldAutoArchive(project, rooms, justAfter), true);
});

test('unarchiveHold и уже архивный не трогаем', () => {
  const rooms = [{ status: 'closed', updatedAt: '2020-01-01T00:00:00.000Z' }];
  assert.equal(shouldAutoArchive({ archivedAt: '2020-02-01T00:00:00.000Z' }, rooms, Date.now()), false);
  assert.equal(shouldAutoArchive({ unarchiveHold: true }, rooms, Date.now()), false);
});

test('applyAutoArchive пишет archivedAt', () => {
  const now = Date.parse('2026-02-01T00:00:00.000Z');
  const projects = [
    { id: 'ready', name: 'Готов', archivedAt: null },
    { id: 'held', name: 'Держим', archivedAt: null, unarchiveHold: true },
    { id: 'open', name: 'Открыт', archivedAt: null },
  ];
  const objects = [
    { id: 'r1', projectId: 'ready', status: 'closed', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'r2', projectId: 'held', status: 'closed', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'r3', projectId: 'open', status: 'install', updatedAt: '2026-01-01T00:00:00.000Z' },
  ];
  const n = applyAutoArchive(projects, objects, now);
  assert.equal(n, 1);
  assert.equal(projects[0].archivedAt, new Date(now).toISOString());
  assert.equal(projects[1].archivedAt, null);
  assert.equal(projects[2].archivedAt, null);
});

test('ручной возврат из архива ставит hold; ручная архивация снимает', () => {
  assert.deepEqual(archivePatchResult(false, { archivedAt: '2026-01-01T00:00:00.000Z' }, '2026-02-01T00:00:00.000Z'), {
    archivedAt: null,
    unarchiveHold: true,
  });
  assert.deepEqual(archivePatchResult(true, { archivedAt: null, unarchiveHold: true }, '2026-02-01T00:00:00.000Z'), {
    archivedAt: '2026-02-01T00:00:00.000Z',
    unarchiveHold: false,
  });
  assert.deepEqual(archivePatchResult(undefined, { archivedAt: 'x', unarchiveHold: true }), {
    archivedAt: 'x',
    unarchiveHold: true,
  });
});
