import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, describe } from 'node:test';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-offline-'));
const platformFile = path.join(dir, 'platform.json');
process.env.PLATFORM_FILE = platformFile;
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'offline-field-local-test-secret-0';

const { handler } = await import('./index.js');
const { canChangeRoomStage, isStageConflict } = await import('../../packages/shared/roomStage.js');
const { cleanNoteText, isClientId } = await import('../../packages/shared/roomNotes.js');

after(() => rmSync(dir, { recursive: true, force: true }));

function call(method, urlPath, { token, body } = {}) {
  return handler({
    httpMethod: method,
    path: urlPath,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const readJson = (response) => JSON.parse(response.body || '{}');
const stored = (id) => JSON.parse(readFileSync(platformFile, 'utf8')).objects.find((obj) => obj.id === id);
const ids = {};
async function login(name, password) {
  const response = await call('POST', '/auth/login', { body: { login: name, password } });
  assert.equal(response.statusCode, 200, response.body);
  const data = JSON.parse(response.body);
  ids[name] = data.user.id;
  return data.token;
}

/** Минимальный JPEG 64×48. */
function jpeg() {
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(48, 5);
  sof.writeUInt16BE(64, 7);
  sof[9] = 3;
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    sof,
    Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
    Buffer.alloc(10, 0x11),
    Buffer.from([0xff, 0xd9]),
  ]).toString('base64');
}

describe('общие правила', () => {
  test('этап: замерщик — «Черновик» ↔ «Замер», монтажник — нет, владелец и менеджер — любой', () => {
    assert.equal(canChangeRoomStage('measurer', 'draft', 'measured'), true);
    assert.equal(canChangeRoomStage('measurer', 'measured', 'draft'), true);
    assert.equal(canChangeRoomStage('measurer', 'measured', 'quote_sent'), false);
    assert.equal(canChangeRoomStage('measurer', 'install', 'measured'), false);
    assert.equal(canChangeRoomStage('crew', 'install', 'closed'), false);
    assert.equal(canChangeRoomStage('crew', 'install', 'install'), true, 'без смены этапа — можно');
    assert.equal(canChangeRoomStage('owner', 'draft', 'closed'), true);
    assert.equal(canChangeRoomStage('sales', 'install', 'draft'), true);
  });

  test('конфликт этапа: только когда этап на сервере ушёл от того, с которого начинали', () => {
    assert.equal(isStageConflict({ status: 'draft' }, { status: 'measured', baseStatus: 'draft' }), false);
    assert.equal(isStageConflict({ status: 'quote_sent' }, { status: 'measured', baseStatus: 'draft' }), true);
    assert.equal(isStageConflict({ status: 'measured' }, { status: 'measured', baseStatus: 'draft' }), false, 'уже то же самое');
    assert.equal(isStageConflict({ status: 'quote_sent' }, { status: 'measured' }), false, 'без baseStatus — прежнее правило');
  });

  test('заметка и клиентский идентификатор', () => {
    assert.equal(cleanNoteText('  текст\u0007  '), 'текст');
    assert.equal(cleanNoteText('a'.repeat(2000)).length, 1000);
    assert.equal(isClientId('ph_abc12345'), true);
    assert.equal(isClientId('коротко'), false);
    assert.equal(isClientId('a b c d e f g h'), false);
  });
});

describe('работа без связи: сервер', { concurrency: false }, () => {
  const tokens = {};
  let room;

  test('подготовка', async () => {
    tokens.owner = await login('partner1', 'demo1234');
    tokens.measurer = await login('exec1', 'exec1234');
    tokens.crew = await login('crew1', 'exec1234');
    room = readJson(
      await call('POST', '/objects', {
        token: tokens.owner,
        body: { clientName: 'Офлайн', address: 'ул. Полевая, 1', city: 'Москва', roomName: 'Кухня', assignedTo: ids.exec1, room: { areaM2: 10 } },
      }),
    ).object;
    assert.ok(room?.id);
    assert.equal(room.status, 'draft');
  });

  test('замерщик сам ставит «Замер» и возвращает «Черновик», дальше — 403', async () => {
    const measured = await call('PATCH', `/objects/${room.id}`, { token: tokens.measurer, body: { status: 'measured' } });
    assert.equal(measured.statusCode, 200, measured.body);
    assert.equal(readJson(measured).object.status, 'measured');
    assert.match(stored(room.id).history[0].detail, /draft→measured/);
    const quote = await call('PATCH', `/objects/${room.id}`, { token: tokens.measurer, body: { status: 'quote_sent' } });
    assert.equal(quote.statusCode, 403);
    assert.match(readJson(quote).message, /Черновик.*Замер/);
    const back = await call('PATCH', `/objects/${room.id}`, { token: tokens.measurer, body: { status: 'draft' } });
    assert.equal(back.statusCode, 200, back.body);
  });

  test('замерщик присылает комнату целиком (тот же исполнитель) — не 403; чужое назначение — 403', async () => {
    const full = readJson(await call('GET', `/objects/${room.id}`, { token: tokens.measurer })).object;
    const same = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.measurer,
      body: { ...full, room: { ...full.room, areaM2: 12 }, updatedAt: new Date().toISOString() },
    });
    assert.equal(same.statusCode, 200, same.body);
    assert.equal(stored(room.id).room.areaM2, 12);
    const other = await call('PATCH', `/objects/${room.id}`, { token: tokens.measurer, body: { assignedTo: ids.crew1 } });
    assert.equal(other.statusCode, 403);
  });

  test('конфликт этапа: 409 с версией сервера, выбор «оставить моё» проходит', async () => {
    const owner = await call('PATCH', `/objects/${room.id}`, { token: tokens.owner, body: { status: 'quote_sent' } });
    assert.equal(owner.statusCode, 200, owner.body);
    // Замерщик без связи начинал с «Черновика» и поставил «Замер».
    const offline = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.measurer,
      body: { status: 'measured', baseStatus: 'draft', updatedAt: new Date().toISOString() },
    });
    assert.equal(offline.statusCode, 409, offline.body);
    const data = readJson(offline);
    assert.equal(data.code, 'stage_conflict');
    assert.equal(data.object.status, 'quote_sent');
    assert.match(data.message, /КП отправлено/);
    assert.equal(stored(room.id).status, 'quote_sent', 'сервер ничего не поменял');
    assert.equal(stored(room.id).baseStatus, undefined);
    // Владелец решает «оставить моё»: повтор уже от текущего этапа.
    const mine = await call('PATCH', `/objects/${room.id}`, {
      token: tokens.owner,
      body: { status: 'measured', baseStatus: 'quote_sent', updatedAt: new Date().toISOString() },
    });
    assert.equal(mine.statusCode, 200, mine.body);
    assert.equal(stored(room.id).status, 'measured');
  });

  test('фото: повтор с тем же clientId не создаёт дубль', async () => {
    const body = { stage: 'before', caption: 'до', image: jpeg(), thumb: jpeg(), clientId: 'ph_offline_0001' };
    const first = await call('POST', `/objects/${room.id}/photos`, { token: tokens.measurer, body });
    assert.equal(first.statusCode, 200, first.body);
    const again = await call('POST', `/objects/${room.id}/photos`, { token: tokens.measurer, body });
    assert.equal(again.statusCode, 200, again.body);
    assert.equal(readJson(again).duplicate, true);
    assert.equal(readJson(again).photo.id, readJson(first).photo.id);
    assert.equal(readJson(first).photo.clientId, 'ph_offline_0001');
    assert.equal(stored(room.id).photos.length, 1);
    const bad = await call('POST', `/objects/${room.id}/photos`, {
      token: tokens.measurer,
      body: { ...body, clientId: 'плохой id' },
    });
    assert.equal(bad.statusCode, 400);
  });

  test('заметки: добавляются, повтор без дубля, обычный PATCH их не стирает', async () => {
    const first = await call('POST', `/objects/${room.id}/notes`, {
      token: tokens.measurer,
      body: { text: '  Потолок 2,7 м, люстра в центре ', clientId: 'nt_offline_0001', at: '2026-01-09T09:00:00Z' },
    });
    assert.equal(first.statusCode, 200, first.body);
    const note = readJson(first).note;
    assert.equal(note.text, 'Потолок 2,7 м, люстра в центре');
    assert.equal(note.at, '2026-01-09T09:00:00.000Z');
    const again = await call('POST', `/objects/${room.id}/notes`, {
      token: tokens.measurer,
      body: { text: 'Потолок 2,7 м, люстра в центре', clientId: 'nt_offline_0001' },
    });
    assert.equal(readJson(again).duplicate, true);
    assert.equal(stored(room.id).notes.length, 1);
    assert.equal((await call('POST', `/objects/${room.id}/notes`, { token: tokens.measurer, body: { text: '   ' } })).statusCode, 400);
    const patched = await call('PATCH', `/objects/${room.id}`, { token: tokens.measurer, body: { room: { areaM2: 11 } } });
    assert.equal(patched.statusCode, 200, patched.body);
    assert.equal(readJson(patched).object.notes.length, 1, 'заметки приходят с комнатой');
    assert.equal(stored(room.id).notes.length, 1);
    // Чужая комната: монтажник её не видит.
    assert.equal((await call('POST', `/objects/${room.id}/notes`, { token: tokens.crew, body: { text: 'x' } })).statusCode, 404);
  });
});
