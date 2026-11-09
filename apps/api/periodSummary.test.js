import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SUMMARY_LIMITS,
  buildPartnerComparison,
  buildPeriodSummary,
  changePct,
  formatRub,
  periodMetrics,
  plural,
  previousRange,
} from '../../packages/shared/periodSummary.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-09T12:00:00.000Z');
const iso = (daysAgo, hour = 10) => new Date(NOW - daysAgo * DAY + (hour - 12) * 60 * 60 * 1000).toISOString();
// Текущий период — последние 7 дней, прошлый — 7 дней перед ним.
const FROM = new Date(NOW - 7 * DAY).toISOString();
const TO = new Date(NOW).toISOString();

function room(id, { day, status = 'draft', by = 'u_a', refusal = null, total = 100000, area = 20, orgId = 'org_a', stepDays = 1, touched = null } = {}) {
  const history = [{ at: iso(day), action: 'create', detail: 'draft' }];
  const chain = ['draft', 'measured', 'quote_sent', 'install', 'closed'];
  const target = chain.indexOf(status);
  let t = day;
  for (let i = 1; i <= target; i += 1) {
    t = Math.max(0, t - stepDays);
    history.push({ at: iso(t, 11 + i), action: 'status', detail: `${chain[i - 1]}→${chain[i]}` });
  }
  const last = history[history.length - 1].at;
  return {
    id,
    orgId,
    createdAt: iso(day),
    updatedAt: touched ?? last,
    createdBy: by,
    status,
    refusal: refusal ? { reasonKey: refusal, comment: '', at: last } : null,
    estimate: { panels: 10, dowels: 20, totalCost: total },
    room: { areaM2: area },
    history: history.reverse(),
  };
}

function ev(id, daysAgo, tool, action, userId = 'u_a', extra = {}) {
  return { id, at: iso(daysAgo), orgId: 'org_a', userId, login: userId, role: 'sales', tool, action, sessionId: id, ...extra };
}

const users = [
  { id: 'u_a', login: 'a', displayName: 'Анна', role: 'sales' },
  { id: 'u_b', login: 'b', displayName: 'Борис', role: 'sales' },
  { id: 'u_m', login: 'm', displayName: 'Мария', role: 'measurer' },
];

test('helpers: склонение, рубли, изменение, прошлый период', () => {
  assert.equal(plural(1, ['комната', 'комнаты', 'комнат']), 'комната');
  assert.equal(plural(3, ['комната', 'комнаты', 'комнат']), 'комнаты');
  assert.equal(plural(11, ['комната', 'комнаты', 'комнат']), 'комнат');
  assert.equal(plural(21, ['комната', 'комнаты', 'комнат']), 'комната');
  assert.equal(formatRub(1234567.4), '1 234 567 ₽');
  assert.equal(changePct(120, 100), 20);
  assert.equal(changePct(5, 0), null);
  const prev = previousRange('2026-11-02T00:00:00.000Z', '2026-11-08T23:59:59.999Z');
  assert.equal(prev.to, '2026-11-01T23:59:59.999Z');
  assert.equal(prev.from, '2026-10-26T00:00:00.000Z');
  assert.equal(previousRange(null, null), null);
});

test('мало данных: одна комната и пара событий — один вывод «мало данных»', () => {
  const s = buildPeriodSummary({
    rooms: [room('r1', { day: 2 })],
    events: [ev('e1', 1, 'problemomer', 'result')],
    users,
    from: FROM,
    to: TO,
    now: NOW,
  });
  assert.equal(s.enoughData, false);
  assert.equal(s.conclusions.length, 1);
  assert.equal(s.conclusions[0].id, 'not_enough');
  assert.match(s.conclusions[0].text, /Мало данных/);
  assert.ok(s.conclusions[0].action);
});

