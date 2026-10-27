import type {
  AnalyticsAction,
  AnalyticsDashboard,
  AnalyticsEvent,
  AnalyticsObject,
  AnalyticsTool,
} from '../../../../packages/shared/partner';
import { aggregateAnalyticsDashboard, isStaffRole, networkAdminScope } from '../../../../packages/shared/partner';
import { buildStaffDrill, type DrillPeriod, type StaffDrillResult } from '../../../../packages/shared/staffDrill.js';
import { getAnalyticsSessionId } from '../analytics/sessionId';
import { cacheAnalyticsEvents, loadCachedAnalyticsEvents, rememberCalculation } from './offlineDb';
import { isDemoModeEnabled } from './demoMode';
import {
  appendAnalyticsEvent,
  buildLocalDashboard,
  clearAnalyticsQueue,
  clearAllActionHistory,
  enqueueAnalyticsEvents,
  ensureActionHistoryCleared,
  ensureDemoAnalyticsHistory,
  fillDemoCompanyRooms,
  loadCachedObjects,
  loadDemoAnalyticsEvents,
  loadDb,
  loadSession,
  peekAnalyticsQueue,
} from './localStore';

const API_BASE = (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
const OPEN_THROTTLE_KEY = 'mf_partner_open_throttle_v1';
const OPEN_THROTTLE_MS = 30 * 60 * 1000;

function uid(): string {
  return `ae_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function openThrottleKey(userKey: string, tool: AnalyticsTool): string {
  return `${userKey}::${tool}`;
}

/** Returns true if this open should be recorded (first in the throttle window). */
function allowOpenEvent(userKey: string, tool: AnalyticsTool): boolean {
  try {
    const raw = localStorage.getItem(OPEN_THROTTLE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const key = openThrottleKey(userKey, tool);
    const now = Date.now();
    const last = map[key];
    if (typeof last === 'number' && now - last < OPEN_THROTTLE_MS) {
      return false;
    }
    const next: Record<string, number> = {};
    for (const [k, ts] of Object.entries(map)) {
      if (typeof ts === 'number' && now - ts < OPEN_THROTTLE_MS) next[k] = ts;
    }
    next[key] = now;
    localStorage.setItem(OPEN_THROTTLE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return true;
  }
}

export function trackPartnerAnalytics(input: {
  tool: AnalyticsTool;
  action: AnalyticsAction;
  object?: AnalyticsObject | null;
}): void {
  const session = loadSession();
  if (!session) return;
  if (input.action === 'open') {
    const userKey = session.id || session.login;
    if (!allowOpenEvent(userKey, input.tool)) return;
  }
  const city = session.org?.city || input.object?.city || '';
  const event: AnalyticsEvent = {
    id: uid(),
    at: new Date().toISOString(),
    orgId: session.orgId,
    userId: session.id,
    login: session.login,
    role: session.role,
    companyName: session.org?.companyName || session.displayName || '',
    city,
    tool: input.tool,
    action: input.action,
    sessionId: getAnalyticsSessionId(),
    object: {
      ...(input.object || {}),
      city: input.object?.city || city || null,
    },
  };
  appendAnalyticsEvent(event);
  void cacheAnalyticsEvents([event]).catch(() => undefined);
  void rememberCalculation(event).catch(() => undefined);
  void postEvents([event]);
}

async function postEvents(events: AnalyticsEvent[]): Promise<void> {
  const queued = peekAnalyticsQueue();
  const batch = [...queued, ...events];
  if (!batch.length) return;
  if (!API_BASE) {
    if (events.length) enqueueAnalyticsEvents(events);
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
    });
    if (!res.ok) throw new Error(`analytics ${res.status}`);
    clearAnalyticsQueue();
  } catch {
    if (events.length) enqueueAnalyticsEvents(events);
  }
}

export async function flushAnalyticsQueue(): Promise<void> {
  await postEvents([]);
}

/** Clear local activity + analytics events/queue. Does not touch the server store. */
export function resetLocalActionHistory(): void {
  clearAllActionHistory();
}

/** One-shot local wipe when app opens after redesign. */
export function bootstrapHistoryReset(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem('mf_partner_history_reset_v2') === '1') return;
    clearAllActionHistory();
    localStorage.setItem('mf_partner_history_reset_v2', '1');
  } catch {
    ensureActionHistoryCleared();
  }
  ensureDemoAnalyticsHistory();
}

const LOCAL_DEMO_ORGS = new Set(['org_demo', 'org_demo_spb']);

function readsLocalDemo(orgId?: string | null): boolean {
  return Boolean(orgId && LOCAL_DEMO_ORGS.has(orgId));
}

function dedupeAnalyticsEvents(list: AnalyticsEvent[]): AnalyticsEvent[] {
  const seen = new Set<string>();
  const out: AnalyticsEvent[] = [];
  for (const event of list) {
    if (!event?.id || seen.has(event.id)) continue;
    seen.add(event.id);
    out.push(event);
  }
  return out;
}

/** Те же события, из которых собирается подпись «Сохранённая история». */
export async function loadSharedAnalyticsEvents(orgId?: string | null): Promise<AnalyticsEvent[]> {
  ensureDemoAnalyticsHistory();
  const extra = readsLocalDemo(orgId) ? [] : await cachedEvents();
  return dedupeAnalyticsEvents([...extra, ...loadDemoAnalyticsEvents()]);
}

/**
 * Плитки и рейтинг: один список событий, один список комнат, одно окно.
 * Комнаты — тот же массив, что у доски «Проекты»; если хук ещё пуст, берётся его кэш.
 */
export function composeCabinetAnalytics(input: {
  events: AnalyticsEvent[];
  objects?: Array<Record<string, unknown>>;
  projects?: Array<Record<string, unknown>>;
  from?: string | null;
  to?: string | null;
  orgId?: string | null;
  metric?: string;
  period?: DrillPeriod;
  userId?: string | null;
  mode?: 'admin' | 'partner';
  kpi?: { panels: number; areaM2: number } | null;
  /** Сотрудники кабинета. На сервере это живой список, а не демо-сид. */
  users?: Array<{ id: string; login?: string; displayName?: string; role: string; orgId?: string | null }>;
}): { dash: AnalyticsDashboard; drill: StaffDrillResult } {
  const db = loadDb();
  const session = loadSession();
  const orgId = input.mode === 'admin' ? input.orgId || null : session?.orgId || input.orgId || null;
  const usersById = new Map(db.users.map((user) => [user.id, user]));
  for (const user of input.users || []) {
    if (!user?.id) continue;
    const prev = usersById.get(user.id);
    usersById.set(user.id, { ...prev, ...user, role: user.role || prev?.role || 'sales' });
  }
  const users = [...usersById.values()];
  const rooms = resolveCompanyRooms(input.objects, orgId);
  const projects = input.projects?.length
    ? input.projects
    : ((db.projects || []) as unknown as Array<Record<string, unknown>>);
  const executorDirectory = db.users
    .filter((user) => isStaffRole(user.role))
    .map((user) => ({
      userId: user.id,
      login: user.login,
      displayName: user.displayName,
      orgId: user.orgId,
      role: user.role,
    }));
  const dash = aggregateAnalyticsDashboard(input.events, {
    source: 'local',
    from: input.from,
    to: input.to,
    orgId,
    partnerCount: db.users.filter((user) => user.role === 'owner').length,
    executorCount: orgId
      ? executorDirectory.filter((user) => user.orgId === orgId).length
      : executorDirectory.length,
    executorDirectory,
    ...networkAdminScope(db.users),
  });
  const drill = buildStaffDrill({
    viewer: {
      id: session?.id || '',
      role: session?.role || (input.mode === 'admin' ? 'admin' : 'owner'),
      orgId: session?.orgId || orgId,
    },
    users,
    events: input.events as unknown as Array<Record<string, unknown>>,
    objects: rooms,
    projects,
    metric: input.metric || 'staff',
    period: input.period || 'month',
    userId: input.userId || null,
    orgId,
    from: input.from,
    to: input.to,
    unbounded: input.from === 'all',
    demoFill: false,
    kpi: input.kpi === undefined ? { panels: dash.kpi.panels, areaM2: dash.kpi.areaM2 } : input.kpi,
  });
  return { dash, drill };
}

export type AnalyticsTileSource = 'local' | 'server';

/** Один объект на плитки и на рейтинг. Рейтинг получает его пропсом, без второго запроса. */
export type AnalyticsTileModel = {
  events: AnalyticsEvent[];
  objects: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  users: Array<{ id: string; login?: string; displayName?: string; role: string; orgId?: string | null }>;
  kpi: { panels: number; areaM2: number };
  source: AnalyticsTileSource;
  from: string | null;
  to: string | null;
  dash: AnalyticsDashboard;
};

export type DashboardProbe =
  | { kind: 'no-api' }
  | { kind: 'network' }
  | { kind: 'http'; status: number; body: unknown };

export function analyticsSourceLabel(source: AnalyticsTileSource): string {
  return source === 'server' ? 'сервер' : 'локально';
}

/** Числа, которые рисует плитка. Абзац и рейтинг читают их, а не вторую копию. */
export function shownTileNumbers(model: Pick<AnalyticsTileModel, 'dash'>): { panels: number; areaM2: number } {
  const panels = Number(model.dash?.kpi?.panels);
  const areaM2 = Number(model.dash?.kpi?.areaM2);
  return {
    panels: Number.isFinite(panels) ? panels : 0,
    areaM2: Number.isFinite(areaM2) ? areaM2 : 0,
  };
}

function roomBelongs(room: Record<string, unknown>, orgId?: string | null): boolean {
  if (!orgId) return true;
  const roomOrg = room.orgId ? String(room.orgId) : '';
  return !roomOrg || roomOrg === orgId;
}

/** Комната, по которой топ может показать клиента и площадь. Заглушка без имени не считается. */
function roomHasIdentity(room: Record<string, unknown> | null | undefined): boolean {
  if (!room) return false;
  if (room.clientName || room.roomName) return true;
  const nested = room.room;
  if (nested && typeof nested === 'object' && Number((nested as { areaM2?: unknown }).areaM2) > 0) return true;
  const status = String(room.status || '');
  return Boolean(status && status !== 'draft');
}

/**
 * Тот же список, что у «Топ проектов».
 * Пустой хук, пустой кэш и заглушка не затирают комнаты компании.
 * У демо-компании без своих комнат это доска сида: Никитин, Морозова, Вася.
 */
export function resolveCompanyRooms(
  passed?: Array<Record<string, unknown>> | null,
  orgId?: string | null,
): Array<Record<string, unknown>> {
  const stored = loadDb().objects as unknown as Array<Record<string, unknown>>;
  const cached = loadCachedObjects() as unknown as Array<Record<string, unknown>>;
  const merged = mergeStoredRooms(mergeStoredRooms(passed || [], cached), stored);
  const company = merged.filter((room) => roomHasIdentity(room) && roomBelongs(room, orgId));
  if (company.length) return company;
  return fillDemoCompanyRooms([], orgId) as unknown as Array<Record<string, unknown>>;
}

/** Комнаты доски. Пустой хук и заглушка в кэше не затирают комнаты компании. */
export function roomsForCabinet(
  hookRooms?: Array<Record<string, unknown>> | null,
  orgId?: string | null,
): Array<Record<string, unknown>> {
  return resolveCompanyRooms(hookRooms, orgId ?? loadSession()?.orgId ?? null);
}

function serverEvents(body: unknown): AnalyticsEvent[] {
  if (!body || typeof body !== 'object') return [];
  const events = (body as { events?: unknown }).events;
  return Array.isArray(events) ? (events as AnalyticsEvent[]) : [];
}

/** Пустое тело, нулевой kpi без событий, 401, 404 и сеть не становятся входом плиток. */
export function acceptServerEvents(probe: DashboardProbe, preferLocal: boolean): boolean {
  if (preferLocal) return false;
  if (probe.kind !== 'http' || probe.status !== 200) return false;
  return serverEvents(probe.body).length > 0;
}

/**
 * Сервер принимается только вместе со своими событиями.
 * Иначе возвращается тот же локальный объект, из которого уже нарисованы плитки.
 */
export function applyDashboardProbe(
  local: AnalyticsTileModel,
  probe: DashboardProbe,
  opts: { preferLocal: boolean; orgId?: string | null; mode: 'admin' | 'partner' },
): AnalyticsTileModel {
  if (!acceptServerEvents(probe, opts.preferLocal)) return local;
  const events = serverEvents(probe.kind === 'http' ? probe.body : null);
  const composed = composeCabinetAnalytics({
    events,
    objects: local.objects,
    projects: local.projects,
    users: local.users,
    from: local.from,
    to: local.to,
    orgId: opts.orgId,
    mode: opts.mode,
  });
  return {
    events,
    objects: local.objects,
    projects: local.projects,
    users: local.users,
    kpi: { panels: composed.dash.kpi.panels, areaM2: composed.dash.kpi.areaM2 },
    source: 'server',
    from: local.from,
    to: local.to,
    dash: { ...composed.dash, source: 'api' },
  };
}

/** Живой запрос сводки. Демо его не пропускает: пустой ответ просто не принимается. */
export async function probeAnalyticsDashboard(opts: {
  mode: 'admin' | 'partner';
  orgId?: string | null;
  partnerLogin?: string | null;
}): Promise<DashboardProbe> {
  if (!API_BASE) return { kind: 'no-api' };
  try {
    const q = new URLSearchParams();
    if (opts.orgId) q.set('orgId', opts.orgId);
    const headers: Record<string, string> = {
      'X-Analytics-Role': opts.mode === 'admin' ? 'admin' : 'owner',
      'Content-Type': 'application/json',
    };
    const token = (() => {
      try {
        return localStorage.getItem('mf_partner_token_v1');
      } catch {
        return null;
      }
    })();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.partnerLogin) headers['X-Partner-Login'] = opts.partnerLogin;
    if (opts.orgId) headers['X-Analytics-Org'] = opts.orgId;
    const res = await fetch(`${API_BASE}/analytics/dashboard?${q.toString()}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { kind: 'http', status: res.status, body };
  } catch {
    return { kind: 'network' };
  }
}

