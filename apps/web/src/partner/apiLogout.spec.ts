import { afterEach, expect, test, vi } from 'vitest';
import { apiLogout } from './apiClient';
import { loadToken, saveToken } from './localStore';

let current: string | null = 'old-token';
vi.mock('./localStore', () => ({
  loadToken: vi.fn(() => current),
  saveToken: vi.fn((t: string | null) => {
    current = t;
  }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  current = 'old-token';
});

test('выход стирает токен сразу, а запрос уходит со старым токеном', async () => {
  vi.stubEnv('VITE_API_URL', 'https://api.example.test');
  const fetchSpy = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetchSpy);
  await apiLogout();
  expect(saveToken).toHaveBeenCalledWith(null);
  expect(loadToken()).toBeNull();
  const headers = new Headers((fetchSpy.mock.calls[0]![1] as RequestInit).headers);
  expect(headers.get('authorization')).toBe('Bearer old-token');
});

test('поздний ответ выхода не стирает токен нового входа', async () => {
  vi.stubEnv('VITE_API_URL', 'https://api.example.test');
  let finish: (r: Response) => void = () => undefined;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))));
  const pending = apiLogout();
  current = 'new-token'; // человек успел войти заново
  finish(new Response('{}', { status: 401 }));
  await pending;
  expect(current).toBe('new-token');
});
