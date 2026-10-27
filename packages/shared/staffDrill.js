/**
 * Разрез аналитики: рейтинг сотрудников и карточка человека.
 * Node-сервер импортирует этот файл: Cloud Function не грузит TypeScript.
 */

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

const COMPANY_ROLES = new Set(['owner', 'sales', 'measurer', 'crew']);
const FIELD_ROLES = new Set(['measurer', 'crew']);

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
  const people = (users || []).filter(
    (user) =>
      user &&
      COMPANY_ROLES.has(user.role) &&
      user.role !== 'admin' &&
      (!focus || user.orgId === focus),
  );
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
  };
}

function addEvent(row, event) {
  if (event.tool === 'problemomer' && event.action === 'result') row.problemomer += 1;
  if (event.tool === 'calculator' && event.action === 'calc_done') row.calculator += 1;
  if (event.action === 'pdf') row.pdf += 1;
  if (!completed(event)) return;
  row.completed += 1;
  const area = num(event.object?.areaM2);
  const panels = num(event.object?.panels);
  if (area > 0) {
    row.areaM2 += area;
    row.withArea += 1;
  }
  if (panels > 0) row.panels += panels;
}

function metricValue(row, metric) {
  if (metric === 'problemomer') return row.problemomer;
  if (metric === 'calculator') return row.calculator;
  if (metric === 'pdf') return row.pdf;
  if (metric === 'area') return round1(row.areaM2);
  if (metric === 'panels') return Math.round(row.panels);
  if (metric === 'done') return row.completed;
  if (metric === 'avg') return row.withArea ? round1(row.areaM2 / row.withArea) : 0;
  return row.problemomer + row.calculator + row.pdf;
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

function collectProjects(userId, objects, projects, orgId, from, to, respectWindow) {
  const grouped = new Map();
  for (const object of objects || []) {
    if (!object || (orgId && object.orgId !== orgId)) continue;
    if (object.createdBy !== userId && object.assignedTo !== userId) continue;
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
        name: project?.name || object.roomName || object.clientName || 'Комната',
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
  return [...grouped.values()]
    .map((row) => ({
      id: row.id,
      name: row.name,
      areaM2: round1(row.areaM2),
      panels: Math.round(row.panels),
      rooms: row.rooms,
      roomId: row.roomId,
    }))
    .sort((a, b) => b.areaM2 - a.areaM2 || b.panels - a.panels || a.name.localeCompare(b.name, 'ru'))
    .slice(0, 8);
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
    value: metricValue(row, metric),
  };
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
  const rows = new Map(staff.map((user) => [user.id, emptyRow(user)]));

  function adopt(event) {
    const id = event.userId || `login:${event.login || 'unknown'}`;
    const existing = rows.get(id);
    if (existing) return existing;
    const row = emptyRow({
      id,
      login: event.login || '',
      displayName: event.login || 'Без сотрудника',
      role: event.role || 'measurer',
    });
    rows.set(id, row);
    return row;
  }

  for (const event of input.events || []) {
    if (!event) continue;
    if (String(event.role || '') === 'admin') continue;
    if (usersById.get(event.userId)?.role === 'admin') continue;
    if (orgId && event.orgId !== orgId) continue;
    if (!inWindow(event.at, window.from, window.to)) continue;
    if (!companyScope && !allowed.has(event.userId)) continue;
    const row = rows.get(event.userId) || (companyScope ? adopt(event) : null);
    if (row) addEvent(row, event);
  }

  let working = [...rows.values()];
  const allZero =
    working.length > 0 &&
    working.every(
      (row) => row.problemomer + row.calculator + row.pdf + row.areaM2 + row.panels + row.completed === 0,
    );
  const demoFilled = Boolean(allZero && input.demoFill);
  if (demoFilled) working = applyDemoFill(working, window.period);
  else reconcileTotals(working);

  const ranking = working
    .map((row) => publicRow(row, metric))
    .sort(
      (a, b) => b.value - a.value || String(a.displayName).localeCompare(String(b.displayName), 'ru'),
    );

  let detail = null;
  if (input.userId && allowed.has(input.userId)) {
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
        if (!event || event.userId !== input.userId) continue;
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
        const area = num(event.object?.areaM2);
        const panels = num(event.object?.panels);
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
    let projects = collectProjects(
      input.userId,
      input.objects,
      input.projects,
      orgId,
      window.from,
      window.to,
      true,
    );
    if (!projects.length && demoFilled) {
      projects = collectProjects(
        input.userId,
        input.objects,
        input.projects,
        orgId,
        window.from,
        window.to,
        false,
      );
    }
    if (!projects.length && demoFilled) projects = demoProjects(input.userId);
    detail = { userId: input.userId, months, averages, projects };
  }

  return {
    metric,
    period: window.period,
    from: window.from,
    to: window.to,
    scope: input.viewer?.role === 'sales' ? 'team' : 'company',
    demoFilled,
    ranking,
    detail,
  };
}
