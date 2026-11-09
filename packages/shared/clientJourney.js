/**
 * Воронка «Путь клиента».
 *
 * Модель (см. docs/handover/FUNNEL_CONCEPT.md):
 * - шапка этапа = сколько дошло до входа в этап (первый шаг группы после монотонии);
 * - шаги внутри этапа монотонны: дошёл до N ⇒ засчитан на 1…N;
 * - проценты с потолком 100%, подписи «от предыдущего» / «от начала»;
 * - инструменты пока считаются уникальными проходами (sessionId), комнаты — комнатами.
 */

import { funnelPassKey } from './funnel.js';
import { isRefused, refusalStats } from './refusal.js';

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

/** Исторически неотслеживаемые шаги; сейчас пишутся событиями (см. AnalyticsAction). */
export const UNTRACKED_JOURNEY_IDS = new Set();

/** Сжатая воронка: 6 групп + отказ отдельно. */
export const JOURNEY_GROUPS = [
  { id: 'room', label: 'Комната', stepIds: ['created'], unit: 'rooms' },
  { id: 'problemomer', label: 'Проблемомер', stepIds: ['pm_open', 'survey_done', 'pm_result', 'panel_view'], unit: 'passes' },
  { id: 'calculator', label: 'Калькулятор', stepIds: ['calc_open', 'calc_input', 'calc_done', 'pdf', 'share'], unit: 'passes' },
  { id: 'offer', label: 'Предложение', stepIds: ['offer', 'client_agreed'], unit: 'passes' },
  { id: 'measure_quote', label: 'Замер и КП', stepIds: ['assign_measure', 'measured', 'quote', 'quote_accepted'], unit: 'rooms' },
  { id: 'install', label: 'Монтаж', stepIds: ['install_assigned', 'install_done', 'completed'], unit: 'rooms' },
];

/** Подпись процента с потолком 100%. */
export function pctCapped(part, whole) {
  if (part == null || whole == null) return 'нет данных';
  if (whole <= 0) return '—';
  const ratio = Math.min(1, Math.max(0, Number(part) / Number(whole)));
  return `${Math.round(ratio * 100)}%`;
}

/**
 * Монотонность назад: более ранний шаг не меньше более позднего.
 * null не трогаем (нет данных).
 * @param {Array<number|null>} counts
 * @returns {Array<number|null>}
 */
export function makeMonotonicCounts(counts) {
  const out = counts.map((v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : v));
  for (let i = out.length - 2; i >= 0; i -= 1) {
    const curr = out[i];
    const next = out[i + 1];
    if (typeof curr === 'number' && typeof next === 'number' && curr < next) out[i] = next;
  }
  return out;
}

/**
 * Уникальные проходы, дошедшие до каждого этапа инструмента.
 * Дошёл до N ⇒ +1 на всех шагах 0…N. 8 событий одной сессии на одном шаге = 1.
 */
export function countReachedPasses(events, tool, stages, { userId = null, from = null, to = null } = {}) {
  const reached = new Map();
  for (const raw of Array.isArray(events) ? events : []) {
    if (!raw || typeof raw !== 'object') continue;
    if (tool && raw.tool !== tool) continue;
    if (!inRange(raw.at, from, to)) continue;
    if (userId && String(raw.userId || '') !== String(userId) && String(raw.login || '') !== String(userId)) {
      continue;
    }
    const action = typeof raw.action === 'string' ? raw.action.trim() : '';
    const stage = stages.indexOf(action);
    if (stage < 0) continue;
    const key = funnelPassKey(raw, tool || String(raw.tool || 'x'));
    const prev = reached.get(key) ?? -1;
    if (stage > prev) reached.set(key, stage);
  }
  const counts = stages.map(() => 0);
  for (const maxStage of reached.values()) {
    for (let i = 0; i <= maxStage; i += 1) counts[i] += 1;
  }
  return counts;
}

/**
 * @param {Array<{ id: string, label: string, count: number|null, fromPrevPct: string, fromStartPct?: string }>} steps
 * @returns {{ groups: Array<object>, refusal: object|null }}
 */
