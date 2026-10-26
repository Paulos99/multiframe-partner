/**
 * In-memory checks: staff password scope and last-write-wins.
 * Does not read or write Object Storage.
 */
delete process.env.PARTNERS_BUCKET;
delete process.env.YC_ACCESS_KEY_ID;
delete process.env.YC_SECRET_ACCESS_KEY;

const { handler } = await import('../index.js');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function call(method, path, { token, body } = {}) {
  const res = await handler({
    httpMethod: method,
    path,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.body ? JSON.parse(res.body) : {};
  return { status: res.statusCode, data };
}

const ownerLogin = await call('POST', '/auth/login', {
  body: { login: 'partner1', password: 'demo1234' },
});
assert(ownerLogin.status === 200, `owner login ${ownerLogin.status}`);
const ownerToken = ownerLogin.data.token;

const adminLogin = await call('POST', '/auth/login', {
  body: { login: 'admin', password: 'admin1234' },
});
assert(adminLogin.status === 200, 'admin login');
const adminToken = adminLogin.data.token;

const measurerLogin = await call('POST', '/auth/login', {
  body: { login: 'exec1', password: 'exec1234' },
});
assert(measurerLogin.status === 200, 'measurer login');

const foreign = await call('POST', '/org/staff/reset-password', {
  token: ownerToken,
  body: { staffUserId: 'u_measurer2', password: 'other-company' },
});
assert(foreign.status === 404, `owner foreign staff expected 404, got ${foreign.status}`);

const own = await call('POST', '/org/staff/reset-password', {
  token: ownerToken,
  body: { staffUserId: 'u_measurer1', password: 'fresh-pass-1' },
});
assert(own.status === 200, `owner reset ${own.status} ${own.data.message || ''}`);
assert(own.data.password === 'fresh-pass-1', 'password shown once');
assert(!('passwordHash' in own.data), 'hash is not returned');

const oldPw = await call('POST', '/auth/login', {
  body: { login: 'exec1', password: 'exec1234' },
});
assert(oldPw.status === 401, 'old password rejected');
const newPw = await call('POST', '/auth/login', {
  body: { login: 'exec1', password: 'fresh-pass-1' },
});
assert(newPw.status === 200, 'new password works');

const adminReset = await call('POST', '/org/staff/reset-password', {
  token: adminToken,
  body: { staffUserId: 'u_measurer2', password: 'admin-set-pass' },
});
assert(adminReset.status === 200, `admin any company ${adminReset.status} ${adminReset.data.message || ''}`);
assert(!('passwordHash' in adminReset.data), 'admin response has no hash');

const salesLogin = await call('POST', '/auth/login', {
  body: { login: 'sales1', password: 'exec1234' },
});
const salesReset = await call('POST', '/org/staff/reset-password', {
  token: salesLogin.data.token,
  body: { staffUserId: 'u_crew1', password: 'crew-pass-2' },
});
assert(salesReset.status === 200, `sales resets own company staff, got ${salesReset.status}`);
const salesOwner = await call('POST', '/org/staff/reset-password', {
  token: salesLogin.data.token,
  body: { staffUserId: 'u_partner1', password: 'owner-nope' },
});
assert(salesOwner.status === 403, `sales cannot change owner, got ${salesOwner.status}`);
const salesForeign = await call('POST', '/org/staff/reset-password', {
  token: salesLogin.data.token,
  body: { staffUserId: 'u_crew2', password: 'foreign-nope' },
});
assert(salesForeign.status === 404, `sales foreign staff expected 404, got ${salesForeign.status}`);

const id = 'obj_lww_test';
const newer = new Date(Date.now() - 1000).toISOString();
const older = '2020-01-01T00:00:00.000Z';
const newest = new Date().toISOString();

const salesToken = salesLogin.data.token;
const created = await call('POST', '/objects', {
  token: salesToken,
  body: {
    id,
    updatedAt: newer,
    status: 'measured',
    clientName: 'Новый замер',
    address: 'Тестовая 1',
    room: { areaM2: 12 },
  },
});
assert(created.status === 200, `create ${created.status} ${created.data.message || ''}`);
assert(created.data.object.clientName === 'Новый замер', 'created name');

const stale = await call('POST', '/objects', {
  token: salesToken,
  body: {
    id,
    updatedAt: older,
    status: 'draft',
    clientName: 'Старая копия',
    address: 'Не должна победить',
  },
});
assert(stale.status === 200, 'stale write accepted as conflict');
assert(stale.data.conflict === 'server-newer', 'server kept newer row');
assert(stale.data.object.clientName === 'Новый замер', 'older name did not replace');
assert(
  (stale.data.object.history || []).some((h) => h.action === 'conflict_kept_server'),
  'skipped payload kept in history',
);

const fresh = await call('PATCH', `/objects/${id}`, {
  token: salesToken,
  body: { id, updatedAt: newest, clientName: 'Свежий замер', status: 'measured' },
});
assert(fresh.status === 200, `fresh patch ${fresh.status}`);
assert(fresh.data.object.clientName === 'Свежий замер', 'newer write wins');

const again = await call('POST', '/objects', {
  token: salesToken,
  body: { id, updatedAt: newest, clientName: 'Свежий замер', status: 'measured' },
});
assert(again.status === 200, 'idempotent retry');
const list = await call('GET', '/objects', { token: salesToken });
const copies = (list.data.objects || []).filter((o) => o.id === id);
assert(copies.length === 1, `expected 1 object, got ${copies.length}`);

console.log('password scope and last-write-wins: ok');
