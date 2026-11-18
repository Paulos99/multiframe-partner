import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, describe } from 'node:test';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-staff-join-'));
process.env.PLATFORM_FILE = path.join(dir, 'platform.json');
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'staff-join-local-test';
process.env.REGISTER_IP_LIMIT = '8';
process.env.DEMO_SEED = '1';

const { handler } = await import('./index.js');
const { resetRateLimitsForTests } = await import('./security.js');
const {
  COMPANY_SEARCH_MIN,
  blockedJoinOf,
  canDecideStaffJoin,
  decideStaffJoin,
  hasPendingJoin,
  isSearchableCompany,
  joinAccessError,
  newStaffJoin,
  orgDisplayName,
  publicStaffJoin,
  searchCompanies,
} = await import('./staffJoin.js');

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function call(method, urlPath, { token, body, ip = '10.2.2.2', query } = {}) {
  const qs = query ? new URLSearchParams(query).toString() : '';
  return handler({
    httpMethod: method,
    path: urlPath,
    queryStringParameters: query || undefined,
    headers: { 'x-forwarded-for': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    url: qs ? `${urlPath}?${qs}` : urlPath,
  });
}

const read = (response) => JSON.parse(response.body || '{}');

function staffForm(overrides = {}) {
  return {
    firstName: 'Павел',
    lastName: 'Замеров',
    orgId: 'org_demo',
    role: 'measurer',
    login: 'pavel.measure',
    password: 'Staff-Join-2026',
    passwordRepeat: 'Staff-Join-2026',
    phone: '+7 900 111-22-33',
    website: '',
    ...overrides,
  };
}

async function login(loginName, password, ip = '10.8.8.8') {
  return call('POST', '/auth/login', { body: { login: loginName, password }, ip });
}

describe('помощники поиска и заявки', () => {
  const orgs = [
    { id: 'org_demo', settings: { companyName: 'Потолки Столицы' } },
    { id: 'org_demo_spb', settings: { companyName: 'Северный Потолок' } },
    { id: 'org_stp', settings: { companyName: 'StP' } },
    { id: 'org_rej', settings: { companyName: 'Отклонённые Люстры' }, registration: { status: 'rejected' } },
    { id: 'org_empty', settings: { companyName: '  ' } },
  ];

  test('поиск по подстроке, без полной выдачи, скрывает StP и отклонённые', () => {
    assert.deepEqual(searchCompanies(orgs, 'п'), []);
    const hits = searchCompanies(orgs, 'пот');
    assert.deepEqual(
      hits.map((row) => row.name),
      ['Потолки Столицы', 'Северный Потолок'],
    );
    assert.equal(hits[0].id, 'org_demo');
    assert.deepEqual(Object.keys(hits[0]).sort(), ['id', 'name']);
    assert.equal(searchCompanies(orgs, 'люстр').length, 0);
    assert.equal(searchCompanies(orgs, 'stp').length, 0);
    assert.equal(isSearchableCompany(orgs[2]), false);
    assert.equal(orgDisplayName(orgs[0]), 'Потолки Столицы');
    assert.ok(COMPANY_SEARCH_MIN >= 2);
  });

  test('название, начинающееся с запроса, выше частичного совпадения', () => {
    const more = [
      { id: 'a', settings: { companyName: 'Арт Потолок' } },
      { id: 'b', settings: { companyName: 'Потолок Юга' } },
    ];
    assert.deepEqual(
      searchCompanies(more, 'потолок').map((row) => row.name),
      ['Потолок Юга', 'Арт Потолок'],
    );
  });

  test('публичное представление и ошибка доступа', () => {
    const pending = newStaffJoin({
      id: 'sjr_1',
      userId: 'u_1',
      orgId: 'org_demo',
      role: 'crew',
      firstName: 'А',
      lastName: 'Б',
      displayName: 'А Б',
      login: 'ab',
      at: 't1',
    });
    assert.deepEqual(publicStaffJoin(pending, orgs[0]), {
      status: 'pending',
      role: 'crew',
      companyName: 'Потолки Столицы',
    });
    const rejected = decideStaffJoin(pending, { status: 'rejected', reason: 'Не из компании', by: 'u', at: 't2' });
    assert.equal(publicStaffJoin(rejected, orgs[0]).reason, 'Не из компании');
    assert.equal(joinAccessError(pending).code, 'join_pending');
    assert.match(joinAccessError(rejected).message, /Не из компании/);
    const approved = decideStaffJoin(pending, { status: 'approved', role: 'sales', by: 'u', at: 't3' });
    assert.equal(publicStaffJoin(approved, orgs[0]), null);
    assert.equal(canDecideStaffJoin({ role: 'sales', orgId: 'org_demo' }, pending), true);
    assert.equal(canDecideStaffJoin({ role: 'sales', orgId: 'org_other' }, pending), false);
    assert.equal(canDecideStaffJoin({ role: 'crew', orgId: 'org_demo' }, pending), false);
    const platform = { staffJoinRequests: [pending] };
    assert.equal(hasPendingJoin(platform, { login: 'AB' }), true);
    assert.ok(blockedJoinOf(platform, { id: 'u_1', orgId: null }));
    assert.equal(blockedJoinOf(platform, { id: 'u_1', orgId: 'org_demo' }), null);
  });
});

describe('регистрация сотрудника и одобрение', { concurrency: false }, () => {
  let staffToken = '';
  let staffId = '';
  let requestId = '';
  let ownerToken = '';
  let salesToken = '';
  let foreignSales = '';

  test('поиск компаний требует две буквы и отдаёт только id и название', async () => {
    resetRateLimitsForTests();
    const short = await call('GET', '/auth/companies', { query: { q: 'п' } });
    assert.equal(short.statusCode, 400, short.body);
    const found = await call('GET', '/auth/companies', { query: { q: 'потолки' } });
    assert.equal(found.statusCode, 200, found.body);
    const rows = read(found).companies;
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length >= 1);
    assert.ok(rows.every((row) => row.id && row.name && Object.keys(row).length === 2));
    assert.ok(rows.some((row) => row.name === 'Потолки Столицы' && row.id === 'org_demo'));
    assert.equal(rows.some((row) => /stp/i.test(row.name) && row.id === 'org_stp'), false);
    const miss = await call('GET', '/auth/companies', { query: { q: 'неттакойфирмыzzz' } });
    assert.equal(miss.statusCode, 200);
    assert.deepEqual(read(miss).companies, []);
  });

  test('заявка создаёт учётку без членства в компании', async () => {
    resetRateLimitsForTests();
    const res = await call('POST', '/auth/register-staff', { body: staffForm() });
    assert.equal(res.statusCode, 200, res.body);
    const body = read(res);
    assert.ok(body.token);
    staffToken = body.token;
    staffId = body.user.id;
    assert.equal(body.user.orgId, null);
    assert.equal(body.user.org, null);
    assert.equal(body.user.staffJoin.status, 'pending');
    assert.equal(body.user.staffJoin.companyName, 'Потолки Столицы');
    assert.equal(body.user.staffJoin.role, 'measurer');
    assert.equal(body.user.role, 'measurer');
  });

  test('вход до одобрения показывает заявку на рассмотрении и не пускает в данные компании', async () => {
    const entered = await login('pavel.measure', 'Staff-Join-2026');
    assert.equal(entered.statusCode, 200, entered.body);
    const body = read(entered);
    assert.equal(body.user.staffJoin.status, 'pending');
    assert.equal(body.user.orgId, null);
    const me = await call('GET', '/auth/me', { token: body.token });
    assert.equal(me.statusCode, 200, me.body);
    assert.equal(read(me).user.staffJoin.status, 'pending');
    const staff = await call('GET', '/org/staff', { token: body.token });
    assert.equal(staff.statusCode, 403, staff.body);
    assert.equal(read(staff).code, 'join_pending');
    assert.match(read(staff).message, /на рассмотрении/);
    const objects = await call('GET', '/objects', { token: body.token });
    assert.equal(objects.statusCode, 403);
  });

  test('занятый логин и повторная заявка отклоняются', async () => {
    const taken = await call('POST', '/auth/register-staff', {
      body: staffForm({ login: 'partner1' }),
      ip: '10.2.2.3',
    });
    assert.equal(taken.statusCode, 409, taken.body);
    assert.equal(read(taken).code, 'login_taken');
    assert.match(read(taken).message, /логин уже занят/);
    const again = await call('POST', '/auth/register-staff', {
      body: staffForm({ login: 'pavel.measure' }),
      ip: '10.2.2.3',
    });
    assert.equal(again.statusCode, 409, again.body);
  });

  test('неизвестная компания и чужая роль не принимаются', async () => {
    const missing = await call('POST', '/auth/register-staff', {
      body: staffForm({ login: 'ghost.one', orgId: 'org_nope' }),
      ip: '10.2.2.4',
    });
    assert.equal(missing.statusCode, 400);
    assert.match(read(missing).message, /не зарегистрирована/i);
    const ownerRole = await call('POST', '/auth/register-staff', {
      body: staffForm({ login: 'ghost.two', role: 'owner' }),
      ip: '10.2.2.4',
    });
    assert.equal(ownerRole.statusCode, 400);
  });

  test('владелец и менеджер видят заявку, чужая компания — нет', async () => {
    ownerToken = read(await login('partner1', 'demo1234')).token;
    salesToken = read(await login('sales1', 'exec1234')).token;
    foreignSales = read(await login('sales2', 'exec1234')).token;
    const list = await call('GET', '/org/staff-join-requests', { token: ownerToken });
    assert.equal(list.statusCode, 200, list.body);
    const pending = read(list).requests.filter((row) => row.status === 'pending');
    assert.ok(pending.length >= 1);
    const mine = pending.find((row) => row.login === 'pavel.measure');
    assert.ok(mine);
    requestId = mine.id;
    assert.equal(mine.role, 'measurer');
    assert.equal(mine.displayName, 'Павел Замеров');
    const asSales = await call('GET', '/org/staff-join-requests', { token: salesToken });
    assert.ok(read(asSales).requests.some((row) => row.id === requestId));
    const foreign = await call('GET', '/org/staff-join-requests', { token: foreignSales });
    assert.equal(foreign.statusCode, 200);
    assert.equal(read(foreign).requests.some((row) => row.id === requestId), false);
  });

  test('чужая компания не может одобрить, замерщик не видит заявки', async () => {
    const stolen = await call('POST', `/org/staff-join-requests/${requestId}/approve`, { token: foreignSales });
    assert.equal(stolen.statusCode, 404, stolen.body);
    const measurer = read(await login('exec1', 'exec1234')).token;
    const list = await call('GET', '/org/staff-join-requests', { token: measurer });
    assert.equal(list.statusCode, 403);
  });

  test('одобрение добавляет в компанию с выбранной ролью', async () => {
    const approved = await call('POST', `/org/staff-join-requests/${requestId}/approve`, {
      token: ownerToken,
      body: { role: 'crew' },
    });
    assert.equal(approved.statusCode, 200, approved.body);
    assert.equal(read(approved).request.status, 'approved');
    assert.equal(read(approved).request.role, 'crew');
    const entered = await login('pavel.measure', 'Staff-Join-2026');
    assert.equal(entered.statusCode, 200, entered.body);
    const user = read(entered).user;
    assert.equal(user.orgId, 'org_demo');
    assert.equal(user.role, 'crew');
    assert.equal(user.staffJoin, undefined);
    assert.equal(user.org.companyName, 'Потолки Столицы');
    const objects = await call('GET', '/objects', { token: read(entered).token });
    assert.equal(objects.statusCode, 200, objects.body);
    const again = await call('POST', `/org/staff-join-requests/${requestId}/approve`, { token: ownerToken });
    assert.equal(again.statusCode, 409);
  });

  test('отклонение не добавляет в компанию, повторная заявка возможна', async () => {
    resetRateLimitsForTests();
    const created = await call('POST', '/auth/register-staff', {
      body: staffForm({ login: 'nina.sales', role: 'sales', firstName: 'Нина', lastName: 'Менеджерова' }),
      ip: '10.2.2.6',
    });
    assert.equal(created.statusCode, 200, created.body);
    const token = read(created).token;
    const list = read(await call('GET', '/org/staff-join-requests', { token: ownerToken }));
    const row = list.requests.find((item) => item.login === 'nina.sales' && item.status === 'pending');
    assert.ok(row);
    const rejected = await call('POST', `/org/staff-join-requests/${row.id}/reject`, {
      token: salesToken,
      body: { reason: 'Не из этой бригады' },
    });
    assert.equal(rejected.statusCode, 200, rejected.body);
    const entered = await login('nina.sales', 'Staff-Join-2026');
    assert.equal(entered.statusCode, 200);
    const user = read(entered).user;
    assert.equal(user.orgId, null);
    assert.equal(user.staffJoin.status, 'rejected');
    assert.match(user.staffJoin.reason, /бригады/);
    const forbidden = await call('GET', '/objects', { token: read(entered).token });
    assert.equal(forbidden.statusCode, 403);
    assert.equal(read(forbidden).code, 'join_rejected');
    const retry = await call('POST', '/me/staff-join', {
      token,
      body: { orgId: 'org_demo_spb', role: 'crew' },
    });
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal(read(retry).user.staffJoin.status, 'pending');
    assert.equal(read(retry).user.staffJoin.companyName, 'Северный Потолок');
    assert.equal(read(retry).user.staffJoin.role, 'crew');
    const pendingAgain = await call('POST', '/me/staff-join', {
      token,
      body: { orgId: 'org_demo', role: 'crew' },
    });
    assert.equal(pendingAgain.statusCode, 409);
  });

  test('менеджер может одобрить заявку другого менеджера', async () => {
    resetRateLimitsForTests();
    const created = await call('POST', '/auth/register-staff', {
      body: staffForm({ login: 'second.mgr', role: 'sales', firstName: 'Олег', lastName: 'Второй' }),
      ip: '10.2.2.7',
    });
    assert.equal(created.statusCode, 200, created.body);
    const list = read(await call('GET', '/org/staff-join-requests', { token: salesToken }));
    const row = list.requests.find((item) => item.login === 'second.mgr' && item.status === 'pending');
    assert.ok(row);
    const approved = await call('POST', `/org/staff-join-requests/${row.id}/approve`, { token: salesToken });
    assert.equal(approved.statusCode, 200, approved.body);
    const entered = read(await login('second.mgr', 'Staff-Join-2026')).user;
    assert.equal(entered.role, 'sales');
    assert.equal(entered.orgId, 'org_demo');
  });
});
