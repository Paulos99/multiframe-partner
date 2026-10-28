import {
  canCreateObjects,
  type JobObject,
  type Project,
  type ProjectInput,
  type UserRole,
} from '../../../../packages/shared/partner';
import { ROOM_TYPE_LABELS, type RoomType } from '../state/types';

/**
 * «Сохранить в проект» после Проблемомера и Калькулятора без комнаты.
 * Владелец и менеджер выбирают любой проект и могут создать проект и комнату.
 * Замерщик записывает результат только в назначенные ему комнаты.
 * Монтажник комнаты не меняет (сервер ему отказывает), поэтому кнопки у него нет.
 */
export function canSaveToProject(role: UserRole | null | undefined): boolean {
  return role === 'owner' || role === 'sales' || role === 'measurer';
}

/** Куда записать результат. */
export type SaveTarget = {
  project: { id: string } | { create: { name: string } };
  room: { id: string } | { create: { name: string } };
};

export function projectLabel(project: Pick<Project, 'name' | 'address'>): string {
  return project.address ? `${project.name} · ${project.address}` : project.name;
}

export function roomLabel(room: Pick<JobObject, 'roomName' | 'room'>): string {
  const named = room.roomName?.trim();
  if (named) return named;
  const type = room.room?.roomType as RoomType | undefined;
  if (type === 'other') return room.room?.roomTypeCustom?.trim() || ROOM_TYPE_LABELS.other;
  if (type && ROOM_TYPE_LABELS[type]) return ROOM_TYPE_LABELS[type];
  return 'Комната';
}

/** В комнате уже есть результат: площадь, ответы Проблемомера, расчёт или сводка. */
export function roomDataParts(room: JobObject): string[] {
  const parts: string[] = [];
  const area = room.room?.areaM2;
  if (typeof area === 'number' && area > 0) parts.push(`площадь ${area} м²`);
  const answers = room.room?.answers;
  if (room.room?.classBefore || (answers && Object.keys(answers).length > 0)) parts.push('профиль Проблемомера');
  if (room.estimate && (room.estimate.panels > 0 || room.estimate.totalCost != null)) parts.push('расчёт');
  if (room.clientSummary?.trim()) parts.push('сводка');
  return parts;
}

export function roomHasData(room: JobObject): boolean {
  return roomDataParts(room).length > 0;
}

/**
 * Проекты в списке выбора. Архивные не показываем.
 * Тот, кто не создаёт комнаты, видит только проекты, где ему есть что выбрать.
 */
export function pickableProjects(
  role: UserRole | null | undefined,
  projects: Project[],
  rooms: JobObject[],
  query: string,
): Project[] {
  const needle = query.trim().toLocaleLowerCase('ru');
  const creates = Boolean(role && canCreateObjects(role));
  return projects
    .filter((project) => !project.archivedAt)
    .filter((project) => creates || rooms.some((room) => room.projectId === project.id))
    .filter(
      (project) =>
        !needle ||
        [project.name, project.clientName, project.address].some((field) =>
          (field || '').toLocaleLowerCase('ru').includes(needle),
        ),
    )
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function roomsOfProject(rooms: JobObject[], projectId: string): JobObject[] {
  return rooms.filter((room) => room.projectId === projectId);
}

export function cleanName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** Целевой проект: существующий или создаваемый здесь же. */
export async function resolveTargetProject(
  target: SaveTarget,
  projects: Project[],
  createProject: (input: ProjectInput) => Promise<Project>,
  city: string,
): Promise<Project> {
  const wanted = target.project;
  if ('id' in wanted) {
    const found = projects.find((project) => project.id === wanted.id);
    if (!found) throw new Error('Проект не найден. Обновите страницу и повторите.');
    return found;
  }
  const name = cleanName(wanted.create.name);
  if (!name) throw new Error('Введите название проекта');
  return createProject({ name, clientName: '', clientPhone: '', address: '', city });
}
