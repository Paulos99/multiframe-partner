import assert from 'node:assert/strict';
import test, { beforeEach, describe } from 'node:test';
import { documentEtag, normalizeEtag, setObjectStoreTransportForTests } from './objectStore.js';
import {
  loadSharedDocument,
  loadStoredDocument,
  mergeEventList,
  resetStoredDocumentsForTests,
  saveStoredDocument,
} from './platformStore.js';

process.env.PARTNERS_BUCKET = 'test-partners';
process.env.DEMO_SEED = '1';
process.env.MATERIALS_BUCKET = 'test-materials';
process.env.JWT_SECRET = 'scale-2000-test';
process.env.ANALYTICS_ADMIN_KEY = 'scale-2000-analytics-key';
process.env.YC_ACCESS_KEY_ID = 'YCAJEtestaccesskey123';
process.env.YC_SECRET_ACCESS_KEY = 'test-secret-key-with-enough-length';
process.env.YC_REGION = 'ru-central1';
process.env.MAX_OBJECTS = '1000';
process.env.ANALYTICS_EVENTS_CAP = '4';
process.env.AUDIT_LOG_CAP = '5';
// Свободные от прошлых запусков поверхности: данные и проверка миграций строго в этом процессе.
process.env.MF_FREEZE_SHARED = '1';
delete process.env.PLATFORM_FILE;
delete process.env.DOC_FRESH_MS;

const objects = new Map();
const calls = [];

const idOf = (bucket, key) => `${bucket}::${key}`;

function storageError(name, status) {
  const error = new Error(name);
  error.name = name;
  error.status = status;
  return error;
}

setObjectStoreTransportForTests(async (op) => {
  calls.push({ action: op.action, key: op.key });
  const id = idOf(op.bucket, op.key);
  if (op.action === 'head') {
    if (!objects.has(id)) return { missing: true, etag: null, contentLength: null, contentType: null };
    const body = objects.get(id);
    return { missing: false, etag: documentEtag(body), contentLength: Buffer.byteLength(body), contentType: 'application/json' };
  }
  if (op.action === 'get') {
    // Ответ чтения занимает время: параллельные запросы успевают столкнуться на холодном старте.
    await new Promise((resolve) => setTimeout(resolve, 15));
    return objects.has(id) ? objects.get(id) : null;
  }
  if (op.action === 'put') {
    if (op.ifNoneMatch === '*' && objects.has(id)) throw storageError('PreconditionFailed', 412);
    if (op.ifMatch) {
      if (!objects.has(id)) throw storageError('NotFound', 404);
      if (normalizeEtag(op.ifMatch) !== documentEtag(objects.get(id))) throw storageError('PreconditionFailed', 412);
    }
    objects.set(id, op.body);
    return { etag: documentEtag(op.body) };
  }
  if (op.action === 'delete') {
    objects.delete(id);
    return null;
  }
  throw new Error(`unexpected storage action ${op.action}`);
});

const { handler, resetPlatformMemoryForTests, mergeLoginState, dayKey, resolveAnalyticsTz, aggregateAnalyticsDashboard } =
  await import('./index.js');

