import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { buildDemoPlatform } from './demoSeed.js';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-group-projects-'));
const platformFile = path.join(dir, 'platform.json');
process.env.PLATFORM_FILE = platformFile;
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'group-projects-local-test';

const seeded = buildDemoPlatform({ withHashes: true });
for (const object of seeded.objects) delete object.projectId;
delete seeded.projects;
seeded.objects.push({
  id: 'obj_pair',
  orgId: 'org_demo',
  clientName: 'иванова а.',
  clientPhone: '+7 495 000-00-00',
  address: 'ул.  Арбат, 12',
  city: 'Москва',
  status: 'draft',
  createdAt: '2099-01-01T00:00:00.000Z',
  createdBy: 'u_partner1',
  room: { areaM2: 4 },
  history: [],
});
writeFileSync(platformFile, JSON.stringify(seeded));

const { handler, resetPlatformMemoryForTests } = await import('./index.js');

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function call(method, urlPath, { token, body } = {}) {
  return handler({
    httpMethod: method,
    path: urlPath,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function login(loginName, password) {
  const response = await call('POST', '/auth/login', { body: { login: loginName, password } });
  assert.equal(response.statusCode, 200, response.body);
  return JSON.parse(response.body).token;
}

function stored() {
  return JSON.parse(readFileSync(platformFile, 'utf8'));
}

test('сохранённая демо-платформа группирует комнаты по клиенту и адресу', async () => {
  resetPlatformMemoryForTests();
  const owner = await login('partner1', 'demo1234');
  const first = stored();
  assert.equal(first.objects.every((object) => String(object.projectId || '').startsWith('prj_')), true);
  const ivanova = first.objects.find((object) => object.id === 'obj_a01');
  const pair = first.objects.find((object) => object.id === 'obj_pair');
  const chernov = first.objects.find((object) => object.id === 'obj_a11');
  assert.equal(pair.projectId, ivanova.projectId);
  assert.notEqual(chernov.projectId, ivanova.projectId);
  const project = first.projects.find((item) => item.id === chernov.projectId);
  assert.equal(project.clientName, 'Чернов А.');
  assert.equal(project.address, 'ул. Бауманская, 33');
  assert.equal(project.orgId, 'org_demo');
  const count = first.projects.length;

  const listed = JSON.parse((await call('GET', '/projects', { token: owner })).body);
  assert.equal(listed.projects.some((item) => item.id === chernov.projectId), true);
  assert.equal(stored().projects.length, count);

  await login('partner1', 'demo1234');
  const second = stored();
  assert.equal(second.projects.length, count);
  assert.equal(second.objects.find((object) => object.id === 'obj_a11').projectId, chernov.projectId);
  assert.equal(second.objects.find((object) => object.id === 'obj_pair').projectId, ivanova.projectId);
});
