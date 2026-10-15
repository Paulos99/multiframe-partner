import type {
  AnalyticsAction,
  AnalyticsDashboard,
  AnalyticsEvent,
  AnalyticsObject,
  AnalyticsTool,
} from '../../../../packages/shared/partner';
import {
  appendAnalyticsEvent,
  buildLocalDashboard,
  clearAnalyticsQueue,
  enqueueAnalyticsEvents,
  loadSession,
  peekAnalyticsQueue,
} from './localStore';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

function uid(): string {
  return `ae_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function trackPartnerAnalytics(input: {
  tool: AnalyticsTool;
  action: AnalyticsAction;
  object?: AnalyticsObject | null;
}): void {
  const session = loadSession();
  if (!session) return;
  const event: AnalyticsEvent = {
    id: uid(),
    at: new Date().toISOString(),
    orgId: session.orgId,
    userId: session.id,
    login: session.login,
    role: session.role,
    companyName: session.org?.companyName || session.displayName || '',
    tool: input.tool,
    action: input.action,
    object: input.object || null,
  };
  appendAnalyticsEvent(event);
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

export async function fetchAnalyticsDashboard(opts: {
  mode: 'admin' | 'partner';
  from?: string | null;
  to?: string | null;
  orgId?: string | null;
  partnerLogin?: string | null;
}): Promise<AnalyticsDashboard> {
  const local = buildLocalDashboard({
    from: opts.from,
    to: opts.to,
    orgId: opts.mode === 'partner' ? opts.orgId : opts.orgId,
  });

  if (!API_BASE) return local;

  try {
    const q = new URLSearchParams();
    if (opts.from) q.set('from', opts.from);
    if (opts.to) q.set('to', opts.to);
    if (opts.orgId) q.set('orgId', opts.orgId);
    const headers: Record<string, string> = {
      'X-Analytics-Role': opts.mode,
    };
    if (opts.mode === 'admin') {
      headers['X-Analytics-Key'] = 'admin1234';
    }
    if (opts.partnerLogin) headers['X-Partner-Login'] = opts.partnerLogin;
    if (opts.orgId) headers['X-Analytics-Org'] = opts.orgId;

    const res = await fetch(`${API_BASE}/analytics/dashboard?${q.toString()}`, { headers });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as AnalyticsDashboard;
    return { ...data, source: 'api' };
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
