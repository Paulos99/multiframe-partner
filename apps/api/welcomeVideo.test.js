import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { handleProfile, welcomeVideoPending } from './profileRoutes.js';

let platform, user, writes;
beforeEach(() => {
  delete process.env.WELCOME_VIDEO;
  user = { id: 'wv_user', login: 'wv.user', role: 'measurer', orgId: 'org_wv' };
  platform = { users: [user, { id: 'other', login: 'other', role: 'crew', orgId: 'org_wv' }], orgs: [] };
  writes = 0;
});
afterEach(() => {
  delete process.env.WELCOME_VIDEO;
});
const call = (method, path) =>
  handleProfile({
    method,
    path,
    requireAuth: async () => ({ platform, user: platform.users.find((u) => u.id === user.id) }),
    getBody: () => ({}),
    savePlatform: async () => {
      writes++;
    },
    publicUser: (u) => ({ id: u.id, role: u.role, ...(welcomeVideoPending(u) ? { welcomeVideoPending: true } : {}) }),
    signToken: async () => 'unit-token',
    json: (status, body) => ({ status, body }),
  });

test('welcome video: partner roles see it until marked, StP roles never', () => {
  for (const role of ['owner', 'sales', 'measurer', 'crew']) assert.equal(welcomeVideoPending({ role }), true, role);
  for (const role of ['admin', 'stp_manager', undefined]) assert.equal(welcomeVideoPending({ role }), false, String(role));
  assert.equal(welcomeVideoPending({ role: 'crew', welcomeVideoSeenAt: '2026-11-10T00:00:00Z' }), false);
  assert.equal(welcomeVideoPending(null), false);
  process.env.WELCOME_VIDEO = 'off';
  assert.equal(welcomeVideoPending({ role: 'owner' }), false);
});

test('POST /me/welcome-video stores the mark on the server user once, other users untouched', async () => {
  const before = await call('GET', '/me');
  assert.equal(before.body.user.welcomeVideoPending, true);
  const first = await call('POST', '/me/welcome-video');
  assert.equal(first.status, 200);
  assert.equal(first.body.user.welcomeVideoPending, undefined);
  assert.match(platform.users[0].welcomeVideoSeenAt, /^\d{4}-\d\d-\d\dT/);
  assert.equal(writes, 1);
  const stamp = platform.users[0].welcomeVideoSeenAt;
  const again = await call('POST', '/me/welcome-video');
  assert.equal(again.status, 200);
  assert.equal(platform.users[0].welcomeVideoSeenAt, stamp);
  assert.equal(writes, 1, 'repeat close does not rewrite data');
  assert.equal(platform.users[1].welcomeVideoSeenAt, undefined);
  assert.equal((await call('GET', '/me')).body.user.welcomeVideoPending, undefined, 'another device gets the same answer');
});

test('other methods on /me/welcome-video are not handled as success', async () => {
  const res = await call('GET', '/me/welcome-video');
  assert.notEqual(res?.status, 200);
});
