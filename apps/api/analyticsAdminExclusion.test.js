import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-analytics-admin-'));
process.env.PLATFORM_FILE = path.join(dir, 'platform.json');
process.env.JWT_SECRET = 'analytics-admin-exclusion-test-only';
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
const adminPassword = 'admin-exclusion-test';
writeFileSync(
  process.env.PLATFORM_FILE,
  JSON.stringify({
    users: [
      {
        id: 'u_stp_admin',
        login: 'stp.admin',
        role: 'admin',
        orgId: 'org_stp',
        displayName: 'Администратор StP',
        passwordHash: bcrypt.hashSync(adminPassword, 4),
      },
      { id: 'u_owner_a', login: 'owner.a', role: 'owner', orgId: 'org_a', displayName: 'Потолки А' },
    ],
    orgs: [
      { id: 'org_stp', settings: { companyName: 'StP' } },
      { id: 'org_a', settings: { companyName: 'Потолки А' } },
    ],
    objects: [],
    projects: [],
    activity: [],
  }),
);
const { handler, aggregateAnalyticsDashboard, networkAdminScope } = await import('./index.js');
const seedEvents = async (body) => {
  const { seedAnalyticsEventsForTests } = await import('./index.js');
  await seedAnalyticsEventsForTests(body.events);
  return { status: 200 };
};
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

const at = new Date().toISOString();
const partnerEvents = [
  { id: 'p-login', at, orgId: 'org_a', userId: 'u_owner_a', login: 'owner.a', role: 'owner', companyName: 'Потолки А', tool: 'cabinet', action: 'login' },
  { id: 'p-open', at, orgId: 'org_a', userId: 'u_owner_a', login: 'owner.a', role: 'owner', companyName: 'Потолки А', tool: 'problemomer', action: 'open', sessionId: 'pa' },
  { id: 'p-res', at, orgId: 'org_a', userId: 'u_owner_a', login: 'owner.a', role: 'owner', companyName: 'Потолки А', tool: 'problemomer', action: 'result', sessionId: 'pa', object: { areaM2: 10, panels: 20 } },
];
const adminEvents = [
  // Обычный вход админа: роль admin, компания «StP».
  { id: 'a-login', at, orgId: null, userId: 'u_stp_admin', login: 'stp.admin', role: 'admin', companyName: 'StP', tool: 'cabinet', action: 'login' },
  // Старое событие без роли: опознаётся по userId админа.
  { id: 'a-legacy', at, orgId: null, userId: 'u_stp_admin', login: 'stp.admin', companyName: 'Администратор StP', tool: 'problemomer', action: 'open', sessionId: 'adm' },
  // Событие организации админа: опознаётся по orgId.
  { id: 'a-org', at, orgId: 'org_stp', userId: 'someone', login: 'x', role: 'owner', companyName: 'StP', tool: 'calculator', action: 'calc_done', sessionId: 'org', object: { areaM2: 99, panels: 99 } },
];

function assertNoAdmin(dash) {
  assert.deepEqual(dash.partners.map((p) => p.companyName), ['Потолки А']);
  assert.equal(dash.kpi.activePartners, 1);
  assert.equal(dash.kpi.logins, 1);
  assert.equal(dash.kpi.calculatorDone, 0);
  assert.equal(dash.kpi.areaM2, 10);
  assert.deepEqual(dash.funnel.problemomer, { open: 1, result: 1, pdf: 0, share: 0 });
  assert.deepEqual(dash.funnel.calculator, { open: 0, calcDone: 0, pdf: 0 });
  assert.equal(dash.events.some((e) => e.role === 'admin' || e.userId === 'u_stp_admin' || e.orgId === 'org_stp'), false);
  const seriesLogins = dash.series.reduce((sum, p) => sum + p.logins, 0);
  assert.equal(seriesLogins, 1);
  for (const ex of dash.executors) assert.notEqual(ex.userId, 'u_stp_admin');
}

test('админ STP и его организация не попадают в аналитику партнёров (агрегатор)', () => {
  const scope = networkAdminScope({ users: [{ id: 'u_stp_admin', role: 'admin', orgId: 'org_stp' }, { id: 'u_owner_a', role: 'owner', orgId: 'org_a' }] });
  assert.deepEqual(scope, { adminUserIds: ['u_stp_admin'], adminOrgIds: ['org_stp'] });
  const all = [...adminEvents, ...partnerEvents].map((e) => ({ ...e, role: e.role || 'owner' }));
  assertNoAdmin(aggregateAnalyticsDashboard(all, { source: 'api', journalAll: true, ...scope }));
  // Без справочника всё равно отсекается всё с ролью admin.
  const byRole = aggregateAnalyticsDashboard(all, { source: 'api', journalAll: true });
  assert.equal(byRole.partners.some((p) => p.companyName === 'StP' && p.logins > 0), false);
});

test('GET /analytics/dashboard для админа: без «StP» и «Администратор StP», данные не удалены', async () => {
  assert.equal((await seedEvents({ events: [...adminEvents, ...partnerEvents] })).status, 200);
  const login = await call('POST', '/auth/login', { login: 'stp.admin', password: adminPassword });
  assert.equal(login.status, 200);
  const dash = await call('GET', '/analytics/dashboard', null, login.body.token, { journal: '1' });
  assert.equal(dash.status, 200);
  assertNoAdmin(dash.body);
});
