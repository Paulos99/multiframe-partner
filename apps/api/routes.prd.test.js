/**
 * HTTP-дымовые тесты новых маршрутов волны 1.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-wave1';
process.env.ANALYTICS_ADMIN_KEY = process.env.ANALYTICS_ADMIN_KEY || 'test-admin-key';

const { handler, resetPlatformMemoryForTests } = await import('./index.js');

function decode(res) {
  const body = typeof res.body === 'string' ? JSON.parse(res.body || '{}') : res.body;
  return { status: res.statusCode, body };
}

async function invoke(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await handler({
    httpMethod: method,
    path,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return decode(res);
}

async function login(loginName, password) {
  const res = await invoke('POST', '/auth/login', {
    body: { login: loginName, password },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

test('deals: создание в своей org, чужой проект отвергается', async () => {
  resetPlatformMemoryForTests();
  const token = await login('partner1', 'demo1234');
  const bad = await invoke('POST', '/deals', {
    token,
    body: { projectId: 'prj_nonexistent' },
  });
  assert.equal(bad.status, 400);

  const project = await invoke('POST', '/projects', {
    token,
    body: { name: 'Тест сделка', clientName: 'Клиент', address: 'ул. 1' },
  });
  assert.equal(project.status, 200, JSON.stringify(project.body));
  const projectId = project.body.project.id;

  const created = await invoke('POST', '/deals', {
    token,
    body: { projectId, stage: 'contact' },
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.deal.projectId, projectId);

  const token2 = await login('partner2', 'demo1234');
  const leak = await invoke('GET', `/deals/${created.body.deal.id}`, { token: token2 });
  assert.equal(leak.status, 404);
});

test('quotes: copy не меняет lifecycle; confirm-sent меняет', async () => {
  resetPlatformMemoryForTests();
  const ownerToken = await login('partner1', 'demo1234');
  const project = await invoke('POST', '/projects', {
    token: ownerToken,
    body: { name: 'Тест КП', address: 'ул. 2' },
  });
  assert.equal(project.status, 200, JSON.stringify(project.body));
  const projectId = project.body.project.id;

  const token = await login('sales1', 'exec1234');
  const deal = await invoke('POST', '/deals', {
    token,
    body: { projectId, stage: 'contact' },
  });
  assert.equal(deal.status, 200, JSON.stringify(deal.body));
  const created = await invoke('POST', '/quotes', {
    token,
    body: { projectId, dealId: deal.body.deal.id, roomObjectIds: [], amount: 10000 },
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const id = created.body.quote.id;
  assert.equal(created.body.quote.lifecycle, 'quote_created');

  const copied = await invoke('POST', `/quotes/${id}/copy`, { token, body: {} });
  assert.equal(copied.status, 200);
  assert.equal(copied.body.lifecycleUnchanged, true);
  assert.equal(copied.body.quote.lifecycle, 'quote_created');

  const confirmed = await invoke('POST', `/quotes/${id}/confirm-sent`, {
    token,
    body: { comment: 'отправил в WhatsApp' },
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.quote.lifecycle, 'quote_sent_confirmed');
  assert.ok(confirmed.body.quote.sentConfirmed);
  const dealAfter = await invoke('GET', `/deals/${deal.body.deal.id}`, { token });
  assert.equal(dealAfter.status, 200);
  assert.equal(dealAfter.body.deal.stage, 'quote_sent_confirmed');
  assert.equal(dealAfter.body.deal.outcome, null);
});

test('academy: попытка всегда training и не ломает KPI-фильтр', async () => {
  resetPlatformMemoryForTests();
  const token = await login('sales1', 'exec1234');
  const scenarios = await invoke('GET', '/academy/scenarios', { token });
  assert.equal(scenarios.status, 200);
  assert.ok(scenarios.body.scenarios.some((s) => s.id === 'sell_multiframe'));

  const started = await invoke('POST', '/academy/attempts', {
    token,
    body: { scenarioId: 'sell_multiframe', status: 'started' },
  });
  assert.equal(started.status, 200);
  assert.equal(started.body.attempt.context, 'training');

  const done = await invoke('POST', `/academy/attempts/${started.body.attempt.id}/complete`, {
    token,
    body: { score: 90, hasFalsePromise: true },
  });
  assert.equal(done.status, 200);
  assert.equal(done.body.attempt.score, 65);
  assert.equal(done.body.attempt.context, 'training');
});

test('support: отказ при ПД клиента в теле', async () => {
  resetPlatformMemoryForTests();
  const token = await login('sales1', 'exec1234');
  const bad = await invoke('POST', '/support/cases', {
    token,
    body: { category: 'sales', clientPhone: '+7999' },
  });
  assert.equal(bad.status, 400);

  const ok = await invoke('POST', '/support/cases', {
    token,
    body: { category: 'sales', module: 'calculator' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.case.category, 'sales');
});
