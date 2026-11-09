import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_ATTEMPTS,
  QUEUE_PHOTO_LIMIT,
  afterFailure,
  devicePlace,
  dueItems,
  evictForLimit,
  isFinalHttpStatus,
  isRegenerableDocumentKind,
  lastSyncLine,
  newClientId,
  orderQueue,
  pendingSummary,
  photoQueueBlock,
  plural,
  roomsToPrecache,
  syncBanner,
  syncLabel,
  syncState,
} from './offlineQueue';
import { isClientId } from '../../../../packages/shared/roomNotes.js';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-11-09T12:00:00Z');

test('клиентский идентификатор проходит проверку сервера', () => {
  const a = newClientId('ph');
  const b = newClientId('nt');
  assert.ok(isClientId(a), a);
  assert.ok(isClientId(b), b);
  assert.notEqual(a, newClientId('ph'));
});

test('порядок отправки: заметки раньше фото, внутри — по времени', () => {
  const rows = orderQueue([
    { kind: 'photo' as const, createdAt: '2026-11-09T10:00:00Z', id: 'p1' },
    { kind: 'note' as const, createdAt: '2026-11-09T11:00:00Z', id: 'n2' },
    { kind: 'photo' as const, createdAt: '2026-11-09T09:00:00Z', id: 'p0' },
    { kind: 'note' as const, createdAt: '2026-11-09T08:00:00Z', id: 'n1' },
  ]);
  assert.deepEqual(rows.map((row) => row.id), ['n1', 'n2', 'p0', 'p1']);
});

test('повторы: 5 с, 30 с, 2 мин, 10 мин, после пятой неудачи — «ошибка»', () => {
  let item = { attempts: 0, nextAt: 0, failed: false as boolean | undefined, lastError: '' as string | undefined };
  const delays: number[] = [];
  for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
    item = afterFailure(item, NOW, 'Нет связи');
    delays.push(item.nextAt - NOW);
  }
  assert.deepEqual(delays, [5_000, 30_000, 120_000, 600_000, 600_000]);
  assert.equal(item.failed, true);
  assert.equal(item.lastError, 'Нет связи');
  const rows = [
    { kind: 'photo' as const, createdAt: 'a', nextAt: NOW + 1000, failed: false },
    { kind: 'note' as const, createdAt: 'b', nextAt: NOW - 1, failed: false },
    { kind: 'note' as const, createdAt: 'c', nextAt: 0, failed: true },
  ];
  assert.equal(dueItems(rows, NOW).length, 1, 'пауза и «ошибка» ждут');
  assert.equal(dueItems(rows, NOW, true).length, 3, '«Отправить сейчас» шлёт всё');
});

test('предел очереди: 300 фото и свободное место', () => {
  assert.equal(photoQueueBlock({ queuedPhotos: 0, adding: 5, freeBytes: null }), null);
  assert.equal(photoQueueBlock({ queuedPhotos: 295, adding: 5, freeBytes: 10e9 }), null);
  assert.match(photoQueueBlock({ queuedPhotos: 296, adding: 5, freeBytes: null })!, /можно добавить ещё 4/);
  assert.match(photoQueueBlock({ queuedPhotos: QUEUE_PHOTO_LIMIT, adding: 1, freeBytes: null })!, /300 фото .* это предел/);
  assert.match(photoQueueBlock({ queuedPhotos: 0, adding: 1, freeBytes: 10 * 1024 * 1024 })!, /меньше 50 МБ/);
});

test('склонения', () => {
  assert.equal(plural(1, 'объект', 'объекта', 'объектов'), 'объект');
  assert.equal(plural(3, 'объект', 'объекта', 'объектов'), 'объекта');
  assert.equal(plural(11, 'объект', 'объекта', 'объектов'), 'объектов');
  assert.equal(plural(22, 'объект', 'объекта', 'объектов'), 'объекта');
  assert.equal(pendingSummary({ rooms: 1, projects: 0, notes: 2, photos: 3, documents: 0 }), '3 фото, 1 комната, 2 заметки');
});

test('индикатор: «Нет связи», «Ждёт отправки», «Всё отправлено»', () => {
  assert.equal(syncLabel(syncState(false, 0), 0), 'Нет связи');
  assert.equal(syncLabel(syncState(false, 2), 2), 'Нет связи · ждёт отправки: 2');
  assert.equal(syncLabel(syncState(true, 3), 3), 'Ждёт отправки: 3');
  assert.equal(syncLabel(syncState(true, 0), 0), 'Всё отправлено');
});

