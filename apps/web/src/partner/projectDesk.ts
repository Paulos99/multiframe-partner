import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type JobObject,
  type Project,
  type ProjectStatus,
} from '../../../../packages/shared/partner';
import { groupOrphanRooms } from '../../../../packages/shared/groupProjects.js';
import { comfortTransitionLabel } from '../state/simulation';

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

/**
 * Стадия проекта для каждой комнаты: та же, что на доске и в списке проектов.
 * Комнаты без проекта группируются так же, как в разделе «Проекты».
 */
export function roomProjectStatuses(projects: Project[], rooms: JobObject[]): Record<string, ProjectStatus> {
  const doc = {
    projects: projects.map((project) => ({ ...project })),
    objects: rooms.map((room) => ({ ...room })),
  };
  groupOrphanRooms(doc);
  const result: Record<string, ProjectStatus> = {};
  for (const project of doc.projects as Project[]) {
    const own = projectRooms(project, doc.objects as JobObject[]);
    const status = effectiveProjectStatus(project, own);
    for (const room of own) result[room.id] = status;
  }
  return result;
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

const ROOM_KIND: Record<string, string> = {
  living: 'Гостиная',
  bedroom: 'Спальня',
  kids: 'Детская',
  kitchen: 'Кухня',
  office: 'Кабинет',
  other: 'Другое',
};

/** Своё название комнаты, иначе тип из проблемомера. */
export function roomTitle(room: {
  roomName?: string | null;
  room?: { roomType?: string | null; roomTypeCustom?: string | null } | null;
}): string {
  const named = room.roomName?.trim();
  if (named && named !== 'Комната' && named !== 'Помещение') return named;
  const type = room.room?.roomType || '';
  if (type === 'other') return room.room?.roomTypeCustom?.trim() || ROOM_KIND.other;
  return ROOM_KIND[type] || 'Комната';
}

export type NextStep = { roomId: string; text: string };

export function nextSteps(rooms: JobObject[]): NextStep[] {
  const steps: NextStep[] = [];
  for (const room of rooms) {
    const name = roomTitle(room);
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
  if (before || after) {
    const label = comfortTransitionLabel(before, after);
    if (label) return label;
  }
  if (room.room?.areaM2 != null) return 'Площадь есть, профиль не сохранён';
  return 'Проблемомер ещё не заполнен';
}

export function formatProjectDay(day: string | null | undefined): string {
  if (!day) return 'Не указан';
  const parsed = new Date(`${day.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString('ru-RU');
}

export type ProjectAssigneeRole = 'measurer' | 'crew' | 'manager';

/** Кто назначен на проект: поле проекта или, если оно пусто, исполнитель его комнат. */
export function projectAssigneeId(
  project: Project,
  rooms: ReadonlyArray<JobObject>,
  staff: ReadonlyArray<{ id: string; role: string }>,
  kind: ProjectAssigneeRole,
): string | null {
  const own =
    kind === 'measurer' ? project.measurerUserId : kind === 'crew' ? project.crewUserId : project.managerUserId;
  if (own) return own;
  const match = (role: string) =>
    kind === 'measurer' ? role === 'measurer' : kind === 'crew' ? role === 'crew' : role === 'owner' || role === 'sales';
  for (const room of rooms) {
    if (!room.assignedTo) continue;
    const person = staff.find((item) => item.id === room.assignedTo);
    if (person && match(person.role)) return person.id;
  }
  return null;
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

export function panelLabel(count: number | null | undefined): string {
  if (typeof count !== 'number' || !Number.isFinite(count)) return 'Панели не посчитаны';
  const n = Math.max(0, Math.round(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11 ? 'панель' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'панели' : 'панелей';
  return `${n.toLocaleString('ru-RU')} ${word}`;
}

export type CrewProjectGroup = {
  project: Project;
  rooms: JobObject[];
};

/** Проекты с незакрытой комнатой сверху. Полностью закрытые — отдельно, архив не показываем. */
export function crewProjectLists(projects: Project[], rooms: JobObject[], query: string): {
  active: CrewProjectGroup[];
  done: CrewProjectGroup[];
} {
  const active: CrewProjectGroup[] = [];
  const done: CrewProjectGroup[] = [];
  for (const project of projects) {
    if (project.archivedAt) continue;
    const own = projectRooms(project, rooms);
    if (!own.length || !projectMatches(project, own, query)) continue;
    const ordered = [...own].sort((a, b) => Number(a.status === 'closed') - Number(b.status === 'closed'));
    const group = { project, rooms: ordered };
    if (ordered.some((room) => room.status !== 'closed')) active.push(group);
    else done.push(group);
  }
  return { active, done };
}
