import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, describe } from 'node:test';
import { stpManagerMayCall } from '../../packages/shared/rolePermissions.js';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-stp-'));
process.env.PLATFORM_FILE = path.join(dir, 'platform.json');
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'stp-manager-local-test';

const { handler } = await import('./index.js');
const { ensureDemoStpManager } = await import('./demoSeed.js');

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function call(method, urlPathWithQuery, { token, body } = {}) {
  const [urlPath, qs] = urlPathWithQuery.split('?');
  return handler({
    httpMethod: method,
    path: urlPath,
    queryStringParameters: qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function login(loginName, password) {
  const response = await call('POST', '/auth/login', { body: { login: loginName, password } });
  assert.equal(response.statusCode, 200, `вход ${loginName}`);
  return JSON.parse(response.body).token;
}

const read = (response) => JSON.parse(response.body || '{}');

describe('список разрешённого для менеджера StP', () => {
  test('вход, профиль, чтение материалов и обучение — можно', () => {
    assert.equal(stpManagerMayCall('GET', '/auth/me'), true);
    assert.equal(stpManagerMayCall('POST', '/auth/logout'), true);
    assert.equal(stpManagerMayCall('PATCH', '/me'), true);
    assert.equal(stpManagerMayCall('PUT', '/me/avatar'), true);
    assert.equal(stpManagerMayCall('GET', '/materials'), true);
    assert.equal(stpManagerMayCall('GET', '/materials/mat_1/content'), true);
    assert.equal(stpManagerMayCall('GET', '/materials/mat_1/thumbnail'), true);
    assert.equal(stpManagerMayCall('POST', '/training/sync'), true);
    assert.equal(stpManagerMayCall('GET', '/training/me'), true);
  });

  test('проекты, комнаты, команда, аналитика и правка материалов — нельзя', () => {
    for (const [method, route] of [
      ['GET', '/objects'],
      ['POST', '/objects'],
      ['GET', '/projects'],
      ['GET', '/org/staff'],
      ['POST', '/org/staff'],
      ['GET', '/analytics/dashboard'],
      ['GET', '/analytics/drill'],
      ['GET', '/photo-cases'],
      ['GET', '/admin/partners'],
      ['POST', '/materials/folders'],
      ['DELETE', '/materials/mat_1'],
      ['PATCH', '/materials/mat_1'],
      ['GET', '/materials/files/upload-url'],
    ]) {
      assert.equal(stpManagerMayCall(method, route), false, `${method} ${route}`);
    }
  });
});

describe('менеджер StP: создание админом и доступ', { concurrency: false }, () => {
  const tokens = {};

  test('админ создаёт менеджера StP; логин уникален; владелец и менеджер партнёра не создают', async () => {
    tokens.admin = await login('admin', 'admin1234');
    tokens.owner = await login('partner1', 'demo1234');
    tokens.sales = await login('sales1', 'exec1234');
    const created = await call('POST', '/admin/stp-managers', {
      token: tokens.admin,
      body: { login: 'stp.test', password: 'Pass-stp-1', displayName: 'Тест Менеджер' },
    });
    assert.equal(created.statusCode, 200);
    const body = read(created);
    assert.equal(body.role, 'stp_manager');
    assert.ok(body.id);

    const dup = await call('POST', '/admin/stp-managers', {
      token: tokens.admin,
      body: { login: 'stp.test', password: 'x' },
    });
    assert.equal(dup.statusCode, 409);
    const noPass = await call('POST', '/admin/stp-managers', { token: tokens.admin, body: { login: 'stp.two' } });
    assert.equal(noPass.statusCode, 400);

    for (const token of [tokens.owner, tokens.sales]) {
      const denied = await call('POST', '/admin/stp-managers', {
        token,
        body: { login: 'stp.bad', password: 'x' },
      });
      assert.equal(denied.statusCode, 403);
    }
    tokens.managerId = body.id;
  });

  test('вход: роль stp_manager, цен партнёра в профиле нет', async () => {
    tokens.stp = await login('stp.test', 'Pass-stp-1');
    const me = await call('GET', '/auth/me', { token: tokens.stp });
    assert.equal(me.statusCode, 200);
    const user = read(me).user;
    assert.equal(user.role, 'stp_manager');
    assert.equal(user.org, null);
  });

  test('материалы читает, править не может', async () => {
    const list = await call('GET', '/materials', { token: tokens.stp });
    assert.equal(list.statusCode, 200);
    const folder = await call('POST', '/materials/folders', { token: tokens.stp, body: { name: 'Чужая папка' } });
    assert.equal(folder.statusCode, 403);
  });

  test('чужие разделы закрыты с 403', async () => {
    for (const [method, route, body] of [
      ['GET', '/objects'],
      ['POST', '/objects', { roomName: 'Комната' }],
      ['GET', '/projects'],
      ['POST', '/projects', { name: 'Проект' }],
      ['GET', '/org/staff'],
      ['POST', '/org/staff', { login: 'x1', password: 'x', role: 'sales' }],
      ['PATCH', '/org/settings', { city: 'Москва' }],
      ['GET', '/analytics/dashboard'],
      ['GET', '/analytics/drill'],
      ['GET', '/photo-cases'],
      ['GET', '/admin/partners'],
      ['GET', '/admin/stp-managers'],
      ['POST', '/admin/stp-managers', { login: 'x2', password: 'x' }],
      ['POST', '/admin/partners/reset-password', { partnerUserId: 'u_partner1', password: 'x' }],
    ]) {
      const response = await call(method, route, { token: tokens.stp, body });
      assert.equal(response.statusCode, 403, `${method} ${route} → ${response.statusCode}`);
    }
  });

  test('аналитика не отдаётся и по запросу с указанием компании', async () => {
    const response = await handler({
      httpMethod: 'GET',
      path: '/analytics/dashboard',
      headers: { Authorization: `Bearer ${tokens.stp}`, 'X-Analytics-Org': 'org_demo' },
      queryStringParameters: { orgId: 'org_demo' },
    });
    assert.equal(response.statusCode, 403);
    assert.ok(!/orgs|partnerCount|executors/.test(response.body));
  });

  test('менеджера StP не видно ни в команде партнёра, ни в списке партнёров', async () => {
    const staff = read(await call('GET', '/org/staff', { token: tokens.owner })).staff;
    assert.ok(!staff.some((s) => s.login === 'stp.test'));
    const partners = read(await call('GET', '/admin/partners', { token: tokens.admin })).partners;
    assert.ok(!partners.some((p) => p.user.login === 'stp.test'));
    assert.ok(!partners.some((p) => p.org?.id === 'org_stp'));
    const list = read(await call('GET', '/admin/stp-managers', { token: tokens.admin })).managers;
    assert.ok(list.some((m) => m.login === 'stp.test' && m.orgId === 'org_stp'));
    assert.ok(list.some((m) => m.login === 'stpmgr1'));
  });

  test('сброс пароля админом тем же вызовом, что у партнёров', async () => {
    const reset = await call('POST', '/admin/partners/reset-password', {
      token: tokens.admin,
      body: { partnerUserId: tokens.managerId, password: 'New-pass-2' },
    });
    assert.equal(reset.statusCode, 200);
    const old = await call('POST', '/auth/login', { body: { login: 'stp.test', password: 'Pass-stp-1' } });
    assert.equal(old.statusCode, 401);
    await login('stp.test', 'New-pass-2');
  });

  test('удаление: вход закрыт, чужую роль этим вызовом не удалить', async () => {
    const notManager = await call('DELETE', '/admin/stp-managers/u_partner1', { token: tokens.admin });
    assert.equal(notManager.statusCode, 404);
    const del = await call('DELETE', `/admin/stp-managers/${tokens.managerId}`, { token: tokens.admin });
    assert.equal(del.statusCode, 200);
    const gone = await call('POST', '/auth/login', { body: { login: 'stp.test', password: 'New-pass-2' } });
    assert.equal(gone.statusCode, 401);
    const stale = await call('GET', '/auth/me', { token: tokens.stp });
    assert.equal(stale.statusCode, 401);
  });

  test('демо-менеджер StP входит и видит материалы', async () => {
    const token = await login('stpmgr1', 'exec1234');
    const me = read(await call('GET', '/auth/me', { token })).user;
    assert.equal(me.role, 'stp_manager');
    assert.equal((await call('GET', '/materials', { token })).statusCode, 200);
    assert.equal((await call('GET', '/objects', { token })).statusCode, 403);
  });
});

describe('обучение менеджера StP на сервере', { concurrency: false }, () => {
  test('журнал пишется за менеджером, администратор видит компанию StP, чужое закрыто', async () => {
    const token = await login('stpmgr1', 'exec1234');
    const now = Date.now();
    const sync = await call('POST', '/training/sync', {
      token,
      body: { attempts: [], materials: [{ id: 'm-1', materialId: 'mat_x', title: 'Материал', openedAt: new Date(now - 1000).toISOString() }] },
    });
    assert.equal(sync.statusCode, 200, sync.body);
    assert.equal((await call('GET', '/training/me', { token })).statusCode, 200);
    assert.equal((await call('GET', '/training/org', { token })).statusCode, 403);
    assert.equal((await call('GET', '/training/companies', { token })).statusCode, 403);
    const admin = await login('admin', 'admin1234');
    const org = await call('GET', '/training/org?orgId=org_stp', { token: admin });
    assert.equal(org.statusCode, 200, org.body);
    const employees = JSON.stringify(read(org));
    assert.ok(employees.includes('u_stpmgr1'), 'менеджер StP в таблице компании StP');
  });
});

describe('демо-менеджер StP для уже развёрнутой демо-сети', () => {
  test('добавляется один раз и только к демо-данным', () => {
    const real = { users: [{ id: 'u1', login: 'a', role: 'owner' }], orgs: [{ id: 'org_real' }] };
    assert.equal(ensureDemoStpManager(real), false);
    assert.equal(real.users.length, 1);
    const demo = { users: [{ id: 'u_admin', login: 'admin', role: 'admin' }], orgs: [{ id: 'org_demo' }] };
    assert.equal(ensureDemoStpManager(demo), true);
    assert.ok(demo.orgs.some((o) => o.id === 'org_stp' && o.internal));
    assert.equal(demo.users.filter((u) => u.login === 'stpmgr1').length, 1);
    assert.equal(ensureDemoStpManager(demo), false);
  });
});
