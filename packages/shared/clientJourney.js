/**
 * Воронка пути клиента: 20 шагов по комнатам и событиям аналитики.
 * Шаги 1–19: процент от предыдущего шага + абсолютное число.
 * Шаг 20 «Отказ»: процент от всех закрытых комнат за период.
 * Неотслеживаемые шаги: count = null, в интерфейсе «нет данных».
 */

import { funnelPassKey } from './funnel.js';
import { isRefused } from './refusal.js';

export const CLIENT_JOURNEY_STEPS = [
  { id: 'created', label: 'Добавил комнату' },
  { id: 'pm_open', label: 'Открыл Проблемомер' },
  { id: 'survey_done', label: 'Прошёл опрос' },
  { id: 'pm_result', label: 'Услышал результат' },
  { id: 'panel_view', label: 'Посмотрел панель' },
  { id: 'calc_open', label: 'Открыл калькулятор' },
  { id: 'calc_input', label: 'Ввёл параметры' },
  { id: 'calc_done', label: 'Получил расчёт' },
  { id: 'pdf', label: 'Скачал PDF' },
  { id: 'share', label: 'Поделился' },
  { id: 'offer', label: 'Предложил звукоизоляцию' },
  { id: 'client_agreed', label: 'Клиент согласился' },
  { id: 'assign_measure', label: 'Назначил замер' },
  { id: 'measured', label: 'Замер проведён' },
  { id: 'quote', label: 'Отправил КП' },
  { id: 'quote_accepted', label: 'Клиент принял' },
  { id: 'install_assigned', label: 'Монтаж назначен' },
  { id: 'install_done', label: 'Монтаж выполнен' },
  { id: 'completed', label: 'Завершено' },
  { id: 'refusal', label: 'Отказ' },
];

/** Шаги без надёжного события в системе — не выдумываем числа. */
export const UNTRACKED_JOURNEY_IDS = new Set([
  'survey_done',
  'panel_view',
  'calc_input',
  'offer',
  'client_agreed',
  'quote_accepted',
  'install_done',
]);

const STATUS_RANK = {
  draft: 0,
  measured: 1,
  quote_sent: 2,
  install: 3,
  closed: 4,
};

function inRange(iso, from, to) {
  const at = String(iso || '');
  if (!at) return !from && !to;
  if (from && at < from) return false;
  if (to && at > to) return false;
  return true;
}

function roomMine(room, userId) {
  if (!userId) return true;
  const uid = String(userId);
  return String(room.createdBy || '') === uid || String(room.assignedTo || '') === uid;
}

function uniquePasses(events, tool, action, { userId = null } = {}) {
  const keys = new Set();
  for (const raw of Array.isArray(events) ? events : []) {
    if (!raw || typeof raw !== 'object') continue;
    if (tool && raw.tool !== tool) continue;
    if (action && raw.action !== action) continue;
    if (userId && String(raw.userId || '') !== String(userId) && String(raw.login || '') !== String(userId)) continue;
    keys.add(funnelPassKey(raw, tool || String(raw.tool || 'x')));
  }
  return keys.size;
}

function uniquePdfPasses(events, { userId = null } = {}) {
  const keys = new Set();
  for (const raw of Array.isArray(events) ? events : []) {
    if (!raw || typeof raw !== 'object') continue;
    if (raw.action !== 'pdf') continue;
    if (raw.tool !== 'problemomer' && raw.tool !== 'calculator') continue;
    if (userId && String(raw.userId || '') !== String(userId) && String(raw.login || '') !== String(userId)) continue;
    keys.add(funnelPassKey(raw, String(raw.tool)));
  }
  return keys.size;
}

function staffById(users) {
  const map = new Map();
  for (const user of Array.isArray(users) ? users : []) {
    if (user && user.id) map.set(String(user.id), user);
  }
  return map;
}