function call(method, path, { token, body, headers = {}, query } = {}) {
  return handler({
    httpMethod: method,
    path,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    queryStringParameters: query,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const parse = (response) => JSON.parse(response.body || '{}');

async function login(name, password, ip = '10.0.0.1') {
  return call('POST', '/auth/login', {
    body: { login: name, password },
    headers: { 'x-forwarded-for': ip },
  });
}

async function tokenFor(name, password) {
  const res = await login(name, password);
  assert.equal(res.statusCode, 200, res.body);
  return parse(res).token;
}

const readsOf = (key, action = 'get') => calls.filter((c) => c.key === key && c.action === action).length;
const putsOf = (key) => readsOf(key, 'put');

/** Журнал вместе с архивными объектами. */
function allAudit() {
  const keys = [...objects.keys()].map((k) => k.split('::')[1]).filter((k) => k === 'activity-log.json' || k.startsWith('activity-log-archive-'));
  return keys.flatMap((k) => stored(k));
}

function stored(key) {
  const text = objects.get(idOf('test-partners', key));
  return text === undefined ? null : JSON.parse(text);
}

describe('нагрузка на 2000 пользователей', { concurrency: false }, () => {
  beforeEach(async () => {
    objects.clear();
    calls.length = 0;
    resetStoredDocumentsForTests();
    resetPlatformMemoryForTests();
    // Платформа создаётся первым входом администратора.
    const res = await login('admin', 'admin1234', '10.9.9.9');
    assert.equal(res.statusCode, 200, res.body);
    calls.length = 0;
  });

  test('холодный старт: сотня одновременных запросов читает документ один раз', async () => {
    const token = await tokenFor('partner1', 'demo1234');
    resetStoredDocumentsForTests();
    calls.length = 0;
    const responses = await Promise.all(Array.from({ length: 60 }, () => call('GET', '/auth/me', { token })));
    assert.ok(responses.every((r) => r.statusCode === 200), 'все ответы успешны');
    assert.equal(readsOf('platform-v2.json'), 1, 'одно чтение платформы вместо шестидесяти');
  });

  test('вход не переписывает platform-v2.json: журнал и счётчики в отдельных объектах', async () => {
    const before = objects.get(idOf('test-partners', 'platform-v2.json'));
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => login(i % 2 ? 'partner1' : 'partner2', 'demo1234', `10.1.0.${i}`)),
    );
    assert.ok(results.every((r) => r.statusCode === 200));
    assert.equal(putsOf('platform-v2.json'), 0, 'платформа не записывалась');
    assert.equal(objects.get(idOf('test-partners', 'platform-v2.json')), before, 'файл платформы не изменился');
    assert.ok(putsOf('activity-log.json') >= 1 && putsOf('activity-log.json') <= 3, 'записи журнала собраны в пачки');
    const logins = allAudit().filter((e) => e.action === 'login' && e.login !== 'admin');
    assert.equal(logins.length, 12, 'все входы попали в журнал (с архивом)');
  });

  test('неверные пароли: счётчик и блокировка живут в login-state.json', async () => {
    const before = objects.get(idOf('test-partners', 'platform-v2.json'));
    for (let i = 0; i < 10; i += 1) {
      const res = await login('partner1', 'wrong-password', `10.2.0.${i}`);
      assert.equal(res.statusCode, 401);
    }
    const locked = await login('partner1', 'demo1234', '10.2.1.1');
    assert.equal(locked.statusCode, 429, 'после десяти ошибок вход закрыт');
    assert.ok(Number(locked.headers['Retry-After']) > 0);
    assert.equal(putsOf('platform-v2.json'), 0, 'платформа не записывалась');
    assert.equal(objects.get(idOf('test-partners', 'platform-v2.json')), before);
    const state = stored('login-state.json');
    assert.equal(Object.keys(state.users).length, 1);
    assert.ok(Date.parse(Object.values(state.users)[0].lockedUntil) > Date.now());
    assert.equal(allAudit().filter((e) => e.action === 'login_locked').length, 1);
  });

  test('старая блокировка в записи пользователя продолжает действовать', async () => {
    const platform = stored('platform-v2.json');
    const user = platform.users.find((u) => u.login === 'partner2');
    user.lockedUntil = new Date(Date.now() + 600_000).toISOString();
    objects.set(idOf('test-partners', 'platform-v2.json'), JSON.stringify(platform));
    const res = await login('partner2', 'demo1234', '10.3.0.1');
    assert.equal(res.statusCode, 429);
  });

  test('смена пароля администратором снимает блокировку в login-state', async () => {
    for (let i = 0; i < 10; i += 1) await login('partner1', 'wrong-password', `10.4.0.${i}`);
    assert.equal((await login('partner1', 'demo1234', '10.4.1.1')).statusCode, 429);
    const admin = await tokenFor('admin', 'admin1234');
    const list = parse(await call('GET', '/admin/partners', { token: admin })).partners;
    const owner = list.find((p) => p.user.login === 'partner1');
    const reset = await call('POST', '/admin/partners/reset-password', {
      token: admin,
      body: { partnerUserId: owner.user.id, password: 'New-Password-2026' },
    });
    assert.ok([200, 204].includes(reset.statusCode), reset.body);
    assert.equal((await login('partner1', 'New-Password-2026', '10.4.2.1')).statusCode, 200);
  });

  test('последний вход в списке партнёров берётся из нового журнала', async () => {
    await login('partner1', 'demo1234', '10.5.0.1');
    const admin = await tokenFor('admin', 'admin1234');
    const list = parse(await call('GET', '/admin/partners', { token: admin })).partners;
    const row = list.find((p) => p.user.login === 'partner1');
    assert.ok(row.lastLogin, 'дата последнего входа есть');
  });

  test('список комнат: 304 по версии, постраничная выдача без потерь', async () => {
    const owner = await tokenFor('partner1', 'demo1234');
    for (let i = 0; i < 5; i += 1) {
      const created = await call('POST', '/objects', {
        token: owner,
        body: { clientName: `Клиент ${i}`, address: `ул. Тестовая, ${i}`, roomName: 'Кухня', room: { areaM2: 9 } },
      });
      assert.equal(created.statusCode, 200, created.body);
    }
    const full = await call('GET', '/objects', { token: owner });
    const all = parse(full).objects;
    assert.ok(all.length >= 5);
    const etag = full.headers.ETag;
    assert.match(etag, /^W\//);

    calls.length = 0;
    const same = await call('GET', '/objects', { token: owner, headers: { 'If-None-Match': etag } });
    assert.equal(same.statusCode, 304);
    assert.equal(same.body, '');
    assert.equal(readsOf('platform-v2.json'), 0, 'повторное чтение документа не потребовалось');

    const seen = [];
    let offset = 0;
    for (let guard = 0; guard < 50; guard += 1) {
      const res = await call('GET', '/objects', { token: owner, query: { limit: '2', offset: String(offset) } });
      const page = parse(res);
      assert.equal(page.total, all.length);
      seen.push(...page.objects.map((o) => o.id));
      if (page.nextOffset == null) break;
      offset = page.nextOffset;
    }
    assert.deepEqual(seen, all.map((o) => o.id), 'страницы складываются в полный список в том же порядке');

    await call('PATCH', `/objects/${all[0].id}`, { token: owner, body: { roomName: 'Гостиная' } });
    const changed = await call('GET', '/objects', { token: owner, headers: { 'If-None-Match': etag } });
    assert.equal(changed.statusCode, 200, 'после изменения версия новая');
    assert.notEqual(changed.headers.ETag, etag);
  });

  test('версия списка зависит от пользователя: чужой ETag не даёт 304', async () => {
    const a = await tokenFor('partner1', 'demo1234');
    const b = await tokenFor('partner2', 'demo1234');
    const first = await call('GET', '/objects', { token: a });
    const other = await call('GET', '/objects', { token: b, headers: { 'If-None-Match': first.headers.ETag } });
    assert.equal(other.statusCode, 200);
  });

  test('предел комнат не вытесняет старые молча: запись отклоняется', async () => {
    const platform = stored('platform-v2.json');
    const template = platform.objects[0];
    const owner = await tokenFor('partner1', 'demo1234');
    platform.objects = Array.from({ length: 1000 }, (_, i) => ({ ...template, id: `bulk_${i}`, orgId: 'org_other' }));
    objects.set(idOf('test-partners', 'platform-v2.json'), JSON.stringify(platform));
    const res = await call('POST', '/objects', {
      token: owner,
      body: { clientName: 'Лишний', address: 'ул. Предельная, 1', roomName: 'Кухня', room: { areaM2: 9 } },
    });
    assert.equal(res.statusCode, 409);
    assert.match(parse(res).message, /предел/i);
    assert.equal(stored('platform-v2.json').objects.length, 1000, 'ничего не вытеснено');
  });

  test('события аналитики: избыток уходит в месячный архив, а не пропадает', async () => {
    const send = (n) =>
      call('POST', '/analytics/events', {
        headers: { 'x-forwarded-for': `10.6.0.${n}` },
        body: { events: [{ id: `ev_${n}`, tool: 'calculator', action: 'calc_done', at: new Date(Date.now() + n).toISOString() }] },
      });
    for (let i = 1; i <= 9; i += 1) assert.equal((await send(i)).statusCode, 200);
    const hot = stored('analytics-events.json');
    assert.equal(hot.length, 4, 'основной документ ограничен');
    const archiveKey = [...objects.keys()].map((k) => k.split('::')[1]).find((k) => k.startsWith('analytics-events-archive-'));
    assert.ok(archiveKey, 'архивный объект создан');
    const archived = stored(archiveKey);
    const ids = new Set([...hot, ...archived].map((e) => e.id));
    assert.equal(ids.size, 9, 'все девять событий сохранены');
  });

  test('параллельные события собираются в малое число записей', async () => {
    calls.length = 0;
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        call('POST', '/analytics/events', {
          headers: { 'x-forwarded-for': `10.7.0.${i}` },
          body: { events: [{ id: `par_${i}`, tool: 'calculator', action: 'calc_done' }] },
        }),
      ),
    );
    assert.ok(putsOf('analytics-events.json') <= 4, `записей: ${putsOf('analytics-events.json')}`);
  });

  test('журнал действий: сверх предела старые записи уходят в архив', async () => {
    for (let i = 0; i < 4; i += 1) {
      await login('partner1', 'demo1234', `10.8.0.${i}`);
      await login('partner2', 'demo1234', `10.8.1.${i}`);
    }
    assert.ok(stored('activity-log.json').length <= 5);
    const archiveKey = [...objects.keys()].map((k) => k.split('::')[1]).find((k) => k.startsWith('activity-log-archive-'));
    assert.ok(archiveKey, 'архив журнала создан');
  });
});

