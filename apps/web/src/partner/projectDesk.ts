import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type JobObject,
  type Project,
  type ProjectStatus,
} from '../../../../packages/shared/partner';

const VIEW_KEY = 'mf-project-desk-view';

export type ProjectDeskView = 'list' | 'kanban';

const ROOM_STAGE: Record<string, ProjectStatus> = {
  draft: 'new',
  measured: 'measure',
  quote_sent: 'proposal',
  install: 'install',
  closed: 'done',
};

export function readProjectView(storage: { getItem(key: string): string | null } | null): ProjectDeskView {
  try {
    return storage?.getItem(VIEW_KEY) === 'kanban' ? 'kanban' : 'list';
  } catch {
    return 'list';
  }
}

export function writeProjectView(
  storage: { setItem(key: string, value: string): void } | null,
  view: ProjectDeskView,
) {
  try {
    storage?.setItem(VIEW_KEY, view);
  } catch {
    /* закрытое хранилище */
  }
}

export function projectRooms(project: Pick<Project, 'id' | 'orgId'>, rooms: JobObject[]): JobObject[] {
  return rooms.filter((room) => room.projectId === project.id && room.orgId === project.orgId);
}

/** Сохранённый статус важнее. Иначе — самая дальняя открытая стадия комнат. */
export function effectiveProjectStatus(project: Pick<Project, 'id' | 'status'>, rooms: JobObject[]): ProjectStatus {
  if (project.status && PROJECT_STATUSES.includes(project.status)) return project.status;
  const open = rooms.filter((room) => room.status !== 'closed');
  const source = open.length ? open : rooms;
  let best: ProjectStatus = 'new';
  for (const room of source) {
    const stage = ROOM_STAGE[room.status] || 'new';
    if (PROJECT_STATUSES.indexOf(stage) > PROJECT_STATUSES.indexOf(best)) best = stage;
  }
  return best;
}

export function projectStatusLabel(status: ProjectStatus): string {
  return PROJECT_STATUS_LABELS[status];
}

export function projectMatches(project: Project, rooms: JobObject[], query: string): boolean {
  const needle = query.trim().toLocaleLowerCase('ru');
  if (!needle) return true;
  const hay = [
    project.name,
    project.clientName,
    project.clientPhone,
    project.address,
    project.city,
    project.description,
    ...rooms.flatMap((room) => [room.roomName, room.clientName, room.address]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ru');
  return hay.includes(needle);
}

export function areaSum(rooms: JobObject[]): { known: number; total: number; missing: number } {
  let total = 0;
  let known = 0;
  for (const room of rooms) {
    const area = room.room?.areaM2;
    if (typeof area === 'number' && Number.isFinite(area)) {
      total += area;
      known += 1;
    }
  }
  return { known, total: Math.round(total * 10) / 10, missing: rooms.length - known };
}

export type NextStep = { roomId: string; text: string };

export function nextSteps(rooms: JobObject[]): NextStep[] {
  const steps: NextStep[] = [];
  for (const room of rooms) {
    const name = room.roomName?.trim() || 'Комната';
    if (room.status === 'closed') continue;
    if (room.room?.areaM2 == null) {
      steps.push({ roomId: room.id, text: `${name}: указать площадь` });
    } else if (room.status === 'draft') {
      steps.push({ roomId: room.id, text: `${name}: провести замер` });
    } else if (
      room.status === 'measured' &&
      typeof room.estimate?.totalCost !== 'number' &&
      !(room.estimate?.panels && room.estimate.panels > 0)
    ) {
      steps.push({ roomId: room.id, text: `${name}: сделать расчёт` });
    } else if (room.status === 'quote_sent') {
      steps.push({ roomId: room.id, text: `${name}: дождаться решения по предложению` });
    } else if (room.status === 'install') {
      steps.push({ roomId: room.id, text: `${name}: выполнить монтаж` });
    }
  }
  return steps;
}

export function problemomerLine(room: JobObject): string {
  const before = room.room?.classBefore;
  const after = room.room?.classAfter;
  if (before || after) return `Класс ${before || '—'} → ${after || '—'}`;
  if (room.room?.areaM2 != null) return 'Площадь есть, профиль не сохранён';
  return 'Проблемомер ещё не заполнен';
}

export function formatProjectDay(day: string | null | undefined): string {
  if (!day) return 'Не указан';
  const parsed = new Date(`${day.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString('ru-RU');
}

export function personName(
  staff: ReadonlyArray<{ id: string; displayName: string }>,
  id: string | null | undefined,
): string {
  if (!id) return 'Не назначен';
  return staff.find((person) => person.id === id)?.displayName || 'Назначен';
}

export function formatArea(value: number): string {
  return `${value.toLocaleString('ru-RU')} м²`;
}
