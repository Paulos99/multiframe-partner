import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-foundation';
process.env.ANALYTICS_ADMIN_KEY = process.env.ANALYTICS_ADMIN_KEY || 'test-admin-key';
delete process.env.YDB_ENDPOINT;
delete process.env.YDB_DATABASE;
delete process.env.PARTNERS_BUCKET;

const { handler, resetPlatformMemoryForTests } = await import('./index.js');
const {
  clearCommercialRepositoryForTests,
  getCommercialRepository,
  resetCommercialRepositoryForTests,
} = await import('./commercial/repository.js');

function decode(res) {
  const body = typeof res.body === 'string' ? JSON.parse(res.body || '{}') : res.body;
  return { status: res.statusCode, body, headers: res.headers || {} };
}

async function invoke(method, path, { token, body, headers, query } = {}) {
  const res = await handler({
    httpMethod: method,
    path,
    queryStringParameters: query,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return decode(res);
}

function matchOf(res, key) {
  const version = res.body?.[key]?.recordVersion;
  assert.ok(version != null, JSON.stringify(res.body));
  return { 'If-Match': String(version) };
}

async function login(name, password) {
  const res = await invoke('POST', '/auth/login', { body: { login: name, password } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

describe('commercial http', { concurrency: 1 }, () => {
test.beforeEach(() => {
  delete process.env.YDB_ENDPOINT;
  delete process.env.YDB_DATABASE;
  delete process.env.PARTNERS_BUCKET;
  resetPlatformMemoryForTests();
});

test('черновик не создаёт сделку, повтор inquiry возвращает те же id', async () => {
  const token = await login('sales1', 'exec1234');
  const draft = await invoke('POST', '/drafts', { token, body: { draftId: 'draft-1', label: 'быстрая' } });
  assert.equal(draft.status, 200);
  assert.equal(draft.body.createdDeal, false);
  const empty = await invoke('GET', '/deals', { token });
  assert.equal(empty.body.deals.length, 0);

  const first = await invoke('POST', '/inquiries', {
    token,
    headers: { 'Idempotency-Key': 'draft-1' },
    body: { draftId: 'draft-1', name: 'Иванов', roomName: 'Кухня' },
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.deal.stage, 'contact');
  assert.equal(first.body.deal.active, true);
  const again = await invoke('POST', '/inquiries', {
    token,
    headers: { 'Idempotency-Key': 'draft-1' },
    body: { draftId: 'draft-1', name: 'Другой', roomName: 'Зал' },
  });
  assert.equal(again.body.replayed, true);
  assert.equal(again.body.deal.id, first.body.deal.id);
  assert.equal(again.body.project.id, first.body.project.id);
  assert.equal(again.body.room.id, first.body.room.id);
  const deals = await invoke('GET', '/deals', { token });
  assert.equal(deals.body.deals.length, 1);
});

test('учебный контекст не создаёт сделку, чужая компания не видит', async () => {
  const token = await login('sales1', 'exec1234');
  const training = await invoke('POST', '/inquiries', {
    token,
    headers: { 'Idempotency-Key': 't1', 'X-Data-Context': 'training' },
    body: { name: 'Учёба', roomName: 'Класс' },
  });
  assert.equal(training.status, 400);
  const created = await invoke('POST', '/inquiries', {
    token,
    headers: { 'Idempotency-Key': 'w1' },
    body: { name: 'Боевой', roomName: 'Спальня' },
  });
  assert.equal(created.status, 200);
  const other = await login('partner2', 'demo1234');
  const leak = await invoke('GET', `/deals/${created.body.deal.id}`, { token: other });
  assert.equal(leak.status, 404);
});

test('без If-Match изменение существующей сделки отвечает 428', async () => {
  const token = await login('sales1', 'exec1234');
  const created = await invoke('POST', '/inquiries', {
    token,
    headers: { 'Idempotency-Key': 'match-1' },
    body: { name: 'Версия', roomName: 'Коридор' },
  });
  const id = created.body.deal.id;
  const missing = await invoke('POST', `/deals/${id}/pause`, {
    token,
    body: { reason: 'postponed_repair' },
  });
  assert.equal(missing.status, 428, JSON.stringify(missing.body));
  const paused = await invoke('POST', `/deals/${id}/pause`, {
    token,
    headers: { 'If-Match': String(created.body.deal.recordVersion) },
    body: { reason: 'postponed_repair' },
  });
  assert.equal(paused.status, 200, JSON.stringify(paused.body));
  assert.equal(paused.body.deal.outcome, 'early_paused');
});

test('пауза, отказ, одна активная сделка и новый id после закрытия', async () => {
  const token = await login('sales1', 'exec1234');
  const created = await invoke('POST', '/inquiries', {
    token,
    headers: { 'Idempotency-Key': 'p1' },
    body: { name: 'Пауза', roomName: 'Кабинет' },
  });
  const id = created.body.deal.id;
  const projectId = created.body.project.id;
  const paused = await invoke('POST', `/deals/${id}/pause`, {
    token,
    headers: matchOf(created, 'deal'),
    body: { reason: 'postponed_repair' },
  });
  assert.equal(paused.status, 200, JSON.stringify(paused.body));
  assert.equal(paused.body.deal.outcome, 'early_paused');
  assert.equal(paused.body.deal.closedAt, null);
  assert.equal(paused.body.deal.active, true);
  assert.equal(paused.body.deal.id, id);
  const second = await invoke('POST', '/deals', { token, body: { projectId } });
  assert.equal(second.status, 409);
  const resumed = await invoke('POST', `/deals/${id}/resume`, {
    token,
    headers: matchOf(paused, 'deal'),
    body: {},
  });
  assert.equal(resumed.body.deal.id, id);
  assert.equal(resumed.body.deal.outcome, null);
  const refused = await invoke('POST', `/deals/${id}/decline`, {
    token,
    headers: matchOf(resumed, 'deal'),
    body: { reason: 'no_need' },
  });
  assert.equal(refused.body.deal.outcome, 'early_declined');
  assert.ok(refused.body.deal.closedAt);
  const reopen = await invoke('POST', `/deals/${id}/resume`, {
    token,
    headers: matchOf(refused, 'deal'),
    body: {},
  });
  assert.equal(reopen.status, 409);
  const next = await invoke('POST', '/deals', { token, body: { projectId } });
  assert.equal(next.status, 200);
  assert.notEqual(next.body.deal.id, id);
});

test('КП: снимок, заморозка, N+1, частичное согласие и сумма только ordered', async () => {
  const token = await login('sales1', 'exec1234');
  const created = await invoke('POST', '/inquiries', {
    token,
    headers: { 'Idempotency-Key': 'q1' },
    body: { name: 'КП', roomName: 'Гостиная' },
  });
  const roomId = created.body.room.id;
  const dealId = created.body.deal.id;
  const projectId = created.body.project.id;
  const extra = await invoke('POST', '/inquiries', {
    token,
    headers: { 'Idempotency-Key': 'q1b' },
    body: { name: 'не то', roomName: 'Лишняя' },
  });
  assert.notEqual(extra.body.project.id, projectId);

  const prelim = await invoke('POST', `/rooms/${roomId}/calculations`, {
    token,
    body: { type: 'preliminary', amount: 100, expectedRevision: 0 },
  });
  assert.equal(prelim.status, 200, JSON.stringify(prelim.body));
  const detailed = await invoke('POST', `/rooms/${roomId}/calculations`, {
    token,
    body: { type: 'detailed', amount: 250, expectedRevision: 0 },
  });
  assert.equal(detailed.status, 200);
  const conflict = await invoke('POST', `/rooms/${roomId}/calculations`, {
    token,
    body: { type: 'detailed', amount: 999, expectedRevision: 0 },
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.current.amount, 250);
  assert.equal(conflict.body.saved.divergent, true);
  assert.equal(conflict.body.contribution.amount, 250);

  const quote = await invoke('POST', '/quotes', {
    token,
    body: { projectId, dealId, roomObjectIds: [roomId] },
  });
  assert.equal(quote.status, 200, JSON.stringify(quote.body));
  assert.equal(quote.body.quote.amount, 250);
  assert.equal(quote.body.quote.snapshot.lines.length, 1);
  assert.equal(quote.body.quote.snapshot.lines[0].calcType, 'detailed');
  const quoteId = quote.body.quote.id;

  const copied = await invoke('POST', `/quotes/${quoteId}/copy`, { token, headers: matchOf(quote, 'quote'), body: {} });
  const pdf = await invoke('POST', `/quotes/${quoteId}/pdf`, { token, headers: matchOf(quote, 'quote'), body: {} });
  const shared = await invoke('POST', `/quotes/${quoteId}/share`, { token, headers: matchOf(quote, 'quote'), body: {} });
  assert.equal(copied.body.quote.sentConfirmedAt, null);
  assert.equal(pdf.body.quote.lifecycle, 'quote_created');
  assert.equal(shared.body.quote.lifecycle, 'quote_shared');
  assert.equal(shared.body.quote.sentConfirmedAt, null);

  const sent = await invoke('POST', `/quotes/${quoteId}/confirm-sent`, {
    token,
    headers: matchOf(shared, 'quote'),
    body: { comment: 'лично' },
  });
  assert.equal(sent.body.quote.lifecycle, 'quote_sent_confirmed');
  const sentAgain = await invoke('POST', `/quotes/${quoteId}/confirm-sent`, {
    token,
    headers: matchOf(sent, 'quote'),
    body: {},
  });
  assert.equal(sentAgain.body.quote.sentConfirmedAt, sent.body.quote.sentConfirmedAt);
  const barePatch = await invoke('PATCH', `/quotes/${quoteId}`, { token, body: { amount: 1 } });
  assert.equal(barePatch.status, 428);
  const patched = await invoke('PATCH', `/quotes/${quoteId}`, {
    token,
    headers: matchOf(sent, 'quote'),
    body: { amount: 1 },
  });
  assert.equal(patched.status, 409);

  const room2 = created.body.room.id;
  const next = await invoke('POST', '/quotes', {
    token,
    body: { projectId, dealId, roomObjectIds: [room2] },
  });
  assert.equal(next.status, 200, JSON.stringify(next.body));
  assert.equal(next.body.quote.version, 2);
  assert.equal(next.body.quote.dealId, dealId);
  assert.notEqual(next.body.quote.id, quoteId);
  const old = await invoke('GET', '/quotes', { token });
  const frozen = old.body.quotes.find((item) => item.id === quoteId);
  assert.equal(frozen.amount, 250);
  const own = await invoke('GET', '/quotes', { token, query: { dealId } });
  assert.equal(own.body.quotes.length, 2);
  const other = await invoke('GET', '/quotes', { token, query: { dealId: extra.body.deal.id } });
  assert.equal(other.body.quotes.length, 0);

  await invoke('POST', `/quotes/${next.body.quote.id}/confirm-sent`, {
    token,
    headers: matchOf(next, 'quote'),
    body: {},
  });
  const beforeAccept = await invoke('GET', `/deals/${dealId}`, { token });
  const accepted = await invoke('POST', `/deals/${dealId}/accept`, {
    token,
    headers: matchOf(beforeAccept, 'deal'),
    body: { roomAssent: { [roomId]: 'ordered' } },
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.deal.outcome, 'accepted');
  assert.equal(accepted.body.deal.acceptedAmount, 250);
  assert.equal(accepted.body.deal.closedAt, null);
  const measurer = await login('exec1', 'exec1234');
  const denied = await invoke('POST', `/quotes/${next.body.quote.id}/confirm-sent`, { token: measurer, body: {} });
  assert.equal(denied.status, 403);
});

test('монтаж и закрытие: чек-лист, препятствие, сделка отдельно', async () => {
  const sales = await login('sales1', 'exec1234');
  const created = await invoke('POST', '/inquiries', {
    sales,
    token: sales,
    headers: { 'Idempotency-Key': 'i1' },
    body: { name: 'Монтаж', roomName: 'Детская' },
  });
  const roomId = created.body.room.id;
  const dealId = created.body.deal.id;
  const projectId = created.body.project.id;
  await invoke('POST', `/rooms/${roomId}/calculations`, {
    token: sales,
    body: { type: 'detailed', amount: 80, expectedRevision: 0, panels: 12, dowels: 24, areaM2: 9.5, hasScheme: true },
  });
  let roomVersion = '1';
  const profile = await invoke('POST', `/rooms/${roomId}/profile`, {
    token: sales,
    headers: { 'If-Match': roomVersion },
    body: { usable: true },
  });
  assert.equal(profile.status, 200, JSON.stringify(profile.body));
  roomVersion = String(profile.body.room.recordVersion);
  const stage = await invoke('GET', `/deals/${dealId}`, { token: sales });
  assert.equal(stage.body.deal.stage, 'calculated');
  const quote = await invoke('POST', '/quotes', {
    token: sales,
    body: { projectId, dealId, roomObjectIds: [roomId] },
  });
  await invoke('POST', `/quotes/${quote.body.quote.id}/confirm-sent`, {
    token: sales,
    headers: matchOf(quote, 'quote'),
    body: {},
  });
  const beforeAccept = await invoke('GET', `/deals/${dealId}`, { token: sales });
  await invoke('POST', `/deals/${dealId}/accept`, {
    token: sales,
    headers: matchOf(beforeAccept, 'deal'),
    body: { roomAssent: { [roomId]: 'ordered' } },
  });
  const crew = await login('crew1', 'exec1234');
  const hidden = await invoke('GET', '/deals', { token: crew });
  assert.equal(hidden.body.deals.length, 0);
  const hiddenOne = await invoke('GET', `/deals/${dealId}`, { token: crew });
  assert.equal(hiddenOne.status, 404);
  const earlyInbox = await invoke('GET', '/install/inbox', { token: crew });
  assert.equal(earlyInbox.body.rooms.length, 0);
  const ready = await invoke('POST', `/rooms/${roomId}/readiness`, {
    token: sales,
    headers: { 'If-Match': roomVersion },
    body: { materialsComplete: true, crewUserId: 'u_crew1' },
  });
  assert.equal(ready.status, 200, JSON.stringify(ready.body));
  roomVersion = String(ready.body.room.recordVersion);
  const inbox = await invoke('GET', '/install/inbox', { token: crew });
  assert.equal(inbox.body.rooms.length, 1);
  assert.ok(inbox.body.rooms[0].recordVersion >= 1);
  assert.ok(Array.isArray(inbox.body.rooms[0].checklist));
  assert.ok(Array.isArray(inbox.body.rooms[0].blockers));
  assert.equal(Object.hasOwn(inbox.body.rooms[0], 'amount'), false);
  assert.equal(JSON.stringify(inbox.body.rooms[0]).includes('acceptedAmount'), false);
  assert.equal(inbox.body.rooms[0].composition.panels, 12);
  assert.equal(inbox.body.rooms[0].composition.hasScheme, true);
  assert.equal(Object.hasOwn(inbox.body.rooms[0].composition, 'amount'), false);
  assert.equal(JSON.stringify(inbox.body.rooms[0].composition).includes('Cost'), false);
  const crewDeals = await invoke('GET', '/deals', { token: crew });
  assert.equal(crewDeals.body.deals.length, 1);
  assert.equal(crewDeals.body.deals[0].rooms[0].id, roomId);
  for (const field of ['outcome', 'lossReason', 'lossComment', 'stageAtOutcome', 'acceptedAmount', 'roomAssent']) {
    assert.equal(Object.hasOwn(crewDeals.body.deals[0], field), false, field);
  }
  const noHeader = await invoke('POST', `/rooms/${roomId}/close`, { token: crew, body: {} });
  assert.equal(noHeader.status, 428);
  const noList = await invoke('POST', `/rooms/${roomId}/close`, {
    token: crew,
    headers: { 'If-Match': roomVersion },
    body: {},
  });
  assert.equal(noList.status, 409);
  const checklist = await invoke('POST', `/rooms/${roomId}/checklist`, {
    token: crew,
    headers: { 'If-Match': roomVersion },
    body: { items: [{ id: 'c1', title: 'Крепёж', state: 'done' }] },
  });
  roomVersion = String(checklist.body.room.recordVersion);
  const firstBlock = await invoke('POST', `/rooms/${roomId}/blockers`, {
    token: crew,
    headers: { 'If-Match': roomVersion },
    body: { text: 'нет доступа' },
  });
  roomVersion = String(firstBlock.body.room.recordVersion);
  const blocked = await invoke('POST', `/rooms/${roomId}/close`, {
    token: crew,
    headers: { 'If-Match': roomVersion },
    body: {},
  });
  assert.equal(blocked.status, 409);
  const room = await invoke('POST', `/rooms/${roomId}/blockers`, {
    token: crew,
    headers: { 'If-Match': roomVersion },
    body: { text: 'щит' },
  });
  roomVersion = String(room.body.room.recordVersion);
  const opened = room.body.blocker.id;
  const waive = await invoke('POST', `/rooms/${roomId}/waive`, { token: sales, body: { reason: 'нет' } });
  assert.equal(waive.status, 404);
  const resolved = await invoke('POST', `/rooms/${roomId}/blockers/${opened}/resolve`, {
    token: sales,
    headers: { 'If-Match': roomVersion },
    body: {},
  });
  roomVersion = String(resolved.body.room.recordVersion);
  const firstBlocker = room.body.room.blockers.find((item) => item.text === 'нет доступа');
  const resolvedFirst = await invoke('POST', `/rooms/${roomId}/blockers/${firstBlocker.id}/resolve`, {
    token: sales,
    headers: { 'If-Match': roomVersion },
    body: {},
  });
  roomVersion = String(resolvedFirst.body.room.recordVersion);
  const closed = await invoke('POST', `/rooms/${roomId}/close`, {
    token: crew,
    headers: { 'If-Match': roomVersion },
    body: {},
  });
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.equal(closed.body.dealClosed, false);
  const still = await invoke('GET', `/deals/${dealId}`, { token: sales });
  assert.equal(still.body.deal.outcome, 'accepted');
  assert.equal(still.body.deal.closedAt, null);
  const owner = await login('partner1', 'demo1234');
  const ownerView = await invoke('GET', `/deals/${dealId}`, { token: owner });
  const done = await invoke('POST', `/deals/${dealId}/close`, {
    token: owner,
    headers: matchOf(ownerView, 'deal'),
    body: {},
  });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.ok(done.body.deal.closedAt);
  assert.equal(done.body.deal.outcome, 'accepted');
  const crewMoney = await invoke('GET', `/deals/${dealId}`, { token: crew });
  assert.equal(crewMoney.status, 200, JSON.stringify(crewMoney.body));
  assert.equal(Object.hasOwn(crewMoney.body.deal, 'acceptedAmount'), false);
  assert.equal(Object.hasOwn(crewMoney.body.deal, 'outcome'), false);
  assert.equal(Object.hasOwn(crewMoney.body.deal, 'lossReason'), false);
});

test('замерщик видит оба расчёта и один вклад комнаты', async () => {
  const salesLogin = await invoke('POST', '/auth/login', { body: { login: 'sales1', password: 'exec1234' } });
  const sales = salesLogin.body.token;
  const measurerLogin = await invoke('POST', '/auth/login', { body: { login: 'exec1', password: 'exec1234' } });
  const measurer = measurerLogin.body.token;
  const measurerId = measurerLogin.body.user.id;
  const created = await invoke('POST', '/inquiries', {
    token: sales,
    headers: { 'Idempotency-Key': 'meas-1', 'X-Data-Context': 'work' },
    body: { name: 'Сорокина', roomName: 'Спальня', address: 'Москва, тихий двор' },
  });
  const roomId = created.body.room.id;
  const dealId = created.body.deal.id;
  const assigned = await invoke('PATCH', `/deals/${dealId}`, {
    token: sales,
    headers: matchOf(created, 'deal'),
    body: { assignments: { measurerUserId: measurerId } },
  });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
  await invoke('POST', `/rooms/${roomId}/calculations`, {
    token: measurer,
    headers: { 'Idempotency-Key': 'meas-prelim', 'X-Data-Context': 'work' },
    body: { type: 'preliminary', amount: 100, expectedRevision: 0 },
  });
  await invoke('POST', `/rooms/${roomId}/calculations`, {
    token: measurer,
    headers: { 'Idempotency-Key': 'meas-detailed', 'X-Data-Context': 'work' },
    body: { type: 'detailed', amount: 250, expectedRevision: 0 },
  });
  const work = await invoke('GET', '/deals', { token: measurer });
  assert.equal(work.status, 200, JSON.stringify(work.body));
  assert.equal(work.body.deals.length, 1);
  const room = work.body.deals[0].rooms[0];
  assert.equal(room.roomName, 'Спальня');
  assert.equal(room.preliminary.amount, 100);
  assert.equal(room.detailed.amount, 250);
  assert.equal(room.contribution.calcType, 'detailed');
  assert.equal(room.contribution.amount, 250);
  assert.equal(room.contribution.amount === room.preliminary.amount + room.detailed.amount, false);
  assert.equal(Object.hasOwn(work.body.deals[0], 'acceptedAmount'), false);
  const stranger = await invoke('GET', '/deals', { token: measurer });
  assert.equal(stranger.body.deals.length, 1);
  const crew = await login('crew1', 'exec1234');
  const denied = await invoke('GET', '/install/inbox', { token: measurer });
  assert.equal(denied.status, 403);
  assert.equal((await invoke('GET', '/install/inbox', { token: crew })).body.rooms.length, 0);

  const own = await invoke('GET', `/deals/${dealId}`, { token: measurer });
  assert.equal(own.status, 200, JSON.stringify(own.body));
  for (const field of ['outcome', 'lossReason', 'lossComment', 'stageAtOutcome', 'roomAssent', 'acceptedAmount']) {
    assert.equal(Object.hasOwn(own.body.deal, field), false, field);
  }
  assert.equal(own.body.deal.rooms.length, 1);
  assert.equal(own.body.deal.rooms[0].id, roomId);

  const foreign = await invoke('POST', '/inquiries', {
    token: sales,
    headers: { 'Idempotency-Key': 'meas-foreign', 'X-Data-Context': 'work' },
    body: { name: 'Чужой адрес', roomName: 'Кухня' },
  });
  const foreignDeal = foreign.body.deal.id;
  const foreignRoom = foreign.body.room.id;
  const hiddenDeal = await invoke('GET', `/deals/${foreignDeal}`, { token: measurer });
  assert.equal(hiddenDeal.status, 404);
  assert.equal(JSON.stringify(hiddenDeal.body).includes('Кухня'), false);

  const writes = [
    [`/rooms/${foreignRoom}/calculations`, { type: 'detailed', amount: 10, expectedRevision: 0 }, {}],
    [`/rooms/${foreignRoom}/profile`, { usable: true }, { 'If-Match': '1' }],
    [`/rooms/${foreignRoom}/readiness`, { materialsComplete: true }, { 'If-Match': '1' }],
    [`/rooms/${foreignRoom}/checklist`, { items: [{ id: 'c', title: 'Крепёж', state: 'done' }] }, { 'If-Match': '1' }],
    [`/rooms/${foreignRoom}/blockers`, { text: 'нет доступа' }, { 'If-Match': '1' }],
    [`/rooms/${foreignRoom}/blockers/missing/resolve`, {}, { 'If-Match': '1' }],
  ];
  for (const [path, body, headers] of writes) {
    const response = await invoke('POST', path, { token: measurer, body, headers });
    assert.equal(response.status, 404, `${path} ${JSON.stringify(response.body)}`);
  }
  const closeForeign = await invoke('POST', `/rooms/${foreignRoom}/close`, {
    token: measurer,
    headers: { 'If-Match': '1' },
    body: {},
  });
  assert.equal(closeForeign.status, 403);

  const crewLogin = await invoke('POST', '/auth/login', { body: { login: 'crew1', password: 'exec1234' } });
  const org = crewLogin.body.user.org;
  for (const field of ['pricePerM2', 'panelPriceRub', 'installPricePerM2', 'dowelPriceRub']) {
    assert.equal(Object.hasOwn(org, field), false, field);
  }
  assert.equal(typeof org.companyName, 'string');
  const objects = await invoke('GET', '/objects', { token: crewLogin.body.token });
  assert.equal(objects.status, 200);
  const listed = JSON.stringify(objects.body);
  for (const field of ['totalCost', 'panelsCost', 'installCost', 'dowelsCost', 'pricePerM2', 'panelPriceRub', 'installPricePerM2']) {
    assert.equal(listed.includes(`"${field}"`), false, field);
  }
});

test('облачный бакет без YDB не подменяет коммерческое хранилище файлом', async () => {
  clearCommercialRepositoryForTests();
  process.env.PARTNERS_BUCKET = 'unit-bucket';
  delete process.env.YDB_ENDPOINT;
  delete process.env.YDB_DATABASE;
  await assert.rejects(
    () => getCommercialRepository(),
    (error) => {
      assert.equal(error.status, 503);
      assert.equal(String(error.message).includes('grpcs://'), false);
      assert.equal(String(error.message).includes('unit-bucket'), false);
      return true;
    },
  );
  delete process.env.PARTNERS_BUCKET;
  resetCommercialRepositoryForTests();
});
});