test('конверсия в КП растёт к прошлому периоду — хороший вывод с п. п.', () => {
  const rooms = [];
  // Текущий: 6 комнат, 4 дошли до КП и дальше.
  ['quote_sent', 'quote_sent', 'install', 'install', 'draft', 'measured'].forEach((status, i) =>
    rooms.push(room(`c${i}`, { day: 6 - (i % 3), status, stepDays: 1 })),
  );
  // Прошлый: 5 комнат, 1 дошла до КП (статус меняется уже в прошлом периоде).
  ['quote_sent', 'draft', 'draft', 'measured', 'measured'].forEach((status, i) =>
    rooms.push(room(`p${i}`, { day: 12, status, stepDays: 1, touched: iso(1) })),
  );
  const s = buildPeriodSummary({ rooms, events: [], users, from: FROM, to: TO, now: NOW });
  const conv = s.conclusions.find((c) => c.id === 'conversion');
  assert.ok(conv, 'есть вывод о конверсии');
  assert.equal(conv.tone, 'good');
  assert.match(conv.text, /До КП дошли 4 из 6 комнат/);
  assert.match(conv.text, /на 47 п\. п\. лучше прошлого периода \(20%\)/);
});

test('конверсия не сравнивается, если в прошлом периоде мало комнат', () => {
  const rooms = ['quote_sent', 'draft', 'draft', 'draft', 'draft'].map((status, i) => room(`c${i}`, { day: 3, status }));
  rooms.push(room('old', { day: 10, status: 'quote_sent', touched: iso(1) }));
  const s = buildPeriodSummary({ rooms, events: [], users, from: FROM, to: TO, now: NOW });
  const conv = s.conclusions.find((c) => c.id === 'conversion');
  assert.equal(conv.tone, 'neutral');
  assert.doesNotMatch(conv.text, /прошлого/);
});

test('деньги, площадь, срок сделки и самый долгий статус', () => {
  const rooms = [
    room('w1', { day: 6, status: 'closed', total: 200000, area: 30, stepDays: 1 }),
    room('w2', { day: 6, status: 'closed', total: 100000, area: 10.5, stepDays: 1 }),
    room('q1', { day: 2, status: 'quote_sent', total: 50000 }),
  ];
  const s = buildPeriodSummary({ rooms, events: [], users, from: FROM, to: TO, now: NOW });
  const sales = s.conclusions.find((c) => c.id === 'sales');
  assert.match(sales.text, /Завершено комнат: 2 на 300 000 ₽, 40,5 м²/);
  assert.match(sales.text, /в работе \(КП и монтаж\) ещё 50 000 ₽/);
  const cycle = s.conclusions.find((c) => c.id === 'cycle');
  assert.match(cycle.text, /в среднем 4,\d+ дня|в среднем 4 дня/);
  assert.match(cycle.text, /дольше всего комнаты стоят в статусе/);
});

test('отказы: доля и главная причина с советом по этой причине', () => {
  const rooms = [
    room('x1', { day: 5, status: 'closed', refusal: 'price_too_high' }),
    room('x2', { day: 5, status: 'closed', refusal: 'price_too_high' }),
    room('x3', { day: 5, status: 'closed', refusal: 'lose_space' }),
    room('x4', { day: 5, status: 'closed' }),
  ];
  const s = buildPeriodSummary({ rooms, events: [], users, from: FROM, to: TO, now: NOW });
  const r = s.conclusions.find((c) => c.id === 'refusals');
  assert.equal(r.tone, 'bad');
  assert.match(r.text, /Отказом закрыто 3 из 4 закрытых комнат \(75%\)/);
  assert.match(r.text, /главная причина — «Дорого» \(2 из 3\)/);
  assert.match(r.action, /тренажёре продаж/);
});

test('отказы на маленькой выборке не называются', () => {
  const rooms = [room('x1', { day: 5, status: 'closed', refusal: 'price_too_high' }), room('x2', { day: 5, status: 'closed' })];
  const m = periodMetrics({ rooms, from: FROM, to: TO, now: NOW });
  assert.equal(m.closed, 2);
  const s = buildPeriodSummary({ rooms, events: [], users, from: FROM, to: TO, now: NOW });
  assert.equal(s.conclusions.some((c) => c.id === 'refusals'), false);
});

