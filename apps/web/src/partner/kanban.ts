import type {
  JobObjectStatus,
  UserRole,
} from '../../../../packages/shared/partner';
export const KANBAN_STAGES: JobObjectStatus[] = [
  'draft',
  'measured',
  'quote_sent',
  'install',
  'closed',
];
export function canMoveRoom(role: UserRole, target: JobObjectStatus) {
  return (
    KANBAN_STAGES.includes(target) &&
    (role !== 'crew' || target === 'install' || target === 'closed')
  );
}
import type { JobObject, Project } from '../../../../packages/shared/partner';
export type BoardSort = 'manual' | 'updatedAt' | 'createdAt' | 'client';
export function sortRooms(
  rooms: JobObject[],
  sort: BoardSort,
  order: string[],
  projects: Project[] = [],
) {
  return [...rooms].sort((a, b) => {
    if (sort === 'manual') {
      const rank = (r: JobObject) =>
        order.includes(r.id) ? order.indexOf(r.id) : roomRank(r);
      return rank(a) - rank(b) || a.id.localeCompare(b.id);
    }
    if (sort === 'client') {
      const client = (r: JobObject) =>
        projects.find((p) => p.id === r.projectId)?.clientName ||
        r.clientName ||
        '';
      return (
        client(a).localeCompare(client(b), 'ru') || a.id.localeCompare(b.id)
      );
    }
    return (
      (Date.parse(b[sort]) || 0) - (Date.parse(a[sort]) || 0) ||
      a.id.localeCompare(b.id)
    );
  });
}
export function moveRoomOrder(order: string[], id: string, before?: string) {
  if (id === before) return order;
  const next = order.filter((key) => key !== id);
  const index = before ? next.indexOf(before) : -1;
  next.splice(index < 0 ? 0 : index, 0, id);
  return next;
}

// Fractional ranks update only the moved object, making PATCH and rollback atomic.
export function orderAt(rooms: JobObject[], id: string): number {
  const index = rooms.findIndex((r) => r.id === id);
  const rank = (r: JobObject) => roomRank(r);
  const before = rooms[index - 1],
    after = rooms[index + 1];
  if (!before && !after) return -Date.now();
  if (!before) return rank(after) - 1024;
  if (!after) return rank(before) + 1024;
  return (rank(before) + rank(after)) / 2;
}

export function roomRank(room: JobObject): number {
  let hash = 0;
  for (const char of room.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  return (
    room.stageOrder ?? -(Date.parse(room.updatedAt) || 0) + hash / 4294967296
  );
}

// A sorted view or exhausted fractional gap needs fresh ranks for the column.
export function rankMovedColumn(rooms: JobObject[], id: string): JobObject[] {
  const proposed = rooms.map((room) =>
    room.id === id ? { ...room, stageOrder: orderAt(rooms, id) } : room,
  );
  if (
    proposed.every(
      (room, index) =>
        index === 0 || roomRank(proposed[index - 1]) < roomRank(room),
    )
  )
    return proposed;
  const base = -Date.now();
  return rooms.map((room, index) => ({
    ...room,
    stageOrder: base + index * 1024,
  }));
}
