import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const PARTNERS = 'multiframe-partner-data';
const MATERIALS = 'multiframe-partner-materials';

process.env.PARTNERS_BUCKET = PARTNERS;
process.env.MATERIALS_BUCKET = MATERIALS;
process.env.JWT_SECRET = 'materials-bucket-test';
process.env.YC_ACCESS_KEY_ID = 'YCAJEtestaccesskey123';
process.env.YC_SECRET_ACCESS_KEY = 'test-secret-key-with-enough-length';
process.env.YC_REGION = 'ru-central1';

const calls = [];
const objects = new Map();

function storedObject(bucket, key) {
  return `${bucket}::${key}`;
}

const { documentEtag, setObjectStoreTransportForTests } = await import('./objectStore.js');
setObjectStoreTransportForTests(async (op) => {
  calls.push({
    action: op.action,
    bucket: op.bucket,
    key: op.key,
    responseContentDisposition: op.responseContentDisposition,
  });
  if (op.action === 'put') {
    objects.set(storedObject(op.bucket, op.key), op.body);
    return { etag: documentEtag(op.body) };
  }
  if (op.action === 'head') {
    const body = objects.get(storedObject(op.bucket, op.key));
    if (body == null) return { missing: true, etag: null, contentLength: null, contentType: null };
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    return {
      missing: false,
      etag: documentEtag(body),
      contentLength: buf.length,
      contentType: String(op.key).endsWith('.json') ? 'application/json' : 'application/octet-stream',
    };
  }
  if (op.action === 'get') {
    return objects.has(storedObject(op.bucket, op.key))
      ? objects.get(storedObject(op.bucket, op.key))
      : null;
  }
  if (op.action === 'delete') {
    objects.delete(storedObject(op.bucket, op.key));
    return null;
  }
  if (op.action === 'sign-get') {
    return `https://${op.bucket}.storage.yandexcloud.net/${op.key}?X-Amz-Expires=900&X-Amz-Signature=test`;
  }
  throw new Error(`unexpected storage action ${op.action}`);
});

const { handler } = await import('./index.js');
const { handleMaterials } = await import('./materialsRoutes.js');
const { deleteMaterialBytes, putMaterialBytes } = await import('./materialsStorage.js');

const pdfBase64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n').toString('base64');

function resetCalls() {
  calls.length = 0;
}

function puts(action = 'put') {
  return calls.filter((call) => call.action === action);
}

async function login(loginName, password) {
  const response = await handler({
    httpMethod: 'POST',
    path: '/auth/login',
    body: JSON.stringify({ login: loginName, password }),
  });
  assert.equal(response.statusCode, 200, response.body);
  return JSON.parse(response.body).token;
}

