/**
 * Разрез аналитики: рейтинг сотрудников и карточка человека.
 * Node-сервер импортирует этот файл: Cloud Function не грузит TypeScript.
 */
import { buildProjectCards } from './projectGroups.js';

export const DRILL_METRICS = [
  'staff',
  'problemomer',
  'calculator',
  'pdf',
  'area',
  'panels',
  'avg',
  'done',
];

export const DRILL_PERIODS = ['month', 'quarter', 'year'];

const RANK_ROLES = ['sales', 'measurer', 'crew'];
const FIELD_ROLES = new Set(['measurer', 'crew']);
const ROLE_ALIASES = {
  sales: 'sales',
  manager: 'sales',
  measurer: 'measurer',
  executor: 'measurer',
  exec: 'measurer',
  crew: 'crew',
  installer: 'crew',
  install: 'crew',
};

function canonicalRankRole(role) {
  return ROLE_ALIASES[String(role || '')] || null;
}

/** Старые id демо, которые уже не совпадают с текущим справочником. Логин тот же. */
const LEGACY_LOGINS = {
  u_measurer1: 'exec1',
  u_measurer2: 'exec2',
  u_exec1: 'exec1',
  u_exec2: 'exec2',
  u_installer1: 'crew1',
  u_installer1b: 'crew1b',
  u_installer2: 'crew2',
  u_installer_old: 'crew1',
  u_crew1: 'crew1',
  u_crew1b: 'crew1b',
  u_crew2: 'crew2',
  u_sales_old: 'sales1',
  u_sales1: 'sales1',
  u_sales2: 'sales2',
};

function staffByLogin(staff, login, orgId) {
  const name = String(login || '');
  if (!name) return null;
  const matches = (staff || []).filter((user) => user && user.login === name && (!orgId || !user.orgId || user.orgId === orgId));
  return matches.find((user) => user.orgId === orgId) || matches[0] || null;
}

function byStaffOrder(a, b) {
  return String(a.login || '').localeCompare(String(b.login || '')) || String(a.id).localeCompare(String(b.id));
}

function demoOrg(orgId) {
  return orgId === 'org_demo' || orgId === 'org_demo_spb';
}

function parseTime(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return null;
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return parseTime(Number(value.trim()));
  const stamp = Date.parse(value);
  return Number.isNaN(stamp) ? null : stamp;
}

/** Старые комнаты хранят время числом или только в истории. Без метки комната на доске всё ещё в периоде. */
function roomStamp(object) {
  const fields = [object?.updatedAt, object?.createdAt, object?.updated_at, object?.created_at, object?.date];
  for (const value of fields) {
    const time = parseTime(value);
    if (time != null) return time;
  }
  let latest = null;
  for (const entry of object?.history || []) {
    const time = parseTime(entry?.at);
    if (time != null && (latest == null || time > latest)) latest = time;
  }
  return latest;
}

function roomInWindow(object, from, to) {
  const time = roomStamp(object);
  if (time == null) return true;
  if (from && time < Date.parse(from)) return false;
  if (to && time > Date.parse(to)) return false;
  return true;
}

function roomArea(object) {
  return num(
    object?.room?.areaM2 ??
      object?.areaM2 ??
      object?.area ??
      object?.room?.area ??
      object?.room?.answers?.ceilingAreaM2,
  );
}

function roomPanels(object) {
  return num(object?.estimate?.panels ?? object?.panels ?? object?.panelCount ?? object?.estimate?.panelCount);
}

function historyEntries(object) {
  const list = object?.history || object?.log || object?.events;
  return Array.isArray(list) ? list : [];
}

function mountMark(entry) {
  if (!entry) return false;
  const action = String(entry.action || entry.type || '').toLowerCase();
  const detail = String(entry.detail || entry.status || entry.text || entry.message || '').toLowerCase();
  if (action === 'install' || action === 'mounted' || action === 'mount') return true;
  if (detail.includes('install') || detail.includes('closed') || detail.includes('смонтир') || detail.includes('монтаж')) {
    return true;
  }
  return false;
}

/** Замер или сохранённый профиль комнаты: статус «замер» либо ответы карточки. */
function roomHasMeasurement(object) {
  const status = String(object?.status || object?.stage || '');
  if (status === 'measured') return true;
  if (object?.profile || object?.measurement) return true;
  const answers = object?.room?.answers;
  return Boolean(answers && typeof answers === 'object' && Object.keys(answers).length);
}

function isMounted(object) {
  const status = String(object?.status || object?.stage || object?.column || object?.state || '').toLowerCase();
  if (['install', 'closed', 'installed', 'mounted', 'done', 'complete', 'finished'].includes(status)) return true;
  if (status.includes('монтаж') || status.includes('закры')) return true;
  return historyEntries(object).some(mountMark);
}

function latestEntry(entries) {
  let best = null;
  let bestTime = -Infinity;
  for (const entry of entries) {
    const time = parseTime(entry?.at);
    const score = time == null ? -Infinity : time;
    if (!best || score >= bestTime) {
      best = entry;
      bestTime = score;
    }
  }
  return best;
}

function rawAssignee(object) {
  const fields = [
    'assignedTo',
    'assigneeId',
    'assignee',
    'executorId',
    'crewId',
    'installerId',
    'brigadeId',
    'assignedCrew',
    'executor',
  ];
  for (const key of fields) {
    const value = object?.[key];
    if (value == null || value === '' || value === '—') continue;
    if (typeof value === 'object') return value.id || value.userId || value.login || null;
    return value;
  }
  const assigned = latestEntry(historyEntries(object).filter((entry) => entry && entry.action === 'assign' && entry.detail && entry.detail !== '—'));
  return assigned ? assigned.detail : null;
}

function staffRole(staff, id) {
  return (staff || []).find((user) => user && user.id === id)?.role || null;
}

/** Монтажник комнаты: назначенная бригада или автор отметки «смонтировано». */
function crewForMount(object, staff, orgId) {
  const scope = object?.orgId || orgId;
  const assigned = resolveStaffId(rawAssignee(object), staff, scope);
  if (assigned && staffRole(staff, assigned) === 'crew') return assigned;
  const mark = latestEntry(historyEntries(object).filter(mountMark));
  if (!mark) return null;
  const author =
    resolveStaffId(mark.userId, staff, scope) ||
    resolveStaffId(mark.login, staff, scope) ||
    resolveStaffId(mark.authorName, staff, scope);
  return author && staffRole(staff, author) === 'crew' ? author : null;
}

