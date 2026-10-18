import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, describe } from 'node:test';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-staff-'));
process.env.PLATFORM_FILE = path.join(dir, 'platform.json');
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'staff-local-test';

const { handler } = await import('./index.js');

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function call(method, urlPath, { token, body } = {}) {
  return handler({
    httpMethod: method,
    path: urlPath,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function login(loginName, password) {
  const response = await call('POST', '/auth/login', {
    body: { login: loginName, password },
  });
  assert.equal(response.statusCode, 200);
  return JSON.parse(response.body).token;
}

function readJson(response) {
  return JSON.parse(response.body || '{}');
}

function storedUsers() {
  return JSON.parse(readFileSync(process.env.PLATFORM_FILE, 'utf8')).users;
}

function userById(id) {
  return storedUsers().find((user) => user.id === id);
}

function userByLogin(loginName) {
  return storedUsers().find((user) => user.login === loginName);
}

describe('управление сотрудниками', { concurrency: false }, () => {
  /** @type {Record<string, string>} */
  const tokens = {};

  test('менеджер добавляет и удаляет сотрудников своей компании, включая другого менеджера', async () => {
    tokens.sales = await login('sales1', 'exec1234');
    tokens.owner = await login('partner1', 'demo1234');
    tokens.otherSales = await login('sales2', 'exec1234');

    const created = readJson(
      await call('POST', '/org/staff', {
        token: tokens.sales,
        body: {
          login: 'mgr_extra',
          password: 'staff-pass-1',
          displayName: 'Второй менеджер',
          role: 'sales',
          orgId: 'org_demo_spb',
        },
      }),
    );
    assert.equal(created.role, 'sales');
    const row = userById(created.id);
    assert.ok(row);
    assert.equal(row.orgId, 'org_demo');
    assert.equal(row.role, 'sales');

    const measurer = readJson(
      await call('POST', '/org/staff', {
        token: tokens.sales,
        body: {
          login: 'mgr_measurer',
          password: 'staff-pass-1',
          displayName: 'Новый замер',
          role: 'measurer',
        },
      }),
    );
    assert.equal(measurer.role, 'measurer');
    assert.equal(userById(measurer.id).orgId, 'org_demo');

    const crew = readJson(
      await call('POST', '/org/staff', {
        token: tokens.sales,
        body: {
          login: 'mgr_crew',
          password: 'staff-pass-1',
          displayName: 'Новый монтаж',
          role: 'crew',
        },
      }),
    );
    assert.equal(crew.role, 'crew');

    const ownList = readJson(await call('GET', '/org/staff', { token: tokens.sales })).staff;
    for (const id of [created.id, measurer.id, crew.id]) {
      assert.ok(ownList.some((member) => member.id === id));
    }
    const foreignList = readJson(await call('GET', '/org/staff', { token: tokens.otherSales })).staff;
    assert.equal(
      foreignList.some((member) => [created.id, measurer.id, crew.id].includes(member.id)),
      false,
    );

    const extraLogin = await call('POST', '/auth/login', {
      body: { login: 'mgr_extra', password: 'staff-pass-1' },
    });
    assert.equal(extraLogin.statusCode, 200);
    const extraUser = JSON.parse(extraLogin.body).user;
    assert.equal(extraUser.role, 'sales');
    assert.equal(extraUser.orgId, 'org_demo');

    assert.equal(
      (await call('DELETE', `/org/staff/${created.id}`, { token: tokens.otherSales })).statusCode,
      403,
    );
    assert.ok(userById(created.id));

    assert.equal(
      (await call('DELETE', `/org/staff/${created.id}`, { token: tokens.sales })).statusCode,
      200,
    );
    assert.equal(userById(created.id), undefined);
    assert.equal(
      (await call('DELETE', `/org/staff/${measurer.id}`, { token: tokens.sales })).statusCode,
      200,
    );
    assert.equal(
      (await call('DELETE', `/org/staff/${crew.id}`, { token: tokens.owner })).statusCode,
      200,
    );
    assert.equal(userByLogin('mgr_extra'), undefined);
    assert.equal(userByLogin('mgr_measurer'), undefined);
    assert.equal(userByLogin('mgr_crew'), undefined);
  });

  test('менеджер не удаляет и не понижает владельца, себя и чужую компанию и не создаёт owner/admin', async () => {
    const sales = tokens.sales || (await login('sales1', 'exec1234'));
    const ownerBefore = userById('u_partner1');
    const selfBefore = userById('u_sales1');
    const foreignBefore = userById('u_measurer2');
    assert.equal(ownerBefore.role, 'owner');

    const removeOwner = await call('DELETE', '/org/staff/u_partner1', { token: sales });
    assert.equal(removeOwner.statusCode, 403);
    assert.equal(userById('u_partner1').role, 'owner');
    assert.equal(userById('u_partner1').passwordHash, ownerBefore.passwordHash);

    const overwrite = await call('POST', '/org/staff', {
      token: sales,
      body: {
        login: 'partner1',
        password: 'staff-pass-1',
        displayName: 'Подмена',
        role: 'measurer',
      },
    });
    assert.equal(overwrite.statusCode, 409);
    assert.equal(userById('u_partner1').role, 'owner');
    assert.equal(userById('u_partner1').passwordHash, ownerBefore.passwordHash);

    const patchRole = await call('PATCH', '/org/staff/u_partner1', {
      token: sales,
      body: { role: 'measurer' },
    });
    assert.equal(patchRole.statusCode, 404);
    assert.equal(userById('u_partner1').role, 'owner');

    const resetOwner = await call('POST', '/org/staff/reset-password', {
      token: sales,
      body: { staffUserId: 'u_partner1', password: 'staff-pass-1' },
    });
    assert.equal(resetOwner.statusCode, 403);
    assert.equal(userById('u_partner1').passwordHash, ownerBefore.passwordHash);

    const removeSelf = await call('DELETE', '/org/staff/u_sales1', { token: sales });
    assert.equal(removeSelf.statusCode, 403);
    assert.equal(userById('u_sales1').passwordHash, selfBefore.passwordHash);
    assert.equal(userById('u_sales1').role, 'sales');

    const removeForeign = await call('DELETE', '/org/staff/u_measurer2', { token: sales });
    assert.equal(removeForeign.statusCode, 403);
    assert.equal(userById('u_measurer2').role, foreignBefore.role);
    assert.equal(userById('u_measurer2').orgId, 'org_demo_spb');
    assert.equal(userById('u_measurer2').passwordHash, foreignBefore.passwordHash);

    const resetForeign = await call('POST', '/org/staff/reset-password', {
      token: sales,
      body: { staffUserId: 'u_crew2', password: 'staff-pass-1' },
    });
    assert.equal(resetForeign.statusCode, 404);
    const foreignCrew = await call('POST', '/auth/login', {
      body: { login: 'crew2', password: 'exec1234' },
    });
    assert.equal(foreignCrew.statusCode, 200);

    const beforeCount = storedUsers().length;
    for (const role of ['owner', 'admin', 'partner']) {
      const rejected = await call('POST', '/org/staff', {
        token: sales,
        body: {
          login: `forbidden_${role}`,
          password: 'staff-pass-1',
          displayName: 'Нельзя',
          role,
        },
      });
      assert.equal(rejected.statusCode, 400, role);
      assert.equal(userByLogin(`forbidden_${role}`), undefined);
    }
    assert.equal(storedUsers().length, beforeCount);

    const temp = readJson(
      await call('POST', '/org/staff', {
        token: sales,
        body: {
          login: 'mgr_pw',
          password: 'staff-pass-1',
          displayName: 'Смена пароля',
          role: 'crew',
        },
      }),
    );
    const reset = await call('POST', '/org/staff/reset-password', {
      token: sales,
      body: { staffUserId: temp.id, password: 'staff-pass-2' },
    });
    assert.equal(reset.statusCode, 200);
    assert.equal(
      (await call('POST', '/auth/login', { body: { login: 'mgr_pw', password: 'staff-pass-1' } }))
        .statusCode,
      401,
    );
    assert.equal(
      (await call('POST', '/auth/login', { body: { login: 'mgr_pw', password: 'staff-pass-2' } }))
        .statusCode,
      200,
    );
    assert.equal((await call('DELETE', `/org/staff/${temp.id}`, { token: sales })).statusCode, 200);
  });

  test('замерщик и монтажник не управляют сотрудниками', async () => {
    const measurer = await login('exec1', 'exec1234');
    const crew = await login('crew1', 'exec1234');
    const before = storedUsers().length;
    for (const token of [measurer, crew]) {
      assert.equal(
        (
          await call('POST', '/org/staff', {
            token,
            body: {
              login: 'should_not_exist',
              password: 'staff-pass-1',
              displayName: 'Нет',
              role: 'crew',
            },
          })
        ).statusCode,
        403,
      );
      assert.equal((await call('DELETE', '/org/staff/u_crew1', { token })).statusCode, 403);
      assert.equal(
        (
          await call('POST', '/org/staff/reset-password', {
            token,
            body: { staffUserId: 'u_crew1', password: 'staff-pass-1' },
          })
        ).statusCode,
        403,
      );
    }
    assert.equal(storedUsers().length, before);
    assert.equal(userById('u_crew1').role, 'crew');
    assert.equal(userByLogin('should_not_exist'), undefined);
  });

  test('владелец по-прежнему создаёт сотрудника и может назначить менеджера', async () => {
    const owner = tokens.owner || (await login('partner1', 'demo1234'));
    const created = readJson(
      await call('POST', '/org/staff', {
        token: owner,
        body: {
          login: 'owner_made_mgr',
          password: 'staff-pass-1',
          displayName: 'Менеджер владельца',
          role: 'sales',
        },
      }),
    );
    assert.equal(created.role, 'sales');
    assert.equal(userById(created.id).orgId, 'org_demo');
    assert.equal((await call('DELETE', `/org/staff/${created.id}`, { token: owner })).statusCode, 200);
    assert.equal(userById(created.id), undefined);
  });
});
