import type {
  AnalyticsAction,
  AnalyticsDashboard,
  AnalyticsEvent,
  AnalyticsObject,
  AnalyticsTool,
} from '../../../../packages/shared/partner';
import { getAnalyticsSessionId } from '../analytics/sessionId';
import { cacheAnalyticsEvents, loadCachedAnalyticsEvents, rememberCalculation } from './offlineDb';
import {
  appendAnalyticsEvent,
  buildLocalDashboard,
  clearAnalyticsQueue,
  clearAllActionHistory,
  enqueueAnalyticsEvents,
  ensureActionHistoryCleared,
  loadSession,
  peekAnalyticsQueue,
} from './localStore';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
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
  const extra = await cachedEvents();
  const local = buildLocalDashboard(
    {
      from: opts.from,
      to: opts.to,
      orgId: opts.mode === 'partner' ? opts.orgId : opts.orgId,
      journalAll: opts.journal,
    },
    extra,
  );

  if (!API_BASE) return local;

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
    if (opts.mode === 'admin') {
      headers['X-Analytics-Key'] = 'admin1234';
    }
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