export function groupJourneySteps(steps) {
  const byId = new Map((steps || []).map((s) => [s.id, s]));
  const groups = JOURNEY_GROUPS.map((g) => {
    const rawItems = g.stepIds.map((id) => byId.get(id)).filter(Boolean);
    const mono = makeMonotonicCounts(rawItems.map((s) => s.count));
    const items = rawItems.map((step, index) => {
      const count = mono[index];
      const entry = mono[0];
      return {
        ...step,
        count,
        // % шага — от входа в этап (потолок 100%), не от «кривого» предыдущего.
        fromPrevPct: pctCapped(count, entry),
        fromStartPct: step.fromStartPct,
      };
    });
    const first = items[0] || null;
    const last = items[items.length - 1] || null;
    return {
      id: g.id,
      label: g.label,
      stepIds: g.stepIds,
      unit: g.unit,
      steps: items,
      // Шапка = вход в этап (первый шаг), а не финальный «Поделился».
      count: first ? first.count : null,
      finalStepId: last ? last.id : null,
      entryStepId: first ? first.id : null,
    };
  });

  let baseCount = null;
  let prevCount = null;
  for (const g of groups) {
    if (g.count == null) {
      g.fromPrevPct = 'нет данных';
      g.fromStartPct = 'нет данных';
      continue;
    }
    if (baseCount == null && g.count > 0) baseCount = g.count;
    if (prevCount == null) {
      g.fromPrevPct = g.count > 0 ? '100%' : '—';
    } else {
      g.fromPrevPct = pctCapped(g.count, prevCount);
    }
    g.fromStartPct = baseCount == null ? (g.count > 0 ? '100%' : '—') : pctCapped(g.count, baseCount);
    prevCount = g.count;
  }
  const refusal = byId.get('refusal') || null;
  return { groups, refusal };
}

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

function uniquePasses(events, tool, action, { userId = null, from = null, to = null } = {}) {
  const keys = new Set();
  for (const raw of Array.isArray(events) ? events : []) {
    if (!raw || typeof raw !== 'object') continue;
    if (tool && raw.tool !== tool) continue;
    if (action && raw.action !== action) continue;
    if (!inRange(raw.at, from, to)) continue;
    if (userId && String(raw.userId || '') !== String(userId) && String(raw.login || '') !== String(userId)) continue;
    keys.add(funnelPassKey(raw, tool || String(raw.tool || 'x')));
  }
  return keys.size;
}

