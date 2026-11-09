/**
 * Календарь замеров и монтажей и напоминания кабинета.
 * Один и тот же код проверяет запись на сервере и показывает пересечения и напоминания в интерфейсе.
 *
 * Выезд (visit): замер или монтаж по проекту, при желании — по одной комнате.
 * Время хранится в ISO (UTC), показывается в поясе браузера. Длительность — в минутах.
 */

export const VISIT_KINDS = ['measure', 'install'];
export const VISIT_KIND_LABELS = { measure: 'Замер', install: 'Монтаж' };
/** Кого можно назначить на выезд: замер ведёт замерщик, монтаж — монтажник; владелец и менеджер могут поехать сами. */
export const VISIT_ROLES = { measure: ['measurer', 'owner', 'sales'], install: ['crew', 'owner', 'sales'] };
export const VISIT_DEFAULT_MINUTES = { measure: 60, install: 240 };
export const VISIT_MIN_MINUTES = 15;
export const VISIT_MAX_MINUTES = 12 * 60;
export const VISIT_NOTE_MAX = 500;
/** КП без движения столько дней — напоминание. */
export const QUOTE_STALE_DAYS = 3;
export const SOON_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

function canonicalRole(role) {
  if (role === 'partner') return 'owner';
  if (role === 'executor') return 'measurer';
  return role;
}

export function visitStartMs(visit) {
  const t = Date.parse(visit?.startsAt || '');
  return Number.isNaN(t) ? null : t;
}

export function visitEndMs(visit) {
  const start = visitStartMs(visit);
  if (start == null) return null;
  const minutes = Number(visit?.durationMin) || VISIT_DEFAULT_MINUTES[visit?.kind] || 60;
  return start + minutes * MIN_MS;
}

/** Выезд в работе: не отменён. Выполненный остаётся в календаре, но в пересечениях не участвует. */
function activeVisit(visit) {
  return Boolean(visit) && !visit.cancelledAt;
}

/**
 * Проверка полей выезда. Возвращает { value } или { error }.
 * existing — прежняя запись при правке: отсутствующее поле берётся из неё.
 */
export function cleanVisitInput(body, existing = null) {
  const src = body && typeof body === 'object' ? body : {};
  const has = (key) => Object.prototype.hasOwnProperty.call(src, key);
  const kind = has('kind') ? String(src.kind || '') : existing?.kind;
  if (!VISIT_KINDS.includes(kind)) return { error: 'Укажите, это замер или монтаж' };
  const projectId = has('projectId') ? String(src.projectId || '').trim() : existing?.projectId || '';
  if (!projectId) return { error: 'Выберите проект' };
  const objectRaw = has('objectId') ? src.objectId : existing?.objectId;
  const objectId = objectRaw == null || String(objectRaw).trim() === '' ? null : String(objectRaw).trim();
  const startsRaw = has('startsAt') ? src.startsAt : existing?.startsAt;
  const startMs = Date.parse(String(startsRaw || ''));
  if (!startsRaw || Number.isNaN(startMs)) return { error: 'Укажите дату и время' };
  const year = new Date(startMs).getUTCFullYear();
  if (year < 2020 || year > 2100) return { error: 'Укажите дату и время' };
  const durationRaw = has('durationMin') ? src.durationMin : existing?.durationMin ?? VISIT_DEFAULT_MINUTES[kind];
  const durationMin = Math.round(Number(durationRaw));
  if (!Number.isFinite(durationMin) || durationMin < VISIT_MIN_MINUTES || durationMin > VISIT_MAX_MINUTES) {
    return { error: 'Длительность — от 15 минут до 12 часов' };
  }
  const userRaw = has('userId') ? src.userId : existing?.userId;
  const userId = userRaw == null || String(userRaw).trim() === '' ? null : String(userRaw).trim();
  if (!userId) return { error: kind === 'measure' ? 'Выберите замерщика' : 'Выберите монтажника' };
  const note = String(has('note') ? src.note ?? '' : existing?.note ?? '').trim().slice(0, VISIT_NOTE_MAX);
  const done = has('done') ? Boolean(src.done) : Boolean(existing?.doneAt);
  return {
    value: {
      kind,
      projectId,
      objectId,
      startsAt: new Date(startMs).toISOString(),
      durationMin,
      userId,
      note,
      done,
    },
  };
}

/** Можно ли назначить человека на выезд этого типа. */
export function visitRoleAllowed(kind, role) {
  return (VISIT_ROLES[kind] || []).includes(canonicalRole(role));
}

export function visitsOverlap(a, b) {
  const as = visitStartMs(a);
  const bs = visitStartMs(b);
  const ae = visitEndMs(a);
  const be = visitEndMs(b);
  if (as == null || bs == null) return false;
  return as < be && bs < ae;
}

