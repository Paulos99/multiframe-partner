import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateAnalyticsDashboard, normalizeRole, type AnalyticsEvent } from '../../../../packages/shared/partner';
import { buildStaffDrill, visibleStaff } from '../../../../packages/shared/staffDrill.js';
import { buildLocalDemoObjects, buildLocalDemoUsers } from './demoSeed';

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

test('событие без projectId относится к демо-проекту по комнате', () => {
  const result = buildStaffDrill({
    viewer: { id: 'u_partner1', role: 'owner', orgId: 'org_demo' },
    users: [{ id: 'u_sales1', login: 'sales1', displayName: 'Менеджер', role: 'sales', orgId: 'org_demo' }],
    events: [
      event({
        id: 'bare-kitchen',
        orgId: 'org_demo',
        userId: 'u_sales1',
        login: 'sales1',
        role: 'sales',
        object: { areaM2: 480, panels: 20, roomType: 'kitchen', city: 'Москва' },
      }),
    ],
    objects: [],
    projects: [],
    metric: 'area',
    period: 'month',
    userId: 'u_sales1',
    orgId: 'org_demo',
    now,
    demoFill: false,
  });
  const row = result.ranking.find((item) => item.userId === 'u_sales1');
  assert.equal(row?.areaM2, 480);
  assert.ok((row?.projectCount || 0) > 0);
  assert.ok((result.detail?.projects.length || 0) > 0);
  assert.equal(result.detail?.projects[0]?.name, 'Морозова Е.');
  assert.equal(result.detail?.projects[0]?.areaM2, 480);
});

test('сохранённая история со старыми id и ролями сходится с плиткой', () => {
  const directory = [
    { id: 'u_partner1', login: 'partner1', displayName: 'Владелец', role: 'owner', orgId: 'org_demo' },
    { id: 'u_sales1', login: 'sales1', displayName: 'Менеджер', role: 'sales', orgId: 'org_demo' },
    { id: 'u_sales2', login: 'sales2', displayName: 'Другой менеджер', role: 'sales', orgId: 'org_demo' },
    { id: 'u_exec1', login: 'exec1', displayName: 'Замерщик', role: 'measurer', orgId: 'org_demo' },
    { id: 'u_crew1', login: 'crew1', displayName: 'Монтажник', role: 'crew', orgId: 'org_demo' },
  ];
  const saved = [
    event({
      id: 'legacy-measurer',
      orgId: 'org_demo',
      userId: 'u_measurer1',
      login: 'exec1',
      role: 'executor',
      object: { areaM2: 22, panels: 8, projectId: 'proj-legacy', label: 'Кухня' },
    }),
    event({
      id: 'legacy-sales',
      orgId: 'org_demo',
      userId: 'u_sales_old',
      login: 'sales1',
      role: 'manager',
      tool: 'calculator',
      action: 'calc_done',
      object: { areaM2: 14, panels: 5, projectId: 'proj-legacy' },
    }),
    event({
      id: 'legacy-crew',
      orgId: 'org_demo',
      userId: 'u_installer_old',
      login: 'crew1',
      role: 'installer',
      object: { areaM2: 6, panels: 99 },
    }),
    event({
      id: 'legacy-owner',
      orgId: 'org_demo',
      userId: 'u_partner1',
      login: 'partner1',
      role: 'owner',
      object: { areaM2: 100, panels: 40 },
    }),
    event({
      id: 'legacy-other-sales',
      orgId: 'org_demo',
      userId: 'u_sales_foreign',
      login: 'sales2',
      role: 'manager',
      object: { areaM2: 9, panels: 3 },
    }),
  ];
  const result = buildStaffDrill({
    viewer: { id: 'u_partner1', role: 'owner', orgId: 'org_demo' },
    users: directory,
    events: saved,
    objects: [
      {
        id: 'mounted',
        orgId: 'org_demo',
        status: 'install',
        assignedTo: 'u_crew1',
        updatedAt: now,
        room: { areaM2: 24 },
        estimate: { panels: 16 },
        projectId: 'proj-legacy',
      },
    ],
    projects: [{ id: 'proj-legacy', name: 'Кухня на Арбате', orgId: 'org_demo' }],
    metric: 'area',
    period: 'month',
    orgId: 'org_demo',
    now,
    demoFill: false,
  });
  assert.deepEqual(result.roles.map((role) => role.id), ['sales', 'measurer', 'crew']);
  assert.equal(result.roles.map((role) => role.label).join(','), 'Менеджеры,Замерщики,Монтажники');
  assert.equal(result.ranking.some((row) => row.userId === 'u_partner1' || row.userId === 'u_measurer1'), false);
  assert.equal(result.ranking.find((row) => row.userId === 'u_exec1')?.areaM2, 22);
  assert.equal(result.ranking.find((row) => row.userId === 'u_sales1')?.areaM2, 14);
  assert.equal(result.ranking.find((row) => row.userId === 'u_crew1')?.areaM2, 6);
  const dash = aggregateAnalyticsDashboard(withoutOwner(saved) as AnalyticsEvent[], {
    source: 'local',
    from: result.from,
    to: result.to,
    orgId: 'org_demo',
  });
  assert.equal(displayedSum(result.ranking, 'areaM2'), dash.kpi.areaM2);
  const sales = buildStaffDrill({
    viewer: { id: 'u_sales1', role: 'sales', orgId: 'org_demo' },
    users: directory,
    events: saved,
    objects: [],
    projects: [{ id: 'proj-legacy', name: 'Кухня на Арбате', orgId: 'org_demo' }],
    metric: 'area',
    period: 'month',
    userId: 'u_sales1',
    orgId: 'org_demo',
    now,
    demoFill: false,
  });
  assert.equal(sales.scope, 'team');
  assert.deepEqual(sales.ranking.map((row) => row.userId).sort(), ['u_crew1', 'u_exec1', 'u_sales1']);
  assert.equal(sales.detail?.projects.some((project) => project.name === 'Кухня на Арбате'), true);
  const panels = buildStaffDrill({
    viewer: { id: 'u_partner1', role: 'owner', orgId: 'org_demo' },
    users: directory,
    events: saved,
    objects: [
      {
        id: 'mounted',
        orgId: 'org_demo',
        status: 'install',
        assignedTo: 'u_crew1',
        updatedAt: now,
        room: { areaM2: 24 },
        estimate: { panels: 16 },
      },
    ],
    projects: [],
    metric: 'panels',
    period: 'month',
    orgId: 'org_demo',
    now,
    demoFill: false,
  });
  const crew = panels.roles.find((role) => role.id === 'crew')?.ranking[0];
  assert.equal(crew?.value, crew?.mountedPanels);
  assert.ok(crew && crew.value >= 16);
  assert.notEqual(crew?.value, 99);
});

