import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, describe } from 'node:test';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-share-'));
const platformFile = path.join(dir, 'platform.json');
process.env.PLATFORM_FILE = platformFile;
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'room-share-local-test-secret-0000';

const { handler } = await import('./index.js');
const { sanitizeRoomAnswers, newShareToken } = await import('./roomShare.js');

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
  ids[loginName] = data.user.id;
  return data.token;
}

/** @type {Record<string, string>} */
const ids = {};

const readJson = (response) => JSON.parse(response.body || '{}');

const ANSWERS = {
  roomType: 'bedroom',
  roomTypeCustom: '',
  ceilingAreaM2: 18,
  slabType: 'monolith',
  slabThickness: 'about_200_250',
  floorAbove: 'unknown',
  houseType: 'panel',
  objectStage: 'occupied',
  plannedCeiling: 'stretch',
  noisyNeighbors: 'often_noisy',
  noiseKind: 'impact',
  roomWishes: ['from_above', 'privacy_out'],
  // всё ниже в ответ попасть не должно
  clientName: 'СекретныйКлиент',
  clientPhone: '+7 999 123-45-67',
  address: 'ул. Секретная, 7',
  totalCost: 987654,
};

describe('ссылка для клиента', { concurrency: false }, () => {
  /** @type {Record<string, string>} */
  const tokens = {};
  let room;
  let link;

  test('белый список ответов: чужие поля и неверные значения не проходят', () => {
    const clean = sanitizeRoomAnswers({ ...ANSWERS, slabType: '<script>', ceilingAreaM2: -4 });
    assert.equal(clean.slabType, 'unknown');
    assert.equal(clean.ceilingAreaM2, null);
    assert.deepEqual(Object.keys(clean).sort(), [
      'ceilingAreaM2',
      'floorAbove',
      'houseType',
      'noiseKind',
      'noisyNeighbors',
      'objectStage',
      'plannedCeiling',
      'roomType',
      'roomTypeCustom',
      'roomWishes',
      'slabThickness',
      'slabType',
    ]);
    assert.match(newShareToken(), /^[A-Za-z0-9_-]{32}$/);
    assert.notEqual(newShareToken(), newShareToken());
  });

  test('создание: владелец, менеджер и замерщик; монтажник и чужие нет', async () => {
    tokens.owner = await login('partner1', 'demo1234');
    tokens.sales = await login('sales1', 'exec1234');
    tokens.measurer = await login('exec1', 'exec1234');
    tokens.crew = await login('crew1', 'exec1234');
    tokens.other = await login('partner2', 'demo1234');

    const created = readJson(
      await call('POST', '/objects', {
        token: tokens.owner,
        body: {
          clientName: 'СекретныйКлиент',
          clientPhone: '+7 999 123-45-67',
          address: 'ул. Секретная, 7',
          city: 'Москва',
          roomName: 'Спальня',
          assignedTo: ids.crew1,
          estimate: { panels: 9, dowels: 18, panelsCost: 21564, installCost: 27000, dowelsCost: 450, totalCost: 987654 },
          room: { areaM2: 18, answers: ANSWERS },
        },
      }),
    );
    room = created.object;
    assert.ok(room?.id);

    assert.equal((await call('POST', `/objects/${room.id}/share`, { token: tokens.crew, body: {} })).statusCode, 403);
    assert.equal((await call('POST', `/objects/${room.id}/share`, { token: tokens.measurer, body: {} })).statusCode, 404, 'замерщик без назначения комнату не видит');
    assert.equal((await call('POST', `/objects/${room.id}/share`, { token: tokens.other, body: {} })).statusCode, 404);
    assert.equal((await call('POST', `/objects/${room.id}/share`, { body: {} })).statusCode, 401);

    const made = await call('POST', `/objects/${room.id}/share`, { token: tokens.sales, body: { answers: ANSWERS } });
    assert.equal(made.statusCode, 200, made.body);
    link = readJson(made).link;
    assert.equal(link.enabled, true);
    assert.match(link.token, /^[A-Za-z0-9_-]{32}$/);

    // повторный вызов обновляет снимок, но токен остаётся прежним
    const again = readJson(
      await call('POST', `/objects/${room.id}/share`, { token: tokens.owner, body: { answers: ANSWERS } }),
    ).link;
    assert.equal(again.token, link.token);
  });

  test('публичный ответ без входа: только разрешённые поля, без цен и данных клиента', async () => {
    const response = await call('GET', `/public/rooms/${link.token}`);
    assert.equal(response.statusCode, 200, response.body);
    const body = readJson(response);
    assert.deepEqual(Object.keys(body), ['share']);
    assert.deepEqual(Object.keys(body.share).sort(), ['room', 'roomName', 'updatedAt']);
    assert.equal(body.share.roomName, 'Спальня');
    assert.equal(body.share.room.ceilingAreaM2, 18);
    assert.equal(body.share.room.noisyNeighbors, 'often_noisy');
    const raw = response.body;
    for (const secret of ['СекретныйКлиент', '999', 'Секретная', '987654', '21564', '27000', 'ui_org', 'org_', 'estimate', 'phone', 'Phone', 'orgId', 'assignedTo']) {
      assert.ok(!raw.includes(secret), `в публичном ответе нет «${secret}»`);
    }
  });

  test('токен не светится в списках комнат', async () => {
    const list = await call('GET', '/objects', { token: tokens.owner });
    assert.ok(!list.body.includes(link.token));
    const one = await call('GET', `/objects/${room.id}`, { token: tokens.owner });
    assert.ok(!one.body.includes(link.token));
  });

  test('чтение для монтажника; отключать могут владелец и менеджер', async () => {
    const roomFor = readJson(
      await call('POST', '/objects', {
        token: tokens.owner,
        body: { clientName: 'x', address: 'a', city: 'Москва', roomName: 'Кухня', room: { answers: ANSWERS } },
      }),
    ).object;
    await call('POST', `/objects/${roomFor.id}/share`, { token: tokens.owner, body: {} });
    assert.equal((await call('GET', `/objects/${roomFor.id}/share`, { token: tokens.crew })).statusCode, 404);
    const asCrew = await call('GET', `/objects/${room.id}/share`, { token: tokens.crew });
    assert.equal(asCrew.statusCode, 200, asCrew.body);
    assert.equal(readJson(asCrew).link.token, link.token, 'назначенный монтажник читает ссылку для QR');

    const mine = readJson(
      await call('POST', '/objects', {
        token: tokens.owner,
        body: { clientName: 'z', address: 'c', city: 'Москва', roomName: 'Детская', assignedTo: ids.exec1, room: { answers: ANSWERS } },
      }),
    ).object;
    assert.equal((await call('POST', `/objects/${mine.id}/share`, { token: tokens.measurer, body: {} })).statusCode, 200);
    assert.equal((await call('DELETE', `/objects/${mine.id}/share`, { token: tokens.measurer })).statusCode, 403, 'замерщик создаёт, но не отключает');
    assert.equal((await call('DELETE', `/objects/${room.id}/share`, { token: tokens.measurer })).statusCode, 404);
    assert.equal((await call('DELETE', `/objects/${room.id}/share`, { token: tokens.crew })).statusCode, 403);
    assert.equal((await call('GET', `/public/rooms/${link.token}`)).statusCode, 200);
  });

  test('отключённая, неизвестная и кривая ссылки дают одинаковый 404', async () => {
    const off = await call('DELETE', `/objects/${room.id}/share`, { token: tokens.sales });
    assert.equal(off.statusCode, 200, off.body);
    assert.equal(readJson(off).link.enabled, false);
    assert.equal(readJson(off).link.token, null);
    const afterOff = readJson(await call('GET', `/objects/${room.id}/share`, { token: tokens.sales })).link;
    assert.equal(afterOff.disabled, true, 'отключённую вручную ссылку видно по признаку disabled');

    const dead = await call('GET', `/public/rooms/${link.token}`);
    const unknown = await call('GET', `/public/rooms/${newShareToken()}`);
    const junk = await call('GET', '/public/rooms/abc');
    for (const response of [dead, unknown, junk]) {
      assert.equal(response.statusCode, 404);
      assert.equal(readJson(response).message, 'Ссылка недоступна');
    }
    const stored = JSON.parse(readFileSync(platformFile, 'utf8')).roomShares.find((row) => row.objectId === room.id);
    assert.equal(stored.enabled, false);
    assert.equal(stored.token, undefined, 'токен стёрт');
    assert.equal(stored.snapshot, undefined, 'снимок стёрт');
  });

  test('отключённую ссылку не оживляют ни обновление снимка, ни повторное открытие', async () => {
    const dead = link.token;
    const stored = () =>
      JSON.parse(readFileSync(platformFile, 'utf8')).roomShares.find((row) => row.objectId === room.id);
    for (const who of ['owner', 'sales']) {
      for (const body of [{ answers: ANSWERS }, {}, { answers: ANSWERS, renew: false }]) {
        const response = await call('POST', `/objects/${room.id}/share`, { token: tokens[who], body });
        assert.equal(response.statusCode, 200, response.body);
        const view = readJson(response).link;
        assert.equal(view.enabled, false, `${who}: ссылка осталась отключённой`);
        assert.equal(view.token, null);
        assert.equal(view.disabled, true);
      }
    }
    assert.equal((await call('GET', `/public/rooms/${dead}`)).statusCode, 404);
    assert.equal(stored().enabled, false);
    assert.equal(stored().token, undefined, 'токен не появился');
    assert.equal(stored().snapshot, undefined, 'снимок не записан');
    const get = readJson(await call('GET', `/objects/${room.id}/share`, { token: tokens.owner })).link;
    assert.equal(get.enabled, false);
  });

  test('новую ссылку выдаёт только явный запрос владельца или менеджера', async () => {
    const asMeasurer = await call('POST', `/objects/${room.id}/share`, {
      token: tokens.measurer,
      body: { answers: ANSWERS, renew: true },
    });
    assert.equal(asMeasurer.statusCode, 404, 'замерщик без назначения комнату не видит');
    const asCrew = await call('POST', `/objects/${room.id}/share`, {
      token: tokens.crew,
      body: { answers: ANSWERS, renew: true },
    });
    assert.equal(asCrew.statusCode, 403);
    assert.equal((await call('GET', `/public/rooms/${link.token}`)).statusCode, 404);

    const fresh = readJson(
      await call('POST', `/objects/${room.id}/share`, {
        token: tokens.sales,
        body: { answers: ANSWERS, renew: true },
      }),
    ).link;
    assert.equal(fresh.enabled, true);
    assert.notEqual(fresh.token, link.token, 'токен новый');
    assert.equal((await call('GET', `/public/rooms/${link.token}`)).statusCode, 404, 'старый мёртв');
    assert.equal((await call('GET', `/public/rooms/${fresh.token}`)).statusCode, 200);

    // Обычное обновление снимка у живой ссылки токен не меняет.
    const again = readJson(
      await call('POST', `/objects/${room.id}/share`, { token: tokens.owner, body: { answers: ANSWERS } }),
    ).link;
    assert.equal(again.token, fresh.token);
    link = fresh;
  });

  test('замерщик не оживляет и не перевыпускает ссылку, которую отключил менеджер', async () => {
    const mine = readJson(
      await call('POST', '/objects', {
        token: tokens.owner,
        body: { clientName: 'z', address: 'c', city: 'Москва', roomName: 'Кабинет', assignedTo: ids.exec1, room: { answers: ANSWERS } },
      }),
    ).object;
    const made = readJson(await call('POST', `/objects/${mine.id}/share`, { token: tokens.measurer, body: {} })).link;
    assert.equal((await call('DELETE', `/objects/${mine.id}/share`, { token: tokens.owner })).statusCode, 200);
    const plain = readJson(await call('POST', `/objects/${mine.id}/share`, { token: tokens.measurer, body: {} })).link;
    assert.equal(plain.enabled, false);
    const renew = await call('POST', `/objects/${mine.id}/share`, { token: tokens.measurer, body: { renew: true } });
    assert.equal(renew.statusCode, 403);
    assert.equal((await call('GET', `/public/rooms/${made.token}`)).statusCode, 404);
  });

  test('после удаления комнаты ссылка перестаёт открываться', async () => {
    const removed = await call('DELETE', `/objects/${room.id}`, { token: tokens.owner });
    assert.equal(removed.statusCode, 200, removed.body);
    assert.equal((await call('GET', `/public/rooms/${link.token}`)).statusCode, 404);
  });

  test('без ответов Проблемомера ссылку не создать', async () => {
    const empty = readJson(
      await call('POST', '/objects', {
        token: tokens.owner,
        body: { clientName: 'y', address: 'b', city: 'Москва', roomName: 'Холл' },
      }),
    ).object;
    const response = await call('POST', `/objects/${empty.id}/share`, { token: tokens.owner, body: {} });
    assert.equal(response.statusCode, 400);
  });
});
