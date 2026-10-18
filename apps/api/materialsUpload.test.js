import assert from 'node:assert/strict';
import test, { beforeEach, describe } from 'node:test';
import { documentEtag, setObjectStoreTransportForTests } from './objectStore.js';
import { resetStoredDocumentsForTests } from './platformStore.js';

const PARTNERS = 'test-partners';
const MATERIALS = 'test-materials';

process.env.PARTNERS_BUCKET = PARTNERS;
process.env.MATERIALS_BUCKET = MATERIALS;
process.env.JWT_SECRET = 'materials-upload-test';
process.env.YC_ACCESS_KEY_ID = 'YCAJEtestaccesskey123';
process.env.YC_SECRET_ACCESS_KEY = 'test-secret-key-with-enough-length';
process.env.YC_REGION = 'ru-central1';
delete process.env.PLATFORM_FILE;

const objects = new Map();
const types = new Map();
const calls = [];
const mpu = new Map();

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
  if (op.action === 'mpu-create') {
    mpu.set(op.key, { parts: new Map(), contentType: op.contentType });
    return { uploadId: `up-${op.key.split('/')[1]}` };
  }
  if (op.action === 'mpu-sign-part') {
    return `https://${op.bucket}.storage.yandexcloud.net/${op.key}?partNumber=${op.partNumber}&uploadId=${op.uploadId}&X-Amz-Signature=test`;
  }
  if (op.action === 'mpu-list') {
    const up = mpu.get(op.key);
    return up ? [...up.parts.entries()].map(([n, b]) => ({ partNumber: n, etag: `"e${n}"`, size: b.length })) : [];
  }
  if (op.action === 'mpu-complete') {
    const up = mpu.get(op.key);
    const body = Buffer.concat(op.parts.map((p) => up.parts.get(p.partNumber)));
    objects.set(id, body);
    types.set(id, up.contentType || 'application/octet-stream');
    mpu.delete(op.key);
    return null;
  }
  if (op.action === 'mpu-abort') {
    mpu.delete(op.key);
    return null;
  }
  if (op.action === 'sign-get') {
    calls[calls.length - 1].contentType = op.responseContentType;
    calls[calls.length - 1].disposition = op.responseContentDisposition;
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

describe('регистрация крупного файла материалов', { concurrency: false }, () => {
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

  test('upload-url выдаёт PUT в бакет материалов, чужой ключ не подписывается', async () => {
    const denied = await call('POST', '/materials/files/upload-url', {
      token: owner,
      body: { name: 'Видео.mp4', mime: 'video/mp4' },
    });
    assert.equal(denied.statusCode, 403, denied.body);
    assert.equal(calls.some((item) => item.action === 'sign-put'), false);

    const issued = await call('POST', '/materials/files/upload-url', {
      token: admin,
      body: { name: 'Видео.mp4', mime: 'video/mp4' },
    });
    assert.equal(issued.statusCode, 200, issued.body);
    assert.equal(issued.headers['Cache-Control'], 'no-store');
    const ticket = JSON.parse(issued.body);
    assert.equal(ticket.method, 'PUT');
    assert.match(ticket.storageKey, /^materials\/mat_[a-z0-9_]+$/i);
    assert.equal(ticket.headers['Content-Type'], 'video/mp4');
    assert.match(ticket.url, new RegExp(`https://${MATERIALS}\\.storage\\.yandexcloud\\.net/`));
    assert.equal(ticket.url.includes(PARTNERS), false);
    assert.equal(calls.some((item) => item.action === 'sign-put' && item.bucket === MATERIALS && item.key === ticket.storageKey), true);
    assert.equal(calls.some((item) => item.action === 'put'), false);
    assert.equal(calls.some((item) => item.bucket === PARTNERS && item.action === 'put'), false);
  });

  test('подтверждение берёт размер и тип из HeadObject и отвергает чужой префикс', async () => {
    const video = Buffer.alloc(12000, 1);
    const key = 'materials/mat_uploadedvideo';
    place(MATERIALS, key, video, 'video/mp4');
    calls.length = 0;

    const registered = await call('POST', '/materials/files', {
      token: admin,
      body: {
        name: 'Монтаж.mp4',
        storageKey: key,
        parentId: null,
        size: 1,
        mime: 'text/plain',
      },
    });
    assert.equal(registered.statusCode, 200, registered.body);
    const node = JSON.parse(registered.body).materials.find((item) => item.name === 'Монтаж.mp4');
    assert.ok(node);
    assert.equal(node.size, video.length);
    assert.equal(node.hasFile, true);
    assert.equal(calls.some((item) => item.action === 'head' && item.bucket === MATERIALS && item.key === key), true);
    assert.equal(calls.some((item) => item.action === 'put' && item.bucket === MATERIALS), false);

    const stored = JSON.parse(objects.get(idOf(PARTNERS, 'platform-v2.json')));
    const saved = stored.materials.find((item) => item.storageKey === key);
    assert.equal(saved.mime, 'video/mp4');
    assert.equal(saved.size, video.length);
    assert.equal(saved.bucket, 'materials');

    calls.length = 0;
    const forbidden = [
      'platform-v2.json',
      'analytics-events.json',
      'docs/org/file.pdf',
      'materials/not-a-material',
      'materials/mat_ok/extra',
      'materials/../platform-v2.json',
      '../platform-v2.json',
    ];
    for (const storageKey of forbidden) {
      const response = await call('POST', '/materials/files', {
        token: admin,
        body: { name: 'Чужой.bin', storageKey },
      });
      assert.equal(response.statusCode, 400, `${storageKey}: ${response.body}`);
    }
    assert.equal(calls.some((item) => item.action === 'head' && item.bucket === MATERIALS), false);

    const missing = await call('POST', '/materials/files', {
      token: admin,
      body: { name: 'Нет.mp4', storageKey: 'materials/mat_absent' },
    });
    assert.equal(missing.statusCode, 404, missing.body);

    const again = await call('POST', '/materials/files', {
      token: admin,
      body: { name: 'Копия.mp4', storageKey: key },
    });
    assert.equal(again.statusCode, 409, again.body);

    place(MATERIALS, 'materials/mat_htmlpage', Buffer.from('<html></html>'), 'text/html');
    const html = await call('POST', '/materials/files', {
      token: admin,
      body: { name: 'Страница.html', storageKey: 'materials/mat_htmlpage' },
    });
    // Белого списка больше нет: HTML принимается, но отдаётся только как attachment.
    assert.equal(html.statusCode, 200, html.body);

    place(MATERIALS, 'materials/mat_emptyfile', Buffer.alloc(0), 'video/mp4');
    const empty = await call('POST', '/materials/files', {
      token: admin,
      body: { name: 'Пусто.mp4', storageKey: 'materials/mat_emptyfile' },
    });
    assert.equal(empty.statusCode, 400, empty.body);
  });

  test('прежняя загрузка маленького файла через API остаётся', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n').toString('base64');
    const response = await call('POST', '/materials/files', {
      token: admin,
      body: { name: 'Памятка.pdf', mime: 'application/pdf', contentBase64: pdf },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(
      calls.some((item) => item.action === 'put' && item.bucket === MATERIALS && String(item.key).startsWith('materials/mat_')),
      true,
    );
    assert.equal(calls.some((item) => item.bucket === PARTNERS && String(item.key).startsWith('materials/')), false);

    const both = await call('POST', '/materials/files', {
      token: admin,
      body: { name: 'Сразу.pdf', storageKey: 'materials/mat_both', contentBase64: pdf },
    });
    assert.equal(both.statusCode, 400, both.body);
  });
});


describe('multipart-загрузка материалов любого типа и размера', { concurrency: false }, () => {
  let admin;
  let owner;
  beforeEach(async () => {
    objects.clear();
    types.clear();
    mpu.clear();
    calls.length = 0;
    resetStoredDocumentsForTests();
    admin = await login('admin', 'admin1234');
    owner = await login('partner1', 'demo1234');
  });

  test('не-админ получает 403 на всех шагах multipart', async () => {
    for (const step of ['', '/parts', '/complete', '/abort']) {
      const response = await call('POST', `/materials/files/multipart${step}`, {
        token: owner,
        body: { name: 'a.bin', size: 10, storageKey: 'materials/mat_x', uploadId: 'u', partNumbers: [1] },
      });
      assert.equal(response.statusCode, 403, `${step}: ${response.body}`);
    }
    assert.equal(calls.some((c) => String(c.action).startsWith('mpu-')), false);
  });

  test('start → parts → complete регистрирует файл неизвестного типа', async () => {
    const size = 7 * 1024 * 1024 * 1024; // 7 ГБ — больше одиночного PUT
    const started = await call('POST', '/materials/files/multipart', {
      token: admin,
      body: { name: 'Архив.7z', size },
    });
    assert.equal(started.statusCode, 200, started.body);
    const ticket = JSON.parse(started.body);
    assert.match(ticket.storageKey, /^materials\/mat_/);
    assert.ok(ticket.partSize >= 8 * 1024 * 1024 && ticket.partSize <= 100 * 1024 * 1024);
    assert.ok(ticket.partCount <= 10000);
    assert.equal(ticket.mime, 'application/octet-stream');

    const signed = await call('POST', '/materials/files/multipart/parts', {
      token: admin,
      body: { storageKey: ticket.storageKey, uploadId: ticket.uploadId, partNumbers: [1, 2] },
    });
    assert.equal(signed.statusCode, 200, signed.body);
    const urls = JSON.parse(signed.body).urls;
    assert.match(urls[1], /test-materials\.storage\.yandexcloud\.net/);
    assert.equal(urls[1].includes(PARTNERS), false);

    // «Браузер» залил две части (в тесте маленькие).
    const up = mpu.get(ticket.storageKey);
    up.parts.set(1, Buffer.alloc(1000, 1));
    const early = await call('POST', '/materials/files/multipart/complete', {
      token: admin,
      body: { storageKey: ticket.storageKey, uploadId: ticket.uploadId, partCount: 2, name: 'Архив.7z' },
    });
    assert.equal(early.statusCode, 409, early.body);
    up.parts.set(2, Buffer.alloc(500, 2));

    const done = await call('POST', '/materials/files/multipart/complete', {
      token: admin,
      body: {
        storageKey: ticket.storageKey,
        uploadId: ticket.uploadId,
        partCount: 2,
        name: 'Архив.7z',
        parentId: null,
      },
    });
    assert.equal(done.statusCode, 200, done.body);
    const node = JSON.parse(done.body).materials.find((item) => item.name === 'Архив.7z');
    assert.ok(node);
    assert.equal(node.size, 1500);

    const content = await call('GET', `/materials/${node.id}/content`, { token: owner });
    assert.equal(content.statusCode, 200, content.body);
    const sign = calls.find((c) => c.action === 'sign-get');
    assert.equal(sign.contentType, 'application/octet-stream');
    assert.match(sign.disposition, /^attachment;/);
  });

  test('SVG и HTML отдаются только как attachment, видео — inline', async () => {
    for (const [name, mime, kind] of [
      ['x.svg', 'image/svg+xml', 'attachment'],
      ['x.html', 'text/html', 'attachment'],
      ['x.mp4', 'video/mp4', 'inline'],
    ]) {
      const key = `materials/mat_t${kind}${name.replace(/\W/g, '')}`;
      place(MATERIALS, key, Buffer.from('<svg onload=alert(1)>'), mime);
      const reg = await call('POST', '/materials/files', { token: admin, body: { name, storageKey: key } });
      assert.equal(reg.statusCode, 200, reg.body);
      const node = JSON.parse(reg.body).materials.find((item) => item.storageKey === key || item.name === name);
      calls.length = 0;
      await call('GET', `/materials/${node.id}/content`, { token: owner });
      const sign = calls.find((c) => c.action === 'sign-get');
      assert.match(sign.disposition, new RegExp(`^${kind};`), name);
      if (kind === 'attachment') assert.equal(sign.contentType, 'application/octet-stream');
    }
  });

  test('abort доступен админу и чистит загрузку', async () => {
    const started = JSON.parse(
      (await call('POST', '/materials/files/multipart', { token: admin, body: { name: 'a.mp4', size: 20e6 } })).body,
    );
    const aborted = await call('POST', '/materials/files/multipart/abort', {
      token: admin,
      body: { storageKey: started.storageKey, uploadId: started.uploadId },
    });
    assert.equal(aborted.statusCode, 200, aborted.body);
    assert.equal(mpu.has(started.storageKey), false);
  });
});
