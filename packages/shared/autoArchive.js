/**
 * Автоархив проектов: все комнаты завершены (closed) → через 14 суток
 * после закрытия последней комнаты выставляем archivedAt.
 * Ручной возврат из архива ставит unarchiveHold — автоархив больше не трогает.
 */

export const AUTO_ARCHIVE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {Array<{ status?: string, updatedAt?: string | null }> | null | undefined} rooms
 * @returns {boolean}
 */
export function allRoomsCompleted(rooms) {
  const list = Array.isArray(rooms) ? rooms : [];
  if (!list.length) return false;
  return list.every((room) => room.status === 'closed');
}

/**
 * Момент закрытия последней комнаты (max updatedAt среди closed).
 * @param {Array<{ status?: string, updatedAt?: string | null }> | null | undefined} rooms
 * @returns {number | null} epoch ms
 */
export function lastRoomCompletedAt(rooms) {
  const list = Array.isArray(rooms) ? rooms : [];
  let latest = 0;
  for (const room of list) {
    if (room.status !== 'closed') continue;
    const stamp = Date.parse(String(room.updatedAt || ''));
    if (!Number.isNaN(stamp) && stamp > latest) latest = stamp;
  }
  return latest > 0 ? latest : null;
}

/**
 * @param {{ archivedAt?: string | null, unarchiveHold?: boolean | null }} project
 * @param {Array<{ status?: string, updatedAt?: string | null }> | null | undefined} rooms
 * @param {number | Date | string} [now]
 * @returns {boolean}
 */
export function shouldAutoArchive(project, rooms, now = Date.now()) {
  if (!project || project.archivedAt) return false;
  if (project.unarchiveHold) return false;
  if (!allRoomsCompleted(rooms)) return false;
  const completedAt = lastRoomCompletedAt(rooms);
  if (completedAt == null) return false;
  const nowMs = typeof now === 'number' ? now : Date.parse(String(now));
  if (Number.isNaN(nowMs)) return false;
  return nowMs - completedAt >= AUTO_ARCHIVE_DAYS * DAY_MS;
}

/**
 * Проставляет archivedAt у подходящих проектов. Мутирует массив projects.
 * @param {Array<object>} projects
 * @param {Array<object>} objects
 * @param {number | Date | string} [now]
 * @returns {number} сколько проектов архивировали
 */
export function applyAutoArchive(projects, objects, now = Date.now()) {
  const list = Array.isArray(projects) ? projects : [];
  const rooms = Array.isArray(objects) ? objects : [];
  const nowIso = new Date(typeof now === 'number' ? now : Date.parse(String(now))).toISOString();
  const byProject = new Map();
  for (const room of rooms) {
    const id = room?.projectId;
    if (!id) continue;
    const bucket = byProject.get(id);
    if (bucket) bucket.push(room);
    else byProject.set(id, [room]);
  }
  let changed = 0;
  for (let i = 0; i < list.length; i += 1) {
    const project = list[i];
    if (!project?.id) continue;
    const own = byProject.get(project.id) || [];
    if (!shouldAutoArchive(project, own, now)) continue;
    list[i] = {
      ...project,
      archivedAt: project.archivedAt || nowIso,
      updatedAt: nowIso,
    };
    changed += 1;
  }
  return changed;
}

/**
 * При ручном снятии с архива — hold; при ручной архивации — hold сбрасываем.
 * @param {boolean | undefined} archivedPatch тело.archived
 * @param {{ archivedAt?: string | null, unarchiveHold?: boolean | null } | null | undefined} existing
 * @returns {{ archivedAt: string | null, unarchiveHold: boolean }}
 */
export function archivePatchResult(archivedPatch, existing, nowIso = new Date().toISOString()) {
  const prevAt = existing?.archivedAt || null;
  const prevHold = Boolean(existing?.unarchiveHold);
  if (archivedPatch === undefined) {
    return { archivedAt: prevAt, unarchiveHold: prevHold };
  }
  if (archivedPatch) {
    return { archivedAt: prevAt || nowIso, unarchiveHold: false };
  }
  // Ручной возврат из архива.
  return { archivedAt: null, unarchiveHold: true };
}