function authed(token, method, path, body) {
  return handler({
    httpMethod: method,
    path,
    headers: { Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function materialsCtx({ materials, user, method, path, body }) {
  return {
    path,
    method,
    requireAuth: async () => {
      if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
      return { platform: { materials }, user };
    },
    assertRole(current, roles) {
      if (!roles.includes(current.role)) {
        throw Object.assign(new Error('Недостаточно прав'), { status: 403 });
      }
    },
    json(statusCode, payload) {
      return { statusCode, headers: {}, body: JSON.stringify(payload) };
    },
    getBody: () => body || {},
    savePlatform: async () => {},
    uid: () => 'mat_fixedid01',
  };
}

async function callMaterials(input) {
  try {
    return await handleMaterials(materialsCtx(input));
  } catch (error) {
    return {
      statusCode: error.status || 500,
      body: JSON.stringify({ message: error.message }),
    };
  }
}

function fileNode(extra) {
  return {
    id: extra.id,
    parentId: null,
    kind: 'file',
    name: extra.name,
    mime: extra.mime,
    size: 12,
    stub: extra.stub || null,
    storageKey: extra.storageKey ?? null,
    bucket: extra.bucket,
    contentBase64: extra.contentBase64 || null,
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

test('платформа, аналитика и документы пишутся в бакет кабинета, материалы — в свой', async () => {
  const admin = await login('admin', 'admin1234');
  assert.ok(
    puts().some((call) => call.bucket === PARTNERS && call.key === 'platform-v2.json'),
    'сохранение платформы при входе',
  );
  assert.equal(
    puts().some((call) => call.bucket === MATERIALS),
    false,
  );

  resetCalls();
  const analytics = await handler({
    httpMethod: 'POST',
    path: '/analytics/events',
    body: JSON.stringify({
      events: [
        {
          id: 'ae_materials_bucket',
          at: '2026-10-18T08:00:00.000Z',
          tool: 'calculator',
          action: 'open',
          login: 'partner1',
        },
      ],
    }),
  });
  assert.equal(analytics.statusCode, 200, analytics.body);
  assert.ok(puts().some((call) => call.bucket === PARTNERS && call.key === 'analytics-events.json'));
  assert.equal(puts().some((call) => call.bucket === MATERIALS), false);

  const owner = await login('partner1', 'demo1234');
  resetCalls();
  const listed = await authed(owner, 'GET', '/objects');
  assert.equal(listed.statusCode, 200, listed.body);
  const objectId = JSON.parse(listed.body).objects?.[0]?.id;
  assert.ok(objectId, 'у демо-компании есть объект');
  const saved = await authed(owner, 'POST', `/objects/${objectId}/documents`, {
    documents: [{ kind: 'estimate', filename: 'смета.pdf', pdfBase64 }],
  });
  assert.equal(saved.statusCode, 200, saved.body);
  const docPuts = puts().filter((call) => String(call.key).startsWith('docs/'));
  assert.equal(docPuts.length, 1);
  assert.equal(docPuts[0].bucket, PARTNERS);
  const docId = JSON.parse(saved.body).object.documents[0].id;
  resetCalls();
  const downloaded = await authed(owner, 'GET', `/objects/${objectId}/documents/${docId}`);
  assert.equal(downloaded.statusCode, 200, downloaded.body);
  assert.equal(JSON.parse(downloaded.body).pdfBase64, pdfBase64);
  assert.ok(calls.some((call) => call.action === 'get' && call.bucket === PARTNERS && String(call.key).startsWith('docs/')));
  assert.equal(calls.some((call) => call.bucket === MATERIALS), false);

  resetCalls();
  const uploaded = await authed(admin, 'POST', '/materials/files', {
    name: 'Памятка.pdf',
    mime: 'application/pdf',
    contentBase64: pdfBase64,
  });
  assert.equal(uploaded.statusCode, 200, uploaded.body);
  const materialPuts = puts().filter((call) => String(call.key).startsWith('materials/'));
  assert.equal(materialPuts.length, 1);
  assert.equal(materialPuts[0].bucket, MATERIALS);
  assert.equal(
    puts().some((call) => call.bucket === PARTNERS && String(call.key).startsWith('materials/')),
    false,
  );
  const platformPut = puts().find((call) => call.key === 'platform-v2.json');
  assert.equal(platformPut.bucket, PARTNERS);
  const stored = JSON.parse(objects.get(storedObject(PARTNERS, 'platform-v2.json')));
  const node = stored.materials.find((item) => item.name === 'Памятка.pdf');
  assert.equal(node.bucket, 'materials');
  assert.match(node.storageKey, /^materials\/mat_[a-z0-9_]+$/i);

  const materialId = JSON.parse(uploaded.body).materials.find((item) => item.name === 'Памятка.pdf').id;
  const crew = await login('crew1', 'exec1234');
  resetCalls();
  const opened = await authed(crew, 'GET', `/materials/${materialId}/content`);
  assert.equal(opened.statusCode, 200, opened.body);
  const payload = JSON.parse(opened.body);
  assert.equal(payload.base64, undefined);
  assert.match(payload.url, new RegExp(`https://${MATERIALS}\\.storage\\.yandexcloud\\.net/materials/`));
  assert.equal(calls.some((call) => call.action === 'sign-get' && call.bucket === MATERIALS), true);
  assert.equal(
    calls.some(
      (call) =>
        call.bucket === PARTNERS &&
        !(
          (call.action === 'head' || call.action === 'get') &&
          (call.key === 'platform-v2.json' || call.key === 'analytics-events.json')
        ),
    ),
    false,
  );

  const beforeDenied = calls.length;
  const anonymous = await handler({ httpMethod: 'GET', path: `/materials/${materialId}/content` });
  assert.equal(anonymous.statusCode, 401, anonymous.body);
  assert.equal(calls.length, beforeDenied);

  resetCalls();
  const removed = await authed(admin, 'DELETE', `/materials/${materialId}`);
  assert.equal(removed.statusCode, 200, removed.body);
  const deletions = puts('delete');
  assert.equal(deletions.length, 1);
  assert.equal(deletions[0].bucket, MATERIALS);
  assert.equal(deletions.some((call) => call.bucket === PARTNERS), false);
});

test('без MATERIALS_BUCKET загрузка отвечает 503 и не пишет в бакет кабинета', async () => {
  const admin = await login('admin', 'admin1234');
  const previous = process.env.MATERIALS_BUCKET;
  delete process.env.MATERIALS_BUCKET;
  try {
    resetCalls();
    const response = await authed(admin, 'POST', '/materials/files', {
      name: 'Лишнее.pdf',
      mime: 'application/pdf',
      contentBase64: pdfBase64,
    });
    assert.equal(response.statusCode, 503, response.body);
    assert.equal(JSON.parse(response.body).message, 'Хранилище материалов не настроено');
    assert.equal(calls.some((call) => call.action === 'put' || call.action === 'delete'), false);
  } finally {
    process.env.MATERIALS_BUCKET = previous;
  }
});

test('совпадение бакетов — ошибка конфигурации, записи материалов нет', async () => {
  const admin = await login('admin', 'admin1234');
  const previous = process.env.MATERIALS_BUCKET;
  process.env.MATERIALS_BUCKET = process.env.PARTNERS_BUCKET;
  try {
    resetCalls();
    const response = await authed(admin, 'POST', '/materials/files', {
      name: 'Смешанный.pdf',
      mime: 'application/pdf',
      contentBase64: pdfBase64,
    });
    assert.equal(response.statusCode, 503, response.body);
    assert.match(JSON.parse(response.body).message, /совпадает/);
    assert.equal(calls.some((call) => call.action === 'put' || call.action === 'delete'), false);
  } finally {
    process.env.MATERIALS_BUCKET = previous;
  }
});

test('старый узел читается из бакета кабинета и при удалении оттуда не стирается', async () => {
  const legacy = fileNode({
    id: 'mat_oldfile',
    name: 'Старое видео.mp4',
    mime: 'video/mp4',
    storageKey: 'materials/mat_oldfile',
  });
  const fresh = fileNode({
    id: 'mat_newfile',
    name: 'Новое.pdf',
    mime: 'application/pdf',
    storageKey: 'materials/mat_newfile',
    bucket: 'materials',
  });
  const embedded = fileNode({
    id: 'mat_note',
    name: 'Заметка.txt',
    mime: 'text/plain',
    storageKey: null,
    contentBase64: Buffer.from('локально').toString('base64'),
  });
  resetCalls();
  const previous = process.env.MATERIALS_BUCKET;
  delete process.env.MATERIALS_BUCKET;
  try {
    const legacyRead = await callMaterials({
      materials: [legacy],
      user: { id: 'u', login: 'crew1', role: 'crew' },
      method: 'GET',
      path: '/materials/mat_oldfile/content',
    });
    assert.equal(legacyRead.statusCode, 200, legacyRead.body);
    const legacyBody = JSON.parse(legacyRead.body);
    assert.match(legacyBody.url, new RegExp(`https://${PARTNERS}\\.storage\\.yandexcloud\\.net/materials/mat_oldfile`));
    assert.equal(legacyBody.base64, undefined);
    assert.equal(calls.some((call) => call.action === 'sign-get' && call.bucket === PARTNERS), true);
    assert.equal(calls.some((call) => ['put', 'delete', 'get'].includes(call.action) && call.bucket === PARTNERS), false);

    resetCalls();
    const missingNew = await callMaterials({
      materials: [fresh],
      user: { id: 'u', login: 'crew1', role: 'crew' },
      method: 'GET',
      path: '/materials/mat_newfile/content',
    });
    assert.equal(missingNew.statusCode, 503, missingNew.body);
    assert.equal(JSON.parse(missingNew.body).message, 'Хранилище материалов не настроено');
    assert.equal(calls.length, 0);

    resetCalls();
    const removed = await callMaterials({
      materials: [legacy],
      user: { id: 'u', login: 'admin', role: 'admin' },
      method: 'DELETE',
      path: '/materials/mat_oldfile',
    });
    assert.equal(removed.statusCode, 200, removed.body);
    assert.equal(calls.some((call) => call.action === 'delete' || call.action === 'put'), false);
  } finally {
    process.env.MATERIALS_BUCKET = previous;
  }

  resetCalls();
  const base64 = await callMaterials({
    materials: [embedded],
    user: { id: 'u', login: 'owner', role: 'owner' },
    method: 'GET',
    path: '/materials/mat_note/content',
  });
  assert.equal(base64.statusCode, 200, base64.body);
  assert.equal(JSON.parse(base64.body).base64, embedded.contentBase64);
  assert.equal(JSON.parse(base64.body).url, undefined);
  assert.equal(calls.length, 0);

  const stub = await callMaterials({
    materials: undefined,
    user: { id: 'u', login: 'sales', role: 'sales' },
    method: 'GET',
    path: '/materials/mat_file_video/content',
  });
  assert.equal(stub.statusCode, 200, stub.body);
  assert.equal(JSON.parse(stub.body).stub, 'video-install');
});

test('подписанная ссылка выдаётся только ролям кабинета', async () => {
  const node = fileNode({
    id: 'mat_shared',
    name: 'Общий.pdf',
    mime: 'application/pdf',
    storageKey: 'materials/mat_shared',
    bucket: 'materials',
  });
  for (const role of ['admin', 'owner', 'sales', 'measurer', 'crew']) {
    resetCalls();
    const response = await callMaterials({
      materials: [node],
      user: { id: 'u', login: role, role },
      method: 'GET',
      path: '/materials/mat_shared/content',
    });
    assert.equal(response.statusCode, 200, `${role}: ${response.body}`);
    assert.match(JSON.parse(response.body).url, /multiframe-partner-materials/);
    assert.equal(calls.filter((call) => call.action === 'sign-get').length, 1);
  }

  resetCalls();
  const denied = await callMaterials({
    materials: [node],
    user: { id: 'u', login: 'guest', role: 'guest' },
    method: 'GET',
    path: '/materials/mat_shared/content',
  });
  assert.equal(denied.statusCode, 403, denied.body);
  assert.equal(calls.length, 0);

  const anonymous = await callMaterials({
    materials: [node],
    user: null,
    method: 'GET',
    path: '/materials/mat_shared/content',
  });
  assert.equal(anonymous.statusCode, 401, anonymous.body);
  assert.equal(calls.length, 0);
});

test('функции материалов не пишут и не удаляют ключи бакета кабинета', async () => {
  resetCalls();
  await assert.rejects(putMaterialBytes('platform-v2.json', '{}', 'application/json'), /Некорректный ключ/);
  await assert.rejects(putMaterialBytes('docs/org/object/doc.pdf', pdfBase64, 'application/pdf'), /Некорректный ключ/);
  await assert.rejects(deleteMaterialBytes('analytics-events.json'), /Некорректный ключ/);
  assert.equal(calls.length, 0);

  await putMaterialBytes('materials/mat_only', Buffer.from('%PDF'), 'application/pdf');
  await deleteMaterialBytes('materials/mat_only');
  assert.deepEqual(
    calls.map((call) => `${call.action}:${call.bucket}:${call.key}`),
    [
      `put:${MATERIALS}:materials/mat_only`,
      `delete:${MATERIALS}:materials/mat_only`,
    ],
  );

  const previous = process.env.MATERIALS_BUCKET;
  process.env.MATERIALS_BUCKET = PARTNERS;
  try {
    resetCalls();
    await assert.rejects(putMaterialBytes('materials/mat_only', Buffer.from('%PDF'), 'application/pdf'), /совпадает/);
    await assert.rejects(deleteMaterialBytes('materials/mat_only'), /совпадает/);
    assert.equal(calls.length, 0);
  } finally {
    process.env.MATERIALS_BUCKET = previous;
  }
});

test('деплой не подставляет имя бакета и прокидывает MATERIALS_BUCKET', () => {
  const deploy = readFileSync(new URL('../../infra/deploy_yc.py', import.meta.url), 'utf8');
  const patch = readFileSync(new URL('../../infra/mf_doh_patch_deploy.py', import.meta.url), 'utf8');
  const workflow = readFileSync(new URL('../../.github/workflows/deploy-api.yml', import.meta.url), 'utf8');
  const cors = readFileSync(new URL('../../infra/set_materials_bucket_cors.mjs', import.meta.url), 'utf8');
  for (const source of [deploy, patch]) {
    assert.equal(source.includes('os.environ.get("PARTNERS_BUCKET", "multiframe-partner-data")'), false);
    assert.match(source, /MATERIALS_BUCKET/);
  }
  assert.match(workflow, /MATERIALS_BUCKET: \$\{\{ secrets\.MATERIALS_BUCKET \}\}/);
  assert.match(cors, /https:\/\/paulos99\.github\.io/);
  assert.match(cors, /const METHODS = \['GET', 'HEAD', 'PUT'\]/);
  assert.match(cors, /не выбирает бакет по умолчанию/);
  assert.equal(cors.includes("|| 'multiframe-partner"), false);
});

function folderNode(id, name, parentId = null) {
  return { id, parentId, kind: 'folder', name, updatedAt: '2026-10-01T00:00:00.000Z' };
}

test('материалы общие для всех партнёров: любые изменения — только админ StP (403 остальным)', async () => {
  const tree = () => [
    folderNode('mat_dir', 'Монтаж'),
    fileNode({ id: 'mat_f1', name: 'Схема.pdf', mime: 'application/pdf', storageKey: 'materials/mat_f1', bucket: 'materials' }),
  ].map((node, i) => (i === 1 ? { ...node, parentId: 'mat_dir' } : node));
  const writes = [
    { method: 'POST', path: '/materials/folders', body: { name: 'Новая' } },
    { method: 'POST', path: '/materials/files', body: { name: 'a.pdf', mime: 'application/pdf', contentBase64: pdfBase64 } },
    { method: 'POST', path: '/materials/files/upload-url', body: { name: 'a.pdf', mime: 'application/pdf' } },
    { method: 'PUT', path: '/materials/mat_f1/content', body: { name: 'b.pdf', mime: 'application/pdf', contentBase64: pdfBase64 } },
    { method: 'PATCH', path: '/materials/mat_dir', body: { name: 'Чужое' } },
    { method: 'DELETE', path: '/materials/mat_dir' },
    { method: 'DELETE', path: '/materials/mat_f1' },
  ];
  for (const role of ['owner', 'sales', 'measurer', 'crew']) {
    for (const write of writes) {
      resetCalls();
      const materials = tree();
      const before = JSON.stringify(materials);
      const response = await callMaterials({ ...write, materials, user: { id: 'u', login: role, role, orgId: 'org_1' } });
      assert.equal(response.statusCode, 403, `${role} ${write.method} ${write.path}: ${response.body}`);
      assert.equal(JSON.stringify(materials), before, `${role}: дерево не меняется`);
      assert.equal(calls.length, 0, `${role} ${write.method} ${write.path}: хранилище не трогаем`);
    }
  }
});

test('админ удаляет папку целиком: вложенные папки, записи и объекты в бакете материалов', async () => {
  const materials = [
    folderNode('mat_root', 'Обучение монтажу'),
    folderNode('mat_sub', 'Видео', 'mat_root'),
    { ...fileNode({ id: 'mat_a', name: 'А.pdf', mime: 'application/pdf', storageKey: 'materials/mat_a', bucket: 'materials' }), parentId: 'mat_root' },
    { ...fileNode({ id: 'mat_b', name: 'Б.mp4', mime: 'video/mp4', storageKey: 'materials/mat_b', bucket: 'materials' }), parentId: 'mat_sub' },
    // Старый узел из бакета кабинета: запись удаляется, объект в multiframe-partner-data не трогаем.
    { ...fileNode({ id: 'mat_old', name: 'Старое.pdf', mime: 'application/pdf', storageKey: 'materials/mat_old' }), parentId: 'mat_sub' },
    folderNode('mat_keep', 'Другая папка'),
  ];
  await putMaterialBytes('materials/mat_a', Buffer.from('a'), 'application/pdf');
  await putMaterialBytes('materials/mat_b', Buffer.from('b'), 'video/mp4');
  resetCalls();
  const response = await callMaterials({
    materials,
    user: { id: 'u', login: 'admin', role: 'admin' },
    method: 'DELETE',
    path: '/materials/mat_root',
  });
  assert.equal(response.statusCode, 200, response.body);
  const left = JSON.parse(response.body).materials.map((node) => node.id);
  assert.deepEqual(left, ['mat_keep']);
  const deleted = calls.filter((call) => call.action === 'delete');
  assert.deepEqual(
    deleted.map((call) => `${call.bucket}/${call.key}`).sort(),
    [`${MATERIALS}/materials/mat_a`, `${MATERIALS}/materials/mat_b`],
  );
  assert.equal(calls.some((call) => call.bucket === PARTNERS), false);
  assert.equal(objects.has(storedObject(MATERIALS, 'materials/mat_a')), false);
  assert.equal(objects.has(storedObject(MATERIALS, 'materials/mat_b')), false);
});
