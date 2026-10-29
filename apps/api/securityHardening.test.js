import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-security-'));
process.env.PLATFORM_FILE = path.join(dir, 'platform.json');
process.env.JWT_SECRET = 'security-hardening-test-secret-0123456789';
process.env.ANALYTICS_ADMIN_KEY = 'analytics-key-for-tests';
process.env.CORS_ORIGIN = 'https://stp-multiframe.ru, https://paulos99.github.io/';
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;

const PASSWORD = 'correct-horse-battery';
const hash = bcrypt.hashSync(PASSWORD, 4);
const base = {
  users: [
    { id: 'u_admin', login: 'Admin', role: 'admin', orgId: null, displayName: 'Админ', passwordHash: hash },
    { id: 'u_owner_a', login: 'owner.a', role: 'owner', orgId: 'org_a', displayName: 'Компания А', passwordHash: hash },
    { id: 'u_crew_a', login: 'crew.a', role: 'crew', orgId: 'org_a', displayName: 'Монтажник А', passwordHash: hash },
    { id: 'u_owner_b', login: 'owner.b', role: 'owner', orgId: 'org_b', displayName: 'Компания Б', passwordHash: hash },
    { id: 'u_crew_b', login: 'crew.b', role: 'crew', orgId: 'org_b', displayName: 'Монтажник Б', passwordHash: hash },
  ],
  orgs: [
    { id: 'org_a', settings: { companyName: 'Компания А' } },
    { id: 'org_b', settings: { companyName: 'Компания Б' } },
  ],
  objects: [],
  projects: [],
  activity: [],
};
writeFileSync(process.env.PLATFORM_FILE, JSON.stringify(base));

const { handler, resetPlatformMemoryForTests, seedAnalyticsEventsForTests, bootstrapAdminPlatform } = await import('./index.js');
const { resetRateLimitsForTests, passwordProblem, safeEqual, corsOriginFor } = await import('./security.js');
const { signToken } = await import('./authTokens.js');

after(() => rmSync(dir, { recursive: true, force: true }));

beforeEach(() => {
  writeFileSync(process.env.PLATFORM_FILE, JSON.stringify(base));
  resetPlatformMemoryForTests();
  resetRateLimitsForTests();
});

async function call(method, p, { body, token, headers = {}, query, ip } = {}) {
  const res = await handler({
    httpMethod: method,
    path: p,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    queryStringParameters: query,
    requestContext: ip ? { identity: { sourceIp: ip } } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.statusCode, headers: res.headers, body: JSON.parse(res.body || '{}') };
}

async function login(name, password = PASSWORD, ip) {
  return call('POST', '/auth/login', { body: { login: name, password }, ip });
}

async function tokenFor(name) {
  const res = await login(name);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

test('аналитика: без входа нельзя, заголовки роли и организации больше не дают доступ', async () => {
  assert.equal((await call('GET', '/analytics/dashboard')).status, 401);
  const spoofed = await call('GET', '/analytics/dashboard', {
    headers: { 'X-Analytics-Role': 'admin', 'X-Analytics-Org': 'org_a' },
    query: { orgId: 'org_a' },
  });
  assert.equal(spoofed.status, 401);
  const wrongKey = await call('GET', '/analytics/dashboard', {
    headers: { 'X-Analytics-Role': 'admin', 'X-Analytics-Key': 'wrong' },
  });
  assert.equal(wrongKey.status, 403);
  const rightKey = await call('GET', '/analytics/dashboard', { headers: { 'X-Analytics-Key': 'analytics-key-for-tests' } });
  assert.equal(rightKey.status, 200);
});

test('аналитика: монтажник не видит сводку, владелец видит только свою компанию', async () => {
  assert.equal((await call('GET', '/analytics/dashboard', { token: await tokenFor('crew.a') })).status, 403);
  const own = await call('GET', '/analytics/dashboard', { token: await tokenFor('owner.a'), query: { orgId: 'org_b' } });
  assert.equal(own.status, 200);
  assert.equal(own.body.events.every((e) => e.orgId === 'org_a' || !e.orgId), true);
});

test('события: личность берётся из токена, а не из тела; без токена — анонимно', async () => {
  const forged = { tool: 'calculator', action: 'open', orgId: 'org_b', userId: 'u_owner_b', login: 'owner.b', role: 'admin', companyName: 'Чужая' };
  const anon = await call('POST', '/analytics/events', { body: { events: [{ ...forged, id: 'ev_anon' }] } });
  assert.equal(anon.status, 200);
  const owner = await tokenFor('owner.a');
  const bound = await call('POST', '/analytics/events', { body: { events: [{ ...forged, id: 'ev_bound' }] }, token: owner });
  assert.equal(bound.status, 200);
  const dash = await call('GET', '/analytics/dashboard', {
    headers: { 'X-Analytics-Key': 'analytics-key-for-tests' },
    query: { journal: '1' },
  });
  const anonEvent = dash.body.events.find((e) => e.id === 'ev_anon');
  const boundEvent = dash.body.events.find((e) => e.id === 'ev_bound');
  assert.equal(anonEvent.orgId, null);
  assert.equal(anonEvent.role, 'public');
  assert.equal(boundEvent.orgId, 'org_a');
  assert.equal(boundEvent.login, 'owner.a');
  assert.equal(boundEvent.role, 'owner');
});

test('события: ограничение размера, поля обрезаются, будущая дата заменяется, частота ограничена', async () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ id: `bulk_${i}`, tool: 'calculator', action: 'open' }));
  const res = await call('POST', '/analytics/events', { body: { events: many }, ip: '203.0.113.5' });
  assert.equal(res.body.accepted, 100);
  const big = await call('POST', '/analytics/events', {
    body: { events: [{ id: 'big', tool: 'x'.repeat(500), action: 'open', at: '2999-01-01T00:00:00Z', object: { blob: 'y'.repeat(5000) } }] },
    ip: '203.0.113.6',
  });
  assert.equal(big.status, 200);
  const dash = await call('GET', '/analytics/dashboard', { headers: { 'X-Analytics-Key': 'analytics-key-for-tests' }, query: { journal: '1' } });
  const stored = dash.body.events.find((e) => e.id === 'big');
  assert.equal(stored.tool.length, 64);
  assert.ok(Date.parse(stored.at) < Date.now() + 60_000);
  assert.equal(stored.object ?? null, null);
  let limited = null;
  for (let i = 0; i < 70 && !limited; i += 1) {
    const r = await call('POST', '/analytics/events', { body: { events: [{ tool: 'a', action: 'b' }] }, ip: '203.0.113.9' });
    if (r.status === 429) limited = r;
  }
  assert.ok(limited, 'ожидался 429');
  assert.ok(Number(limited.headers['Retry-After']) >= 1);
});