/** Выезды того же человека, которые пересекаются по времени с visit. */
export function findConflicts(visits, visit) {
  if (!visit?.userId || !activeVisit(visit)) return [];
  return (visits || []).filter(
    (other) =>
      other &&
      other.id !== visit.id &&
      activeVisit(other) &&
      !other.doneAt &&
      other.userId === visit.userId &&
      visitsOverlap(other, visit),
  );
}

/** id выездов, у которых есть пересечение. */
export function conflictIds(visits) {
  const ids = new Set();
  const list = (visits || []).filter((v) => activeVisit(v) && !v.doneAt);
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (list[i].userId && list[i].userId === list[j].userId && visitsOverlap(list[i], list[j])) {
        ids.add(list[i].id);
        ids.add(list[j].id);
      }
    }
  }
  return ids;
}

/**
 * Когда отправили КП: поле quoteSentAt (ставит сервер при переходе на «КП отправлено»),
 * у старых комнат — последняя запись истории «…→quote_sent».
 */
export function quoteSentAtOf(room) {
  if (room?.quoteSentAt) return room.quoteSentAt;
  for (const entry of room?.history || []) {
    if (entry?.action === 'status' && /→quote_sent$/.test(String(entry.detail || ''))) return entry.at || null;
  }
  return null;
}

/* —— Демо: выезды «плавают» вместе с текущей датой, пока их не изменили. —— */

const MOSCOW_OFFSET_MIN = 180;

/** Начало «сегодня» по Москве (UTC+3, без перехода на летнее время). */
export function moscowDayStartMs(now = Date.now()) {
  const shifted = now + MOSCOW_OFFSET_MIN * MIN_MS;
  return shifted - (shifted % DAY_MS) - MOSCOW_OFFSET_MIN * MIN_MS;
}

/** Демо-выезд: demoDay — смещение в днях от сегодня, demoMinute — минуты от полуночи по Москве. */
export function materializeVisit(visit, now = Date.now()) {
  if (!visit || !visit.demo || visit.demoDay == null) return visit;
  const startsAt = new Date(moscowDayStartMs(now) + Number(visit.demoDay) * DAY_MS + Number(visit.demoMinute || 0) * MIN_MS).toISOString();
  return { ...visit, startsAt };
}

/* —— Напоминания —— */

