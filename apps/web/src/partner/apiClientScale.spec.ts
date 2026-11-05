import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  ApiError,
  REQUEST_TIMEOUT_MS,
  apiListObjectsChecked,
  apiListProjectsChecked,
  request,
  resetListCacheForTests,
  retryDelayMs,
} from './apiClient';
import { POLL_BASE_MS, pollDelayMs } from './polling';

vi.mock('./localStore', () => ({ loadToken: () => 'user-token', saveToken: vi.fn() }));

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(status === 304 ? null : JSON.stringify(body), { status, headers });
}

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.example.test');
  vi.useFakeTimers();
  resetListCacheForTests();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('ожидание ответа 30 секунд', async () => {
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, {})));
  await request('/auth/me');
  expect(REQUEST_TIMEOUT_MS).toBe(30_000);
  expect(timeout).toHaveBeenCalledWith(30_000);
});

test('чтение повторяется после сбоя сервера и успешно завершается', async () => {
  const fetchSpy = vi
    .fn()
    .mockResolvedValueOnce(reply(503, { message: 'занят' }))
    .mockRejectedValueOnce(new TypeError('network'))
    .mockResolvedValueOnce(reply(200, { ok: 1 }));
  vi.stubGlobal('fetch', fetchSpy);
  const pending = request<{ ok: number }>('/objects');
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await pending).toEqual({ ok: 1 });
  expect(fetchSpy).toHaveBeenCalledTimes(3);
});

test('после трёх неудач чтение отдаёт ошибку', async () => {
  const fetchSpy = vi.fn().mockResolvedValue(reply(502, { message: 'шлюз' }));
  vi.stubGlobal('fetch', fetchSpy);
  const pending = request('/objects').catch((error) => error);
  await vi.advanceTimersByTimeAsync(20_000);
  const error = await pending;
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(502);
  expect(fetchSpy).toHaveBeenCalledTimes(3);
});

test('запись и вход не повторяются: повтор мог бы задвоить действие', async () => {
  const fetchSpy = vi.fn().mockResolvedValue(reply(503, { message: 'занят' }));
  vi.stubGlobal('fetch', fetchSpy);
  await expect(request('/objects', { method: 'POST', body: '{}' })).rejects.toBeInstanceOf(ApiError);
  await expect(request('/auth/login', { method: 'POST', body: '{}', token: null })).rejects.toBeInstanceOf(ApiError);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test('ответ «нет доступа» не повторяется', async () => {
  const fetchSpy = vi.fn().mockResolvedValue(reply(401, { message: 'Нужен вход' }));
  vi.stubGlobal('fetch', fetchSpy);
  await expect(request('/objects')).rejects.toMatchObject({ status: 401 });
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test('пауза растёт вдвое и уважает Retry-After', () => {
  const mid = () => 0.5;
  expect(retryDelayMs(0, null, mid)).toBe(600);
  expect(retryDelayMs(1, null, mid)).toBe(1200);
  expect(retryDelayMs(2, null, mid)).toBe(2400);
  expect(retryDelayMs(0, '3', mid)).toBe(3000);
  expect(retryDelayMs(0, '999', mid)).toBe(10_000);
});

test('опрос списков идёт с разбросом около 45 секунд', () => {
  expect(pollDelayMs(() => 0)).toBe(Math.round(POLL_BASE_MS * 0.8));
  expect(pollDelayMs(() => 1)).toBe(Math.round(POLL_BASE_MS * 1.2));
});

test('постраничный список собирается целиком и без повторов', async () => {
  const fetchSpy = vi.fn(async (url: string) => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    const all = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const page = all.slice(offset, offset + 2);
    return reply(200, { objects: page, total: 3, nextOffset: offset + 2 < 3 ? offset + 2 : null }, { ETag: 'W/"v1"' });
  });
  vi.stubGlobal('fetch', fetchSpy);
  const result = await apiListObjectsChecked();
  expect(result.objects.map((o) => o.id)).toEqual(['a', 'b', 'c']);
  expect(result.notModified).toBe(false);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test('если версия не изменилась, остальные страницы не запрашиваются', async () => {
  let calls = 0;
  const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
    calls += 1;
    const headers = new Headers(init.headers);
    if (headers.get('if-none-match') === 'W/"v1"') return reply(304, null, { ETag: 'W/"v1"' });
    return reply(200, { objects: [{ id: 'a' }], total: 1, nextOffset: null }, { ETag: 'W/"v1"' });
  });
  vi.stubGlobal('fetch', fetchSpy);
  const first = await apiListObjectsChecked();
  const second = await apiListObjectsChecked();
  expect(first.notModified).toBe(false);
  expect(second.notModified).toBe(true);
  expect(second.objects).toBe(first.objects);
  expect(calls).toBe(2);
});

test('старый сервер без страниц отвечает целым списком, и это работает', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, { projects: [{ id: 'p1' }, { id: 'p2' }] })));
  const result = await apiListProjectsChecked();
  expect(result.projects).toHaveLength(2);
});

test('список менялся во время загрузки: версия не запоминается', async () => {
  let n = 0;
  const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    const headers = new Headers(init.headers);
    expect(headers.get('if-none-match')).toBeNull();
    n += 1;
    const page = offset === 0 ? [{ id: 'a' }] : [{ id: 'b' }];
    return reply(200, { objects: page, nextOffset: offset === 0 ? 1 : null }, { ETag: `W/"v${n}"` });
  });
  vi.stubGlobal('fetch', fetchSpy);
  await apiListObjectsChecked();
  await apiListObjectsChecked();
  // Условный запрос не отправлялся ни разу: проверка в самом моке.
  expect(fetchSpy).toHaveBeenCalledTimes(4);
});
