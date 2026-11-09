/**
 * Личная аналитика сотрудника: топ проектов и ряды по месяцам.
 * Права не расширяет — на вход уже только комнаты/проекты, которые можно показать.
 */

import { isRefused } from './refusal.js';

const STATUS_RANK = {
  draft: 0,
  measured: 1,
  quote_sent: 2,
  install: 3,
  closed: 4,
};

const PROJECT_STAGE = {
  new: 'Новый',
  measure: 'Замер',
  proposal: 'Предложение',
  install: 'Монтаж',
  done: 'Завершён',
};

function inRange(iso, from, to) {
  const at = String(iso || '');
  if (!at) return !from && !to;
  if (from && at < from) return false;
  if (to && at > to) return false;
  return true;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function areaOf(room) {
  const nested = room && room.room && typeof room.room === 'object' ? num(room.room.areaM2) : 0;
  if (nested > 0) return nested;
  return num(room && room.areaM2);
}

function roomMine(room, userId) {
  if (!userId) return false;
  const uid = String(userId);
  return String(room.createdBy || '') === uid || String(room.assignedTo || '') === uid;
}

function roomActivityAt(room) {
  return String(
    (room && room.quoteSentAt) ||
      (room && room.refusal && room.refusal.at) ||
      (room && room.updatedAt) ||
      (room && room.createdAt) ||
      '',
  );
}

function quoteSumOf(room) {
  const est = room && room.estimate && typeof room.estimate === 'object' ? room.estimate : null;
  if (!est) return 0;
  if (est.totalCost != null) return num(est.totalCost);
  return num(est.panelsCost) + num(est.installCost) + num(est.dowelsCost);
}

function projectStageLabel(project) {
  if (!project) return 'Без проекта';
  if (project.refusal && project.refusal.reasonKey) return 'Отказ';
  const status = String(project.status || 'new');
  return PROJECT_STAGE[status] || PROJECT_STATUS_FALLBACK(status);
}

function PROJECT_STATUS_FALLBACK(status) {
  if (status === 'done') return 'Завершён';
  return status || 'Проект';
}

function monthKey(iso) {
  const match = /^(\d{4}-\d{2})/.exec(String(iso || ''));
  return match ? match[1] : '';
}

export function monthLabelRu(key) {
  const [y, m] = String(key || '').split('-');
  if (!y || !m) return String(key || '');
  const names = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const idx = Number(m) - 1;
  return `${names[idx] || m} ${y}`;
}

/**
 * Топ проектов сотрудника за период.
 * Ранг: сумма смет/КП по комнатам, иначе число комнат, иначе площадь.
 * @returns {Array<{ id: string, name: string, clientName: string, stage: string, quoteSum: number, rooms: number, area: number, rankBy: 'quote'|'rooms'|'area' }>}
 */
export function buildStaffTopProjects({
  rooms = [],
  projects = [],
  userId = null,
  from = null,
  to = null,
  limit = 7,
} = {}) {
  const projectById = new Map();
  for (const p of Array.isArray(projects) ? projects : []) {
    if (p && p.id) projectById.set(String(p.id), p);
  }

  const byProject = new Map();
  for (const room of Array.isArray(rooms) ? rooms : []) {
    if (!room || !roomMine(room, userId)) continue;
    const at = roomActivityAt(room);
    if (!inRange(at || room.createdAt, from, to) && !inRange(room.createdAt, from, to)) continue;

    const id = String(room.projectId || `room:${room.id}`);
    const project = projectById.get(String(room.projectId || '')) || null;
    const row =
      byProject.get(id) ||
      {
        id,
        name: (project && (project.name || project.clientName)) || room.roomName || room.clientName || 'Проект',
        clientName: (project && project.clientName) || room.clientName || '',
        stage: projectStageLabel(project),
        quoteSum: 0,
        rooms: 0,
        area: 0,
      };
    row.rooms += 1;
    row.area += areaOf(room);
    // Сумма КП/сметы: берём оценку комнаты, если она дошла хотя бы до «КП отправлено» или есть смета.
    const rank = STATUS_RANK[String(room.status || '')] ?? -1;
    if (rank >= STATUS_RANK.quote_sent || quoteSumOf(room) > 0) {
      row.quoteSum += quoteSumOf(room);
    }
    if (project) {
      row.name = project.name || row.name;
      row.clientName = project.clientName || row.clientName;
      row.stage = projectStageLabel(project);
    }
    byProject.set(id, row);
  }

  const list = [...byProject.values()];
  const anyQuote = list.some((r) => r.quoteSum > 0);
  const anyRooms = list.some((r) => r.rooms > 0);
  const rankBy = anyQuote ? 'quote' : anyRooms ? 'rooms' : 'area';

  list.sort((a, b) => {
    if (rankBy === 'quote') {
      if (b.quoteSum !== a.quoteSum) return b.quoteSum - a.quoteSum;
    }
    if (b.rooms !== a.rooms) return b.rooms - a.rooms;
    if (b.area !== a.area) return b.area - a.area;
    return String(a.name).localeCompare(String(b.name), 'ru');
  });

  return list.slice(0, Math.max(0, Number(limit) || 7)).map((r) => ({ ...r, rankBy, quoteSum: Math.round(r.quoteSum), area: Math.round(r.area * 10) / 10 }));
}

/**
 * Помесячные показатели сотрудника для линейного графика.
 * @returns {Array<{ key: string, label: string, quotes: number, measures: number, installs: number, sum: number, created: number, closed: number, refused: number, area: number }>}
 */
export function buildStaffMonthlySeries({ rooms = [], userId = null, from = null, to = null } = {}) {
  const map = new Map();

  function row(key) {
    const cur = map.get(key) || {
      key,
      label: monthLabelRu(key),
      quotes: 0,
      measures: 0,
      installs: 0,
      sum: 0,
      created: 0,
      closed: 0,
      refused: 0,
      area: 0,
    };
    map.set(key, cur);
    return cur;
  }

  for (const room of Array.isArray(rooms) ? rooms : []) {
    if (!room || !roomMine(room, userId)) continue;

    const createdAt = String(room.createdAt || '');
    const created = monthKey(createdAt);
    if (created && inRange(createdAt, from, to)) {
      row(created).created += 1;
    }

    const measuredAt = String(room.measuredAt || room.updatedAt || '');
    const rank = STATUS_RANK[String(room.status || '')] ?? -1;
    if (rank >= STATUS_RANK.measured) {
      const key = monthKey(measuredAt) || created;
      if (key && inRange(measuredAt || createdAt, from, to)) row(key).measures += 1;
    }

    const quoteAt = String(room.quoteSentAt || '');
    if (rank >= STATUS_RANK.quote_sent) {
      const key = monthKey(quoteAt || measuredAt || createdAt);
      if (key && inRange(quoteAt || measuredAt || createdAt, from, to)) {
        const r = row(key);
        r.quotes += 1;
        r.sum += quoteSumOf(room);
      }
    }

    if (rank >= STATUS_RANK.install) {
      const installAt = String(room.updatedAt || '');
      const key = monthKey(installAt || quoteAt || createdAt);
      if (key && inRange(installAt || createdAt, from, to)) row(key).installs += 1;
    }

    if (room.status === 'closed') {
      const closedAt = String((room.refusal && room.refusal.at) || room.updatedAt || '');
      const key = monthKey(closedAt);
      if (key && inRange(closedAt, from, to)) {
        const r = row(key);
        r.closed += 1;
        if (isRefused(room)) r.refused += 1;
        else r.area += areaOf(room);
        if (!quoteAt) r.sum += quoteSumOf(room);
      }
    }
  }

  return [...map.values()]
    .map((r) => ({ ...r, sum: Math.round(r.sum), area: Math.round(r.area * 10) / 10 }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
}
