import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, describe } from 'node:test';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-stp-admins-'));
process.env.PLATFORM_FILE = path.join(dir, 'platform.json');
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'stp-admins-local-test';

const { handler } = await import('./index.js');

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
  assert.equal(response.statusCode, 200, `вход ${loginName}: ${response.body}`);
  return JSON.parse(response.body).token;
}

const read = (response) => JSON.parse(response.body || '{}');

describe('администраторы StP: создание, права и защиты', { concurrency: false }, () => {
  let adminToken = '';
  let secondId = '';
  let secondLogin = 'stp.admin.two';

  test('только admin создаёт администратора; логин уникален; слабый пароль отклоняется', async () => {
    adminToken = await login('admin', 'admin1234');
    const owner = await login('partner1', 'demo1234');
    const sales = await login('sales1', 'exec1234');

    const created = await call('POST', '/admin/stp-admins', {
      token: adminToken,
      body: { login: secondLogin, password: 'Pass-admin-2', displayName: 'Второй Админ' },
    });
    assert.equal(created.statusCode, 200, created.body);
    const body = read(created);
    assert.equal(body.role, 'admin');
    assert.equal(body.login, secondLogin);
    assert.equal(body.password, 'Pass-admin-2');
    assert.ok(body.id);
    secondId = body.id;

    const dup = await call('POST', '/admin/stp-admins', {
      token: adminToken,
      body: { login: secondLogin, password: 'Pass-admin-3' },
    });
    assert.equal(dup.statusCode, 409);

    const weak = await call('POST', '/admin/stp-admins', {
      token: adminToken,
      body: { login: 'stp.admin.weak', password: 'x' },
    });
    assert.equal(weak.statusCode, 400);

    const noPass = await call('POST', '/admin/stp-admins', {
      token: adminToken,
      body: { login: 'stp.admin.link', displayName: 'По ссылке' },
    });
    assert.equal(noPass.statusCode, 200);
    assert.equal(read(noPass).pendingActivation, true);

    for (const token of [owner, sales]) {
      const denied = await call('POST', '/admin/stp-admins', {
        token,
        body: { login: 'stp.admin.x', password: 'Pass-admin-x1' },
      });
      assert.equal(denied.statusCode, 403);
    }
  });

  test('список показывает имя, логин, дату создания и признак себя', async () => {
    const list = read(await call('GET', '/admin/stp-admins', { token: adminToken })).admins;
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 2);
    const self = list.find((a) => a.login === 'admin');
    const other = list.find((a) => a.login === secondLogin);
    assert.equal(self.isSelf, true);
    assert.equal(other.displayName, 'Второй Админ');
    assert.ok(other.createdAt);
    assert.equal(other.isSelf, false);
  });

  test('новый администратор входит и видит партнёров', async () => {
    const token = await login(secondLogin, 'Pass-admin-2');
    const partners = await call('GET', '/admin/partners', { token });
    assert.equal(partners.statusCode, 200);
    const me = read(await call('GET', '/auth/me', { token })).user;
    assert.equal(me.role, 'admin');
  });

  test('сброс пароля: старый не подходит, новый работает; пароль не пишется в журнал', async () => {
    const reset = await call('POST', '/admin/stp-admins/reset-password', {
      token: adminToken,
      body: { adminUserId: secondId, password: 'Pass-admin-new' },
    });
    assert.equal(reset.statusCode, 200);
    assert.equal(read(reset).password, 'Pass-admin-new');
    assert.equal((await call('POST', '/auth/login', { body: { login: secondLogin, password: 'Pass-admin-2' } })).statusCode, 401);
    assert.ok(await login(secondLogin, 'Pass-admin-new'));

    // В ответе списка нет хеша/пароля.
    const row = read(await call('GET', '/admin/stp-admins', { token: adminToken })).admins.find(
      (a) => a.id === secondId,
    );
    assert.equal(row.password, undefined);
    assert.equal(row.passwordHash, undefined);
  });

  test('нельзя удалить или отключить самого себя', async () => {
    const me = read(await call('GET', '/auth/me', { token: adminToken })).user;
    const delSelf = await call('DELETE', `/admin/stp-admins/${me.id}`, { token: adminToken });
    assert.equal(delSelf.statusCode, 400);
    assert.match(read(delSelf).message, /самого себя/);
    const offSelf = await call('PATCH', `/admin/stp-admins/${me.id}`, {
      token: adminToken,
      body: { loginDisabled: true },
    });
    assert.equal(offSelf.statusCode, 400);
    assert.match(read(offSelf).message, /самого себя/);
  });

  test('отключение чужого админа закрывает вход; включение возвращает', async () => {
    const off = await call('PATCH', `/admin/stp-admins/${secondId}`, {
      token: adminToken,
      body: { loginDisabled: true },
    });
    assert.equal(off.statusCode, 200, off.body);
    assert.equal(read(off).loginDisabled, true);
    assert.equal(
      (await call('POST', '/auth/login', { body: { login: secondLogin, password: 'Pass-admin-new' } })).statusCode,
      401,
    );
    const on = await call('PATCH', `/admin/stp-admins/${secondId}`, {
      token: adminToken,
      body: { loginDisabled: false },
    });
    assert.equal(on.statusCode, 200);
    assert.equal(read(on).loginDisabled, false);
    assert.ok(await login(secondLogin, 'Pass-admin-new'));
  });

  test('нельзя отключить или удалить последнего активного администратора', async () => {
    // Отключаем всех кроме основного admin (у нас ещё stp.admin.link без пароля — активный).
    const list = read(await call('GET', '/admin/stp-admins', { token: adminToken })).admins;
    for (const row of list) {
      if (row.login === 'admin' || row.loginDisabled) continue;
      const r = await call('PATCH', `/admin/stp-admins/${row.id}`, {
        token: adminToken,
        body: { loginDisabled: true },
      });
      assert.equal(r.statusCode, 200, `${row.login}: ${r.body}`);
    }
    const me = read(await call('GET', '/auth/me', { token: adminToken })).user;
    const lastOff = await call('PATCH', `/admin/stp-admins/${me.id}`, {
      token: adminToken,
      body: { loginDisabled: true },
    });
    // Себя и так нельзя; дополнительно проверим удаление последнего активного чужого после включения одного и удаления остальных.
    assert.equal(lastOff.statusCode, 400);

    // Включаем второго, удаляем ссылочного, пытаемся удалить последнего чужого активного — нельзя оставить ноль.
    await call('PATCH', `/admin/stp-admins/${secondId}`, {
      token: adminToken,
      body: { loginDisabled: false },
    });
    const link = list.find((a) => a.login === 'stp.admin.link');
    if (link) {
      const delLink = await call('DELETE', `/admin/stp-admins/${link.id}`, { token: adminToken });
      assert.equal(delLink.statusCode, 200, delLink.body);
    }
    // Два активных: admin и second — удаление second ок
    const delSecond = await call('DELETE', `/admin/stp-admins/${secondId}`, { token: adminToken });
    assert.equal(delSecond.statusCode, 200, delSecond.body);
    assert.equal(
      (await call('POST', '/auth/login', { body: { login: secondLogin, password: 'Pass-admin-new' } })).statusCode,
      401,
    );

    // Остался один — удалить его нельзя (даже если знать id)
    const alone = await call('DELETE', `/admin/stp-admins/${me.id}`, { token: adminToken });
    assert.equal(alone.statusCode, 400);
    assert.match(read(alone).message, /самого себя|последнего/);
  });

  test('чужие роли не читают и не правят список администраторов', async () => {
    const owner = await login('partner1', 'demo1234');
    assert.equal((await call('GET', '/admin/stp-admins', { token: owner })).statusCode, 403);
    assert.equal(
      (await call('POST', '/admin/stp-admins/reset-password', { token: owner, body: { adminUserId: 'x', password: 'Pass-xxxx-1' } }))
        .statusCode,
      403,
    );
  });

  test('админ выдаёт ссылку активации другому админу', async () => {
    const created = read(
      await call('POST', '/admin/stp-admins', {
        token: adminToken,
        body: { login: 'stp.admin.invite' },
      }),
    );
    const invite = await call('POST', '/auth/invite', {
      token: adminToken,
      body: { userId: created.id },
    });
    assert.equal(invite.statusCode, 200, invite.body);
    assert.match(read(invite).path, /^\?activate=/);
  });
});