function resolveStaffId(rawId, staff, orgId) {
  if (rawId == null || rawId === '') return null;
  const id = String(rawId);
  if ((staff || []).some((user) => user && user.id === id)) return id;
  const asLogin = staffByLogin(staff, id, orgId);
  if (asLogin) return asLogin.id;
  const login = LEGACY_LOGINS[id];
  if (!login) return null;
  const legacy = staffByLogin(staff, login, orgId);
  return legacy ? legacy.id : null;
}

/**
 * Кто отвечает за комнату с доски проектов.
 * Сначала id или логин из карточки, затем старый демо-id.
 * Если связи нет, демо-комнату получает текущий сотрудник той же роли:
 * монтаж и закрытые — монтажникам, замер — замерщику, КП — менеджеру.
 */
function boardAssignees(objects, staff, orgId) {
  const map = new Map();
  const pending = [];
  for (const object of objects || []) {
    if (!object?.id) continue;
    if (orgId && object.orgId && object.orgId !== orgId) continue;
    const scope = object.orgId || orgId;
    const mounted = isMounted(object);
    const crew = mounted ? crewForMount(object, staff, scope) : null;
    if (crew) {
      map.set(object.id, crew);
      continue;
    }
    const resolved = resolveStaffId(rawAssignee(object) || object.assignedTo, staff, scope);
    const resolvedRole = resolved ? staffRole(staff, resolved) : null;
    if (resolved && !(mounted && demoOrg(scope) && resolvedRole !== 'crew')) {
      map.set(object.id, resolved);
    } else pending.push(object);
  }
  const byOrg = new Map();
  for (const object of pending) {
    const id = object.orgId || orgId;
    if (!demoOrg(id)) continue;
    if (!byOrg.has(id)) byOrg.set(id, []);
    byOrg.get(id).push(object);
  }
  for (const [id, rooms] of byOrg) {
    const people = (staff || []).filter((user) => user && user.orgId === id);
    const crew = people.filter((user) => user.role === 'crew').sort(byStaffOrder);
    const measurer = people.filter((user) => user.role === 'measurer').sort(byStaffOrder)[0];
    const sales = people.filter((user) => user.role === 'sales').sort(byStaffOrder)[0];
    rooms
      .filter((room) => isMounted(room))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .forEach((room, index) => {
        if (crew.length) map.set(room.id, crew[index % crew.length].id);
      });
    for (const room of rooms) {
      if (map.has(room.id)) continue;
      if (room.status === 'measured' && measurer) map.set(room.id, measurer.id);
      if (room.status === 'quote_sent' && sales) map.set(room.id, sales.id);
    }
  }
  return map;
}
const ROLE_LABELS = {
  sales: 'Менеджеры',
  measurer: 'Замерщики',
  crew: 'Монтажники',
};
const ROOM_LABELS = {
  living: 'Гостиная',
  bedroom: 'Спальня',
  kids: 'Детская',
  kitchen: 'Кухня',
  office: 'Кабинет',
  other: 'Другое',
};

const MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

const DEMO_WEIGHTS = [1.4, 1.1, 0.8, 0.55, 0.35];
const DEMO_BASE = {
  problemomer: 12,
  calculator: 9,
  pdf: 7,
  areaM2: 86,
  panels: 40,
};