async function cachedEvents(): Promise<AnalyticsEvent[]> {
  try {
    return await loadCachedAnalyticsEvents();
  } catch {
    return [];
  }
}

export async function fetchAnalyticsDashboard(opts: {
  mode: 'admin' | 'partner';
  from?: string | null;
  to?: string | null;
  orgId?: string | null;
  partnerLogin?: string | null;
  journal?: boolean;
}): Promise<AnalyticsDashboard> {
  ensureDemoAnalyticsHistory();
  const demoLocal = readsLocalDemo(opts.orgId);
  const extra = demoLocal ? [] : await cachedEvents();
  const local = buildLocalDashboard(
    {
      from: opts.from,
      to: opts.to,
      orgId: opts.mode === 'partner' ? opts.orgId : opts.orgId,
      journalAll: opts.journal,
    },
    extra,
  );

  if (!API_BASE || demoLocal) return local;

  try {
    const q = new URLSearchParams();
    if (opts.from) q.set('from', opts.from);
    if (opts.to) q.set('to', opts.to);
    if (opts.orgId) q.set('orgId', opts.orgId);
    if (opts.journal) q.set('journal', '1');
    const headers: Record<string, string> = {
      'X-Analytics-Role': opts.mode === 'admin' ? 'admin' : 'owner',
      'Content-Type': 'application/json',
    };
    const token = (() => {
      try {
        return localStorage.getItem('mf_partner_token_v1');
      } catch {
        return null;
      }
    })();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.partnerLogin) headers['X-Partner-Login'] = opts.partnerLogin;
    if (opts.orgId) headers['X-Analytics-Org'] = opts.orgId;

    const res = await fetch(`${API_BASE}/analytics/dashboard?${q.toString()}`, { headers });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as Partial<AnalyticsDashboard>;
    // Old API without funnel/series/volume — keep local aggregate shape
    if (!data.funnel || !data.breakdowns || !data.volume || !Array.isArray(data.series)) {
      return local;
    }
    if (!data.breakdowns.city) {
      data.breakdowns = { ...data.breakdowns, city: local.breakdowns.city || [] };
    }
    const dash = { ...local, ...data, source: 'api' } as AnalyticsDashboard;
    const toCache = [...(dash.events || []), ...(dash.recentObjects || [])];
    void cacheAnalyticsEvents(toCache).catch(() => undefined);
    return dash;
  } catch {
    return local;
  }
}

