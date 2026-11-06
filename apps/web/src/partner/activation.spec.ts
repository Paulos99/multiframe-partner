import { afterEach, expect, test, vi } from 'vitest';
import {
  activationTokenFromSearch,
  activationUrl,
  apiActivate,
  apiIssueActivation,
  passwordProblem,
  removeActivationFromUrl,
} from './activation';
import { PASSWORD_MIN } from '../../../../packages/shared/passwordPolicy.js';

vi.mock('./localStore', () => ({ loadToken: () => 'owner-session', saveToken: vi.fn() }));
vi.mock('./localActivation', () => ({
  issueLocalActivation: () => { throw new Error('local issue should not run'); },
  activateLocal: () => { throw new Error('local activate should not run'); },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const token = 'ab'.repeat(32);

test('адрес собирается от текущей страницы и сохраняет путь /cabinet/', () => {
  expect(activationUrl(`?activate=${token}`, { origin: 'https://stp-multiframe.ru', pathname: '/cabinet/' })).toBe(
    `https://stp-multiframe.ru/cabinet/?activate=${token}`,
  );
  expect(activationUrl(`?activate=${token}`, { origin: 'https://paulos99.github.io', pathname: '/multiframe-partner/' })).toBe(
    `https://paulos99.github.io/multiframe-partner/?activate=${token}`,
  );
});

test('токен читается из адреса', () => {
  expect(activationTokenFromSearch(`?activate=${token}`)).toBe(token);
  vi.stubEnv('VITE_API_URL', 'https://api.example.test');
  expect(activationTokenFromSearch(`?activate=${token}`)).toBe(token);
  expect(activationTokenFromSearch('?demo=1')).toBeNull();
  expect(activationTokenFromSearch('?activate=')).toBeNull();
});

test('после успеха токен убирается из адреса, остальное остаётся', () => {
  const replaceState = vi.fn();
  vi.stubGlobal('window', {
    location: { href: `https://stp-multiframe.ru/cabinet/?activate=${token}&x=1#/company` },
    history: { state: null, replaceState },
  });
  removeActivationFromUrl();
  expect(replaceState).toHaveBeenCalledWith(null, '', '/cabinet/?x=1#/company');
  const calls = replaceState.mock.calls.length;
  vi.stubGlobal('window', {
    location: { href: 'https://stp-multiframe.ru/cabinet/' },
    history: { state: null, replaceState },
  });
  removeActivationFromUrl();
  expect(replaceState.mock.calls.length).toBe(calls);
});

test('правила пароля те же, что на сервере', () => {
  expect(passwordProblem('x'.repeat(PASSWORD_MIN - 1))).toMatch(String(PASSWORD_MIN));
  expect(passwordProblem('x'.repeat(PASSWORD_MIN))).toBe('');
  expect(passwordProblem(' ' + 'x'.repeat(PASSWORD_MIN))).not.toBe('');
});

test('выдача идёт с сеансом владельца, активация — без сеанса', async () => {
  vi.stubEnv('VITE_API_URL', 'https://api.example.test');
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ path: `?activate=${token}`, expiresAt: 'x' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal('fetch', fetchMock);
  expect((await apiIssueActivation('u_1')).path).toBe(`?activate=${token}`);
  await apiActivate(token, 'good-password-1');
  const [issueUrl, issueInit] = fetchMock.mock.calls[0]!;
  expect(issueUrl).toBe('https://api.example.test/auth/invite');
  expect(issueInit.headers.Authorization).toBe('Bearer owner-session');
  const [activateUrl, activateInit] = fetchMock.mock.calls[1]!;
  expect(activateUrl).toBe('https://api.example.test/auth/activate');
  expect(activateInit.headers.Authorization).toBeUndefined();
  expect(JSON.parse(activateInit.body)).toEqual({ token, password: 'good-password-1' });
});
