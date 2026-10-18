import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
// Фото профиля должно приходить уже при входе и в /auth/me (старт приложения),
// а не только в GET /me, который вызывает окно «Мой профиль».
const dir = mkdtempSync(path.join(tmpdir(), 'mf-avatar-session-'));
process.env.PLATFORM_FILE = path.join(dir, 'platform.json');
process.env.JWT_SECRET = 'avatar-session-test-only';
delete process.env.PARTNERS_BUCKET;
process.env.MATERIALS_BUCKET = 'unit-avatar-materials';
const password = 'avatar-session-fixture';
writeFileSync(
  process.env.PLATFORM_FILE,
  JSON.stringify({
    users: [
      { id: 'u_admin', login: 'avatar.admin', role: 'admin', orgId: null, displayName: 'Admin', passwordHash: bcrypt.hashSync(password, 4), avatarKey: 'avatars/u_admin.webp' },
      { id: 'u_plain', login: 'avatar.plain', role: 'crew', orgId: null, displayName: 'Plain', passwordHash: bcrypt.hashSync(password, 4) },
    ],
    orgs: [],
    objects: [],
    projects: [],
    activity: [],
  }),
);
const { setObjectStoreTransportForTests } = await import('./objectStore.js');
let signs = 0;
let failSign = false;
setObjectStoreTransportForTests(async (op) => {
  if (op.action !== 'sign-get') throw new Error('unexpected storage op');
  if (failSign) throw new Error('signing unavailable');
  signs++;
  return `https://example.test/${op.key}?sig=${signs}`;
});
const { handler } = await import('./index.js');
after(() => {
  setObjectStoreTransportForTests(null);
  rmSync(dir, { recursive: true, force: true });
});
async function call(method, p, body, token) {
  const res = await handler({
    httpMethod: method,
    path: p,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.statusCode, body: JSON.parse(res.body || '{}') };
}

test('login and /auth/me return a freshly signed avatar URL', async () => {
  const login = await call('POST', '/auth/login', { login: 'avatar.admin', password });
  assert.equal(login.status, 200);
  assert.match(login.body.user.avatarUrl, /^https:\/\/example\.test\/avatars\/u_admin\.webp\?sig=\d+$/);
  const first = await call('GET', '/auth/me', undefined, login.body.token);
  const second = await call('GET', '/auth/me', undefined, login.body.token);
  assert.equal(first.status, 200);
  assert.match(first.body.user.avatarUrl, /avatars\/u_admin\.webp/);
  // Каждый старт приложения получает новую подпись, а не протухшую из сессии.
  assert.notEqual(first.body.user.avatarUrl, second.body.user.avatarUrl);
  assert.equal(first.body.user.login, 'avatar.admin');
});

test('user without a photo gets null, signing failure never breaks auth', async () => {
  const plain = await call('POST', '/auth/login', { login: 'avatar.plain', password });
  assert.equal(plain.status, 200);
  assert.equal(plain.body.user.avatarUrl, null);
  failSign = true;
  try {
    const login = await call('POST', '/auth/login', { login: 'avatar.admin', password });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.avatarUrl, null);
    const me = await call('GET', '/auth/me', undefined, login.body.token);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.avatarUrl, null);
  } finally {
    failSign = false;
  }
});
