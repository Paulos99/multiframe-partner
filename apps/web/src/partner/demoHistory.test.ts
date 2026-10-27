import assert from 'node:assert/strict';
import test from 'node:test';
import { demoHistoryReady, supplementDemoHistory } from '../../../../packages/shared/demoHistory.js';
import { buildStaffDrill, drillWindow } from '../../../../packages/shared/staffDrill.js';
import { buildLocalDemoAnalytics } from './demoSeed';

const DAY = 24 * 60 * 60 * 1000;

const users = [
  { id: 'u_partner1', login: 'partner1', displayName: 'Владелец', role: 'owner', orgId: 'org_demo' },
  { id: 'u_sales1', login: 'sales1', displayName: 'Менеджер', role: 'sales', orgId: 'org_demo' },
  { id: 'u_exec1', login: 'exec1', displayName: 'Замерщик', role: 'measurer', orgId: 'org_demo' },
  { id: 'u_crew1', login: 'crew1', displayName: 'Монтажник', role: 'crew', orgId: 'org_demo' },
  { id: 'u_crew1b', login: 'crew1b', displayName: 'Монтажник 2', role: 'crew', orgId: 'org_demo' },
];

function spanOf(events: Array<{ at?: string }>): number {
  const stamps = events.map((event) => Date.parse(event.at || '')).filter((stamp) => !Number.isNaN(stamp));
  if (stamps.length < 2) return 0;
  return Math.max(...stamps) - Math.min(...stamps);
}

/**
 * Короткая пачка c2d440d остаётся короткой: 3ee8094 видит флаг посева,
 * 4dab41d / 69745ae / 719f65f пытаются записать год, запись не сохраняется.
 */
function replayFailedMigrations<T extends { id?: string; at?: string; orgId?: string | null }>(monthPack: T[]) {
  const store: { events: T[]; seed: string | null; version: string | null } = {
    events: [],
    seed: null,
    version: null,
  };
  const writeFails = () => false;
  if (!(store.seed === '1' && store.events.length > 2)) {
    store.events = monthPack;
    store.seed = '1';
  }
  if (!(store.seed === '1' && store.events.length > 2)) {
    store.events = monthPack;
    store.seed = '1';
  }
  if (!(store.seed === '1' && store.events.length > 2 && spanOf(store.events) >= 100 * DAY)) {
    if (writeFails()) store.events = monthPack;
  }
  if (store.version !== '3' && writeFails()) {
    store.version = '3';
  }
  if (!demoHistoryReady(store.events) && writeFails()) {
    store.version = '3';
  }
  return store;
}

function drill(
  events: Array<Record<string, unknown>>,
  period: 'month' | 'quarter' | 'year',
  metric: string,
  userId?: string,
) {
  const now = new Date();
  const window = drillWindow(period, now);
  return buildStaffDrill({
    viewer: { id: 'u_partner1', role: 'owner', orgId: 'org_demo' },
    users,
    events,
    objects: [],
    projects: [],
    metric,
    period,
    userId,
    orgId: 'org_demo',
    from: window.from,
    to: window.to,
    now: now.toISOString(),
    demoFill: false,
  });
}

function salesArea(events: Array<Record<string, unknown>>, period: 'month' | 'quarter' | 'year'): number {
  const role = drill(events, period, 'area').roles.find((item) => item.id === 'sales');
  return (role?.ranking || []).reduce((sum, row) => sum + row.areaM2, 0);
}

test('последовательный короткий архив добирает год при чтении', () => {
  const year = buildLocalDemoAnalytics();
  const monthPack = year.filter(
    (event) => event.id !== 'ev_demo_history_schema' && Date.now() - Date.parse(event.at) < 30 * DAY,
  );
  const store = replayFailedMigrations(monthPack);
  assert.ok(spanOf(store.events) < 40 * DAY);
  assert.equal(demoHistoryReady(store.events), false);
  assert.equal(salesArea(store.events, 'month'), salesArea(store.events, 'quarter'));
  assert.equal(salesArea(store.events, 'quarter'), salesArea(store.events, 'year'));

  const ids = store.events.map((event) => event.id);
  const first = supplementDemoHistory(store.events, year);
  const second = supplementDemoHistory(store.events, year);
  assert.deepEqual(first, second);
  assert.equal(supplementDemoHistory(first, year), first);
  assert.deepEqual(store.events.map((event) => event.id), ids);
  assert.ok(spanOf(first) > 300 * DAY);

  const weekFrom = new Date(Date.now() - 7 * DAY).toISOString();
  const weekTo = new Date(Date.now() + DAY).toISOString();
  const weekArea = (events: Array<Record<string, unknown>>) => {
    const result = buildStaffDrill({
      viewer: { id: 'u_partner1', role: 'owner', orgId: 'org_demo' },
      users,
      events,
      objects: [],
      projects: [],
      metric: 'area',
      period: 'month',
      orgId: 'org_demo',
      from: weekFrom,
      to: weekTo,
      now: new Date().toISOString(),
      demoFill: false,
    });
    return result.roles
      .flatMap((role) => role.ranking)
      .reduce((sum, row) => sum + row.areaM2, 0);
  };
  assert.equal(weekArea(first), weekArea(store.events));

  const month = salesArea(first, 'month');
  const quarter = salesArea(first, 'quarter');
  const yearArea = salesArea(first, 'year');
  assert.ok(quarter > month, `квартал ${quarter}, месяц ${month}`);
  assert.ok(yearArea > quarter, `год ${yearArea}, квартал ${quarter}`);

  const card = drill(first, 'month', 'area', 'u_sales1');
  const manager = card.ranking.find((row) => row.userId === 'u_sales1');
  assert.ok((manager?.areaM2 || 0) > 0);
  assert.ok((manager?.projectCount || 0) > 0);
  assert.ok((card.detail?.projects.length || 0) > 0);
  assert.equal(card.detail?.projects.some((project) => project.name === 'Расчёт'), false);

  const mounted = (period: 'month' | 'quarter' | 'year') =>
    drill(first, period, 'panels').roles.find((role) => role.id === 'crew')?.ranking || [];
  for (const period of ['month', 'quarter', 'year'] as const) {
    const crew = mounted(period);
    assert.equal(crew.length, 2, period);
    for (const row of crew) {
      assert.ok(row.value > 0, `${row.displayName} ${period}`);
      assert.equal(row.value, row.mountedPanels);
      assert.ok(row.mountedRooms > 0);
      assert.ok(row.mountedAreaM2 > 0);
    }
  }
  const monthPanels = mounted('month').reduce((sum, row) => sum + row.value, 0);
  const yearPanels = mounted('year').reduce((sum, row) => sum + row.value, 0);
  assert.ok(yearPanels > monthPanels);
});

test('чужая компания не получает демо-год', () => {
  const foreign = [{ id: 'ui_only', orgId: 'ui_org', at: new Date().toISOString(), action: 'result' }];
  const generated = [{ id: 'ev_old', orgId: 'org_demo', at: new Date(Date.now() - 400 * DAY).toISOString() }];
  assert.equal(supplementDemoHistory(foreign, generated), foreign);
});