export function drillWindow(period, now = new Date()) {
  const end = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  const safe = Number.isNaN(end.getTime()) ? new Date() : end;
  const months = period === 'year' ? 12 : period === 'quarter' ? 3 : 1;
  const from = new Date(Date.UTC(safe.getUTCFullYear(), safe.getUTCMonth(), safe.getUTCDate()));
  from.setUTCMonth(from.getUTCMonth() - months);
  const to = new Date(
    Date.UTC(safe.getUTCFullYear(), safe.getUTCMonth(), safe.getUTCDate(), 23, 59, 59, 999),
  );
  return {
    period: period === 'year' || period === 'quarter' ? period : 'month',
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function parseBound(value) {
  if (value == null || value === '') return null;
  const stamp = Date.parse(value);
  return Number.isNaN(stamp) ? null : new Date(stamp).toISOString();
}

function resolveWindow(input) {
  const period = DRILL_PERIODS.includes(input.period) ? input.period : 'month';
  if (input.from === 'all' || input.unbounded) return { period, from: null, to: null };
  const from = parseBound(input.from);
  const to = parseBound(input.to);
  if (from && to) {
    return { period, from: from <= to ? from : to, to: from <= to ? to : from };
  }
  return drillWindow(period, input.now ? new Date(input.now) : new Date());
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function inWindow(at, from, to) {
  const stamp = Date.parse(at || '');
  if (Number.isNaN(stamp)) return false;
  if (!from && !to) return true;
  if (from && stamp < Date.parse(from)) return false;
  if (to && stamp > Date.parse(to)) return false;
  return true;
}

function completed(event) {
  return event?.action === 'result' || event?.action === 'calc_done';
}

export function visibleStaff(viewer, users, orgId) {
  const role = viewer?.role;
  if (role !== 'admin' && role !== 'owner' && role !== 'sales') return [];
  const focus = role === 'admin' ? orgId || null : viewer?.orgId || orgId || null;
  const people = (users || [])
    .filter((user) => user && canonicalRankRole(user.role) && (!focus || user.orgId === focus))
    .map((user) => ({ ...user, role: canonicalRankRole(user.role) }));
  if (role === 'sales') {
    return people.filter((user) => user.id === viewer.id || FIELD_ROLES.has(user.role));
  }
  return people;
}

function emptyRow(user) {
  return {
    userId: user.id,
    login: user.login || '',
    displayName: user.displayName || user.login || 'Сотрудник',
    role: user.role,
    problemomer: 0,
    calculator: 0,
    pdf: 0,
    areaM2: 0,
    panels: 0,
    completed: 0,
    withArea: 0,
    measuredRooms: 0,
    mountedRooms: 0,
    mountedAreaM2: 0,
    mountedPanels: 0,
    workKeys: new Set(),
    boardProjectIds: new Set(),
    boardRooms: [],
  };
}

const PANEL_AREA_M2 = 0.75 * 0.55;

/** Комнаты демо, если в сохранённой базе нет своих проектов. */
const DEMO_ROOMS = [
  { id: 'obj_a01', orgId: 'org_demo', projectId: 'obj_a01', clientName: 'Иванова А.', address: 'ул. Арбат, 12', city: 'Москва', room: { roomType: 'living', areaM2: 18 } },
  { id: 'obj_a02', orgId: 'org_demo', projectId: 'obj_a02', clientName: 'Петров С.', address: 'Ленинский пр., 45', city: 'Москва', room: { roomType: 'bedroom', areaM2: 22 } },
  { id: 'obj_a03', orgId: 'org_demo', projectId: 'obj_a03', clientName: 'Сидорова М.', address: 'ул. Тверская, 8', city: 'Москва', room: { roomType: 'kids', areaM2: 16 } },
  { id: 'obj_a04', orgId: 'org_demo', projectId: 'obj_a04', clientName: 'Козлов Д.', address: 'пр. Мира, 70', city: 'Москва', room: { roomType: 'living', areaM2: 28 } },
  { id: 'obj_a06', orgId: 'org_demo', projectId: 'obj_a06', clientName: 'Морозова Е.', address: 'ул. Покровка, 3', city: 'Москва', room: { roomType: 'kitchen', areaM2: 20 } },
  { id: 'obj_a07', orgId: 'org_demo', projectId: 'obj_a07', clientName: 'Никитин И.', address: 'ул. Ордынка, 19', city: 'Москва', room: { roomType: 'office', areaM2: 24 } },
  { id: 'obj_b01', orgId: 'org_demo_spb', projectId: 'obj_b01', clientName: 'Смирнов В.', address: 'Невский пр., 28', city: 'Санкт-Петербург', room: { roomType: 'living', areaM2: 21 } },
  { id: 'obj_b03', orgId: 'org_demo_spb', projectId: 'obj_b03', clientName: 'Орлов К.', address: 'ул. Рубинштейна, 9', city: 'Санкт-Петербург', room: { roomType: 'bedroom', areaM2: 26 } },
  { id: 'obj_b04', orgId: 'org_demo_spb', projectId: 'obj_b04', clientName: 'Павлова Т.', address: 'Васильевский остр., 7-я линия, 22', city: 'Санкт-Петербург', room: { roomType: 'kids', areaM2: 18 } },
];

const DEMO_MOUNTS = [
  { userId: 'u_crew1', orgId: 'org_demo', day: 5, area: 18, client: 'Сидорова М.', address: 'ул. Тверская, 8' },
  { userId: 'u_crew1', orgId: 'org_demo', day: 40, area: 22, client: 'Иванова А.', address: 'ул. Арбат, 12' },
  { userId: 'u_crew1', orgId: 'org_demo', day: 130, area: 16, client: 'Петров С.', address: 'Ленинский пр., 45' },
  { userId: 'u_crew1', orgId: 'org_demo', day: 250, area: 20, client: 'Козлов Д.', address: 'пр. Мира, 70' },
  { userId: 'u_crew1b', orgId: 'org_demo', day: 3, area: 14, client: 'Морозова Е.', address: 'ул. Покровка, 3' },
  { userId: 'u_crew1b', orgId: 'org_demo', day: 50, area: 24, client: 'Никитин И.', address: 'ул. Ордынка, 19' },
  { userId: 'u_crew1b', orgId: 'org_demo', day: 170, area: 12, client: 'Белова Н.', address: 'ул. Солянка, 2' },
  { userId: 'u_crew2', orgId: 'org_demo_spb', day: 8, area: 19, client: 'Орлов К.', address: 'ул. Рубинштейна, 9' },
  { userId: 'u_crew2', orgId: 'org_demo_spb', day: 80, area: 15, client: 'Павлова Т.', address: 'Васильевский остр., 7-я линия, 22' },
  { userId: 'u_crew2', orgId: 'org_demo_spb', day: 220, area: 21, client: 'Смирнов В.', address: 'Невский пр., 28' },
];

function noonDaysBefore(day, now) {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now || Date.now());
  if (Number.isNaN(date.getTime())) date.setTime(Date.now());
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date.toISOString();
}

function demoMountedRooms(now, staff) {
  const byOrg = new Map();
  for (const spec of DEMO_MOUNTS) {
    if (!byOrg.has(spec.orgId)) byOrg.set(spec.orgId, []);
    byOrg.get(spec.orgId).push(spec);
  }
  const rooms = [];
  for (const [orgId, specs] of byOrg) {
    const slots = [];
    for (const spec of specs) {
      if (!slots.includes(spec.userId)) slots.push(spec.userId);
    }
    const crew = (staff || [])
      .filter((user) => user && user.role === 'crew' && user.orgId === orgId)
      .slice()
      .sort((a, b) => String(a.login || '').localeCompare(String(b.login || '')) || String(a.id).localeCompare(String(b.id)));
    if (!crew.length) continue;
    for (const spec of specs) {
      const person = crew[slots.indexOf(spec.userId) % crew.length];
      rooms.push({
        id: `demo_mount_${person.id}_${spec.day}`,
        orgId,
        status: 'install',
        assignedTo: person.id,
        createdBy: null,
        updatedAt: noonDaysBefore(spec.day, now),
        createdAt: noonDaysBefore(spec.day, now),
        clientName: spec.client,
        address: spec.address,
        room: { areaM2: spec.area, roomType: 'living' },
        estimate: { panels: Math.ceil(spec.area / PANEL_AREA_M2) },
      });
    }
  }
  return rooms;
}

function stableIndex(seed, size) {
  let hash = 0;
  const text = String(seed || '');
  for (let index = 0; index < text.length; index += 1) hash = (hash * 33 + text.charCodeAt(index)) >>> 0;
  return size ? hash % size : 0;
}

function realRoom(project, objects, orgId) {
  const rooms = (objects || []).filter((room) => room && room.id && (!orgId || !room.orgId || room.orgId === orgId));
  if (!rooms.length) return project;
  if (project.roomId && rooms.some((room) => room.id === project.roomId)) return project;
  const named = rooms.find(
    (room) => room.id === project.id || room.projectId === project.id || room.clientName === project.name || room.roomName === project.name,
  );
  const room = named || rooms[stableIndex(project.id, rooms.length)];
  return {
    ...project,
    roomId: room.id,
    name: project.name && project.name !== 'Расчёт' ? project.name : room.clientName || room.roomName || room.address || project.name,
  };
}

function roomProject(room, projects) {
  const projectId = room.projectId || room.id;
  const project = (projects || []).find((item) => item && item.id === projectId);
  return {
    projectId: String(projectId),
    roomId: room.id || null,
    name: project?.name || room.clientName || room.roomName || room.address || 'Комната',
  };
}

function roomsForEvent(event, objects) {
  const own = (objects || []).filter((room) => room && (!event?.orgId || room.orgId === event.orgId));
  if (own.length) return own;
  if (event?.orgId === 'org_demo' || event?.orgId === 'org_demo_spb') {
    return DEMO_ROOMS.filter((room) => room.orgId === event.orgId);
  }
  return [];
}

/** Событие без projectId цепляется к комнате по клиенту, подписи или типу. */
function linkWork(event, projects, objects) {
  const object = event?.object || {};
  if (object.projectId) {
    const project = (projects || []).find((item) => item && item.id === object.projectId);
    return {
      projectId: String(object.projectId),
      roomId: object.objectId || object.roomId || null,
      name: project?.name || projectTitle(object, project),
    };
  }
  const rooms = roomsForEvent(event, objects);
  const byId = rooms.find((room) => room.id && (room.id === object.objectId || room.id === object.roomId));
  if (byId) return roomProject(byId, projects);
  const client = String(object.clientName || object.client || '').trim();
  if (client) {
    const room = rooms.find((item) => item.clientName === client);
    if (room) return roomProject(room, projects);
    const project = (projects || []).find(
      (item) => item && (item.clientName === client || item.name === client) && (!event.orgId || !item.orgId || item.orgId === event.orgId),
    );
    if (project) return { projectId: String(project.id), roomId: null, name: project.name || client };
  }
  const label = String(object.label || object.roomName || '').trim();
  if (label) {
    const room = rooms.find((item) => item.roomName === label || item.clientName === label || item.address === label);
    if (room) return roomProject(room, projects);
    // Подпись — тип комнаты, а не клиент: такие расчёты не склеиваем в один «проект» по названию.
    if (Object.values(ROOM_LABELS).includes(label)) {
      return { projectId: null, roomId: object.objectId || object.roomId || null, name: label };
    }
    return { projectId: `label:${label}`, roomId: object.objectId || object.roomId || null, name: label };
  }
  const roomType = object.roomType;
  if (roomType && rooms.length) {
    const typed = rooms.filter((item) => (item.room?.roomType || item.roomType) === roomType);
    const pool = typed.length ? typed : rooms;
    const ranked = pool.slice().sort((a, b) => {
      const left = Math.abs(num(a.room?.areaM2 ?? a.areaM2) - num(object.areaM2));
      const right = Math.abs(num(b.room?.areaM2 ?? b.areaM2) - num(object.areaM2));
      return left - right || String(a.id).localeCompare(String(b.id));
    });
    return roomProject(ranked[0], projects);
  }
  if ((event?.orgId === 'org_demo' || event?.orgId === 'org_demo_spb') && rooms.length) {
    return roomProject(rooms[stableIndex(event.id || event.at, rooms.length)], projects);
  }
  return null;
}

function eventArea(event) {
  return num(event?.object?.areaM2);
}

function eventPanels(event) {
  return num(event?.object?.panels);
}

function addEvent(row, event, projects, objects) {
  if (event.tool === 'problemomer' && event.action === 'result') row.problemomer += 1;
  if (event.tool === 'calculator' && event.action === 'calc_done') row.calculator += 1;
  if (event.action === 'pdf') row.pdf += 1;
  if (!completed(event)) return;
  row.completed += 1;
  const area = eventArea(event);
  const panels = eventPanels(event);
  if (area > 0) {
    row.areaM2 += area;
    row.withArea += 1;
  }
  if (panels > 0) row.panels += panels;
  const object = event.object || {};
  const linked = linkWork(event, projects, objects);
  const key = linked?.projectId || object.projectId || object.objectId || object.roomId || event.id;
  if (key) row.workKeys.add(String(key));
  if (!row.seenEvents) row.seenEvents = [];
  row.seenEvents.push(event);
}

function eventMetric(row, metric) {
  if (metric === 'problemomer') return row.problemomer;
  if (metric === 'calculator') return row.calculator;
  if (metric === 'pdf') return row.pdf;
  if (metric === 'area') return round1(row.areaM2);
  if (metric === 'panels') return Math.round(row.panels);
  if (metric === 'done') return row.completed;
  if (metric === 'avg') return row.withArea ? round1(row.areaM2 / row.withArea) : 0;
  return row.problemomer + row.calculator + row.pdf;
}

/** Монтажники на плитках «Площадь» и «Панели» ранжируются по смонтированному, не по чужим расчётам. */
function displayValue(row, metric) {
  if (row.role === 'crew' && metric === 'panels') return Math.round(row.mountedPanels || 0);
  if (row.role === 'crew' && metric === 'area') return round1(row.mountedAreaM2 || 0);
  return eventMetric(row, metric);
}

function preferredRoles(metric) {
  if (metric === 'problemomer' || metric === 'calculator' || metric === 'pdf') {
    return ['sales', 'measurer'];
  }
  if (metric === 'panels' || metric === 'staff') return ['sales', 'measurer', 'crew'];
  return ['sales', 'measurer'];
}

function roleHasMetric(rows, metric) {
  if (!rows.length) return false;
  if (metric === 'staff') return true;
  return rows.some((row) => displayValue(row, metric) > 0);
}

function periodScale(period) {
  if (period === 'year') return 12;
  if (period === 'quarter') return 3;
  return 1;
}

function applyDemoFill(rows, period) {
  const scale = periodScale(period);
  return rows
    .slice()
    .sort((a, b) => String(a.userId).localeCompare(String(b.userId)))
    .map((row, index) => {
      const weight = DEMO_WEIGHTS[index % DEMO_WEIGHTS.length];
      const problemomer = Math.max(1, Math.round(DEMO_BASE.problemomer * weight * scale));
      const calculator = Math.max(1, Math.round(DEMO_BASE.calculator * weight * scale));
      const pdf = Math.max(1, Math.round(DEMO_BASE.pdf * weight * scale));
      const areaM2 = round1(DEMO_BASE.areaM2 * weight * scale);
      const panels = Math.round(DEMO_BASE.panels * weight * scale);
      return {
        ...row,
        problemomer,
        calculator,
        pdf,
        areaM2,
        panels,
        completed: problemomer + calculator,
        withArea: problemomer + calculator,
      };
    });
}

function absorbDrift(rows, key, target, roundFn) {
  for (const row of rows) row[key] = roundFn(row[key]);
  let drift = roundFn(target - rows.reduce((sum, row) => sum + row[key], 0));
  const ordered = rows
    .slice()
    .sort((a, b) => b[key] - a[key] || String(a.userId).localeCompare(String(b.userId)));
  for (const row of ordered) {
    if (!drift) break;
    const next = roundFn(row[key] + drift);
    if (next < 0) {
      drift = roundFn(drift + row[key]);
      row[key] = 0;
      continue;
    }
    row[key] = next;
    drift = 0;
  }
}

function reconcileTotals(rows) {
  if (!rows.length) return;
  const areaTarget = round1(rows.reduce((sum, row) => sum + row.areaM2, 0));
  const panelTarget = Math.round(rows.reduce((sum, row) => sum + row.panels, 0));
  absorbDrift(rows, 'areaM2', areaTarget, round1);
  absorbDrift(rows, 'panels', panelTarget, (value) => Math.round(value));
}

function monthKeys(from, to, events) {
  let startIso = from;
  let endIso = to;
  if (!startIso || !endIso) {
    const stamps = (events || [])
      .map((event) => Date.parse(event?.at || ''))
      .filter((stamp) => !Number.isNaN(stamp));
    const today = new Date().toISOString();
    startIso = stamps.length ? new Date(Math.min(...stamps)).toISOString() : today;
    endIso = stamps.length ? new Date(Math.max(...stamps)).toISOString() : today;
  }
  const start = new Date(startIso);
  const end = new Date(endIso);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const keys = [];
  while (cursor.getTime() <= last.getTime() && keys.length < 24) {
    const month = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    keys.push(`${cursor.getUTCFullYear()}-${month}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys.length ? keys : [end.toISOString().slice(0, 7)];
}

function monthTitle(key) {
  const [year, month] = String(key).split('-');
  const name = MONTHS[Number(month) - 1] || month;
  return `${name} ${year}`;
}

function emptyBucket(key) {
  return {
    key,
    label: monthTitle(key),
    problemomer: 0,
    calculator: 0,
    pdf: 0,
    areaM2: 0,
    panels: 0,
    completed: 0,
  };
}

function spreadInt(total, parts, index) {
  const base = Math.floor(total / parts);
  const extra = total - base * parts;
  return base + (index < extra ? 1 : 0);
}

function demoMonths(keys, person) {
  const parts = Math.max(1, keys.length);
  return keys.map((key, index) => ({
    ...emptyBucket(key),
    problemomer: spreadInt(person.problemomer, parts, index),
    calculator: spreadInt(person.calculator, parts, index),
    pdf: spreadInt(person.pdf, parts, index),
    completed: spreadInt(person.completed, parts, index),
    panels: spreadInt(person.panels, parts, index),
    areaM2: round1(person.areaM2 / parts),
  }));
}

function collectProjects(userId, objects, projects, orgId, from, to, respectWindow, assigneeOf) {
  const grouped = new Map();
  for (const object of objects || []) {
    if (!object || (orgId && object.orgId !== orgId)) continue;
    const ownerId = assigneeOf ? assigneeOf(object) : null;
    if (ownerId) {
      if (ownerId !== userId) continue;
    } else if (object.createdBy !== userId && object.assignedTo !== userId) continue;
    const stamp = object.updatedAt || object.createdAt;
    if (respectWindow && !inWindow(stamp, from, to)) continue;
    const projectId = object.projectId || object.id;
    const project = (projects || []).find((item) => item.id === projectId);
    const area = num(object.room?.areaM2);
    const panels = num(object.estimate?.panels);
    const current = grouped.get(projectId);
    if (!current) {
      grouped.set(projectId, {
        id: projectId,
        name: project?.name || object.clientName || object.roomName || 'Комната',
        areaM2: area,
        panels,
        rooms: 1,
        roomId: object.id,
        bestArea: area,
      });
      continue;
    }
    current.areaM2 += area;
    current.panels += panels;
    current.rooms += 1;
    if (area >= current.bestArea) {
      current.bestArea = area;
      current.roomId = object.id;
    }
  }
  return finishProjects(grouped);
}

const DEMO_PROJECT_NAMES = ['Квартира на Тверской', 'Офис на Садовом', 'Спальня в Жуковке'];

function demoProjects(userId) {
  return DEMO_PROJECT_NAMES.map((name, index) => ({
    id: `demo_${userId}_${index}`,
    name,
    areaM2: round1(18 + index * 7.5),
    panels: 12 + index * 6,
    rooms: 1 + (index === 2 ? 1 : 0),
    roomId: null,
  }));
}

function publicRow(row, metric) {
  return {
    userId: row.userId,
    login: row.login,
    displayName: row.displayName,
    role: row.role,
    problemomer: row.problemomer,
    calculator: row.calculator,
    pdf: row.pdf,
    areaM2: round1(row.areaM2),
    panels: Math.round(row.panels),
    completed: row.completed,
    measuredRooms: row.measuredRooms || 0,
    mountedRooms: row.mountedRooms || 0,
    mountedAreaM2: round1(row.mountedAreaM2 || 0),
    mountedPanels: Math.round(row.mountedPanels || 0),
    projectCount:
      row.projectTotal != null
        ? row.projectTotal
        : row.boardCards?.length
          ? row.boardCards.length
          : row.boardProjectIds?.size
            ? row.boardProjectIds.size
            : row.workKeys
              ? row.workKeys.size
              : 0,
    value: displayValue(row, metric),
  };
}

function projectTitle(object, project) {
  if (project?.name) return project.name;
  if (object?.label) return String(object.label);
  if (object?.roomName) return String(object.roomName);
  const roomType = object?.roomType;
  if (roomType && ROOM_LABELS[roomType]) return ROOM_LABELS[roomType];
  if (typeof roomType === 'string' && roomType.trim()) return roomType.trim();
  return 'Расчёт';
}

const GENERIC_ROOM_TITLES = ['Комната', 'Расчёт'];

/** Название для «Топ проектов»: клиент или проект. Название комнаты проектом не считается. */
function namedProjects(list, projects, rooms) {
  const real = new Set();
  for (const project of projects || []) {
    if (project?.name) real.add(String(project.name).trim());
    if (project?.clientName) real.add(String(project.clientName).trim());
  }
  for (const room of rooms || []) {
    if (room?.clientName) real.add(String(room.clientName).trim());
  }
  const roomish = new Set([...Object.values(ROOM_LABELS), ...GENERIC_ROOM_TITLES]);
  for (const room of rooms || []) {
    if (room?.roomName) roomish.add(String(room.roomName).trim());
  }
  return (list || []).map((item) => {
    const name = String(item.name || '').trim();
    if (!name) return item;
    if (name.startsWith('Без проекта')) return item;
    if (real.has(name) || !roomish.has(name)) return item;
    const room = item.roomId ? (rooms || []).find((candidate) => candidate?.id === item.roomId) : null;
    const roomTitle = GENERIC_ROOM_TITLES.includes(name) && room?.roomName ? String(room.roomName).trim() : name;
    return { ...item, name: `Без проекта · ${roomTitle}` };
  });
}

function finishProjects(grouped) {
  return [...grouped.values()]
    .map((row) => ({
      id: row.id,
      name: row.name,
      areaM2: round1(row.areaM2),
      panels: Math.round(row.panels),
      rooms: row.rooms,
      roomId: row.roomId || null,
    }))
    .sort((a, b) => b.areaM2 - a.areaM2 || b.panels - a.panels || a.name.localeCompare(b.name, 'ru'))
    .slice(0, 8);
}

function projectsFromEvents(userId, events, projects, orgId, from, to, accept, objects) {
  const same = accept || ((event) => event.userId === userId);
  const grouped = new Map();
  for (const event of events || []) {
    if (!event || !same(event)) continue;
    if (String(event.role || '') === 'admin') continue;
    if (orgId && event.orgId !== orgId) continue;
    if (!inWindow(event.at, from, to)) continue;
    if (!completed(event)) continue;
    const object = event.object || {};
    const linked = linkWork(event, projects, objects);
    const projectId = linked?.projectId || object.projectId || null;
    const objectId = linked?.roomId || object.objectId || object.roomId || null;
    const key = String(projectId || objectId || event.id || '');
    if (!key) continue;
    const project = projectId ? (projects || []).find((item) => item && item.id === projectId) : null;
    const area = eventArea(event);
    const panels = eventPanels(event);
    const name = linked?.name || projectTitle(object, project);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        id: key,
        name,
        areaM2: area,
        panels,
        rooms: 1,
        roomId: objectId || null,
        bestArea: area,
        roomKeys: new Set([String(objectId || event.id || key)]),
      });
      continue;
    }
    current.areaM2 += area;
    current.panels += panels;
    // Комнат столько, сколько разных комнат, а не расчётов: несколько расчётов одной комнаты — одна комната.
    current.roomKeys.add(String(objectId || event.id || key));
    current.rooms = current.roomKeys.size;
    if (area >= current.bestArea) {
      current.bestArea = area;
      if (objectId) current.roomId = objectId;
      if (name && name !== 'Расчёт') current.name = name;
    }
  }
  return [...grouped.values()].map(({ roomKeys, ...row }) => row);
}

function roomTitle(room) {
  const type = room?.room?.roomType || room?.roomType;
  return String(room?.roomName || (type && ROOM_LABELS[type]) || 'Комната').trim();
}

/** Клиент или проект. Нет ни того, ни другого: «Без проекта · комната». */
function cardName(card, best) {
  const client = card.project?.clientName || card.project?.name || (card.rooms || []).find((room) => room?.clientName)?.clientName;
  if (client) return client;
  if (card.title && card.title !== 'Клиент') return card.title;
  return `Без проекта · ${roomTitle(best)}`;
}

function projectsFromCards(cards) {
  return (cards || []).map((card) => {
    const rooms = card.rooms || [];
    const best = rooms
      .slice()
      .sort((a, b) => roomArea(b) - roomArea(a) || String(a.id).localeCompare(String(b.id)))[0];
    return {
      id: String(card.key),
      name: cardName(card, best),
      areaM2: round1(rooms.reduce((sum, room) => sum + roomArea(room), 0)),
      panels: Math.round(rooms.reduce((sum, room) => sum + roomPanels(room), 0)),
      rooms: Math.max(1, rooms.length),
      roomId: best?.id || null,
    };
  });
}

function mergeProjectLists(roomProjects, eventProjects) {
  const grouped = new Map();
  for (const row of roomProjects) grouped.set(row.id, { ...row });
  for (const row of eventProjects) {
    if (!row?.name) continue;
    if ([...grouped.values()].some((item) => item.name === row.name)) continue;
    const key = grouped.has(row.id) ? `${row.id}:${row.name}` : row.id;
    grouped.set(key, { ...row, id: key });
  }
  return finishProjects(grouped);
}

/** Тот же список, что уйдёт в топ: комнаты доски плюс события, без обрезки. */
function listedProjects(roomProjects, eventProjects) {
  const grouped = new Map();
  for (const row of roomProjects || []) {
    if (row?.id) grouped.set(row.id, { ...row });
  }
  for (const row of eventProjects || []) {
    if (!row?.name || row.name === 'Расчёт') continue;
    if ([...grouped.values()].some((item) => item.name === row.name)) continue;
    const key = grouped.has(row.id) ? `${row.id}:${row.name}` : row.id;
    grouped.set(key, { ...row, id: key });
  }
  return [...grouped.values()].sort(
    (a, b) => b.areaM2 - a.areaM2 || b.panels - a.panels || String(a.name).localeCompare(String(b.name), 'ru'),
  );
}

export function buildStaffDrill(input) {
  const metric = DRILL_METRICS.includes(input.metric) ? input.metric : 'staff';
  const window = resolveWindow(input);
  const orgId =
    input.viewer?.role === 'admin' ? input.orgId || null : input.viewer?.orgId || input.orgId || null;
  const staff = visibleStaff(input.viewer, input.users, orgId);
  const allowed = new Set(staff.map((user) => user.id));
  const companyScope = input.viewer?.role !== 'sales';
  const usersById = new Map((input.users || []).filter(Boolean).map((user) => [user.id, user]));
  const usersByLogin = new Map();
  for (const user of input.users || []) {
    if (!user?.login) continue;
    usersByLogin.set(`${user.orgId || ''}::${user.login}`, user);
  }
  const rows = new Map(staff.map((user) => [user.id, emptyRow(user)]));

  function personFor(event) {
    if (event?.userId && usersById.has(event.userId)) return usersById.get(event.userId);
    const login = String(event?.login || '');
    if (!login) return null;
    return usersByLogin.get(`${event.orgId || orgId || ''}::${login}`) || null;
  }

  function rankRole(event) {
    const known = personFor(event);
    const fromDirectory = canonicalRankRole(known?.role);
    if (fromDirectory) return fromDirectory;
    if (known && (known.role === 'owner' || known.role === 'admin' || known.role === 'partner')) return null;
    return canonicalRankRole(event?.role);
  }

  function eventMatchesUser(event, userId) {
    if (!event || !userId) return false;
    if (event.userId === userId) return true;
    const known = personFor(event);
    return Boolean(known && known.id === userId && canonicalRankRole(known.role));
  }

  function adopt(event, role) {
    const id = event.userId || `login:${event.login || 'unknown'}`;
    const existing = rows.get(id);
    if (existing) return existing;
    const row = emptyRow({
      id,
      login: event.login || '',
      displayName: event.login || 'Без сотрудника',
      role,
    });
    rows.set(id, row);
    return row;
  }

  function unassignedRow() {
    const existing = rows.get('unassigned');
    if (existing) return existing;
    const row = emptyRow({
      id: 'unassigned',
      login: '',
      displayName: 'Без исполнителя',
      role: 'unassigned',
    });
    rows.set('unassigned', row);
    return row;
  }

  const tileEvents = [];
  for (const event of input.events || []) {
    if (!event) continue;
    if (String(event.role || '') === 'admin') continue;
    if (usersById.get(event.userId)?.role === 'admin') continue;
    if (orgId && event.orgId !== orgId) continue;
    if (!inWindow(event.at, window.from, window.to)) continue;
    tileEvents.push(event);
    const role = rankRole(event);
    const known = personFor(event);
    const staffId = role && known && canonicalRankRole(known.role) === role ? known.id : null;
    let row = staffId ? rows.get(staffId) : null;
    if (!row && role && companyScope) row = adopt(event, role);
    if (!row && !companyScope && staffId && allowed.has(staffId)) row = rows.get(staffId);
    // Плитка компании считает это же событие. Без роли оно встаёт в «Без исполнителя».
    // В срезе «моя команда» чужие события не показываем: менеджер не видит владельца и других менеджеров.
    if (!row) {
      if (!companyScope) continue;
      row = unassignedRow();
    }
    addEvent(row, event, input.projects, input.objects);
  }

  function rowForAssignee(userId) {
    if (!userId) return null;
    if (rows.has(userId)) return rows.get(userId);
    const known = usersById.get(userId);
    if (known && rows.has(known.id)) return rows.get(known.id);
    for (const row of rows.values()) {
      if (row.login && row.login === userId) return row;
    }
    return null;
  }

  const board = input.objects || [];
  const boardIds = new Set(board.map((object) => object?.id).filter(Boolean));
  const orgHasBoardRooms = board.some(
    (object) => object && (!orgId || !object.orgId || object.orgId === orgId),
  );
  const drillObjects = orgHasBoardRooms
    ? board
    : [...board, ...demoMountedRooms(input.now ? new Date(input.now) : new Date(), staff)];
  const assigneeById = boardAssignees(drillObjects, staff, orgId);
  const salesInOrg = staff.filter((user) => user.role === 'sales' && (!orgId || user.orgId === orgId));
  const drops = {
    rooms: 0,
    company: 0,
    period: 0,
    assignee: 0,
    notMounted: 0,
    mounted: 0,
    cards: 0,
    boardInsteadOfEmptyPeriod: 0,
    installByUser: {},
    closedByUser: {},
  };
  const companyRooms = [];
  for (const object of drillObjects) {
    if (!object) continue;
    if (orgId && object.orgId && object.orgId !== orgId) {
      drops.company += 1;
      continue;
    }
    companyRooms.push(object);
  }
  drops.rooms = companyRooms.length;
  for (const object of companyRooms) {
    const who = assigneeById.get(object.id) || object.assignedTo || '—';
    const bucket = object.status === 'closed' ? drops.closedByUser : object.status === 'install' ? drops.installByUser : null;
    if (bucket) bucket[who] = (bucket[who] || 0) + 1;
  }
  // Если в окне нет ни одной смонтированной комнаты, а на доске они есть — берём их.
  // Иначе старая метка сида даёт «Смонтировано 0» в месяце, квартале и году сразу.
  const outsidePeriod = (object) => !roomInWindow(object, window.from, window.to);
  drops.period = companyRooms.filter(outsidePeriod).length;
  const inPeriod = companyRooms.filter((object) => !outsidePeriod(object));
  const mountedOutside = companyRooms.filter((object) => outsidePeriod(object) && isMounted(object));
  let attributable = inPeriod;
  if (!inPeriod.some(isMounted) && mountedOutside.length) {
    attributable = [...inPeriod, ...mountedOutside];
    drops.boardInsteadOfEmptyPeriod = mountedOutside.length;
  } else if (!attributable.length && companyRooms.length) {
    const onBoard = companyRooms.filter((object) => boardIds.has(object.id));
    drops.boardInsteadOfEmptyPeriod = onBoard.length;
    attributable = onBoard;
  }
  const windowRooms = companyRooms.filter((object) => boardIds.has(object.id));
  for (const object of attributable) {
    const assignee = assigneeById.get(object.id);
    const row = assignee ? rowForAssignee(assignee) : null;
    if (!row) {
      drops.assignee += 1;
      continue;
    }
    if (row.role === 'measurer' && roomHasMeasurement(object)) row.measuredRooms += 1;
    if (row.role === 'crew' && isMounted(object)) {
      drops.mounted += 1;
      row.mountedRooms += 1;
      row.mountedAreaM2 += roomArea(object);
      row.mountedPanels += roomPanels(object);
    } else if (row.role === 'crew') drops.notMounted += 1;
  }
  const cards = buildProjectCards(
    (input.projects || []).filter((project) => project && (!orgId || !project.orgId || project.orgId === orgId)),
    windowRooms,
  ).filter((card) => card.rooms?.length);
  drops.cards = cards.length;
  for (const user of salesInOrg) {
    const row = rows.get(user.id);
    if (row && cards.length) row.boardCards = cards;
  }

  let working = [...rows.values()];
  const allZero =
    working.length > 0 &&
    working.every(
      (row) =>
        row.problemomer +
          row.calculator +
          row.pdf +
          row.areaM2 +
          row.panels +
          row.completed +
          row.mountedRooms +
          row.measuredRooms ===
        0,
    );
  const computedPanels = Math.round(
    tileEvents.reduce((sum, event) => sum + (event.action === 'result' || event.action === 'calc_done' ? num(event.object?.panels) : 0), 0),
  );
  const computedArea = round1(
    tileEvents.reduce((sum, event) => sum + (event.action === 'result' || event.action === 'calc_done' ? num(event.object?.areaM2) : 0), 0),
  );
  const tilePanels = Number.isFinite(Number(input.kpi?.panels)) ? Math.round(Number(input.kpi.panels)) : computedPanels;
  const tileArea = Number.isFinite(Number(input.kpi?.areaM2)) ? round1(Number(input.kpi.areaM2)) : computedArea;
  const tileHasWork = tilePanels > 0 || tileArea > 0 || tileEvents.some((event) => event.action === 'pdf' || event.action === 'result' || event.action === 'calc_done');
  const demoFilled = Boolean(allZero && input.demoFill && !tileHasWork);
  if (demoFilled) working = applyDemoFill(working, window.period);
  else reconcileTotals(working);

  const rankedPanels = Math.round(working.reduce((sum, row) => sum + row.panels, 0));
  const rankedArea = round1(working.reduce((sum, row) => sum + row.areaM2, 0));
  if (companyScope && (tilePanels > rankedPanels || tileArea > rankedArea)) {
    const gap = unassignedRow();
    if (!working.includes(gap)) working.push(gap);
    if (tilePanels > rankedPanels) gap.panels += tilePanels - rankedPanels;
    if (tileArea > rankedArea) gap.areaM2 += tileArea - rankedArea;
  }
  drops.tilePanels = tilePanels;
  drops.tileArea = tileArea;
  drops.events = tileEvents.length;

  function projectsOnBoard(row) {
    if (row.boardCards?.length) return projectsFromCards(row.boardCards);
    return collectProjects(
      row.userId,
      companyRooms,
      input.projects,
      orgId,
      window.from,
      window.to,
      true,
      (object) => assigneeById.get(object.id),
    );
  }

  /** Тот же список, что рисуется в «Топ проектов»: комнаты компании и события этой строки. */
  function shownProjects(row) {
    if (!row) return [];
    if (Array.isArray(row.projectList)) return row.projectList.slice();
    const fromEvents = projectsFromEvents(
      row.userId,
      row.seenEvents || [],
      input.projects,
      orgId,
      null,
      null,
      () => true,
      companyRooms,
    );
    const fromBoard = projectsOnBoard(row);
    let projects = listedProjects(fromBoard, fromEvents);
    if (!projects.length) projects = mergeProjectLists(fromBoard, fromEvents);
    projects = projects.map((project) => realRoom(project, companyRooms, orgId));
    if (!projects.length && (row.areaM2 > 0 || row.panels > 0)) {
      const room = companyRooms
        .filter((item) => item && item.id)
        .slice()
        .sort((a, b) => num(b.room?.areaM2) - num(a.room?.areaM2) || String(a.id).localeCompare(String(b.id)))[0];
      if (room) {
        projects = [
          {
            id: String(room.projectId || room.id),
            name: room.clientName || room.roomName || room.address || 'Комната',
            areaM2: round1(row.areaM2),
            panels: Math.round(row.panels),
            rooms: 1,
            roomId: room.id,
          },
        ];
      }
    }
    if (!projects.length && demoFilled) projects = demoProjects(row.userId);
    return namedProjects(projects, input.projects, companyRooms);
  }

  for (const row of working) {
    if (row.role !== 'measurer') continue;
    const measured = companyRooms.filter(
      (object) => roomHasMeasurement(object) && assigneeById.get(object.id) === row.userId,
    ).length;
    if (measured > 0) row.measuredRooms = measured;
    else if (row.measuredRooms <= 0 && (row.areaM2 > 0 || row.completed > 0 || row.problemomer + row.calculator > 0)) {
      const roomsTouched = new Set();
      for (const event of row.seenEvents || []) {
        if (!completed(event)) continue;
        const linked = linkWork(event, input.projects, companyRooms);
        roomsTouched.add(String(linked?.roomId || linked?.projectId || event.id));
      }
      row.measuredRooms = Math.max(1, roomsTouched.size);
    }
  }
  for (const row of working) {
    if (row.role !== 'sales') continue;
    const list = shownProjects(row);
    row.projectList = list;
    row.projectTotal = list.length;
  }

  const byRole = new Map(RANK_ROLES.map((role) => [role, []]));
  for (const row of working) {
    const list = byRole.get(row.role);
    if (list) list.push(row);
  }
  const order = [...preferredRoles(metric)];
  for (const role of RANK_ROLES) {
    if (!order.includes(role) && roleHasMetric(byRole.get(role) || [], metric)) order.push(role);
  }
  const roles = order
    .filter((role) => roleHasMetric(byRole.get(role) || [], metric))
    .map((role) => ({
      id: role,
      label: ROLE_LABELS[role],
      ranking: (byRole.get(role) || [])
        .map((row) => publicRow(row, metric))
        .sort((a, b) => b.value - a.value || String(a.displayName).localeCompare(String(b.displayName), 'ru')),
    }));
  const unassigned = working.find((row) => row.userId === 'unassigned');
  if (
    unassigned &&
    (unassigned.panels > 0 ||
      unassigned.areaM2 > 0 ||
      unassigned.problemomer + unassigned.calculator + unassigned.pdf > 0 ||
      unassigned.workKeys?.size)
  ) {
    roles.push({
      id: 'unassigned',
      label: 'Без исполнителя',
      ranking: [publicRow(unassigned, metric)],
    });
  }
  const ranking = roles.flatMap((role) => role.ranking);

  let detail = null;
  if (input.userId && (input.userId === 'unassigned' || allowed.has(input.userId))) {
    const person = working.find((row) => row.userId === input.userId);
    const keys = monthKeys(window.from, window.to, input.events);
    let months;
    if (!person) {
      months = keys.map((key) => emptyBucket(key));
    } else if (demoFilled) {
      months = demoMonths(keys, person);
    } else {
      const buckets = new Map(keys.map((key) => [key, emptyBucket(key)]));
      for (const event of input.events || []) {
        if (input.userId === 'unassigned' ? !person?.seenEvents?.includes(event) : !eventMatchesUser(event, input.userId)) continue;
        if (String(event.role || '') === 'admin') continue;
        if (orgId && event.orgId !== orgId) continue;
        if (!inWindow(event.at, window.from, window.to)) continue;
        const bucket = buckets.get(String(event.at).slice(0, 7));
        if (!bucket) continue;
        if (event.tool === 'problemomer' && event.action === 'result') bucket.problemomer += 1;
        if (event.tool === 'calculator' && event.action === 'calc_done') bucket.calculator += 1;
        if (event.action === 'pdf') bucket.pdf += 1;
        if (!completed(event)) continue;
        bucket.completed += 1;
        const area = eventArea(event);
        const panels = eventPanels(event);
        if (area > 0) bucket.areaM2 += area;
        if (panels > 0) bucket.panels += panels;
      }
      months = [...buckets.values()].map((bucket) => ({
        ...bucket,
        areaM2: round1(bucket.areaM2),
        panels: Math.round(bucket.panels),
      }));
    }
    const monthCount = Math.max(1, months.length);
    const averages = person
      ? {
          problemomer: round1(person.problemomer / monthCount),
          calculator: round1(person.calculator / monthCount),
          pdf: round1(person.pdf / monthCount),
          areaM2: round1(person.areaM2 / monthCount),
          panels: round1(person.panels / monthCount),
          completed: round1(person.completed / monthCount),
        }
      : {
          problemomer: 0,
          calculator: 0,
          pdf: 0,
          areaM2: 0,
          panels: 0,
          completed: 0,
        };
    const projects = person ? shownProjects(person) : [];
    detail = { userId: input.userId, months, averages, projects };
    for (const row of ranking) {
      if (row.userId === input.userId) row.projectCount = projects.length;
    }
  }

  return {
    metric,
    period: window.period,
    from: window.from,
    to: window.to,
    scope: input.viewer?.role === 'sales' ? 'team' : 'company',
    demoFilled,
    roles,
    ranking,
    detail,
    drops,
  };
}
