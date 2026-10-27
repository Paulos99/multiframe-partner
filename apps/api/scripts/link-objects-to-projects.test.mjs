import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import {
  PROTECTED_PROJECT_ID,
  planMigration,
  projectBodyForObject,
  runFromConfig,
  runMigration,
  stableProjectId,
} from './link-objects-to-projects-lib.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-link-projects-'));
const platformFile = path.join(dir, 'platform.json');
process.env.PLATFORM_FILE = platformFile;
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'link-projects-local-test';

const { handler } = await import('../index.js');

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function stored() {
  return JSON.parse(readFileSync(platformFile, 'utf8'));
}

test('план не трогает чужие компании, уже привязанные объекты и служебный проект', () => {
  const actions = planMigration(
    [
      { id: 'obj_new', orgId: 'org_a', clientName: 'Новый', address: 'ул. Новая, 1' },
      { id: 'obj_b', orgId: 'org_b', clientName: 'Чужой' },
      { id: 'obj_keep', orgId: 'org_a', projectId: 'prj_keep', clientName: 'Уже' },
      { id: 'obj_test', orgId: 'org_a', projectId: PROTECTED_PROJECT_ID, clientName: 'Тест' },
    ],
    [{ id: PROTECTED_PROJECT_ID, orgId: 'org_a', name: 'Служебный' }],
    'org_a',
  );
  assert.deepEqual(
    actions.map((item) => item.action),
    ['create-and-link', 'skip-other-org', 'skip-linked', 'skip-protected'],
  );
  assert.equal(stableProjectId('obj_new'), 'prj_objnew');
  assert.equal(projectBodyForObject(actions[0] && { id: 'obj_new', clientName: 'Новый', address: 'ул. Новая, 1' }).name, 'Новый');
  assert.equal(actions.some((item) => item.projectId === PROTECTED_PROJECT_ID && item.action !== 'skip-protected'), false);
});

test('стёртая запись повторяется, второй проход ничего не создаёт', async () => {
  const state = {
    objects: [
      { id: 'obj_lost', orgId: 'org_demo', clientName: 'Сидоров', address: 'ул. Садовая, 2', city: 'Москва', status: 'draft' },
      { id: 'obj_other', orgId: 'org_other', clientName: 'Чужой', address: 'Невский, 1' },
      { id: 'obj_done', orgId: 'org_demo', clientName: 'Готово', projectId: PROTECTED_PROJECT_ID },
    ],
    projects: [{ id: PROTECTED_PROJECT_ID, orgId: 'org_demo', name: 'Тестовый', address: 'как был' }],
  };
  let hideProject = true;
  let hideLink = true;
  const calls = [];
  const request = async (method, pathname, { body } = {}) => {
    calls.push(`${method} ${pathname}`);
    if (method === 'DELETE') throw new Error('удаление');
    if (method === 'GET' && pathname === '/objects') {
      return { status: 200, data: { objects: state.objects.map((item) => ({ ...item })) } };
    }
    if (method === 'GET' && pathname === '/projects') {
      return {
        status: 200,
        data: { projects: (hideProject ? [] : state.projects).map((item) => ({ ...item })) },
      };
    }
    if (method === 'POST' && pathname === '/projects') {
      assert.notEqual(body.id, PROTECTED_PROJECT_ID);
      state.projects = [{ ...body, orgId: 'org_demo' }, ...state.projects.filter((item) => item.id !== body.id)];
      hideProject = false;
      return { status: 200, data: { project: body } };
    }
    if (method === 'PATCH' && pathname.startsWith('/objects/')) {
      const id = decodeURIComponent(pathname.split('/').pop() || '');
      const object = state.objects.find((item) => item.id === id);
      assert.equal(Object.keys(body).join(','), 'projectId');
      object.projectId = body.projectId;
      if (hideLink) {
        hideLink = false;
        delete object.projectId;
      }
      return { status: 200, data: { object: { ...object } } };
    }
    throw new Error(`${method} ${pathname}`);
  };
  const report = await runMigration({
    request,
    token: 'token',
    orgId: 'org_demo',
    dryRun: false,
    attempts: 4,
    sleep: async () => {},
  });
  assert.equal(report.ok, true);
  assert.equal(report.otherOrgSkipped, 1);
  assert.equal(report.protectedSkipped, 1);
  assert.equal(state.objects.find((item) => item.id === 'obj_lost').projectId, 'prj_objlost');
  assert.equal(state.objects.find((item) => item.id === 'obj_lost').clientName, 'Сидоров');
  assert.equal(state.objects.find((item) => item.id === 'obj_other').projectId, undefined);
  assert.equal(state.projects.find((item) => item.id === PROTECTED_PROJECT_ID).name, 'Тестовый');
  assert.equal(state.projects.filter((item) => item.id === 'prj_objlost').length, 1);
  const again = await runMigration({
    request,
    token: 'token',
    orgId: 'org_demo',
    dryRun: false,
    attempts: 2,
    sleep: async () => {},
  });
  assert.equal(again.willCreate, 0);
  assert.equal(again.linked, 0);
  assert.equal(calls.filter((call) => call.startsWith('POST /projects')).length, 1);
  assert.equal(calls.some((call) => call.startsWith('DELETE')), false);
});

