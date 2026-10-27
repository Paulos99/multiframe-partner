import { useEffect, useState } from 'react';

/** Событие нужно, потому что pushState не вызывает popstate. */
export const ANALYTICS_ROUTE_EVENT = 'mf-analytics-route';

export type AnalyticsPeriod = 'month' | 'quarter' | 'year';

export type AnalyticsLocation = {
  page: 'overview' | 'rating' | 'staff';
  metric: string | null;
  role: string | null;
  userId: string | null;
  period: AnalyticsPeriod | null;
};

const PERIODS = new Set<AnalyticsPeriod>(['month', 'quarter', 'year']);
const ROLES = new Set(['sales', 'measurer', 'crew', 'unassigned']);

export const OVERVIEW_LOCATION: AnalyticsLocation = {
  page: 'overview',
  metric: null,
  role: null,
  userId: null,
  period: null,
};

function decodePart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function asPeriod(value: unknown): AnalyticsPeriod | null {
  return typeof value === 'string' && PERIODS.has(value as AnalyticsPeriod) ? (value as AnalyticsPeriod) : null;
}

function asRole(value: unknown): string | null {
  return typeof value === 'string' && ROLES.has(value) ? value : null;
}

export function parseAnalyticsHash(
  hash: string,
  state: { metric?: unknown; role?: unknown; period?: unknown } | null,
): AnalyticsLocation {
  const parts = hash.replace(/^#/, '').split('/').filter(Boolean).map(decodePart);
  const period = asPeriod(state?.period);
  const roleFromState = asRole(state?.role);
  const metricFromState = typeof state?.metric === 'string' && state.metric ? state.metric : null;
  if (parts[0] === 'analytics' && parts[1] === 'rating' && parts[2]) {
    return {
      page: 'rating',
      metric: parts[2],
      role: asRole(parts[3]) || roleFromState,
      userId: null,
      period,
    };
  }
  if (parts[0] === 'analytics' && parts[1] === 'staff' && parts[2]) {
    return {
      page: 'staff',
      metric: metricFromState || 'staff',
      role: roleFromState,
      userId: parts[2],
      period,
    };
  }
  return { ...OVERVIEW_LOCATION };
}

export function analyticsHash(loc: AnalyticsLocation): string {
  if (loc.page === 'rating' && loc.metric) {
    const role = loc.role ? `/${encodeURIComponent(loc.role)}` : '';
    return `#analytics/rating/${encodeURIComponent(loc.metric)}${role}`;
  }
  if (loc.page === 'staff' && loc.userId) {
    return `#analytics/staff/${encodeURIComponent(loc.userId)}`;
  }
  return '';
}

function historyAnalytics(state: unknown): { metric?: unknown; role?: unknown; period?: unknown } | null {
  if (!state || typeof state !== 'object' || !('mfAnalytics' in state)) return null;
  const payload = (state as { mfAnalytics?: unknown }).mfAnalytics;
  if (!payload || typeof payload !== 'object') return null;
  return payload as { metric?: unknown; role?: unknown; period?: unknown };
}

export function readAnalyticsLocation(): AnalyticsLocation {
  if (typeof window === 'undefined') return { ...OVERVIEW_LOCATION };
  return parseAnalyticsHash(window.location.hash, historyAnalytics(window.history.state));
}

export function readHistoryTab(): string | null {
  if (typeof window === 'undefined') return null;
  const state = window.history.state;
  if (!state || typeof state !== 'object' || !('mfTab' in state)) return null;
  const tab = (state as { mfTab?: unknown }).mfTab;
  return typeof tab === 'string' ? tab : null;
}

function emitRoute() {
  window.dispatchEvent(new Event(ANALYTICS_ROUTE_EVENT));
}

export function goAnalytics(loc: AnalyticsLocation, mode: 'push' | 'replace' = 'push') {
  if (typeof window === 'undefined') return;
  const prev = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  const next = {
    ...prev,
    mfTab: undefined,
    mfAnalytics: { metric: loc.metric, role: loc.role, period: loc.period },
  };
  const url = `${window.location.pathname}${window.location.search}${analyticsHash(loc)}`;
  if (mode === 'replace') window.history.replaceState(next, '', url);
  else window.history.pushState(next, '', url);
  emitRoute();
}

export function leaveAnalyticsForTab(tab: string) {
  if (typeof window === 'undefined') return;
  const prev = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  const url = `${window.location.pathname}${window.location.search}`;
  window.history.pushState({ ...prev, mfTab: tab, mfAnalytics: undefined }, '', url);
  emitRoute();
}

export function useAnalyticsRoute(): AnalyticsLocation {
  const [loc, setLoc] = useState(readAnalyticsLocation);
  useEffect(() => {
    const sync = () => setLoc(readAnalyticsLocation());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    window.addEventListener(ANALYTICS_ROUTE_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
      window.removeEventListener(ANALYTICS_ROUTE_EVENT, sync);
    };
  }, []);
  return loc;
}

/** Вкладка кабинета следует за hash аналитики и за записью history при уходе с неё. */
export function useCabinetSection<T extends string>(analyticsTab: T, initial: () => T) {
  const [tab, setTabState] = useState<T>(() => {
    const fallback = initial();
    if (typeof window !== 'undefined' && readAnalyticsLocation().page !== 'overview') return analyticsTab;
    return fallback;
  });

  useEffect(() => {
    function sync() {
      const loc = readAnalyticsLocation();
      if (loc.page !== 'overview') {
        setTabState(analyticsTab);
        return;
      }
      const fromHistory = readHistoryTab();
      if (fromHistory) setTabState(fromHistory as T);
    }
    window.addEventListener('popstate', sync);
    window.addEventListener(ANALYTICS_ROUTE_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(ANALYTICS_ROUTE_EVENT, sync);
    };
  }, [analyticsTab]);

  function setTab(next: T) {
    const loc = readAnalyticsLocation();
    if (loc.page !== 'overview') {
      if (next === analyticsTab) goAnalytics(OVERVIEW_LOCATION, 'push');
      else leaveAnalyticsForTab(next);
    }
    setTabState(next);
  }

  return [tab, setTab] as const;
}
