import assert from 'node:assert/strict';
import test, { beforeEach, describe } from 'node:test';
import { documentEtag, setObjectStoreTransportForTests } from './objectStore.js';
import { resetStoredDocumentsForTests } from './platformStore.js';

const PARTNERS = 'test-partners';
const MATERIALS = 'test-materials';

process.env.PARTNERS_BUCKET = PARTNERS;
process.env.DEMO_SEED = '1';
process.env.MATERIALS_BUCKET = MATERIALS;
process.env.JWT_SECRET = 'materials-stream-test';
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
    return `https://${op.bucket}.storage.yandexcloud.net/${op.key}?X-Amz-Expires=${op.expiresIn || 900}&type=${encodeURIComponent(op.responseContentType || '')}&X-Amz-Signature=test`;
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


function platformKey() {
  for (const id of objects.keys()) if (id.startsWith(`${PARTNERS}::`) && id.includes('platform')) return id;
  throw new Error('platform document not found');
}

/** Имитирует работу скрипта materials-video-stream: в узле появляется streamKey. */
function attachStream(id, size) {
  const key = platformKey();
  const platform = JSON.parse(String(objects.get(key)));
  const node = platform.materials.find((item) => item.id === id);
  Object.assign(node, { streamKey: `materials/${id}_stream`, streamSize: size, streamUpdatedAt: '2026-10-19T08:00:00.000Z' });
  objects.set(key, JSON.stringify(platform));
}

describe('копия видео для просмотра онлайн', { concurrency: false }, () => {
  let admin;
  let crew;
  beforeEach(async () => {
    objects.clear();
    types.clear();
    calls.length = 0;
    resetStoredDocumentsForTests();
    admin = await login('admin', 'admin1234');
    crew = await login('crew1', 'exec1234');
  });

  test('без копии: только оригинал, ссылка на 6 часов', async () => {
    place(MATERIALS, 'materials/mat_vid', Buffer.alloc(64), 'video/mp4');
    const add = await call('POST', '/materials/files', { token: admin, body: { name: 'Урок.mp4', storageKey: 'materials/mat_vid', parentId: null } });
    assert.equal(add.statusCode, 200, add.body);
    const video = JSON.parse(add.body).materials.find((m) => m.name === 'Урок.mp4');
    assert.equal(video.hasStream, false);
    const res = await call('GET', `/materials/${video.id}/content`, { token: crew });
    assert.equal(res.statusCode, 200, res.body);
    const data = JSON.parse(res.body);
    assert.match(data.url, /X-Amz-Expires=21600/);
    assert.equal(data.streamUrl, undefined);
  });

  test('с копией: content отдаёт streamUrl (video/mp4), список — hasStream, удаление чистит копию', async () => {
    place(MATERIALS, 'materials/mat_vid', Buffer.alloc(64), 'video/mp4');
    const add = await call('POST', '/materials/files', { token: admin, body: { name: 'Урок.mp4', storageKey: 'materials/mat_vid', parentId: null } });
    const video = JSON.parse(add.body).materials.find((m) => m.name === 'Урок.mp4');
    attachStream(video.id, 32);
    place(MATERIALS, `materials/${video.id}_stream`, Buffer.alloc(32), 'video/mp4');
    resetStoredDocumentsForTests();
    const list = JSON.parse((await call('GET', '/materials', { token: crew })).body).materials;
    const item = list.find((m) => m.id === video.id);
    assert.equal(item.hasStream, true);
    assert.equal(item.streamSize, 32);
    assert.equal('streamKey' in item, false, 'ключ хранилища наружу не отдаётся');
    const data = JSON.parse((await call('GET', `/materials/${video.id}/content`, { token: crew })).body);
    assert.match(data.url, new RegExp(`materials/${video.id}\\?`));
    assert.match(data.streamUrl, new RegExp(`materials/${video.id}_stream\\?X-Amz-Expires=21600&type=video%2Fmp4`));
    assert.equal(data.streamMime, 'video/mp4');
    assert.equal(data.streamSize, 32);
    const del = await call('DELETE', `/materials/${video.id}`, { token: admin });
    assert.equal(del.statusCode, 200, del.body);
    assert.equal(objects.has(idOf(MATERIALS, `materials/${video.id}_stream`)), false);
  });
});
