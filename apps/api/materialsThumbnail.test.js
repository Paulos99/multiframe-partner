import assert from 'node:assert/strict';
import test, { beforeEach, describe } from 'node:test';
import { documentEtag, setObjectStoreTransportForTests } from './objectStore.js';
import { resetStoredDocumentsForTests } from './platformStore.js';

const PARTNERS = 'test-partners';
const MATERIALS = 'test-materials';

process.env.PARTNERS_BUCKET = PARTNERS;
process.env.DEMO_SEED = '1';
process.env.MATERIALS_BUCKET = MATERIALS;
process.env.JWT_SECRET = 'materials-thumb-test';
process.env.YC_ACCESS_KEY_ID = 'YCAJEtestaccesskey123';
process.env.YC_SECRET_ACCESS_KEY = 'test-secret-key-with-enough-length';
process.env.YC_REGION = 'ru-central1';
delete process.env.PLATFORM_FILE;

const objects = new Map();
const types = new Map();
const calls = [];
const signs = [];

function idOf(bucket, key) {
  return `${bucket}::${key}`;
}

setObjectStoreTransportForTests(async (op) => {
  calls.push({ action: op.action, bucket: op.bucket, key: op.key });
  const id = idOf(op.bucket, op.key);
  if (op.action === 'put') {
    objects.set(id, op.body);
    if (op.contentType) types.set(id, op.contentType);
    return { etag: documentEtag(op.body) };
  }
  if (op.action === 'head') {
    if (!objects.has(id)) return { missing: true, etag: null, contentLength: null, contentType: null };
    const body = objects.get(id);
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    return {
      missing: false,
      etag: documentEtag(body),
      contentLength: buf.length,
      contentType: types.get(id) || 'application/octet-stream',
    };
  }
  if (op.action === 'get') return objects.has(id) ? objects.get(id) : null;
  if (op.action === 'delete') {
    objects.delete(id);
    types.delete(id);
    return null;
  }
  if (op.action === 'sign-put') {
    return `https://${op.bucket}.storage.yandexcloud.net/${op.key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${op.expiresIn}&X-Amz-Signature=test`;
  }
  if (op.action === 'sign-get') {
    signs.push(op);
    return `https://${op.bucket}.storage.yandexcloud.net/${op.key}?X-Amz-Expires=${op.expiresIn || 900}&X-Amz-Signature=test`;
  }
  throw new Error(`unexpected storage action ${op.action}`);
});

const { handler } = await import('./index.js');