test('локальный API: dry-run, идемпотентность и чужая компания', async () => {
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const result = await handler({
      httpMethod: req.method,
      path: (req.url || '/').split('?')[0],
      headers: req.headers,
      body: Buffer.concat(chunks).toString('utf8'),
    });
    res.statusCode = result.statusCode;
    res.setHeader('content-type', 'application/json');
    res.end(result.body || '');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const apiBase = `http://127.0.0.1:${port}`;
  try {
    const ownerLogin = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'partner1', password: 'demo1234' }),
    }).then((res) => res.json());
    const created = await fetch(`${apiBase}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerLogin.token}` },
      body: JSON.stringify({
        id: PROTECTED_PROJECT_ID,
        name: 'Тестовый проект',
        address: 'не менять',
        clientName: 'Служебный',
      }),
    }).then((res) => res.json());
    assert.equal(created.project.id, PROTECTED_PROJECT_ID);
    const linked = await fetch(`${apiBase}/objects/obj_a11`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerLogin.token}` },
      body: JSON.stringify({ projectId: PROTECTED_PROJECT_ID }),
    }).then((res) => res.json());
    assert.equal(linked.object.projectId, PROTECTED_PROJECT_ID);
    const before = stored();
    const foreignBefore = before.objects.filter((obj) => obj.orgId === 'org_demo_spb');
    const kept = before.objects.find((obj) => obj.id === 'obj_a01');

    const dry = await runFromConfig({
      config: { dryRun: true, apiBase, login: 'partner1', password: 'demo1234' },
      fetchImpl: globalThis.fetch,
      sleep: async () => {},
    });
    assert.equal(dry.report.dryRun, true);
    assert.equal(dry.report.protectedSkipped, 1);
    assert.equal(dry.report.willCreate, 0);
    assert.ok(dry.report.alreadyLinked > 0);
    assert.equal(dry.requests.some((call) => call.startsWith('POST /projects')), false);
    assert.equal(dry.requests.some((call) => call.startsWith('PATCH /objects')), false);
    const afterDry = stored();
    assert.equal(afterDry.objects.find((obj) => obj.id === 'obj_a01').projectId, kept.projectId);
    assert.equal(afterDry.objects.find((obj) => obj.id === 'obj_a11').projectId, PROTECTED_PROJECT_ID);

    const live = await runFromConfig({
      config: { dryRun: false, apiBase, login: 'partner1', password: 'demo1234' },
      fetchImpl: globalThis.fetch,
      sleep: async () => {},
    });
    assert.equal(live.report.ok, true);
    assert.equal(live.report.failures.length, 0);
    assert.equal(live.requests.some((call) => call.startsWith('DELETE')), false);
    const migrated = stored();
    const room = migrated.objects.find((obj) => obj.id === 'obj_a01');
    assert.equal(room.projectId, kept.projectId);
    assert.notEqual(room.projectId, stableProjectId('obj_a01'));
    assert.equal(room.clientName, kept.clientName);
    assert.equal(room.address, kept.address);
    assert.equal(room.status, kept.status);
    assert.equal(room.assignedTo, kept.assignedTo);
    assert.deepEqual(room.room, kept.room);
    assert.deepEqual(room.estimate, kept.estimate);
    const untouched = migrated.objects.find((obj) => obj.id === 'obj_a11');
    assert.equal(untouched.projectId, PROTECTED_PROJECT_ID);
    assert.equal(untouched.clientName, 'Чернов А.');
    const protectedProject = migrated.projects.find((project) => project.id === PROTECTED_PROJECT_ID);
    assert.equal(protectedProject.name, 'Тестовый проект');
    assert.equal(protectedProject.address, 'не менять');
    for (const foreign of foreignBefore) {
      const same = migrated.objects.find((obj) => obj.id === foreign.id);
      assert.equal(same.projectId, foreign.projectId);
      assert.equal(same.clientName, foreign.clientName);
      assert.equal(same.orgId, 'org_demo_spb');
    }
    const projectCount = migrated.projects.length;

    const second = await runFromConfig({
      config: { dryRun: false, apiBase, login: 'partner1', password: 'demo1234' },
      fetchImpl: globalThis.fetch,
      sleep: async () => {},
    });
    assert.equal(second.report.willCreate, 0);
    assert.equal(second.report.linked, 0);
    assert.equal(second.requests.some((call) => call.startsWith('POST /projects')), false);
    assert.equal(second.requests.some((call) => call.startsWith('PATCH /objects')), false);
    assert.equal(stored().projects.length, projectCount);
    assert.equal(stored().objects.find((obj) => obj.id === 'obj_a11').clientName, 'Чернов А.');
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
