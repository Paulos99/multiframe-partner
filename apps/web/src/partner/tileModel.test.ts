import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptServerEvents,
  applyDashboardProbe,
  type AnalyticsTileModel,
  type DashboardProbe,
} from './analytics';

const local = {
  events: [{ id: 'local', at: '2026-10-15T12:00:00.000Z', orgId: 'org_demo' }],
  objects: [{ id: 'room' }],
  projects: [],
  users: [],
  kpi: { panels: 5206, areaM2: 2403 },
  source: 'local',
  from: '2026-10-01T00:00:00.000Z',
  to: '2026-10-27T23:59:59.000Z',
  dash: { kpi: { panels: 5206, areaM2: 2403 } },
} as unknown as AnalyticsTileModel;

function http(status: number, body: unknown): DashboardProbe {
  return { kind: 'http', status, body };
}

test('пустой ответ, 401, 404 и сеть не подменяют локальные плитки', () => {
  const probes: DashboardProbe[] = [
    http(200, null),
    http(200, {}),
    http(200, { events: [], kpi: { panels: 0, areaM2: 0 }, funnel: {}, breakdowns: {}, volume: {}, series: [] }),
    http(200, { kpi: { panels: 5206, areaM2: 2403 }, events: [] }),
    http(401, { message: 'unauthorized' }),
    http(404, { message: 'missing' }),
    http(500, {}),
    { kind: 'network' },
    { kind: 'no-api' },
  ];
  for (const probe of probes) {
    assert.equal(acceptServerEvents(probe, false), false);
    assert.equal(applyDashboardProbe(local, probe, { preferLocal: false, orgId: 'org_demo', mode: 'partner' }), local);
  }
});

test('демо-режим оставляет локальный объект, даже если сервер прислал события', () => {
  const probe = http(200, {
    events: [{ id: 'remote', at: '2026-10-15T12:00:00.000Z', orgId: 'org_demo', object: { panels: 1, areaM2: 1 } }],
  });
  assert.equal(acceptServerEvents(probe, true), false);
  assert.equal(applyDashboardProbe(local, probe, { preferLocal: true, orgId: 'org_demo', mode: 'partner' }), local);
});

test('непустые события сервера становятся единственным входом', () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    configurable: true,
  });
  const events = [
    {
      id: 'remote',
      at: '2026-10-15T12:00:00.000Z',
      orgId: 'ui_org',
      userId: 'ui_sales',
      role: 'sales',
      tool: 'problemomer',
      action: 'result',
      object: { panels: 4, areaM2: 11 },
    },
  ];
  const probe = http(200, { events });
  assert.equal(acceptServerEvents(probe, false), true);
  const next = applyDashboardProbe(local, probe, { preferLocal: false, orgId: 'ui_org', mode: 'partner' });
  assert.notEqual(next, local);
  assert.equal(next.source, 'server');
  assert.equal(next.events, events);
  assert.equal(next.objects, local.objects);
  assert.equal(next.kpi.panels, 4);
  assert.equal(next.kpi.areaM2, 11);
});
