import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, describe } from 'node:test';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-feedback-'));
process.env.PLATFORM_FILE = path.join(dir, 'platform.json');
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'feedback-local-test-secret-000000';

const { handler } = await import('./index.js');
const shared = await import('../../packages/shared/feedback.js');

after(() => rmSync(dir, { recursive: true, force: true }));

/** Минимальный JPEG width×height. */
function makeJpeg(width = 64, height = 48) {
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 3;
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    sof,
    Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
    Buffer.alloc(32, 0x11),
    Buffer.from([0xff, 0xd9]),
  ]);
}
const jpeg = makeJpeg().toString('base64');

function call(method, urlPath, { token, body, query } = {}) {
  return handler({
    httpMethod: method,
    path: urlPath,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    queryStringParameters: query,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const readJson = (r) => JSON.parse(r.body || '{}');

async function login(name, password) {
  const r = await call('POST', '/auth/login', { body: { login: name, password } });
  assert.equal(r.statusCode, 200, r.body);
  return readJson(r).token;
}

describe('общие правила', () => {
  test('кто отправляет и кто разбирает', () => {
    for (const role of ['owner', 'sales', 'measurer', 'crew']) assert.equal(shared.canSendFeedback(role), true, role);
    for (const role of ['admin', 'stp_manager', '', null]) assert.equal(shared.canSendFeedback(role), false, String(role));
    assert.equal(shared.canManageFeedback('admin'), true);
    assert.equal(shared.canManageFeedback('stp_manager'), false);
    assert.equal(shared.canManageFeedback('owner'), false);
  });

  test('текст обязателен и обрезается, контекст чистится', () => {
    assert.ok(shared.cleanFeedbackText('   ').error);
    assert.equal(shared.cleanFeedbackText('x'.repeat(5000)).value.length, shared.FEEDBACK_TEXT_MAX);
    assert.equal(shared.cleanFeedbackText('  Ошибка\u0007 в КП ').value, 'Ошибка в КП');
    const ctx = shared.cleanFeedbackContext({ page: '/cabinet/#projects', device: 'a'.repeat(999), online: 'да', extra: 1 });
    assert.equal(ctx.page, '/cabinet/#projects');
    assert.equal(ctx.device.length, 300);
    assert.equal(ctx.online, null);
    assert.equal('extra' in ctx, false);
  });

  test('фильтр и счётчик новых', () => {
    const items = [
      { id: 1, status: 'new', type: 'bug', orgId: 'a', createdAt: '2026-11-01' },
      { id: 2, status: 'fixed', type: 'idea', orgId: 'b', createdAt: '2026-11-03' },
      { id: 3, status: 'new', type: 'idea', orgId: 'b', createdAt: '2026-11-02' },
    ];
    assert.equal(shared.countNewFeedback(items), 2);
    assert.deepEqual(shared.filterFeedback(items).map((i) => i.id), [2, 3, 1]);
    assert.deepEqual(shared.filterFeedback(items, { status: 'new', orgId: 'b' }).map((i) => i.id), [3]);
    assert.deepEqual(shared.filterFeedback(items, { type: 'bug' }).map((i) => i.id), [1]);
  });
});

describe('маршруты /feedback', () => {
  test('демо-сеть: у админа уже есть примеры, одно новое', async () => {
    const admin = await login('admin', 'admin1234');
    const r = await call('GET', '/feedback', { token: admin });
    assert.equal(r.statusCode, 200, r.body);
    const data = readJson(r);
    assert.ok(data.items.length >= 3);
    assert.equal(data.newCount, 1);
    assert.ok(data.items.some((i) => i.reply && i.status === 'fixed'));
  });

  test('без входа 401; менеджер StP и пустой текст отклоняются', async () => {
    assert.equal((await call('GET', '/feedback')).statusCode, 401);
    assert.equal((await call('POST', '/feedback', { body: { type: 'bug', text: 'x' } })).statusCode, 401);
    const stp = await login('stpmgr1', 'exec1234');
    assert.equal((await call('GET', '/feedback', { token: stp })).statusCode, 403);
    assert.equal((await call('POST', '/feedback', { token: stp, body: { type: 'bug', text: 'x' } })).statusCode, 403);
    assert.equal((await call('GET', '/feedback/summary', { token: stp })).statusCode, 403);
    const crew = await login('crew1', 'exec1234');
    assert.equal((await call('POST', '/feedback', { token: crew, body: { type: 'bug', text: '  ' } })).statusCode, 400);
    assert.equal((await call('POST', '/feedback', { token: crew, body: { type: 'spam', text: 'текст' } })).statusCode, 400);
  });

  test('монтажник отправляет с фото; сервер сам ставит компанию, сотрудника и роль', async () => {
    const crew = await login('crew1', 'exec1234');
    const created = await call('POST', '/feedback', {
      token: crew,
      body: {
        type: 'bug',
        text: 'Не грузится схема',
        companyName: 'Чужая компания',
        authorRole: 'admin',
        orgId: 'org_other',
        context: { page: '/cabinet/#projects', device: 'Телефон · Android · Chrome', appVersion: '1.1.0', screen: '412×915' },
      },
    });
    assert.equal(created.statusCode, 200, created.body);
    const item = readJson(created).item;
    assert.equal(item.status, 'new');
    assert.equal(item.orgId, 'org_demo');
    assert.equal(item.authorRole, 'crew');
    assert.equal(item.companyName, 'Потолки Столицы');
    assert.equal(item.context.page, '/cabinet/#projects');
    assert.ok(item.createdAt);

    for (let i = 0; i < shared.FEEDBACK_PHOTO_LIMIT; i += 1) {
      const up = await call('POST', `/feedback/${item.id}/photos`, { token: crew, body: { image: jpeg, thumb: jpeg } });
      assert.equal(up.statusCode, 200, up.body);
    }
    const extra = await call('POST', `/feedback/${item.id}/photos`, { token: crew, body: { image: jpeg, thumb: jpeg } });
    assert.equal(extra.statusCode, 409);
    const bad = await call('POST', `/feedback/${item.id}/photos`, { token: crew, body: { image: 'bm90IGEganBlZw==', thumb: jpeg } });
    assert.ok([400, 409].includes(bad.statusCode));

    // Чужой сотрудник той же компании не добавит фото и не увидит обращение.
    const sales = await login('sales1', 'exec1234');
    assert.equal((await call('POST', `/feedback/${item.id}/photos`, { token: sales, body: { image: jpeg, thumb: jpeg } })).statusCode, 404);
    assert.equal((await call('GET', `/feedback/${item.id}`, { token: sales })).statusCode, 404);
    const salesList = readJson(await call('GET', '/feedback', { token: sales })).items;
    assert.equal(salesList.some((i) => i.id === item.id), false);
    assert.ok(salesList.every((i) => i.authorLogin === 'sales1'));

    // Свои обращения монтажник видит, фото открываются по подписанной ссылке.
    const mine = readJson(await call('GET', '/feedback', { token: crew })).items;
    const own = mine.find((i) => i.id === item.id);
    assert.equal(own.photos.length, 5);
    const url = new URL(own.photos[0].thumbUrl, 'http://local');
    const file = await call('GET', url.pathname, { query: Object.fromEntries(url.searchParams) });
    assert.equal(file.statusCode, 200);
    assert.equal(file.headers['Content-Type'], 'image/jpeg');
    const forged = await call('GET', url.pathname, { query: { ...Object.fromEntries(url.searchParams), s: 'x' } });
    assert.equal(forged.statusCode, 404);
    assert.equal(JSON.stringify(own).includes('storageKey'), false);
  });

  test('админ фильтрует, меняет статус и отвечает; ответ видит отправитель; партнёр не меняет статус', async () => {
    const owner = await login('partner1', 'demo1234');
    const created = readJson(
      await call('POST', '/feedback', { token: owner, body: { type: 'idea', text: 'Добавьте тёмную тему в КП' } }),
    ).item;
    assert.equal((await call('PATCH', `/feedback/${created.id}`, { token: owner, body: { status: 'fixed' } })).statusCode, 403);

    const admin = await login('admin', 'admin1234');
    const summary = readJson(await call('GET', '/feedback/summary', { token: admin }));
    assert.ok(summary.newCount >= 2);
    const ideas = readJson(await call('GET', '/feedback', { token: admin, query: { type: 'idea', status: 'new' } })).items;
    assert.ok(ideas.some((i) => i.id === created.id));
    assert.ok(ideas.every((i) => i.type === 'idea' && i.status === 'new'));
    const byOrg = readJson(await call('GET', '/feedback', { token: admin, query: { orgId: 'org_none' } })).items;
    assert.equal(byOrg.length, 0);

    assert.equal((await call('PATCH', `/feedback/${created.id}`, { token: admin, body: { status: 'done' } })).statusCode, 400);
    const patched = await call('PATCH', `/feedback/${created.id}`, {
      token: admin,
      body: { status: 'in_progress', reply: 'Спасибо, посмотрим в ноябре.' },
    });
    assert.equal(patched.statusCode, 200, patched.body);
    assert.equal(readJson(patched).item.status, 'in_progress');

    const mine = readJson(await call('GET', '/feedback', { token: owner })).items.find((i) => i.id === created.id);
    assert.equal(mine.status, 'in_progress');
    assert.equal(mine.reply, 'Спасибо, посмотрим в ноябре.');
    assert.ok(mine.repliedAt);
    assert.ok(mine.replyAuthorName);
    assert.equal((await call('PATCH', '/feedback/fb_missing', { token: admin, body: { status: 'fixed' } })).statusCode, 404);
  });
});