test('полоса: 2 и больше объектов или больше суток без связи', () => {
  const fresh = new Date(NOW - HOUR).toISOString();
  const old = new Date(NOW - 25 * HOUR).toISOString();
  assert.equal(syncBanner({ pending: 0, lastSyncAt: fresh, now: NOW, online: false }), null);
  assert.equal(syncBanner({ pending: 1, lastSyncAt: fresh, now: NOW, online: false }), null, 'один объект — без полосы');
  assert.equal(
    syncBanner({ pending: 2, lastSyncAt: fresh, now: NOW, online: false })!.text,
    'Подключитесь к интернету, чтобы отправить данные: ждут отправки 2 объекта.',
  );
  assert.equal(
    syncBanner({ pending: 5, lastSyncAt: null, now: NOW, online: false })!.text,
    'Подключитесь к интернету, чтобы отправить данные: ждут отправки 5 объектов.',
  );
  assert.match(syncBanner({ pending: 1, lastSyncAt: old, now: NOW, online: false })!.text, /ждут отправки 1 объект\./);
  assert.match(syncBanner({ pending: 0, lastSyncAt: old, now: NOW, online: false })!.text, /больше суток/);
  assert.match(syncBanner({ pending: 3, lastSyncAt: fresh, now: NOW, online: true })!.text, /Повторим сами/);
  assert.equal(syncBanner({ pending: 0, lastSyncAt: null, now: NOW, online: false }), null, 'ещё не связывались — молчим');
});

test('строка «данные с сервера»', () => {
  assert.match(lastSyncLine(new Date(NOW - HOUR).toISOString(), NOW), /^Данные с сервера: сегодня в \d\d:\d\d$/);
  assert.match(lastSyncLine('2026-11-01T08:40:00Z', NOW), /^Данные с сервера: 1 ноября в /);
  assert.equal(lastSyncLine(null, NOW), 'С сервером ещё не связывались');
});

test('предзагрузка: назначенные и не закрытые комнаты', () => {
  const rooms = [
    { id: 'a', assignedTo: 'u1', status: 'draft' },
    { id: 'b', assignedTo: 'u2', status: 'draft' },
    { id: 'c', assignedTo: 'u1', status: 'closed' },
  ];
  assert.deepEqual(roomsToPrecache(rooms, { id: 'u1', role: 'owner' }).map((r) => r.id), ['a']);
  assert.deepEqual(roomsToPrecache(rooms, { id: 'u1', role: 'measurer' }).map((r) => r.id), ['a', 'b']);
});

test('кэш документов: при превышении 50 МБ уходят самые старые', () => {
  const MB = 1024 * 1024;
  const drop = evictForLimit([
    { key: 'new', bytes: 30 * MB, at: 3 },
    { key: 'old', bytes: 20 * MB, at: 1 },
    { key: 'mid', bytes: 10 * MB, at: 2 },
  ]);
  assert.deepEqual(drop, ['old']);
  assert.deepEqual(evictForLimit([{ key: 'x', bytes: MB, at: 1 }]), []);
});

test('окончательная ошибка HTTP: 400/403/404/413, не 401 и не 5xx', () => {
  assert.equal(isFinalHttpStatus(400), true);
  assert.equal(isFinalHttpStatus(403), true);
  assert.equal(isFinalHttpStatus(404), true);
  assert.equal(isFinalHttpStatus(413), true);
  assert.equal(isFinalHttpStatus(401), false);
  assert.equal(isFinalHttpStatus(0), false);
  assert.equal(isFinalHttpStatus(408), false);
  assert.equal(isFinalHttpStatus(429), false);
  assert.equal(isFinalHttpStatus(500), false);
  assert.equal(isFinalHttpStatus(503), false);
});

test('смета, профиль и КП собираются заново', () => {
  assert.equal(isRegenerableDocumentKind('estimate'), true);
  assert.equal(isRegenerableDocumentKind('profile'), true);
  assert.equal(isRegenerableDocumentKind('offer'), true);
  assert.equal(isRegenerableDocumentKind('spec'), false);
});

test('подпись устройства: телефон или компьютер', () => {
  assert.equal(devicePlace('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'На телефоне');
  assert.equal(devicePlace('Mozilla/5.0 (Linux; Android 14)'), 'На телефоне');
  assert.equal(devicePlace('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'На этом компьютере');
  assert.equal(devicePlace('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'), 'На этом компьютере');
});

test('полоса: окончательные ошибки без «повторим сами»', () => {
  const fresh = new Date(NOW - HOUR).toISOString();
  assert.match(
    syncBanner({ pending: 5, failed: 5, lastSyncAt: fresh, now: NOW, online: true })!.text,
    /Не удалось отправить 5 файлов/,
  );
  assert.match(
    syncBanner({ pending: 5, failed: 2, lastSyncAt: fresh, now: NOW, online: true })!.text,
    /из них 2 с ошибкой/,
  );
  assert.equal(syncBanner({ pending: 1, failed: 0, lastSyncAt: fresh, now: NOW, online: true }), null);
});