test('вход: серия неверных паролей блокирует запись, верный пароль после блокировки не пускает до срока', async () => {
  for (let i = 0; i < 10; i += 1) {
    const res = await login('crew.a', 'wrong-password-' + i, `198.51.100.${i + 1}`);
    assert.equal(res.status, 401);
  }
  const locked = await login('crew.a', PASSWORD, '198.51.100.99');
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers['Retry-After']) > 0);
  // Другие учётные записи не затронуты.
  assert.equal((await login('owner.a', PASSWORD, '198.51.100.98')).status, 200);
});

test('вход: ограничение по адресу и одинаковый ответ для неизвестного логина', async () => {
  const unknown = await login('nobody', 'whatever-password', '192.0.2.1');
  const wrong = await login('owner.a', 'whatever-password', '192.0.2.1');
  assert.equal(unknown.status, 401);
  assert.deepEqual(unknown.body, wrong.body);
  let blocked = null;
  for (let i = 0; i < 40 && !blocked; i += 1) {
    const r = await login(`user${i}`, 'x', '192.0.2.77');
    if (r.status === 429) blocked = r;
  }
  assert.ok(blocked, 'адрес должен быть ограничен');
  assert.equal((await login('owner.a', PASSWORD, '192.0.2.78')).status, 200);
});

test('вход: логин без учёта регистра; успешный вход сбрасывает счётчик', async () => {
  assert.equal((await login('ADMIN')).status, 200);
  for (let i = 0; i < 5; i += 1) await login('owner.b', 'bad-pass-' + i, '192.0.2.50');
  assert.equal((await login('owner.b', PASSWORD, '192.0.2.51')).status, 200);
  for (let i = 0; i < 5; i += 1) await login('owner.b', 'bad-pass-' + i, '192.0.2.52');
  assert.equal((await login('owner.b', PASSWORD, '192.0.2.53')).status, 200);
});

test('токен чужой учётной записи с тем же логином не подходит', async () => {
  const ghost = await signToken({ id: 'u_deleted', login: 'owner.a', role: 'owner', orgId: 'org_a' });
  assert.equal((await call('GET', '/auth/me', { token: ghost })).status, 401);
});

