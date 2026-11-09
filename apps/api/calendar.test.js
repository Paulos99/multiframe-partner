import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, describe } from 'node:test';
import {
  buildReminders,
  cleanVisitInput,
  conflictIds,
  findConflicts,
  materializeVisit,
  moscowDayStartMs,
  quoteSentAtOf,
} from '../../packages/shared/calendar.js';

const dir = mkdtempSync(path.join(tmpdir(), 'mf-calendar-'));
const platformFile = path.join(dir, 'platform.json');
process.env.PLATFORM_FILE = platformFile;
delete process.env.PARTNERS_BUCKET;
delete process.env.MATERIALS_BUCKET;
process.env.JWT_SECRET = 'calendar-local-test';

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
const read = (r) => JSON.parse(r.body || '{}');
async function login(name, password) {
  const r = await call('POST', '/auth/login', { body: { login: name, password } });
  assert.equal(r.statusCode, 200, r.body);
  return read(r).token;
}
const stored = () => JSON.parse(readFileSync(platformFile, 'utf8'));

const H = 60 * 60 * 1000;
const NOW = Date.parse('2026-11-09T09:00:00Z'); // 12:00 по Москве

describe('общие правила календаря', () => {
  test('проверка полей выезда', () => {
    assert.match(cleanVisitInput({}).error, /замер или монтаж/);
    assert.match(cleanVisitInput({ kind: 'measure' }).error, /проект/);
    assert.match(cleanVisitInput({ kind: 'measure', projectId: 'p', startsAt: 'вчера' }).error, /дату/);
    assert.match(cleanVisitInput({ kind: 'measure', projectId: 'p', startsAt: '2026-11-10T07:00:00Z', durationMin: 5, userId: 'u' }).error, /15 минут/);
    assert.match(cleanVisitInput({ kind: 'install', projectId: 'p', startsAt: '2026-11-10T07:00:00Z' }).error, /монтажника/);
    const ok = cleanVisitInput({ kind: 'install', projectId: 'p', startsAt: '2026-11-10T10:00:00+03:00', userId: 'u' });
    assert.equal(ok.value.startsAt, '2026-11-10T07:00:00.000Z');
    assert.equal(ok.value.durationMin, 240);
  });

  test('пересечения только у одного человека и только по времени', () => {
    const a = { id: 'a', userId: 'm', startsAt: '2026-11-10T07:00:00Z', durationMin: 60 };
    const b = { id: 'b', userId: 'm', startsAt: '2026-11-10T07:30:00Z', durationMin: 60 };
    const c = { id: 'c', userId: 'm', startsAt: '2026-11-10T08:00:00Z', durationMin: 60 };
    const d = { id: 'd', userId: 'x', startsAt: '2026-11-10T07:00:00Z', durationMin: 60 };
    assert.deepEqual(findConflicts([a, b, c, d], a).map((v) => v.id), ['b']);
    assert.deepEqual([...conflictIds([a, b, c, d])].sort(), ['a', 'b', 'c']);
    assert.deepEqual(findConflicts([a, { ...b, doneAt: 'x' }], a), []);
  });

  test('время отправки КП: поле или история', () => {
    assert.equal(quoteSentAtOf({ quoteSentAt: '2026-11-01T00:00:00Z' }), '2026-11-01T00:00:00Z');
    assert.equal(quoteSentAtOf({ history: [{ action: 'status', detail: 'measured→quote_sent', at: '2026-11-02T00:00:00Z' }] }), '2026-11-02T00:00:00Z');
    assert.equal(quoteSentAtOf({ history: [] }), null);
  });

  test('демо-выезд встаёт на сегодняшнюю дату по Москве', () => {
    const v = materializeVisit({ demo: true, demoDay: 1, demoMinute: 600, startsAt: 'x' }, NOW);
    assert.equal(v.startsAt, '2026-11-10T07:00:00.000Z');
    assert.equal(new Date(moscowDayStartMs(NOW)).toISOString(), '2026-11-08T21:00:00.000Z');
  });

  test('напоминания: скоро, завтра, КП без ответа, замер без результата, срок', () => {
    const user = { id: 'u_owner', role: 'owner' };
    const visits = [
      { id: 'soon', kind: 'measure', projectId: 'p1', userId: 'u_owner', startsAt: new Date(NOW + H).toISOString(), durationMin: 60 },
      { id: 'tom', kind: 'install', projectId: 'p2', userId: 'u_owner', startsAt: '2026-11-10T07:00:00Z', durationMin: 240 },
      { id: 'past', kind: 'measure', projectId: 'p3', userId: 'u_m', startsAt: new Date(NOW - 5 * H).toISOString(), durationMin: 60 },
    ];
    const rooms = [
      { id: 'r1', projectId: 'p1', status: 'draft' },
      { id: 'r3', projectId: 'p3', status: 'draft', documents: [] },
      { id: 'r4', projectId: 'p4', status: 'quote_sent', quoteSentAt: new Date(NOW - 4 * 24 * H).toISOString() },
      { id: 'r5', projectId: 'p5', status: 'quote_sent', quoteSentAt: new Date(NOW - 1 * 24 * H).toISOString() },
    ];
    const projects = [
      { id: 'p1', name: 'Один' },
      { id: 'p2', name: 'Два' },
      { id: 'p3', name: 'Три' },
      { id: 'p4', name: 'Четыре' },
      { id: 'p5', name: 'Пять' },
      { id: 'p6', name: 'Шесть', dueAt: '2026-11-01' },
    ];
    const list = buildReminders({ visits, rooms, projects, user, now: NOW });
    const types = list.map((r) => r.type).sort();
    assert.deepEqual(types, ['measure_no_result', 'quote_stale', 'stage_overdue', 'visit_soon', 'visit_tomorrow']);
    assert.match(list.find((r) => r.type === 'quote_stale').title, /4 дня/);
    // Готово и отложено скрывают напоминание; срок «отложить» прошёл — снова видно.
    const soonKey = list.find((r) => r.type === 'visit_soon').key;
    const tomKey = list.find((r) => r.type === 'visit_tomorrow').key;
    const acks = [
      { userId: 'u_owner', key: soonKey, doneAt: 'x' },
      { userId: 'u_owner', key: tomKey, snoozeUntil: new Date(NOW + H).toISOString() },
    ];
    assert.equal(buildReminders({ visits, rooms, projects, user, now: NOW, acks }).length, 3);
    assert.equal(buildReminders({ visits, rooms, projects, user, now: NOW + 2 * H, acks }).some((r) => r.key === tomKey), true);
    // Замерщик не видит КП и сроки проектов.
    const measurer = buildReminders({ visits, rooms, projects, user: { id: 'u_m', role: 'measurer' }, now: NOW });
    assert.deepEqual(measurer.map((r) => r.type), ['measure_no_result']);
  });
});