/** «Поделился» — любое share (исторически писалось с problemomer). */
function uniqueSharePasses(events, { userId = null, from = null, to = null } = {}) {
  const keys = new Set();
  for (const raw of Array.isArray(events) ? events : []) {
    if (!raw || typeof raw !== 'object') continue;
    if (raw.action !== 'share') continue;
    if (!inRange(raw.at, from, to)) continue;
    if (userId && String(raw.userId || '') !== String(userId) && String(raw.login || '') !== String(userId)) continue;
    keys.add(funnelPassKey(raw, String(raw.tool || 'x')));
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

/**
 * @param {{ rooms?: Array<object>|null, events?: Array<object>|null, users?: Array<object>|null, from?: string|null, to?: string|null, userId?: string|null }} [opts]
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
  const eventList = Array.isArray(events) ? events : [];
  const created = roomsCreated(list, { from, to, userId });
  const closedRooms = closedInPeriod(list, { from, to, userId });
  const refused = closedRooms.filter((room) => isRefused(room)).length;
  const completed = closedRooms.length - refused;
  const filter = { userId, from, to };

  // Инструменты: монотонные уникальные проходы (8 событий одной сессии ≠ 8 проходов).
  const pm = countReachedPasses(eventList, 'problemomer', ['open', 'survey_done', 'result', 'panel_view'], filter);
  const calc = countReachedPasses(eventList, 'calculator', ['open', 'calc_input', 'calc_done', 'pdf'], filter);
  const shareRaw = uniqueSharePasses(eventList, filter);
  // Share не обнуляет шапку: вписываем в хвост калькулятора и монотонизируем.
  const calcWithShare = makeMonotonicCounts([calc[0], calc[1], calc[2], calc[3], shareRaw]);

  const counts = {
    created: created.length,
    pm_open: pm[0],
    survey_done: pm[1],
    pm_result: pm[2],
    panel_view: pm[3],
    calc_open: calcWithShare[0],
    calc_input: calcWithShare[1],
    calc_done: calcWithShare[2],
    pdf: calcWithShare[3],
    share: calcWithShare[4],
    offer: uniquePasses(eventList, 'cabinet', 'offer', filter),
    client_agreed: uniquePasses(eventList, 'cabinet', 'client_agreed', filter),
    assign_measure: assignMeasureCount(list, users, { from, to, userId }),
    measured: roomsReached(list, 'measured', { from, to, userId }),
    quote: roomsReached(list, 'quote_sent', { from, to, userId }),
    quote_accepted: uniquePasses(eventList, 'cabinet', 'quote_accepted', filter),
    install_assigned: roomsReached(list, 'install', { from, to, userId }),
    install_done: uniquePasses(eventList, 'cabinet', 'install_done', filter),
    completed,
    refusal: refused,
  };

  // Монотонность внутри групп «Предложение / Замер / Монтаж» (комнаты и смешанные сигналы).
  for (const g of JOURNEY_GROUPS) {
    if (g.id === 'problemomer' || g.id === 'calculator' || g.id === 'room') continue;
    const mono = makeMonotonicCounts(g.stepIds.map((id) => counts[id]));
    g.stepIds.forEach((id, i) => {
      counts[id] = mono[i];
    });
  }

  const base = counts.created > 0 ? counts.created : null;
  let prev = null;
  const steps = CLIENT_JOURNEY_STEPS.map((step, index) => {
    const count = Object.prototype.hasOwnProperty.call(counts, step.id) ? counts[step.id] : null;
    let fromPrevPct = 'нет данных';
    let fromStartPct = 'нет данных';
    if (step.id === 'refusal') {
      fromPrevPct = closedRooms.length ? pctCapped(refused, closedRooms.length) : '—';
      fromStartPct = fromPrevPct;
    } else if (index === 0) {
      fromPrevPct = count != null && count > 0 ? '100%' : count === 0 ? '—' : 'нет данных';
      fromStartPct = fromPrevPct;
      prev = count;
    } else {
      fromPrevPct = pctCapped(count, prev);
      fromStartPct = base != null ? pctCapped(count, base) : count != null && count > 0 ? '100%' : '—';
      if (count != null) prev = count;
    }
    return { id: step.id, label: step.label, count, fromPrevPct, fromStartPct };
  });

  const reasons = refusalStats(
    list.filter((room) => roomMine(room, userId)),
    { from, to },
  ).byReason;

  return {
    steps,
    total: created.length,
    closed: closedRooms.length,
    refusalReasons: reasons,
  };
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
  const calc = countReachedPasses(events, 'calculator', ['open', 'pdf'], { userId });
  const pmOpen = countReachedPasses(events, 'problemomer', ['open'], { userId })[0] || 0;
  const steps = [
    { id: 'assigned', label: 'Назначен на замер', count: assigned, fromPrevPct: assigned > 0 ? '100%' : '—' },
    { id: 'measured', label: 'Замер выполнен', count: measured, fromPrevPct: pctCapped(measured, assigned) },
    { id: 'calc_open', label: 'Открыл калькулятор', count: calc[0], fromPrevPct: pctCapped(calc[0], measured) },
    { id: 'schema', label: 'Схема раскладки', count: null, fromPrevPct: 'нет данных' },
    { id: 'calc_pdf', label: 'PDF раскладки', count: calc[1], fromPrevPct: pctCapped(calc[1], calc[0]) },
    { id: 'photos', label: 'Фото комнаты', count: null, fromPrevPct: 'нет данных' },
    { id: 'pm', label: 'Консультация Проблемомером', count: pmOpen, fromPrevPct: pctCapped(pmOpen, measured) },
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
    { id: 'started', label: 'Монтаж начат', count: started, fromPrevPct: pctCapped(started, assigned) },
    { id: 'photo_report', label: 'Фотоотчёт', count: null, fromPrevPct: 'нет данных' },
    { id: 'done', label: 'Выполнено', count: done, fromPrevPct: pctCapped(done, started) },
  ];
  return { steps };
}
