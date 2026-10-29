import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, describe } from 'node:test';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-training-'));
process.env.PLATFORM_FILE = path.join(dir, 'platform.json');
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'training-local-test-secret-000';

const { handler } = await import('./index.js');
const { mergeTrainingDocument } = await import('./training.js');

after(() => rmSync(dir, { recursive: true, force: true }));

function call(method, urlPathWithQuery, { token, body } = {}) {
  const [urlPath, qs] = urlPathWithQuery.split('?');
  return handler({
    httpMethod: method,
    path: urlPath,
    queryStringParameters: qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const readJson = (r) => JSON.parse(r.body || '{}');
const ids = {};
async function login(name, password) {
  const r = await call('POST', '/auth/login', { body: { login: name, password } });
  assert.equal(r.statusCode, 200, r.body);
  const data = readJson(r);
  ids[name] = data.user.id;
  return data.token;
}

const NOW = Date.now();
const attempt = (id, over = {}) => ({
  id,
  mode: 'objection',
  scheme: 2,
  itemIds: ['obj-price-expensive'],
  startedAt: new Date(NOW - 300000).toISOString(),
  finishedAt: new Date(NOW - 1000).toISOString(),
  firstTryCorrect: 0.5,
  count: 2,
  total: 3.2,
  passed: false,
  criteria: { listening: 5, honesty: 2 },
  misses: [{ objectionId: 'obj-price-expensive', reasonKey: 'price_too_high', errorType: 'vague', violates: 'honesty' }],
  ...over,
});

describe('обучение в аналитике', { concurrency: false }, () => {
  const t = {};

  test('вход всех ролей', async () => {
    t.admin = await login('admin', 'admin1234');
    t.owner1 = await login('partner1', 'demo1234');
    t.owner2 = await login('partner2', 'demo1234');
    t.sales1 = await login('sales1', 'exec1234');
    t.crew1 = await login('crew1', 'exec1234');
    t.crew2 = await login('crew2', 'exec1234');
    t.measurer1 = await login('exec1', 'exec1234');
  });

  test('без входа — 401', async () => {
    for (const [m, p] of [['POST', '/training/sync'], ['GET', '/training/me'], ['GET', '/training/org'], ['GET', '/training/companies']]) {
      assert.equal((await call(m, p)).statusCode, 401, p);
    }
  });

  test('запись: идемпотентна, повтор не плодит дубль и тоже считается принятым', async () => {
    const body = { attempts: [attempt('t-a-1'), attempt('t-a-2', { firstTryCorrect: 1, passed: true })], materials: [{ id: 'm-1', materialId: 'mat-9', title: 'Монтаж', at: new Date(NOW - 5000).toISOString() }] };
    const first = readJson(await call('POST', '/training/sync', { token: t.crew2, body }));
    assert.deepEqual(first.acceptedAttemptIds, ['t-a-1', 't-a-2']);
    assert.deepEqual(first.acceptedMaterialIds, ['m-1']);
    assert.equal(first.stored, 3);
    const again = readJson(await call('POST', '/training/sync', { token: t.crew2, body }));
    assert.equal(again.stored, 0);
    assert.deepEqual(again.acceptedAttemptIds, ['t-a-1', 't-a-2']);
    const me = readJson(await call('GET', '/training/me', { token: t.crew2 }));
    assert.equal(me.summary.sets >= 2, true);
    const mine = me.attempts.filter((a) => a.id.startsWith('t-a-'));
    assert.equal(mine.length, 2, 'дублей нет');
  });

  test('проверка записей: чужие поля, неверные значения и старая схема отбрасываются', async () => {
    const bad = [
      { id: 'bad id!', mode: 'objection', scheme: 2, finishedAt: new Date(NOW).toISOString() },
      attempt('t-old', { scheme: 1 }),
      attempt('t-mode', { mode: 'hack' }),
      attempt('t-date', { finishedAt: 'вчера' }),
      null,
      'x',
    ];
    const r = readJson(await call('POST', '/training/sync', { token: t.crew2, body: { attempts: [...bad, attempt('t-ok', { typedAnswer: 'секретный текст', text: 'не сохранять' })] } }));
    assert.deepEqual(r.acceptedAttemptIds, ['t-ok']);
    assert.equal(r.rejected, 6);
    const stored = readJson(await call('GET', `/training/user/${ids.crew2}`, { token: t.owner2 }));
    assert.ok(!JSON.stringify(stored).includes('секретный текст'));
  });

  test('будущая дата подтягивается к текущему времени, лишних записей за раз не принимаем', async () => {
    const r = await call('POST', '/training/sync', { token: t.crew2, body: { attempts: [attempt('t-fut', { finishedAt: new Date(NOW + 10 * 86400000).toISOString() })] } });
    assert.equal(r.statusCode, 200);
    const many = Array.from({ length: 101 }, (_, i) => attempt(`t-many-${i}`));
    assert.equal((await call('POST', '/training/sync', { token: t.crew2, body: { attempts: many } })).statusCode, 413);
  });

  test('запись: админ без компании не пишет', async () => {
    assert.equal((await call('POST', '/training/sync', { token: t.admin, body: { attempts: [attempt('t-adm')] } })).statusCode, 403);
  });

  test('владелец видит только свою компанию', async () => {
    const own = await call('GET', '/training/org', { token: t.owner2 });
    assert.equal(own.statusCode, 200);
    const data = readJson(own);
    assert.equal(data.org.id, 'org_demo_spb');
    assert.deepEqual(new Set(data.employees.map((e) => e.role)), new Set(['sales', 'measurer', 'crew']));
    assert.ok(!data.employees.some((e) => e.id === ids.partner2), 'владелец в таблицу не входит');
    assert.ok(!data.employees.some((e) => e.id === ids.sales1), 'чужих сотрудников нет');
    assert.equal((await call('GET', '/training/org?orgId=org_demo', { token: t.owner2 })).statusCode, 403);
    assert.equal((await call('GET', '/training/org?orgId=org_demo_spb', { token: t.owner2 })).statusCode, 200);
    assert.equal((await call('GET', `/training/user/${ids.sales1}`, { token: t.owner2 })).statusCode, 404, 'чужой сотрудник');
    assert.equal((await call('GET', `/training/user/${ids.crew2}`, { token: t.owner2 })).statusCode, 200);
    assert.equal((await call('GET', '/training/companies', { token: t.owner2 })).statusCode, 403);
  });

  test('менеджер, замерщик и монтажник чужого обучения не видят', async () => {
    for (const tok of [t.sales1, t.measurer1, t.crew1]) {
      assert.equal((await call('GET', '/training/org', { token: tok })).statusCode, 403);
      assert.equal((await call('GET', '/training/companies', { token: tok })).statusCode, 403);
      assert.equal((await call('GET', `/training/user/${ids.crew2}`, { token: tok })).statusCode, 403);
    }
    assert.equal((await call('GET', `/training/user/${ids.sales1}`, { token: t.sales1 })).statusCode, 200, 'себя можно');
    assert.equal((await call('GET', `/training/user/${ids.crew1}`, { token: t.sales1 })).statusCode, 403, 'коллегу из своей же компании нельзя');
  });

  test('админ видит все компании и любого сотрудника', async () => {
    const list = readJson(await call('GET', '/training/companies', { token: t.admin }));
    assert.deepEqual(list.companies.map((c) => c.id).sort(), ['org_demo', 'org_demo_spb']);
    for (const c of list.companies) {
      assert.ok(c.summary.staffTotal >= 3);
      assert.ok(c.summary.trained >= 1);
      assert.equal(typeof c.summary.active30, 'number');
    }
    assert.equal((await call('GET', '/training/org', { token: t.admin })).statusCode, 400, 'нужна компания');
    assert.equal((await call('GET', '/training/org?orgId=nope', { token: t.admin })).statusCode, 404);
    assert.equal((await call('GET', '/training/org?orgId=../x', { token: t.admin })).statusCode, 400);
    const org = readJson(await call('GET', '/training/org?orgId=org_demo', { token: t.admin }));
    assert.equal(org.org.id, 'org_demo');
    assert.equal((await call('GET', `/training/user/${ids.crew1}`, { token: t.admin })).statusCode, 200);
    assert.equal((await call('GET', '/training/user/u_nope', { token: t.admin })).statusCode, 404);
  });

  test('демо-данные: у демо-компании есть уровни, слабые темы и недавняя активность', async () => {
    const data = readJson(await call('GET', '/training/org?orgId=org_demo', { token: t.admin }));
    const by = Object.fromEntries(data.employees.map((e) => [e.id, e]));
    assert.equal(by[ids.sales1].level.title, 'Мастер');
    assert.ok(by[ids.sales1].sets >= 10);
    assert.ok(by[ids.crew1].weakTopics.length > 0);
    assert.ok(data.summary.trained >= 3);
    assert.ok(data.summary.active7 >= 1);
    assert.ok(data.summary.weakTopics.length > 0);
  });

  test('слияние версий документа не теряет записи ни одной из сторон', () => {
    const a = { users: { u1: { attempts: [{ id: 'x', finishedAt: '2026-01-02' }], materials: [] } } };
    const b = { users: { u1: { attempts: [{ id: 'y', finishedAt: '2026-01-03' }, { id: 'x', finishedAt: '2026-01-02' }], materials: [] }, u2: { attempts: [], materials: [{ id: 'm', at: '2026-01-01' }] } } };
    const merged = mergeTrainingDocument(undefined, a, b);
    assert.deepEqual(merged.users.u1.attempts.map((x) => x.id), ['y', 'x']);
    assert.equal(merged.users.u2.materials.length, 1);
  });
});