describe('общий разобранный документ', { concurrency: false }, () => {
  const spec = {
    key: () => 'shared-doc.json',
    accept: (v) => Boolean(v?.items),
    fallback: () => ({ items: [] }),
    merge: (base, desired, fresh) => ({ items: [...new Set([...(fresh.items || []), ...(desired.items || [])])] }),
  };

  beforeEach(() => {
    objects.clear();
    calls.length = 0;
    resetStoredDocumentsForTests();
    process.env.DOC_FRESH_MS = '0';
  });

  test('общий экземпляр один на версию, а изменяемая копия своя', async () => {
    objects.set(idOf('test-partners', 'shared-doc.json'), JSON.stringify({ items: ['a'] }));
    const one = await loadSharedDocument(spec);
    const two = await loadSharedDocument(spec);
    assert.equal(one.value, two.value, 'тот же объект');
    const mine = await loadStoredDocument(spec);
    assert.notEqual(mine, one.value);
    mine.items.push('b');
    assert.deepEqual(one.value.items, ['a'], 'общий экземпляр не изменился');
  });

  test('окно свежести: повторная проверка версии не ходит в хранилище', async () => {
    objects.set(idOf('test-partners', 'shared-doc.json'), JSON.stringify({ items: ['a'] }));
    process.env.DOC_FRESH_MS = '5000';
    await loadSharedDocument(spec);
    calls.length = 0;
    for (let i = 0; i < 20; i += 1) await loadSharedDocument(spec);
    assert.equal(calls.length, 0);
    process.env.DOC_FRESH_MS = '0';
  });

  test('собственная запись видна сразу, без повторного чтения', async () => {
    objects.set(idOf('test-partners', 'shared-doc.json'), JSON.stringify({ items: ['a'] }));
    const doc = await loadStoredDocument(spec);
    doc.items.push('b');
    await saveStoredDocument(spec, doc, doc);
    calls.length = 0;
    const view = await loadSharedDocument(spec);
    assert.deepEqual(view.value.items, ['a', 'b']);
    assert.equal(readsOf('shared-doc.json'), 0, 'тело не перечитывалось');
    assert.equal(view.own, true);
  });

  test('одновременные записи одного документа не теряются', async () => {
    objects.set(idOf('test-partners', 'shared-doc.json'), JSON.stringify({ items: [] }));
    await Promise.all(
      Array.from({ length: 12 }, async (_, i) => {
        const doc = await loadStoredDocument(spec);
        doc.items.push(`item_${i}`);
        await saveStoredDocument(spec, doc, doc);
      }),
    );
    assert.equal(stored('shared-doc.json').items.length, 12);
  });

  test('запись из другого процесса сливается, а не затирается', async () => {
    objects.set(idOf('test-partners', 'shared-doc.json'), JSON.stringify({ items: ['a'] }));
    const doc = await loadStoredDocument(spec);
    objects.set(idOf('test-partners', 'shared-doc.json'), JSON.stringify({ items: ['a', 'foreign'] }));
    doc.items.push('mine');
    await saveStoredDocument(spec, doc, doc);
    assert.deepEqual(stored('shared-doc.json').items.sort(), ['a', 'foreign', 'mine']);
  });
});

