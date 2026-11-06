import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { JobObject, ProjectStatus } from '../../../../packages/shared/partner';
import {
  NEAREST_FLAT_LIMIT,
  groupRoomsByProjectStage,
  nearestFlat,
  openRoomsForRole,
} from './todayNearest';

function room(partial: Partial<JobObject> & Pick<JobObject, 'id' | 'status'>): JobObject {
  return {
    orgId: 'org',
    projectId: 'p1',
    clientName: '',
    address: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: partial.updatedAt || '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    roomName: partial.id,
    ...partial,
  } as JobObject;
}

describe('todayNearest', () => {
  it('плоский список берёт не больше пяти открытых, сначала замер', () => {
    const rooms = [
      room({ id: 'c', status: 'closed', updatedAt: '2026-11-01T00:00:00Z' }),
      room({ id: 'i', status: 'install', updatedAt: '2026-11-05T00:00:00Z' }),
      room({ id: 'd', status: 'draft', updatedAt: '2026-11-04T00:00:00Z' }),
      room({ id: 'm1', status: 'measured', updatedAt: '2026-11-02T00:00:00Z' }),
      room({ id: 'm2', status: 'measured', updatedAt: '2026-11-03T00:00:00Z' }),
      room({ id: 'q', status: 'quote_sent', updatedAt: '2026-11-06T00:00:00Z' }),
      room({ id: 'd2', status: 'draft', updatedAt: '2026-11-01T00:00:00Z' }),
    ];
    const list = nearestFlat(rooms, 'owner');
    assert.equal(list.length, NEAREST_FLAT_LIMIT);
    assert.deepEqual(
      list.map((row) => row.id),
      ['m2', 'm1', 'd', 'd2', 'q'],
    );
  });

  it('группирует по стадии проекта с количеством', () => {
    const rooms = openRoomsForRole(
      [
        room({ id: 'a', status: 'draft' }),
        room({ id: 'b', status: 'measured' }),
        room({ id: 'c', status: 'quote_sent' }),
        room({ id: 'd', status: 'closed' }),
      ],
      'owner',
    );
    const stages: Record<string, ProjectStatus> = {
      a: 'new',
      b: 'measure',
      c: 'proposal',
    };
    const groups = groupRoomsByProjectStage(rooms, stages);
    assert.deepEqual(
      groups.map((g) => [g.status, g.label, g.rooms.length]),
      [
        ['new', 'Новый', 1],
        ['measure', 'Замер', 1],
        ['proposal', 'Предложение', 1],
      ],
    );
  });
});
