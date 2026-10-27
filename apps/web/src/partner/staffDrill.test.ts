import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateAnalyticsDashboard, type AnalyticsEvent } from '../../../../packages/shared/partner';
import { buildStaffDrill, visibleStaff } from '../../../../packages/shared/staffDrill.js';

const now = '2026-10-27T12:00:00.000Z';

const users = [
  { id: 'owner', login: 'owner', displayName: 'Владелец', role: 'owner', orgId: 'org_a' },
  { id: 'sales', login: 'sales', displayName: 'Менеджер', role: 'sales', orgId: 'org_a' },
  { id: 'sales2', login: 'sales2', displayName: 'Второй менеджер', role: 'sales', orgId: 'org_a' },
  { id: 'measurer', login: 'measurer', displayName: 'Замерщик', role: 'measurer', orgId: 'org_a' },
  { id: 'crew', login: 'crew', displayName: 'Монтажник', role: 'crew', orgId: 'org_a' },
  { id: 'other', login: 'other', displayName: 'Чужая компания', role: 'owner', orgId: 'org_b' },
  { id: 'admin', login: 'admin', displayName: 'Админ', role: 'admin', orgId: 'org_stp' },
];

function event(partial: Record<string, unknown>) {
  return {
    at: now,
    orgId: 'org_a',
    tool: 'problemomer',
    action: 'result',
    object: { areaM2: 10, panels: 4 },
    ...partial,
  };
}

const events = [
  event({ id: 'm1', userId: 'measurer', object: { areaM2: 10, panels: 4 } }),
  event({ id: 'm2', userId: 'measurer', object: { areaM2: 20, panels: 6 } }),
  event({
    id: 'm3',
    userId: 'measurer',
    tool: 'calculator',
    action: 'calc_done',
    object: { areaM2: 5, panels: 2 },
  }),
  event({ id: 'm4', userId: 'measurer', tool: 'problemomer', action: 'pdf', object: null }),
  event({ id: 'old', userId: 'measurer', at: '2024-01-01T00:00:00.000Z', object: { areaM2: 99, panels: 99 } }),
  event({ id: 's1', userId: 'sales', tool: 'calculator', action: 'calc_done', object: { areaM2: 8, panels: 3 } }),
  event({ id: 'o1', userId: 'owner' }),
  event({ id: 'b1', userId: 'other', orgId: 'org_b' }),
  event({ id: 'a1', userId: 'admin', orgId: 'org_stp', role: 'admin' }),
];

const objects = [
  {
    id: 'room1',
    orgId: 'org_a',
    projectId: 'proj1',
    roomName: 'Спальня',
    createdBy: 'sales',
    assignedTo: 'measurer',
    updatedAt: now,
    room: { areaM2: 22 },
    estimate: { panels: 10 },
  },
  {
    id: 'room2',
    orgId: 'org_a',
    projectId: 'proj1',
    roomName: 'Кухня',
    createdBy: 'sales',
    assignedTo: 'measurer',
    updatedAt: now,
    room: { areaM2: 8 },
    estimate: { panels: 4 },
  },
  {
    id: 'old-room',
    orgId: 'org_a',
    projectId: 'proj-old',
    createdBy: 'measurer',
    assignedTo: null,
    updatedAt: '2024-01-01T00:00:00.000Z',
    room: { areaM2: 100 },
    estimate: { panels: 40 },
  },
];

const projects = [{ id: 'proj1', name: 'Квартира Ленина', orgId: 'org_a' }];

function drill(viewer: { id: string; role: string; orgId: string }, extra: Record<string, unknown> = {}) {
  return buildStaffDrill({
    viewer,
    users,
    events,
    objects,
    projects,
    metric: 'staff',
    period: 'month',
    orgId: viewer.orgId,
    now,
    demoFill: false,
    ...extra,
  });
}

