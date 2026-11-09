import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-analytics-summary-'));
process.env.PLATFORM_FILE = path.join(dir, 'platform.json');
process.env.JWT_SECRET = 'analytics-summary-route-test-only';
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
const password = 'summary-route-test';
const hash = bcrypt.hashSync(password, 4);
const DAY = 24 * 60 * 60 * 1000;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();

function room(id, orgId, status, total, refusal = null) {
  return {
    id,
    orgId,
    createdAt: ago(3),
    updatedAt: ago(1),
    createdBy: 'u_owner_a',
    assignedTo: null,
    status,
    clientName: 'Клиент',
    clientPhone: '',
    address: 'Адрес',
    city: 'Москва',
    refusal: refusal ? { reasonKey: refusal, comment: '', at: ago(1), by: 'u_owner_a' } : null,
    room: { areaM2: 20 },
    estimate: { panels: 10, dowels: 20, totalCost: total },
    clientSummary: '',
    history: [
      { at: ago(1), userId: 'u_owner_a', login: 'owner.a', action: 'status', detail: `measured→${status}` },
      { at: ago(3), userId: 'u_owner_a', login: 'owner.a', action: 'create', detail: 'measured' },
    ],
  };
}

const user = (id, login, role, orgId) => ({ id, login, role, orgId, displayName: login, passwordHash: hash });
writeFileSync(
  process.env.PLATFORM_FILE,
  JSON.stringify({
    users: [
      user('u_admin', 'stp.admin', 'admin', 'org_stp'),
      user('u_stpmgr', 'stp.mgr', 'stp_manager', 'org_stp'),
      user('u_owner_a', 'owner.a', 'owner', 'org_a'),
      user('u_sales_a', 'sales.a', 'sales', 'org_a'),
      user('u_meas_a', 'meas.a', 'measurer', 'org_a'),
      user('u_crew_a', 'crew.a', 'crew', 'org_a'),
      user('u_owner_b', 'owner.b', 'owner', 'org_b'),
    ],
    orgs: [
      { id: 'org_stp', settings: { companyName: 'StP' } },
      { id: 'org_a', settings: { companyName: 'Потолки А', city: 'Москва' } },
      { id: 'org_b', settings: { companyName: 'Потолки Б', city: 'Казань' } },
    ],
    objects: [
      room('a1', 'org_a', 'closed', 300000),
      room('a2', 'org_a', 'quote_sent', 100000),
      room('b1', 'org_b', 'closed', 999000),
      room('stp1', 'org_stp', 'closed', 5000000),
    ],
    projects: [],
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
  assert.equal(res.status, 200, `вход ${login}`);
  return res.body.token;
}

const range = { from: ago(7), to: new Date().toISOString() };

test('без входа — 401', async () => {
  const res = await call('GET', '/analytics/summary', null, null, range);
  assert.equal(res.status, 401);
});

test('замерщик, монтажник и менеджер StP — 403', async () => {
  for (const login of ['meas.a', 'crew.a', 'stp.mgr']) {
    const res = await call('GET', '/analytics/summary', null, await tokenFor(login), range);
    assert.equal(res.status, 403, login);
  }
});

test('владелец видит только свою компанию, даже если просит чужую', async () => {
  const token = await tokenFor('owner.a');
  const res = await call('GET', '/analytics/summary', null, token, { ...range, orgId: 'org_b' });
  assert.equal(res.status, 200);
  assert.equal(res.body.partners, null);
  const text = res.body.conclusions.map((c) => c.text).join('\n');
  assert.match(text, /300 000 ₽/);
  assert.doesNotMatch(text, /999 000/);
  assert.ok(res.body.previousRange);
});

test('менеджер компании получает сводку своей компании без таблицы партнёров', async () => {
  const res = await call('GET', '/analytics/summary', null, await tokenFor('sales.a'), range);
  assert.equal(res.status, 200);
  assert.equal(res.body.partners, null);
  assert.ok(res.body.conclusions.length >= 1);
});

test('админ StP: таблица партнёров без своей организации', async () => {
  const res = await call('GET', '/analytics/summary', null, await tokenFor('stp.admin'), range);
  assert.equal(res.status, 200);
  const names = res.body.partners.rows.map((r) => r.name);
  assert.deepEqual(names, ['Потолки Б', 'Потолки А']);
  assert.ok(res.body.partners.conclusions.some((c) => c.id === 'partners_leader'));
  const all = JSON.stringify(res.body);
  assert.doesNotMatch(all, /5 000 000/);
});

test('админ StP с выбранным партнёром: только он', async () => {
  const res = await call('GET', '/analytics/summary', null, await tokenFor('stp.admin'), { ...range, orgId: 'org_a' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.partners.rows.map((r) => r.name), ['Потолки А']);
});