test('старые id и роли: монтажники не нули, топ проектов открывается', () => {
  assert.equal(normalizeRole('manager'), 'sales');
  assert.equal(normalizeRole('installer'), 'crew');
  assert.equal(normalizeRole('executor'), 'measurer');
  const directory = [
    { id: 'u_partner1', login: 'partner1', displayName: 'Владелец', role: 'owner', orgId: 'org_demo' },
    { id: 'u_fresh_sales', login: 'sales1', displayName: 'Менеджер', role: 'manager', orgId: 'org_demo' },
    { id: 'u_fresh_exec', login: 'exec1', displayName: 'Замерщик', role: 'executor', orgId: 'org_demo' },
    { id: 'u_fresh_crew', login: 'crew1', displayName: 'Монтажник', role: 'installer', orgId: 'org_demo' },
    { id: 'u_fresh_crew_b', login: 'crew1b', displayName: 'Монтажник 2', role: 'installer', orgId: 'org_demo' },
  ];
  const room = {
    id: 'room_click',
    orgId: 'org_demo',
    projectId: 'room_click',
    clientName: 'Старая гостиная',
    roomName: 'Гостиная',
    status: 'quote_sent',
    assignedTo: 'u_measurer1',
    createdBy: 'u_sales_old',
    updatedAt: now,
    room: { areaM2: 18, roomType: 'living' },
    estimate: { panels: 44 },
  };
  const install = {
    id: 'room_mount',
    orgId: 'org_demo',
    status: 'install',
    assignedTo: 'u_crew1',
    createdBy: 'u_partner1',
    updatedAt: now,
    clientName: 'Смонтированная',
    room: { areaM2: 22 },
    estimate: { panels: 54 },
  };
  function at(days: number) {
    return new Date(Date.parse(now) - days * 24 * 60 * 60 * 1000).toISOString();
  }
  const installOld = {
    ...install,
    id: 'room_mount_old',
    assignedTo: 'u_crew1',
    updatedAt: at(120),
    clientName: 'Старый монтаж',
    room: { areaM2: 14 },
    estimate: { panels: 30 },
  };
  const installSecond = {
    ...install,
    id: 'room_mount_b',
    assignedTo: 'u_crew1b',
    clientName: 'Вторая бригада',
    room: { areaM2: 9 },
    estimate: { panels: 12 },
  };
  const saved = [1, 40, 200].map((day) => ({
    at: at(day),
    orgId: 'org_demo',
    userId: 'u_sales_old',
    login: 'sales1',
    role: 'manager',
    tool: 'calculator',
    action: 'calc_done',
    object: { areaM2: 100 + day, panels: 40, clientName: 'Старая гостиная' },
  }));
  function run(period: 'month' | 'quarter' | 'year', metric: string) {
    return buildStaffDrill({
      viewer: { id: 'u_partner1', role: 'owner', orgId: 'org_demo' },
      users: directory,
      events: saved,
      objects: [room, install, installSecond, installOld],
      projects: [],
      metric,
      period,
      userId: 'u_fresh_sales',
      orgId: 'org_demo',
      now,
      demoFill: false,
    });
  }
  const areas = (['month', 'quarter', 'year'] as const).map((period) => run(period, 'area'));
  const managerAreas = areas.map((result) => result.ranking.find((row) => row.userId === 'u_fresh_sales')?.areaM2 || 0);
  assert.ok(managerAreas[1] > managerAreas[0]);
  assert.ok(managerAreas[2] > managerAreas[1]);
  for (const result of areas) {
    const manager = result.ranking.find((row) => row.userId === 'u_fresh_sales');
    assert.ok((manager?.projectCount || 0) > 0);
    assert.ok((result.detail?.projects.length || 0) > 0);
    const opened = result.detail?.projects.find((project) => project.roomId === 'room_click');
    assert.equal(opened?.name, 'Старая гостиная');
  }
  const mounted = (['month', 'quarter', 'year'] as const).map((period) => {
    const crew = run(period, 'panels').roles.find((role) => role.id === 'crew')?.ranking || [];
    assert.equal(crew.length, 2, period);
    for (const row of crew) {
      assert.ok(row.mountedPanels > 0, `${row.displayName} ${period}`);
      assert.ok(row.mountedRooms > 0);
      assert.equal(row.value, row.mountedPanels);
    }
    return crew.reduce((sum, row) => sum + row.value, 0);
  });
  assert.ok(mounted[2] > mounted[0]);
});