test('владелец видит всю компанию и не видит чужую', () => {
  const result = drill({ id: 'owner', role: 'owner', orgId: 'org_a' }, { metric: 'problemomer' });
  assert.equal(result.scope, 'company');
  assert.deepEqual(
    visibleStaff({ id: 'owner', role: 'owner', orgId: 'org_a' }, users, 'org_a').map((user) => user.id).sort(),
    ['crew', 'measurer', 'sales', 'sales2'],
  );
  assert.deepEqual(result.roles.map((role) => role.id), ['measurer']);
  assert.equal(result.ranking.some((row) => row.role === 'owner' || row.userId === 'owner'), false);
  const measurer = result.ranking.find((row) => row.userId === 'measurer');
  assert.equal(measurer?.problemomer, 2);
  assert.equal(measurer?.calculator, 1);
  assert.equal(measurer?.pdf, 1);
  assert.equal(measurer?.areaM2, 35);
  assert.equal(measurer?.panels, 12);
  assert.equal(measurer?.completed, 3);
  assert.equal(measurer?.value, 2);
  assert.equal(result.ranking.some((row) => row.userId === 'other' || row.userId === 'admin'), false);
});

test('средняя площадь и готовые расчёты считаются по завершённым работам', () => {
  const avg = drill({ id: 'owner', role: 'owner', orgId: 'org_a' }, { metric: 'avg' });
  const done = drill({ id: 'owner', role: 'owner', orgId: 'org_a' }, { metric: 'done' });
  assert.equal(avg.ranking.find((row) => row.userId === 'measurer')?.value, 11.7);
  const measurerDone = done.ranking.find((row) => row.userId === 'measurer');
  assert.equal(measurerDone?.value, 3);
  assert.equal(done.ranking.some((row) => row.role === 'owner'), false);
});

test('менеджер видит себя и полевую команду, без владельца и других менеджеров', () => {
  const team = visibleStaff({ id: 'sales', role: 'sales', orgId: 'org_a' }, users, 'org_a');
  assert.deepEqual(team.map((user) => user.id).sort(), ['crew', 'measurer', 'sales']);
  const result = drill({ id: 'sales', role: 'sales', orgId: 'org_a' }, { userId: 'owner' });
  assert.equal(result.scope, 'team');
  assert.deepEqual(result.ranking.map((row) => row.userId).sort(), ['crew', 'measurer', 'sales']);
  assert.equal(result.detail, null);
  const own = drill({ id: 'sales', role: 'sales', orgId: 'org_a' }, { userId: 'measurer', period: 'quarter' });
  assert.equal(own.detail?.userId, 'measurer');
  assert.equal(own.detail?.projects[0]?.name, 'Квартира Ленина');
  assert.equal(own.detail?.projects[0]?.rooms, 2);
  assert.equal(own.detail?.projects[0]?.areaM2, 30);
  assert.equal(own.detail?.projects[0]?.roomId, 'room1');
  assert.equal(own.detail?.projects.some((project) => project.id === 'proj-old'), false);
  assert.ok((own.detail?.months.length || 0) >= 3);
  assert.equal(own.detail?.averages.problemomer, Math.round((2 / own.detail!.months.length) * 10) / 10);
});

test('замерщик и монтажник не попадают в видимый состав', () => {
  assert.deepEqual(visibleStaff({ id: 'measurer', role: 'measurer', orgId: 'org_a' }, users, 'org_a'), []);
  assert.deepEqual(visibleStaff({ id: 'crew', role: 'crew', orgId: 'org_a' }, users, 'org_a'), []);
});

test('пустая демо-компания получает примерные цифры, живые нули остаются нулями', () => {
  const quietUsers = users.filter((user) => user.orgId === 'org_a' && user.role !== 'owner');
  const empty = buildStaffDrill({
    viewer: { id: 'owner', role: 'owner', orgId: 'org_a' },
    users: quietUsers,
    events: [],
    objects: [],
    projects: [],
    metric: 'staff',
    period: 'month',
    orgId: 'org_a',
    now,
    demoFill: false,
  });
  assert.equal(empty.demoFilled, false);
  assert.ok(empty.ranking.every((row) => row.value === 0));
  const filled = buildStaffDrill({
    viewer: { id: 'owner', role: 'owner', orgId: 'org_a' },
    users: quietUsers,
    events: [],
    objects: [],
    projects: [],
    metric: 'area',
    period: 'year',
    userId: 'measurer',
    orgId: 'org_a',
    now,
    demoFill: true,
  });
  assert.equal(filled.demoFilled, true);
  assert.ok(filled.ranking.every((row) => row.areaM2 > 0 && row.problemomer > 0));
  assert.equal(filled.ranking[0]?.value, filled.ranking[0]?.areaM2);
  assert.ok((filled.detail?.averages.areaM2 || 0) > 0);
  assert.equal(filled.detail?.projects.length, 3);
  assert.equal(filled.detail?.projects[0]?.roomId, null);
});

