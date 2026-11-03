import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, beforeEach, describe, mock } from 'node:test';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-activation-'));
process.env.PLATFORM_FILE = path.join(dir, 'platform.json');
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'activation-local-test-secret-0123456789';
process.env.BCRYPT_COST = '10';

const { handler } = await import('./index.js');
const { resetStoredDocumentsForTests } = await import('./platformStore.js');
const { resetRateLimitsForTests, PASSWORD_MIN } = await import('./security.js');
const { PASSWORD_MIN: SHARED_MIN } = await import('../../packages/shared/passwordPolicy.js');

beforeEach(() => {
  resetRateLimitsForTests();
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Всё, что код успел напечатать: токенов и паролей здесь быть не должно. */
const printed = [];
for (const method of ['log', 'info', 'warn', 'error']) {
  mock.method(console, method, (...args) => {
    printed.push(args.map((item) => (item instanceof Error ? item.stack : String(item))).join(' '));
  });
}

function call(method, urlPath, { token, body, ip } = {}) {
  return handler({
    httpMethod: method,
    path: urlPath,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    requestContext: ip ? { identity: { sourceIp: ip } } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const read = (response) => JSON.parse(response.body || '{}');

async function login(loginName, password) {
  const response = await call('POST', '/auth/login', { body: { login: loginName, password } });
  return { status: response.statusCode, token: read(response).token };
}

function platformFile() {
  return JSON.parse(readFileSync(process.env.PLATFORM_FILE, 'utf8'));
}

function userByLogin(loginName) {
  return platformFile().users.find((user) => user.login === loginName);
}

function tokenOf(response) {
  const link = read(response).path;
  assert.match(link, /^\?activate=[a-f0-9]{64}$/);
  return link.slice('?activate='.length);
}

describe('ссылка активации', { concurrency: false }, () => {
  const tokens = {};
  let staffId;

  test('общий минимум пароля: один для сервера и экрана', () => {
    assert.equal(PASSWORD_MIN, SHARED_MIN);
  });

  test('владелец создаёт сотрудника без пароля: войти нельзя, в списке «ждёт активации»', async () => {
    resetRateLimitsForTests();
    tokens.owner = (await login('partner1', 'demo1234')).token;
    const created = await call('POST', '/org/staff', {
      token: tokens.owner,
      body: { login: 'newbie', displayName: 'Новичок', role: 'measurer' },
    });
    assert.equal(created.statusCode, 200);
    const body = read(created);
    assert.equal(body.pendingActivation, true);
    assert.equal(body.password, undefined);
    staffId = body.id;
    assert.equal(userByLogin('newbie').passwordHash, undefined);
    assert.equal((await login('newbie', '')).status, 401);
    assert.equal((await login('newbie', 'anything-long-enough')).status, 401);
    const list = read(await call('GET', '/org/staff', { token: tokens.owner })).staff;
    assert.equal(list.find((row) => row.id === staffId).pendingActivation, true);
    assert.equal(list.find((row) => row.login === 'sales1').pendingActivation, false);
  });

  test('прежнее создание с паролем работает как раньше', async () => {
    const created = await call('POST', '/org/staff', {
      token: tokens.owner,
      body: { login: 'withpass', password: 'long-enough-1', role: 'crew' },
    });
    assert.equal(created.statusCode, 200);
    assert.equal(read(created).password, 'long-enough-1');
    assert.equal((await login('withpass', 'long-enough-1')).status, 200);
    const weak = await call('POST', '/org/staff', {
      token: tokens.owner,
      body: { login: 'weakpass', password: 'short', role: 'crew' },
    });
    assert.equal(weak.statusCode, 400);
  });

  test('ссылку выдают только по правилам: чужая компания, менеджер, админ для сотрудника, неизвестный — 404', async () => {
    tokens.admin = (await login('admin', 'admin1234')).token;
    tokens.owner2 = (await login('partner2', 'demo1234')).token;
    tokens.sales = (await login('sales1', 'exec1234')).token;
    assert.equal((await call('POST', '/auth/invite', { body: { userId: staffId } })).statusCode, 401);
    for (const [token, userId] of [
      [tokens.owner2, staffId],
      [tokens.sales, staffId],
      [tokens.admin, staffId],
      [tokens.owner, 'no-such-user'],
      [tokens.owner, 'u_partner1'],
      [tokens.admin, 'u_admin'],
      [tokens.owner, undefined],
    ]) {
      const response = await call('POST', '/auth/invite', { token, body: { userId } });
      assert.equal(response.statusCode, 404, String(userId));
    }
    assert.equal(userByLogin('newbie').activation, undefined);
  });

  test('токен: 64 символа, в хранилище только sha256, срок 24 часа, новая ссылка гасит прежнюю', async () => {
    const before = Date.now();
    const first = await call('POST', '/auth/invite', { token: tokens.owner, body: { userId: staffId } });
    assert.equal(first.statusCode, 200);
    const firstToken = tokenOf(first);
    const stored = userByLogin('newbie').activation;
    assert.equal(stored.hash, createHash('sha256').update(firstToken).digest('hex'));
    assert.ok(!readFileSync(process.env.PLATFORM_FILE, 'utf8').includes(firstToken));
    const ttl = Date.parse(stored.expiresAt) - before;
    assert.ok(ttl > 24 * 3600_000 - 5000 && ttl < 24 * 3600_000 + 5000, `срок ${ttl}`);
    assert.equal(read(first).expiresAt, stored.expiresAt);

    const second = await call('POST', '/auth/invite', { token: tokens.owner, body: { userId: staffId } });
    const secondToken = tokenOf(second);
    assert.notEqual(secondToken, firstToken);
    const stale = await call('POST', '/auth/activate', { body: { token: firstToken, password: 'brand-new-pass-1' } });
    assert.equal(stale.statusCode, 400);
    assert.equal(read(stale).message, 'Ссылка недействительна или срок истёк');
    tokens.newbieLink = secondToken;
  });

  test('активация: слабый пароль не тратит ссылку, хороший задаёт пароль и стирает ссылку', async () => {
    const weak = await call('POST', '/auth/activate', { body: { token: tokens.newbieLink, password: 'short' } });
    assert.equal(weak.statusCode, 400);
    assert.match(read(weak).message, new RegExp(`${PASSWORD_MIN}`));
    assert.ok(userByLogin('newbie').activation);
    const spaced = await call('POST', '/auth/activate', { body: { token: tokens.newbieLink, password: ' leading-space-1' } });
    assert.equal(spaced.statusCode, 400);

    const ok = await call('POST', '/auth/activate', { body: { token: tokens.newbieLink, password: 'my-own-password-1' } });
    assert.equal(ok.statusCode, 200);
    assert.equal(userByLogin('newbie').activation, undefined);
    assert.ok(userByLogin('newbie').passwordHash.startsWith('$2'));
    const entered = await login('newbie', 'my-own-password-1');
    assert.equal(entered.status, 200);
    tokens.newbie = entered.token;
    const again = await call('POST', '/auth/activate', { body: { token: tokens.newbieLink, password: 'another-password-2' } });
    assert.equal(again.statusCode, 400);
    assert.equal((await login('newbie', 'another-password-2')).status, 401);
    const list = read(await call('GET', '/org/staff', { token: tokens.owner })).staff;
    assert.equal(list.find((row) => row.id === staffId).pendingActivation, false);
  });

  test('та же ссылка — сброс пароля: прежние сеансы закрываются, старый пароль не подходит', async () => {
    assert.equal((await call('GET', '/auth/me', { token: tokens.newbie })).statusCode, 200);
    const link = tokenOf(await call('POST', '/auth/invite', { token: tokens.owner, body: { userId: staffId } }));
    // Пока ссылка не использована, прежний пароль и сеанс работают.
    assert.equal((await login('newbie', 'my-own-password-1')).status, 200);
    assert.equal((await call('GET', '/auth/me', { token: tokens.newbie })).statusCode, 200);
    const done = await call('POST', '/auth/activate', { body: { token: link, password: 'reset-password-33' } });
    assert.equal(done.statusCode, 200);
    assert.equal((await call('GET', '/auth/me', { token: tokens.newbie })).statusCode, 401);
    assert.equal((await login('newbie', 'my-own-password-1')).status, 401);
    assert.equal((await login('newbie', 'reset-password-33')).status, 200);
  });

  test('срок ссылки истёк — активация не проходит', async () => {
    const link = tokenOf(await call('POST', '/auth/invite', { token: tokens.owner, body: { userId: staffId } }));
    const realNow = Date.now;
    const spy = mock.method(Date, 'now', () => realNow() + 24 * 3600_000 + 60_000);
    try {
      const late = await call('POST', '/auth/activate', { body: { token: link, password: 'too-late-password' } });
      assert.equal(late.statusCode, 400);
    } finally {
      spy.mock.restore();
    }
    assert.equal((await login('newbie', 'too-late-password')).status, 401);
  });

  test('мусор вместо токена и пустое тело отклоняются', async () => {
    for (const bad of [undefined, '', 'abc', 'x'.repeat(64), 'A'.repeat(64), 12345, null, { a: 1 }]) {
      const response = await call('POST', '/auth/activate', { body: { token: bad, password: 'valid-password-77' } });
      assert.equal(response.statusCode, 400);
    }
    assert.equal((await call('POST', '/auth/activate')).statusCode, 400);
  });

  test('отключённый пользователь не активируется и ссылку для него не выдают', async () => {
    const link = tokenOf(await call('POST', '/auth/invite', { token: tokens.owner, body: { userId: staffId } }));
    const file = platformFile();
    file.users.find((user) => user.id === staffId).loginDisabled = true;
    writeFileSync(process.env.PLATFORM_FILE, JSON.stringify(file));
    resetStoredDocumentsForTests();
    const blocked = await call('POST', '/auth/activate', { body: { token: link, password: 'disabled-pass-12' } });
    assert.equal(blocked.statusCode, 400);
    const issue = await call('POST', '/auth/invite', { token: tokens.owner, body: { userId: staffId } });
    assert.equal(issue.statusCode, 409);
    const restored = platformFile();
    delete restored.users.find((user) => user.id === staffId).loginDisabled;
    writeFileSync(process.env.PLATFORM_FILE, JSON.stringify(restored));
    resetStoredDocumentsForTests();
  });

  test('админ: владелец партнёра создаётся без пароля и входит после активации; менеджер StP — так же', async () => {
    const partner = await call('POST', '/admin/partners', {
      token: tokens.admin,
      body: { login: 'newco', companyName: 'Новая компания', city: 'Москва' },
    });
    assert.equal(partner.statusCode, 200);
    assert.equal(read(partner).pendingActivation, true);
    const ownerId = read(partner).user.id;
    const partners = read(await call('GET', '/admin/partners', { token: tokens.admin })).partners;
    assert.equal(partners.find((row) => row.user.id === ownerId).user.pendingActivation, true);
    const ownerLink = tokenOf(await call('POST', '/auth/invite', { token: tokens.admin, body: { userId: ownerId } }));
    assert.equal((await call('POST', '/auth/activate', { body: { token: ownerLink, password: 'owner-password-1' } })).statusCode, 200);
    assert.equal((await login('newco', 'owner-password-1')).status, 200);

    const manager = await call('POST', '/admin/stp-managers', { token: tokens.admin, body: { login: 'stp.link' } });
    assert.equal(manager.statusCode, 200);
    assert.equal(read(manager).pendingActivation, true);
    const managers = read(await call('GET', '/admin/stp-managers', { token: tokens.admin })).managers;
    assert.equal(managers.find((row) => row.login === 'stp.link').pendingActivation, true);
    const managerLink = tokenOf(await call('POST', '/auth/invite', { token: tokens.admin, body: { userId: read(manager).id } }));
    assert.equal((await call('POST', '/auth/activate', { body: { token: managerLink, password: 'manager-password-1' } })).statusCode, 200);
    assert.equal((await login('stp.link', 'manager-password-1')).status, 200);
  });

  test('ограничение частоты: активация — 10 попыток, выдача — 20', async () => {
    resetRateLimitsForTests();
    const codes = [];
    for (let i = 0; i < 11; i += 1) {
      const response = await call('POST', '/auth/activate', {
        ip: '203.0.113.9',
        body: { token: 'a'.repeat(64), password: 'valid-password-77' },
      });
      codes.push(response.statusCode);
    }
    assert.deepEqual(codes.slice(0, 10), Array(10).fill(400));
    assert.equal(codes[10], 429);
    // Другой адрес не задет.
    const other = await call('POST', '/auth/activate', { ip: '203.0.113.10', body: { token: 'a'.repeat(64), password: 'x' } });
    assert.equal(other.statusCode, 400);

    resetRateLimitsForTests();
    let last = 0;
    for (let i = 0; i < 21; i += 1) {
      last = (await call('POST', '/auth/invite', { token: tokens.owner, body: { userId: staffId } })).statusCode;
    }
    assert.equal(last, 429);
    resetRateLimitsForTests();
  });

  test('токены и пароли не попадают в журнал и вывод', () => {
    const joined = printed.join('\n');
    assert.ok(!/[a-f0-9]{64}/.test(joined), 'в выводе есть токен');
    for (const secret of ['my-own-password-1', 'reset-password-33', 'owner-password-1', 'manager-password-1']) {
      assert.ok(!joined.includes(secret), 'в выводе есть пароль');
    }
    const activity = JSON.stringify(platformFile().activity || []);
    assert.ok(!/[a-f0-9]{64}/.test(activity));
    assert.match(activity, /issue_activation/);
    assert.match(activity, /activate_account/);
  });
});