test('доска проектов: 11 комнат считаются монтажом и проектами менеджера', () => {
  const directory = buildLocalDemoUsers().map((user) => ({
    ...user,
    id: `fresh_${user.login}`,
    role: user.role === 'sales' ? 'manager' : user.role === 'measurer' ? 'executor' : user.role === 'crew' ? 'installer' : user.role,
  }));
  const sales = directory.find((user) => user.login === 'sales1');
  const owner = directory.find((user) => user.login === 'partner1');
  if (!sales || !owner) throw new Error('в демо нет менеджера или владельца');
  const salesId = sales.id;
  const ownerId = owner.id;
  const wiped = buildLocalDemoObjects().map((object) => ({
    ...object,
    assignedTo: null,
    createdBy: 'missing',
  }));
  const linked = buildLocalDemoObjects();
  function run(
    objects: ReturnType<typeof buildLocalDemoObjects>,
    period: 'month' | 'quarter' | 'year',
  ): ReturnType<typeof buildStaffDrill> {
    return buildStaffDrill({
      viewer: { id: ownerId, role: 'owner', orgId: 'org_demo' },
      users: directory,
      events: [
        {
          at: now,
          orgId: 'org_demo',
          userId: 'u_sales_old',
          login: 'sales1',
          role: 'sales',
          tool: 'calculator',
          action: 'calc_done',
          object: { areaM2: 4, panels: 1 },
        },
      ],
      objects,
      projects: [],
      metric: 'panels',
      period,
      userId: salesId,
      orgId: 'org_demo',
      now,
      demoFill: false,
    });
  }
  for (const objects of [wiped, linked]) {
    for (const period of ['month', 'quarter', 'year'] as const) {
      const result = run(objects, period);
      const crew = result.roles.find((role) => role.id === 'crew')?.ranking || [];
      assert.equal(crew.length, 2, period);
      for (const row of crew) {
        assert.ok(row.mountedRooms > 0, `${row.displayName} ${period}`);
        assert.ok(row.mountedPanels > 0, `${row.displayName} ${period}`);
        assert.equal(row.value, row.mountedPanels);
      }
      const salesRow = result.ranking.find((row) => row.userId === salesId);
      assert.equal(salesRow?.projectCount, 11, period);
      assert.ok((result.detail?.projects.length || 0) > 0);
      assert.ok(result.detail?.projects.every((project) => project.roomId));
      assert.equal(
        result.detail?.projects.some((project) => project.name === 'Иванова А.'),
        true,
      );
    }
  }
  const byName = new Map(
    (run(linked, 'month').roles.find((role) => role.id === 'crew')?.ranking || []).map((row) => [row.displayName, row.mountedRooms]),
  );
  assert.equal(byName.get('Монтажник · Потолки Столицы'), 3);
  assert.equal(byName.get('Монтажник 2 · Потолки Столицы'), 1);
});