function authHeaders(mode: 'admin' | 'partner', orgId?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Analytics-Role': mode === 'admin' ? 'admin' : 'owner',
    'Content-Type': 'application/json',
  };
  try {
    const token = localStorage.getItem('mf_partner_token_v1');
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* ignore */
  }
  if (orgId) headers['X-Analytics-Org'] = orgId;
  return headers;
}

/** Доска из кабинета может прийти урезанной. Поля статуса и исполнителя добираем из того же v5, что и сид. */
function mergeStoredRooms(
  passed: Array<Record<string, unknown>> | undefined,
  stored: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  if (!passed?.length) return stored;
  const byId = new Map(stored.filter((object) => object?.id).map((object) => [String(object.id), object]));
  const seen = new Set<string>();
  const merged = passed.map((object) => {
    const id = object?.id ? String(object.id) : '';
    if (id) seen.add(id);
    const full = id ? byId.get(id) : undefined;
    if (!full) return object;
    return {
      ...full,
      ...object,
      status: object.status ?? full.status,
      assignedTo: object.assignedTo ?? full.assignedTo,
      orgId: object.orgId ?? full.orgId,
      projectId: object.projectId ?? full.projectId,
      updatedAt: object.updatedAt ?? full.updatedAt,
      createdAt: object.createdAt ?? full.createdAt,
      history: object.history ?? full.history,
      room: object.room ?? full.room,
      estimate: object.estimate ?? full.estimate,
    };
  });
  for (const object of stored) {
    const id = object?.id ? String(object.id) : '';
    if (id && !seen.has(id)) merged.push(object);
  }
  return merged;
}