describe('маршруты /calendar', { concurrency: false }, () => {
  const t = {};
  let projectId;
  let roomId;
  let visitId;

  test('демо-выезды на стенде и права на чтение', async () => {
    t.owner = await login('partner1', 'demo1234');
    t.sales = await login('sales1', 'exec1234');
    t.measurer = await login('exec1', 'exec1234');
    t.crew = await login('crew1', 'exec1234');
    t.other = await login('partner2', 'demo1234');
    t.admin = await login('admin', 'admin1234');
    t.stp = await login('stpmgr1', 'exec1234');

    const owner = read(await call('GET', '/calendar', { token: t.owner }));
    assert.ok(owner.visits.length > 3, 'демо-выезды есть');
    assert.ok(owner.visits.every((v) => v.orgId === 'org_demo'));
    assert.ok(owner.visits.some((v) => v.kind === 'install') && owner.visits.some((v) => v.kind === 'measure'));
    assert.ok(conflictIds(owner.visits).size >= 2, 'на стенде видно пересечение');
    assert.equal(owner.canPlan, true);
    assert.ok(owner.people.some((p) => p.role === 'measurer'));
    assert.ok(owner.visits[0].userName && owner.visits[0].projectName);

    const measurer = read(await call('GET', '/calendar', { token: t.measurer }));
    assert.ok(measurer.visits.length > 0);
    assert.ok(measurer.visits.every((v) => v.userId === 'u_measurer1'));
    assert.equal(measurer.canPlan, false);
    assert.deepEqual(measurer.people, []);

    const crew = read(await call('GET', '/calendar', { token: t.crew }));
    assert.ok(crew.visits.every((v) => v.userId === 'u_crew1' && v.kind === 'install'));

    const admin = read(await call('GET', '/calendar', { token: t.admin }));
    assert.ok(admin.visits.some((v) => v.orgId === 'org_demo') && admin.visits.some((v) => v.orgId === 'org_demo_spb'));

    assert.equal((await call('GET', '/calendar', { token: t.stp })).statusCode, 403);
    assert.equal((await call('GET', '/calendar')).statusCode, 401);

    const platform = stored();
    const room = platform.objects.find((o) => o.orgId === 'org_demo' && o.projectId && o.status === 'draft');
    projectId = room.projectId;
    roomId = room.id;
  });

  test('создание: владелец и менеджер; проверка компании и роли исполнителя; пересечения', async () => {
    const body = { kind: 'measure', projectId, objectId: roomId, startsAt: '2030-03-04T10:00:00+03:00', durationMin: 60, userId: 'u_measurer1', note: 'Домофон 12' };
    assert.equal((await call('POST', '/calendar', { token: t.measurer, body })).statusCode, 403);
    assert.equal((await call('POST', '/calendar', { token: t.crew, body })).statusCode, 403);
    assert.equal((await call('POST', '/calendar', { token: t.other, body })).statusCode, 400);
    assert.equal((await call('POST', '/calendar', { token: t.owner, body: { ...body, userId: 'u_crew1' } })).statusCode, 400);
    assert.equal((await call('POST', '/calendar', { token: t.owner, body: { ...body, userId: 'u_measurer2' } })).statusCode, 400);

    const first = await call('POST', '/calendar', { token: t.owner, body });
    assert.equal(first.statusCode, 200, first.body);
    visitId = read(first).visit.id;
    assert.deepEqual(read(first).conflicts, []);
    const second = await call('POST', '/calendar', { token: t.sales, body: { ...body, objectId: null, startsAt: '2030-03-04T10:30:00+03:00' } });
    assert.equal(second.statusCode, 200, second.body);
    assert.deepEqual(read(second).conflicts.map((v) => v.id), [visitId]);
    const project = stored().projects.find((p) => p.id === projectId);
    assert.ok(project.measurerUserId, 'у проекта появился замерщик');
  });

  test('правка: замерщик только «выполнено» у своего; чужая компания не видит', async () => {
    assert.equal((await call('PATCH', `/calendar/${visitId}`, { token: t.measurer, body: { startsAt: '2030-03-05T10:00:00Z' } })).statusCode, 403);
    const done = await call('PATCH', `/calendar/${visitId}`, { token: t.measurer, body: { done: true } });
    assert.equal(done.statusCode, 200, done.body);
    assert.ok(read(done).visit.doneAt);
    assert.equal((await call('PATCH', `/calendar/${visitId}`, { token: t.crew, body: { done: true } })).statusCode, 404);
    assert.equal((await call('PATCH', `/calendar/${visitId}`, { token: t.other, body: { durationMin: 90 } })).statusCode, 404);
    const moved = await call('PATCH', `/calendar/${visitId}`, { token: t.owner, body: { startsAt: '2030-03-05T12:00:00+03:00', durationMin: 90 } });
    assert.equal(moved.statusCode, 200, moved.body);
    assert.equal(read(moved).visit.startsAt, '2030-03-05T09:00:00.000Z');
    assert.equal(read(moved).visit.durationMin, 90);
    assert.equal((await call('DELETE', `/calendar/${visitId}`, { token: t.measurer })).statusCode, 403);
    assert.equal((await call('DELETE', `/calendar/${visitId}`, { token: t.owner })).statusCode, 200);
    assert.ok(!stored().visits.some((v) => v.id === visitId));
  });

  test('демо-выезд после правки получает настоящую дату', async () => {
    const demo = read(await call('GET', '/calendar', { token: t.owner })).visits.find((v) => v.demo);
    const r = await call('PATCH', `/calendar/${demo.id}`, { token: t.owner, body: { startsAt: '2030-01-01T08:00:00Z' } });
    assert.equal(r.statusCode, 200, r.body);
    const row = stored().visits.find((v) => v.id === demo.id);
    assert.equal(row.demo, undefined);
    assert.equal(row.startsAt, '2030-01-01T08:00:00.000Z');
  });

  test('отметки напоминаний: свои, «отложить» до 30 дней', async () => {
    assert.equal((await call('POST', '/calendar/reminders', { token: t.sales, body: { key: 'k1', action: 'snooze', until: '2000-01-01T00:00:00Z' } })).statusCode, 400);
    assert.equal((await call('POST', '/calendar/reminders', { token: t.sales, body: { key: 'k1', action: 'bad' } })).statusCode, 400);
    const until = new Date(Date.now() + 3 * H).toISOString();
    assert.equal((await call('POST', '/calendar/reminders', { token: t.sales, body: { key: 'k1', action: 'snooze', until } })).statusCode, 200);
    assert.equal((await call('POST', '/calendar/reminders', { token: t.measurer, body: { key: 'k2', action: 'done' } })).statusCode, 200);
    const sales = read(await call('GET', '/calendar', { token: t.sales }));
    assert.deepEqual(sales.acks.map((a) => a.key), ['k1']);
    assert.equal((await call('POST', '/calendar/reminders', { token: t.sales, body: { key: 'k1', action: 'reset' } })).statusCode, 200);
    assert.deepEqual(read(await call('GET', '/calendar', { token: t.sales })).acks, []);
  });

  test('КП: время отправки ставит сервер при переходе на «КП отправлено»', async () => {
    const room = stored().objects.find((o) => o.orgId === 'org_demo' && o.status === 'measured');
    const before = Date.now();
    const r = await call('PATCH', `/objects/${room.id}`, { token: t.owner, body: { status: 'quote_sent', updatedAt: new Date().toISOString() } });
    assert.equal(r.statusCode, 200, r.body);
    const sent = Date.parse(read(r).object.quoteSentAt);
    assert.ok(sent >= before - 1000);
    const again = await call('PATCH', `/objects/${room.id}`, { token: t.owner, body: { clientName: 'Новое имя', updatedAt: new Date().toISOString() } });
    assert.equal(read(again).object.quoteSentAt, read(r).object.quoteSentAt, 'дальше время не меняется');
  });
});
