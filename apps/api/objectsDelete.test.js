import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, describe } from 'node:test';

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
  return JSON.parse(response.body).token;
}

const readJson = (response) => JSON.parse(response.body || '{}');
const storedObject = (id) =>
  JSON.parse(readFileSync(platformFile, 'utf8')).objects.find((obj) => obj.id === id);
const PDF = Buffer.from('%PDF-1.4\n%test\n').toString('base64');

describe('удаление объектов', { concurrency: false }, () => {
  /** @type {Record<string, string>} */
  const tokens = {};

  async function createRoom(name) {
    const created = readJson(
      await call('POST', '/objects', {
        token: tokens.owner,
        body: { clientName: name, address: 'ул. Тестовая, 1', city: 'Москва', roomName: 'Кухня' },
      }),
    );
    assert.ok(created.object?.id, 'объект создан');
    return created.object;
  }

  test('замерщик, монтажник и админ получают 403, комната остаётся', async () => {
    tokens.owner = await login('partner1', 'demo1234');
    tokens.sales = await login('sales1', 'exec1234');
    tokens.measurer = await login('exec1', 'exec1234');
    tokens.crew = await login('crew1', 'exec1234');
    tokens.other = await login('partner2', 'demo1234');
    tokens.admin = await login('admin', 'admin1234');

    const room = await createRoom('Запрет удаления');
    for (const role of ['measurer', 'crew', 'admin']) {
      const response = await call('DELETE', `/objects/${room.id}`, { token: tokens[role] });
      assert.equal(response.statusCode, 403, `${role}: ${response.body}`);
      assert.ok(storedObject(room.id), `${role} не удалил объект`);
    }
    const foreign = await call('DELETE', `/objects/${room.id}`, { token: tokens.other });
    assert.equal(foreign.statusCode, 403, 'владелец другой компании не удаляет');
    assert.ok(storedObject(room.id));
    assert.equal((await call('DELETE', `/objects/${room.id}`)).statusCode, 401);
  });

  test('владелец удаляет объект вместе с документами', async () => {
    const room = await createRoom('Удаление владельцем');
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

  test('менеджер удаляет комнату своей компании', async () => {
    const room = await createRoom('Удаление менеджером');
    const removed = await call('DELETE', `/objects/${room.id}`, { token: tokens.sales });
    assert.equal(removed.statusCode, 200, removed.body);
    assert.equal(storedObject(room.id), undefined);
  });
});
