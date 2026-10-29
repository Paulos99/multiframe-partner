import assert from 'node:assert/strict';
import test from 'node:test';
import { documentEtag, normalizeEtag, setObjectStoreTransportForTests } from './objectStore.js';
import { resetStoredDocumentsForTests } from './platformStore.js';

process.env.PARTNERS_BUCKET = 'test-bootstrap-partners';
process.env.MATERIALS_BUCKET = 'test-bootstrap-materials';
process.env.JWT_SECRET = 'bootstrap-storage-test-secret-0123456789';
process.env.ANALYTICS_ADMIN_KEY = 'bootstrap-analytics-key';
process.env.YC_ACCESS_KEY_ID = 'YCAJEtestaccesskey123';
process.env.YC_SECRET_ACCESS_KEY = 'test-secret-key-with-enough-length';
process.env.YC_REGION = 'ru-central1';
delete process.env.PLATFORM_FILE;
delete process.env.DEMO_SEED;
delete process.env.ALLOW_DEMO_RESET;

const objects = new Map();
setObjectStoreTransportForTests(async (op) => {
  const id = `${op.bucket}::${op.key}`;
  if (op.action === 'head') {
    if (!objects.has(id)) return { missing: true, etag: null, contentLength: null, contentType: null };
    const body = objects.get(id);
    return { missing: false, etag: documentEtag(body), contentLength: Buffer.byteLength(String(body)), contentType: 'application/json' };
  }
  if (op.action === 'get') return objects.has(id) ? objects.get(id) : null;
  if (op.action === 'put') {
    if (op.ifNoneMatch === '*' && objects.has(id)) throw Object.assign(new Error('Precondition Failed'), { name: 'PreconditionFailed', status: 412 });
    if (op.ifMatch && normalizeEtag(op.ifMatch) !== documentEtag(objects.get(id))) {
      throw Object.assign(new Error('Precondition Failed'), { name: 'PreconditionFailed', status: 412 });
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

async function call(method, path, body, token) {
  const res = await handler({
    httpMethod: method,
    path,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.statusCode, body: JSON.parse(res.body || '{}') };
}

test('пустой бакет без демо: админ создаётся из ADMIN_BOOTSTRAP_*, демо-аккаунтов нет, демо-сброс закрыт', async () => {
  objects.clear();
  resetStoredDocumentsForTests();
  process.env.ADMIN_BOOTSTRAP_LOGIN = 'first.admin';
  process.env.ADMIN_BOOTSTRAP_PASSWORD = 'first-admin-password';
  const demo = await call('POST', '/auth/login', { login: 'partner1', password: 'demo1234' });
  assert.equal(demo.status, 401);
  const admin = await call('POST', '/auth/login', { login: 'first.admin', password: 'first-admin-password' });
  assert.equal(admin.status, 200, JSON.stringify(admin.body));
  assert.equal(admin.body.user.role, 'admin');
  const stored = JSON.parse(objects.get('test-bootstrap-partners::platform-v2.json'));
  assert.equal(stored.users.length, 1);
  assert.equal(JSON.stringify(stored).includes('first-admin-password'), false);
  const reset = await call('POST', '/admin/demo/reset', undefined, admin.body.token);
  assert.equal(reset.status, 403);
});

test('пустой бакет без демо и без ADMIN_BOOTSTRAP_*: вход отвечает понятной ошибкой, а не создаёт демо-админа', async () => {
  objects.clear();
  resetStoredDocumentsForTests();
  delete process.env.ADMIN_BOOTSTRAP_LOGIN;
  delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const res = await call('POST', '/auth/login', { login: 'admin', password: 'admin1234' });
  assert.equal(res.status, 503);
  assert.match(res.body.message, /ADMIN_BOOTSTRAP_LOGIN/);
  assert.equal(objects.size, 0);
});

test('DEMO_SEED=1 включает демо-данные в бакете (стенд для показа)', async () => {
  objects.clear();
  resetStoredDocumentsForTests();
  process.env.DEMO_SEED = '1';
  const res = await call('POST', '/auth/login', { login: 'partner1', password: 'demo1234' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  delete process.env.DEMO_SEED;
});