function localStaffDrill(opts: {
  mode: 'admin' | 'partner';
  metric: string;
  period: DrillPeriod;
  userId?: string | null;
  orgId?: string | null;
  from?: string | null;
  to?: string | null;
  objects?: Array<Record<string, unknown>>;
  projects?: Array<Record<string, unknown>>;
}): StaffDrillResult {
  const session = loadSession();
  const db = loadDb();
  const orgId = opts.mode === 'admin' ? opts.orgId || null : session?.orgId || opts.orgId || null;
  const demoOrg = db.orgs.some((org) => org.id === 'org_demo' || org.id === 'org_demo_spb');
  const focusDemo = !orgId || orgId === 'org_demo' || orgId === 'org_demo_spb';
  const boardObjects = mergeStoredRooms(
    opts.objects,
    db.objects as unknown as Array<Record<string, unknown>>,
  );
  const boardProjects = opts.projects?.length
    ? opts.projects
    : ((db.projects || []) as unknown as Array<Record<string, unknown>>);
  const result = buildStaffDrill({
    viewer: {
      id: session?.id || '',
      role: session?.role || (opts.mode === 'admin' ? 'admin' : 'owner'),
      orgId: session?.orgId || orgId,
    },
    users: db.users,
    events: loadDemoAnalyticsEvents() as unknown as Array<Record<string, unknown>>,
    objects: boardObjects,
    projects: boardProjects,
    metric: opts.metric,
    period: opts.period,
    userId: opts.userId || null,
    orgId,
    from: opts.from,
    to: opts.to,
    unbounded: opts.from === 'all',
    demoFill: (isDemoModeEnabled() || demoOrg) && focusDemo,
  });
  if ((import.meta.env.DEV || isDemoModeEnabled()) && result.drops) {
    const drops = result.drops;
    const install = Object.entries(drops.installByUser || {})
      .map(([userId, count]) => `${userId}×${count}`)
      .join(', ') || 'нет';
    const closed = Object.entries(drops.closedByUser || {})
      .map(([userId, count]) => `${userId}×${count}`)
      .join(', ') || 'нет';
    console.info(
      `[чему 0] хранилище mf_partner_db_v5, комнат ${drops.rooms}, компания ${drops.company}, период ${drops.period}, исполнитель ${drops.assignee}, монтаж ${install}, закрыто ${closed}, плитка панелей ${drops.tilePanels}, площадь ${drops.tileArea}`,
    );
  }
  return result;
}