/** Назначения на замерщика по истории комнаты. null — сотрудников нет, считать нельзя. */
function assignMeasureCount(rooms, users, { from, to, userId }) {
  const staff = staffById(users);
  if (!staff.size) return null;
  let count = 0;
  let sawAssign = false;
  for (const room of rooms) {
    if (!roomMine(room, userId)) continue;
    const history = Array.isArray(room.history) ? room.history : [];
    for (const entry of history) {
      if (!entry || entry.action !== 'assign') continue;
      sawAssign = true;
      if (!inRange(entry.at, from, to)) continue;
      const toUser = staff.get(String(entry.toUserId || entry.userId || ''));
      const role = toUser && String(toUser.role || '');
      if (role === 'measurer' || role === 'executor') count += 1;
    }
  }
  // Если в истории вообще не было assign — данных нет (не ноль).
  if (!sawAssign) return null;
  return count;
}

function roomsCreated(rooms, { from, to, userId }) {
  return rooms.filter((room) => roomMine(room, userId) && inRange(room.createdAt || room.updatedAt, from, to));
}

function roomsReached(rooms, minStatus, { from, to, userId }) {
  const min = STATUS_RANK[minStatus] ?? 99;
  return rooms.filter((room) => {
    if (!roomMine(room, userId)) return false;
    if (!inRange(room.createdAt || room.updatedAt, from, to)) return false;
    return (STATUS_RANK[String(room.status || '')] ?? -1) >= min;
  }).length;
}

function closedInPeriod(rooms, { from, to, userId }) {
  return rooms.filter((room) => {
    if (!roomMine(room, userId)) return false;
    if (room.status !== 'closed') return false;
    const at = String((room.refusal && room.refusal.at) || room.updatedAt || '');
    return inRange(at, from, to);
  });
}

function pctOfPrev(count, prevCount) {
  if (count == null || prevCount == null) return 'нет данных';
  if (prevCount <= 0) return '—';
  return `${Math.round((count / prevCount) * 100)}%`;
}

/**
 * @param {{ rooms?: Array<object>|null, events?: Array<object>|null, users?: Array<object>|null, from?: string|null, to?: string|null, userId?: string|null }} [opts]
 * @returns {{ steps: Array<{ id: string, label: string, count: number|null, fromPrevPct: string }>, total: number, closed: number }}
 */
export function computeClientJourney({
  rooms = [],
  events = [],
  users = [],
  from = null,
  to = null,
  userId = null,
} = {}) {
  const list = Array.isArray(rooms) ? rooms : [];
  const created = roomsCreated(list, { from, to, userId });
  const closedRooms = closedInPeriod(list, { from, to, userId });
  const refused = closedRooms.filter((room) => isRefused(room)).length;
  const completed = closedRooms.length - refused;

  const counts = {
    created: created.length,
    pm_open: uniquePasses(events, 'problemomer', 'open', { userId }),
    survey_done: null,
    pm_result: uniquePasses(events, 'problemomer', 'result', { userId }),
    panel_view: null,
    calc_open: uniquePasses(events, 'calculator', 'open', { userId }),
    calc_input: null,
    calc_done: uniquePasses(events, 'calculator', 'calc_done', { userId }),
    pdf: uniquePdfPasses(events, { userId }),
    share: uniquePasses(events, 'problemomer', 'share', { userId }),
    offer: null,
    client_agreed: null,
    assign_measure: assignMeasureCount(list, users, { from, to, userId }),
    measured: roomsReached(list, 'measured', { from, to, userId }),
    quote: roomsReached(list, 'quote_sent', { from, to, userId }),
    quote_accepted: null,
    install_assigned: roomsReached(list, 'install', { from, to, userId }),
    install_done: null,
    completed,
    refusal: refused,
  };

  const steps = CLIENT_JOURNEY_STEPS.map((step, index) => {
    const count = Object.prototype.hasOwnProperty.call(counts, step.id) ? counts[step.id] : null;
    let fromPrevPct = 'нет данных';
    if (step.id === 'refusal') {
      fromPrevPct = closedRooms.length
        ? `${Math.round((refused / closedRooms.length) * 100)}%`
        : '—';
    } else if (index === 0) {
      fromPrevPct = count != null && count > 0 ? '100%' : count === 0 ? '—' : 'нет данных';
    } else {
      const prevId = CLIENT_JOURNEY_STEPS[index - 1].id;
      const prevCount = counts[prevId];
      fromPrevPct = pctOfPrev(count, prevCount);
    }
    return { id: step.id, label: step.label, count, fromPrevPct };
  });

  return { steps, total: created.length, closed: closedRooms.length };
}

