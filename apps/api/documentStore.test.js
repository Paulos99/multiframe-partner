import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { setDocumentStore, setObjectStoreTransport } from './objectStore.js';
import { resetStoredDocumentsForTests } from './platformStore.js';

process.env.PARTNERS_BUCKET = 'test-docstore-partners';
process.env.MATERIALS_BUCKET = 'test-docstore-materials';
process.env.JWT_SECRET = 'document-store-test-secret-0123456789abcdef';
process.env.ANALYTICS_ADMIN_KEY = 'document-store-analytics-key-0123456789';
process.env.ADMIN_BOOTSTRAP_LOGIN = 'db.admin';
process.env.ADMIN_BOOTSTRAP_PASSWORD = 'db-admin-password-1';
delete process.env.PLATFORM_FILE;
delete process.env.DEMO_SEED;

// «Своя база»: таблица документов с версией. Это тот же контракт, что описан в DATA_LAYER.md.
const rows = new Map();
const s3Calls = [];
const etagOf = (body) => `"${createHash('md5').update(body).digest('hex')}"`;
const conflict = () => Object.assign(new Error('conflict'), { status: 412 });

setDocumentStore({
  handles: (key) => key === 'platform-v2.json' || key === 'analytics-events.json',
  async head({ key }) {
    return rows.has(key) ? { missing: false, etag: etagOf(rows.get(key)) } : { missing: true };
  },
  async read({ key }) {
    return rows.has(key) ? { missing: false, body: rows.get(key), etag: etagOf(rows.get(key)) } : { missing: true };
  },
  async put({ key, body, ifMatch, ifNoneMatch }) {
    if (ifNoneMatch === '*' && rows.has(key)) throw conflict();
    if (ifMatch && (!rows.has(key) || etagOf(rows.get(key)) !== ifMatch)) throw conflict();
    rows.set(key, body);
    return { etag: etagOf(body) };
  },
});
setObjectStoreTransport(async (op) => {
  s3Calls.push(`${op.action}:${op.key}`);
  return null;
});

const { handler } = await import('./index.js');

test('документы платформы идут в подключённое хранилище, а не в S3', async () => {
  resetStoredDocumentsForTests();
  const res = await handler({
    httpMethod: 'POST',
    path: '/auth/login',
    headers: {},
    body: JSON.stringify({ login: 'db.admin', password: 'db-admin-password-1' }),
  });
  assert.equal(res.statusCode, 200, res.body);
  const stored = JSON.parse(rows.get('platform-v2.json'));
  assert.equal(stored.users[0].login, 'db.admin');
  assert.equal(s3Calls.filter((c) => c.endsWith('platform-v2.json')).length, 0);

  const token = JSON.parse(res.body).token;
  const create = await handler({
    httpMethod: 'POST',
    path: '/admin/partners',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ companyName: 'Тест', login: 'owner.test', password: 'owner-password-1', city: 'Москва' }),
  });
  assert.ok([200, 201].includes(create.statusCode), create.body);
  assert.ok(JSON.parse(rows.get('platform-v2.json')).users.some((u) => u.login === 'owner.test'));
});
