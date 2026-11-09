import assert from 'node:assert/strict';
import test, { beforeEach, describe } from 'node:test';
import { documentEtag, setObjectStoreTransportForTests } from './objectStore.js';
import { resetStoredDocumentsForTests } from './platformStore.js';

const PARTNERS = 'test-partners-roles';
const MATERIALS = 'test-materials-roles';

process.env.PARTNERS_BUCKET = PARTNERS;
process.env.DEMO_SEED = '1';
process.env.MATERIALS_BUCKET = MATERIALS;
process.env.JWT_SECRET = 'materials-roles-test-signing-key-32chars';
process.env.YC_ACCESS_KEY_ID = 'YCAJEtestaccesskey123';
process.env.YC_SECRET_ACCESS_KEY = 'test-secret-key-with-enough-length';
process.env.YC_REGION = 'ru-central1';
delete process.env.PLATFORM_FILE;

const objects = new Map();
const types = new Map();
const idOf = (bucket, key) => `${bucket}::${key}`;

setObjectStoreTransportForTests(async (op) => {
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
    return { missing: false, etag: documentEtag(body), contentLength: buf.length, contentType: types.get(id) || 'application/octet-stream' };
  }
  if (op.action === 'get') return objects.has(id) ? objects.get(id) : null;
  if (op.action === 'delete') {
    objects.delete(id);
    return null;
  }
  if (op.action === 'sign-get') return `https://${op.bucket}.storage.yandexcloud.net/${op.key}?X-Amz-Signature=test`;
  if (op.action === 'sign-put') return `https://${op.bucket}.storage.yandexcloud.net/${op.key}?X-Amz-Signature=test`;
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

async function login(name, password) {
  const res = await call('POST', '/auth/login', { body: { login: name, password } });
  assert.equal(res.statusCode, 200, res.body);
  return JSON.parse(res.body).token;
}

const TXT = Buffer.from('roles').toString('base64');

async function list(token) {
  const res = await call('GET', '/materials', { token });
  assert.equal(res.statusCode, 200, res.body);
  return JSON.parse(res.body).materials;
}

async function ok(res) {
  assert.equal(res.statusCode, 200, res.body);
  return JSON.parse(res.body).materials;
}

describe('роли видимости материалов и обучающих видео', { concurrency: false }, () => {
  let admin;
  let owner;
  let crew;
  let measurer;
  let stp;

  beforeEach(async () => {
    objects.clear();
    types.clear();
    resetStoredDocumentsForTests();
    admin = await login('admin', 'admin1234');
    owner = await login('partner1', 'demo1234');
    crew = await login('crew1', 'exec1234');
    measurer = await login('exec1', 'exec1234');
    stp = await login('stpmgr1', 'exec1234');
  });

  test('по умолчанию новый файл и папка видны всем ролям', async () => {
    const nodes = await ok(await call('POST', '/materials/folders', { token: admin, body: { name: 'Для всех' } }));
    const folder = nodes.find((n) => n.name === 'Для всех');
    assert.equal(folder.roles, null);
    assert.equal(folder.effectiveRoles, null);
    await ok(await call('POST', '/materials/files', { token: admin, body: { name: 'общий.txt', mime: 'text/plain', contentBase64: TXT, parentId: folder.id } }));
    for (const token of [owner, crew, measurer, stp]) {
      const names = (await list(token)).map((n) => n.name);
      assert.ok(names.includes('Для всех'));
      assert.ok(names.includes('общий.txt'));
    }
  });

  test('скрытый файл не уходит монтажнику ни в списке, ни по прямой ссылке', async () => {
    const nodes = await ok(
      await call('POST', '/materials/files', {
        token: admin,
        body: { name: 'цены.txt', mime: 'text/plain', contentBase64: TXT, roles: ['owner', 'sales'] },
      }),
    );
    const file = nodes.find((n) => n.name === 'цены.txt');
    assert.deepEqual(file.roles, ['owner', 'sales']);

    const crewList = await list(crew);
    assert.equal(crewList.some((n) => n.id === file.id), false);
    // У не-админа ролей в ответе нет вовсе.
    assert.equal(crewList.some((n) => 'roles' in n || 'effectiveRoles' in n), false);
    for (const tail of ['content', 'preview', 'thumbnail']) {
      const res = await call('GET', `/materials/${file.id}/${tail}`, { token: crew });
      assert.equal(res.statusCode, 404, `${tail}: ${res.body}`);
    }
    assert.ok((await list(owner)).some((n) => n.id === file.id));
    const content = await call('GET', `/materials/${file.id}/content`, { token: owner });
    assert.equal(content.statusCode, 200, content.body);
  });

  test('админ меняет роли позже; папка ограничивает всё, что внутри', async () => {
    let nodes = await ok(await call('POST', '/materials/folders', { token: admin, body: { name: 'Продажи' } }));
    const folder = nodes.find((n) => n.name === 'Продажи');
    nodes = await ok(await call('POST', '/materials/files', { token: admin, body: { name: 'скрипт.txt', mime: 'text/plain', contentBase64: TXT, parentId: folder.id } }));
    const file = nodes.find((n) => n.name === 'скрипт.txt');

    nodes = await ok(await call('PATCH', `/materials/${folder.id}`, { token: admin, body: { roles: ['owner', 'sales'] } }));
    const inside = nodes.find((n) => n.id === file.id);
    assert.equal(inside.roles, null);
    assert.deepEqual(inside.effectiveRoles, ['owner', 'sales']);
    assert.equal(nodes.find((n) => n.id === folder.id).name, 'Продажи');

    const crewNames = (await list(crew)).map((n) => n.name);
    assert.equal(crewNames.includes('Продажи'), false);
    assert.equal(crewNames.includes('скрипт.txt'), false);
    const content = await call('GET', `/materials/${file.id}/content`, { token: crew });
    assert.equal(content.statusCode, 404);

    // Файл шире папки не открыть.
    const wide = await call('PATCH', `/materials/${file.id}`, { token: admin, body: { roles: ['owner', 'crew'] } });
    assert.equal(wide.statusCode, 400);
    assert.match(JSON.parse(wide.body).message, /не может быть виден шире папки/);
    const wideNew = await call('POST', '/materials/files', {
      token: admin,
      body: { name: 'ещё.txt', mime: 'text/plain', contentBase64: TXT, parentId: folder.id, roles: ['crew'] },
    });
    assert.equal(wideNew.statusCode, 400);
    // Без ролей — «как у папки»: загрузка в закрытую папку проходит.
    nodes = await ok(
      await call('POST', '/materials/files', { token: admin, body: { name: 'внутри.txt', mime: 'text/plain', contentBase64: TXT, parentId: folder.id } }),
    );
    assert.deepEqual(nodes.find((n) => n.name === 'внутри.txt').effectiveRoles, ['owner', 'sales']);

    // Уже — можно.
    nodes = await ok(await call('PATCH', `/materials/${file.id}`, { token: admin, body: { roles: ['owner'] } }));
    assert.deepEqual(nodes.find((n) => n.id === file.id).effectiveRoles, ['owner']);
    assert.equal((await list(await login('sales1', 'exec1234'))).some((n) => n.id === file.id), false);

    // Снова всем.
    nodes = await ok(await call('PATCH', `/materials/${folder.id}`, { token: admin, body: { roles: null } }));
    assert.equal(nodes.find((n) => n.id === folder.id).roles, null);
    assert.ok((await list(crew)).some((n) => n.id === folder.id));
  });

  test('проверка ролей: пустой список, чужая роль, права', async () => {
    const nodes = await ok(await call('POST', '/materials/folders', { token: admin, body: { name: 'Папка' } }));
    const folder = nodes.find((n) => n.name === 'Папка');
    const empty = await call('PATCH', `/materials/${folder.id}`, { token: admin, body: { roles: [] } });
    assert.equal(empty.statusCode, 400);
    assert.match(JSON.parse(empty.body).message, /хотя бы одну роль/);
    const strange = await call('PATCH', `/materials/${folder.id}`, { token: admin, body: { roles: ['admin'] } });
    assert.equal(strange.statusCode, 400);
    const denied = await call('PATCH', `/materials/${folder.id}`, { token: owner, body: { roles: ['owner'] } });
    assert.equal(denied.statusCode, 403);
    // Все пять ролей — то же, что «все».
    const all = await ok(
      await call('PATCH', `/materials/${folder.id}`, { token: admin, body: { roles: ['owner', 'sales', 'measurer', 'crew', 'stp_manager'] } }),
    );
    assert.equal(all.find((n) => n.id === folder.id).roles, null);
  });

  test('встроенные видео ролей: каждое видно своей роли, админ видит все и может удалить', async () => {
    const adminVideos = (await list(admin)).filter((n) => n.section === 'video');
    assert.deepEqual(adminVideos.map((n) => n.builtin), ['owner', 'sales', 'measurer', 'crew']);
    assert.deepEqual(adminVideos.map((n) => n.roles), [['owner'], ['sales'], ['measurer'], ['crew']]);

    const crewVideos = (await list(crew)).filter((n) => n.section === 'video');
    assert.deepEqual(crewVideos.map((n) => n.builtin), ['crew']);
    assert.equal((await list(stp)).filter((n) => n.section === 'video').length, 0);

    // Монтажнику добавили ролик замерщика.
    await ok(await call('PATCH', '/materials/mat_video_measurer', { token: admin, body: { roles: ['measurer', 'crew'] } }));
    assert.deepEqual(
      (await list(crew)).filter((n) => n.section === 'video').map((n) => n.builtin),
      ['measurer', 'crew'],
    );

    // Удаление: раньше было запрещено, теперь админ удаляет, и ролик не возвращается.
    const deniedDelete = await call('DELETE', '/materials/mat_video_crew', { token: owner });
    assert.equal(deniedDelete.statusCode, 403);
    const after = await ok(await call('DELETE', '/materials/mat_video_crew', { token: admin }));
    assert.equal(after.some((n) => n.id === 'mat_video_crew'), false);
    resetStoredDocumentsForTests();
    assert.equal((await list(admin)).some((n) => n.id === 'mat_video_crew'), false);
    assert.deepEqual((await list(crew)).filter((n) => n.section === 'video').map((n) => n.builtin), ['measurer']);
  });

  test('новое видео загружается в раздел видео с ролями, только видеофайл и вне папок', async () => {
    const key = 'materials/mat_newvideo';
    objects.set(idOf(MATERIALS, key), Buffer.alloc(5000, 1));
    types.set(idOf(MATERIALS, key), 'video/mp4');
    const nodes = await ok(
      await call('POST', '/materials/files', {
        token: admin,
        body: { name: 'Новый ролик.mp4', storageKey: key, section: 'video', roles: ['crew'] },
      }),
    );
    const video = nodes.find((n) => n.name === 'Новый ролик.mp4');
    assert.equal(video.section, 'video');
    assert.deepEqual(video.roles, ['crew']);
    assert.ok((await list(crew)).some((n) => n.id === video.id));
    assert.equal((await list(owner)).some((n) => n.id === video.id), false);

    const notVideo = await call('POST', '/materials/files', {
      token: admin,
      body: { name: 'текст.txt', mime: 'text/plain', contentBase64: TXT, section: 'video' },
    });
    assert.equal(notVideo.statusCode, 400);
    assert.match(JSON.parse(notVideo.body).message, /только видеофайл/);
  });
});