function displayedSum(rows: Array<{ areaM2: number; panels: number }>, key: 'areaM2' | 'panels'): number {
  const total = rows.reduce((sum, row) => sum + row[key], 0);
  return key === 'panels' ? total : Math.round(total * 10) / 10;
}

function withoutOwner(list: Array<Record<string, unknown>>) {
  return list.filter((item) => item.userId !== 'owner' && item.role !== 'owner' && item.role !== 'admin');
}

test('сумма рейтинга владельца равна плиткам за тот же период', () => {
  for (const period of ['month', 'quarter', 'year'] as const) {
    const result = drill({ id: 'owner', role: 'owner', orgId: 'org_a' }, { period, metric: 'area' });
    assert.equal(result.ranking.some((row) => row.role === 'owner'), false);
    const dash = aggregateAnalyticsDashboard(withoutOwner(events) as AnalyticsEvent[], {
      source: 'local',
      from: result.from,
      to: result.to,
      orgId: 'org_a',
    });
    assert.equal(displayedSum(result.ranking, 'areaM2'), dash.kpi.areaM2);
    assert.equal(displayedSum(result.ranking, 'panels'), dash.kpi.panels);
    assert.equal(
      result.ranking.reduce((sum, row) => sum + row.problemomer, 0),
      dash.kpi.problemomerResults,
    );
    assert.equal(
      result.ranking.reduce((sum, row) => sum + row.calculator, 0),
      dash.kpi.calculatorDone,
    );
    assert.equal(
      result.ranking.reduce((sum, row) => sum + row.pdf, 0),
      dash.kpi.pdf,
    );
  }
});

test('дробные м² и событие без карточки сотрудника сходятся с плиткой', () => {
  const extra = [
    event({ id: 'f1', userId: 'measurer', object: { areaM2: 1.14, panels: 1.4 } }),
    event({ id: 'f2', userId: 'sales', object: { areaM2: 1.14, panels: 1.4 } }),
    event({ id: 'f3', userId: 'owner', object: { areaM2: 1.14, panels: 1.4 } }),
    event({
      id: 'ghost',
      userId: 'ghost',
      login: 'ghost',
      role: 'measurer',
      object: { areaM2: 2.2, panels: 1 },
    }),
  ];
  const all = [...events, ...extra];
  const result = drill({ id: 'owner', role: 'owner', orgId: 'org_a' }, { metric: 'area', events: all });
  const dash = aggregateAnalyticsDashboard(withoutOwner(all) as AnalyticsEvent[], {
    source: 'local',
    from: result.from,
    to: result.to,
    orgId: 'org_a',
  });
  assert.equal(result.ranking.some((row) => row.userId === 'ghost'), true);
  assert.equal(displayedSum(result.ranking, 'areaM2'), dash.kpi.areaM2);
  assert.equal(displayedSum(result.ranking, 'panels'), dash.kpi.panels);
  assert.equal(
    result.ranking.reduce((sum, row) => sum + row.problemomer, 0),
    dash.kpi.problemomerResults,
  );
});

test('месяц, квартал и год дают разную сумму рейтинга', () => {
  const spanned = [
    event({ id: 'near', userId: 'measurer', at: '2026-10-20T12:00:00.000Z', object: { areaM2: 10, panels: 1 } }),
    event({ id: 'mid', userId: 'measurer', at: '2026-09-01T12:00:00.000Z', object: { areaM2: 20, panels: 1 } }),
    event({ id: 'far', userId: 'measurer', at: '2026-04-01T12:00:00.000Z', object: { areaM2: 40, panels: 1 } }),
  ];
  const totals = (['month', 'quarter', 'year'] as const).map((period) => {
    const result = buildStaffDrill({
      viewer: { id: 'owner', role: 'owner', orgId: 'org_a' },
      users,
      events: spanned,
      metric: 'area',
      period,
      orgId: 'org_a',
      now,
      demoFill: false,
    });
    return result.ranking.reduce((sum, row) => sum + row.areaM2, 0);
  });
  assert.ok(totals[0] < totals[1] && totals[1] < totals[2], totals.join(','));
});