test('сотрудники одной роли: лучший и отстающий по доле комнат до КП', () => {
  const rooms = [];
  for (let i = 0; i < 5; i += 1) rooms.push(room(`a${i}`, { day: 4, status: i < 4 ? 'quote_sent' : 'draft', by: 'u_a' }));
  for (let i = 0; i < 5; i += 1) rooms.push(room(`b${i}`, { day: 4, status: i < 1 ? 'quote_sent' : 'draft', by: 'u_b' }));
  const s = buildPeriodSummary({ rooms, events: [], users, from: FROM, to: TO, now: NOW });
  const p = s.conclusions.find((c) => c.id === 'people');
  assert.ok(p);
  assert.match(p.text, /Анна: 80% \(4 из 5\)/);
  assert.match(p.text, /Борис: 20% \(1 из 5\)/);
});

test('сотрудники разных ролей между собой не сравниваются', () => {
  const events = [];
  for (let i = 0; i < 6; i += 1) {
    events.push(ev(`pa${i}`, 2, 'problemomer', 'result', 'u_a'));
    events.push(ev(`ca${i}`, 2, 'calculator', 'calc_done', 'u_a'));
    events.push(ev(`pm${i}`, 2, 'problemomer', 'result', 'u_m', { role: 'measurer' }));
  }
  const s = buildPeriodSummary({ rooms: [], events, users, from: FROM, to: TO, now: NOW });
  assert.equal(s.conclusions.some((c) => c.id === 'people'), false);
});

test('зависшие проекты: открытые комнаты без движения дольше недели', () => {
  const rooms = [
    room('s1', { day: 20, status: 'quote_sent', stepDays: 2 }),
    { ...room('s2', { day: 20, status: 'measured', stepDays: 1 }), projectId: 'p1' },
    { ...room('s3', { day: 20, status: 'measured', stepDays: 1 }), projectId: 'p1' },
    room('fresh', { day: 2, status: 'measured' }),
    room('done', { day: 30, status: 'closed' }),
  ];
  const m = periodMetrics({ rooms, from: FROM, to: TO, now: NOW });
  assert.equal(m.staleRooms, 3);
  assert.equal(m.staleProjects, 2);
  const s = buildPeriodSummary({ rooms, events: [], users, from: FROM, to: TO, now: NOW });
  const st = s.conclusions.find((c) => c.id === 'stale');
  assert.match(st.text, /^2 проекта \(3 комнаты\) без движения больше 7 дней/);
  assert.equal(st.tone, 'bad');
});

test('активность в инструментах падает — плохой вывод; выводы отсортированы: сначала проблемы', () => {
  const events = [];
  for (let i = 0; i < 12; i += 1) events.push(ev(`old${i}`, 10, 'problemomer', 'result'));
  for (let i = 0; i < 10; i += 1) events.push(ev(`cur${i}`, 3, 'problemomer', 'result'));
  for (let i = 0; i < 3; i += 1) events.push(ev(`calc${i}`, 3, 'calculator', 'calc_done'));
  const s = buildPeriodSummary({ rooms: [room('w1', { day: 6, status: 'closed' })], events, users, from: FROM, to: TO, now: NOW });
  const a = s.conclusions.find((c) => c.id === 'activity');
  assert.equal(a.tone, 'bad');
  assert.match(a.text, /Проблемомер пройден 10 раз, расчётов в калькуляторе — 3/);
  assert.match(a.text, /на 17% меньше/);
  const tones = s.conclusions.map((c) => c.tone);
  const order = { bad: 0, neutral: 1, good: 2, info: 3 };
  assert.deepEqual(tones, [...tones].sort((x, y) => order[x] - order[y]));
  assert.ok(s.conclusions.length <= SUMMARY_LIMITS.maxConclusions);
  for (const c of s.conclusions) assert.ok(c.action && c.text, 'у каждого вывода есть текст и «что сделать»');
});

