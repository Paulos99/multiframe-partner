import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, before, describe } from 'node:test';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-objdel-'));
const platformFile = path.join(dir, 'platform.json');
process.env.PLATFORM_FILE = platformFile;
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'objects-delete-local-test-secret-000';

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
  const response = await call('POST', '/auth/login', { body: { login: loginName, password } });
  assert.equal(response.statusCode, 200, response.body);
  const data = JSON.parse(response.body);
  return { token: data.token, id: data.user.id };
}

const readJson = (response) => JSON.parse(response.body || '{}');
const storedObject = (id) =>
  JSON.parse(readFileSync(platformFile, 'utf8')).objects.find((obj) => obj.id === id);
const PDF = Buffer.from('%PDF-1.4\n%test\n').toString('base64');

describe('права на объекты', { concurrency: false }, () => {
  /** @type {Record<string, string>} */
  const tokens = {};
  /** @type {Record<string, string>} */
  const ids = {};

  before(async () => {
    const owner = await login('partner1', 'demo1234');
    const sales = await login('sales1', 'exec1234');
    const measurer = await login('exec1', 'exec1234');
    const crew = await login('crew1', 'exec1234');
    const other = await login('partner2', 'demo1234');
    const admin = await login('admin', 'admin1234');
    tokens.owner = owner.token;
    tokens.sales = sales.token;
    tokens.measurer = measurer.token;
    tokens.crew = crew.token;
    tokens.other = other.token;
    tokens.admin = admin.token;
    ids.owner = owner.id;
    ids.sales = sales.id;
    ids.measurer = measurer.id;
    ids.crew = crew.id;
  });

  async function createRoom(token, name, extra = {}) {
    const created = readJson(
      await call('POST', '/objects', {
        token,
        body: { clientName: name, address: 'ул. Тестовая, 1', city: 'Москва', roomName: 'Кухня', ...extra },
      }),
    );
    assert.equal(created.object?.clientName, name, JSON.stringify(created));
    assert.ok(created.object?.id, 'объект создан');
    assert.ok(created.object.projectId, 'комната привязана к проекту компании');
    return created.object;
  }

  test('создание: менеджер и владелец проходят, монтажник, замерщик и чужая компания получают отказ', async () => {
    for (const role of ['crew', 'measurer']) {
      const response = await call('POST', '/objects', {
        token: tokens[role],
        body: { clientName: role, address: 'нет', roomName: 'Комната' },
      });
      assert.equal(response.statusCode, 403, `${role}: ${response.body}`);
    }

    const bySales = await createRoom(tokens.sales, 'Комната менеджера');
    const byOwner = await createRoom(tokens.owner, 'Комната владельца');
    assert.equal(bySales.orgId, byOwner.orgId, 'оба объекта своей компании');

    const foreignCreate = await call('POST', '/objects', {
      token: tokens.other,
      body: { id: bySales.id, clientName: 'Захват', address: 'чужая', roomName: 'Чужая' },
    });
    assert.equal(foreignCreate.statusCode, 403, foreignCreate.body);
    assert.equal(storedObject(bySales.id).clientName, 'Комната менеджера');
    assert.equal(storedObject(bySales.id).orgId, byOwner.orgId);

    const hidden = await call('GET', `/objects/${bySales.id}`, { token: tokens.other });
    assert.equal(hidden.statusCode, 404, 'чужая компания объект не видит');
    const listed = readJson(await call('GET', '/objects', { token: tokens.sales }));
    assert.equal(listed.objects.some((obj) => obj.id === byOwner.id), true, 'менеджер видит объект владельца');
    const foreignList = readJson(await call('GET', '/objects', { token: tokens.other }));
    assert.equal(foreignList.objects.some((obj) => obj.id === bySales.id || obj.id === byOwner.id), false);
  });

  test('правка: менеджер и владелец проходят, монтажник, замерщик и чужая компания получают отказ', async () => {
    const room = await createRoom(tokens.owner, 'Правка карточки', {
      estimate: { panels: 4, dowels: 8, panelsCost: 1000, installCost: 500, dowelsCost: 40, totalCost: 1540 },
    });
    const assigned = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.owner,
      body: {
        assignedTo: ids.measurer,
        assignments: { salesUserId: ids.sales, measurerUserId: ids.measurer, crewUserId: ids.crew },
      },
    });
    assert.equal(assigned.statusCode, 200, assigned.body);

    const sales = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.sales,
      body: { clientName: 'Исправил менеджер' },
    });
    assert.equal(sales.statusCode, 200, sales.body);
    assert.equal(readJson(sales).object.clientName, 'Исправил менеджер');

    const owner = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.owner,
      body: { address: 'ул. Правки, 2' },
    });
    assert.equal(owner.statusCode, 200, owner.body);
    assert.equal(readJson(owner).object.address, 'ул. Правки, 2');

    for (const role of ['crew', 'measurer', 'other']) {
      const response = await call('PATCH', `/objects/${room.id}`, {
        token: tokens[role],
        body: { clientName: `Чужое ${role}` },
      });
      assert.equal(response.statusCode, 403, `${role}: ${response.body}`);
    }
    assert.equal(storedObject(room.id).clientName, 'Исправил менеджер');
  });

  test('смена статуса: менеджер и владелец проходят, монтажник, замерщик и чужая компания получают отказ', async () => {
    const room = await createRoom(tokens.sales, 'Смена статуса');
    assert.equal(room.status, 'draft');

    const sales = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.sales,
      body: { status: 'measured' },
    });
    assert.equal(sales.statusCode, 200, sales.body);
    assert.equal(readJson(sales).object.status, 'measured');

    const owner = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.owner,
      body: { status: 'quote_sent' },
    });
    assert.equal(owner.statusCode, 200, owner.body);
    assert.equal(readJson(owner).object.status, 'quote_sent');

    await call('PATCH', `/objects/${room.id}`, {
      token: tokens.owner,
      body: {
        assignedTo: ids.measurer,
        assignments: { measurerUserId: ids.measurer, crewUserId: ids.crew },
      },
    });
    for (const role of ['crew', 'measurer', 'other']) {
      const response = await call('PATCH', `/objects/${room.id}`, {
        token: tokens[role],
        body: { status: 'measured' },
      });
      assert.equal(response.statusCode, 403, `${role}: ${response.body}`);
    }
    assert.equal(storedObject(room.id).status, 'quote_sent');
  });

  test('порядок на доске: менеджер и владелец проходят, монтажник, замерщик и чужая компания получают отказ', async () => {
    const room = await createRoom(tokens.owner, 'Порядок карточек');
    const sales = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.sales,
      body: { stageOrder: 128 },
    });
    assert.equal(sales.statusCode, 200, sales.body);
    assert.equal(readJson(sales).object.stageOrder, 128);

    const owner = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.owner,
      body: { stageOrder: 256 },
    });
    assert.equal(owner.statusCode, 200, owner.body);
    assert.equal(readJson(owner).object.stageOrder, 256);

    await call('PATCH', `/objects/${room.id}`, {
      token: tokens.owner,
      body: { assignments: { measurerUserId: ids.measurer, crewUserId: ids.crew } },
    });
    for (const role of ['crew', 'measurer', 'other']) {
      const response = await call('PATCH', `/objects/${room.id}`, {
        token: tokens[role],
        body: { stageOrder: 999 },
      });
      assert.equal(response.statusCode, 403, `${role}: ${response.body}`);
    }
    assert.equal(storedObject(room.id).stageOrder, 256);
  });

  test('привязка к проекту: менеджер и владелец проходят, монтажник, замерщик и чужая компания получают отказ', async () => {
    const first = readJson(
      await call('POST', '/projects', { token: tokens.sales, body: { name: 'Первый адрес', city: 'Москва' } }),
    );
    const second = readJson(
      await call('POST', '/projects', { token: tokens.owner, body: { name: 'Второй адрес', city: 'Москва' } }),
    );
    const foreignProject = readJson(
      await call('POST', '/projects', { token: tokens.other, body: { name: 'Чужой адрес', city: 'Санкт-Петербург' } }),
    );
    const room = await createRoom(tokens.sales, 'Перенос проекта', { projectId: first.project.id });

    const sales = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.sales,
      body: { projectId: second.project.id },
    });
    assert.equal(sales.statusCode, 200, sales.body);
    assert.equal(readJson(sales).object.projectId, second.project.id);

    const owner = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.owner,
      body: { projectId: first.project.id },
    });
    assert.equal(owner.statusCode, 200, owner.body);
    assert.equal(readJson(owner).object.projectId, first.project.id);

    const foreignProjectBind = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.sales,
      body: { projectId: foreignProject.project.id },
    });
    assert.equal(foreignProjectBind.statusCode, 400, foreignProjectBind.body);
    assert.equal(storedObject(room.id).projectId, first.project.id);

    await call('PATCH', `/objects/${room.id}`, {
      token: tokens.owner,
      body: { assignments: { measurerUserId: ids.measurer, crewUserId: ids.crew } },
    });
    for (const role of ['crew', 'measurer', 'other']) {
      const response = await call('PATCH', `/objects/${room.id}`, {
        token: tokens[role],
        body: { projectId: second.project.id },
      });
      assert.equal(response.statusCode, 403, `${role}: ${response.body}`);
    }
    assert.equal(storedObject(room.id).projectId, first.project.id);
  });

  test('удаление: менеджер и владелец проходят, монтажник, замерщик и чужая компания получают отказ', async () => {
    const room = await createRoom(tokens.owner, 'Запрет удаления');
    for (const role of ['measurer', 'crew', 'other']) {
      const response = await call('DELETE', `/objects/${room.id}`, { token: tokens[role] });
      assert.equal(response.statusCode, 403, `${role}: ${response.body}`);
      assert.ok(storedObject(room.id), `${role} не удалил объект`);
    }
    assert.equal((await call('DELETE', `/objects/${room.id}`)).statusCode, 401);

    const bySales = await createRoom(tokens.owner, 'Удалит менеджер');
    const removedBySales = await call('DELETE', `/objects/${bySales.id}`, { token: tokens.sales });
    assert.equal(removedBySales.statusCode, 200, removedBySales.body);
    assert.equal(storedObject(bySales.id), undefined);

    const foreignRoom = await createRoom(tokens.other, 'Чужая комната');
    const salesForeign = await call('DELETE', `/objects/${foreignRoom.id}`, { token: tokens.sales });
    assert.equal(salesForeign.statusCode, 403, salesForeign.body);
    assert.ok(storedObject(foreignRoom.id), 'менеджер не удаляет чужую компанию');
  });

  test('владелец удаляет объект вместе с документами', async () => {
    const room = await createRoom(tokens.owner, 'Удаление владельцем');
    const uploaded = await call('POST', `/objects/${room.id}/documents`, {
      token: tokens.owner,
      body: { documents: [{ kind: 'estimate', filename: 'смета.pdf', pdfBase64: PDF }] },
    });
    assert.equal(uploaded.statusCode, 200, uploaded.body);
    const docId = storedObject(room.id).documents[0].id;
    assert.equal(
      (await call('GET', `/objects/${room.id}/documents/${docId}`, { token: tokens.owner })).statusCode,
      200,
    );

    const removed = await call('DELETE', `/objects/${room.id}`, { token: tokens.owner });
    assert.equal(removed.statusCode, 200, removed.body);
    assert.equal(storedObject(room.id), undefined, 'объекта нет в хранилище');
    const listed = readJson(await call('GET', '/objects', { token: tokens.owner }));
    assert.equal((listed.objects || []).some((obj) => obj.id === room.id), false);
    assert.equal(
      (await call('GET', `/objects/${room.id}/documents/${docId}`, { token: tokens.owner })).statusCode,
      404,
    );
  });

  test('администратор сети не удаляет комнату компании', async () => {
    const room = await createRoom(tokens.owner, 'Чужая для сети');
    const removed = await call('DELETE', `/objects/${room.id}`, { token: tokens.admin });
    assert.equal(removed.statusCode, 403, removed.body);
    assert.match(readJson(removed).message, /не удаляет/);
    assert.ok(storedObject(room.id), 'карточка компании на месте');
  });

  test('замерщик сохраняет расчёт только в назначенной комнате', async () => {
    const room = await createRoom(tokens.owner, 'Замер кухни', {
      assignedTo: ids.measurer,
      assignments: { measurerUserId: ids.measurer },
    });
    const saved = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.measurer,
      body: {
        status: 'measured',
        room: { areaM2: 14, roomTypeCustom: 'Кухня' },
        estimate: { panels: 8, dowels: 16, panelsCost: 4000, installCost: 2000, dowelsCost: 80, totalCost: 6080 },
        clientSummary: 'Расчёт по замеру · 14 м²',
      },
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(storedObject(room.id).estimate.totalCost, 6080);
    assert.equal(storedObject(room.id).status, 'measured');
    assert.equal(storedObject(room.id).clientName, 'Замер кухни');

    const sent = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.measurer,
      body: { status: 'quote_sent' },
    });
    assert.equal(sent.statusCode, 403, sent.body);
    assert.equal(storedObject(room.id).status, 'measured');

    const stray = await createRoom(tokens.owner, 'Не назначена');
    const denied = await call('PATCH', `/objects/${stray.id}`, {
      token: tokens.measurer,
      body: { estimate: { panels: 1, dowels: 1, totalCost: 10 } },
    });
    assert.equal(denied.statusCode, 403, denied.body);
    assert.match(readJson(denied).message, /не назначена/);
    assert.equal(storedObject(stray.id).estimate, null);
  });

  test('отправленное предложение и активная сделка не дают тихо удалить комнату', async () => {
    const sentCard = await createRoom(tokens.owner, 'Уже отправили', { status: 'quote_sent' });
    const blocked = await call('DELETE', `/objects/${sentCard.id}`, { token: tokens.owner });
    assert.equal(blocked.statusCode, 409, blocked.body);
    assert.match(readJson(blocked).message, /предложение клиенту уже отправлено/);
    assert.ok(storedObject(sentCard.id), 'карточка с отправленным предложением на месте');

    const { getCommercialRepository, resetCommercialRepositoryForTests } = await import('./commercial/repository.js');
    resetCommercialRepositoryForTests();
    const repo = await getCommercialRepository();
    const openRoom = await createRoom(tokens.sales, 'В сделке');
    const doneRoom = await createRoom(tokens.sales, 'Сделка закрыта');
    const freeRoom = await createRoom(tokens.sales, 'Без сделки');
    const now = new Date().toISOString();
    await repo.transaction(async (tx) => {
      await tx.insert({
        orgId: openRoom.orgId,
        kind: 'deal',
        id: 'deal_open_room',
        projectId: openRoom.projectId,
        parentId: openRoom.projectId,
        updatedAt: now,
        payload: {
          id: 'deal_open_room',
          projectId: openRoom.projectId,
          closedAt: null,
          roomAssent: { [openRoom.id]: 'ordered' },
        },
      });
      await tx.insert({
        orgId: openRoom.orgId,
        kind: 'quote',
        id: 'quote_open_room',
        projectId: openRoom.projectId,
        parentId: 'deal_open_room',
        updatedAt: now,
        payload: {
          id: 'quote_open_room',
          dealId: 'deal_open_room',
          projectId: openRoom.projectId,
          lifecycle: 'quote_created',
          sentConfirmedAt: null,
          roomObjectIds: [openRoom.id],
        },
      });
      await tx.insert({
        orgId: doneRoom.orgId,
        kind: 'deal',
        id: 'deal_done_room',
        projectId: doneRoom.projectId,
        parentId: doneRoom.projectId,
        updatedAt: now,
        payload: {
          id: 'deal_done_room',
          projectId: doneRoom.projectId,
          closedAt: now,
          roomAssent: { [doneRoom.id]: 'ordered' },
        },
      });
      await tx.insert({
        orgId: doneRoom.orgId,
        kind: 'quote',
        id: 'quote_sent_room',
        projectId: doneRoom.projectId,
        parentId: 'deal_done_room',
        updatedAt: now,
        payload: {
          id: 'quote_sent_room',
          dealId: 'deal_done_room',
          projectId: doneRoom.projectId,
          lifecycle: 'quote_sent_confirmed',
          sentConfirmedAt: now,
          roomObjectIds: [doneRoom.id],
          snapshot: { lines: [{ roomId: doneRoom.id, calcType: 'preliminary', amount: 1000 }] },
        },
      });
    });

    const active = await call('DELETE', `/objects/${openRoom.id}`, { token: tokens.sales });
    assert.equal(active.statusCode, 409, active.body);
    assert.match(readJson(active).message, /ещё идёт сделка/);
    assert.ok(storedObject(openRoom.id));

    const history = await call('DELETE', `/objects/${doneRoom.id}`, { token: tokens.owner });
    assert.equal(history.statusCode, 409, history.body);
    assert.match(readJson(history).message, /предложение клиенту уже отправлено/);
    assert.ok(storedObject(doneRoom.id));
    const quoteStill = await repo.transaction(async (tx) => tx.get(doneRoom.orgId, 'quote', 'quote_sent_room'));
    assert.equal(quoteStill.payload.lifecycle, 'quote_sent_confirmed');
    assert.equal(quoteStill.payload.sentConfirmedAt, now);

    const removed = await call('DELETE', `/objects/${freeRoom.id}`, { token: tokens.sales });
    assert.equal(removed.statusCode, 200, removed.body);
    assert.equal(storedObject(freeRoom.id), undefined);
  });

  test('монтажник закрывает свой монтаж и не видит цены', async () => {
    const room = await createRoom(tokens.owner, 'Монтаж без цен', {
      status: 'install',
      estimate: { panels: 6, dowels: 12, panelsCost: 2000, installCost: 800, dowelsCost: 60, totalCost: 2860 },
      assignments: { crewUserId: ids.crew },
      assignedTo: ids.crew,
    });
    const seen = readJson(await call('GET', `/objects/${room.id}`, { token: tokens.crew }));
    assert.equal(seen.object.estimate.panels, 6);
    assert.equal(seen.object.estimate.dowels, 12);
    assert.equal(seen.object.estimate.totalCost, undefined);
    assert.equal(seen.object.estimate.panelsCost, undefined);
    assert.equal(seen.object.estimate.installCost, undefined);

    const moved = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.crew,
      body: { status: 'measured' },
    });
    assert.equal(moved.statusCode, 403, moved.body);

    const closed = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.crew,
      body: { status: 'closed' },
    });
    assert.equal(closed.statusCode, 200, closed.body);
    assert.equal(readJson(closed).object.status, 'closed');
    assert.equal(readJson(closed).object.estimate.totalCost, undefined);
  });
});
