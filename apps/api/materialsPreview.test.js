import assert from 'node:assert/strict';
import test, { beforeEach, describe } from 'node:test';
import { documentEtag, setObjectStoreTransportForTests } from './objectStore.js';
import { resetStoredDocumentsForTests } from './platformStore.js';

const PARTNERS = 'test-partners';
const MATERIALS = 'test-materials';

process.env.PARTNERS_BUCKET = PARTNERS;
process.env.DEMO_SEED = '1';
process.env.MATERIALS_BUCKET = MATERIALS;
process.env.JWT_SECRET = 'materials-preview-test';
process.env.YC_ACCESS_KEY_ID = 'YCAJEtestaccesskey123';
process.env.YC_SECRET_ACCESS_KEY = 'test-secret-key-with-enough-length';
process.env.YC_REGION = 'ru-central1';
delete process.env.PLATFORM_FILE;

const objects = new Map();
const types = new Map();
const calls = [];

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
    return `https://${op.bucket}.storage.yandexcloud.net/${op.key}?X-Amz-Signature=test`;
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

const DOC_MIME = 'application/msword';

async function addDoc(admin) {
  const key = 'materials/mat_legacydoc';
  place(MATERIALS, key, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 1, 2, 3]), DOC_MIME);
  const res = await call('POST', '/materials/files', {
    token: admin,
    body: { name: 'Договор.doc', storageKey: key, parentId: null },
  });
  assert.equal(res.statusCode, 200, res.body);
  return JSON.parse(res.body).materials.find((item) => item.name === 'Договор.doc');
}

describe('PDF-копия для предпросмотра материала', { concurrency: false }, () => {
  /** @type {string} */
  let admin;
  /** @type {string} */
  let owner;

  beforeEach(async () => {
    objects.clear();
    types.clear();
    calls.length = 0;
    resetStoredDocumentsForTests();
    admin = await login('admin', 'admin1234');
    owner = await login('partner1', 'demo1234');
    calls.length = 0;
  });

  test('без копии: hasPreview=false и GET /preview отвечает 404', async () => {
    const doc = await addDoc(admin);
    assert.equal(doc.hasPreview, false);
    const res = await call('GET', `/materials/${doc.id}/preview`, { token: owner });
    assert.equal(res.statusCode, 404, res.body);
  });

  test('только admin получает PUT-ссылку и подтверждает копию; читать может любая роль', async () => {
    const doc = await addDoc(admin);
    const denied = await call('POST', `/materials/${doc.id}/preview`, { token: owner, body: { upload: true } });
    assert.equal(denied.statusCode, 403, denied.body);
    const deniedDelete = await call('DELETE', `/materials/${doc.id}/preview`, { token: owner });
    assert.equal(deniedDelete.statusCode, 403, deniedDelete.body);

    const ticket = await call('POST', `/materials/${doc.id}/preview`, { token: admin, body: { upload: true } });
    assert.equal(ticket.statusCode, 200, ticket.body);
    const signed = JSON.parse(ticket.body);
    assert.equal(signed.method, 'PUT');
    assert.equal(signed.storageKey, `materials/${doc.id}_pdfpreview`);
    assert.equal(signed.headers['Content-Type'], 'application/pdf');
    assert.match(signed.url, new RegExp(`https://${MATERIALS}\\.storage\\.yandexcloud\\.net/`));

    // Чужой ключ (например, оригинал другого файла) не принимается.
    const wrong = await call('POST', `/materials/${doc.id}/preview`, {
      token: admin,
      body: { storageKey: 'materials/mat_other' },
    });
    assert.equal(wrong.statusCode, 400, wrong.body);

    const missing = await call('POST', `/materials/${doc.id}/preview`, { token: admin, body: { storageKey: signed.storageKey } });
    assert.equal(missing.statusCode, 404, missing.body);

    place(MATERIALS, signed.storageKey, Buffer.from('%PDF-1.4 test'), 'application/pdf');
    const ok = await call('POST', `/materials/${doc.id}/preview`, { token: admin, body: { storageKey: signed.storageKey } });
    assert.equal(ok.statusCode, 200, ok.body);
    const listed = JSON.parse(ok.body).materials.find((item) => item.id === doc.id);
    assert.equal(listed.hasPreview, true);
    assert.equal(listed.mime, DOC_MIME, 'оригинал не меняется');

    calls.length = 0;
    const read = await call('GET', `/materials/${doc.id}/preview`, { token: owner });
    assert.equal(read.statusCode, 200, read.body);
    const payload = JSON.parse(read.body);
    assert.equal(payload.mime, 'application/pdf');
    assert.equal(payload.name, 'Договор.pdf');
    assert.match(payload.url, new RegExp(`${MATERIALS}.*${doc.id}_pdfpreview`));
    assert.equal(calls.some((item) => item.action === 'sign-get' && item.bucket === PARTNERS), false);

    // Оригинал по-прежнему отдаётся через /content.
    const original = await call('GET', `/materials/${doc.id}/content`, { token: owner });
    assert.equal(original.statusCode, 200, original.body);
    assert.match(JSON.parse(original.body).url, /mat_legacydoc\?/);
  });

  test('небольшая копия через base64 проверяется на PDF; DELETE убирает копию', async () => {
    const doc = await addDoc(admin);
    const notPdf = await call('POST', `/materials/${doc.id}/preview`, {
      token: admin,
      body: { contentBase64: Buffer.from('hello').toString('base64') },
    });
    assert.equal(notPdf.statusCode, 400, notPdf.body);
    const ok = await call('POST', `/materials/${doc.id}/preview`, {
      token: admin,
      body: { contentBase64: Buffer.from('%PDF-1.4 small').toString('base64') },
    });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(objects.has(idOf(MATERIALS, `materials/${doc.id}_pdfpreview`)), true);
    assert.equal(objects.has(idOf(PARTNERS, `materials/${doc.id}_pdfpreview`)), false);

    const removed = await call('DELETE', `/materials/${doc.id}/preview`, { token: admin });
    assert.equal(removed.statusCode, 200, removed.body);
    assert.equal(JSON.parse(removed.body).materials.find((item) => item.id === doc.id).hasPreview, false);
    assert.equal(objects.has(idOf(MATERIALS, `materials/${doc.id}_pdfpreview`)), false);
  });

  test('удаление материала удаляет и его PDF-копию', async () => {
    const doc = await addDoc(admin);
    await call('POST', `/materials/${doc.id}/preview`, {
      token: admin,
      body: { contentBase64: Buffer.from('%PDF-1.4 small').toString('base64') },
    });
    const del = await call('DELETE', `/materials/${doc.id}`, { token: admin });
    assert.equal(del.statusCode, 200, del.body);
    assert.equal(objects.has(idOf(MATERIALS, `materials/${doc.id}_pdfpreview`)), false);
    assert.equal(objects.has(idOf(MATERIALS, 'materials/mat_legacydoc')), false);
  });
});