test('самая большая потеря в воронке называет этап и совет', () => {
  const rooms = [];
  for (let i = 0; i < 10; i += 1) rooms.push(room(`r${i}`, { day: 3, status: 'draft' }));
  const events = [];
  for (let i = 0; i < 3; i += 1) events.push(ev(`pm${i}`, 2, 'problemomer', 'panel_view'));
  const s = buildPeriodSummary({ rooms, events, users, from: FROM, to: TO, now: NOW });
  const d = s.conclusions.find((c) => c.id === 'biggest_drop');
  assert.ok(d);
  assert.match(d.text, /перед этапом «Проблемомер»: доходит 30%/);
  assert.match(d.action, /Проблемомер/);
});

test('всё время: без сравнения с прошлым периодом', () => {
  const s = buildPeriodSummary({ rooms: [room('r', { day: 3 })], events: [], users, from: null, to: null, now: NOW });
  assert.equal(s.previous, null);
  assert.equal(s.previousRange, null);
});

test('сравнение партнёров: лидер, отстающий, неактивный, аномальные отказы, стрелки', () => {
  const rooms = [];
  // А: 6 комнат, 5 до КП, 2 завершены на 400 000.
  for (let i = 0; i < 4; i += 1) rooms.push(room(`a${i}`, { day: 3, status: 'quote_sent', orgId: 'org_a' }));
  rooms.push(room('a4', { day: 6, status: 'closed', total: 200000, orgId: 'org_a' }));
  rooms.push(room('a5', { day: 6, status: 'closed', total: 200000, orgId: 'org_a' }));
  rooms.push(room('a6', { day: 6, status: 'closed', total: 200000, orgId: 'org_a' }));
  // Б: 5 комнат, 1 до КП, 3 отказа.
  for (let i = 0; i < 4; i += 1) rooms.push(room(`b${i}`, { day: 3, status: 'draft', orgId: 'org_b' }));
  for (let i = 0; i < 3; i += 1) rooms.push(room(`bx${i}`, { day: 6, status: 'closed', refusal: 'price_too_high', orgId: 'org_b' }));
  // В: давно ничего.
  rooms.push(room('c0', { day: 40, status: 'draft', orgId: 'org_c' }));
  const orgs = [
    { id: 'org_a', name: 'Потолки А' },
    { id: 'org_b', name: 'Потолки Б' },
    { id: 'org_c', name: 'Потолки В' },
  ];
  const { rows, conclusions } = buildPartnerComparison({ orgs, rooms, events: [], from: FROM, to: TO, now: NOW });
  assert.deepEqual(rows.map((r) => r.name), ['Потолки А', 'Потолки Б', 'Потолки В']);
  assert.equal(rows[0].salesSum, 600000);
  assert.equal(rows[0].trendSales, 'up');
  assert.equal(rows[2].inactiveDays >= 14, true);
  const ids = conclusions.map((c) => c.id);
  assert.ok(ids.includes('partners_leader'));
  assert.match(conclusions.find((c) => c.id === 'partners_leader').text, /«Потолки А»: 600 000 ₽/);
  assert.match(conclusions.find((c) => c.id === 'partners_lagging').text, /Отстаёт «Потолки Б»/);
  assert.match(conclusions.find((c) => c.id === 'partners_inactive').text, /«Потолки В»/);
  assert.match(conclusions.find((c) => c.id === 'partners_refusals').text, /«Потолки Б» — 100%/);
});

test('сравнение партнёров: один партнёр — «сравнивать не с кем»', () => {
  const rooms = [room('a', { day: 2, orgId: 'org_a' })];
  const { conclusions } = buildPartnerComparison({ orgs: [{ id: 'org_a', name: 'А' }], rooms, from: FROM, to: TO, now: NOW });
  assert.equal(conclusions[0].id, 'partners_few');
});