describe('мелкие чистые функции', () => {
  test('mergeLoginState: свои изменения побеждают, чужие записи сохраняются', () => {
    const base = { version: 1, users: { a: { n: 1 } } };
    const desired = { version: 1, users: { a: { n: 1 }, b: { n: 2 } } };
    const fresh = { version: 1, users: { a: { n: 1 }, c: { n: 3 } } };
    assert.deepEqual(mergeLoginState(base, desired, fresh).users, { a: { n: 1 }, b: { n: 2 }, c: { n: 3 } });
    const cleared = { version: 1, users: {} };
    assert.deepEqual(mergeLoginState(base, cleared, fresh).users, { c: { n: 3 } });
  });

  test('mergeEventList: предел передаётся параметром', () => {
    const list = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}` }));
    assert.equal(mergeEventList([], list, [], 4).length, 4);
    assert.equal(mergeEventList([], list, []).length, 10);
  });

  test('день события считается в поясе пользователя, по умолчанию в московском', () => {
    const at = '2026-10-30T22:30:00.000Z';
    assert.equal(dayKey(at), '2026-10-31', 'Москва: уже следующий день');
    assert.equal(dayKey(at, 'UTC'), '2026-10-30');
    assert.equal(dayKey(at, 'Asia/Vladivostok'), '2026-10-31');
    assert.equal(dayKey(at, 'America/New_York'), '2026-10-30');
    assert.equal(dayKey('мусор'), '');
  });

  test('неверное имя пояса заменяется на московский', () => {
    assert.equal(resolveAnalyticsTz('Nowhere/Land'), 'Europe/Moscow');
    assert.equal(resolveAnalyticsTz('Asia/Yekaterinburg'), 'Asia/Yekaterinburg');
  });

  test('ряд по дням в сводке строится в заданном поясе', () => {
    const events = [{ id: 'x1', tool: 'calculator', action: 'calc_done', at: '2026-10-30T22:30:00.000Z', orgId: 'o' }];
    const opts = { source: 'api', from: '2026-10-29T21:00:00.000Z', to: '2026-10-31T20:59:00.000Z', orgId: null };
    const moscow = aggregateAnalyticsDashboard(events, { ...opts, tz: 'Europe/Moscow' });
    const utc = aggregateAnalyticsDashboard(events, { ...opts, tz: 'UTC' });
    assert.equal(moscow.series.find((row) => row.day === '2026-10-31')?.calculator, 1);
    assert.equal(utc.series.find((row) => row.day === '2026-10-30')?.calculator, 1);
    assert.deepEqual(moscow.series.map((row) => row.day), ['2026-10-30', '2026-10-31']);
  });
});