function dayKey(ms, tzOffsetMin) {
  const d = new Date(ms - tzOffsetMin * MIN_MS);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function roomLabel(room) {
  return room?.roomName || room?.address || room?.clientName || 'Комната';
}

function projectLabel(project, rooms) {
  return project?.name || project?.address || roomLabel(rooms?.[0]) || 'Проект';
}

/**
 * Напоминания для одного человека. Всё считается из уже отфильтрованных сервером данных:
 * выезды, комнаты и проекты, которые этот человек и так видит.
 *
 * @param {object} input
 * @param {Array} input.visits
 * @param {Array} input.rooms
 * @param {Array} input.projects
 * @param {{ id: string, role: string }} input.user
 * @param {Array} [input.acks] отметки «готово» и «отложить» этого человека
 * @param {number} [input.now]
 * @param {number} [input.tzOffsetMin] Date#getTimezoneOffset() пояса, в котором показываем (по умолчанию Москва)
 * @param {number} [input.quoteStaleDays]
 */
export function buildReminders(input) {
  const now = input.now ?? Date.now();
  const tz = input.tzOffsetMin ?? -MOSCOW_OFFSET_MIN;
  const staleDays = input.quoteStaleDays ?? QUOTE_STALE_DAYS;
  const user = input.user || { id: '', role: '' };
  const role = canonicalRole(user.role);
  const manager = role === 'owner' || role === 'sales' || role === 'admin';
  const visits = (input.visits || []).filter(activeVisit);
  const rooms = input.rooms || [];
  const projects = input.projects || [];
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const roomsByProject = new Map();
  for (const room of rooms) {
    if (!room.projectId) continue;
    const list = roomsByProject.get(room.projectId) || [];
    list.push(room);
    roomsByProject.set(room.projectId, list);
  }
  const mine = (visit) => visit.userId === user.id || visit.createdBy === user.id;
  const out = [];
  const today = dayKey(now, tz);
  const tomorrow = dayKey(now + DAY_MS, tz);

  for (const visit of visits) {
    const start = visitStartMs(visit);
    const end = visitEndMs(visit);
    if (start == null) continue;
    const project = projectById.get(visit.projectId);
    const label = visit.projectName || projectLabel(project, roomsByProject.get(visit.projectId));
    const what = VISIT_KIND_LABELS[visit.kind] || 'Выезд';
    const base = { visitId: visit.id, projectId: visit.projectId, objectId: visit.objectId || null, at: visit.startsAt };
    if (!visit.doneAt && (mine(visit) || manager) && start > now) {
      if (start - now <= SOON_MS && (mine(visit) || role === 'owner')) {
        out.push({ ...base, key: `soon:${visit.id}:${visit.startsAt}`, type: 'visit_soon', tone: 'urgent', title: `Скоро ${what.toLowerCase()}`, detail: label });
      } else if (dayKey(start, tz) === tomorrow && mine(visit)) {
        out.push({ ...base, key: `tomorrow:${visit.id}:${visit.startsAt}`, type: 'visit_tomorrow', tone: 'info', title: `Завтра ${what.toLowerCase()}`, detail: label });
      } else if (dayKey(start, tz) === today && mine(visit)) {
        out.push({ ...base, key: `today:${visit.id}:${visit.startsAt}`, type: 'visit_today', tone: 'info', title: `Сегодня ${what.toLowerCase()}`, detail: label });
      }
    }
    if (end != null && end < now) {
      const projectRooms = visit.objectId
        ? rooms.filter((r) => r.id === visit.objectId)
        : roomsByProject.get(visit.projectId) || [];
      if (visit.kind === 'measure' && projectRooms.length && (visit.userId === user.id || manager)) {
        const noResult = projectRooms.every(
          (r) => r.status === 'draft' && !(r.documents || []).some((d) => d.kind === 'profile' || d.kind === 'estimate' || d.kind === 'spec') && !r.room?.areaM2,
        );
        if (noResult) {
          out.push({ ...base, key: `measure-result:${visit.id}:${visit.startsAt}`, type: 'measure_no_result', tone: 'warn', title: 'Замер прошёл, результатов нет', detail: label });
        }
      }
      if (visit.kind === 'install' && manager && now - end > DAY_MS && projectRooms.some((r) => r.status === 'install')) {
        out.push({ ...base, key: `install-open:${visit.id}:${visit.startsAt}`, type: 'stage_overdue', tone: 'warn', title: 'Монтаж прошёл, этап не закрыт', detail: label });
      }
    }
  }

  if (manager && role !== 'admin') {
    // КП без движения: по проекту, самая ранняя отправка среди комнат, которые всё ещё на «КП отправлено».
    const groups = new Map();
    for (const room of rooms) {
      if (room.status !== 'quote_sent') continue;
      const sent = Date.parse(quoteSentAtOf(room) || '');
      if (Number.isNaN(sent)) continue;
      const key = room.projectId || room.id;
      const prev = groups.get(key);
      if (!prev || sent < prev.sent) groups.set(key, { sent, room });
    }
    for (const [key, { sent, room }] of groups) {
      const days = Math.floor((now - sent) / DAY_MS);
      if (days < staleDays) continue;
      const project = projectById.get(room.projectId);
      out.push({
        key: `quote:${key}:${new Date(sent).toISOString()}`,
        type: 'quote_stale',
        tone: 'warn',
        title: `КП отправлено ${days} ${dayWord(days)} назад, ответа нет`,
        detail: projectLabel(project, roomsByProject.get(room.projectId) || [room]),
        projectId: room.projectId || null,
        objectId: room.projectId ? null : room.id,
        at: new Date(sent).toISOString(),
      });
    }
    // Срок проекта прошёл, а проект не завершён.
    for (const project of projects) {
      if (!project.dueAt || project.archivedAt || project.status === 'done') continue;
      const due = Date.parse(`${project.dueAt}T23:59:59+03:00`);
      if (Number.isNaN(due) || due >= now) continue;
      const projectRooms = roomsByProject.get(project.id) || [];
      if (projectRooms.length && projectRooms.every((r) => r.status === 'closed')) continue;
      out.push({
        key: `due:${project.id}:${project.dueAt}`,
        type: 'stage_overdue',
        tone: 'warn',
        title: 'Срок проекта прошёл',
        detail: projectLabel(project, projectRooms),
        projectId: project.id,
        objectId: null,
        at: new Date(due).toISOString(),
      });
    }
  }

  const acks = new Map((input.acks || []).filter((a) => a && a.userId === user.id).map((a) => [a.key, a]));
  const visible = out.filter((item) => {
    const ack = acks.get(item.key);
    if (!ack) return true;
    if (ack.doneAt) return false;
    const until = Date.parse(ack.snoozeUntil || '');
    return Number.isNaN(until) || until <= now;
  });
  const order = { urgent: 0, warn: 1, info: 2 };
  return visible.sort((a, b) => order[a.tone] - order[b.tone] || String(a.at).localeCompare(String(b.at)));
}

export function dayWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

/** Кто какие выезды видит: StP — все, владелец и менеджер — свою компанию, замерщик и монтажник — свои. */
export function visitVisibleTo(user, visit) {
  const role = canonicalRole(user?.role);
  if (role === 'admin') return true;
  if (!user?.orgId || visit.orgId !== user.orgId) return false;
  if (role === 'owner' || role === 'sales') return true;
  if (role === 'measurer' || role === 'crew') return visit.userId === user.id;
  return false;
}
