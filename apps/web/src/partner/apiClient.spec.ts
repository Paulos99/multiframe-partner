import { afterEach, expect, test, vi } from 'vitest';
import { apiMe } from './apiClient';
import { saveToken } from './localStore';

vi.mock('./localStore', () => ({ loadToken: () => 'previous-token', saveToken: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

test('apiMe saves a rotated token and returns the user', async () => {
  vi.stubEnv('VITE_API_URL', 'https://api.example.test');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: 'u1' }, token: 'renewed-token' }))));
  expect(await apiMe()).toEqual({ id: 'u1' });
  expect(saveToken).toHaveBeenCalledWith('renewed-token');
});

test('apiMe preserves token when no renewal is returned', async () => {
  vi.stubEnv('VITE_API_URL', 'https://api.example.test');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: 'u1' } }))));
  await apiMe();
  expect(saveToken).not.toHaveBeenCalled();
});
