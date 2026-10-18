import assert from 'node:assert/strict';
import test, { beforeEach, describe } from 'node:test';
import { documentEtag, normalizeEtag, setObjectStoreTransportForTests } from './objectStore.js';
import { isolateDocumentCacheForTests, mergePlatformDocument, resetStoredDocumentsForTests } from './platformStore.js';

process.env.PARTNERS_BUCKET = 'test-partners';
process.env.MATERIALS_BUCKET = 'test-materials';
process.env.JWT_SECRET = 'platform-store-test';
process.env.YC_ACCESS_KEY_ID = 'YCAJEtestaccesskey123';
process.env.YC_SECRET_ACCESS_KEY = 'test-secret-key-with-enough-length';
process.env.YC_REGION = 'ru-central1';
delete process.env.PLATFORM_FILE;

const objects = new Map();
const calls = [];
let conflicts = 0;
let arm = null;

function idOf(bucket, key) {
  return `${bucket}::${key}`;
}

function conflict() {
  const error = new Error('Precondition Failed');
  error.name = 'PreconditionFailed';
  error.status = 412;
  return error;
}

function notFound() {
  const error = new Error('Not Found');
  error.name = 'NotFound';
  error.status = 404;
  return error;
}

setObjectStoreTransportForTests(async (op) => {
  calls.push({ action: op.action, bucket: op.bucket, key: op.key });
  const id = idOf(op.bucket, op.key);
  if (op.action === 'head') {
    if (!objects.has(id)) return { missing: true, etag: null, contentLength: null, contentType: null };
    const body = objects.get(id);
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    return {
      missing: false,
      etag: documentEtag(body),
      contentLength: buf.length,
      contentType: 'application/json',
    };
  }
  if (op.action === 'get') return objects.has(id) ? objects.get(id) : null;
  if (op.action === 'put') {
    if (arm && op.ifMatch && op.key === 'platform-v2.json') {
      arm.seen += 1;
      if (arm.seen === 1) await arm.gate;
      else if (arm.seen === 2) arm.release();
    }
    if (op.ifNoneMatch === '*' && objects.has(id)) throw conflict();
    if (op.ifMatch) {
      if (!objects.has(id)) throw notFound();
      if (normalizeEtag(op.ifMatch) !== documentEtag(objects.get(id))) {
        conflicts += 1;
        throw conflict();
      }
    }
    objects.set(id, op.body);
    return { etag: documentEtag(op.body) };
  }
  if (op.action === 'delete') {
    objects.delete(id);
    return null;
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

async function login(instance, loginName, password) {
  const response = await instance.run(() =>
    call('POST', '/auth/login', { body: { login: loginName, password } }),
  );
  assert.equal(response.statusCode, 200, response.body);
  return JSON.parse(response.body).token;
}

function namesOf(response) {
  const data = JSON.parse(response.body || '{}');
  return (data.materials || data.projects || []).map((item) => item.name);
}

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n').toString('base64');

describe('актуальные чтение и запись платформы', { concurrency: false }, () => {
  beforeEach(() => {
    objects.clear();
    calls.length = 0;
    conflicts = 0;
    arm = null;
    resetStoredDocumentsForTests();
  });

  test('запись через экземпляр A видна чтению через B', async () => {
    const a = isolateDocumentCacheForTests();
    const b = isolateDocumentCacheForTests();
    const owner = await login(a, 'partner1', 'demo1234');
    const warmed = await b.run(() => call('GET', '/projects', { token: owner }));
    assert.equal(warmed.statusCode, 200, warmed.body);
    assert.equal(namesOf(warmed).includes('Дом на Ленина'), false);
    assert.equal(warmed.headers['Cache-Control'], 'no-store');

    const created = await a.run(() =>
      call('POST', '/projects', { token: owner, body: { name: 'Дом на Ленина' } }),
    );
    assert.equal(created.statusCode, 200, created.body);

    const seen = await b.run(() => call('GET', '/projects', { token: owner }));
    assert.equal(seen.statusCode, 200, seen.body);
    assert.equal(namesOf(seen).includes('Дом на Ленина'), true);
    assert.equal(seen.headers['Cache-Control'], 'no-store');
  });

  test('одновременные материалы и смена пароля не затирают друг друга', async () => {
    const a = isolateDocumentCacheForTests();
    const b = isolateDocumentCacheForTests();
    const owner = await login(a, 'partner1', 'demo1234');
    const admin = await login(b, 'admin', 'admin1234');
    await a.run(() => call('GET', '/projects', { token: owner }));
    await b.run(() => call('GET', '/materials', { token: admin }));
    conflicts = 0;

    let release = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    arm = { gate, release, seen: 0 };

    const nextPassword = 'fresh-pass-1';
    const [passwordRes, materialRes] = await Promise.all([
      a.run(() =>
        call('POST', '/org/staff/reset-password', {
          token: owner,
          body: { staffUserId: 'u_measurer1', password: nextPassword },
        }),
      ),
      b.run(() =>
        call('POST', '/materials/files', {
          token: admin,
          body: { name: 'Ролик с другого экземпляра.pdf', mime: 'application/pdf', contentBase64: pdf },
        }),
      ),
    ]);
    assert.equal(passwordRes.statusCode, 200, passwordRes.body);
    assert.equal(materialRes.statusCode, 200, materialRes.body);
    assert.equal(conflicts >= 1, true, 'ожидался конфликт If-Match');
    assert.equal(namesOf(materialRes).includes('Ролик с другого экземпляра.pdf'), true);

    const oldPassword = await a.run(() =>
      call('POST', '/auth/login', { body: { login: 'exec1', password: 'exec1234' } }),
    );
    assert.equal(oldPassword.statusCode, 401);
    const freshLogin = await b.run(() =>
      call('POST', '/auth/login', { body: { login: 'exec1', password: nextPassword } }),
    );
    assert.equal(freshLogin.statusCode, 200, freshLogin.body);

    const listed = await a.run(() => call('GET', '/materials', { token: admin }));
    assert.equal(namesOf(listed).includes('Ролик с другого экземпляра.pdf'), true);
    const stored = JSON.parse(objects.get(idOf('test-partners', 'platform-v2.json')));
    const measurer = stored.users.find((user) => user.id === 'u_measurer1');
    assert.equal(measurer.passwordHash === stored.users.find((user) => user.login === 'admin').passwordHash, false);
  });

  test('автопроект и объект переживают конфликт записи вместе', async () => {
    const a = isolateDocumentCacheForTests();
    const b = isolateDocumentCacheForTests();
    const ownerA = await login(a, 'partner1', 'demo1234');
    const ownerB = await login(b, 'partner1', 'demo1234');
    await a.run(() => call('GET', '/objects', { token: ownerA }));
    await b.run(() => call('GET', '/projects', { token: ownerB }));
    conflicts = 0;

    let release = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    arm = { gate, release, seen: 0 };

    const [roomRes, projectRes] = await Promise.all([
      a.run(() =>
        call('POST', '/objects', {
          token: ownerA,
          body: {
            clientName: 'Параллельная квартира',
            address: 'ул. Параллельная, 1',
            city: 'Москва',
            roomName: 'Кухня',
            room: { areaM2: 12 },
          },
        }),
      ),
      b.run(() =>
        call('POST', '/projects', {
          token: ownerB,
          body: { name: 'Проект с другого экземпляра', address: 'ул. Другая, 2' },
        }),
      ),
    ]);
    assert.equal(roomRes.statusCode, 200, roomRes.body);
    assert.equal(projectRes.statusCode, 200, projectRes.body);
    assert.equal(conflicts >= 1, true, 'ожидался конфликт If-Match');

    const room = JSON.parse(roomRes.body).object;
    assert.match(room.projectId, /^prj_/);
    assert.equal(room.roomName, 'Кухня');
    const other = JSON.parse(projectRes.body).project;
    const stored = JSON.parse(objects.get(idOf('test-partners', 'platform-v2.json')));
    const savedRoom = stored.objects.find((item) => item.id === room.id);
    const savedProject = stored.projects.find((item) => item.id === room.projectId);
    const savedOther = stored.projects.find((item) => item.id === other.id);
    assert.ok(savedRoom, 'комната потерялась при повторе записи');
    assert.equal(savedRoom.projectId, room.projectId);
    assert.equal(savedRoom.clientName, 'Параллельная квартира');
    assert.equal(savedRoom.room.areaM2, 12);
    assert.ok(savedProject, 'автопроект потерялся при повторе записи');
    assert.equal(savedProject.name, 'Параллельная квартира');
    assert.equal(savedProject.address, 'ул. Параллельная, 1');
    assert.equal(savedProject.orgId, savedRoom.orgId);
    assert.ok(savedOther, 'чужой проект затёрт записью комнаты');
    assert.equal(savedOther.name, 'Проект с другого экземпляра');
  });

  test('два одновременных файла остаются в ответе того, кто записал вторым', async () => {
    const a = isolateDocumentCacheForTests();
    const b = isolateDocumentCacheForTests();
    const adminA = await login(a, 'admin', 'admin1234');
    const adminB = await login(b, 'admin', 'admin1234');
    await a.run(() => call('GET', '/materials', { token: adminA }));
    await b.run(() => call('GET', '/materials', { token: adminB }));

    let release = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    arm = { gate, release, seen: 0 };
    conflicts = 0;

    const [left, right] = await Promise.all([
      a.run(() =>
        call('POST', '/materials/files', {
          token: adminA,
          body: { name: 'Ролик А.pdf', mime: 'application/pdf', contentBase64: pdf },
        }),
      ),
      b.run(() =>
        call('POST', '/materials/files', {
          token: adminB,
          body: { name: 'Ролик Б.pdf', mime: 'application/pdf', contentBase64: pdf },
        }),
      ),
    ]);
    assert.equal(left.statusCode, 200, left.body);
    assert.equal(right.statusCode, 200, right.body);
    assert.equal(conflicts >= 1, true, 'ожидался конфликт If-Match');
    const lists = [namesOf(left), namesOf(right)];
    assert.equal(
      lists.some((names) => names.includes('Ролик А.pdf') && names.includes('Ролик Б.pdf')),
      true,
    );
    const listed = await a.run(() => call('GET', '/materials', { token: adminA }));
    const names = namesOf(listed);
    assert.equal(names.includes('Ролик А.pdf'), true);
    assert.equal(names.includes('Ролик Б.pdf'), true);
  });

  test('слияние сохраняет чужое поле и более новую метку', () => {
    const base = {
      users: [{ id: 'u', passwordHash: 'old' }],
      objects: [
        {
          id: 'o1',
          clientName: 'A',
          address: 'Адрес',
          updatedAt: '2024-01-01T00:00:00.000Z',
          history: [],
        },
      ],
    };
    const fresh = {
      users: [{ id: 'u', passwordHash: 'old' }],
      materials: [{ id: 'mat_a', name: 'A', storageKey: 'materials/mat_a' }],
      objects: [
        {
          id: 'o1',
          clientName: 'Свежий',
          address: 'Адрес',
          updatedAt: '2024-06-01T00:00:00.000Z',
          history: [{ id: 'h-fresh', action: 'update' }],
        },
      ],
    };
    const desired = {
      users: [{ id: 'u', passwordHash: 'new' }],
      materials: [{ id: 'mat_b', name: 'B', storageKey: 'materials/mat_b' }],
      objects: [
        {
          id: 'o1',
          clientName: 'Старый',
          address: 'Новый адрес',
          updatedAt: '2024-03-01T00:00:00.000Z',
          history: [{ id: 'h-old', action: 'update' }],
        },
      ],
    };
    const merged = mergePlatformDocument(base, desired, fresh);
    assert.equal(merged.users[0].passwordHash, 'new');
    assert.deepEqual(
      merged.materials.map((item) => item.id).sort(),
      ['mat_a', 'mat_b'],
    );
    assert.equal(merged.objects[0].clientName, 'Свежий');
    assert.equal(merged.objects[0].address, 'Новый адрес');
    assert.equal(
      merged.objects[0].history.filter((item) => item.id === 'h-fresh' || item.id === 'h-old').length,
      2,
    );

    const removed = mergePlatformDocument(
      { users: [{ id: 'u1' }, { id: 'u2', passwordHash: 'keep' }] },
      { users: [{ id: 'u1' }] },
      { users: [{ id: 'u1' }, { id: 'u2', passwordHash: 'keep' }] },
    );
    assert.deepEqual(removed.users.map((user) => user.id), ['u1']);

    const kept = mergePlatformDocument(
      { users: [{ id: 'u2', passwordHash: 'old' }] },
      { users: [] },
      { users: [{ id: 'u2', passwordHash: 'changed' }] },
    );
    assert.equal(kept.users[0].passwordHash, 'changed');
  });

  test('ответы с данными не кэшируются', async () => {
    const health = await call('GET', '/health');
    assert.equal(health.headers['Cache-Control'], 'no-store');
    const missing = await call('GET', '/no-such-route');
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.headers['Cache-Control'], 'no-store');
  });
});