export async function fetchStaffDrill(opts: {
  mode: 'admin' | 'partner';
  metric: string;
  period: DrillPeriod;
  userId?: string | null;
  orgId?: string | null;
  from?: string | null;
  to?: string | null;
  objects?: Array<Record<string, unknown>>;
  projects?: Array<Record<string, unknown>>;
}): Promise<StaffDrillResult> {
  ensureDemoAnalyticsHistory();
  const focusOrg = opts.mode === 'admin' ? opts.orgId || null : loadSession()?.orgId || opts.orgId || null;
  if (!API_BASE || readsLocalDemo(focusOrg)) return localStaffDrill(opts);
  const q = new URLSearchParams();
  q.set('metric', opts.metric);
  q.set('period', opts.period);
  if (opts.userId) q.set('userId', opts.userId);
  if (opts.orgId) q.set('orgId', opts.orgId);
  if (opts.from && opts.to) {
    q.set('from', opts.from);
    q.set('to', opts.to);
  } else if (opts.from === 'all') {
    q.set('from', 'all');
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/analytics/drill?${q.toString()}`, {
      headers: authHeaders(opts.mode, opts.orgId),
    });
  } catch {
    throw new Error('Не удалось загрузить рейтинг. Проверьте соединение.');
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('Аналитика недоступна');
  }
  if (!res.ok) throw new Error('Не удалось загрузить рейтинг. Проверьте соединение.');
  let data: StaffDrillResult;
  try {
    data = (await res.json()) as StaffDrillResult;
  } catch {
    throw new Error('Не удалось загрузить рейтинг. Проверьте соединение.');
  }
  if (!data || !Array.isArray(data.ranking)) {
    throw new Error('Не удалось загрузить рейтинг. Проверьте соединение.');
  }
  return data;
}

export function periodFromDays(days: number | null): { from: string | null; to: string | null } {
  if (days == null) return { from: null, to: null };
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

const MONTHS_RU = [
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

/** Recent calendar months, newest first. Value is YYYY-MM. */
export function recentMonths(count = 18): Array<{ value: string; label: string }> {
  const now = new Date();
  const out: Array<{ value: string; label: string }> = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ value, label: `${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}

export function monthLabel(value: string): string {
  const [y, m] = value.split('-').map(Number);
  if (!y || !m) return value;
  return `${MONTHS_RU[m - 1] || value} ${y}`;
}

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export function ymdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function ymdShift(days: number, base = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return ymdLocal(d);
}

/** Скользящие месяц, квартал и год для панели показателя. Сводку не меняет. */
export function presetRange(period: DrillPeriod, now = new Date()): { fromYmd: string; toYmd: string } {
  const months = period === 'year' ? 12 : period === 'quarter' ? 3 : 1;
  const from = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return { fromYmd: ymdLocal(from), toYmd: ymdLocal(now) };
}

/** Inclusive local calendar range. Nulls mean all time. */
export function rangeFromYmd(
  fromYmd: string | null,
  toYmd: string | null,
): { from: string | null; to: string | null } {
  if (!fromYmd || !toYmd) return { from: null, to: null };
  const start = parseYmd(fromYmd <= toYmd ? fromYmd : toYmd);
  const end = parseYmd(fromYmd <= toYmd ? toYmd : fromYmd);
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function formatPeriodLabel(fromYmd: string | null, toYmd: string | null): string {
  if (!fromYmd || !toYmd) return 'Всё время';
  const a = fromYmd <= toYmd ? fromYmd : toYmd;
  const b = fromYmd <= toYmd ? toYmd : fromYmd;
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  if (a === b) return `${d1} ${MONTHS_GEN[m1 - 1]} ${y1}`;
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${MONTHS_GEN[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${d1} ${MONTHS_SHORT[m1 - 1]} — ${d2} ${MONTHS_SHORT[m2 - 1]} ${y1}`;
  return `${d1} ${MONTHS_SHORT[m1 - 1]} ${y1} — ${d2} ${MONTHS_SHORT[m2 - 1]} ${y2}`;
}

/** Inclusive local range for a calendar month, or one day inside it. */
export function rangeForMonthDay(
  month: string,
  day: number | null,
): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  if (day && day >= 1 && day <= 31) {
    const start = new Date(y, m - 1, day, 0, 0, 0, 0);
    const end = new Date(y, m - 1, day, 23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * One period for the STP home and the analytics screen.
 * Both read it, and only one PeriodCalendar writes it.
 * Выбор сохраняется в браузере и переживает перезагрузку.
 */
export type AnalyticsPeriod = { fromYmd: string | null; toYmd: string | null };

const PERIOD_KEY = 'mf_partner_analytics_period_v1';

function defaultPeriod(): AnalyticsPeriod {
  return { fromYmd: ymdShift(-6), toYmd: ymdShift(0) };
}

function validYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function readStoredPeriod(raw: string | null, fallback = defaultPeriod()): AnalyticsPeriod {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<AnalyticsPeriod>;
    const fromOk = parsed.fromYmd === null || validYmd(parsed.fromYmd);
    const toOk = parsed.toYmd === null || validYmd(parsed.toYmd);
    if (!fromOk || !toOk || parsed.fromYmd === undefined || parsed.toYmd === undefined) return fallback;
    return { fromYmd: parsed.fromYmd, toYmd: parsed.toYmd };
  } catch {
    return fallback;
  }
}

function loadPeriod(): AnalyticsPeriod {
  try {
    if (typeof localStorage === 'undefined') return defaultPeriod();
    return readStoredPeriod(localStorage.getItem(PERIOD_KEY));
  } catch {
    return defaultPeriod();
  }
}

let periodSnapshot: AnalyticsPeriod = loadPeriod();
const periodListeners = new Set<() => void>();

export function getAnalyticsPeriod(): AnalyticsPeriod {
  return periodSnapshot;
}

export function setAnalyticsPeriod(fromYmd: string | null, toYmd: string | null): void {
  if (periodSnapshot.fromYmd === fromYmd && periodSnapshot.toYmd === toYmd) return;
  periodSnapshot = { fromYmd, toYmd };
  try {
    localStorage.setItem(PERIOD_KEY, JSON.stringify(periodSnapshot));
  } catch {
    /* хранилище недоступно — период живёт до перезагрузки */
  }
  periodListeners.forEach((listener) => listener());
}

export function subscribeAnalyticsPeriod(listener: () => void): () => void {
  periodListeners.add(listener);
  return () => {
    periodListeners.delete(listener);
  };
}

/** Org selected from an STP company card. Empty string means the whole network. */
let focusOrgSnapshot = '';
const focusListeners = new Set<() => void>();

export function getAnalyticsFocusOrg(): string {
  return focusOrgSnapshot;
}

export function setAnalyticsFocusOrg(orgId: string | null): void {
  const next = orgId || '';
  if (focusOrgSnapshot === next) return;
  focusOrgSnapshot = next;
  focusListeners.forEach((listener) => listener());
}

export function subscribeAnalyticsFocusOrg(listener: () => void): () => void {
  focusListeners.add(listener);
  return () => {
    focusListeners.delete(listener);
  };
}
