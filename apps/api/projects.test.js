import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, describe } from 'node:test';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-projects-'));
const platformFile = path.join(dir, 'platform.json');
process.env.PLATFORM_FILE = platformFile;
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'projects-local-test';

const { handler, resetPlatformMemoryForTests } = await import('./index.js');

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
  assert.equal(response.statusCode, 200, response.body);
  return JSON.parse(response.body).token;
}

function readJson(response) {
  return JSON.parse(response.body || '{}');
}

function storedPlatform() {
  return JSON.parse(readFileSync(platformFile, 'utf8'));
}

const MONEY_KEYS = ['totalCost', 'panelsCost', 'installCost', 'dowelsCost', 'pricePerM2', 'panelPriceRub'];

describe('projects', { concurrency: false }, () => {
  /** @type {Record<string, string>} */
  const tokens = {};

  test('права, изоляция компаний и привязка помещения', async () => {
    tokens.owner = await login('partner1', 'demo1234');
    tokens.sales = await login('sales1', 'exec1234');
    tokens.measurer = await login('exec1', 'exec1234');
    tokens.crew = await login('crew1', 'exec1234');
    tokens.other = await login('partner2', 'demo1234');
    tokens.admin = await login('admin', 'admin1234');

    const before = storedPlatform();
    assert.equal(Object.prototype.hasOwnProperty.call(before, 'projects'), false);
    const legacy = before.objects.find((obj) => obj.id === 'obj_a11');
    assert.ok(legacy);
    assert.equal(Object.prototype.hasOwnProperty.call(legacy, 'projectId'), false);

    const listed = readJson(await call('GET', '/projects', { token: tokens.owner }));
    assert.deepEqual(listed.projects, []);
    assert.equal(Object.prototype.hasOwnProperty.call(storedPlatform(), 'projects'), false);

    const denied = await call('POST', '/projects', {
      token: tokens.measurer,
      body: { name: 'Чужой черновик' },
    });
    assert.equal(denied.statusCode, 403);
    assert.equal(
      (await call('POST', '/projects', { token: tokens.crew, body: { name: 'Монтаж' } })).statusCode,
      403,
    );
    assert.equal(
      (await call('POST', '/projects', { token: tokens.admin, body: { name: 'Сеть' } })).statusCode,
      403,
    );

    const created = readJson(
      await call('POST', '/projects', {
        token: tokens.owner,
        body: {
          name: 'Квартира на Арбате',
          clientName: 'Иванова',
          clientPhone: '+7 495 000-00-01',
          address: 'ул. Арбат, 12',
          city: 'Москва',
          totalCost: 999999,
        },
      }),
    );
    assert.equal(created.project.name, 'Квартира на Арбате');
    assert.equal(created.project.orgId, 'org_demo');
    for (const key of MONEY_KEYS) assert.equal(created.project[key], undefined);
    const projectId = created.project.id;

    const renamed = readJson(
      await call('PATCH', `/projects/${projectId}`, {
        token: tokens.sales,
        body: { name: 'Квартира, 3 комнаты' },
      }),
    );
    assert.equal(renamed.project.name, 'Квартира, 3 комнаты');
    assert.equal(renamed.project.clientName, 'Иванова');
    assert.equal(renamed.project.address, 'ул. Арбат, 12');

    const otherProject = readJson(
      await call('POST', '/projects', {
        token: tokens.other,
        body: { name: 'Чужая квартира', city: 'Санкт-Петербург' },
      }),
    );
    assert.equal(otherProject.project.orgId, 'org_demo_spb');

    const ownerList = readJson(await call('GET', '/projects', { token: tokens.owner }));
    assert.deepEqual(
      ownerList.projects.map((project) => project.id),
      [projectId],
    );
    const otherList = readJson(await call('GET', '/projects', { token: tokens.other }));
    assert.deepEqual(
      otherList.projects.map((project) => project.id),
      [otherProject.project.id],
    );
    const adminList = readJson(await call('GET', '/projects', { token: tokens.admin }));
    assert.equal(adminList.projects.length, 2);

    assert.equal(
      (await call('PATCH', `/projects/${projectId}`, { token: tokens.other, body: { name: 'Захват' } }))
        .statusCode,
      404,
    );
    assert.equal(
      (await call('PATCH', `/projects/${projectId}`, { token: tokens.crew, body: { name: 'Нет' } }))
        .statusCode,
      403,
    );

    const room = readJson(
      await call('POST', '/objects', {
        token: tokens.owner,
        body: {
          clientName: 'Гостиная',
          address: 'ул. Арбат, 12',
          city: 'Москва',
          room: { areaM2: 18 },
          roomName: 'Гостиная',
          projectId,
          estimate: { panels: 10, dowels: 20, panelsCost: 100, installCost: 50, dowelsCost: 10, totalCost: 160 },
          extraField: 'не сохранять',
        },
      }),
    );
    assert.equal(room.object.projectId, projectId);
    assert.equal(room.object.roomName, 'Гостиная');
    assert.equal(room.object.room.areaM2, 18);
    assert.equal(room.object.extraField, undefined);

    const kept = readJson(
      await call('PATCH', `/objects/${room.object.id}`, {
        token: tokens.owner,
        body: { status: 'measured' },
      }),
    );
    assert.equal(kept.object.projectId, projectId);
    assert.equal(kept.object.roomName, 'Гостиная');
    assert.equal(kept.object.room.areaM2, 18);
    assert.equal(kept.object.status, 'measured');

    const legacyResponse = await call('PATCH', '/objects/obj_a11', {
      token: tokens.owner,
      body: { clientPhone: legacy.clientPhone },
    });
    assert.equal(legacyResponse.statusCode, 200, legacyResponse.body);
    const legacyPatch = readJson(legacyResponse);
    assert.equal(legacyPatch.object.id, 'obj_a11');
    assert.equal(Object.prototype.hasOwnProperty.call(legacyPatch.object, 'projectId'), false);
    assert.equal(legacyPatch.object.clientName, 'Чернов А.');

    assert.equal(
      (
        await call('PATCH', `/objects/${room.object.id}`, {
          token: tokens.owner,
          body: { projectId: 'prj_missing' },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await call('PATCH', `/objects/${room.object.id}`, {
          token: tokens.owner,
          body: { projectId: otherProject.project.id },
        })
      ).statusCode,
      400,
    );
    const stillLinked = readJson(await call('GET', `/objects/${room.object.id}`, { token: tokens.owner }));
    assert.equal(stillLinked.object.projectId, projectId);

    const file = storedPlatform();
    assert.equal(file.objects.some((obj) => obj.id === 'obj_a01'), true);
    assert.equal(file.objects.find((obj) => obj.id === 'obj_a11').clientName, 'Чернов А.');
    assert.equal(Array.isArray(file.projects), true);
    assert.equal(file.users.length, before.users.length);
  });

  test('локальный HTTP: три комнаты, перезагрузка и роли', async () => {
    const server = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString('utf8');
      const result = await handler({
        httpMethod: req.method,
        path: (req.url || '/').split('?')[0],
        headers: req.headers,
        body: body || undefined,
      });
      res.writeHead(result.statusCode, result.headers);
      res.end(result.body || '');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    async function api(method, urlPath, { token, body } = {}) {
      const response = await fetch(`${base}${urlPath}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      return { status: response.status, data };
    }

    try {
      const owner = (await api('POST', '/auth/login', { body: { login: 'partner1', password: 'demo1234' } })).data.token;
      const sales = (await api('POST', '/auth/login', { body: { login: 'sales1', password: 'exec1234' } })).data.token;
      const measurer = (await api('POST', '/auth/login', { body: { login: 'exec1', password: 'exec1234' } })).data.token;
      const crew = (await api('POST', '/auth/login', { body: { login: 'crew1', password: 'exec1234' } })).data.token;
      const other = (await api('POST', '/auth/login', { body: { login: 'partner2', password: 'demo1234' } })).data.token;

      const project = (
        await api('POST', '/projects', {
          token: owner,
          body: {
            name: 'Квартира',
            clientName: 'Семья Орловых',
            clientPhone: '+7 495 100-20-30',
            address: 'ул. Пятницкая, 10',
            city: 'Москва',
          },
        })
      ).data.project;
      assert.equal(project.name, 'Квартира');

      const rooms = [
        { roomName: 'Кухня', areaM2: 12, assignedTo: 'u_measurer1', totalCost: 72000 },
        { roomName: 'Спальня', areaM2: 16, assignedTo: 'u_crew1', totalCost: 96000 },
        { roomName: 'Детская', areaM2: 9.5, assignedTo: null, totalCost: null },
      ];
      const saved = [];
      for (const room of rooms) {
        const created = await api('POST', '/objects', {
          token: owner,
          body: {
            clientName: room.roomName,
            address: 'ул. Пятницкая, 10',
            city: 'Москва',
            roomName: room.roomName,
            room: { areaM2: room.areaM2, roomTypeCustom: room.roomName },
            assignedTo: room.assignedTo,
            estimate:
              room.totalCost == null
                ? null
                : {
                    panels: Math.ceil(room.areaM2),
                    dowels: 4,
                    panelsCost: room.totalCost,
                    installCost: 0,
                    dowelsCost: 0,
                    totalCost: room.totalCost,
                  },
          },
        });
        assert.equal(created.status, 200, JSON.stringify(created.data));
        const linked = await api('PATCH', `/objects/${created.data.object.id}`, {
          token: owner,
          body: { projectId: project.id },
        });
        assert.equal(linked.status, 200, JSON.stringify(linked.data));
        assert.equal(linked.data.object.projectId, project.id);
        assert.equal(linked.data.object.roomName, room.roomName);
        assert.equal(linked.data.object.room.areaM2, room.areaM2);
        saved.push(linked.data.object);
      }

      resetPlatformMemoryForTests();

      const again = await api('GET', '/projects', { token: owner });
      assert.equal(again.status, 200);
      assert.equal(again.data.projects.filter((item) => item.id === project.id).length, 1);
      const reloaded = await api('GET', '/objects', { token: owner });
      const mine = reloaded.data.objects.filter((obj) => obj.projectId === project.id);
      assert.deepEqual(
        mine.map((obj) => obj.roomName).sort(),
        ['Детская', 'Кухня', 'Спальня'],
      );
      assert.deepEqual(
        mine.map((obj) => obj.room.areaM2).sort((a, b) => a - b),
        [9.5, 12, 16],
      );
      const calculated = mine.filter((obj) => typeof obj.estimate?.totalCost === 'number');
      assert.equal(calculated.length, 2);
      assert.equal(
        calculated.reduce((sum, obj) => sum + obj.estimate.totalCost, 0),
        72000 + 96000,
      );

      const salesProjects = (await api('GET', '/projects', { token: sales })).data.projects;
      assert.ok(salesProjects.some((item) => item.id === project.id));
      const salesRooms = (await api('GET', '/objects', { token: sales })).data.objects.filter(
        (obj) => obj.projectId === project.id,
      );
      assert.equal(salesRooms.length, 3);

      const measurerProjects = (await api('GET', '/projects', { token: measurer })).data.projects;
      assert.deepEqual(
        measurerProjects.map((item) => item.id).filter((id) => id === project.id),
        [project.id],
      );
      const measurerRooms = (await api('GET', '/objects', { token: measurer })).data.objects.filter(
        (obj) => obj.projectId === project.id,
      );
      assert.deepEqual(measurerRooms.map((obj) => obj.roomName), ['Кухня']);
      assert.equal(measurerRooms[0].room.areaM2, 12);

      const crewProjects = await api('GET', '/projects', { token: crew });
      assert.equal(JSON.stringify(crewProjects.data).includes('totalCost'), false);
      assert.ok(crewProjects.data.projects.some((item) => item.id === project.id));
      const crewRooms = (await api('GET', '/objects', { token: crew })).data.objects.filter(
        (obj) => obj.projectId === project.id,
      );
      assert.deepEqual(crewRooms.map((obj) => obj.roomName), ['Спальня']);
      // Цены видят все роли, монтажник тоже.
      assert.equal(crewRooms[0].estimate.totalCost, 96000);
      assert.ok(crewRooms[0].estimate.panelsCost > 0);
      assert.equal(crewRooms[0].estimate.panels, 16);
      const hidden = await api('GET', `/objects/${saved[0].id}`, { token: crew });
      assert.equal(hidden.status, 404);

      const foreign = await api('GET', '/projects', { token: other });
      assert.equal(foreign.data.projects.some((item) => item.id === project.id), false);
      const foreignRooms = (await api('GET', '/objects', { token: other })).data.objects.filter(
        (obj) => obj.projectId === project.id,
      );
      assert.equal(foreignRooms.length, 0);

      const onDisk = storedPlatform();
      const diskRooms = onDisk.objects.filter((obj) => obj.projectId === project.id);
      assert.equal(diskRooms.length, 3);
      assert.deepEqual(
        diskRooms.map((obj) => obj.room.areaM2).sort((a, b) => a - b),
        [9.5, 12, 16],
      );
    } finally {
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  test('новый объект получает проект, пустая привязка запрещена, перенос внутри компании можно', async () => {
    const owner = await login('partner1', 'demo1234');
    const measurer = await login('exec1', 'exec1234');
    const crew = await login('crew1', 'exec1234');
    const other = await login('partner2', 'demo1234');
    const legacyBefore = storedPlatform().objects.find((obj) => obj.id === 'obj_a11');
    assert.equal(Object.prototype.hasOwnProperty.call(legacyBefore, 'projectId'), false);

    assert.equal(
      (await call('POST', '/objects', { token: crew, body: { clientName: 'Монтаж', address: 'нет' } })).statusCode,
      403,
    );
    assert.equal(
      (await call('POST', '/objects', { token: measurer, body: { clientName: 'Петрова', address: 'нет', roomName: 'Кухня' } })).statusCode,
      403,
    );

    const created = readJson(
      await call('POST', '/objects', {
        token: owner,
        body: {
          clientName: 'Петрова',
          clientPhone: '+7 495 000-11-22',
          address: 'ул. Пятницкая, 4',
          city: 'Москва',
          roomName: 'Кухня',
          room: { areaM2: 11 },
          estimate: { totalCost: 5000 },
        },
      }),
    );
    assert.equal(created.object.roomName, 'Кухня');
    assert.equal(created.object.room.areaM2, 11);
    assert.match(created.object.projectId, /^prj_/);
    const projects = readJson(await call('GET', '/projects', { token: owner }));
    const project = projects.projects.find((item) => item.id === created.object.projectId);
    assert.ok(project);
    assert.equal(project.name, 'Петрова');
    assert.equal(project.address, 'ул. Пятницкая, 4');
    assert.equal(project.clientPhone, '+7 495 000-11-22');
    assert.equal(project.orgId, 'org_demo');
    assert.equal(project.totalCost, undefined);
    assert.equal(
      readJson(await call('GET', '/projects', { token: other })).projects.some((item) => item.id === project.id),
      false,
    );

    const cleared = await call('PATCH', `/objects/${created.object.id}`, {
      token: owner,
      body: { projectId: '' },
    });
    assert.equal(cleared.statusCode, 400);
    const still = readJson(await call('GET', `/objects/${created.object.id}`, { token: owner }));
    assert.equal(still.object.projectId, project.id);
    assert.equal(still.object.clientName, 'Петрова');
    assert.equal(still.object.room.areaM2, 11);

    const second = readJson(
      await call('POST', '/projects', {
        token: owner,
        body: { name: 'Второй адрес', address: 'ул. Ленина, 1', city: 'Москва' },
      }),
    );
    const moved = readJson(
      await call('PATCH', `/objects/${created.object.id}`, {
        token: owner,
        body: { projectId: second.project.id },
      }),
    );
    assert.equal(moved.object.projectId, second.project.id);
    assert.equal(moved.object.roomName, 'Кухня');
    assert.equal(moved.object.estimate.totalCost, 5000);

    const legacy = storedPlatform().objects.find((obj) => obj.id === 'obj_a11');
    assert.equal(Object.prototype.hasOwnProperty.call(legacy, 'projectId'), false);
  });
});