test('без активности владельца сумма ролей совпадает с плиткой компании', () => {
  const staffEvents = events.filter((item) => (item as { userId?: string }).userId !== 'owner');
  const result = drill({ id: 'owner', role: 'owner', orgId: 'org_a' }, { metric: 'area', events: staffEvents });
  const dash = aggregateAnalyticsDashboard(staffEvents as AnalyticsEvent[], {
    source: 'local',
    from: result.from,
    to: result.to,
    orgId: 'org_a',
  });
  assert.equal(displayedSum(result.ranking, 'areaM2'), dash.kpi.areaM2);
  assert.equal(displayedSum(result.ranking, 'panels'), dash.kpi.panels);
  assert.deepEqual(result.roles.map((role) => role.id).sort(), ['measurer', 'sales']);
});

test('плитка «Панели» показывает расчёт и отдельно монтаж', () => {
  const panelEvents = [
    event({ id: 's', userId: 'sales', object: { areaM2: 8, panels: 3 } }),
    event({ id: 'm', userId: 'measurer', object: { areaM2: 10, panels: 4 } }),
  ];
  const result = buildStaffDrill({
    viewer: { id: 'owner', role: 'owner', orgId: 'org_a' },
    users,
    events: panelEvents,
    objects: [
      {
        id: 'mounted',
        orgId: 'org_a',
        status: 'install',
        assignedTo: 'crew',
        updatedAt: now,
        room: { areaM2: 24 },
        estimate: { panels: 16 },
      },
    ],
    projects: [],
    metric: 'panels',
    period: 'month',
    orgId: 'org_a',
    now,
    demoFill: false,
  });
  assert.deepEqual(result.roles.map((role) => role.id), ['sales', 'measurer', 'crew']);
  assert.equal(result.roles.find((role) => role.id === 'crew')?.ranking[0]?.value, 16);
  assert.equal(result.roles.find((role) => role.id === 'crew')?.ranking[0]?.mountedRooms, 1);
  assert.equal(
    result.ranking.reduce((sum, row) => sum + row.panels, 0),
    7,
  );
  const problemomer = buildStaffDrill({
    viewer: { id: 'owner', role: 'owner', orgId: 'org_a' },
    users,
    events: panelEvents,
    objects: [],
    projects: [],
    metric: 'problemomer',
    period: 'month',
    orgId: 'org_a',
    now,
    demoFill: false,
  });
  assert.deepEqual(problemomer.roles.map((role) => role.id), ['sales', 'measurer']);
});

test('топ проектов строится по событиям, даже если комнаты не назначены', () => {
  const result = buildStaffDrill({
    viewer: { id: 'owner', role: 'owner', orgId: 'org_a' },
    users,
    events: [
      event({ id: 'p1', userId: 'sales', object: { areaM2: 40, panels: 16, label: 'Кухня на Арбате' } }),
      event({ id: 'p2', userId: 'sales', object: { areaM2: 22, panels: 8, projectId: 'proj-x' } }),
      event({ id: 'p3', userId: 'sales', object: { areaM2: 18, panels: 6, projectId: 'proj-x' } }),
    ],
    objects: [],
    projects: [{ id: 'proj-x', name: 'Офис на Патриарших', orgId: 'org_a' }],
    metric: 'area',
    period: 'month',
    userId: 'sales',
    orgId: 'org_a',
    now,
    demoFill: false,
  });
  assert.equal(result.ranking.find((row) => row.userId === 'sales')?.areaM2, 80);
  assert.equal(result.ranking.find((row) => row.userId === 'sales')?.projectCount, 2);
  assert.equal(result.detail?.projects.length, 2);
  const office = result.detail?.projects.find((project) => project.name === 'Офис на Патриарших');
  assert.equal(office?.areaM2, 40);
  assert.equal(office?.rooms, 2);
  assert.equal(result.detail?.projects.some((project) => project.name === 'Кухня на Арбате'), true);
});