test('пароли: слишком короткий отклоняется при создании и сбросе, сброс закрывает старые сессии', async () => {
  const owner = await tokenFor('owner.a');
  const short = await call('POST', '/org/staff', { token: owner, body: { login: 'new.crew', password: 'short', role: 'crew' } });
  assert.equal(short.status, 400);
  const taken = await call('POST', '/org/staff', { token: owner, body: { login: 'CREW.A', password: 'long-enough-pass', role: 'crew' } });
  assert.equal(taken.status, 409);
  const created = await call('POST', '/org/staff', { token: owner, body: { login: 'new.crew', password: 'long-enough-pass', role: 'crew' } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const crewToken = await tokenFor('crew.a');
  assert.equal((await call('POST', '/org/staff/reset-password', { token: owner, body: { staffUserId: 'u_crew_a', password: '123' } })).status, 400);
  const reset = await call('POST', '/org/staff/reset-password', { token: owner, body: { staffUserId: 'u_crew_a', password: 'brand-new-password' } });
  assert.equal(reset.status, 200);
  assert.equal((await call('GET', '/auth/me', { token: crewToken })).status, 401);
  assert.equal((await login('crew.a', 'brand-new-password')).status, 200);
  const admin = await tokenFor('Admin');
  assert.equal((await call('POST', '/admin/partners', { token: admin, body: { login: 'p1', password: 'tiny', companyName: 'X' } })).status, 400);
  assert.equal((await call('POST', '/admin/partners/reset-password', { token: admin, body: { partnerUserId: 'u_owner_a', password: 'tiny' } })).status, 400);
});

test('комнаты: исполнитель только из своей компании, идентификатор проверяется, чужую комнату не перезаписать', async () => {
  const owner = await tokenFor('owner.a');
  const foreign = await call('POST', '/objects', { token: owner, body: { clientName: 'К', address: 'А', assignedTo: 'u_crew_b' } });
  assert.equal(foreign.status, 400);
  const badId = await call('POST', '/objects', { token: owner, body: { id: '../x/y', clientName: 'К', address: 'А' } });
  assert.equal(badId.status, 400);
  const ok = await call('POST', '/objects', { token: owner, body: { clientName: 'К', address: 'А', assignedTo: 'u_crew_a' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const ownerB = await tokenFor('owner.b');
  const hijack = await call('POST', '/objects', { token: ownerB, body: { id: ok.body.object.id, clientName: 'Чужая' } });
  assert.equal(hijack.status, 403);
  assert.equal((await call('GET', `/objects/${ok.body.object.id}`, { token: ownerB })).status, 404);
  const crewB = await tokenFor('crew.b');
  assert.equal((await call('GET', `/objects/${ok.body.object.id}`, { token: crewB })).status, 404);
});

test('цены организации ограничены допустимым диапазоном', async () => {
  const owner = await tokenFor('owner.a');
  const res = await call('PATCH', '/org/settings', {
    token: owner,
    body: { panelPriceRub: 1e30, pricePerM2: 'Infinity', installPricePerM2: -5, dowelsPerPanel: 9999, companyName: 'Я'.repeat(500) },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const org = res.body.org || res.body.user?.org || res.body.settings;
  assert.ok(org.panelPriceRub <= 1_000_000);
  assert.ok(org.pricePerM2 >= 1 && org.pricePerM2 <= 1_000_000);
  assert.ok(org.dowelsPerPanel <= 50);
  assert.ok(org.companyName.length <= 120);
  assert.ok(org.installPricePerM2 === null || org.installPricePerM2 >= 0);
});

test('CORS: список origin, чужой origin не получает разрешения; заголовки безопасности на каждом ответе', async () => {
  const allowed = await call('GET', '/health', { headers: { Origin: 'https://stp-multiframe.ru' } });
  assert.equal(allowed.headers['Access-Control-Allow-Origin'], 'https://stp-multiframe.ru');
  assert.equal(allowed.headers.Vary, 'Origin');
  const second = await call('GET', '/health', { headers: { Origin: 'https://paulos99.github.io' } });
  assert.equal(second.headers['Access-Control-Allow-Origin'], 'https://paulos99.github.io');
  const evil = await call('GET', '/health', { headers: { Origin: 'https://evil.example' } });
  assert.notEqual(evil.headers['Access-Control-Allow-Origin'], 'https://evil.example');
  assert.equal(evil.headers['X-Content-Type-Options'], 'nosniff');
  assert.match(evil.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  const preflight = await handler({ httpMethod: 'OPTIONS', path: '/objects', headers: { Origin: 'https://stp-multiframe.ru' } });
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['Access-Control-Allow-Origin'], 'https://stp-multiframe.ru');
  assert.equal(corsOriginFor('https://evil.example'), 'https://stp-multiframe.ru');
});

test('слишком большое тело запроса отклоняется, внутренняя ошибка не раскрывает текст', async () => {
  const owner = await tokenFor('owner.a');
  const huge = await call('POST', '/objects', { token: owner, body: { clientName: 'x'.repeat(7_000_000) } });
  assert.equal(huge.status, 413);
  const original = console.error;
  console.error = () => {};
  try {
    const bad = await handler({
      httpMethod: 'POST',
      path: '/auth/login',
      headers: {},
      get body() {
        throw new Error('секретная внутренняя причина');
      },
    });
    assert.equal(bad.statusCode, 500);
    assert.equal(bad.body.includes('секретная'), false);
  } finally {
    console.error = original;
  }
});

test('демо-сброс без бакета разрешён только админу; пароли и ключи сравниваются безопасно', async () => {
  const owner = await tokenFor('owner.a');
  assert.equal((await call('POST', '/admin/demo/reset', { token: owner })).status, 403);
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('', ''), false);
  assert.ok(passwordProblem('short'));
  assert.ok(passwordProblem(' leading-space-pass'));
  assert.ok(passwordProblem('я'.repeat(40)));
  assert.equal(passwordProblem('long-enough-pass'), '');
});

test('первый администратор из ADMIN_BOOTSTRAP_*: только при сильном пароле', () => {
  const saved = { l: process.env.ADMIN_BOOTSTRAP_LOGIN, p: process.env.ADMIN_BOOTSTRAP_PASSWORD };
  try {
    process.env.ADMIN_BOOTSTRAP_LOGIN = 'root';
    process.env.ADMIN_BOOTSTRAP_PASSWORD = 'short';
    assert.equal(bootstrapAdminPlatform(), null);
    process.env.ADMIN_BOOTSTRAP_PASSWORD = 'first-admin-password';
    const platform = bootstrapAdminPlatform();
    assert.equal(platform.users.length, 1);
    assert.equal(platform.users[0].role, 'admin');
    assert.equal(bcrypt.compareSync('first-admin-password', platform.users[0].passwordHash), true);
    assert.equal(JSON.stringify(platform).includes('first-admin-password'), false);
  } finally {
    if (saved.l === undefined) delete process.env.ADMIN_BOOTSTRAP_LOGIN;
    else process.env.ADMIN_BOOTSTRAP_LOGIN = saved.l;
    if (saved.p === undefined) delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
    else process.env.ADMIN_BOOTSTRAP_PASSWORD = saved.p;
  }
});

test('seedAnalyticsEventsForTests доступен только как тестовый помощник', async () => {
  await seedAnalyticsEventsForTests([{ id: 'seeded', at: new Date().toISOString(), tool: 'a', action: 'b', orgId: 'org_a', role: 'owner' }]);
  const dash = await call('GET', '/analytics/dashboard', { headers: { 'X-Analytics-Key': 'analytics-key-for-tests' }, query: { journal: '1' } });
  assert.ok(dash.body.events.some((e) => e.id === 'seeded'));
});

test('клиентская ссылка: токен длинный, срок действия SHARE_LINK_TTL_DAYS, в ответе нет личных данных клиента', async () => {
  const owner = await tokenFor('owner.a');
  const created = await call('POST', '/objects', {
    token: owner,
    body: { clientName: 'Иван Секретов', clientPhone: '+79990001122', address: 'ул. Тайная, 1', roomName: 'Кухня', room: { answers: { roomType: 'kitchen' } } },
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const link = await call('POST', `/objects/${created.body.object.id}/share`, { token: owner, body: {} });
  assert.equal(link.status, 200, JSON.stringify(link.body));
  const shareToken = link.body.link.token;
  assert.ok(shareToken.length >= 32);
  const open = await call('GET', `/public/rooms/${shareToken}`);
  assert.equal(open.status, 200);
  assert.equal(open.headers['X-Robots-Tag'], 'noindex, nofollow');
  const text = JSON.stringify(open.body);
  for (const secret of ['Секретов', '79990001122', 'Тайная']) assert.equal(text.includes(secret), false, secret);
  process.env.SHARE_LINK_TTL_DAYS = '0.00001';
  try {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal((await call('GET', `/public/rooms/${shareToken}`)).status, 404);
  } finally {
    delete process.env.SHARE_LINK_TTL_DAYS;
  }
});

test('NODE_ENV=production без бакета не поднимает демо-данные', async () => {
  const prev = { env: process.env.NODE_ENV, seed: process.env.DEMO_SEED, bucket: process.env.PARTNERS_BUCKET };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.DEMO_SEED;
    delete process.env.PARTNERS_BUCKET;
    const { handler, resetPlatformMemoryForTests } = await import('./index.js');
    resetPlatformMemoryForTests();
    const res = await handler({
      httpMethod: 'POST',
      path: '/auth/login',
      headers: {},
      body: JSON.stringify({ login: 'stp', password: 'demo' }),
    });
    assert.ok([401, 503].includes(res.statusCode), `статус ${res.statusCode}`);
  } finally {
    for (const [k, v] of [['NODE_ENV', prev.env], ['DEMO_SEED', prev.seed], ['PARTNERS_BUCKET', prev.bucket]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
