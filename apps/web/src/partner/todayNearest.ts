import {
  JOB_OBJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type JobObject,
  type ProjectStatus,
  type UserRole,
} from '../../../../packages/shared/partner';

/** Приоритет «ближайших»: сначала замер, потом черновик, КП, монтаж. */
const NEXT_RANK: Record<JobObject['status'], number> = {
  measured: 0,
  draft: 1,
  quote_sent: 2,
  install: 3,
  closed: 4,
};

/** Сколько комнат показывали в плоском списке до группировки. */
export const NEAREST_FLAT_LIMIT = 5;

export type NearestStageGroup = {
  status: ProjectStatus;
  label: string;
  rooms: JobObject[];
};

/** Открытые комнаты для роли: у монтажника — только замер и монтаж. */
export function openRoomsForRole(rooms: JobObject[], role: UserRole): JobObject[] {
  const list =
    role === 'crew' ? rooms.filter((room) => room.status === 'install' || room.status === 'measured') : rooms;
  return list.filter((room) => room.status !== 'closed');
}

/**
 * Старый отбор «Ближайшие комнаты»: без закрытых, сортировка по стадии комнаты
 * и свежести updatedAt, первые NEAREST_FLAT_LIMIT штук.
 * Файл: apps/web/src/partner/todayNearest.ts (раньше — TodayHome.tsx, функция nearest).
 */
export function nearestFlat(rooms: JobObject[], role: UserRole, limit = NEAREST_FLAT_LIMIT): JobObject[] {
  return [...openRoomsForRole(rooms, role)]
    .sort(
      (a, b) =>
        (NEXT_RANK[a.status] ?? 9) - (NEXT_RANK[b.status] ?? 9) ||
        String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
    )
    .slice(0, limit);
}

/**
 * Группы по стадии проекта (Новый / Замер / Предложение / Монтаж) для владельца и менеджера.
 * stages — карта roomId → стадия проекта с доски «Проекты».
 */
export function groupRoomsByProjectStage(
  rooms: JobObject[],
  stages: Record<string, ProjectStatus>,
): NearestStageGroup[] {
  const buckets = new Map<ProjectStatus, JobObject[]>();
  for (const status of PROJECT_STATUSES) {
    if (status === 'done') continue;
    buckets.set(status, []);
  }
  for (const room of rooms) {
    const stage = stages[room.id] || 'new';
    if (stage === 'done') continue;
    const list = buckets.get(stage);
    if (list) list.push(room);
    else buckets.set(stage, [room]);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }
  return PROJECT_STATUSES.filter((status) => status !== 'done')
    .map((status) => ({
      status,
      label: PROJECT_STATUS_LABELS[status],
      rooms: buckets.get(status) || [],
    }))
    .filter((group) => group.rooms.length > 0);
}

export function roomStatusPlain(status: JobObject['status']): string {
  return JOB_OBJECT_STATUS_LABELS[status] || status;
}
