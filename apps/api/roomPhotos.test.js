import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, describe } from 'node:test';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-photos-'));
process.env.PLATFORM_FILE = path.join(dir, 'platform.json');
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'room-photos-local-test-secret-00';

const { handler } = await import('./index.js');
const { cleanJpeg, hasExifSegment, looksLikeJpeg } = await import('./jpegClean.js');

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Минимальный JPEG: кадр width×height, при желании — EXIF с «GPS» и комментарий. */
function makeJpeg({ width = 64, height = 48, exif = false, filler = 0 } = {}) {
  const parts = [Buffer.from([0xff, 0xd8])];
  parts.push(Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]));
  if (exif) {
    const payload = Buffer.from('Exif\0\0GPSLatitude=55.75;GPSLongitude=37.61', 'latin1');
    const head = Buffer.alloc(4);
    head.writeUInt16BE(0xffe1, 0);
    head.writeUInt16BE(payload.length + 2, 2);
    parts.push(head, payload);
    const note = Buffer.from('секрет', 'utf8');
    const com = Buffer.alloc(4);
    com.writeUInt16BE(0xfffe, 0);
    com.writeUInt16BE(note.length + 2, 2);
    parts.push(com, note);
  }
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 3;
  parts.push(sof);
  parts.push(Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]));
  parts.push(Buffer.alloc(filler, 0x11));
  parts.push(Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

const b64 = (buf) => buf.toString('base64');

function call(method, urlPath, { token, body, query } = {}) {
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  return handler({
    httpMethod: method,
    path: urlPath,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    queryStringParameters: query,
    url: `${urlPath}${qs}`,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const readJson = (response) => JSON.parse(response.body || '{}');
/** @type {Record<string, string>} */
const ids = {};

async function login(name, password) {
  const response = await call('POST', '/auth/login', { body: { login: name, password } });
  assert.equal(response.statusCode, 200, response.body);
  const data = JSON.parse(response.body);
  ids[name] = data.user.id;
  return data.token;
}

describe('разбор JPEG', () => {
  test('EXIF с GPS и комментарии вырезаются, размер читается', () => {
    const source = makeJpeg({ width: 120, height: 80, exif: true, filler: 20 });
    assert.ok(hasExifSegment(source));
    const cleaned = cleanJpeg(source);
    assert.ok(cleaned);
    assert.equal(cleaned.width, 120);
    assert.equal(cleaned.height, 80);
    assert.ok(cleaned.stripped > 0);
    assert.ok(!hasExifSegment(cleaned.buffer));
    assert.ok(!cleaned.buffer.includes(Buffer.from('GPSLatitude')));
    assert.ok(!cleaned.buffer.includes(Buffer.from('секрет')));
    assert.ok(looksLikeJpeg(cleaned.buffer));
  });

  test('не JPEG и обрезанный файл отклоняются', () => {
    assert.equal(cleanJpeg(Buffer.from('%PDF-1.4 hello')), null);
    assert.equal(cleanJpeg(makeJpeg().subarray(0, 25)), null);
    assert.equal(cleanJpeg(Buffer.alloc(0)), null);
  });
});

describe('фотоотчёт комнаты', { concurrency: false }, () => {
  const tokens = {};
  let room;
  let otherRoom;

  test('подготовка: комната назначена замерщику, ещё одна — монтажнику', async () => {
    tokens.owner = await login('partner1', 'demo1234');
    tokens.sales = await login('sales1', 'exec1234');
    tokens.measurer = await login('exec1', 'exec1234');
    tokens.crew = await login('crew1', 'exec1234');
    tokens.other = await login('partner2', 'demo1234');
    tokens.admin = await login('admin', 'admin1234');
    const made = readJson(
      await call('POST', '/objects', {
        token: tokens.owner,
        body: { clientName: 'Клиент Секретов', clientPhone: '+7 900 000-00-00', status: 'measured', address: 'ул. Тайная, 1', city: 'Москва', roomName: 'Спальня', assignedTo: ids.exec1, room: { areaM2: 18 }, estimate: { panels: 9, dowels: 18, totalCost: 424242 } },
      }),
    );
    room = made.object;
    otherRoom = readJson(
      await call('POST', '/objects', {
        token: tokens.owner,
        body: { clientName: 'x', address: 'a', city: 'Москва', roomName: 'Кухня', assignedTo: ids.crew1, room: { areaM2: 12 } },
      }),
    ).object;
    assert.ok(room.id && otherRoom.id);
  });

  test('замерщик: добавляет «До», остальные этапы запрещены', async () => {
    const ok = await call('POST', `/objects/${room.id}/photos`, {
      token: tokens.measurer,
      body: { stage: 'before', caption: 'Потолок до', image: b64(makeJpeg({ exif: true })), thumb: b64(makeJpeg({ width: 16, height: 12 })) },
    });
    assert.equal(ok.statusCode, 200, ok.body);
    const photo = readJson(ok).photo;
    assert.equal(photo.stage, 'before');
    assert.equal(photo.caption, 'Потолок до');
    assert.ok(photo.url && photo.thumbUrl);
    assert.ok(!('storageKey' in photo));
    for (const stage of ['progress', 'after']) {
      const denied = await call('POST', `/objects/${room.id}/photos`, {
        token: tokens.measurer,
        body: { stage, image: b64(makeJpeg()), thumb: b64(makeJpeg()) },
      });
      assert.equal(denied.statusCode, 403, stage);
    }
  });

  test('на сервере в сохранённом файле нет EXIF', async () => {
    const list = readJson(await call('GET', `/objects/${room.id}/photos`, { token: tokens.owner }));
    const url = list.photos[0].url;
    assert.match(url, /^\/photo-file\/ph_/);
    const [filePath, search] = url.split('?');
    const file = await call('GET', filePath, { query: Object.fromEntries(new URLSearchParams(search)) });
    assert.equal(file.statusCode, 200);
    assert.equal(file.isBase64Encoded, true);
    const bytes = Buffer.from(file.body, 'base64');
    assert.ok(looksLikeJpeg(bytes));
    assert.ok(!hasExifSegment(bytes));
    assert.ok(!bytes.includes(Buffer.from('GPSLatitude')));
  });

  test('ссылка на файл: чужая подпись, просроченная и подделанная не работают', async () => {
    const list = readJson(await call('GET', `/objects/${room.id}/photos`, { token: tokens.owner }));
    const [filePath, search] = list.photos[0].url.split('?');
    const q = Object.fromEntries(new URLSearchParams(search));
    assert.equal((await call('GET', filePath, { query: { ...q, s: 'x'.repeat(43) } })).statusCode, 404);
    assert.equal((await call('GET', filePath, { query: { ...q, e: String(Number(q.e) - 3600) } })).statusCode, 404);
    assert.equal((await call('GET', filePath, { query: { ...q, v: 'thumb' } })).statusCode, 404, 'подпись относится к своей версии файла');
    assert.equal((await call('GET', filePath, { query: {} })).statusCode, 404);
  });

  test('замерщик видит только «До»; монтажник добавляет все три', async () => {
    const crewRoom = otherRoom.id;
    for (const stage of ['before', 'progress', 'after']) {
      const res = await call('POST', `/objects/${crewRoom}/photos`, {
        token: tokens.crew,
        body: { stage, image: b64(makeJpeg()), thumb: b64(makeJpeg({ width: 8, height: 6 })) },
      });
      assert.equal(res.statusCode, 200, `${stage}: ${res.body}`);
    }
    const asCrew = readJson(await call('GET', `/objects/${crewRoom}/photos`, { token: tokens.crew }));
    assert.deepEqual(asCrew.photos.map((p) => p.stage), ['before', 'progress', 'after']);
    assert.deepEqual(asCrew.canAdd, ['before', 'progress', 'after']);

    // монтажник добавляет в комнату замерщика: комната ему не назначена
    const hidden = await call('POST', `/objects/${room.id}/photos`, {
      token: tokens.crew,
      body: { stage: 'after', image: b64(makeJpeg()), thumb: b64(makeJpeg()) },
    });
    assert.equal(hidden.statusCode, 404);

    // менеджер докладывает «После» в комнату замерщика, замерщик его не видит
    const afterByManager = await call('POST', `/objects/${room.id}/photos`, {
      token: tokens.sales,
      body: { stage: 'after', image: b64(makeJpeg()), thumb: b64(makeJpeg()) },
    });
    assert.equal(afterByManager.statusCode, 200, afterByManager.body);
    const asMeasurer = readJson(await call('GET', `/objects/${room.id}/photos`, { token: tokens.measurer }));
    assert.deepEqual(asMeasurer.photos.map((p) => p.stage), ['before']);
    assert.deepEqual(asMeasurer.canAdd, ['before']);
    const asOwner = readJson(await call('GET', `/objects/${room.id}/photos`, { token: tokens.owner }));
    assert.deepEqual(asOwner.photos.map((p) => p.stage).sort(), ['after', 'before']);
  });

  test('число фото в списке комнат зависит от роли, ключей бакета там нет', async () => {
    const asMeasurer = readJson(await call('GET', '/objects', { token: tokens.measurer })).objects.find((o) => o.id === room.id);
    assert.deepEqual(asMeasurer.photoCounts, { before: 1, progress: 0, after: 0 });
    const asOwner = readJson(await call('GET', '/objects', { token: tokens.owner })).objects.find((o) => o.id === room.id);
    assert.deepEqual(asOwner.photoCounts, { before: 1, progress: 0, after: 1 });
    const raw = (await call('GET', '/objects', { token: tokens.owner })).body;
    assert.ok(!raw.includes('storageKey'));
    assert.ok(!raw.includes('thumbKey'));
    assert.ok(!('photos' in asOwner));
  });

  test('чужая компания комнату не видит; без входа 401', async () => {
    assert.equal((await call('GET', `/objects/${room.id}/photos`, { token: tokens.other })).statusCode, 404);
    assert.equal((await call('GET', `/objects/${room.id}/photos`)).statusCode, 401);
    assert.equal(
      (await call('POST', `/objects/${room.id}/photos`, { token: tokens.other, body: { stage: 'before', image: b64(makeJpeg()), thumb: b64(makeJpeg()) } })).statusCode,
      404,
    );
  });

  test('админ видит все этапы, но не добавляет', async () => {
    const asAdmin = readJson(await call('GET', `/objects/${room.id}/photos`, { token: tokens.admin }));
    assert.equal(asAdmin.photos.length, 2);
    const add = await call('POST', `/objects/${room.id}/photos`, {
      token: tokens.admin,
      body: { stage: 'before', image: b64(makeJpeg()), thumb: b64(makeJpeg()) },
    });
    assert.equal(add.statusCode, 403);
  });

  test('проверки файла: не JPEG, слишком большой, неизвестный этап', async () => {
    const send = (body) => call('POST', `/objects/${room.id}/photos`, { token: tokens.sales, body });
    assert.equal((await send({ stage: 'before', image: b64(Buffer.from('%PDF-1.4 abc')), thumb: b64(makeJpeg()) })).statusCode, 400);
    assert.equal((await send({ stage: 'before', image: b64(makeJpeg({ filler: 2_000_000 })), thumb: b64(makeJpeg()) })).statusCode, 413);
    assert.equal((await send({ stage: 'before', image: b64(makeJpeg({ width: 9000, height: 9000 })), thumb: b64(makeJpeg()) })).statusCode, 413);
    assert.equal((await send({ stage: 'secret', image: b64(makeJpeg()), thumb: b64(makeJpeg()) })).statusCode, 400);
    assert.equal((await send({ stage: 'before', thumb: b64(makeJpeg()) })).statusCode, 400);
  });

  test('подпись правит и фото удаляет автор; чужое монтажник не удаляет', async () => {
    const list = readJson(await call('GET', `/objects/${otherRoom.id}/photos`, { token: tokens.crew }));
    const mine = list.photos[0];
    const edit = await call('PATCH', `/objects/${otherRoom.id}/photos/${mine.id}`, { token: tokens.crew, body: { caption: '  Итог  ' } });
    assert.equal(edit.statusCode, 200, edit.body);
    assert.equal(readJson(edit).photo.caption, 'Итог');

    // фото в комнате замерщика: монтажнику комната не видна, замерщику чужое «После» не видно
    const measurerPhoto = readJson(await call('GET', `/objects/${room.id}/photos`, { token: tokens.measurer })).photos[0];
    const otherDelete = await call('DELETE', `/objects/${room.id}/photos/${measurerPhoto.id}`, { token: tokens.crew });
    assert.equal(otherDelete.statusCode, 404);

    const del = await call('DELETE', `/objects/${otherRoom.id}/photos/${mine.id}`, { token: tokens.crew });
    assert.equal(del.statusCode, 200);
    const after = readJson(await call('GET', `/objects/${otherRoom.id}/photos`, { token: tokens.crew }));
    assert.equal(after.photos.length, 2);
    // менеджер удаляет любое в своей компании
    const byManager = await call('DELETE', `/objects/${otherRoom.id}/photos/${after.photos[0].id}`, { token: tokens.sales });
    assert.equal(byManager.statusCode, 200);
  });

  test('кейсы: только админ, с фильтрами по партнёру, этапу и дате', async () => {
    assert.equal((await call('GET', '/photo-cases', { token: tokens.owner })).statusCode, 403);
    assert.equal((await call('GET', '/photo-cases', { token: tokens.measurer })).statusCode, 403);
    const all = readJson(await call('GET', '/photo-cases', { token: tokens.admin }));
    const mine = all.cases.find((c) => c.objectId === room.id);
    assert.ok(mine);
    assert.equal(mine.roomName, 'Спальня');
    assert.deepEqual(mine.counts, { before: 1, progress: 0, after: 1 });
    assert.equal(mine.complete, true);
    assert.ok(mine.coverUrl);
    assert.ok(all.partners.length >= 1);
    const raw = JSON.stringify(all);
    for (const secret of ['Клиент Секретов', '+7 900', 'Тайная', '424242', 'storageKey']) {
      assert.ok(!raw.includes(secret), `в кейсах нет «${secret}»`);
    }
    const byOrg = readJson(await call('GET', '/photo-cases', { token: tokens.admin, query: { orgId: mine.orgId } }));
    assert.ok(byOrg.cases.some((c) => c.objectId === room.id));
    const wrongOrg = readJson(await call('GET', '/photo-cases', { token: tokens.admin, query: { orgId: 'org_none' } }));
    assert.equal(wrongOrg.cases.length, 0);
    const progressOnly = readJson(await call('GET', '/photo-cases', { token: tokens.admin, query: { stage: 'progress' } }));
    assert.ok(!progressOnly.cases.some((c) => c.objectId === room.id));
    const future = readJson(await call('GET', '/photo-cases', { token: tokens.admin, query: { from: '2999-01-01' } }));
    assert.equal(future.cases.length, 0);
    const today = new Date().toISOString().slice(0, 10);
    const inRange = readJson(await call('GET', '/photo-cases', { token: tokens.admin, query: { from: today, to: today } }));
    assert.ok(inRange.cases.some((c) => c.objectId === room.id));

    const one = readJson(await call('GET', `/photo-cases/${room.id}`, { token: tokens.admin }));
    assert.equal(one.photos.length, 2);
    assert.equal(one.case.partnerName.length > 0, true);
    assert.equal((await call('GET', `/photo-cases/${room.id}`, { token: tokens.owner })).statusCode, 403);
  });

  test('клиентская страница: фото только после включения, без подписей и авторов', async () => {
    const answers = { roomType: 'bedroom', ceilingAreaM2: 18 };
    const link = readJson(await call('POST', `/objects/${room.id}/share`, { token: tokens.sales, body: { answers } })).link;
    const before = readJson(await call('GET', `/public/rooms/${link.token}`));
    assert.ok(!('photos' in before.share), 'по умолчанию фото клиенту не показываются');

    assert.equal((await call('PATCH', `/objects/${room.id}/photos`, { token: tokens.measurer, body: { clientVisible: true } })).statusCode, 403);
    assert.equal((await call('PATCH', `/objects/${room.id}/photos`, { token: tokens.sales, body: { clientVisible: 'yes' } })).statusCode, 400);
    const on = await call('PATCH', `/objects/${room.id}/photos`, { token: tokens.sales, body: { clientVisible: true } });
    assert.equal(on.statusCode, 200, on.body);

    const response = await call('GET', `/public/rooms/${link.token}`);
    const body = readJson(response);
    assert.deepEqual(body.share.photos.map((p) => p.stage), ['before', 'after']);
    for (const photo of body.share.photos) {
      assert.deepEqual(Object.keys(photo).sort(), ['createdAt', 'height', 'id', 'stage', 'thumbUrl', 'url', 'width']);
    }
    for (const secret of ['Потолок до', 'Клиент Секретов', 'Тайная', '424242', 'storageKey', ids.exec1, ids.sales1]) {
      assert.ok(!response.body.includes(secret), `клиент не видит «${secret}»`);
    }
    // ссылка на файл открывается без входа
    const [filePath, search] = body.share.photos[0].url.split('?');
    const file = await call('GET', filePath, { query: Object.fromEntries(new URLSearchParams(search)) });
    assert.equal(file.statusCode, 200);

    // отключённая ссылка — 404 и без фото
    await call('DELETE', `/objects/${room.id}/share`, { token: tokens.owner });
    assert.equal((await call('GET', `/public/rooms/${link.token}`)).statusCode, 404);
  });

  test('обычное сохранение комнаты не стирает фото; удаление комнаты чистит файлы', async () => {
    const patched = await call('PATCH', `/objects/${room.id}`, { token: tokens.owner, body: { roomName: 'Спальня 2' } });
    assert.equal(patched.statusCode, 200, patched.body);
    const list = readJson(await call('GET', `/objects/${room.id}/photos`, { token: tokens.owner }));
    assert.equal(list.photos.length, 2);
    assert.equal(list.clientVisible, true, 'настройка показа тоже сохраняется');
    const [filePath, search] = list.photos[0].url.split('?');
    const removed = await call('DELETE', `/objects/${room.id}`, { token: tokens.owner });
    assert.equal(removed.statusCode, 200, removed.body);
    const file = await call('GET', filePath, { query: Object.fromEntries(new URLSearchParams(search)) });
    assert.equal(file.statusCode, 404, 'комнаты нет — файл больше не отдаётся');
  });

  test('лимит фото в комнате', async () => {
    const full = readJson(
      await call('POST', '/objects', { token: tokens.owner, body: { clientName: 'z', address: 'z', city: 'Москва', roomName: 'Зал', room: {} } }),
    ).object;
    const body = { stage: 'before', image: b64(makeJpeg()), thumb: b64(makeJpeg({ width: 8, height: 6 })) };
    for (let i = 0; i < 60; i += 1) {
      const res = await call('POST', `/objects/${full.id}/photos`, { token: tokens.owner, body });
      assert.equal(res.statusCode, 200, `${i}: ${res.body}`);
    }
    const over = await call('POST', `/objects/${full.id}/photos`, { token: tokens.owner, body });
    assert.equal(over.statusCode, 409);
  });
});
