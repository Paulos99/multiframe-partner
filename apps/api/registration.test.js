import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, describe } from 'node:test';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-registration-'));
process.env.PLATFORM_FILE = path.join(dir, 'platform.json');
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'registration-local-test';
process.env.REGISTER_IP_LIMIT = '3';

const { handler } = await import('./index.js');
const { resetRateLimitsForTests } = await import('./security.js');
const { decideRegistration, publicRegistration, registrationStatus, rejectionMessage } = await import('./registration.js');

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function call(method, urlPath, { token, body, ip = '10.0.0.1' } = {}) {
  return handler({
    httpMethod: method,
    path: urlPath,
    headers: { 'x-forwarded-for': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const read = (response) => JSON.parse(response.body || '{}');

function form(overrides = {}) {
  return {
    firstName: 'Ирина',
    lastName: 'Соколова',
    companyName: 'Потолки Юга',
    city: 'Москва',
    login: 'irina.yug',
    password: 'Ceiling-2026',
    passwordRepeat: 'Ceiling-2026',
    website: '',
    ...overrides,
  };
}

async function login(loginName, password, ip = '10.9.9.9') {
  return call('POST', '/auth/login', { body: { login: loginName, password }, ip });
}

describe('помощники заявки', () => {
  test('статус, причина и решение', () => {
    assert.equal(registrationStatus({}), null);
    assert.equal(registrationStatus({ registration: { status: 'odd' } }), null);
    assert.equal(registrationStatus({ registration: { status: 'pending' } }), 'pending');
    const rejected = decideRegistration({ status: 'pending', firstName: 'А' }, { status: 'rejected', reason: 'Дубль', by: 'u', at: 't' });
    assert.equal(rejected.firstName, 'А');
    assert.equal(rejected.reason, 'Дубль');
    const approved = decideRegistration(rejected, { status: 'approved', by: 'u', at: 't2' });
    assert.equal(approved.reason, undefined);
    assert.deepEqual(publicRegistration({ registration: rejected }), { status: 'rejected', reason: 'Дубль' });
    assert.match(rejectionMessage({ registration: rejected }), /Причина: Дубль/);
    assert.match(rejectionMessage({ registration: { status: 'rejected' } }), /отклонена/);
  });
});

describe('самостоятельная регистрация владельца', { concurrency: false }, () => {
  let ownerToken = '';
  let ownerId = '';
  let adminToken = '';

  test('регистрация создаёт кабинет «на проверке» и сразу пускает владельца', async () => {
    resetRateLimitsForTests();
    const res = await call('POST', '/auth/register', { body: form() });
    assert.equal(res.statusCode, 200, res.body);
    const body = read(res);
    assert.ok(body.token);
    assert.equal(body.user.role, 'owner');
    assert.equal(body.user.displayName, 'Ирина Соколова');
    assert.equal(body.user.org.companyName, 'Потолки Юга');
    assert.match(body.user.org.city, /^Москва/);
    assert.deepEqual(body.user.registration, { status: 'pending' });
    ownerToken = body.token;
    ownerId = body.user.id;

    const me = await call('GET', '/auth/me', { token: ownerToken });
    assert.equal(me.statusCode, 200);
    assert.equal(read(me).user.registration.status, 'pending');

    // Работает сразу: создаёт сотрудника-менеджера.
    const staff = await call('POST', '/org/staff', { token: ownerToken, body: { displayName: 'Пётр Менеджеров', role: 'sales', login: 'petr.yug', password: 'Manager-2026' } });
    assert.equal(staff.statusCode, 200, staff.body);

    const again = await login('irina.yug', 'Ceiling-2026');
    assert.equal(again.statusCode, 200);
  });

  test('занятый логин — понятная ошибка 409, без учёта регистра', async () => {
    resetRateLimitsForTests();
    const res = await call('POST', '/auth/register', { body: form({ login: 'IRINA.yug' }) });
    assert.equal(res.statusCode, 409);
    assert.match(read(res).message, /логин уже занят/);
    const demo = await call('POST', '/auth/register', { body: form({ login: 'partner1' }) });
    assert.equal(demo.statusCode, 409);
  });

  test('проверки полей: обязательные, пароль, повтор, пробелы в логине, город', async () => {
    resetRateLimitsForTests();
    const cases = [
      [{ firstName: '' }, /имя/],
      [{ lastName: ' ' }, /фамилию/],
      [{ companyName: '' }, /компании/],
      [{ city: '' }, /город/],
      [{ login: '' }, /логин/],
      [{ login: 'два слова' }, /пробелов/],
      [{ password: 'short', passwordRepeat: 'short' }, /не короче 8/],
      [{ passwordRepeat: 'Ceiling-2027' }, /не совпадают/],
      [{ password: ' Ceiling-2026', passwordRepeat: ' Ceiling-2026' }, /пробелом/],
      [{ city: 'Несуществующийгородок' }, /./],
    ];
    for (const [patch, pattern] of cases) {
      const res = await call('POST', '/auth/register', { body: form({ login: `x${Math.random()}`.replace('.', ''), ...patch }), ip: '10.0.0.2' });
      assert.equal(res.statusCode, 400, `${JSON.stringify(patch)} → ${res.body}`);
      assert.match(read(res).message, pattern);
    }
  });

  test('поле-ловушка заполнено — кабинет не создаётся', async () => {
    resetRateLimitsForTests();
    const res = await call('POST', '/auth/register', { body: form({ login: 'bot.spam', website: 'http://spam' }), ip: '10.0.0.3' });
    assert.equal(res.statusCode, 400);
    const loginBot = await login('bot.spam', 'Ceiling-2026');
    assert.equal(loginBot.statusCode, 401);
  });

  test('ограничение частоты по адресу', async () => {
    resetRateLimitsForTests();
    for (let i = 0; i < 3; i += 1) {
      const ok = await call('POST', '/auth/register', { body: form({ login: `rate.${i}` }), ip: '10.0.0.4' });
      assert.equal(ok.statusCode, 200, ok.body);
    }
    const blocked = await call('POST', '/auth/register', { body: form({ login: 'rate.4' }), ip: '10.0.0.4' });
    assert.equal(blocked.statusCode, 429);
    assert.ok(blocked.headers['Retry-After']);
    const other = await call('POST', '/auth/register', { body: form({ login: 'rate.other' }), ip: '10.0.0.5' });
    assert.equal(other.statusCode, 200);
  });

  test('админ видит заявку; подтвердить и отклонить может только админ', async () => {
    const adm = await login('admin', 'admin1234');
    adminToken = read(adm).token;
    const list = read(await call('GET', '/admin/partners', { token: adminToken })).partners;
    const row = list.find((p) => p.user.id === ownerId);
    assert.equal(row.org.registration.status, 'pending');
    assert.equal(row.org.registration.firstName, 'Ирина');
    assert.ok(row.org.registration.submittedAt);

    const denied = await call('POST', `/admin/partners/${ownerId}/approve`, { token: ownerToken });
    assert.equal(denied.statusCode, 403);

    const legacy = list.find((p) => p.user.login === 'partner1');
    const noRequest = await call('POST', `/admin/partners/${legacy.user.id}/approve`, { token: adminToken });
    assert.equal(noRequest.statusCode, 409);
  });

  test('отклонение закрывает вход владельцу и сотрудникам с причиной; повторное подтверждение открывает', async () => {
    const rejected = await call('POST', `/admin/partners/${ownerId}/reject`, { token: adminToken, body: { reason: 'Компания не работает с MultiFrame' } });
    assert.equal(rejected.statusCode, 200, rejected.body);
    assert.equal(read(rejected).registration.status, 'rejected');

    const me = await call('GET', '/auth/me', { token: ownerToken });
    assert.equal(me.statusCode, 403);
    assert.equal(read(me).code, 'registration_rejected');

    const owner = await login('irina.yug', 'Ceiling-2026');
    assert.equal(owner.statusCode, 403);
    assert.equal(read(owner).code, 'registration_rejected');
    assert.match(read(owner).message, /Причина: Компания не работает с MultiFrame/);

    const staff = await login('petr.yug', 'Manager-2026');
    assert.equal(staff.statusCode, 403);

    // Неверный пароль не раскрывает статус заявки.
    const wrong = await login('irina.yug', 'wrong-password');
    assert.equal(wrong.statusCode, 401);

    const approved = await call('POST', `/admin/partners/${ownerId}/approve`, { token: adminToken });
    assert.equal(approved.statusCode, 200);
    const back = await login('irina.yug', 'Ceiling-2026');
    assert.equal(back.statusCode, 200);
    assert.equal(read(back).user.registration.status, 'approved');
    assert.equal(read(back).user.registration.reason, undefined);
  });
});
