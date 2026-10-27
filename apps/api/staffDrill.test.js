import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { buildStaffDrill } from '../../packages/shared/staffDrill.js';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-staff-drill-'));
process.env.PLATFORM_FILE = path.join(dir, 'platform.json');
process.env.JWT_SECRET = 'staff-drill-test-only';
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
const password = 'staff-drill-password';
const hash = bcrypt.hashSync(password, 4);

function user(id, login, role, orgId, displayName) {
  return { id, login, role, orgId, displayName, passwordHash: hash };
}

writeFileSync(
  process.env.PLATFORM_FILE,
  JSON.stringify({
    users: [
      user('u_owner', 'owner.a', 'owner', 'org_a', 'Владелец'),
      user('u_sales', 'sales.a', 'sales', 'org_a', 'Менеджер'),
      user('u_sales2', 'sales.b', 'sales', 'org_a', 'Второй'),
      user('u_measurer', 'measurer.a', 'measurer', 'org_a', 'Замерщик'),
      user('u_crew', 'crew.a', 'crew', 'org_a', 'Монтажник'),
      user('u_other', 'owner.b', 'owner', 'org_b', 'Чужая'),
    ],
    orgs: [
      { id: 'org_a', settings: { companyName: 'Потолки А' } },
      { id: 'org_b', settings: { companyName: 'Потолки Б' } },
    ],
    objects: [
      {
        id: 'room1',
        orgId: 'org_a',
        projectId: 'proj1',
        createdBy: 'u_sales',
        assignedTo: 'u_measurer',
        updatedAt: new Date().toISOString(),
        room: { areaM2: 22 },
        estimate: { panels: 10 },
      },
    ],
    projects: [{ id: 'proj1', orgId: 'org_a', name: 'Квартира Ленина' }],
    activity: [],
  }),
);

const { handler } = await import('./index.js');
after(() => rmSync(dir, { recursive: true, force: true }));

async function call(method, p, body, token, query) {
  const res = await handler({
    httpMethod: method,
    path: p,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    queryStringParameters: query,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.statusCode, body: JSON.parse(res.body || '{}') };
}

async function tokenFor(login) {
  const res = await call('POST', '/auth/login', { login, password });
  assert.equal(res.status, 200, res.body.message);
  return res.body.token;
}

const at = new Date().toISOString();

test('GET /analytics/drill: владелец видит компанию, менеджер — команду, полевые роли закрыты', async () => {
  assert.equal(
    (
      await call('POST', '/analytics/events', {
        events: [
          {
            id: 'm1',
            at,
            orgId: 'org_a',
            userId: 'u_measurer',
            login: 'measurer.a',
            role: 'measurer',
            companyName: 'Потолки А',
            tool: 'problemomer',
            action: 'result',
            object: { areaM2: 10, panels: 4 },
          },
          {
            id: 's1',
            at,
            orgId: 'org_a',
            userId: 'u_sales',
            login: 'sales.a',
            role: 'sales',
            companyName: 'Потолки А',
            tool: 'calculator',
            action: 'calc_done',
            object: { areaM2: 8, panels: 3 },
          },
          {
            id: 'o1',
            at,
            orgId: 'org_a',
            userId: 'u_owner',
            login: 'owner.a',
            role: 'owner',
            companyName: 'Потолки А',
            tool: 'problemomer',
            action: 'result',
            object: { areaM2: 12, panels: 5 },
          },
          {
            id: 'b1',
            at,
            orgId: 'org_b',
            userId: 'u_other',
            login: 'owner.b',
            role: 'owner',
            companyName: 'Потолки Б',
            tool: 'problemomer',
            action: 'result',
            object: { areaM2: 50, panels: 20 },
          },
        ],
      })
    ).status,
    200,
  );

  const owner = await call('GET', '/analytics/drill', null, await tokenFor('owner.a'), {
    metric: 'problemomer',
    period: 'month',
  });
  assert.equal(owner.status, 200);
  assert.equal(owner.body.scope, 'company');
  assert.equal(owner.body.demoFilled, false);
  const measurer = owner.body.ranking.find((row) => row.userId === 'u_measurer');
  assert.equal(measurer.problemomer, 1);
  assert.equal(measurer.areaM2, 10);
  assert.ok(owner.body.ranking.some((row) => row.userId === 'u_owner'));
  assert.equal(owner.body.ranking.some((row) => row.userId === 'u_other'), false);

  const sales = await call('GET', '/analytics/drill', null, await tokenFor('sales.a'), {
    metric: 'staff',
    period: 'year',
    userId: 'u_measurer',
  });
  assert.equal(sales.status, 200);
  assert.equal(sales.body.scope, 'team');
  assert.deepEqual(
    sales.body.ranking.map((row) => row.userId).sort(),
    ['u_crew', 'u_measurer', 'u_sales'],
  );
  assert.equal(sales.body.detail.projects[0].name, 'Квартира Ленина');
  assert.equal(sales.body.detail.projects[0].roomId, 'room1');

  const hiddenOwner = await call('GET', '/analytics/drill', null, await tokenFor('sales.a'), {
    metric: 'staff',
    period: 'month',
    userId: 'u_owner',
  });
  assert.equal(hiddenOwner.body.detail, null);

  assert.equal((await call('GET', '/analytics/drill', null, await tokenFor('measurer.a'), { metric: 'staff' })).status, 403);
  assert.equal((await call('GET', '/analytics/drill', null, await tokenFor('crew.a'), { metric: 'pdf' })).status, 403);
  assert.equal((await call('GET', '/analytics/drill', null, null, { metric: 'staff' })).status, 401);
});

test('агрегат не подменяет нули, если это не демо', () => {
  const result = buildStaffDrill({
    viewer: { id: 'u_owner', role: 'owner', orgId: 'org_a' },
    users: [{ id: 'u_crew', login: 'crew.a', displayName: 'Монтажник', role: 'crew', orgId: 'org_a' }],
    events: [],
    objects: [],
    projects: [],
    metric: 'panels',
    period: 'month',
    orgId: 'org_a',
    demoFill: false,
  });
  assert.equal(result.demoFilled, false);
  assert.equal(result.ranking[0].value, 0);
  assert.equal(result.ranking[0].panels, 0);
});