function call(method, path, { token, body } = {}) {
  return handler({
    httpMethod: method,
    path,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function login(loginName, password) {
  const response = await call('POST', '/auth/login', { body: { login: loginName, password } });
  assert.equal(response.statusCode, 200, response.body);
  return JSON.parse(response.body).token;
}

function place(bucket, key, body, contentType) {
  const id = idOf(bucket, key);
  objects.set(id, body);
  types.set(id, contentType);
}


const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x20, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(20, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20, 2)]);

async function addPdf(admin, id = 'mat_thumbpdf', name = 'КП.pdf') {
  const key = `materials/${id}`;
  place(MATERIALS, key, Buffer.from('%PDF-1.4 test'), 'application/pdf');
  const res = await call('POST', '/materials/files', { token: admin, body: { name, storageKey: key, parentId: null } });
  assert.equal(res.statusCode, 200, res.body);
  return JSON.parse(res.body).materials.find((item) => item.name === name);
}

describe('Миниатюры материалов', { concurrency: false }, () => {
  let admin;
  let owner;
  let crew;

  beforeEach(async () => {
    objects.clear();
    types.clear();
    calls.length = 0;
    signs.length = 0;
    resetStoredDocumentsForTests();
    admin = await login('admin', 'admin1234');
    owner = await login('partner1', 'demo1234');
    crew = await login('crew1', 'exec1234');
    calls.length = 0;
  });

  test('админ: подписанный PUT → подтверждение → thumbnailUrl в списке у всех ролей', async () => {
    const file = await addPdf(admin);
    assert.equal(file.hasThumbnail, false);
    const ticket = await call('POST', `/materials/${file.id}/thumbnail`, { token: admin, body: { upload: true, mime: 'image/webp' } });
    assert.equal(ticket.statusCode, 200, ticket.body);
    const t = JSON.parse(ticket.body);
    assert.equal(t.storageKey, `materials/${file.id}_thumb`);
    assert.equal(t.method, 'PUT');
    assert.equal(t.headers['Content-Type'], 'image/webp');
    place(MATERIALS, t.storageKey, WEBP, 'image/webp');
    const done = await call('POST', `/materials/${file.id}/thumbnail`, { token: admin, body: { storageKey: t.storageKey } });
    assert.equal(done.statusCode, 200, done.body);
    const item = JSON.parse(done.body).materials.find((m) => m.id === file.id);
    assert.equal(item.hasThumbnail, true);
    assert.match(item.thumbnailUrl, /_thumb\?/);
    // Оригинал не тронут.
    assert.ok(objects.has(idOf(MATERIALS, `materials/${file.id}`)));

    for (const token of [owner, crew]) {
      const list = await call('GET', '/materials', { token });
      assert.equal(list.statusCode, 200);
      const mine = JSON.parse(list.body).materials.find((m) => m.id === file.id);
      assert.equal(mine.hasThumbnail, true);
      assert.ok(mine.thumbnailUrl.includes(`${file.id}_thumb`));
      // Внутренние ключи наружу не уходят.
      assert.equal(mine.thumbKey, undefined);
      assert.equal(mine.storageKey, undefined);
    }
    const sign = signs.find((s) => s.key === `materials/${file.id}_thumb`);
    assert.equal(sign.bucket, MATERIALS);
    assert.equal(sign.responseContentType, 'image/webp');
    assert.equal(sign.expiresIn, 6 * 3600);
    // Подпись от начала часа — ссылка стабильна и кэшируется.
    assert.equal(sign.signingDate.getUTCMinutes(), 0);
    assert.equal(sign.signingDate.getUTCSeconds(), 0);

    const one = await call('GET', `/materials/${file.id}/thumbnail`, { token: crew });
    assert.equal(one.statusCode, 200, one.body);
    assert.ok(JSON.parse(one.body).url.includes('_thumb'));
  });

  test('не админ не может загрузить или удалить миниатюру', async () => {
    const file = await addPdf(admin);
    for (const token of [owner, crew]) {
      const res = await call('POST', `/materials/${file.id}/thumbnail`, { token, body: { upload: true } });
      assert.equal(res.statusCode, 403);
      const del = await call('DELETE', `/materials/${file.id}/thumbnail`, { token });
      assert.equal(del.statusCode, 403);
    }
    const anon = await call('GET', `/materials/${file.id}/thumbnail`);
    assert.equal(anon.statusCode, 401);
  });

  test('подтверждение проверяет ключ, тип и размер', async () => {
    const file = await addPdf(admin);
    const wrongKey = await call('POST', `/materials/${file.id}/thumbnail`, { token: admin, body: { storageKey: `materials/${file.id}` } });
    assert.equal(wrongKey.statusCode, 400);
    assert.ok(objects.has(idOf(MATERIALS, `materials/${file.id}`)), 'оригинал не удалён');
    const missing = await call('POST', `/materials/${file.id}/thumbnail`, { token: admin, body: { storageKey: `materials/${file.id}_thumb` } });
    assert.equal(missing.statusCode, 404);
    place(MATERIALS, `materials/${file.id}_thumb`, Buffer.from('<svg/>'), 'image/svg+xml');
    const svg = await call('POST', `/materials/${file.id}/thumbnail`, { token: admin, body: { storageKey: `materials/${file.id}_thumb` } });
    assert.equal(svg.statusCode, 400);
    assert.equal(objects.has(idOf(MATERIALS, `materials/${file.id}_thumb`)), false);
    place(MATERIALS, `materials/${file.id}_thumb`, Buffer.alloc(1024 * 1024 + 1, 1), 'image/jpeg');
    const big = await call('POST', `/materials/${file.id}/thumbnail`, { token: admin, body: { storageKey: `materials/${file.id}_thumb` } });
    assert.equal(big.statusCode, 413);
    const badType = await call('POST', `/materials/${file.id}/thumbnail`, { token: admin, body: { upload: true, mime: 'text/html' } });
    assert.equal(badType.statusCode, 400);
  });

  test('base64: только webp/jpeg/png по сигнатуре', async () => {
    const file = await addPdf(admin);
    const bad = await call('POST', `/materials/${file.id}/thumbnail`, { token: admin, body: { contentBase64: Buffer.from('<html>').toString('base64') } });
    assert.equal(bad.statusCode, 400);
    const ok = await call('POST', `/materials/${file.id}/thumbnail`, { token: admin, body: { contentBase64: PNG.toString('base64') } });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(types.get(idOf(MATERIALS, `materials/${file.id}_thumb`)), 'image/png');
    const item = JSON.parse(ok.body).materials.find((m) => m.id === file.id);
    assert.equal(item.hasThumbnail, true);
  });

  test('замена файла сбрасывает миниатюру, удаление материала удаляет её из бакета', async () => {
    const file = await addPdf(admin);
    await call('POST', `/materials/${file.id}/thumbnail`, { token: admin, body: { contentBase64: WEBP.toString('base64') } });
    const replaced = await call('PUT', `/materials/${file.id}/content`, {
      token: admin,
      body: { name: 'КП.pdf', mime: 'application/pdf', contentBase64: Buffer.from('%PDF-1.4 new').toString('base64') },
    });
    assert.equal(replaced.statusCode, 200, replaced.body);
    assert.equal(JSON.parse(replaced.body).materials.find((m) => m.id === file.id).hasThumbnail, false);

    await call('POST', `/materials/${file.id}/thumbnail`, { token: admin, body: { contentBase64: WEBP.toString('base64') } });
    assert.ok(objects.has(idOf(MATERIALS, `materials/${file.id}_thumb`)));
    const del = await call('DELETE', `/materials/${file.id}`, { token: admin });
    assert.equal(del.statusCode, 200, del.body);
    assert.equal(objects.has(idOf(MATERIALS, `materials/${file.id}_thumb`)), false);
    assert.equal(objects.has(idOf(MATERIALS, `materials/${file.id}`)), false);
  });

  test('DELETE /thumbnail убирает только миниатюру', async () => {
    const file = await addPdf(admin);
    await call('POST', `/materials/${file.id}/thumbnail`, { token: admin, body: { contentBase64: WEBP.toString('base64') } });
    const res = await call('DELETE', `/materials/${file.id}/thumbnail`, { token: admin });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(JSON.parse(res.body).materials.find((m) => m.id === file.id).hasThumbnail, false);
    assert.equal(objects.has(idOf(MATERIALS, `materials/${file.id}_thumb`)), false);
    assert.ok(objects.has(idOf(MATERIALS, `materials/${file.id}`)));
  });
});
