import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, describe } from 'node:test';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-phone-'));
const platformFile = path.join(dir, 'platform.json');
process.env.PLATFORM_FILE = platformFile;
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'phone-refusal-local-test';

const { handler } = await import('./index.js');

after(() => rmSync(dir, { recursive: true, force: true }));

function call(method, urlPath, { token, body } = {}) {
  return handler({
    httpMethod: method,
    path: urlPath,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const readJson = (response) => JSON.parse(response.body || '{}');
async function login(name, password) {
  const response = await call('POST', '/auth/login', { body: { login: name, password } });
  assert.equal(response.statusCode, 200, response.body);
  return readJson(response).token;
}
const stored = () => JSON.parse(readFileSync(platformFile, 'utf8'));

const PHONE = '+7 900 123-45-67';

describe('телефон клиента и отказ', { concurrency: false }, () => {
  const tokens = {};
  const ids = {};
  let roomId;
  let projectId;

  test('вход и готовая комната', async () => {
    tokens.owner = await login('partner1', 'demo1234');
    tokens.sales = await login('sales1', 'exec1234');
    tokens.measurer = await login('exec1', 'exec1234');
    tokens.crew = await login('crew1', 'exec1234');
    tokens.other = await login('partner2', 'demo1234');
    tokens.admin = await login('admin', 'admin1234');
    const users = stored().users;
    ids.measurer = users.find((u) => u.login === 'exec1').id;
    ids.crew = users.find((u) => u.login === 'crew1').id;

    const denied = await call('POST', '/objects', {
      token: tokens.owner,
      body: { clientName: 'Телефонов', clientPhone: PHONE, address: 'ул. Тестовая, 1', roomName: 'Кухня', room: { areaM2: 9 } },
    });
    assert.equal(denied.statusCode, 400, 'на консультации телефон не принимается');
    assert.match(readJson(denied).message, /этапа «Замер»/);
    assert.equal(stored().objects.some((o) => o.clientName === 'Телефонов'), false, 'отказанная комната не создана');
    assert.equal(stored().projects.some((p) => p.clientName === 'Телефонов'), false, 'и проект тоже');

    const created = await call('POST', '/objects', {
      token: tokens.owner,
      body: { clientName: 'Телефонов', address: 'ул. Тестовая, 1', roomName: 'Кухня', room: { areaM2: 9 }, assignedTo: ids.measurer },
    });
    assert.equal(created.statusCode, 200, created.body);
    roomId = readJson(created).object.id;
    projectId = readJson(created).object.projectId;
    assert.equal(readJson(created).object.clientPhone, '');
    assert.equal(stored().projects.find((p) => p.id === projectId).clientPhone, '', 'новый проект без телефона');
  });

  test('комната: телефон с этапа «Замер», формат проверяется', async () => {
    const patch = (body, token = tokens.owner) => call('PATCH', `/objects/${roomId}`, { token, body });
    assert.equal((await patch({ clientPhone: PHONE })).statusCode, 400, 'черновик');
    assert.equal((await patch({ status: 'measured', clientPhone: '12345' })).statusCode, 400, 'слишком короткий');
    assert.equal((await patch({ status: 'measured', clientPhone: 'позвонить завтра' })).statusCode, 400, 'буквы');
    assert.equal((await patch({ status: 'measured', clientPhone: '+7 (900) 12' })).statusCode, 400);
    const ok = await patch({ status: 'measured', clientPhone: '8 (900) 123-45-67' });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(readJson(ok).object.clientPhone, PHONE, 'приводится к единому виду');
    assert.equal((await patch({ clientPhone: '' })).statusCode, 200, 'очистка допустима');
    assert.equal(readJson(await patch({ clientPhone: '+49 30 1234567' })).object.clientPhone, '+49301234567');
    assert.equal(readJson(await patch({ clientPhone: PHONE })).object.clientPhone, PHONE);
  });

  test('кто видит телефон в комнате', async () => {
    const phoneOf = async (token) =>
      readJson(await call('GET', '/objects', { token })).objects.find((o) => o.id === roomId)?.clientPhone;
    assert.equal(await phoneOf(tokens.owner), PHONE);
    assert.equal(await phoneOf(tokens.sales), PHONE);
    assert.equal(await phoneOf(tokens.measurer), PHONE, 'замерщик своей комнаты');
    assert.equal(await phoneOf(tokens.admin), '', 'админ сети не видит телефон в «Кейсах»');
    assert.equal(
      readJson(await call('GET', '/objects', { token: tokens.other })).objects.some((o) => o.id === roomId),
      false,
    );
    const toInstall = await call('PATCH', `/objects/${roomId}`, {
      token: tokens.owner,
      body: { status: 'install', assignedTo: ids.crew },
    });
    assert.equal(toInstall.statusCode, 200, toInstall.body);
    assert.equal(await phoneOf(tokens.crew), PHONE, 'монтажник своего задания');
    assert.equal(await phoneOf(tokens.measurer), undefined, 'комната ушла от замерщика');
    const back = await call('PATCH', `/objects/${roomId}`, { token: tokens.owner, body: { status: 'draft' } });
    assert.equal(readJson(back).object.clientPhone, '', 'на консультации телефон не показывается');
  });

  test('проект: телефон с этапа «Замер», видимость по ролям', async () => {
    const make = await call('POST', '/projects', {
      token: tokens.owner,
      body: { name: 'Без телефона', clientName: 'Иванов', clientPhone: PHONE },
    });
    assert.equal(make.statusCode, 400, 'при создании проекта телефона нет');
    const patch = (body, token = tokens.owner) => call('PATCH', `/projects/${projectId}`, { token, body });
    assert.equal((await patch({ clientPhone: PHONE })).statusCode, 400, 'стадия «Новый»');
    assert.equal((await patch({ status: 'new', clientPhone: PHONE })).statusCode, 400);
    assert.equal((await patch({ status: 'measure', clientPhone: 'abc' })).statusCode, 400);
    assert.equal((await patch({ status: 'measure', clientPhone: PHONE }, tokens.measurer)).statusCode, 403, 'замерщик не правит');
    const ok = await patch({ status: 'measure', clientPhone: '9001234567' }, tokens.sales);
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(readJson(ok).project.clientPhone, PHONE);
    const phoneOf = async (token) =>
      readJson(await call('GET', '/projects', { token })).projects.find((p) => p.id === projectId)?.clientPhone;
    assert.equal(await phoneOf(tokens.owner), PHONE);
    assert.equal(await phoneOf(tokens.sales), PHONE);
    assert.equal(await phoneOf(tokens.admin), '', 'админ');
    for (const stage of ['proposal', 'install']) {
      assert.equal((await patch({ status: stage })).statusCode, 200);
      assert.equal(await phoneOf(tokens.owner), PHONE, stage);
    }
    await patch({ status: 'new' });
    assert.equal(await phoneOf(tokens.owner), '', 'на стадии «Новый» не отдаётся');
    await patch({ status: 'done' });
    assert.equal(await phoneOf(tokens.owner), '', 'после завершения не отдаётся');
    await patch({ status: 'measure' });
    assert.equal(await phoneOf(tokens.owner), PHONE, 'вернулся на замер — снова виден');
  });

  test('телефон не попадает в аналитику', async () => {
    for (const token of [tokens.owner, tokens.admin]) {
      const response = await call('GET', '/analytics/dashboard', { token });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.body.includes('123-45-67'), false);
      assert.equal(response.body.includes('+7 900'), false);
    }
  });

  test('отказ: причина обязательна, статус «Завершён» без отказа', async () => {
    const patch = (body) => call('PATCH', `/objects/${roomId}`, { token: tokens.owner, body });
    assert.equal((await patch({ status: 'closed', refusal: {} })).statusCode, 400);
    assert.equal((await patch({ status: 'closed', refusal: { reasonKey: 'выдумано' } })).statusCode, 400);
    const noText = await patch({ status: 'closed', refusal: { reasonKey: 'other' } });
    assert.equal(noText.statusCode, 400);
    assert.match(readJson(noText).message, /своими словами/);

    const done = await patch({ status: 'closed', refusal: null });
    assert.equal(readJson(done).object.status, 'closed');
    assert.equal(readJson(done).object.refusal, undefined, 'без записи об отказе — «Завершён»');

    const refused = await patch({ status: 'closed', refusal: { reasonKey: 'price_too_high', comment: ' Нашли в два раза дешевле ' } });
    assert.equal(refused.statusCode, 200, refused.body);
    const body = readJson(refused).object;
    assert.equal(body.refusal.reasonKey, 'price_too_high');
    assert.equal(body.refusal.comment, 'Нашли в два раза дешевле');
    assert.ok(body.refusal.at && body.refusal.by);
    assert.equal(body.history[0].action, 'refusal');

    const keep = await patch({ clientSummary: 'правка' });
    assert.equal(readJson(keep).object.refusal.reasonKey, 'price_too_high', 'обычная правка не стирает отказ');

    const reopened = await patch({ status: 'install' });
    assert.equal(readJson(reopened).object.refusal, undefined, 'возврат в работу снимает отказ');
  });

  test('отказ проекта', async () => {
    const patch = (body) => call('PATCH', `/projects/${projectId}`, { token: tokens.owner, body });
    assert.equal((await patch({ status: 'done', refusal: { reasonKey: 'zzz' } })).statusCode, 400);
    const ok = await patch({ status: 'done', refusal: { reasonKey: 'other', comment: 'Передумали делать ремонт' } });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(readJson(ok).project.refusal.reasonKey, 'other');
    const plain = await patch({ status: 'measure' });
    assert.equal(readJson(plain).project.refusal, undefined);
    const finished = await patch({ status: 'done', refusal: null });
    assert.equal(readJson(finished).project.refusal, undefined, '«Завершён» без отказа');
  });
});