test('старые комнаты без projectId и assignedTo: бригада, отметка и группировка доски', () => {
  const at = Date.parse(now);
  const directory = [
    { id: 'fresh_owner', login: 'partner1', displayName: 'Владелец', role: 'owner', orgId: 'org_demo' },
    { id: 'fresh_sales', login: 'sales1', displayName: 'Менеджер', role: 'manager', orgId: 'org_demo' },
    { id: 'fresh_sales_old', login: 'sales_old', displayName: 'Старый менеджер', role: 'sales', orgId: 'org_demo' },
    { id: 'fresh_crew', login: 'crew1', displayName: 'Монтажник', role: 'installer', orgId: 'org_demo' },
    { id: 'fresh_crew_b', login: 'crew1b', displayName: 'Монтажник 2', role: 'installer', orgId: 'org_demo' },
  ];
  const objects = [
    {
      id: 'legacy_a',
      orgId: 'org_demo',
      projectId: 'old_flat',
      clientName: 'Старая квартира',
      areaM2: 22,
      panels: 40,
      updatedAt: at,
      history: [
        { at, action: 'assign', detail: 'u_crew1b' },
        { at, action: 'status', detail: 'смонтировано', login: 'partner1', userId: 'fresh_owner' },
      ],
    },
    {
      id: 'legacy_a2',
      orgId: 'org_demo',
      projectId: 'old_flat',
      clientName: 'Старая квартира',
      roomName: 'Спальня',
      areaM2: 8,
      panels: 5,
      history: [{ at, action: 'status', detail: 'install', login: 'crew1b', userId: 'missing-crew' }],
    },
    {
      id: 'legacy_b',
      orgId: 'org_demo',
      clientName: 'Вторая',
      areaM2: 10,
      panels: 12,
      history: [{ at, action: 'status', detail: 'смонтировано', login: 'crew1', userId: 'missing-id' }],
    },
  ];
  const result = buildStaffDrill({
    viewer: { id: 'fresh_owner', role: 'owner', orgId: 'org_demo' },
    users: directory,
    events: [
      {
        at: now,
        orgId: 'org_demo',
        userId: 'u_sales_old',
        login: 'sales1',
        role: 'manager',
        tool: 'calculator',
        action: 'calc_done',
        object: { areaM2: 30, panels: 4 },
      },
    ],
    objects,
    projects: [],
    metric: 'panels',
    period: 'month',
    userId: 'fresh_sales',
    orgId: 'org_demo',
    now,
    demoFill: false,
  });
  const crew = result.roles.find((role) => role.id === 'crew')?.ranking || [];
  const byName = new Map(crew.map((row) => [row.displayName, row]));
  assert.equal(byName.get('Монтажник')?.mountedRooms, 1);
  assert.equal(byName.get('Монтажник')?.mountedPanels, 12);
  assert.equal(byName.get('Монтажник 2')?.mountedRooms, 2);
  assert.equal(byName.get('Монтажник 2')?.mountedPanels, 45);
  for (const row of result.ranking.filter((item) => item.role === 'sales')) {
    assert.equal(row.projectCount, 2);
  }
  const flat = result.detail?.projects.find((project) => project.name === 'Старая квартира');
  assert.equal(flat?.rooms, 2);
  assert.equal(flat?.roomId, 'legacy_a');
  assert.equal(flat?.areaM2, 30);
  const second = result.detail?.projects.find((project) => project.roomId === 'legacy_b');
  assert.equal(second?.name, 'Вторая');
});