/** Воронка замерщика — только из реальных сигналов. */
export function computeMeasurerJourney({ rooms = [], events = [], userId = null, from = null, to = null } = {}) {
  const mine = (Array.isArray(rooms) ? rooms : []).filter(
    (room) => String(room.assignedTo || '') === String(userId || '') || String(room.createdBy || '') === String(userId || ''),
  );
  const assigned = mine.filter((room) => inRange(room.updatedAt || room.createdAt, from, to)).length;
  const measured = mine.filter(
    (room) =>
      inRange(room.updatedAt || room.createdAt, from, to) &&
      (STATUS_RANK[String(room.status || '')] ?? -1) >= STATUS_RANK.measured,
  ).length;
  const calcOpen = uniquePasses(events, 'calculator', 'open', { userId });
  const calcPdf = uniquePasses(events, 'calculator', 'pdf', { userId });
  const pmOpen = uniquePasses(events, 'problemomer', 'open', { userId });
  const steps = [
    { id: 'assigned', label: 'Назначен на замер', count: assigned, fromPrevPct: assigned > 0 ? '100%' : '—' },
    { id: 'measured', label: 'Замер выполнен', count: measured, fromPrevPct: pctOfPrev(measured, assigned) },
    { id: 'calc_open', label: 'Открыл калькулятор', count: calcOpen, fromPrevPct: pctOfPrev(calcOpen, measured) },
    { id: 'schema', label: 'Схема раскладки', count: null, fromPrevPct: 'нет данных' },
    { id: 'calc_pdf', label: 'PDF раскладки', count: calcPdf, fromPrevPct: pctOfPrev(calcPdf, calcOpen) },
    { id: 'photos', label: 'Фото комнаты', count: null, fromPrevPct: 'нет данных' },
    { id: 'pm', label: 'Консультация Проблемомером', count: pmOpen, fromPrevPct: pctOfPrev(pmOpen, measured) },
  ];
  return { steps };
}

/** Воронка монтажника — только из реальных сигналов. */
export function computeCrewJourney({ rooms = [], userId = null, from = null, to = null } = {}) {
  const mine = (Array.isArray(rooms) ? rooms : []).filter(
    (room) => String(room.assignedTo || '') === String(userId || ''),
  );
  const assigned = mine.filter(
    (room) =>
      inRange(room.updatedAt || room.createdAt, from, to) &&
      (room.status === 'install' || room.status === 'closed' || room.status === 'measured'),
  ).length;
  const started = mine.filter(
    (room) => inRange(room.updatedAt || room.createdAt, from, to) && (room.status === 'install' || room.status === 'closed'),
  ).length;
  const done = mine.filter(
    (room) =>
      room.status === 'closed' &&
      !isRefused(room) &&
      inRange(String((room.refusal && room.refusal.at) || room.updatedAt || ''), from, to),
  ).length;
  const steps = [
    { id: 'assigned', label: 'Назначен на монтаж', count: assigned, fromPrevPct: assigned > 0 ? '100%' : '—' },
    { id: 'started', label: 'Монтаж начат', count: started, fromPrevPct: pctOfPrev(started, assigned) },
    { id: 'photo_report', label: 'Фотоотчёт', count: null, fromPrevPct: 'нет данных' },
    { id: 'done', label: 'Выполнено', count: done, fromPrevPct: pctOfPrev(done, started) },
  ];
  return { steps };
}
